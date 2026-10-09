from django.contrib import admin
from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """
    Mismo borrado que la API (5.5): eliminar crea un `SoftDeleteMarker` y los eliminados no
    se listan. Antes el admin borraba fisicamente y mostraba a los eliminados (Bloque 5 #4).
    """

    def get_queryset(self, request):
        from accounts.soft_delete import exclude_soft_deleted

        return exclude_soft_deleted(super().get_queryset(request))

    def delete_model(self, request, obj):
        from django.contrib.contenttypes.models import ContentType

        from accounts.models import SoftDeleteMarker

        SoftDeleteMarker.objects.get_or_create(
            content_type=ContentType.objects.get_for_model(obj.__class__), object_id=str(obj.pk)
        )

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            self.delete_model(request, obj)

    list_display = (
        "document_number",
        "first_name",
        "last_name",
        "email",
        "phone",
        "country",
        "client_type",
        "total_stay_nights",
        "last_stay",
        "status",
        "created_at",
    )
    list_filter = (
        "client_type",
        "status",
        "country",
        "created_at",
    )
    search_fields = (
        "document_number",
        "document_type__code",
        "first_name",
        "last_name",
        "email",
        "phone",
        "country",
        "client_type__code",
        "status__code",
    )
    ordering = ("-id",)
