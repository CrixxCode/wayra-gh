from django.contrib import admin

from apps.packages.models import Package, PackageService


class PackageServiceInline(admin.TabularInline):
    model = PackageService
    extra = 1


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "name",
        "room_type",
        "base_price",
        "is_active",
        "start_date",
        "end_date",
        "created_at",
    )
    search_fields = ("name", "description")
    list_filter = ("hotel_settings", "room_type", "is_active")
    inlines = [PackageServiceInline]


@admin.register(PackageService)
class PackageServiceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "package",
        "service",
        "quantity",
        "is_included",
        "created_at",
    )
    list_filter = ("is_included",)
    search_fields = ("package__name", "service__name")