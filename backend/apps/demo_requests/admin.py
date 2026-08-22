from django.contrib import admin

from .models import DemoRequest, DemoRequestEmailVerification


@admin.register(DemoRequest)
class DemoRequestAdmin(admin.ModelAdmin):
    list_display = (
        "hotel_name",
        "hotel_type",
        "country",
        "state",
        "city",
        "requester_email",
        "requester_username",
        "status",
        "converted_hotel_settings",
        "converted_user",
        "created_at",
    )
    list_filter = ("status", "hotel_type", "country", "state", "city", "created_at")
    search_fields = (
        "hotel_name",
        "country",
        "state",
        "city",
        "address",
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


@admin.register(DemoRequestEmailVerification)
class DemoRequestEmailVerificationAdmin(admin.ModelAdmin):
    list_display = ("email", "expires_at", "attempts", "used_at", "created_at")
    list_filter = ("used_at", "expires_at", "created_at")
    search_fields = ("email", "token")
    readonly_fields = (
        "email",
        "token",
        "code_hash",
        "expires_at",
        "attempts",
        "used_at",
        "source_ip",
        "user_agent",
        "created_at",
        "updated_at",
    )
