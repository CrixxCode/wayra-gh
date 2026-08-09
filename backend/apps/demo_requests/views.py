import logging
import random
import secrets
import string
from email.mime.image import MIMEImage
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.email_utils import (
    describe_email_send_failure,
    email_backend_configuration_error,
    email_backend_delivers_to_inbox,
)
from accounts.models import Role, UserRole
from apps.hotel_settings.models import HotelFloor, HotelSettings
from .models import DemoRequest
from .permissions import IsPlatformAdmin
from .serializers import DemoRequestCreateSerializer, DemoRequestSerializer, DemoRequestStatusSerializer

User = get_user_model()
logger = logging.getLogger(__name__)

TEMPORARY_ACCESS_PASSWORD_LENGTH = 14
TEMPORARY_ACCESS_PASSWORD_SPECIALS = "!@#$%*-_"


def generate_temporary_access_password(user=None, length: int = TEMPORARY_ACCESS_PASSWORD_LENGTH) -> str:
    character_groups = [
        string.ascii_lowercase,
        string.ascii_uppercase,
        string.digits,
        TEMPORARY_ACCESS_PASSWORD_SPECIALS,
    ]
    if length < len(character_groups):
        raise ValueError("Temporary password length is too short.")

    alphabet = "".join(character_groups)
    randomizer = random.SystemRandom()

    for _ in range(100):
        password_chars = [secrets.choice(group) for group in character_groups]
        password_chars.extend(secrets.choice(alphabet) for _ in range(length - len(password_chars)))
        randomizer.shuffle(password_chars)
        password = "".join(password_chars)

        try:
            password_validation.validate_password(password, user)
        except DjangoValidationError:
            continue

        return password

    raise DjangoValidationError("No fue posible generar una contrasena temporal valida.")


def build_demo_access_login_url(request=None, base_url=None) -> str:
    clean_base_url = str(base_url or "").strip()
    if clean_base_url:
        return clean_base_url

    if request is not None:
        return request.build_absolute_uri("/login")

    return "http://localhost:4200/login"


def build_demo_access_email_brand(user) -> tuple[dict, bytes | None, str, str]:
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
    return brand, inline_logo_bytes, inline_logo_name, inline_logo_cid


def send_demo_temporary_password_email(
    *,
    user,
    demo_request: DemoRequest,
    temporary_password: str,
    request=None,
    base_url=None,
) -> dict:
    email = str(user.email or "").strip().lower()
    login_url = build_demo_access_login_url(request=request, base_url=base_url)
    brand, inline_logo_bytes, inline_logo_name, inline_logo_cid = build_demo_access_email_brand(user)
    hotel_name = str(
        getattr(demo_request, "hotel_name", "")
        or getattr(user.hotel_settings, "hotel_name", "")
        or ""
    ).strip()
    recipient_name = f"{user.first_name} {user.last_name}".strip() or user.username

    subject = f"Acceso temporal para la demo de {hotel_name or brand['app_name']}"
    text_body = (
        f"Hola {recipient_name},\n\n"
        f"Recibes este correo porque solicitaste una demo para {hotel_name or 'tu hotel'} y "
        f"el equipo de {brand['app_name']} habilito tu primer acceso.\n\n"
        f"Enlace de ingreso: {login_url}\n"
        f"Usuario: {user.username}\n"
        f"Contrasena temporal: {temporary_password}\n\n"
        "Por seguridad, al iniciar sesion por primera vez se te pedira cambiar esta contrasena.\n"
        "Si no solicitaste esta demo, ignora este mensaje o contacta a soporte.\n\n"
        f"Equipo {brand['app_name']}\n"
    )
    html_body = render_to_string(
        "email/demo_temporary_password.html",
        {
            "user": user,
            "demo_request": demo_request,
            "hotel_name": hotel_name,
            "recipient_name": recipient_name,
            "login_url": login_url,
            "temporary_password": temporary_password,
            **brand,
        },
    )

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@hotel.local")
    msg = EmailMultiAlternatives(subject, text_body, from_email, [email])
    msg.attach_alternative(html_body, "text/html")
    if inline_logo_bytes:
        logo_attachment = MIMEImage(inline_logo_bytes)
        logo_attachment.add_header("Content-ID", f"<{inline_logo_cid}>")
        logo_attachment.add_header("Content-Disposition", "inline", filename=inline_logo_name)
        msg.attach(logo_attachment)

    configuration_error = email_backend_configuration_error()
    if configuration_error:
        logger.error(
            "Demo access email could not be sent for user_id=%s email=%s demo_request_id=%s: %s",
            user.pk,
            email,
            demo_request.pk,
            configuration_error,
        )
        return {"sent": False, "error_detail": configuration_error}

    try:
        sent_count = msg.send(fail_silently=False)
    except Exception as exc:
        error_detail = describe_email_send_failure(exc)
        logger.exception(
            "Demo access email could not be sent for user_id=%s email=%s demo_request_id=%s: %s",
            user.pk,
            email,
            demo_request.pk,
            error_detail,
        )
        return {"sent": False, "error_detail": error_detail}

    return {"sent": bool(sent_count) and email_backend_delivers_to_inbox(), "error_detail": ""}


class DemoRequestViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = DemoRequest.objects.all().order_by("-created_at", "-id")
    throttle_scope = None
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "hotel_type", "country", "state", "city"]
    search_fields = [
        "hotel_name",
        "country",
        "state",
        "city",
        "address",
        "requester_first_name",
        "requester_last_name",
        "requester_username",
        "requester_email",
        "requester_phone",
    ]
    ordering_fields = ["created_at", "updated_at", "hotel_name", "requester_email", "status"]
    ordering = ["-created_at", "-id"]

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        return [IsPlatformAdmin()]

    def get_throttles(self):
        self.throttle_scope = "demo_request" if self.action == "create" else None
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "create":
            return DemoRequestCreateSerializer
        if self.action in {"update", "partial_update"}:
            return DemoRequestStatusSerializer
        return DemoRequestSerializer

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return DemoRequest.objects.none()
        return super().get_queryset()

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        requested_status = str(request.data.get("status") or "").strip().upper()

        if requested_status == DemoRequest.Status.CONVERTED:
            converted = self.convert_request(instance)
            return Response(DemoRequestSerializer(converted).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(DemoRequestSerializer(instance).data, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        request = self.request
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        source_ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.META.get("REMOTE_ADDR")
        user_agent = str(request.META.get("HTTP_USER_AGENT", "") or "")[:255]

        serializer.save(source_ip=source_ip or None, user_agent=user_agent)

    @action(detail=True, methods=["post"], url_path="resend-access-email")
    def resend_access_email(self, request, *args, **kwargs):
        demo_request = self.get_object()

        if not demo_request.converted_user_id:
            raise ValidationError(
                {"detail": "La solicitud debe estar convertida antes de reenviar la clave temporal."}
            )

        if not demo_request.converted_user.must_change_password:
            raise ValidationError(
                {
                    "detail": (
                        "El primer usuario ya cambio su contrasena. "
                        "Usa recuperacion de contrasena si necesita volver a ingresar."
                    )
                }
            )

        email_result = self.send_temporary_access_email_result(demo_request)
        password_reset_sent = bool(email_result.get("sent"))
        demo_request.password_reset_sent = password_reset_sent
        demo_request.save(update_fields=["password_reset_sent", "updated_at"])
        demo_request.refresh_from_db()
        demo_request._email_delivery_error = email_result.get("error_detail", "")

        return Response(DemoRequestSerializer(demo_request).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="access-link")
    def access_link(self, request, *args, **kwargs):
        demo_request = self.get_object()

        if not demo_request.converted_user_id:
            raise ValidationError(
                {"detail": "La solicitud debe estar convertida antes de generar el enlace de acceso."}
            )

        base_url = str(request.data.get("base_url") or "").strip() or None
        access_url = build_demo_access_login_url(
            request=request,
            base_url=base_url,
        )

        return Response({"access_url": access_url}, status=status.HTTP_200_OK)

    @transaction.atomic
    def convert_request(self, demo_request: DemoRequest) -> DemoRequest:
        locked_request = DemoRequest.objects.select_for_update().get(pk=demo_request.pk)

        if locked_request.converted_hotel_settings_id and locked_request.converted_user_id:
            if locked_request.status != DemoRequest.Status.CONVERTED:
                locked_request.status = DemoRequest.Status.CONVERTED
                locked_request.save(update_fields=["status", "updated_at"])
            return locked_request

        admin_role = Role.objects.filter(slug="admin", is_active=True).first()
        if admin_role is None:
            raise ValidationError({"status": "No existe un rol activo con slug 'admin' para asignar al primer usuario."})

        email = locked_request.requester_email.strip().lower()
        username = locked_request.requester_username.strip()

        if User.objects.filter(email__iexact=email).exists():
            raise ValidationError({"requester_email": "Ya existe un usuario con este correo."})

        if User.objects.filter(username__iexact=username).exists():
            raise ValidationError({"requester_username": "Ya existe un usuario con este nombre de usuario."})

        hotel = HotelSettings.objects.create(
            hotel_name=locked_request.hotel_name,
            address=locked_request.address or None,
            city=locked_request.city,
            state=locked_request.state or None,
            country=locked_request.country or None,
            primary_phone=locked_request.requester_phone,
            general_email=email,
            reservations_email=email,
            website=locked_request.website or None,
            check_in_time=locked_request.check_in_time,
            check_out_time=locked_request.check_out_time,
            description=f"Creado desde solicitud de demo. Tipo de alojamiento: {locked_request.hotel_type}.",
        )
        HotelFloor.objects.create(
            hotel_settings=hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=locked_request.rooms,
        )

        user = User(
            username=username,
            email=email,
            first_name=locked_request.requester_first_name,
            last_name=locked_request.requester_last_name,
            job_title=locked_request.requester_job_title,
            hotel_settings=hotel,
            is_active=True,
            must_change_password=True,
        )
        temporary_password = generate_temporary_access_password(user)
        user.set_password(temporary_password)
        user.full_clean()
        user.save()
        UserRole.objects.create(user=user, role=admin_role, is_active=True)

        email_result = self.send_temporary_access_email_result(
            locked_request,
            user=user,
            temporary_password=temporary_password,
        )
        password_reset_sent = bool(email_result.get("sent"))

        locked_request.status = DemoRequest.Status.CONVERTED
        locked_request.converted_hotel_settings = hotel
        locked_request.converted_user = user
        locked_request.converted_at = timezone.now()
        locked_request.password_reset_sent = password_reset_sent
        locked_request.save(
            update_fields=[
                "status",
                "converted_hotel_settings",
                "converted_user",
                "converted_at",
                "password_reset_sent",
                "updated_at",
            ]
        )
        locked_request._email_delivery_error = email_result.get("error_detail", "")

        return locked_request

    def send_temporary_access_email(self, demo_request: DemoRequest) -> bool:
        return bool(self.send_temporary_access_email_result(demo_request).get("sent"))

    def send_temporary_access_email_result(
        self,
        demo_request: DemoRequest,
        *,
        user=None,
        temporary_password: str | None = None,
    ) -> dict:
        target_user = user or demo_request.converted_user
        if target_user is None:
            raise ValidationError({"detail": "La solicitud no tiene un usuario convertido."})

        if temporary_password is None:
            configuration_error = email_backend_configuration_error()
            if configuration_error:
                logger.error(
                    "Demo access email could not be sent for user_id=%s email=%s demo_request_id=%s: %s",
                    target_user.pk,
                    target_user.email,
                    demo_request.pk,
                    configuration_error,
                )
                return {"sent": False, "error_detail": configuration_error}
            temporary_password = self.reset_user_temporary_password(target_user)

        base_url = str(self.request.data.get("base_url") or "").strip() or None
        return send_demo_temporary_password_email(
            user=target_user,
            demo_request=demo_request,
            temporary_password=temporary_password,
            request=self.request,
            base_url=base_url,
        )

    def reset_user_temporary_password(self, user) -> str:
        temporary_password = generate_temporary_access_password(user)
        user.set_password(temporary_password)
        user.must_change_password = True
        user.password_changed_at = None
        user.full_clean()
        user.save(update_fields=["password", "must_change_password", "password_changed_at"])
        return temporary_password
