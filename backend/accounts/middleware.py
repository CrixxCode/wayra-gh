from django.http import JsonResponse


def _normalize_api_path(path: str) -> str:
    normalized = (path or "").strip()
    if not normalized:
        return "/"
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if not normalized.endswith("/"):
        normalized = f"{normalized}/"
    return normalized


class ForcePasswordChangeMiddleware:
    """
    Block authenticated API requests while user.must_change_password is true.
    Only authentication/profile endpoints needed to complete the password change
    flow are kept available.
    """

    ALLOWED_API_PATH_PREFIXES = (
        "/api/auth/csrf/",
        "/api/auth/login/",
        "/api/auth/me/",
        "/api/auth/hotel-setup/",
        "/api/auth/me/update/",
        "/api/auth/logout/",
        "/api/auth/password/change/",
        "/api/auth/password/reset/",
        "/api/auth/password/reset/confirm/",
        "/api/schema/",
        "/api/docs/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._should_block(request):
            return JsonResponse(
                {
                    "detail": "Debes cambiar tu contraseña antes de continuar.",
                    "code": "password_change_required",
                },
                status=403,
            )
        return self.get_response(request)

    def _should_block(self, request) -> bool:
        if request.method == "OPTIONS":
            return False

        path = _normalize_api_path(request.path)
        if not path.startswith("/api/"):
            return False

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False

        if not bool(getattr(user, "must_change_password", False)):
            return False

        return not any(path.startswith(prefix) for prefix in self.ALLOWED_API_PATH_PREFIXES)


class HotelActiveMiddleware:
    """
    Block authenticated API requests from users whose hotel (`hotel_settings`) has
    been deactivated (`HotelSettings.is_active=False`).

    A hotel can be deactivated by the platform while its users still hold a valid
    session (login already happened), so blocking only at login time (see
    `SessionLoginView`) is not enough — this middleware re-checks on every request.
    Global platform admins (`hotel_settings is None`, see `accounts.tenancy`) are
    exempt because they don't belong to any single hotel.
    """

    # Cambiar la propia contraseña no opera sobre datos del hotel, y bloquearlo dejaba sin
    # salida a quien tenia `must_change_password`: `ForcePasswordChangeMiddleware` solo le
    # permite esa ruta y este middleware se la negaba.
    ALLOWED_API_PATH_PREFIXES = (
        "/api/auth/csrf/",
        "/api/auth/login/",
        "/api/auth/logout/",
        "/api/auth/me/",
        "/api/auth/password/change/",
        "/api/auth/password/reset/",
        "/api/schema/",
        "/api/docs/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._should_block(request):
            return JsonResponse(
                {
                    "detail": "El hotel asociado a tu cuenta está desactivado. Contacta al administrador de la plataforma.",
                    "code": "hotel_inactive",
                },
                status=403,
            )
        return self.get_response(request)

    def _should_block(self, request) -> bool:
        if request.method == "OPTIONS":
            return False

        path = _normalize_api_path(request.path)
        if not path.startswith("/api/"):
            return False

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False

        hotel = getattr(user, "hotel_settings", None)
        if hotel is None or hotel.is_active:
            return False

        return not any(path.startswith(prefix) for prefix in self.ALLOWED_API_PATH_PREFIXES)


class HotelSetupRequiredMiddleware:
    """Bloquea las operaciones de hotel hasta guardar la configuracion obligatoria."""

    # La configuracion exige al menos una habitacion real con tipo y tarifa
    # (`has_operable_room_structure`), y esas solo se crean desde `/habitaciones`: sus
    # catalogos tienen que seguir abiertos o el hotel nuevo nunca puede terminar el setup.
    SETUP_PATHS = (
        "/api/auth/",
        "/api/hotel-settings/",
        "/api/hotel-floors/",
        "/api/payment-methods/",
        "/api/reservation-policies/",
        "/api/financial-control-configs/",
        "/api/rooms/",
        "/api/room-types/",
        "/api/rates/",
    )
    # Catalogos globales que la vista de habitaciones solo lee.
    SETUP_READ_PATHS = (
        "/api/master-data/",
        "/api/amenities/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = _normalize_api_path(request.path)
        user = getattr(request, "user", None)
        if (
            request.method == "OPTIONS"
            or not path.startswith("/api/")
            or not user
            or not user.is_authenticated
            or any(path.startswith(prefix) for prefix in self.SETUP_PATHS)
            or (
                request.method in ("GET", "HEAD")
                and any(path.startswith(prefix) for prefix in self.SETUP_READ_PATHS)
            )
        ):
            return self.get_response(request)

        from apps.hotel_settings.setup import hotel_setup_status, missing_hotel_setup_fields

        if missing_hotel_setup_fields(user):
            return JsonResponse(
                {
                    "detail": "Completa la información obligatoria del hotel para realizar operaciones.",
                    "code": "hotel_setup_required",
                    **hotel_setup_status(user),
                },
                status=403,
            )
        return self.get_response(request)
