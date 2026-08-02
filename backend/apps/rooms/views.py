from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin
from apps.reservations.services import sync_room_status_for_room_ids
from .models import Rate, Amenity, Room, MaintenanceOrder, CleaningTask, RoomType
from .serializers import (
    RoomTypeSerializer,
    RateSerializer,
    AmenitySerializer,
    RoomSerializer,
    MaintenanceOrderSerializer,
    CleaningTaskSerializer,
    RoomPanelSerializer,
)


class RoomTypeViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = RoomType.objects.select_related("hotel_settings").all()
    serializer_class = RoomTypeSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["room_type.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["code", "name", "description", "bed_type"]
    ordering_fields = ["id", "code", "name", "sort_order", "capacity", "bed_count", "created_at"]
    ordering = ["sort_order", "name"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["room_type.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

class RateViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = Rate.objects.select_related("hotel_settings", "room_type").all()
    serializer_class = RateSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["rates.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "room_type__name", "room_type__code"]
    ordering_fields = ["id", "name", "price", "start_date", "end_date", "created_at"]
    ordering = ["-created_at"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["rates.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

class AmenityViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = Amenity.objects.select_related("hotel_settings").all()
    serializer_class = AmenitySerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["amenities.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description", "icon"]
    ordering_fields = ["id", "name", "created_at"]
    ordering = ["name"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["amenities.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class RoomViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        Room.objects.select_related(
            "room_type",
            "floor",
            "floor__hotel_settings",
            "status",
        )
        .prefetch_related(
            "amenities",
            "maintenance_orders",
            "reservation_details__reservation__status",
            "reservation_details__reservation__client",
        )
        .all()
    )
    serializer_class = RoomSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["rooms.read"]
    tenant_filter = "floor__hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "number",
        "room_type__name",
        "room_type__code",
        "floor__name",
        "notes",
        "status__code",
        "status__name",
    ]
    ordering_fields = ["id", "number", "created_at"]
    ordering = ["number"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["rooms.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()

        status_code = (self.request.query_params.get("status") or "").strip().upper()
        floor = (self.request.query_params.get("floor") or "").strip()
        room_type = (self.request.query_params.get("room_type") or "").strip()

        if status_code:
            queryset = queryset.filter(status__code=status_code)

        if floor.isdigit():
            queryset = queryset.filter(floor_id=int(floor))

        if room_type:
            if room_type.isdigit():
                queryset = queryset.filter(room_type_id=int(room_type))
            else:
                queryset = queryset.filter(room_type__code=room_type.upper())

        return queryset.order_by("number")

    @action(detail=True, methods=["GET"], name="panel")
    def panel(self, request, pk=None):
        room = self.get_object()
        serializer = RoomPanelSerializer(room, context=self.get_serializer_context())
        return Response(serializer.data)


class MaintenanceOrderViewSet(
    LogicalDeleteViewSetMixin,
    TenantScopeMixin,
    viewsets.ModelViewSet,
):
    queryset = MaintenanceOrder.objects.select_related(
        "room",
        "room__floor",
        "room__floor__hotel_settings",
        "priority",
        "status",
    ).all()
    serializer_class = MaintenanceOrderSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["maintenance_orders.read"]
    tenant_filter = "room__floor__hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "title",
        "description",
        "room__number",
        "priority__code",
        "priority__name",
        "status__code",
        "status__name",
    ]
    ordering_fields = ["id", "reported_at", "estimated_completed_at", "completed_at"]
    ordering = ["-reported_at"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["maintenance_orders.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class CleaningTaskViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = CleaningTask.objects.select_related(
        "room",
        "room__floor",
        "room__floor__hotel_settings",
        "task_type",
        "status",
        "priority",
    ).all()
    serializer_class = CleaningTaskSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["cleaning_tasks.read"]
    tenant_filter = "room__floor__hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "room__number",
        "notes",
        "task_type__code",
        "task_type__name",
        "status__code",
        "status__name",
        "priority__code",
        "priority__name",
    ]
    ordering_fields = [
        "id",
        "scheduled_for",
        "created_at",
        "completed_at",
        "priority__sort_order",
        "priority__code",
    ]
    ordering = ["-created_at"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["cleaning_tasks.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_create(self, serializer):
        task = serializer.save()
        sync_room_status_for_room_ids([task.room_id])

    def perform_update(self, serializer):
        instance = self.get_object()
        previous_room_id = instance.room_id
        task = serializer.save()
        sync_room_status_for_room_ids([previous_room_id, task.room_id])

    def perform_destroy(self, instance):
        room_id = instance.room_id
        super().perform_destroy(instance)
        sync_room_status_for_room_ids([room_id])
