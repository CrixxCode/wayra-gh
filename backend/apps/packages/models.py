from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelSettings
from apps.rooms.models import RoomType
from apps.services.models import Service


class Package(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="packages",
    )
    room_type = models.ForeignKey(
        RoomType,
        on_delete=models.PROTECT,
        related_name="packages_by_room_type",
        blank=True,
        null=True,
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    base_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "package"
        ordering = ["-id"]
        unique_together = ("hotel_settings", "name")

    @property
    def room_type_code(self):
        return self.room_type.code if self.room_type else None

    def clean(self):
        errors = {}

        if self.base_price is not None and self.base_price < 0:
            errors["base_price"] = "Base price cannot be negative."

        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = "End date cannot be earlier than start date."

        if self.room_type and self.room_type.hotel_settings_id != self.hotel_settings_id:
            errors["room_type"] = "The room type must belong to the same hotel as the package."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} - {self.hotel_settings.hotel_name}"


class PackageService(models.Model):
    package = models.ForeignKey(
        Package,
        on_delete=models.CASCADE,
        related_name="package_services",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="service_packages",
    )
    quantity = models.PositiveIntegerField(default=1)
    is_included = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "package_service"
        ordering = ["id"]
        unique_together = ("package", "service")

    def clean(self):
        errors = {}

        if self.quantity < 1:
            errors["quantity"] = "Quantity must be at least 1."

        if self.package and self.service:
            if self.package.hotel_settings_id != self.service.hotel_settings_id:
                errors["service"] = "The service must belong to the same hotel as the package."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.package.name} - {self.service.name}"
