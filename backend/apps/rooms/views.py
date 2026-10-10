from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import CharField
from django.db.models.functions import Cast
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema

from accounts.pagination import OptionalPageNumberPagination
from accounts.models import SoftDeleteMarker
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin
from apps.hotel_settings.models import HotelFloor
from apps.reservations.services import sync_room_status_for_room_ids
from apps.inventory.models import RoomInventory
from apps.rooms.archive import ensure_catalog_not_in_use, ensure_rooms_can_be_archived
from .models import (
    Rate,
    Amenity,
    Room,
    RoomPhoto,
    MaintenanceOrder,
    CleaningTask,
    RecurringWork,
    RoomType,
)
from .operations import build_room_operations_map
from .recurring import has_due_rules, materialize_due_recurring_work
from .workflow import CLEANING, MAINTENANCE, assignable_users, user_display_name
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
from apps.hotel_settings.serializers import validate_gallery_image


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

    def perform_destroy(self, instance):
        ensure_catalog_not_in_use(instance, field="room_type", label="el tipo de habitacion")
        super().perform_destroy(instance)

class RateViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = Rate.objects.select_related("hotel_settings", "room_type").all()
    serializer_class = RateSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["rates.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["room_type", "billing_mode", "is_active"]
    search_fields = ["name", "room_type__name", "room_type__code"]
    ordering_fields = ["id", "name", "price", "billing_mode", "start_date", "end_date", "created_at"]
    ordering = ["-created_at"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["rates.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_destroy(self, instance):
        ensure_catalog_not_in_use(instance, field="rate", label="la tarifa")
        super().perform_destroy(instance)

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
            "photos",
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
    max_photos = 3

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

    @staticmethod
    def _live_room_count_for_floor(floor_id):
        if not floor_id:
            return 0

        room_content_type = ContentType.objects.get_for_model(Room)
        deleted_ids = SoftDeleteMarker.objects.filter(
            content_type=room_content_type,
        ).values("object_id")

        return (
            Room.objects.filter(floor_id=floor_id)
            .annotate(_soft_pk=Cast("pk", output_field=CharField()))
            .exclude(_soft_pk__in=deleted_ids)
            .count()
        )

    @classmethod
    def _sync_floor_room_count(cls, floor_id):
        if not floor_id:
            return

        HotelFloor.objects.filter(pk=floor_id).update(
            room_count=cls._live_room_count_for_floor(floor_id)
        )

    @staticmethod
    def _live_room_number_conflicts(instance):
        if not instance or not instance.floor_id:
            return Room.objects.none()

        room_content_type = ContentType.objects.get_for_model(Room)
        deleted_ids = SoftDeleteMarker.objects.filter(
            content_type=room_content_type,
        ).values("object_id")

        return (
            Room.objects.filter(
                number__iexact=instance.number,
                floor__hotel_settings_id=instance.floor.hotel_settings_id,
            )
            .exclude(pk=instance.pk)
            .annotate(_soft_pk=Cast("pk", output_field=CharField()))
            .exclude(_soft_pk__in=deleted_ids)
        )

    def perform_create(self, serializer):
        room = serializer.save()
        self._sync_floor_room_count(room.floor_id)

    def perform_update(self, serializer):
        previous_floor_id = serializer.instance.floor_id
        room = serializer.save()
        self._sync_floor_room_count(previous_floor_id)
        if room.floor_id != previous_floor_id:
            self._sync_floor_room_count(room.floor_id)

    def perform_destroy(self, instance):
        """Archiva la habitación, salvo que todavía tenga una reserva viva.

        El borrado es lógico (`SoftDeleteMarker`), así que la fila y su historia siguen
        ahí y `restore` la devuelve. Aun así hay que frenar el archivado cuando hay una
        reserva activa: la reserva seguiría apuntando a una habitación que recepción ya
        no ve en ninguna lista, y el huésped llegaría a una habitación que para el
        sistema no existe. Que la cancelen o la muevan primero.
        """
        ensure_rooms_can_be_archived([instance])

        super().perform_destroy(instance)
        self._sync_floor_room_count(instance.floor_id)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, *args, **kwargs):
        instance = self._get_restore_object()
        if self._live_room_number_conflicts(instance).exists():
            raise ValidationError(
                {
                    "number": (
                        "No se puede restaurar la habitacion "
                        f"{instance.number} porque ya existe otra habitacion con ese "
                        "numero en este hotel."
                    )
                }
            )
        response = super().restore(request, *args, **kwargs)
        self._sync_floor_room_count(instance.floor_id)
        return response

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

    @staticmethod
    def _uploaded_photos(request):
        return request.FILES.getlist("photos") or request.FILES.getlist("photo")

    def _serialize_room(self, room):
        return Response(
            self.get_serializer(room).data,
            status=200,
        )

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

    @action(detail=True, methods=["POST"], url_path="copy-configuration")
    def copy_configuration(self, request, pk=None):
        target_room = self.get_object()
        source_room_id = request.data.get("source_room")

        try:
            source_room_id = int(source_room_id)
        except (TypeError, ValueError):
            return Response(
                {"source_room": "Selecciona una habitacion origen valida."},
                status=400,
            )

        if source_room_id == target_room.id:
            return Response(
                {"source_room": "La habitacion origen debe ser diferente a la habitacion destino."},
                status=400,
            )

        source_room = (
            self.get_queryset()
            .prefetch_related("amenities", "room_inventory_items")
            .filter(pk=source_room_id)
            .first()
        )
        if not source_room:
            return Response(
                {"source_room": "Habitacion origen no encontrada para este hotel."},
                status=404,
            )

        with transaction.atomic():
            target_room.room_type = source_room.room_type
            target_room.rate = source_room.rate
            target_room.notes = source_room.notes
            target_room.full_clean()
            target_room.save(update_fields=["room_type", "rate", "notes"])
            target_room.amenities.set(source_room.amenities.all())

            source_inventory = list(
                RoomInventory.objects.select_related("item").filter(room=source_room)
            )
            source_item_ids = [record.item_id for record in source_inventory]

            for source_record in source_inventory:
                target_record = RoomInventory.objects.filter(
                    room=target_room,
                    item=source_record.item,
                ).first()
                if target_record is None:
                    target_record = RoomInventory(
                        room=target_room,
                        item=source_record.item,
                    )
                target_record.quantity = source_record.quantity
                target_record.minimum_quantity = source_record.minimum_quantity
                target_record.notes = source_record.notes
                target_record.is_active = source_record.is_active
                target_record.full_clean()
                target_record.save()

            stale_inventory = RoomInventory.objects.filter(room=target_room)
            if source_item_ids:
                stale_inventory = stale_inventory.exclude(item_id__in=source_item_ids)
            stale_inventory.update(is_active=False)

        target_room = self.get_queryset().get(pk=target_room.pk)
        return self._serialize_room(target_room)

    @action(detail=True, methods=["POST"], url_path="photos")
    def upload_photos(self, request, pk=None):
        room = self.get_object()
        files = self._uploaded_photos(request)

        if not files:
            return Response({"photos": "Debes adjuntar al menos una foto."}, status=400)

        existing_count = room.photos.count()
        if existing_count + len(files) > self.max_photos:
            return Response(
                {
                    "photos": (
                        f"Cada habitacion puede tener maximo {self.max_photos} fotos. "
                        f"Actualmente tiene {existing_count}."
                    )
                },
                status=400,
            )

        for uploaded_file in files:
            validate_gallery_image(uploaded_file)

        next_order = existing_count
        for uploaded_file in files:
            next_order += 1
            RoomPhoto.objects.create(
                room=room,
                image=uploaded_file,
                sort_order=next_order,
                alt_text=f"Foto {next_order} de habitacion {room.number}",
            )

        room = self.get_queryset().get(pk=room.pk)
        return self._serialize_room(room)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="photo_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
                required=True,
            )
        ]
    )
    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>[^/.]+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        room = self.get_object()
        photo = room.photos.filter(pk=photo_id).first()
        if not photo:
            return Response({"detail": "Foto no encontrada."}, status=404)

        photo.delete()
        room = self.get_queryset().get(pk=room.pk)
        return self._serialize_room(room)



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



