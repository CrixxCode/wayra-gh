from rest_framework import serializers

from apps.services.models import Service

from accounts.tenancy import TenantSerializerMixin
from apps.hotel_settings.models import HotelSettings


class ServiceSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    hotel_name = serializers.CharField(source="hotel_settings.hotel_name", read_only=True)
    service_type_name = serializers.CharField(source="service_type.name", read_only=True)
    service_type_code = serializers.CharField(source="service_type.code", read_only=True)

    class Meta:
        model = Service
        fields = [
            "id",
            "hotel_settings",
            "hotel_name",
            "service_type",
            "service_type_name",
            "service_type_code",
            "name",
            "description",
            "base_price",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []

    def validate_base_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Base price cannot be negative.")
        return value

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El nombre del servicio es obligatorio.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        hotel = self.require_target_tenant(attrs)
        name = attrs.get("name", getattr(self.instance, "name", None))

        qs = Service.objects.filter(hotel_settings=hotel)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if name and qs.filter(name=name.strip()).exists():
            raise serializers.ValidationError({
                "name": "Ya existe un servicio con este nombre en este hotel."
            })

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)
