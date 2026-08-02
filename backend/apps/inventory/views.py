from rest_framework import filters, viewsets
from django.db.models import F

from apps.inventory.models import Item, InventoryMovement, RoomInventory
from apps.inventory.serializers import ItemSerializer, InventoryMovementSerializer, RoomInventorySerializer
from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin


def _filter_queryset_by_user_tenant(queryset, user, *, tenant_filter: str):
    if not user or not user.is_authenticated:
        return queryset.none()

    if is_effective_global_admin(user):
        return queryset

    tenant_id = getattr(user, "hotel_settings_id", None)
    if tenant_id is None:
        return queryset.none()

    return queryset.filter(**{tenant_filter: tenant_id})


class ItemViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        Item.objects.select_related(
            "hotel_settings",
            "item_type",
            "unit_measure",
        )
    )
    tenant_filter = "hotel_settings"
    serializer_class = ItemSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["items.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "name",
        "sku",
        "description",
        "hotel_settings__hotel_name",
        "item_type__name",
        "item_type__code",
        "unit_measure__name",
        "unit_measure__code",
    ]
    ordering_fields = [
        "id",
        "name",
        "stock",
        "minimum_stock",
        "maximum_stock",
        "cost_price",
        "sale_price",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["items.write"]

        scopes = list(self.required_scopes)
        if self._should_include_deleted():
            scopes.append("items.read_deleted")
        return scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
    
        
class InventoryMovementViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        InventoryMovement.objects.select_related(
            "item",
            "item__hotel_settings",
            "movement_type",
        )
    )
    tenant_filter = "item__hotel_settings"
    serializer_class = InventoryMovementSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["inventory-movements.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "item__name",
        "reference",
        "notes",
        "movement_type__name",
        "movement_type__code",
    ]
    ordering_fields = [
        "id",
        "quantity",
        "previous_stock",
        "new_stock",
        "movement_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["inventory-movements.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
    
class RoomInventoryViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        RoomInventory.objects.select_related(
            "room",
            "room__floor",
            "room__floor__hotel_settings",
            "item",
        )
    )
    tenant_filter = "room__floor__hotel_settings"
    serializer_class = RoomInventorySerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["room-inventory.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "room__number",
        "item__name",
        "item__sku",
        "notes",
    ]
    ordering_fields = [
        "id",
        "quantity",
        "minimum_quantity",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.filter(
            item__hotel_settings_id=F("room__floor__hotel_settings_id"),
        ).order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["room-inventory.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
