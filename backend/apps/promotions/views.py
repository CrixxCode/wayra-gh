from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import F, Q

from apps.promotions.models import Promotion
from apps.promotions.serializers import PromotionSerializer
from apps.services.models import Service
from apps.packages.models import Package
from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin


class PromotionViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Promotion.objects.select_related(
            "hotel_settings",
            "discount_type",
            "service",
            "package",
        )
    )
    tenant_filter = "hotel_settings"
    serializer_class = PromotionSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["promotions.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "name",
        "code",
        "description",
        "hotel_settings__hotel_name",
        "discount_type__name",
        "discount_type__code",
        "service__name",
        "package__name",
    ]
    ordering_fields = [
        "id",
        "name",
        "code",
        "discount_value",
        "start_date",
        "end_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.filter(
            Q(service__isnull=True) | Q(service__hotel_settings_id=F("hotel_settings_id")),
            Q(package__isnull=True) | Q(package__hotel_settings_id=F("hotel_settings_id")),
        ).order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["promotions.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @action(detail=False, methods=["get"], url_path="target-catalog")
    def target_catalog(self, request):
        """
        Catalogo minimo de servicios y paquetes para formularios de promociones.
        Se protege con scopes de promociones para no depender de services.read/packages.read.
        """
        hotel_param = str(request.query_params.get("hotel_settings") or "").strip()
        requested_hotel_id = int(hotel_param) if hotel_param.isdigit() else None

        if self.is_global_admin():
            services_qs = Service.objects.all()
            packages_qs = Package.objects.all()
            if requested_hotel_id:
                services_qs = services_qs.filter(hotel_settings_id=requested_hotel_id)
                packages_qs = packages_qs.filter(hotel_settings_id=requested_hotel_id)
        else:
            tenant_id = self.get_tenant_id()
            if tenant_id is None:
                return Response({"services": [], "packages": []})
            services_qs = Service.objects.filter(hotel_settings_id=tenant_id)
            packages_qs = Package.objects.filter(hotel_settings_id=tenant_id)

        services_qs = services_qs.filter(is_active=True).order_by("name", "id")[:500]
        packages_qs = packages_qs.filter(is_active=True).order_by("name", "id")[:500]

        services_payload = [
            {
                "id": service.id,
                "name": service.name,
                "hotel_settings": service.hotel_settings_id,
            }
            for service in services_qs
        ]

        packages_payload = [
            {
                "id": package.id,
                "name": package.name,
                "hotel_settings": package.hotel_settings_id,
            }
            for package in packages_qs
        ]

        return Response(
            {
                "services": services_payload,
                "packages": packages_payload,
            }
        )
