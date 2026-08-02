import logging
from pathlib import Path
from email.mime.image import MIMEImage

from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from apps.hotel_settings.models import HotelSettings
from accounts.email_utils import build_password_reset_url, email_backend_delivers_to_inbox
from accounts.tenancy import is_effective_global_admin

from rest_framework import serializers

from .models import JobTitle, Role, Resource, UserRole

User = get_user_model()
logger = logging.getLogger(__name__)


# -----------------------------
# RBAC
# -----------------------------

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = [
            "id",
            "key",
            "name",
            "description",
            "link",
            "link_backend",
            "icon",
            "order",
            "is_menu",
            "parent",
        ]


class RoleSerializer(serializers.ModelSerializer):
    resources = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "name", "slug", "description", "resources"]

    def get_resources(self, obj) -> list[dict]:
        qs = (
            Resource.objects.filter(
                is_active=True,
                roleresource__role=obj,
                roleresource__is_active=True,
            )
            .distinct()
            .order_by("order", "name", "key")
        )
        return ResourceSerializer(qs, many=True).data


class JobTitleSerializer(serializers.ModelSerializer):
    role_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = JobTitle
        fields = ["id", "name", "slug", "description", "is_active", "sort_order", "role_id"]


class UserHotelSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = HotelSettings
        fields = ["id", "hotel_name", "city", "country", "timezone", "currency"]


class UserMiniSerializer(serializers.ModelSerializer):
    hotel_settings = UserHotelSettingsSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "job_title",
            "is_active",
            "avatar",
            "hotel_settings",
        ]

# -----------------------------
# Usuarios
# -----------------------------

