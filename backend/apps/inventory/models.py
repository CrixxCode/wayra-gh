from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData

from apps.rooms.models import Room

class Item(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="items_by_type",
        limit_choices_to={"group": MasterData.Group.ITEM_TYPE},
    )
    unit_measure = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="items_by_unit_measure",
        limit_choices_to={"group": MasterData.Group.UNIT_MEASURE},
    )

    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=80, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    stock = models.PositiveIntegerField(default=0)
    minimum_stock = models.PositiveIntegerField(default=0)
    maximum_stock = models.PositiveIntegerField(default=0)

    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "item"
        ordering = ["-id"]
        unique_together = (
            ("hotel_settings", "name"),
            ("hotel_settings", "sku"),
        )

    @property
    def item_type_code(self):
        return self.item_type.code if self.item_type else None

    @property
    def unit_measure_code(self):
        return self.unit_measure.code if self.unit_measure else None

    def clean(self):
        errors = {}

        if self.stock is not None and self.stock < 0:
            errors["stock"] = "Stock cannot be negative."

        if self.minimum_stock is not None and self.minimum_stock < 0:
            errors["minimum_stock"] = "Minimum stock cannot be negative."

        if self.maximum_stock is not None and self.maximum_stock < 0:
            errors["maximum_stock"] = "Maximum stock cannot be negative."

        if self.maximum_stock and self.minimum_stock and self.minimum_stock > self.maximum_stock:
            errors["minimum_stock"] = "Minimum stock cannot be greater than maximum stock."

        if self.maximum_stock and self.stock and self.stock > self.maximum_stock:
            errors["stock"] = "Stock cannot be greater than maximum stock."

        if self.cost_price is not None and self.cost_price < 0:
            errors["cost_price"] = "Cost price cannot be negative."

        if self.sale_price is not None and self.sale_price < 0:
            errors["sale_price"] = "Sale price cannot be negative."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} - {self.hotel_settings.hotel_name}"

class InventoryMovement(models.Model):
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name="inventory_movements",
    )
    movement_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="inventory_movements_by_type",
        limit_choices_to={"group": MasterData.Group.INVENTORY_MOVEMENT_TYPE},
    )

    quantity = models.PositiveIntegerField()
    previous_stock = models.PositiveIntegerField(default=0)
    new_stock = models.PositiveIntegerField(default=0)

    reference = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    movement_date = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_movement"
        ordering = ["-id"]

    @property
    def movement_type_code(self):
        return self.movement_type.code if self.movement_type else None

    def clean(self):
        errors = {}

        if self.quantity is not None and self.quantity < 1:
            errors["quantity"] = "Quantity must be at least 1."

        if self.previous_stock is not None and self.previous_stock < 0:
            errors["previous_stock"] = "Previous stock cannot be negative."

        if self.new_stock is not None and self.new_stock < 0:
            errors["new_stock"] = "New stock cannot be negative."

        if self.item and self.movement_type:
            movement_code = str(self.movement_type.code or "").strip().upper()

            if movement_code in ["OUT", "LOSS"] and self.quantity > self.item.stock:
                errors["quantity"] = "Quantity cannot be greater than current stock."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        movement_code = str(self.movement_type.code or "").strip().upper() if self.movement_type else ""

        current_stock = self.item.stock or 0
        self.previous_stock = current_stock

        if movement_code == "IN":
            self.new_stock = current_stock + self.quantity
        elif movement_code in ["OUT", "LOSS"]:
            self.new_stock = current_stock - self.quantity
        elif movement_code == "ADJUSTMENT":
            self.new_stock = self.quantity
        elif movement_code == "TRANSFER":
            self.new_stock = current_stock
        else:
            self.new_stock = current_stock

        if self.new_stock < 0:
            raise ValidationError({"new_stock": "New stock cannot be negative."})

        super().save(*args, **kwargs)

        self.item.stock = self.new_stock
        self.item.save(update_fields=["stock", "updated_at"])

    def __str__(self):
        return f"Movement #{self.id} - {self.item.name}"

class RoomInventory(models.Model):
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="room_inventory_items",
    )
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name="room_inventory_items",
    )

    quantity = models.PositiveIntegerField(default=0)
    minimum_quantity = models.PositiveIntegerField(default=0)

    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "room_inventory"
        ordering = ["-id"]
        unique_together = ("room", "item")

    def clean(self):
        errors = {}

        if self.quantity is not None and self.quantity < 0:
            errors["quantity"] = "Quantity cannot be negative."

        if self.minimum_quantity is not None and self.minimum_quantity < 0:
            errors["minimum_quantity"] = "Minimum quantity cannot be negative."

        if self.room and self.item:
            room_hotel_settings_id = getattr(
                getattr(self.room, "floor", None),
                "hotel_settings_id",
                None,
            )
            item_hotel_settings_id = getattr(self.item, "hotel_settings_id", None)

            if room_hotel_settings_id and item_hotel_settings_id:
                if room_hotel_settings_id != item_hotel_settings_id:
                    errors["item"] = "The item must belong to the same hotel as the room."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.room} - {self.item.name}"


class InventoryRestockAlert(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        RESOLVED = "RESOLVED", "Resuelta"

    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name="restock_alerts",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    reference = models.CharField(max_length=120, db_index=True)
    current_stock = models.PositiveIntegerField(default=0)
    minimum_stock = models.PositiveIntegerField(default=0)
    suggested_quantity = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True, null=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_restock_alert"
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["item", "status", "is_active"]),
        ]

    def __str__(self):
        return f"Restock alert #{self.id} - {self.item.name}"