class WorkAssignmentViewMixin:
    """Responsables de limpieza/mantenimiento: a quien se puede asignar y aviso al asignar."""

    work_kind = None

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    @action(detail=False, methods=["get"], url_path="assignable-users")
    def assignable_users(self, request):
        """Usuarios que se pueden poner como responsables (B4 #11; reglas en `workflow`)."""
        hotel_id = self.get_tenant_id()
        if hotel_id is None and is_effective_global_admin(request.user):
            raw = str(request.query_params.get("hotel_settings") or "").strip()
            hotel_id = int(raw) if raw.isdigit() else None
        users = assignable_users(hotel_id, self.work_kind)
        return Response([{"id": user.id, "name": user_display_name(user)} for user in users])

    def notify_if_reassigned(self, task, previous_assignee_id):
        assignee_id = getattr(task, "assigned_to_id", None)
        if not assignee_id or assignee_id == previous_assignee_id:
            return
        if assignee_id == getattr(self.request.user, "id", None):
            return
        from apps.notifications.services import notify_work_assigned

        notify_work_assigned(task, kind=self.work_kind)


class MaintenanceOrderViewSet(
    WorkAssignmentViewMixin,
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
        "assigned_to",
    ).all()
    serializer_class = MaintenanceOrderSerializer
    work_kind = MAINTENANCE
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

    def perform_create(self, serializer):
        order = serializer.save()
        self.notify_if_reassigned(order, None)

    def perform_update(self, serializer):
        previous_assignee_id = serializer.instance.assigned_to_id
        order = serializer.save()
        self.notify_if_reassigned(order, previous_assignee_id)


class CleaningTaskViewSet(
    WorkAssignmentViewMixin,
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
        "assigned_to",
    ).all()
    serializer_class = CleaningTaskSerializer
    work_kind = CLEANING
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
        self.notify_if_reassigned(task, None)

    def perform_update(self, serializer):
        instance = self.get_object()
        previous_room_id = instance.room_id
        previous_assignee_id = instance.assigned_to_id
        task = serializer.save()
        sync_room_status_for_room_ids([previous_room_id, task.room_id])
        self.notify_if_reassigned(task, previous_assignee_id)

    def perform_destroy(self, instance):
        room_id = instance.room_id
        super().perform_destroy(instance)
        sync_room_status_for_room_ids([room_id])

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, *args, **kwargs):
        # Restaurar solo quita el marcador, sin `save()` ni senales: hay que resincronizar a
        # mano o la habitacion queda "Disponible" con una limpieza abierta (Bloque 4 #4).
        response = super().restore(request, *args, **kwargs)
        task = self._get_restore_object()
        sync_room_status_for_room_ids([task.room_id])
        return response


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
