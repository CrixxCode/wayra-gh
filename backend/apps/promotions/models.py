from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData
from apps.packages.models import Package
from apps.services.models import Service


class Promotion(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="promotions",
    )
    discount_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="promotions_by_discount_type",
        limit_choices_to={"group": MasterData.Group.PROMOTION_DISCOUNT_TYPE},
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.SET_NULL,
        related_name="promotions",
        blank=True,
        null=True,
    )
    package = models.ForeignKey(
        Package,
        on_delete=models.SET_NULL,
        related_name="promotions",
        blank=True,
        null=True,
    )

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    start_date = models.DateField()
    end_date = models.DateField()

    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "promotion"
        ordering = ["-id"]
        unique_together = (
            ("hotel_settings", "name"),
            ("hotel_settings", "code"),
        )

    @property
    def discount_type_code(self):
        return self.discount_type.code if self.discount_type else None

    def clean(self):
        errors = {}

        if self.discount_value is not None and self.discount_value <= 0:
            errors["discount_value"] = "Discount value must be greater than 0."

        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = "End date cannot be earlier than start date."

        if self.service and self.package:
            errors["package"] = "A promotion should reference either a service or a package, not both."

        if self.discount_type:
            discount_code = (self.discount_type.code or "").strip().upper()

            if discount_code == "PERCENTAGE" and self.discount_value > 100:
                errors["discount_value"] = "Percentage discount cannot be greater than 100."

        if self.service and self.hotel_settings_id != self.service.hotel_settings_id:
            errors["service"] = "The service must belong to the same hotel as the promotion."

        if self.package and self.hotel_settings_id != self.package.hotel_settings_id:
            errors["package"] = "The package must belong to the same hotel as the promotion."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} - {self.hotel_settings.hotel_name}"