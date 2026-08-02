from django.db import models


class MasterData(models.Model):
    class Group(models.TextChoices):
        DOCUMENT_TYPE = "DOCUMENT_TYPE", "Document type"
        CLIENT_TYPE = "CLIENT_TYPE", "Client type"
        CLIENT_STATUS = "CLIENT_STATUS", "Client status"

        ROOM_TYPE = "ROOM_TYPE", "Room type"
        ROOM_STATUS = "ROOM_STATUS", "Room status"

        MAINTENANCE_PRIORITY = "MAINTENANCE_PRIORITY", "Maintenance priority"
        MAINTENANCE_STATUS = "MAINTENANCE_STATUS", "Maintenance status"

        CLEANING_TASK_TYPE = "CLEANING_TASK_TYPE", "Cleaning task type"
        CLEANING_STATUS = "CLEANING_STATUS", "Cleaning status"
        
        RESERVATION_STATUS = "RESERVATION_STATUS", "Reservation status"
        RESERVATION_ORIGIN = "RESERVATION_ORIGIN", "Reservation origin"
        MEAL_PLAN = "MEAL_PLAN", "Meal plan"
        PAYMENT_METHOD = "PAYMENT_METHOD", "Payment method"
        RESERVATION_DEPOSIT_STATUS = "RESERVATION_DEPOSIT_STATUS", "Reservation deposit status"

        RESERVATION_POLICY_TYPE = "RESERVATION_POLICY_TYPE", "Reservation policy type"
        RESERVATION_PENALTY_TYPE = "RESERVATION_PENALTY_TYPE", "Reservation penalty type"
        
        SERVICE_TYPE = "SERVICE_TYPE", "Service type"
        
        CHARGE_TYPE = "CHARGE_TYPE", "Charge type"
        
        INVOICE_STATUS = "INVOICE_STATUS", "Invoice status"
        
        CREDIT_NOTE_STATUS = "CREDIT_NOTE_STATUS", "Credit note status"
        PAYMENT_REFUND_STATUS = "PAYMENT_REFUND_STATUS", "Payment refund status"
        
        PROMOTION_DISCOUNT_TYPE = "PROMOTION_DISCOUNT_TYPE", "Promotion discount type"
        
        ITEM_TYPE = "ITEM_TYPE", "Item type"
        UNIT_MEASURE = "UNIT_MEASURE", "Unit measure"
        
        INVENTORY_MOVEMENT_TYPE = "INVENTORY_MOVEMENT_TYPE", "Inventory movement type"
        
        EXPENSE_CATEGORY = "EXPENSE_CATEGORY", "Expense category"

    group = models.CharField(max_length=60, choices=Group.choices, db_index=True)
    code = models.CharField(max_length=80)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "master_data"
        ordering = ["group", "sort_order", "name"]
        unique_together = ("group", "code")

    def save(self, *args, **kwargs):
        if self.code:
            self.code = str(self.code).strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.group}:{self.code} - {self.name}"


class RoomTypeManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(group=MasterData.Group.ROOM_TYPE)


class RoomType(MasterData):
    objects = RoomTypeManager()

    class Meta:
        proxy = True
        verbose_name = "Room type"
        verbose_name_plural = "Room types"

    @property
    def capacity(self):
        metadata = getattr(self, "metadata", None) or {}
        return int(metadata.get("capacity", 1))

    @property
    def bed_count(self):
        metadata = getattr(self, "metadata", None) or {}
        return int(metadata.get("bed_count", 1))

    @property
    def bed_type(self):
        metadata = getattr(self, "metadata", None) or {}
        return metadata.get("bed_type")
