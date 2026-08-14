from rest_framework import serializers

from accounts.tenancy import TenantSerializerMixin

from .models import HotelFloor, HotelSettings, PaymentMethod, ReservationPolicy


class HotelFloorSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
    )

    # Display range for frontend cards.
    range_display = serializers.SerializerMethodField()

    class Meta:
        model = HotelFloor
        fields = (
            "id",
            "hotel_settings",
            "floor_number",
            "name",
            "prefix",
            "room_count",
            "range_display",
        )
        validators = []

    def get_range_display(self, obj):
        if obj.room_count <= 0:
            return ""

        start = f"{obj.prefix}01"
        end = f"{obj.prefix}{str(obj.room_count).zfill(2)}"
        return f"{start} - {end}"

    def validate_room_count(self, value):
        if value < 1:
            raise serializers.ValidationError("Room count must be greater than 0.")
        return value

    def validate_floor_number(self, value):
        if value < 1:
            raise serializers.ValidationError("Floor number must be greater than 0.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        hotel = self.require_target_tenant(attrs)
        floor_number = attrs.get("floor_number", getattr(self.instance, "floor_number", None))

        qs = HotelFloor.objects.filter(hotel_settings=hotel)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if floor_number and qs.filter(floor_number=floor_number).exists():
            raise serializers.ValidationError(
                {"floor_number": "Ya existe un piso con este numero en este hotel."}
            )
        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)


