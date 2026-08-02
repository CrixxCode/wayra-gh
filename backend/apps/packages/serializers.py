from rest_framework import serializers

from apps.packages.models import Package, PackageService
from apps.services.models import Service
from accounts.tenancy import TenantSerializerMixin, is_effective_global_admin
from apps.hotel_settings.models import HotelSettings
from apps.rooms.models import RoomType

class PackageServiceSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source="service.name", read_only=True)
    service_type_name = serializers.CharField(source="service.service_type.name", read_only=True)

    class Meta:
        model = PackageService
        fields = [
            "id",
            "package",
            "service",
            "service_name",
            "service_type_name",
            "quantity",
            "is_included",
            "created_at",
        ]
        read_only_fields = ("id", "created_at")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["package"].queryset = Package.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["service"].queryset = Service.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        user = getattr(request, "user", None)

        package = attrs.get("package", getattr(self.instance, "package", None))
        service = attrs.get("service", getattr(self.instance, "service", None))

        if package is None:
            raise serializers.ValidationError({"package": "El paquete es obligatorio."})

        if service is None:
            raise serializers.ValidationError({"service": "El servicio es obligatorio."})

        if package.hotel_settings_id != service.hotel_settings_id:
            raise serializers.ValidationError(
                {"service": "The service must belong to the same hotel as the package."}
            )

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError(
                    {"package": "El usuario autenticado no tiene un hotel asignado."}
                )

            if package.hotel_settings_id != user.hotel_settings_id:
                raise serializers.ValidationError(
                    {"package": "El paquete no pertenece al hotel del usuario autenticado."}
                )

            if service.hotel_settings_id != user.hotel_settings_id:
                raise serializers.ValidationError(
                    {"service": "El servicio no pertenece al hotel del usuario autenticado."}
                )

        return attrs


class PackageSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    room_type = serializers.PrimaryKeyRelatedField(
        queryset=RoomType.objects.all(),
        required=False,
        allow_null=True,
    )

    hotel_name = serializers.CharField(source="hotel_settings.hotel_name", read_only=True)
    room_type_name = serializers.CharField(source="room_type.name", read_only=True)
    room_type_code = serializers.CharField(source="room_type.code", read_only=True)
    package_services = PackageServiceSerializer(many=True, read_only=True)

    class Meta:
        model = Package
        fields = [
            "id",
            "hotel_settings",
            "hotel_name",
            "room_type",
            "room_type_name",
            "room_type_code",
            "name",
            "description",
            "base_price",
            "is_active",
            "start_date",
            "end_date",
            "package_services",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []

    def get_fields(self):
        fields = super().get_fields()
        user = self.get_actor()

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["room_type"].queryset = RoomType.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_base_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Base price cannot be negative.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        hotel = self.require_target_tenant(attrs)
        name = attrs.get("name", getattr(self.instance, "name", None))
        room_type = attrs.get("room_type", getattr(self.instance, "room_type", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        qs = Package.objects.filter(hotel_settings=hotel)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if name and qs.filter(name=name.strip()).exists():
            raise serializers.ValidationError(
                {"name": "Ya existe un paquete con este nombre en este hotel."}
            )

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be earlier than start date."}
            )

        if room_type and room_type.hotel_settings_id != hotel.id:
            raise serializers.ValidationError(
                {"room_type": "The room type must belong to the same hotel as the package."}
            )

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)
