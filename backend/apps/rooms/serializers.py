from rest_framework import serializers

from accounts.tenancy import TenantSerializerMixin, is_effective_global_admin
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.master_data.models import MasterData
from apps.master_data.serializers import MasterDataCodeField
from apps.reservations.services import (
    INACTIVE_RESERVATION_STATUS_CODES,
    is_reservation_in_house,
)
from .models import Rate, Amenity, Room, MaintenanceOrder, CleaningTask, RoomType

AMENITY_ICON_CATALOG = {
    "fa-solid fa-bed",
    "fa-solid fa-wifi",
    "fa-solid fa-tv",
    "fa-solid fa-bath",
    "fa-solid fa-snowflake",
    "fa-solid fa-mug-hot",
    "fa-solid fa-square-parking",
    "fa-solid fa-water-ladder",
    "fa-solid fa-bell-concierge",
    "fa-solid fa-dumbbell",
}

class AmenitySerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = Amenity
        fields = (
            "id",
            "hotel_settings",
            "name",
            "description",
            "icon",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")
        validators = []
        extra_kwargs = {
            "icon": {"required": True, "allow_blank": False, "allow_null": False},
        }

    def validate_name(self, value):
        normalized = (value or "").strip()
        if not normalized:
            raise serializers.ValidationError("El nombre de la amenidad es obligatorio.")
        return normalized

    def validate_icon(self, value):
        normalized = (value or "").strip()
        if normalized not in AMENITY_ICON_CATALOG:
            raise serializers.ValidationError("Icono no valido para amenidades.")
        return normalized

    def validate(self, attrs):
        hotel = self.require_target_tenant(attrs)

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar amenidades de otro hotel."
            )

        name = attrs.get("name", getattr(self.instance, "name", None))
        qs = Amenity.objects.filter(hotel_settings=hotel)

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if name and qs.filter(name=name.strip()).exists():
            raise serializers.ValidationError({
                "name": "Ya existe una amenidad con este nombre en este hotel."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)

class RoomTypeSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = RoomType
        fields = (
            "id",
            "hotel_settings",
            "code",
            "name",
            "description",
            "capacity",
            "bed_count",
            "bed_type",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []

    def validate_code(self, value):
        return str(value).strip().upper()

    def validate_name(self, value):
        normalized = str(value or "").strip()
        if not normalized:
            raise serializers.ValidationError("El nombre del tipo de habitacion es obligatorio.")
        return normalized

    def validate(self, attrs):
        hotel = self.require_target_tenant(attrs)

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar tipos de habitacion de otro hotel."
            )

        code = attrs.get("code", getattr(self.instance, "code", None))
        qs = RoomType.objects.filter(hotel_settings=hotel)

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if code and qs.filter(code=str(code).strip().upper()).exists():
            raise serializers.ValidationError({
                "code": "Ya existe un tipo de habitacion con este codigo en este hotel."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)

class RateSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    room_type = serializers.PrimaryKeyRelatedField(queryset=RoomType.objects.all())
    room_type_name = serializers.CharField(source="room_type.name", read_only=True)

    class Meta:
        model = Rate
        fields = (
            "id",
            "hotel_settings",
            "room_type",
            "room_type_name",
            "name",
            "price",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["room_type"].queryset = RoomType.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
        return fields

    def validate(self, attrs):
        hotel = self.require_target_tenant(attrs)
        room_type = attrs.get("room_type", getattr(self.instance, "room_type", None))

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar tarifas de otro hotel."
            )

        if room_type is None:
            raise serializers.ValidationError({
                "room_type": "El tipo de habitacion es obligatorio."
            })

        self.validate_same_tenant(room_type, "hotel_settings", "room_type", attrs)

        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError({
                "end_date": "La fecha final no puede ser menor que la fecha inicial."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)

class RoomSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    room_type = serializers.PrimaryKeyRelatedField(
        queryset=RoomType.objects.all(),
        allow_null=True,
        required=False,
    )
    room_type_name = serializers.CharField(source="room_type.name", read_only=True)
    room_type_capacity = serializers.IntegerField(source="room_type.capacity", read_only=True)
    floor_name = serializers.CharField(source="floor.name", read_only=True)
    floor_number = serializers.IntegerField(source="floor.floor_number", read_only=True)
    florr_number = serializers.IntegerField(source="floor.floor_number", read_only=True)

    status = MasterDataCodeField(group=MasterData.Group.ROOM_STATUS)
    status_label = serializers.CharField(source="status.name", read_only=True)
    active_reservation = serializers.SerializerMethodField()

    amenities = AmenitySerializer(many=True, read_only=True)
    amenity_ids = serializers.PrimaryKeyRelatedField(
        queryset=Amenity.objects.all(),
        source="amenities",
        many=True,
        write_only=True,
        required=False,
    )

    class Meta:
        model = Room
        fields = (
            "id",
            "hotel_settings",
            "number",
            "room_type",
            "room_type_name",
            "room_type_capacity",
            "floor",
            "floor_name",
            "floor_number",
            "florr_number",
            "status",
            "status_label",
            "active_reservation",
            "notes",
            "amenities",
            "amenity_ids",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def resolve_target_tenant(self, attrs):
        tenant = super().resolve_target_tenant(attrs)
        if tenant is not None:
            return tenant

        floor = attrs.get("floor", getattr(self.instance, "floor", None))
        return getattr(floor, "hotel_settings", None)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["floor"].queryset = HotelFloor.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["room_type"].queryset = RoomType.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["amenity_ids"].queryset = Amenity.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate(self, attrs):
        floor = attrs.get("floor", getattr(self.instance, "floor", None))
        room_type = attrs.get("room_type", getattr(self.instance, "room_type", None))

        if floor is None:
            raise serializers.ValidationError({
                "floor": "El piso de la habitacion es obligatorio."
            })

        hotel = self.require_target_tenant(attrs)

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.floor.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar habitaciones de otro hotel."
            )

        if floor.hotel_settings_id != hotel.id:
            raise serializers.ValidationError({
                "floor": "El piso no pertenece al hotel seleccionado."
            })

        if room_type and room_type.hotel_settings_id != hotel.id:
            raise serializers.ValidationError({
                "room_type": "El tipo de habitacion no pertenece al mismo hotel de la habitacion."
            })

        amenities = attrs.get("amenities", None)
        if amenities is not None and any(amenity.hotel_settings_id != hotel.id for amenity in amenities):
            raise serializers.ValidationError({
                "amenity_ids": "Todas las amenidades deben pertenecer al mismo hotel de la habitacion."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().update(instance, validated_data)

    def get_active_reservation(self, obj):
        reservation_details = list(
            obj.reservation_details.select_related(
                "reservation",
                "reservation__status",
                "reservation__client",
            )
            .filter(reservation__real_check_out__isnull=True)
            .exclude(reservation__status__code__in=INACTIVE_RESERVATION_STATUS_CODES)
            .order_by("reservation__expected_check_in", "reservation__id")
        )

        if not reservation_details:
            return None

        detail = next(
            (item for item in reservation_details if is_reservation_in_house(item.reservation)),
            reservation_details[0],
        )
        reservation = detail.reservation

        return {
            "id": reservation.id,
            "reservation_room_id": detail.id,
            "status": reservation.status_code,
            "status_label": reservation.status.name if reservation.status else None,
            "expected_check_in": reservation.expected_check_in,
            "expected_check_out": reservation.expected_check_out,
            "real_check_in": reservation.real_check_in,
            "real_check_out": reservation.real_check_out,
            "client_name": reservation.client.full_name if reservation.client_id else None,
        }

class MaintenanceOrderSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    room_number = serializers.CharField(source="room.number", read_only=True)
    priority = MasterDataCodeField(group=MasterData.Group.MAINTENANCE_PRIORITY)
    status = MasterDataCodeField(group=MasterData.Group.MAINTENANCE_STATUS)
    priority_label = serializers.CharField(source="priority.name", read_only=True)
    status_label = serializers.CharField(source="status.name", read_only=True)

    class Meta:
        model = MaintenanceOrder
        fields = (
            "id",
            "hotel_settings",
            "room",
            "room_number",
            "title",
            "description",
            "priority",
            "priority_label",
            "status",
            "status_label",
            "reported_at",
            "estimated_completed_at",
            "completed_at",
        )
        read_only_fields = ("id", "reported_at")

    def resolve_target_tenant(self, attrs):
        tenant = super().resolve_target_tenant(attrs)
        if tenant is not None:
            return tenant

        room = attrs.get("room", getattr(self.instance, "room", None))
        floor = getattr(room, "floor", None)
        return getattr(floor, "hotel_settings", None)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["room"].queryset = Room.objects.filter(
                floor__hotel_settings_id=user.hotel_settings_id
            )
        return fields

    def validate(self, attrs):
        room = attrs.get("room", getattr(self.instance, "room", None))

        if room is None:
            raise serializers.ValidationError({
                "room": "La habitacion es obligatoria."
            })

        hotel = self.require_target_tenant(attrs)

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.room.floor.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar ordenes de mantenimiento de otro hotel."
            )

        if room.floor.hotel_settings_id != hotel.id:
            raise serializers.ValidationError({
                "room": "La habitacion no pertenece al hotel seleccionado."
            })

        estimated_completed_at = attrs.get(
            "estimated_completed_at",
            getattr(self.instance, "estimated_completed_at", None),
        )
        completed_at = attrs.get(
            "completed_at",
            getattr(self.instance, "completed_at", None),
        )

        if estimated_completed_at and completed_at and completed_at < estimated_completed_at:
            raise serializers.ValidationError({
                "completed_at": "La fecha de finalizacion no puede ser menor que la fecha estimada."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().update(instance, validated_data)

class CleaningTaskSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    room_number = serializers.CharField(source="room.number", read_only=True)
    task_type = MasterDataCodeField(group=MasterData.Group.CLEANING_TASK_TYPE)
    status = MasterDataCodeField(group=MasterData.Group.CLEANING_STATUS)
    priority = MasterDataCodeField(
        group=MasterData.Group.MAINTENANCE_PRIORITY,
        allow_null=True,
        required=False,
    )
    task_type_label = serializers.CharField(source="task_type.name", read_only=True)
    status_label = serializers.CharField(source="status.name", read_only=True)
    priority_label = serializers.CharField(source="priority.name", read_only=True)

    class Meta:
        model = CleaningTask
        fields = (
            "id",
            "hotel_settings",
            "room",
            "room_number",
            "task_type",
            "task_type_label",
            "status",
            "status_label",
            "priority",
            "priority_label",
            "scheduled_for",
            "completed_at",
            "notes",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def resolve_target_tenant(self, attrs):
        tenant = super().resolve_target_tenant(attrs)
        if tenant is not None:
            return tenant

        room = attrs.get("room", getattr(self.instance, "room", None))
        floor = getattr(room, "floor", None)
        return getattr(floor, "hotel_settings", None)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["room"].queryset = Room.objects.filter(
                floor__hotel_settings_id=user.hotel_settings_id
            )
        return fields

    def validate(self, attrs):
        room = attrs.get("room", getattr(self.instance, "room", None))

        if room is None:
            raise serializers.ValidationError({
                "room": "La habitacion es obligatoria."
            })

        hotel = self.require_target_tenant(attrs)

        actor = self.get_actor()
        if (
            self.instance
            and actor
            and actor.is_authenticated
            and not self.is_global_admin()
            and self.instance.room.floor.hotel_settings_id != hotel.id
        ):
            raise serializers.ValidationError(
                "No puedes modificar tareas de limpieza de otro hotel."
            )

        if room.floor.hotel_settings_id != hotel.id:
            raise serializers.ValidationError({
                "room": "La habitacion no pertenece al hotel seleccionado."
            })

        scheduled_for = attrs.get("scheduled_for", getattr(self.instance, "scheduled_for", None))
        completed_at = attrs.get("completed_at", getattr(self.instance, "completed_at", None))

        if scheduled_for and completed_at and completed_at.date() < scheduled_for:
            raise serializers.ValidationError({
                "completed_at": "La fecha de finalizacion no puede ser menor que la fecha programada."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        validated_data.pop("hotel_settings", None)
        return super().update(instance, validated_data)

class RoomAmenityMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ("id", "name", "icon")


class RoomTypeMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = ("id", "name", "capacity", "bed_count", "bed_type")


class RateMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rate
        fields = ("id", "name", "price")


class RoomPanelSerializer(serializers.ModelSerializer):
    room_type = RoomTypeMiniSerializer(read_only=True)
    amenities = RoomAmenityMiniSerializer(many=True, read_only=True)

    floor_name = serializers.CharField(source="floor.name", read_only=True)
    floor_number = serializers.IntegerField(source="floor.floor_number", read_only=True)

    status = serializers.CharField(source="status.code", read_only=True)
    status_label = serializers.CharField(source="status.name", read_only=True)

    rate = serializers.SerializerMethodField()
    active_maintenance = serializers.SerializerMethodField()
    current_guest = serializers.SerializerMethodField()
    active_reservation = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = (
            "id",
            "number",
            "status",
            "status_label",
            "notes",
            "floor_name",
            "floor_number",
            "room_type",
            "rate",
            "amenities",
            "current_guest",
            "active_reservation",
            "active_maintenance",
        )

    def get_rate(self, obj):
        if not obj.room_type:
            return None

        rate = obj.room_type.rates.filter(is_active=True).order_by("-created_at").first()
        if not rate:
            return None

        return RateMiniSerializer(rate).data

    def get_active_maintenance(self, obj):
        maintenance = obj.maintenance_orders.filter(
            status__code__in=["PENDIENTE", "EN_PROCESO"]
        ).order_by("-reported_at").first()

        if not maintenance:
            return None

        return {
            "id": maintenance.id,
            "title": maintenance.title,
            "description": maintenance.description,
            "priority": maintenance.priority_code,
            "priority_label": maintenance.get_priority_display(),
            "status": maintenance.status_code,
            "status_label": maintenance.get_status_display(),
            "reported_at": maintenance.reported_at,
            "estimated_completed_at": maintenance.estimated_completed_at,
            "completed_at": maintenance.completed_at,
        }

    def get_current_guest(self, obj):
        return None

    def get_active_reservation(self, obj):
        reservation_details = list(
            obj.reservation_details.select_related(
                "reservation",
                "reservation__status",
                "reservation__client",
            )
            .filter(reservation__real_check_out__isnull=True)
            .exclude(reservation__status__code__in=INACTIVE_RESERVATION_STATUS_CODES)
            .order_by("reservation__expected_check_in", "reservation__id")
        )

        if not reservation_details:
            return None

        detail = next(
            (item for item in reservation_details if is_reservation_in_house(item.reservation)),
            reservation_details[0],
        )
        reservation = detail.reservation

        return {
            "id": reservation.id,
            "reservation_room_id": detail.id,
            "status": reservation.status_code,
            "status_label": reservation.status.name if reservation.status else None,
            "expected_check_in": reservation.expected_check_in,
            "expected_check_out": reservation.expected_check_out,
            "real_check_in": reservation.real_check_in,
            "real_check_out": reservation.real_check_out,
            "client": {
                "id": reservation.client_id,
                "full_name": reservation.client.full_name if reservation.client_id else None,
                "document_number": (
                    reservation.client.document_number if reservation.client_id else None
                ),
            },
        }

