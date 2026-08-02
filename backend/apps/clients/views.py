from django.conf import settings

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin
from apps.master_data.models import MasterData

from .models import Client
from .serializers import (
    ClientCreateUpdateSerializer,
    ClientSerializer,
    normalize_client_type,
    normalize_status,
)


def _require_public_registration_token(request) -> None:
    expected_token = str(
        getattr(settings, "PUBLIC_CLIENT_REGISTRATION_TOKEN", "") or ""
    ).strip()
    if not expected_token:
        raise ValidationError(
            {
                "detail": (
                    "Public client registration is enabled but "
                    "PUBLIC_CLIENT_REGISTRATION_TOKEN is missing."
                )
            }
        )

    provided_token = str(
        request.headers.get("X-Public-Registration-Token", "")
        or request.data.get("registration_token", "")
    ).strip()
    if provided_token != expected_token:
        raise ValidationError({"detail": "Invalid public registration token."})


class ClientViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = Client.objects.select_related(
        "hotel_settings",
        "document_type",
        "client_type",
        "status",
    ).all()
    serializer_class = ClientSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    tenant_filter = "hotel_settings"

    required_scopes = ["clients.read"]

    serializer_action_classes = {
        "create": ClientCreateUpdateSerializer,
        "update": ClientCreateUpdateSerializer,
        "partial_update": ClientCreateUpdateSerializer,
        "register": ClientCreateUpdateSerializer,
    }

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "document_type__code",
        "document_type__name",
        "document_number",
        "first_name",
        "last_name",
        "email",
        "phone",
        "country",
        "client_type__code",
        "client_type__name",
        "status__code",
        "status__name",
    ]
    ordering_fields = ["id", "created_at", "first_name", "last_name", "email"]
    ordering = ["-id"]

    def get_serializer_class(self):
        return self.serializer_action_classes.get(self.action, self.serializer_class)

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["clients.write"]
        return self.required_scopes

    def get_permissions(self):
        allow_public_register = getattr(settings, "ALLOW_PUBLIC_CLIENT_REGISTRATION", False)
        if self.action in ("register",) and allow_public_register:
            return [AllowAny()]

        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()

        response_data = ClientSerializer(
            client,
            context=self.get_serializer_context(),
        ).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="register")
    def register(self, request):
        allow_public_register = getattr(settings, "ALLOW_PUBLIC_CLIENT_REGISTRATION", False)
        if not request.user.is_authenticated and allow_public_register:
            _require_public_registration_token(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = serializer.save()

        data = ClientSerializer(
            client,
            context=self.get_serializer_context(),
        ).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="set-status")
    def set_status(self, request, pk=None):
        client = self.get_object()

        try:
            new_status = normalize_status(request.data.get("status"))
        except ValidationError as exc:
            return Response({"status": exc.detail}, status=status.HTTP_400_BAD_REQUEST)

        if isinstance(new_status, int) or (isinstance(new_status, str) and str(new_status).isdigit()):
            status_obj = MasterData.objects.filter(
                group=MasterData.Group.CLIENT_STATUS,
                id=int(new_status),
            ).first()
        else:
            status_obj = MasterData.objects.filter(
                group=MasterData.Group.CLIENT_STATUS,
                code=str(new_status).upper(),
            ).first()

        if not status_obj:
            return Response(
                {"status": "No existe el estado solicitado en el catalogo maestro."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client.status = status_obj
        client.save(update_fields=["status"])

        return Response(
            ClientSerializer(client, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["patch"], url_path="set-client-type")
    def set_client_type(self, request, pk=None):
        client = self.get_object()

        try:
            new_type = normalize_client_type(request.data.get("client_type"))
        except ValidationError as exc:
            return Response({"client_type": exc.detail}, status=status.HTTP_400_BAD_REQUEST)

        if isinstance(new_type, int) or (isinstance(new_type, str) and str(new_type).isdigit()):
            type_obj = MasterData.objects.filter(
                group=MasterData.Group.CLIENT_TYPE,
                id=int(new_type),
            ).first()
        else:
            type_obj = MasterData.objects.filter(
                group=MasterData.Group.CLIENT_TYPE,
                code=str(new_type).upper(),
            ).first()

        if not type_obj:
            return Response(
                {"client_type": "No existe el tipo solicitado en el catalogo maestro."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client.client_type = type_obj
        client.save(update_fields=["client_type"])

        return Response(
            ClientSerializer(client, context=self.get_serializer_context()).data
        )
