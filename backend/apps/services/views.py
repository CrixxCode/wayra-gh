from rest_framework import filters, viewsets
from rest_framework.exceptions import ValidationError

from apps.services.models import Service
from apps.services.serializers import ServiceSerializer
from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin, exclude_soft_deleted
from accounts.tenancy import TenantScopeMixin


class ServiceViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        Service.objects.select_related(
            "hotel_settings",
            "service_type",
        )
    )
    tenant_filter = "hotel_settings"
    serializer_class = ServiceSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["services.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "name",
        "description",
        "hotel_settings__hotel_name",
        "service_type__name",
        "service_type__code",
    ]
    ordering_fields = [
        "id",
        "name",
        "base_price",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["services.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_destroy(self, instance):
        """
        El borrado logico nunca dispara el `PROTECT` de `PackageService.service`: antes el
        servicio desaparecia del catalogo y los paquetes que lo incluian quedaban con un
        servicio fantasma, sin aviso (auditoria, Bloque 7 #2).
        """
        from apps.packages.models import Package, PackageService

        package_names = list(
            exclude_soft_deleted(
                Package.objects.filter(
                    id__in=exclude_soft_deleted(
                        PackageService.objects.filter(service=instance)
                    ).values("package_id"),
                    is_active=True,
                )
            )
            .order_by("name")
            .values_list("name", flat=True)[:6]
        )
        if package_names:
            shown = ", ".join(package_names[:5]) + (" y otros" if len(package_names) > 5 else "")
            raise ValidationError(
                {
                    "service": (
                        f"No se puede eliminar el servicio: lo incluyen los paquetes {shown}. "
                        "Quitalo de esos paquetes primero, o desactivalo si solo quieres dejar "
                        "de ofrecerlo."
                    )
                }
            )
        super().perform_destroy(instance)
