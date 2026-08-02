from django.contrib import admin

from apps.services.models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "name",
        "service_type",
        "base_price",
        "is_active",
        "created_at",
    )
    search_fields = ("name", "description")
    list_filter = ("hotel_settings", "service_type", "is_active")