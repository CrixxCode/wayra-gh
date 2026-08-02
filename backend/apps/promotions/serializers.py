from rest_framework import serializers

from apps.promotions.models import Promotion
from accounts.tenancy import TenantSerializerMixin, is_effective_global_admin
from apps.hotel_settings.models import HotelSettings
from apps.packages.models import Package
from apps.services.models import Service


class PromotionSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    service = serializers.PrimaryKeyRelatedField(
        queryset=Service.objects.all(),
        required=False,
        allow_null=True,
    )
    package = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(),
        required=False,
        allow_null=True,
    )

    hotel_name = serializers.CharField(source="hotel_settings.hotel_name", read_only=True)
    discount_type_name = serializers.CharField(source="discount_type.name", read_only=True)
    discount_type_code = serializers.CharField(source="discount_type.code", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    package_name = serializers.CharField(source="package.name", read_only=True)

    class Meta:
        model = Promotion
        fields = [
            "id",
            "hotel_settings",
            "hotel_name",
            "discount_type",
            "discount_type_name",
            "discount_type_code",
            "service",
            "service_name",
            "package",
            "package_name",
            "name",
            "code",
            "description",
            "discount_value",
            "start_date",
            "end_date",
            "is_active",
            "is_public",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ("id", "created_at", "updated_at")
        validators = []

    def get_fields(self):
        fields = super().get_fields()
        user = self.get_actor()

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["service"].queryset = Service.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["package"].queryset = Package.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_discount_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("Discount value must be greater than 0.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        hotel = self.require_target_tenant(attrs)
        name = attrs.get("name", getattr(self.instance, "name", None))
        code = attrs.get("code", getattr(self.instance, "code", None))
        discount_type = attrs.get("discount_type", getattr(self.instance, "discount_type", None))
        service = attrs.get("service", getattr(self.instance, "service", None))
        package = attrs.get("package", getattr(self.instance, "package", None))
        discount_value = attrs.get("discount_value", getattr(self.instance, "discount_value", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))

        qs = Promotion.objects.filter(hotel_settings=hotel)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if name and qs.filter(name=name.strip()).exists():
            raise serializers.ValidationError(
                {"name": "Ya existe una promocion con este nombre en este hotel."}
            )

        if code and qs.filter(code=code).exists():
            raise serializers.ValidationError(
                {"code": "Ya existe una promocion con este codigo en este hotel."}
            )

        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be earlier than start date."}
            )

        if service and package:
            raise serializers.ValidationError(
                {"package": "A promotion should reference either a service or a package, not both."}
            )

        if discount_type:
            discount_code = str(discount_type.code or "").strip().upper()
            if discount_code == "PERCENTAGE" and discount_value is not None and discount_value > 100:
                raise serializers.ValidationError(
                    {"discount_value": "Percentage discount cannot be greater than 100."}
                )

        if service and service.hotel_settings_id != hotel.id:
            raise serializers.ValidationError(
                {"service": "The service must belong to the same hotel as the promotion."}
            )

        if package and package.hotel_settings_id != hotel.id:
            raise serializers.ValidationError(
                {"package": "The package must belong to the same hotel as the promotion."}
            )

        return attrs

    def create(self, validated_data):
        self.assign_target_tenant(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.assign_target_tenant(validated_data)
        return super().update(instance, validated_data)
