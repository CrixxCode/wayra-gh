from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin
from apps.reservations.services import sync_room_status_for_room_ids
from .models import (
    Rate,
    Amenity,
    Room,
    MaintenanceOrder,
    CleaningTask,
    RecurringWork,
    RoomType,
)
from .operations import build_room_operations_map
from .recurring import has_due_rules, materialize_due_recurring_work
from .serializers import (
    RoomTypeSerializer,
    RateSerializer,
    AmenitySerializer,
    RoomSerializer,
    MaintenanceOrderSerializer,
    CleaningTaskSerializer,
    RecurringWorkSerializer,
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

class AmenityViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = Amenity.objects.all()
    serializer_class = AmenitySerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["amenities.read"]

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

    def _require_global_admin_write(self):
        if not is_effective_global_admin(self.request.user):
            raise PermissionDenied(
                "Solo el administrador de plataforma puede gestionar el catalogo global de amenidades."
            )

    def perform_create(self, serializer):
        self._require_global_admin_write()
        serializer.save()

    def perform_update(self, serializer):
        self._require_global_admin_write()
        serializer.save()

    def perform_destroy(self, instance):
        self._require_global_admin_write()
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, *args, **kwargs):
        self._require_global_admin_write()
        return super().restore(request, *args, **kwargs)


class RoomViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        Room.objects.select_related(
            "room_type",
            "rate",
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

    def get_serializer(self, *args, **kwargs):
        """Precalcula las señales operativas de toda la página en un solo bloque.

        Sin esto, `RoomSerializer.get_operations()` haría siete consultas por
        habitación; con el mapa en el contexto son siete para la página completa.
        """
        serializer = super().get_serializer(*args, **kwargs)

        instance = args[0] if args else None
        if instance is not None and "room_operations" not in serializer.context:
            rooms = list(instance) if kwargs.get("many") else [instance]
            serializer.context["room_operations"] = build_room_operations_map(rooms)

        return serializer

    def get_queryset(self):
        queryset = super().get_queryset()

        status_code = (self.request.query_params.get("status") or "").strip().upper()
        floor = (self.request.query_params.get("floor") or "").strip()
        room_type = (self.request.query_params.get("room_type") or "").strip()
        rate = (self.request.query_params.get("rate") or "").strip()

        if status_code:
            queryset = queryset.filter(status__code=status_code)

        if floor.isdigit():
            queryset = queryset.filter(floor_id=int(floor))

        if room_type:
            if room_type.isdigit():
                queryset = queryset.filter(room_type_id=int(room_type))
            else:
                queryset = queryset.filter(room_type__code=room_type.upper())

        if rate.isdigit():
            queryset = queryset.filter(rate_id=int(rate))

        return queryset.order_by("number")

    @action(detail=True, methods=["GET"], name="panel")
    def panel(self, request, pk=None):
        room = self.get_object()
        serializer = RoomPanelSerializer(room, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=True, methods=["POST"], url_path="rate")
    def rate(self, request, pk=None):
        room = self.get_object()
        serializer = self.get_serializer(
            room,
            data={"rate": request.data.get("rate", None)},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)



class MaterializeRecurringWorkMixin:
    """Pone al dia el trabajo periodico vencido antes de listar.

    Existe para que el sistema **no dependa de que alguien programe un cron**: abrir la
    pantalla ya genera lo que tocaba. Se comprueba primero con una consulta por indice,
    asi que el caso normal --nada vencido-- no cuesta nada.

    Un fallo aqui no puede tumbar la lectura: si la generacion falla, el usuario debe ver
    igual su trabajo. El comando o la siguiente carga volveran a intentarlo.
    """

    def list(self, request, *args, **kwargs):
        hotel_settings_id = (
            None if is_effective_global_admin(request.user) else getattr(request.user, "hotel_settings_id", None)
        )

        try:
            if has_due_rules(hotel_settings_id):
                materialize_due_recurring_work(hotel_settings_id)
        except Exception:  # noqa: BLE001 - la lectura no puede caerse por esto
            pass

        return super().list(request, *args, **kwargs)


class MaintenanceOrderViewSet(
    MaterializeRecurringWorkMixin,
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


class CleaningTaskViewSet(
    MaterializeRecurringWorkMixin,
    LogicalDeleteViewSetMixin,
    TenantScopeMixin,
    viewsets.ModelViewSet,
):
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


class RecurringWorkViewSet(MaterializeRecurringWorkMixin, TenantScopeMixin, viewsets.ModelViewSet):
    """Reglas de trabajo periodico.

    Sin borrado logico a proposito: una regla no se archiva, se **desactiva**
    (`is_active`), que es lo que el comando consulta cada dia. Un borrado logico anadiria
    un segundo estado apagado para lo mismo.
    """

    queryset = RecurringWork.objects.select_related(
        "room",
        "room__floor",
        "hotel_settings",
        "task_type",
        "priority",
    ).all()
    serializer_class = RecurringWorkSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["recurring_work.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "notes", "room__number"]
    ordering_fields = ["id", "next_run_on", "name", "created_at"]
    ordering = ["next_run_on", "id"]

    def get_queryset(self):
        queryset = super().get_queryset()

        # `?kind=CLEANING`: cada pestaña muestra su propia programacion.
        kind = str(self.request.query_params.get("kind", "")).strip().upper()
        if kind in RecurringWork.Kind.values:
            queryset = queryset.filter(kind=kind)

        return queryset

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["recurring_work.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
