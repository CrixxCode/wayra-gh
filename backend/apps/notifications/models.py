from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models

from accounts.tenancy import is_effective_global_admin


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        RESERVATION = "RESERVATION", "Reservation"
        ROOM = "ROOM", "Room"
        CLEANING = "CLEANING", "Cleaning"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        PAYMENT = "PAYMENT", "Payment"
        INVOICE = "INVOICE", "Invoice"
        INVENTORY = "INVENTORY", "Inventory"
        USER = "USER", "User"
        FINANCE = "FINANCE", "Finance"
        REPORT = "REPORT", "Report"
        SYSTEM = "SYSTEM", "System"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=180)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        db_index=True,
    )
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )
    is_read = models.BooleanField(default=False, db_index=True)
    action_url = models.CharField(max_length=255, blank=True, null=True)

    related_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    related_object_id = models.CharField(max_length=64, blank=True, null=True)
    related_object = GenericForeignKey("related_content_type", "related_object_id")

    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "notification"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["user", "is_read", "created_at"],
                name="notif_user_read_created_idx",
            ),
            models.Index(
                fields=["hotel_settings", "notification_type", "priority"],
                name="notif_hotel_type_prio_idx",
            ),
        ]

    def clean(self):
        user = getattr(self, "user", None)
        hotel_settings = getattr(self, "hotel_settings", None)

        if not user:
            return

        if is_effective_global_admin(user):
            return

        user_hotel_id = getattr(user, "hotel_settings_id", None)
        if user_hotel_id is None:
            raise ValidationError(
                {"user": "Non-superuser notifications require a user linked to a hotel."}
            )

        if hotel_settings is None:
            raise ValidationError(
                {"hotel_settings": "Notifications for non-superusers must include hotel_settings."}
            )

        if hotel_settings.id != user_hotel_id:
            raise ValidationError(
                {"hotel_settings": "Notification tenant must match user tenant."}
            )

    def __str__(self):
        return f"Notification #{self.id} -> {self.user_id} ({self.notification_type})"
