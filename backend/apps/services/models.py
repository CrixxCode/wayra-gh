from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData


class Service(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="services",
    )
    service_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="services_by_type",
        limit_choices_to={"group": MasterData.Group.SERVICE_TYPE},
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    base_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "service"
        ordering = ["-id"]
        unique_together = ("hotel_settings", "name")

    @property
    def service_type_code(self):
        return self.service_type.code if self.service_type else None

    def clean(self):
        errors = {}

        if self.base_price is not None and self.base_price < 0:
            errors["base_price"] = "Base price cannot be negative."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} - {self.hotel_settings.hotel_name}"