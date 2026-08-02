from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .models import JobTitle, NotificationReadState, Role, Resource, RoleResource, User, UserRole

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        (_("Información adicional"), {"fields": ("avatar", "job_title", "hotel_settings")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "password1",
                    "password2",
                    "avatar",
                    "job_title",
                    "hotel_settings",
                ),
            },
        ),
    )

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")

@admin.register(JobTitle)
class JobTitleAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "is_active", "sort_order")
    list_filter = ("role", "is_active")
    search_fields = ("name", "slug", "role__name")

@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ("key", "name")

@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "assigned_at")

@admin.register(RoleResource)
class RoleResourceAdmin(admin.ModelAdmin):
    list_display = ("role", "resource", "granted_at")


@admin.register(NotificationReadState)
class NotificationReadStateAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_key", "read_at", "updated_at")
    search_fields = ("user__username", "notification_key")
