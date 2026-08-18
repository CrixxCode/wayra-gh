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

    ALLOWED_API_PATH_PREFIXES = (
        "/api/auth/csrf/",
        "/api/auth/login/",
        "/api/auth/logout/",
        "/api/auth/me/",
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
