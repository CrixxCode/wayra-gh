from django.contrib import admin

from apps.notifications.models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "hotel_settings",
        "notification_type",
        "priority",
        "is_read",
        "created_at",
    )
    list_filter = ("notification_type", "priority", "is_read", "hotel_settings")
    search_fields = ("title", "message", "user__username", "user__email")
    ordering = ("-created_at", "-id")
