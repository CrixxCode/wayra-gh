from django.contrib import admin

from apps.promotions.models import Promotion


@admin.register(Promotion)
class PromotionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "name",
        "code",
        "discount_type",
        "discount_value",
        "service",
        "package",
        "start_date",
        "end_date",
        "is_active",
        "is_public",
    )
    search_fields = ("name", "code", "description")
    list_filter = (
        "hotel_settings",
        "discount_type",
        "is_active",
        "is_public",
        "start_date",
        "end_date",
    )