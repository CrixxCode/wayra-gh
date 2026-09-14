from django.db import transaction
from rest_framework import serializers

from accounts.email_utils import email_backend_delivers_to_inbox
from django.contrib.auth import get_user_model
from .models import (
    DemoRequest,
    DemoRequestFloor,
    DemoRequestFloorRoomGroup,
    DemoRequestRoomType,
)

User = get_user_model()

MAX_DEMO_ROOM_TYPES = 12
MAX_DEMO_FLOORS = 30
MAX_DEMO_ROOMS = 2000


class DemoRequestRoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemoRequestRoomType
        fields = [
            "id",
            "name",
            "capacity",
            "bed_count",
            "bed_type",
            "billing_mode",
            "base_price",
            "sort_order",
        ]
        read_only_fields = ["id"]

    def validate_name(self, value):
        name = str(value or "").strip()
        if len(name) < 2:
            raise serializers.ValidationError("El nombre del tipo de habitacion es obligatorio.")
        if not DemoRequestRoomType.build_code(name):
            raise serializers.ValidationError("El nombre debe tener al menos una letra o numero.")
        return name

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("La capacidad debe ser de al menos una persona.")
        return value

    def validate_bed_count(self, value):
        if value < 1:
            raise serializers.ValidationError("El tipo de habitacion debe tener al menos una cama.")
        return value

    def validate_base_price(self, value):
        if value < 0:
            raise serializers.ValidationError("La tarifa base no puede ser negativa.")
        return value


class DemoRequestFloorRoomGroupSerializer(serializers.ModelSerializer):
    # El tipo se referencia por posicion dentro de `room_types` y no por id, porque la
    # solicitud y su estructura se crean en la misma peticion: todavia no hay ids.
    room_type_index = serializers.IntegerField(min_value=0, write_only=True)
    room_type_name = serializers.CharField(source="room_type.name", read_only=True)

    class Meta:
        model = DemoRequestFloorRoomGroup
        fields = ["id", "room_type_index", "room_type_name", "quantity"]
        read_only_fields = ["id"]


class DemoRequestFloorSerializer(serializers.ModelSerializer):
    room_groups = DemoRequestFloorRoomGroupSerializer(many=True)
    total_rooms = serializers.IntegerField(read_only=True)

    class Meta:
        model = DemoRequestFloor
        fields = ["id", "floor_number", "name", "prefix", "room_groups", "total_rooms"]
        read_only_fields = ["id"]

    def validate_floor_number(self, value):
        if value < 1:
            raise serializers.ValidationError("El numero de piso debe ser mayor que cero.")
        return value

    def validate(self, attrs):
        attrs["name"] = str(attrs.get("name") or "").strip()
        attrs["prefix"] = str(attrs.get("prefix") or "").strip()

        if not attrs["name"]:
            attrs["name"] = f"Piso {attrs.get('floor_number') or 1}"
        if not attrs["prefix"]:
            attrs["prefix"] = str(attrs.get("floor_number") or 1)

        return attrs


