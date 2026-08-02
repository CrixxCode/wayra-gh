from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.email_utils import build_password_reset_url
from accounts.models import Role, UserRole
from accounts.serializers import PasswordResetRequestSerializer
from apps.hotel_settings.models import HotelSettings
from .models import DemoRequest
from .permissions import IsPlatformAdmin
from .serializers import DemoRequestCreateSerializer, DemoRequestSerializer, DemoRequestStatusSerializer

User = get_user_model()


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
    filterset_fields = ["status", "hotel_type", "city"]
    search_fields = [
        "hotel_name",
        "city",
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
                {"detail": "La solicitud debe estar convertida antes de reenviar el enlace de acceso."}
            )

        password_reset_sent = self.send_password_setup_email(demo_request.converted_user)
        demo_request.password_reset_sent = password_reset_sent
        demo_request.save(update_fields=["password_reset_sent", "updated_at"])
        demo_request.refresh_from_db()

        return Response(DemoRequestSerializer(demo_request).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="access-link")
    def access_link(self, request, *args, **kwargs):
        demo_request = self.get_object()

        if not demo_request.converted_user_id:
            raise ValidationError(
                {"detail": "La solicitud debe estar convertida antes de generar el enlace de acceso."}
            )

        base_url = str(request.data.get("base_url") or "").strip() or None
        access_url = build_password_reset_url(
            demo_request.converted_user,
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
            city=locked_request.city,
            primary_phone=locked_request.requester_phone,
            general_email=email,
            reservations_email=email,
            website=locked_request.website or None,
            description=f"Creado desde solicitud de demo. Tipo de alojamiento: {locked_request.hotel_type}.",
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
        user.set_unusable_password()
        user.full_clean()
        user.save()
        UserRole.objects.create(user=user, role=admin_role, is_active=True)

        password_reset_sent = self.send_password_setup_email(user)

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

        return locked_request

    def send_password_setup_email(self, user) -> bool:
        base_url = str(self.request.data.get("base_url") or "").strip() or None
        serializer = PasswordResetRequestSerializer(
            data={"email": user.email},
            context={"request": self.request, "base_url": base_url},
        )
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return bool(result.get("sent"))
