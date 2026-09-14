from django.contrib import admin

from .models import (
    DemoRequest,
    DemoRequestEmailVerification,
    DemoRequestFloor,
    DemoRequestFloorRoomGroup,
    DemoRequestRoomType,
)


class DemoRequestRoomTypeInline(admin.TabularInline):
    model = DemoRequestRoomType
    extra = 0


class DemoRequestFloorInline(admin.TabularInline):
    model = DemoRequestFloor
    extra = 0


class DemoRequestFloorRoomGroupInline(admin.TabularInline):
    model = DemoRequestFloorRoomGroup
    extra = 0


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
        "rooms",
        "converted_hotel_settings",
        "converted_user",
        "converted_at",
        "password_reset_sent",
        "source_ip",
        "user_agent",
        "created_at",
        "updated_at",
    )
    inlines = (DemoRequestRoomTypeInline, DemoRequestFloorInline)


@admin.register(DemoRequestFloor)
class DemoRequestFloorAdmin(admin.ModelAdmin):
    list_display = ("demo_request", "floor_number", "name", "prefix")
    list_filter = ("floor_number",)
    search_fields = ("demo_request__hotel_name", "name", "prefix")
    inlines = (DemoRequestFloorRoomGroupInline,)


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
