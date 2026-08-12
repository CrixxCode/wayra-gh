from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import F

from apps.inventory.models import Item, InventoryMovement, RoomInventory
from apps.inventory.serializers import ItemSerializer, InventoryMovementSerializer, RoomInventorySerializer
from apps.inventory.services import register_purchase_entry, register_stock_count
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
        "item_purpose",
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
        queryset = self.queryset.order_by("-id")
        item_purpose = str(self.request.query_params.get("item_purpose", "")).strip().upper()
        if item_purpose in Item.Purpose.values:
            queryset = queryset.filter(item_purpose=item_purpose)
        return queryset

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

    def get_queryset(self):
        queryset = super().get_queryset()

        # `?item=<id>`: el detalle de un item ensena su propia bitacora, que es lo que
        # explica por que su stock es el que es. Traer el historico entero del hotel para
        # filtrarlo en el navegador no escala.
        item = (self.request.query_params.get("item") or "").strip()
        if item.isdigit():
            queryset = queryset.filter(item_id=int(item))

        return queryset

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["inventory-movements.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def _hotel_settings_id(self):
        """Hotel al que se acotan los lotes.

        Un administrador de plataforma no tiene hotel propio, asi que se le deja pasar
        sin filtro; a cualquier otro usuario se le acota al suyo (AGENTS.md 5.4).
        """
        user = self.request.user
        if is_effective_global_admin(user):
            return None
        return getattr(user, "hotel_settings_id", None)

    @action(detail=False, methods=["post"], url_path="stock-count")
    def stock_count(self, request):
        """Asienta un conteo fisico completo en una sola operacion.

        Va como accion del ViewSet y no como N `POST /inventory-movements/` porque un
        conteo es **una** operacion: debe ser atomica y compartir referencia. Ochenta
        peticiones sueltas dejarian el inventario a medio contar en cuanto una fallara.
        """
        try:
            result = register_stock_count(
                lines=request.data.get("lines") or [],
                user=request.user,
                hotel_settings_id=self._hotel_settings_id(),
                notes=request.data.get("notes") or "",
            )
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="purchase-entry")
    def purchase_entry(self, request):
        """Asienta la entrada de una compra: una linea `IN` por item recibido."""
        try:
            result = register_purchase_entry(
                lines=request.data.get("lines") or [],
                user=request.user,
                hotel_settings_id=self._hotel_settings_id(),
                reference=request.data.get("reference") or "",
                notes=request.data.get("notes") or "",
            )
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_201_CREATED)


class RoomInventoryViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        RoomInventory.objects.select_related(
            "room",
            "room__floor",
            "room__floor__hotel_settings",
            "item",
            "item__item_type",
            "item__unit_measure",
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
            item__item_purpose=Item.Purpose.ROOM,
        ).order_by("-id")

    def get_queryset(self):
        queryset = super().get_queryset()

        # `?room=<id>`: la revision de salida necesita el inventario de una sola
        # habitacion, no el del hotel entero.
        room = (self.request.query_params.get("room") or "").strip()
        if room.isdigit():
            queryset = queryset.filter(room_id=int(room))

        return queryset

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["room-inventory.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
