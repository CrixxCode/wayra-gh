from django.contrib import admin
from .models import MasterData


@admin.register(MasterData)
class MasterDataAdmin(admin.ModelAdmin):
    list_display = ("id", "group", "code", "name", "is_active", "sort_order")
    list_filter = ("group", "is_active")
    search_fields = ("group", "code", "name", "description")
    ordering = ("group", "sort_order", "name")