class DemoRequestCreateSerializer(serializers.ModelSerializer):
    email_verification_token = serializers.UUIDField(write_only=True, required=True)
    email_verification_code = serializers.CharField(
        write_only=True,
        required=True,
        min_length=6,
        max_length=6,
        trim_whitespace=True,
    )
    room_types = DemoRequestRoomTypeSerializer(many=True)
    floors = DemoRequestFloorSerializer(many=True)

    class Meta:
        model = DemoRequest
        fields = [
            "id",
            "hotel_name",
            "hotel_type",
            "country",
            "state",
            "city",
            "address",
            "rooms",
            "website",
            "check_in_time",
            "check_out_time",
            "room_types",
            "floors",
            "requester_first_name",
            "requester_last_name",
            "requester_username",
            "requester_email",
            "requester_job_title",
            "requester_phone",
            "message",
            "email_verification_token",
            "email_verification_code",
            "status",
            "created_at",
        ]
        # `rooms` ya no lo escribe el solicitante: es la suma de la estructura declarada.
        # Dejarlo editable permitiria que el total contradijera a los pisos.
        read_only_fields = ["id", "rooms", "status", "created_at"]

    def validate_requester_username(self, value):
        username = str(value or "").strip()
        if len(username) < 3:
            raise serializers.ValidationError("El usuario debe tener al menos 3 caracteres.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Ya existe un usuario con este nombre de usuario.")
        return username

    def validate_requester_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email

    def validate(self, attrs):
        text_fields = [
            "hotel_name",
            "hotel_type",
            "country",
            "state",
            "city",
            "address",
            "website",
            "requester_first_name",
            "requester_last_name",
            "requester_job_title",
            "requester_phone",
            "message",
        ]

        for field in text_fields:
            if field in attrs:
                attrs[field] = str(attrs.get(field) or "").strip()

        attrs["requester_email"] = str(attrs.get("requester_email") or "").strip().lower()
        attrs["requester_username"] = str(attrs.get("requester_username") or "").strip()

        check_in_time = attrs.get("check_in_time")
        check_out_time = attrs.get("check_out_time")
        if check_in_time and check_out_time and check_in_time == check_out_time:
            raise serializers.ValidationError(
                {"check_out_time": "Check-out time must be different from check-in time."}
            )

        if "room_types" in attrs or "floors" in attrs:
            attrs["rooms"] = self.validate_structure(attrs)

        return attrs

    def validate_structure(self, attrs) -> int:
        """Revisa la estructura declarada y devuelve el total de habitaciones.

        El total sale de aqui y no del formulario: es lo unico que garantiza que
        `rooms` y los pisos digan lo mismo cuando la solicitud se convierta en hotel.
        """
        room_types = attrs.get("room_types") or []
        floors = attrs.get("floors") or []

        if not room_types:
            raise serializers.ValidationError(
                {"room_types": "Declara al menos un tipo de habitacion."}
            )
        if len(room_types) > MAX_DEMO_ROOM_TYPES:
            raise serializers.ValidationError(
                {"room_types": f"No puedes declarar mas de {MAX_DEMO_ROOM_TYPES} tipos de habitacion."}
            )
        if not floors:
            raise serializers.ValidationError({"floors": "Declara al menos un piso."})
        if len(floors) > MAX_DEMO_FLOORS:
            raise serializers.ValidationError(
                {"floors": f"No puedes declarar mas de {MAX_DEMO_FLOORS} pisos."}
            )

        seen_names = set()
        for room_type in room_types:
            key = str(room_type.get("name") or "").strip().lower()
            if key in seen_names:
                raise serializers.ValidationError(
                    {"room_types": f"El tipo de habitacion {room_type.get('name')} esta repetido."}
                )
            seen_names.add(key)

        seen_floor_numbers = set()
        seen_prefixes = set()
        total_rooms = 0

        for floor in floors:
            floor_number = floor.get("floor_number")
            if floor_number in seen_floor_numbers:
                raise serializers.ValidationError(
                    {"floors": f"El piso {floor_number} esta repetido."}
                )
            seen_floor_numbers.add(floor_number)

            prefix = str(floor.get("prefix") or "").strip()
            if prefix in seen_prefixes:
                # Dos pisos con el mismo prefijo generarian numeros de habitacion
                # identicos. La unicidad real es `(floor, number)`, asi que el choque
                # no saltaria en la base sino en la operacion diaria del hotel.
                raise serializers.ValidationError(
                    {"floors": f"El prefijo {prefix} esta repetido en dos pisos."}
                )
            seen_prefixes.add(prefix)

            floor_total = 0
            seen_indexes = set()

            for group in floor.get("room_groups") or []:
                index = group.get("room_type_index")
                if index is None or index >= len(room_types):
                    raise serializers.ValidationError(
                        {"floors": f"El piso {floor_number} referencia un tipo de habitacion inexistente."}
                    )
                if index in seen_indexes:
                    raise serializers.ValidationError(
                        {"floors": f"El piso {floor_number} repite un tipo de habitacion."}
                    )
                seen_indexes.add(index)
                floor_total += int(group.get("quantity") or 0)

            if floor_total < 1:
                raise serializers.ValidationError(
                    {"floors": f"El piso {floor_number} debe tener al menos una habitacion."}
                )

            total_rooms += floor_total

        if total_rooms > MAX_DEMO_ROOMS:
            raise serializers.ValidationError(
                {"floors": f"La estructura no puede superar {MAX_DEMO_ROOMS} habitaciones."}
            )

        return total_rooms

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("email_verification_token", None)
        validated_data.pop("email_verification_code", None)
        room_types_data = validated_data.pop("room_types", [])
        floors_data = validated_data.pop("floors", [])

        demo_request = super().create(validated_data)

        created_room_types = [
            DemoRequestRoomType.objects.create(
                demo_request=demo_request,
                **{**room_type, "sort_order": room_type.get("sort_order") or index},
            )
            for index, room_type in enumerate(room_types_data)
        ]

        for floor_data in floors_data:
            groups = floor_data.pop("room_groups", [])
            floor = DemoRequestFloor.objects.create(demo_request=demo_request, **floor_data)

            DemoRequestFloorRoomGroup.objects.bulk_create(
                [
                    DemoRequestFloorRoomGroup(
                        floor=floor,
                        room_type=created_room_types[group["room_type_index"]],
                        quantity=group.get("quantity") or 0,
                    )
                    for group in groups
                    if (group.get("quantity") or 0) > 0
                ]
            )

        return demo_request


class DemoRequestEmailVerificationRequestSerializer(serializers.Serializer):
    requester_email = serializers.EmailField()

    def validate_requester_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email


class DemoRequestSerializer(DemoRequestCreateSerializer):
    email_delivery_enabled = serializers.SerializerMethodField()
    email_delivery_error = serializers.SerializerMethodField()
    room_types = DemoRequestRoomTypeSerializer(many=True, read_only=True)
    floors = DemoRequestFloorSerializer(many=True, read_only=True)

    class Meta(DemoRequestCreateSerializer.Meta):
        fields = DemoRequestCreateSerializer.Meta.fields + [
            "converted_hotel_settings",
            "converted_user",
            "converted_at",
            "password_reset_sent",
            "email_delivery_enabled",
            "email_delivery_error",
            "source_ip",
            "user_agent",
            "updated_at",
        ]
        read_only_fields = fields

    def get_email_delivery_enabled(self, obj):
        return email_backend_delivers_to_inbox()

    def get_email_delivery_error(self, obj):
        return str(getattr(obj, "_email_delivery_error", "") or "")


class DemoRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemoRequest
        fields = ["status"]
