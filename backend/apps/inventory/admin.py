from django.contrib import admin

from apps.inventory.models import InventoryMovement, InventoryRestockAlert, Item, RoomInventory


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "name",
        "sku",
        "item_type",
        "unit_measure",
        "stock",
        "minimum_stock",
        "maximum_stock",
        "cost_price",
        "sale_price",
        "is_active",
    )
    search_fields = ("name", "sku", "description")
    list_filter = ("hotel_settings", "item_type", "unit_measure", "is_active")
    
@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "item",
        "movement_type",
        "quantity",
        "previous_stock",
        "new_stock",
        "movement_date",
        "is_active",
    )
    search_fields = ("item__name", "reference", "notes")
    list_filter = ("movement_type", "is_active", "movement_date")
    
@admin.register(RoomInventory)
class RoomInventoryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "room",
        "item",
        "quantity",
        "minimum_quantity",
        "is_active",
        "updated_at",
    )
    search_fields = ("room__number", "item__name", "notes")
    list_filter = ("is_active",)


@admin.register(InventoryRestockAlert)
class InventoryRestockAlertAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "item",
        "status",
        "current_stock",
        "minimum_stock",
        "suggested_quantity",
        "reference",
        "is_active",
        "created_at",
        "resolved_at",
    )
    search_fields = ("item__name", "reference", "notes")
    list_filter = ("status", "is_active", "created_at", "resolved_at")
