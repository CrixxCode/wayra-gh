# accounts/views.py

from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.conf import settings
from django.core.cache import cache
from rest_framework.pagination import PageNumberPagination
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
import logging
logger = logging.getLogger(__name__)
from django.utils.decorators import method_decorator
from django.utils import timezone

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as drf_serializers, viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from accounts.pagination import OptionalPageNumberPagination
from apps.hotel_settings.models import HotelSettings
from accounts.permissions import HasResourcePermission
from accounts.audit import AuditLog
from accounts.soft_delete import LogicalDeleteViewSetMixin, exclude_soft_deleted, is_soft_deleted
from accounts.tenancy import is_effective_global_admin, scope_queryset_to_hotel
from accounts.role_assignment import assignable_roles_for_actor

from .models import JobTitle, Role, Resource, UserRole, RoleResource, NotificationReadState
from .serializers import (
    JobTitleSerializer, RegisterSerializer, UserSerializer, UserUpdateSerializer, RoleSerializer, ResourceSerializer,
    UserMiniSerializer, PasswordChangeSerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    NotificationKeysSerializer, ProfileUpdateSerializer, UserDirectEmailSerializer
)
from django.db import connection, models

User = get_user_model()


def _require_public_registration_token(request, *, setting_name: str) -> None:
    expected_token = str(getattr(settings, setting_name, "") or "").strip()
    if not expected_token:
        raise PermissionDenied("Public registration is not securely configured.")

    provided_token = str(
        request.headers.get("X-Public-Registration-Token", "")
        or request.data.get("registration_token", "")
    ).strip()
    if provided_token != expected_token:
        raise PermissionDenied("Invalid public registration token.")


class EmptySerializer(drf_serializers.Serializer):
    pass


class UserRoleAssignmentSerializer(drf_serializers.Serializer):
    role_ids = drf_serializers.ListField(
        child=drf_serializers.UUIDField(),
        required=True,
        allow_empty=True,
    )


class HotelSetupStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        from apps.hotel_settings.setup import hotel_setup_status

        response = Response(hotel_setup_status(request.user))
        response["Cache-Control"] = "no-store"
        return response


class SessionLoginRequestSerializer(drf_serializers.Serializer):
    username = drf_serializers.CharField()
    password = drf_serializers.CharField()
    remember_me = drf_serializers.BooleanField(required=False, default=False)


# -----------------------------
# Salud / CSRF
# -----------------------------

