from django.contrib import admin

from .models import DemoRequest


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = (
        "hotel_name",
        "hotel_type",
        "city",
        "requester_email",
        "requester_username",
        "status",
        "converted_hotel_settings",
        "converted_user",
        "created_at",
    )
    list_filter = ("status", "hotel_type", "city", "created_at")
    search_fields = (
        "hotel_name",
        "requester_first_name",
        "requester_last_name",
        "requester_email",
        "requester_username",
    )
    readonly_fields = (
        "converted_hotel_settings",
        "converted_user",
        "converted_at",
        "password_reset_sent",
        "source_ip",
        "user_agent",
        "created_at",
        "updated_at",
    )