class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    resource_keys = serializers.SerializerMethodField()
    menu = serializers.SerializerMethodField()
    hotel_settings = UserHotelSettingsSerializer(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "avatar",
            "first_name",
            "last_name",
            "username",
            "email",
            "job_title",
            "is_active",
            "is_staff",
            "is_superuser",
            "must_change_password",
            "hotel_settings",
            "roles",
            "resource_keys",
            "menu",
        ]
        read_only_fields = [
            "id",
            "hotel_settings",
            "is_staff",
            "is_superuser",
            "must_change_password",
            "roles",
            "resource_keys",
            "menu",
        ]

    def get_resource_keys(self, obj) -> list[str]:
        return sorted(list(obj.resource_keys()))

    def get_roles(self, obj) -> list[dict]:
        qs = (
            Role.objects.filter(
                is_active=True,
                userrole__user=obj,
                userrole__is_active=True,
            )
            .distinct()
            .order_by("name")
        )
        return RoleSerializer(qs, many=True).data

    def get_menu(self, obj) -> list[dict]:
        """
        Devuelve el menú dinámico basado en los Resources del usuario.
        Estructura:
        [
          {id, label, icon, route, children:[...]}
        ]
        """

        # 1) Recursos asignados al usuario (solo los que se muestran en menú)
        assigned_qs = (
            Resource.objects
            .filter(
                is_active=True,
                is_menu=True,
                roleresource__is_active=True,
                roleresource__role__is_active=True,
                roleresource__role__userrole__user=obj,
                roleresource__role__userrole__is_active=True,
            )
            .distinct()
            .select_related("parent")
        )

        assigned = list(assigned_qs)
        if not assigned:
            return []

        ids = set(r.id for r in assigned)

        # 2) Incluir padres para no perder grupos del menú
        parent_ids = set(r.parent_id for r in assigned if r.parent_id)

        # Traer padres faltantes recursivamente
        while True:
            missing = [pid for pid in parent_ids if pid and pid not in ids]
            if not missing:
                break
            parents = list(
                Resource.objects.filter(id__in=missing, is_menu=True, is_active=True)
                .select_related("parent")
            )
            if not parents:
                break
            for p in parents:
                ids.add(p.id)
                if p.parent_id:
                    parent_ids.add(p.parent_id)

        # 3) Traer todos los recursos del menú (asignados + padres)
        resources = list(
            Resource.objects
            .filter(id__in=ids, is_menu=True, is_active=True)
            .select_related("parent")
            .order_by("order", "name")
        )

        by_id = {r.id: r for r in resources}
        children_map = {}
        for r in resources:
            children_map.setdefault(r.parent_id, []).append(r)

        def node(r: Resource):
            children = children_map.get(r.id, [])
            return {
                "id": str(r.id),
                "label": r.name,
                "icon": r.icon or "",
                "route": r.link or "",
                "children": [node(ch) for ch in children],
            }

        # Top-level = parent null o parent fuera del set
        top = []
        for r in resources:
            if r.parent_id is None or r.parent_id not in by_id:
                top.append(r)

        return [node(r) for r in top]


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "email",
            "job_title",
            "avatar",
        ]

    def validate_email(self, value):
        email = str(value or "").strip().lower()
        if not email:
            raise serializers.ValidationError("El correo es obligatorio.")
        qs = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email

    def validate_first_name(self, value):
        first_name = str(value or "").strip()
        if not first_name:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return first_name

    def validate_last_name(self, value):
        last_name = str(value or "").strip()
        if not last_name:
            raise serializers.ValidationError("El apellido es obligatorio.")
        return last_name

    def validate_job_title(self, value):
        return str(value or "").strip()

    def validate_avatar(self, value):
        return str(value or "").strip()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(required=True, max_length=50)
    last_name = serializers.CharField(required=True, max_length=50)
    email = serializers.EmailField(required=True)
    job_title = serializers.CharField(required=False, allow_blank=True, max_length=120)
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )
    job_title_option = serializers.PrimaryKeyRelatedField(
        queryset=JobTitle.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )
    is_active = serializers.BooleanField(default=True, required=False)
    force_password_change = serializers.BooleanField(default=True, required=False, write_only=True)
    status = serializers.CharField(required=False, write_only=True)

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "avatar",
            "first_name",
            "last_name",
            "username",
            "email",
            "job_title",
            "role",
            "job_title_option",
            "password",
            "is_active",
            "force_password_change",
            "status",
            "hotel_settings",
        ]

    def validate_username(self, value):
        username = (value or "").strip()
        if not username:
            raise serializers.ValidationError("El nombre de usuario no puede estar vacío.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Ya existe un usuario con este nombre de usuario.")
        return username

    def validate_email(self, value):
        email = (value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        selected_role = attrs.get("role")
        selected_job_title = attrs.get("job_title_option")

        if selected_job_title and not selected_role:
            raise serializers.ValidationError(
                {"job_title_option": "Debes seleccionar un rol antes de elegir un cargo."}
            )

        if selected_role and selected_job_title and selected_job_title.role_id != selected_role.id:
            raise serializers.ValidationError(
                {"job_title_option": "El cargo seleccionado no pertenece al rol elegido."}
            )

        return attrs

    def _actor_can_assign_hotel(self, actor) -> bool:
        if not actor or not actor.is_authenticated:
            return False

        if is_effective_global_admin(actor):
            return True

        return Role.objects.filter(
            is_active=True,
            slug__in=["admin", "superadmin", "super-admin"],
            userrole__user=actor,
            userrole__is_active=True,
        ).exists()

    def create(self, validated_data):
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        password = validated_data.pop("password")
        role = validated_data.pop("role", None)
        selected_job_title = validated_data.pop("job_title_option", None)
        status = validated_data.pop("status", "ACTIVE")
        force_password_change = bool(validated_data.pop("force_password_change", True))
        incoming_hotel = validated_data.pop("hotel_settings", None)

        is_active = validated_data.pop("is_active", True)
        if isinstance(status, str):
            is_active = status.upper() == "ACTIVE"

        validated_data["email"] = validated_data["email"].strip().lower()
        validated_data["username"] = validated_data["username"].strip()
        validated_data["first_name"] = validated_data.get("first_name", "").strip()
        validated_data["last_name"] = validated_data.get("last_name", "").strip()
        validated_data["job_title"] = validated_data.get("job_title", "").strip()
        if selected_job_title is not None:
            validated_data["job_title"] = selected_job_title.name
        validated_data["is_active"] = is_active

        assigned_hotel = None

        if actor and actor.is_authenticated:
            if self._actor_can_assign_hotel(actor):
                if incoming_hotel is not None:
                    assigned_hotel = incoming_hotel
                else:
                    assigned_hotel = actor.hotel_settings
            else:
                if actor.hotel_settings is None:
                    raise serializers.ValidationError({
                        "hotel_settings": "El usuario autenticado no tiene un hotel asignado."
                    })
                assigned_hotel = actor.hotel_settings
        else:
            # Registro público no encaja bien con este flujo multitenant
            # salvo que definas una estrategia explícita.
            raw_public_hotel_id = getattr(settings, "PUBLIC_USER_REGISTRATION_HOTEL_ID", None)
            if raw_public_hotel_id in (None, ""):
                raise serializers.ValidationError({
                    "hotel_settings": (
                        "Registro publico no configurado de forma segura. "
                        "Define PUBLIC_USER_REGISTRATION_HOTEL_ID."
                    )
                })
            try:
                public_hotel_id = int(raw_public_hotel_id)
            except (TypeError, ValueError):
                raise serializers.ValidationError({
                    "hotel_settings": "PUBLIC_USER_REGISTRATION_HOTEL_ID debe ser un entero valido."
                })

            assigned_hotel = HotelSettings.objects.filter(id=public_hotel_id).first()
            if assigned_hotel is None:
                raise serializers.ValidationError({
                    "hotel_settings": "El hotel configurado para registro publico no existe."
                })

        user = User(**validated_data)
        user.hotel_settings = assigned_hotel
        user.must_change_password = bool(actor and actor.is_authenticated and force_password_change)
        user.set_password(password)

        if not user.is_superuser and user.hotel_settings is None:
            raise serializers.ValidationError({
                "hotel_settings": "Este usuario debe pertenecer a un hotel."
            })

        user.full_clean()
        user.save()

        if role is not None:
            rel, created = UserRole.objects.get_or_create(
                user=user,
                role=role,
                defaults={"is_active": True},
            )
            if not created and not rel.is_active:
                rel.is_active = True
                rel.save(update_fields=["is_active"])
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )
    job_title_option = serializers.PrimaryKeyRelatedField(
        queryset=JobTitle.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )
    status = serializers.CharField(required=False, write_only=True)
    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            "avatar",
            "first_name",
            "last_name",
            "username",
            "email",
            "job_title",
            "role",
            "job_title_option",
            "is_active",
            "status",
            "hotel_settings",
        ]

    def validate_username(self, value):
        username = (value or "").strip()
        if not username:
            raise serializers.ValidationError("El nombre de usuario no puede estar vacío.")

        qs = User.objects.filter(username__iexact=username)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un usuario con este nombre de usuario.")
        return username

    def validate_email(self, value):
        email = (value or "").strip().lower()
        qs = User.objects.filter(email__iexact=email)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email

    def validate(self, attrs):
        if isinstance(getattr(self, "initial_data", None), dict) and "password" in self.initial_data:
            raise serializers.ValidationError(
                {"password": "La contraseña no se puede editar aquí. Cada usuario debe cambiarla desde su perfil."}
            )

        selected_role = attrs.get("role", None)
        selected_job_title = attrs.get("job_title_option", None)

        if selected_job_title is None:
            return attrs

        effective_role = selected_role
        if effective_role is None and self.instance is not None:
            effective_role = (
                Role.objects.filter(
                    is_active=True,
                    userrole__user=self.instance,
                    userrole__is_active=True,
                )
                .distinct()
                .order_by("name")
                .first()
            )

        if effective_role is None:
            raise serializers.ValidationError(
                {"job_title_option": "Debes seleccionar un rol antes de elegir un cargo."}
            )

        if selected_job_title.role_id != effective_role.id:
            raise serializers.ValidationError(
                {"job_title_option": "El cargo seleccionado no pertenece al rol elegido."}
            )

        return attrs

    def _actor_can_assign_hotel(self, actor) -> bool:
        if not actor or not actor.is_authenticated:
            return False

        if is_effective_global_admin(actor):
            return True

        return Role.objects.filter(
            is_active=True,
            slug__in=["admin", "superadmin", "super-admin"],
            userrole__user=actor,
            userrole__is_active=True,
        ).exists()

    def update(self, instance, validated_data):
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        marker = object()
        selected_role = validated_data.pop("role", marker)
        selected_job_title = validated_data.pop("job_title_option", marker)
        incoming_hotel = validated_data.pop("hotel_settings", marker)
        status = validated_data.pop("status", None)
        is_active = validated_data.pop("is_active", None)

        if isinstance(status, str):
            is_active = status.upper() == "ACTIVE"

        if is_active is not None:
            instance.is_active = bool(is_active)

        for field in ("username", "email", "first_name", "last_name", "job_title", "avatar"):
            if field not in validated_data:
                continue
            value = validated_data.get(field, "")
            setattr(instance, field, str(value or "").strip())

        if selected_job_title is not marker and selected_job_title is not None:
            instance.job_title = selected_job_title.name

        if incoming_hotel is not marker:
            if self._actor_can_assign_hotel(actor):
                instance.hotel_settings = incoming_hotel
            else:
                if actor is None or not actor.is_authenticated or actor.hotel_settings is None:
                    raise serializers.ValidationError(
                        {"hotel_settings": "El usuario autenticado no tiene un hotel asignado."}
                    )
                instance.hotel_settings = actor.hotel_settings

        if selected_role is not marker:
            if selected_role is None:
                UserRole.objects.filter(user=instance, is_active=True).update(is_active=False)
            else:
                UserRole.objects.filter(user=instance, is_active=True).exclude(role=selected_role).update(
                    is_active=False
                )
                rel, created = UserRole.objects.get_or_create(
                    user=instance,
                    role=selected_role,
                    defaults={"is_active": True},
                )
                if not created and not rel.is_active:
                    rel.is_active = True
                    rel.save(update_fields=["is_active"])

        instance.full_clean()
        instance.save()
        return instance


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": _("Contraseña actual incorrecta")})
        password_validation.validate_password(attrs["new_password"], user)
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return (value or "").strip().lower()

    def save(self):
        request = self.context.get("request")
        email = self.validated_data["email"]

        qs = User.objects.filter(email__iexact=email, is_active=True)
        if not qs.exists():
            return {"found": False}

        user = qs.first()
        reset_url = build_password_reset_url(
            user,
            request=request,
            base_url=self.context.get("base_url"),
        )
        app_name = str(getattr(settings, "APP_DISPLAY_NAME", "Wayra") or "Wayra").strip()
        support_email = str(getattr(settings, "SUPPORT_EMAIL", "soporte@hotel.local") or "soporte@hotel.local").strip()
        primary_color = str(getattr(settings, "BRAND_PRIMARY_COLOR", "#0f1f41") or "#0f1f41").strip()
        logo_url = str(getattr(settings, "BRAND_LOGO_URL", "") or "").strip()

        if not logo_url:
            hotel_logo = str(getattr(getattr(user, "hotel_settings", None), "logo", "") or "").strip()
            if hotel_logo:
                logo_url = hotel_logo

        inline_logo_bytes = None
        inline_logo_name = "logo-white.png"
        inline_logo_cid = "platform-logo"
        if not logo_url:
            logo_candidates = [
                Path(settings.BASE_DIR).parent / "frontend" / "public" / "logo-white.png",
                Path(settings.BASE_DIR) / "static" / "logo-white.png",
            ]
            for candidate in logo_candidates:
                if candidate.exists() and candidate.is_file():
                    try:
                        inline_logo_bytes = candidate.read_bytes()
                        inline_logo_name = candidate.name
                        logo_url = f"cid:{inline_logo_cid}"
                    except OSError:
                        inline_logo_bytes = None
                    break

        brand = {
            "app_name": app_name,
            "support_email": support_email,
            "primary_color": primary_color,
            "logo_url": logo_url or None,
        }

        subject = "Recuperación de contraseña"
        text_body = (
            f"Hola {user.username},\n\n"
            f"Recibimos una solicitud para restablecer tu contraseña en {brand['app_name']}.\n"
            f"Para continuar, abre el siguiente enlace:\n{reset_url}\n\n"
            "Si no fuiste tú, puedes ignorar este mensaje.\n"
            f"— Equipo {brand['app_name']}\n"
        )
        html_body = render_to_string(
            "email/password_reset.html",
            {"user": user, "reset_url": reset_url, **brand},
        )

        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@hotel.local")
        msg = EmailMultiAlternatives(subject, text_body, from_email, [email])
        msg.attach_alternative(html_body, "text/html")
        if inline_logo_bytes:
            logo_attachment = MIMEImage(inline_logo_bytes)
            logo_attachment.add_header("Content-ID", f"<{inline_logo_cid}>")
            logo_attachment.add_header(
                "Content-Disposition",
                "inline",
                filename=inline_logo_name,
            )
            msg.attach(logo_attachment)
        try:
            sent_count = msg.send(fail_silently=False)
        except Exception:
            logger.exception(
                "Password reset email could not be sent for user_id=%s email=%s",
                user.pk,
                email,
            )
            # Avoid exposing internals and keep API response stable.
            return {"found": True, "sent": False}

        return {"found": True, "sent": bool(sent_count) and email_backend_delivers_to_inbox()}


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        uid = attrs.get("uid")
        token = attrs.get("token")
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except Exception:
            raise serializers.ValidationError({"uid": _("Token inválido o usuario no encontrado.")})

        if not PasswordResetTokenGenerator().check_token(user, token):
            raise serializers.ValidationError({"token": _("Token inválido o expirado.")})

        password_validation.validate_password(attrs["new_password"], user)
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        return user


class NotificationKeysSerializer(serializers.Serializer):
    keys = serializers.ListField(
        child=serializers.CharField(max_length=180),
        allow_empty=False,
    )

    def validate_keys(self, value):
        cleaned: list[str] = []
        seen = set()

        for raw in value:
            key = str(raw or "").strip()
            if not key:
                continue
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(key)

        if not cleaned:
            raise serializers.ValidationError("Debes enviar al menos una notificacion valida.")

        return cleaned
