from django.contrib import admin
from .models import HotelSettings, HotelFloor, HotelPhoto, PaymentMethod, ReservationPolicy


class HotelFloorInline(admin.TabularInline):
    model = HotelFloor
    extra = 1


class HotelPhotoInline(admin.TabularInline):
    model = HotelPhoto
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(HotelSettings)
class HotelSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "hotel_name",
        "reservation_code_prefix",
        "stars",
        "city",
        "country",
        "primary_phone",
        "general_email",
        "is_active",
        "currency",
        "tax_rate",
        "updated_at",
    )
    list_filter = ("is_active", "country", "city")
    readonly_fields = ("reservation_code_prefix",)
    inlines = [HotelFloorInline, HotelPhotoInline]


@admin.register(HotelPhoto)
class HotelPhotoAdmin(admin.ModelAdmin):
    list_display = ("id", "hotel_settings", "sort_order", "created_at")
    list_filter = ("hotel_settings",)
    search_fields = ("hotel_settings__hotel_name", "alt_text")


@admin.register(HotelFloor)
class HotelFloorAdmin(admin.ModelAdmin):
    list_display = (
        "hotel_settings",
        "floor_number",
        "name",
        "prefix",
        "room_count",
    )
    list_filter = ("hotel_settings",)
    search_fields = ("name", "prefix")
    
@admin.register(ReservationPolicy)
class ReservationPolicyAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "name",
        "policy_type",
        "penalty_type",
        "penalty_value",
        "hours_before_checkin",
        "is_active",
        "created_at",
    )
    search_fields = ("name", "description")
    list_filter = ("is_active", "policy_type", "penalty_type", "hotel_settings")

@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ("name", "method_type", "account_number", "hotel_settings", "is_active")
    list_filter = ("hotel_settings", "method_type", "is_active")
    # `autocomplete_fields` de otros admins (depositos, egresos) exige esta busqueda.
    search_fields = ("name", "code", "hotel_settings__hotel_name")
    ordering = ("hotel_settings", "name")
    readonly_fields = ("code",)