class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: OpenApiTypes.OBJECT, 503: OpenApiTypes.OBJECT})
    def get(self, request):
        # Railway usa esta ruta como healthcheck (`railway.json`). Sin tocar la base de datos,
        # un proceso vivo con la BD caida se daba por sano (auditoria, Bloque 15 #8).
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            logger.exception("Healthcheck: la base de datos no responde.")
            return Response(
                {"status": "error", "database": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"}, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfInitView(APIView):
    """
    GET -> setea cookie 'csrftoken' para que el front pueda enviar X-CSRFToken.
    Útil cuando el frontend es SPA en otro origen.
    """
    permission_classes = [AllowAny]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response({"detail": "CSRF cookie set"}, status=status.HTTP_200_OK)


# -----------------------------
# Sesión por cookies (login/logout/me)
# -----------------------------

class SessionLoginView(APIView):
    """
    POST {username, password, remember_me?}
    Crea sesión (cookie 'sessionid'). Requiere X-CSRFToken.
    - remember_me=true => sesión ~14 días
    - remember_me=false => expira al cerrar el navegador
    """
    permission_classes = [AllowAny]
    throttle_scope = "auth_login"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(
        request=SessionLoginRequestSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        remember = bool(request.data.get("remember_me"))

        if not username or not password:
            return Response({"detail": "Faltan credenciales."}, status=status.HTTP_400_BAD_REQUEST)

        # Ademas del throttle por IP: muchos fallos contra la misma cuenta la frenan un rato,
        # aunque vengan de IPs distintas (credential stuffing; auditoria, Bloque 15 #7). La
        # llave es el nombre escrito, exista o no la cuenta, para no revelar cuales existen.
        failures_key = f"login-failures:{username.lower()}"
        failure_limit = int(getattr(settings, "LOGIN_FAILURES_PER_ACCOUNT", 10) or 10)
        if int(cache.get(failures_key, 0)) >= failure_limit:
            return Response(
                {
                    "detail": "Demasiados intentos fallidos para esta cuenta. Espera unos minutos.",
                    "code": "account_throttled",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = authenticate(request, username=username, password=password)
        # Un usuario eliminado (borrado logico, 5.5) responde igual que unas credenciales
        # malas: ni entra ni revela que la cuenta existio.
        if not user or is_soft_deleted(user):
            lock_seconds = int(getattr(settings, "LOGIN_ACCOUNT_LOCK_SECONDS", 900) or 900)
            if cache.add(failures_key, 1, timeout=lock_seconds) is False:
                try:
                    cache.incr(failures_key)
                except ValueError:
                    cache.set(failures_key, 1, timeout=lock_seconds)
            return Response({"detail": "Credenciales inválidas."}, status=status.HTTP_401_UNAUTHORIZED)
        cache.delete(failures_key)
        # No hay rama para `is_active=False`: `ModelBackend.authenticate()` ya rechaza a esos
        # usuarios, que caen arriba como credenciales invalidas (Bloque 15 #3).
        hotel = getattr(user, "hotel_settings", None)
        if hotel is not None and not hotel.is_active:
            return Response(
                {
                    "detail": "El hotel asociado a tu cuenta está desactivado. Contacta al administrador de la plataforma.",
                    "code": "hotel_inactive",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        is_first_login = user.last_login is None

        # Django rota la sesión en login (mitiga session fixation)
        login(request, user)

        # Caducidad
        request.session.set_expiry(60 * 60 * 24 * 14 if remember else 0)

        return Response({
            "detail": "Sesión iniciada",
            "remember_me": remember,
            "is_first_login": is_first_login,
            "must_change_password": bool(user.must_change_password),
            "user": UserSerializer(user).data
        }, status=status.HTTP_200_OK)


class SessionLogoutView(APIView):
    """
    POST sin cuerpo -> cierra sesión (elimina cookie 'sessionid').
    Requiere X-CSRFToken porque modifica estado.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = EmptySerializer

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        logout(request)
        return Response({"detail": "Sesión cerrada"}, status=status.HTTP_200_OK)


class MeSessionView(APIView):
    """
    GET -> devuelve el usuario autenticado por sesión.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(
            UserSerializer(request.user, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class PasswordChangeView(APIView):
    """
    POST {old_password, new_password}
    Cambia la contraseña del usuario autenticado (por sesión).
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=PasswordChangeSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        ser = PasswordChangeSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        updated_user = ser.save()
        update_session_auth_hash(request, updated_user)
        return Response({"detail": "Contraseña cambiada"}, status=status.HTTP_200_OK)


# -----------------------------
# Recuperación de contraseña
# -----------------------------

class PasswordResetRequestView(APIView):
    """
    POST {email[, base_url]}
    Envía enlace de recuperación. Devuelve sent=True/False.
    (Throttle específico para evitar abuso.)
    """
    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        ser = PasswordResetRequestSerializer(
            data=request.data,
            context={"request": request, "base_url": request.data.get("base_url")}
        )
        ser.is_valid(raise_exception=True)
        result = ser.save()
        return Response(
            {
                "detail": (
                    "Si existe una cuenta asociada al correo, se enviara el enlace de recuperacion."
                ),
                "sent": bool((result or {}).get("sent", True)),
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    POST {uid, token, new_password}
    Confirma el restablecimiento y establece la nueva contraseña.
    """
    permission_classes = [AllowAny]
    # Mismo limite que pedir el reset (5.11): es el paso que recibe uid+token y antes quedaba
    # con el anonimo global de 30/min (auditoria, Bloque 15 #5).
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        ser = PasswordResetConfirmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response({"detail": "Contraseña restablecida correctamente."}, status=status.HTTP_200_OK)


# -----------------------------
# RBAC + CRUD: Users / Roles / Resources
# -----------------------------

class UserViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    serializer_class = UserSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["users.read"]
    serializer_action_classes = {
        "create": RegisterSerializer,
        "register": RegisterSerializer,
        "update": UserUpdateSerializer,
        "partial_update": UserUpdateSerializer,
    }
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["roles__slug", "is_active", "is_staff"]
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["date_joined", "username", "email", "first_name", "last_name"]
    ordering = ["-date_joined"]

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.all().select_related("hotel_settings")

        if not user.is_authenticated:
            return User.objects.none()

        # Esta vista no pasa por `LogicalDeleteViewSetMixin.get_queryset()`, asi que el borrado
        # logico se aplica aqui. Solo ese: un usuario inactivo se sigue listando, porque su
        # estado se administra desde la misma pantalla.
        if not self._should_include_deleted():
            qs = exclude_soft_deleted(qs)

        if is_effective_global_admin(user):
            scope = (self.request.query_params.get("scope") or "").strip().lower()
            if scope in {"global", "platform"}:
                return qs

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="hotel_settings",
        )

    def get_serializer_class(self):
        return self.serializer_action_classes.get(self.action, self.serializer_class)

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["users.write"]
        return self.required_scopes

    def get_permissions(self):
        allow_public_register = getattr(settings, "ALLOW_PUBLIC_USER_REGISTRATION", False)
        # El registro publico es para quien no tiene cuenta. Un usuario con sesion pasa por
        # el RBAC normal (`users.write`): si no, cualquier cuenta sin permisos podia crear
        # usuarios en su hotel con solo tener el flag activo.
        if (
            self.action == "register"
            and allow_public_register
            and not self.request.user.is_authenticated
        ):
            return [AllowAny()]
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_data = UserSerializer(user, context=self.get_serializer_context()).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_data = UserSerializer(user, context=self.get_serializer_context()).data
        return Response(response_data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="register")
    def register(self, request):
        if not request.user.is_authenticated:
            _require_public_registration_token(
                request,
                setting_name="PUBLIC_USER_REGISTRATION_TOKEN",
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        data = UserSerializer(user, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"], url_path="roles")
    def roles(self, request, pk=None):
        target_user = self.get_object()
        available_roles = assignable_roles_for_actor(
            request.user,
            target_user=target_user,
        ).order_by("name")

        if request.method == "GET":
            active_role_ids = list(
                UserRole.objects.filter(
                    user=target_user,
                    role__in=available_roles,
                    is_active=True,
                ).values_list("role_id", flat=True)
            )
            return Response(
                {
                    "roles": RoleSerializer(available_roles, many=True).data,
                    "active_role_ids": [str(role_id) for role_id in active_role_ids],
                },
                status=status.HTTP_200_OK,
            )

        serializer = UserRoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        requested_ids = {str(role_id) for role_id in serializer.validated_data["role_ids"]}
        selected_roles = list(available_roles.filter(id__in=requested_ids))
        selected_ids = {str(role.id) for role in selected_roles}
        rejected_ids = sorted(requested_ids - selected_ids)
        if rejected_ids:
            return Response(
                {
                    "detail": "No puedes asignar uno o mas roles desde esta vista.",
                    "rejected_role_ids": rejected_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_links = {
            str(link.role_id): link
            for link in UserRole.objects.filter(user=target_user, role__in=available_roles)
        }

        for role in available_roles:
            role_id = str(role.id)
            should_be_active = role_id in selected_ids
            link = existing_links.get(role_id)

            if link is None and should_be_active:
                UserRole.objects.create(user=target_user, role=role, is_active=True)
                continue

            if link is not None and link.is_active != should_be_active:
                link.is_active = should_be_active
                link.save(update_fields=["is_active"])

        target_user.refresh_from_db()
        return Response(
            UserSerializer(target_user, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=UserDirectEmailSerializer,
        responses={200: OpenApiTypes.OBJECT, 503: OpenApiTypes.OBJECT},
    )
    @action(detail=True, methods=["post"], url_path="send-email")
    def send_email(self, request, pk=None):
        if not is_effective_global_admin(request.user):
            raise PermissionDenied("Solo el administrador de plataforma puede enviar correos directos.")

        target_user = get_object_or_404(User.objects.select_related("hotel_settings"), pk=pk)
        serializer = UserDirectEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save(target_user=target_user, actor=request.user)

        if not result.get("sent"):
            return Response(
                {
                    "detail": "No se pudo enviar el correo. Revisa la configuracion de correo saliente.",
                    "sent": False,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"detail": "Correo enviado correctamente.", "sent": True},
            status=status.HTTP_200_OK,
        )


class RoleViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    serializer_class = RoleSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["roles.read"]

    def get_queryset(self):
        queryset = Role.objects.all()
        if getattr(self, "action", "") in {"list", "job_titles", "job_title_detail"}:
            force_hotel_context = (
                (self.request.query_params.get("assign_context") or "").strip().lower()
                == "hotel"
            )
            queryset = assignable_roles_for_actor(
                self.request.user,
                force_hotel_context=force_hotel_context,
            )
        # Como en usuarios: esta vista no pasa por `LogicalDeleteViewSetMixin.get_queryset()`,
        # y un rol eliminado se seguia listando y asignando.
        if not self._should_include_deleted():
            queryset = exclude_soft_deleted(queryset)
        return queryset.order_by("name")

    def get_required_scopes(self):
        # CRUD y acciones de asignacion (todas POST) requieren roles.write. La rama que listaba
        # acciones a mano era inalcanzable y ademas olvidaba `remove_resources` (Bloque 1 #14).
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["roles.write"]
        return self.required_scopes

    def get_permissions(self):
        if getattr(self, "action", "") == "public_job_titles":
            return [AllowAny()]
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def _role_user_scope_queryset(self):
        user = self.request.user
        queryset = User.objects.filter(is_active=True)

        if not user or not user.is_authenticated:
            return queryset.none()

        if is_effective_global_admin(user):
            return queryset

        return scope_queryset_to_hotel(
            queryset,
            request=self.request,
            tenant_filter="hotel_settings",
        )

    def _resolve_role_user_ids(self, ids):
        scoped_users = self._role_user_scope_queryset().filter(id__in=ids)
        resolved_ids = {str(user_id) for user_id in scoped_users.values_list("id", flat=True)}
        requested_ids = {str(user_id) for user_id in ids}
        rejected_ids = sorted(requested_ids - resolved_ids)
        return scoped_users, rejected_ids

    # -------------------------
    # Usuarios por rol
    # -------------------------

    @action(detail=False, methods=["get"], url_path="public-job-titles")
    def public_job_titles(self, request):
        """
        GET /api/roles/public-job-titles/
        Devuelve cargos activos de administrador para formularios publicos.
        """
        seen_names = set()
        job_titles = []

        for job_title in JobTitle.objects.filter(
            is_active=True,
            role__slug="admin",
            role__is_active=True,
        ).order_by("sort_order", "name"):
            normalized_name = str(job_title.name or "").strip().lower()
            if not normalized_name or normalized_name in seen_names:
                continue

            seen_names.add(normalized_name)
            job_titles.append(job_title)

        return Response(JobTitleSerializer(job_titles, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="job-titles")
    def job_titles(self, request, pk=None):
        """
        GET /api/roles/<id>/job-titles/ — cargos activos del rol (`?include_inactive=true`
        para todos). POST — crea un cargo. El cargo es obligatorio al crear un usuario, y antes
        no habia forma de darlo de alta: un rol nuevo bloqueaba el alta de usuarios (auditoria,
        Bloque 1 #6).
        """
        role = self.get_object()
        if request.method == "POST":
            serializer = JobTitleSerializer(data=request.data, context={"role": role})
            serializer.is_valid(raise_exception=True)
            job_title = serializer.save(role=role)
            return Response(JobTitleSerializer(job_title).data, status=status.HTTP_201_CREATED)

        qs = role.job_titles.order_by("sort_order", "name")
        if str(request.query_params.get("include_inactive") or "").lower() not in {"1", "true"}:
            qs = qs.filter(is_active=True)
        return Response(JobTitleSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["patch"],
        url_path=r"job-titles/(?P<job_title_id>[0-9a-f-]+)",
        url_name="job-title-detail",
    )
    def job_title_detail(self, request, pk=None, job_title_id=None):
        """PATCH — renombra, reordena o desactiva un cargo. No se borra: lo nombran usuarios."""
        role = self.get_object()
        job_title = get_object_or_404(role.job_titles.all(), pk=job_title_id)
        serializer = JobTitleSerializer(
            job_title, data=request.data, partial=True, context={"role": role}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="users")
    def users(self, request, pk=None):
        """
        GET /api/roles/<id>/users/
        Devuelve los usuarios asignados a ese rol.
        """
        role = self.get_object()
        qs = (
            self._role_user_scope_queryset().filter(
                userrole__role=role,
                userrole__is_active=True,
            )
            .distinct()
            .order_by("username")
        )
        return Response(UserMiniSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="assign-users")
    def assign_users(self, request, pk=None):
        """
        POST /api/roles/<id>/assign-users/
        Body: { "user_ids": ["uuid1","uuid2", ...] }
        Asigna el rol a usuarios.
        """
        role = self.get_object()
        ids = request.data.get("user_ids", [])
        if not isinstance(ids, list):
            return Response({"detail": "user_ids debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        users, rejected_ids = self._resolve_role_user_ids(ids)
        if rejected_ids:
            return Response(
                {
                    "detail": (
                        "No puedes asignar el rol a usuarios que no pertenezcan al "
                        "hotel del usuario autenticado."
                    ),
                    "rejected_user_ids": rejected_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        for user in users:
            rel, created = UserRole.objects.get_or_create(
                user=user,
                role=role,
                defaults={"is_active": True},
            )
            if not created and not rel.is_active:
                rel.is_active = True
                rel.save(update_fields=["is_active"])

        return Response(
            {"assigned": [str(u.id) for u in users]},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=["post"], url_path="remove-users")
    def remove_users(self, request, pk=None):
        """
        POST /api/roles/<id>/remove-users/
        Body: { "user_ids": ["uuid1","uuid2", ...] }
        Remueve el rol de usuarios.
        """
        role = self.get_object()
        ids = request.data.get("user_ids", [])
        if not isinstance(ids, list):
            return Response({"detail": "user_ids debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        users, rejected_ids = self._resolve_role_user_ids(ids)
        if rejected_ids:
            return Response(
                {
                    "detail": (
                        "No puedes remover el rol de usuarios que no pertenezcan al "
                        "hotel del usuario autenticado."
                    ),
                    "rejected_user_ids": rejected_ids,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserRole.objects.filter(role=role, user__in=users, is_active=True).update(is_active=False)

        from apps.notifications.services import notify_user_role_updated

        for user in users:
            notify_user_role_updated(
                user=user,
                role_name=role.name,
                action_label="removido",
            )

        return Response(
            {"removed": [str(u.id) for u in users]},
            status=status.HTTP_200_OK
        )

    # -------------------------
    # Catálogo de usuarios (para seleccionar en UI)
    # -------------------------

    @action(detail=False, methods=["get"], url_path="users-catalog")
    def users_catalog(self, request):
        """
        GET /api/roles/users-catalog/?q=
        Devuelve usuarios para el selector de asignación.
        """
        q = (request.query_params.get("q") or "").strip()

        qs = self._role_user_scope_queryset().order_by("username")
        if q:
            qs = qs.filter(
                models.Q(username__icontains=q)
                | models.Q(email__icontains=q)
                | models.Q(first_name__icontains=q)
                | models.Q(last_name__icontains=q)
            )

        # límite simple para UI
        qs = qs[:200]
        return Response(UserMiniSerializer(qs, many=True).data, status=status.HTTP_200_OK)
    
    # -------------------------
    # Recursos
    # -------------------------
    
    @action(detail=True, methods=["get"], url_path="resources")
    def resources(self, request, pk=None):
        """
        GET /api/roles/<id>/resources/
        Devuelve los recursos asignados a este rol.
        """
        role = self.get_object()
        qs = (
            Resource.objects.filter(
                roleresource__role=role,
                roleresource__is_active=True,
                is_active=True,
            )
            .distinct()
            .order_by("order", "name", "key")
        )
        return Response(ResourceSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="assign-resources")
    def assign_resources(self, request, pk=None):
        """
        POST /api/roles/<id>/assign-resources/
        Body: { "resource_ids": ["uuid1", ...] }
        """
        role = self.get_object()
        ids = request.data.get("resource_ids", [])
        if not isinstance(ids, list):
            return Response({"detail": "resource_ids debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        resources = Resource.objects.filter(id__in=ids, is_active=True)
        for resource in resources:
            rel, created = RoleResource.objects.get_or_create(
                role=role,
                resource=resource,
                defaults={"is_active": True},
            )
            if not created and not rel.is_active:
                rel.is_active = True
                rel.save(update_fields=["is_active"])

        return Response({"assigned": [str(r.id) for r in resources]}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="remove-resources")
    def remove_resources(self, request, pk=None):
        """
        POST /api/roles/<id>/remove-resources/
        Body: { "resource_ids": ["uuid1", ...] }
        """
        role = self.get_object()
        ids = request.data.get("resource_ids", [])
        if not isinstance(ids, list):
            return Response({"detail": "resource_ids debe ser una lista."}, status=status.HTTP_400_BAD_REQUEST)

        resources = Resource.objects.filter(id__in=ids, is_active=True)
        RoleResource.objects.filter(role=role, resource__in=resources, is_active=True).update(is_active=False)

        return Response({"removed": [str(r.id) for r in resources]}, status=status.HTTP_200_OK)
    

class ResourceViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = Resource.objects.all()
    serializer_class = ResourceSerializer
    permission_classes = [HasResourcePermission]
    required_scopes = ["resources.read"]
    pagination_class = OptionalPageNumberPagination

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["resources.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def get_queryset(self):
        qs = super().get_queryset().order_by("order", "name", "key")
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                models.Q(key__icontains=q) |
                models.Q(name__icontains=q) |
                models.Q(description__icontains=q)
            )
        return qs

class ProfileUpdateView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProfileUpdateSerializer

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        """Devuelve el perfil actual"""
        return Response(UserSerializer(request.user, context={"request": request}).data)

    @extend_schema(request=ProfileUpdateSerializer, responses=UserSerializer)
    def put(self, request):
        """Actualiza el perfil"""
        serializer = ProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        return self.put(request)


class NotificationReadStateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        keys = list(
            NotificationReadState.objects.filter(user=request.user)
            .order_by("-updated_at")
            .values_list("notification_key", flat=True)
        )
        return Response({"read_keys": keys}, status=status.HTTP_200_OK)


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=NotificationKeysSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = NotificationKeysSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        keys = serializer.validated_data["keys"]

        existing_keys = set(
            NotificationReadState.objects.filter(
                user=request.user,
                notification_key__in=keys,
            ).values_list("notification_key", flat=True)
        )
        now = timezone.now()

        pending = [
            NotificationReadState(
                user=request.user,
                notification_key=key,
                read_at=now,
            )
            for key in keys
            if key not in existing_keys
        ]
        if pending:
            NotificationReadState.objects.bulk_create(pending, ignore_conflicts=True)

        NotificationReadState.objects.filter(
            user=request.user,
            notification_key__in=keys,
        ).update(read_at=now, updated_at=now)

        return Response({"updated": len(keys)}, status=status.HTTP_200_OK)


class NotificationMarkUnreadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=NotificationKeysSerializer, responses={200: OpenApiTypes.OBJECT})
    def post(self, request):
        serializer = NotificationKeysSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        keys = serializer.validated_data["keys"]

        queryset = NotificationReadState.objects.filter(
            user=request.user,
            notification_key__in=keys,
        )
        removed = queryset.count()
        queryset.delete()

        return Response({"removed": removed}, status=status.HTTP_200_OK)
    




class AuditLogPagination(OptionalPageNumberPagination):
    page_size = 50

    def paginate_queryset(self, queryset, request, view=None):
        return PageNumberPagination.paginate_queryset(self, queryset, request, view=view)


class AuditLogSerializer(drf_serializers.ModelSerializer):
    """El rastro se lee, nunca se escribe: todos los campos son de solo lectura."""

    user_username = drf_serializers.SerializerMethodField()
    action_label = drf_serializers.CharField(source="get_action_display", read_only=True)
    # Anotado en el queryset: el admin de plataforma ve filas de todos los hoteles y sin esto
    # no podia distinguirlas (Bloque 11 #2).
    hotel_name = drf_serializers.CharField(read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "occurred_at",
            "hotel_settings_id",
            "hotel_name",
            "user",
            "user_username",
            "action",
            "action_label",
            "entity",
            "object_id",
            "object_label",
            "changes",
            "ip_address",
            "user_agent",
            "request_path",
            "request_method",
        ]
        read_only_fields = fields

    def get_user_username(self, obj) -> str:
        # El nombre guardado manda sobre la relacion: si el usuario se renombro o se
        # borro, el rastro tiene que seguir diciendo quien era **entonces**.
        return obj.username or (obj.user.username if obj.user else "")


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Consulta del rastro de auditoria.

    Solo lectura por diseño: un rastro que se puede editar no sirve para auditar. No hay
    `create`, `update` ni `destroy`, y nadie los va a añadir sin darse cuenta porque el
    viewset base no los trae.
    """

    serializer_class = AuditLogSerializer
    # Siempre paginado: la tabla crece con cada escritura del ORM y, sin `page`/`page_size`,
    # la paginacion opcional devolvia el historico entero de una vez (Bloque 11 #3).
    pagination_class = AuditLogPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["audit.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["username", "entity", "object_label", "request_path"]
    ordering_fields = ["occurred_at", "id"]
    ordering = ["-occurred_at", "-id"]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return AuditLog.objects.none()

        queryset = AuditLog.objects.select_related("user").annotate(
            hotel_name=Subquery(
                HotelSettings.objects.filter(pk=OuterRef("hotel_settings_id")).values("hotel_name")[:1]
            )
        )

        # El aislamiento va por la columna denormalizada: resolver la entidad de cada
        # fila para saber de que hotel es costaria una consulta por fila.
        if not is_effective_global_admin(user):
            hotel_id = getattr(user, "hotel_settings_id", None)
            queryset = queryset.filter(hotel_settings_id=hotel_id)
        else:
            # El selector de hotel del header (`?hotel_settings=`, 5.4) ahora tambien acota
            # el rastro, como ya hacia en /reportes (Bloque 11 #2).
            requested = str(self.request.query_params.get("hotel_settings") or "").strip()
            if requested.isdigit():
                queryset = queryset.filter(hotel_settings_id=int(requested))

        return self._apply_filters(queryset)

    def _apply_filters(self, queryset):
        params = self.request.query_params

        action_filter = (params.get("action") or "").strip().upper()
        if action_filter in dict(AuditLog.Action.choices):
            queryset = queryset.filter(action=action_filter)

        entity = (params.get("entity") or "").strip()
        if entity:
            queryset = queryset.filter(entity__iexact=entity)

        username = (params.get("username") or "").strip()
        if username:
            queryset = queryset.filter(username__iexact=username)

        # Rango por **fecha local**, no por instante: un `lte` con la fecha suelta
        # recortaria el ultimo dia a su primer segundo.
        date_from = (params.get("occurred_after") or "").strip()
        if date_from:
            queryset = queryset.filter(occurred_at__date__gte=date_from)

        date_to = (params.get("occurred_before") or "").strip()
        if date_to:
            queryset = queryset.filter(occurred_at__date__lte=date_to)

        return queryset

    @action(detail=False, methods=["get"], url_path="entities")
    def entities(self, request):
        """Las entidades y usuarios que de verdad aparecen, para poblar los filtros.

        Ofrecer la lista completa de modelos del sistema llenaria el desplegable de
        opciones que no devuelven nada.
        """
        queryset = self.get_queryset()
        return Response(
            {
                "entities": sorted(
                    queryset.exclude(entity="")
                    .values_list("entity", flat=True)
                    .distinct()
                ),
                "users": sorted(
                    queryset.exclude(username="")
                    .values_list("username", flat=True)
                    .distinct()
                ),
            }
        )

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """Descarga el rastro filtrado en CSV.

        Sirve para entregarle el periodo al contador o al auditor sin darle acceso al
        sistema. Se respeta el filtro de la consulta y el aislamiento por hotel; se
        limita el volumen para no tumbar el proceso con una exportacion de años.
        """
        import csv

        from django.http import HttpResponse

        queryset = self.filter_queryset(self.get_queryset())[:20000]

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="auditoria.csv"'
        # BOM: es lo que hace que Excel en español lo abra sin preguntar nada.
        response.write("\ufeff")

        writer = csv.writer(response, delimiter=";")
        writer.writerow(
            [
                "Fecha",
                "Usuario",
                "Accion",
                "Entidad",
                "Registro",
                "Cambios",
                "IP",
                "Ruta",
                "Metodo",
            ]
        )

        for entry in queryset:
            writer.writerow(
                [
                    timezone.localtime(entry.occurred_at).strftime("%Y-%m-%d %H:%M:%S"),
                    entry.username or "sistema",
                    entry.get_action_display(),
                    entry.entity,
                    entry.object_label or entry.object_id,
                    _describe_changes(entry.changes),
                    entry.ip_address or "",
                    entry.request_path,
                    entry.request_method,
                ]
            )

        return response


def _describe_changes(changes) -> str:
    """El diff en una celda legible: `campo: antes -> despues`."""
    if not isinstance(changes, dict) or not changes:
        return ""

    if "after" in changes and "before" not in changes:
        return "alta"
    if "before" in changes and "after" not in changes:
        return "baja"

    parts = []
    for field, values in changes.items():
        if not isinstance(values, dict):
            continue
        parts.append(f"{field}: {values.get('before')} -> {values.get('after')}")
    return " | ".join(parts)
