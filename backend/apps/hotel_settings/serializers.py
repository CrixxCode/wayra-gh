from rest_framework import serializers

from accounts.tenancy import TenantSerializerMixin

from .models import HotelFloor, HotelSettings, ReservationPolicy


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