class HotelSettingsSerializer(serializers.ModelSerializer):
    floors = HotelFloorSerializer(many=True, read_only=True)

    total_floors = serializers.SerializerMethodField()
    total_rooms = serializers.SerializerMethodField()
    average_rooms_per_floor = serializers.SerializerMethodField()

    class Meta:
        model = HotelSettings
        fields = (
            "id",
            "hotel_name",
            "legal_name",
            "slogan",
            "description",
            "logo",
            "stars",
            "facebook",
            "instagram",
            "twitter_x",
            "address",
            "city",
            "state",
            "country",
            "postal_code",
            "primary_phone",
            "secondary_phone",
            "general_email",
            "reservations_email",
            "website",
            "check_in_time",
            "check_out_time",
            "max_guests_per_room",
            "currency",
            "tax_rate",
            "system_language",
            "timezone",
            "is_active",
            "created_at",
            "updated_at",
            "floors",
            "total_floors",
            "total_rooms",
            "average_rooms_per_floor",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "total_floors",
            "total_rooms",
            "average_rooms_per_floor",
        )

    def get_total_floors(self, obj):
        return obj.floors.count()

    def get_total_rooms(self, obj):
        return sum(floor.room_count for floor in obj.floors.all())

    def get_average_rooms_per_floor(self, obj):
        floors_count = obj.floors.count()
        if floors_count == 0:
            return 0

        total_rooms = sum(floor.room_count for floor in obj.floors.all())
        return round(total_rooms / floors_count, 1)

    def validate_stars(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Stars must be between 1 and 5.")
        return value

    def validate_tax_rate(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Tax rate must be between 0 and 100.")
        return value

    def validate_max_guests_per_room(self, value):
        if value < 1:
            raise serializers.ValidationError("Max guests per room must be greater than 0.")
        return value

    def validate(self, attrs):
        check_in_time = attrs.get("check_in_time")
        check_out_time = attrs.get("check_out_time")

        if check_in_time and check_out_time and check_in_time == check_out_time:
            raise serializers.ValidationError(
                {"check_out_time": "Check-out time must be different from check-in time."}
            )

        return attrs


class AlliedRoomRateSerializer(serializers.Serializer):
    id = serializers.CharField()
    roomType = serializers.CharField()
    rateName = serializers.CharField()
    description = serializers.CharField(allow_blank=True)
    maxGuests = serializers.IntegerField()
    nightlyRate = serializers.IntegerField()


class AlliedHotelSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    type = serializers.CharField()
    city = serializers.CharField(allow_blank=True)
    department = serializers.CharField(allow_blank=True)
    country = serializers.CharField(allow_blank=True)
    description = serializers.CharField(allow_blank=True)
    highlights = serializers.ListField(child=serializers.CharField())
    rooms = serializers.IntegerField()
    maxGuestsPerRoom = serializers.IntegerField()
    nightlyRateFrom = serializers.IntegerField()
    roomRates = AlliedRoomRateSerializer(many=True)
    contact = serializers.CharField(allow_blank=True)


class ReservationPolicySerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
    )

    policy_type_name = serializers.CharField(source="policy_type.name", read_only=True)
    policy_type_code = serializers.CharField(source="policy_type.code", read_only=True)

    penalty_type_name = serializers.CharField(source="penalty_type.name", read_only=True)
    penalty_type_code = serializers.CharField(source="penalty_type.code", read_only=True)

    hotel_name = serializers.CharField(source="hotel_settings.hotel_name", read_only=True)

    class Meta:
        model = ReservationPolicy
        fields = [
            "id",
            "hotel_settings",
            "hotel_name",
            "policy_type",
            "policy_type_name",
            "policy_type_code",
            "penalty_type",
            "penalty_type_name",
            "penalty_type_code",
            "name",
            "description",
            "penalty_value",
            "hours_before_checkin",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []

    def validate_penalty_value(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Penalty value cannot be negative.")
        return value

    def validate_hours_before_checkin(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Hours before check-in cannot be negative.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        hotel = self.require_target_tenant(attrs)

        penalty_type = attrs.get("penalty_type", getattr(self.instance, "penalty_type", None))
        penalty_value = attrs.get("penalty_value", getattr(self.instance, "penalty_value", None))
        name = attrs.get("name", getattr(self.instance, "name", None))

        qs = ReservationPolicy.objects.filter(hotel_settings=hotel)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if name and qs.filter(name=name.strip()).exists():
            raise serializers.ValidationError(
                {"name": "Ya existe una politica con este nombre en este hotel."}
            )

        if penalty_type:
            penalty_code = str(penalty_type.code or "").strip().upper()

            if penalty_code == "PERCENTAGE":
                if penalty_value is None:
                    raise serializers.ValidationError(
                        {"penalty_value": "Penalty value is required for percentage penalties."}
                    )
                if penalty_value > 100:
                    raise serializers.ValidationError(
                        {"penalty_value": "Percentage penalty cannot be greater than 100."}
                    )

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)


class PaymentMethodSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    """Metodo de pago propio del hotel (ver AGENTS.md 5.16).

    El cliente solo manda nombre, tipo y —si es transferencia— numero de cuenta. El
    `code` se deriva del nombre en el modelo y viaja de solo lectura, porque varias
    pantallas de facturacion lo usan para elegir icono y etiqueta.
    """

    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
    )
    code = serializers.CharField(read_only=True)
    method_type_label = serializers.CharField(source="get_method_type_display", read_only=True)

    class Meta:
        model = PaymentMethod
        fields = (
            "id",
            "hotel_settings",
            "name",
            "method_type",
            "method_type_label",
            "account_number",
            "code",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "code", "created_at", "updated_at")
        # DRF deduce un `UniqueTogetherValidator` de la UniqueConstraint del modelo, y
        # ese validador vuelve **obligatorio** `hotel_settings` en el cuerpo. Aqui el
        # hotel no lo manda el cliente: lo resuelve `TenantSerializerMixin`. El duplicado
        # se valida abajo, ya contra el hotel resuelto.
        validators = []

    def validate_name(self, value):
        name = str(value or "").strip()
        if not name:
            raise serializers.ValidationError("El nombre del metodo de pago es obligatorio.")
        if not PaymentMethod.build_code(name):
            raise serializers.ValidationError("El nombre debe tener al menos una letra o numero.")
        return name

    def validate(self, attrs):
        hotel = self.require_target_tenant(attrs)

        name = attrs.get("name", getattr(self.instance, "name", None))
        method_type = attrs.get(
            "method_type",
            getattr(self.instance, "method_type", PaymentMethod.MethodType.CASH),
        )
        account_number = attrs.get(
            "account_number", getattr(self.instance, "account_number", None)
        )

        if method_type == PaymentMethod.MethodType.TRANSFER:
            if not str(account_number or "").strip():
                raise serializers.ValidationError(
                    {"account_number": "Una transferencia necesita numero de cuenta."}
                )
        else:
            # En efectivo el numero de cuenta no aplica: se descarta si venia.
            attrs["account_number"] = None

        # Dos metodos con el mismo nombre generarian el mismo codigo.
        duplicates = PaymentMethod.objects.filter(
            hotel_settings=hotel, code=PaymentMethod.build_code(name)
        )
        if self.instance:
            duplicates = duplicates.exclude(pk=self.instance.pk)

        if duplicates.exists():
            raise serializers.ValidationError(
                {"name": "Ya existe un metodo de pago con ese nombre en este hotel."}
            )

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)
