# accounts/views.py

from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.conf import settings
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
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import is_effective_global_admin, scope_queryset_to_hotel

from .models import Role, Resource, UserRole, RoleResource, NotificationReadState
from .serializers import (
    JobTitleSerializer, RegisterSerializer, UserSerializer, UserUpdateSerializer, RoleSerializer, ResourceSerializer,
    UserMiniSerializer, PasswordChangeSerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    NotificationKeysSerializer, ProfileUpdateSerializer
)
from django.db import models

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


class SessionLoginRequestSerializer(drf_serializers.Serializer):
    username = drf_serializers.CharField()
    password = drf_serializers.CharField()
    remember_me = drf_serializers.BooleanField(required=False, default=False)


# -----------------------------
# Salud / CSRF
# -----------------------------

class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response({"status": "ok"}, status=status.HTTP_200_OK)


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

        user = authenticate(request, username=username, password=password)
        if not user:
            return Response({"detail": "Credenciales inválidas."}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return Response({"detail": "Usuario inactivo."}, status=status.HTTP_403_FORBIDDEN)
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
        if self.action == "register" and allow_public_register:
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
        allow_public_register = getattr(settings, "ALLOW_PUBLIC_USER_REGISTRATION", False)
        if not request.user.is_authenticated and allow_public_register:
            _require_public_registration_token(
                request,
                setting_name="PUBLIC_USER_REGISTRATION_TOKEN",
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        data = UserSerializer(user, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)


class RoleViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = Role.objects.all().order_by("name")
    serializer_class = RoleSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["roles.read"]

    def get_required_scopes(self):
        # CRUD y acciones de asignación requieren roles.write
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["roles.write"]
        if getattr(self, "action", "") in ("assign_users", "remove_users", "assign_resources"):
            return ["roles.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def _role_user_scope_queryset(self):
        user = self.request.user
        queryset = User.objects.filter(is_active=True)

        if not user or not user.is_authenticated:
            return queryset.none()

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

    @action(detail=True, methods=["get"], url_path="job-titles")
    def job_titles(self, request, pk=None):
        """
        GET /api/roles/<id>/job-titles/
        Devuelve los cargos disponibles para ese rol.
        """
        role = self.get_object()
        qs = role.job_titles.filter(is_active=True).order_by("sort_order", "name")
        return Response(JobTitleSerializer(qs, many=True).data, status=status.HTTP_200_OK)

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
    


