from django.contrib import admin
from .models import RoomType, Rate, Amenity, Room, RoomPhoto, MaintenanceOrder, CleaningTask


class RoomPhotoInline(admin.TabularInline):
    model = RoomPhoto
    extra = 0
    readonly_fields = ("created_at",)

@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "capacity", "bed_count", "bed_type", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")

@admin.register(Rate)
class RateAdmin(admin.ModelAdmin):
    list_display = ("id","name", "room_type", "price", "start_date", "end_date", "is_active")
    list_filter = ("is_active", "room_type")
    search_fields = ("name", "room_type__name", "room_type__code")

@admin.register(Amenity)
class AmenityAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "icon", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("id", "number", "room_type", "rate", "floor", "status")
    list_filter = ("status", "room_type", "rate", "floor")
    search_fields = ("number", "room_type__name", "rate__name", "status__code", "status__name")
    inlines = [RoomPhotoInline]


@admin.register(RoomPhoto)
class RoomPhotoAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "sort_order", "created_at")
    list_filter = ("room__floor__hotel_settings", "room__floor")
    search_fields = ("room__number", "room__floor__hotel_settings__hotel_name", "alt_text")

@admin.register(MaintenanceOrder)
class MaintenanceOrderAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "room",
        "title",
        "priority",
        "status",
        "reported_at",
        "estimated_completed_at",
        "completed_at",
    )
    list_filter = ("status", "priority", "room__floor")
    search_fields = ("title", "description", "room__number", "priority__code", "status__code")

@admin.register(CleaningTask)
class CleaningTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "task_type", "status", "priority", "scheduled_for")
    list_filter = ("status", "task_type", "priority", "room__floor")
    search_fields = (
        "room__number",
        "notes",
        "task_type__code",
        "status__code",
        "priority__code",
    )

