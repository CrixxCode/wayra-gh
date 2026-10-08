from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.db.models.functions import Cast
from django.shortcuts import get_object_or_404
from rest_framework.permissions import SAFE_METHODS
from rest_framework.decorators import action
from rest_framework import status
from rest_framework.response import Response

from accounts.models import SoftDeleteMarker


def exclude_soft_deleted(queryset):
    """
    Excluye los registros con `SoftDeleteMarker`.

    Para consultas que no pasan por un ViewSet (servicios, acciones auxiliares): el borrado
    logico solo existe en la capa API, y el manager crudo devuelve los eliminados.
    """
    content_type = ContentType.objects.get_for_model(queryset.model)
    deleted_ids_qs = SoftDeleteMarker.objects.filter(content_type=content_type).values("object_id")
    # Castea la PK a texto para que funcione con PKs enteras y UUID (5.5).
    return queryset.annotate(_soft_pk=Cast("pk", output_field=models.CharField())).exclude(
        _soft_pk__in=deleted_ids_qs
    )


class LogicalDeleteViewSetMixin:
    """
    Enforces logical delete for API DELETE operations.
    - DELETE always creates a marker in SoftDeleteMarker.
    - `is_active` remains an operational status (active/inactive), not a delete flag.
    """

    def _parse_bool(self, value) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "si", "on"}

    def _model_has_field(self, model_class, field_name: str) -> bool:
        return any(field.name == field_name for field in model_class._meta.get_fields())

    def _should_include_inactive(self) -> bool:
        request = getattr(self, "request", None)
        if not request:
            return False

        if request.method not in SAFE_METHODS:
            return True

        # Respect explicit filters already used by several endpoints.
        if request.query_params.get("is_active") is not None:
            return True

        return self._parse_bool(request.query_params.get("include_inactive"))

    def _should_include_deleted(self) -> bool:
        if getattr(self, "_resolving_restore_queryset", False):
            return True
        request = getattr(self, "request", None)
        if not request:
            return False
        return self._parse_bool(request.query_params.get("include_deleted"))

    def _apply_tenant_scope_if_available(self, queryset):
        tenant_filter_getter = getattr(self, "get_tenant_filter", None)
        tenant_id_getter = getattr(self, "get_tenant_id", None)
        is_global_admin_getter = getattr(self, "is_global_admin", None)
        request = getattr(self, "request", None)
        user = getattr(request, "user", None)

        if not callable(tenant_filter_getter) or not callable(tenant_id_getter):
            return queryset

        if not user or not user.is_authenticated:
            return queryset.none()

        if callable(is_global_admin_getter) and is_global_admin_getter():
            return queryset

        tenant_id = tenant_id_getter()
        if tenant_id is None:
            return queryset.none()

        return queryset.filter(**{f"{tenant_filter_getter()}_id": tenant_id})

    def _get_restore_queryset(self):
        base_queryset_getter = getattr(self, "get_base_queryset", None)
        if callable(base_queryset_getter):
            # Vistas con `TenantScopeMixin`: el aislamiento lo aplica el mixin de tenancy.
            return self._apply_tenant_scope_if_available(base_queryset_getter())

        # Vistas que filtran el hotel en su propio `get_queryset()` (usuarios, reservas,
        # configuracion del hotel...). Antes se caia al `queryset` crudo de la clase, sin
        # filtro de hotel, y cualquier usuario con `<dominio>.write` podia restaurar y leer
        # registros borrados de otro hotel. Se reutiliza el `get_queryset()` de la vista
        # —que lleva su aislamiento— pidiendo que incluya los eliminados.
        self._resolving_restore_queryset = True
        try:
            return self.get_queryset()
        finally:
            self._resolving_restore_queryset = False

    def _get_restore_object(self):
        queryset = self._get_restore_queryset()
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = self.kwargs.get(lookup_url_kwarg)
        filter_kwargs = {self.lookup_field: lookup_value}
        instance = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, instance)
        return instance

    def get_queryset(self):
        queryset = super().get_queryset()
        model_class = queryset.model

        if not self._should_include_deleted():
            queryset = exclude_soft_deleted(queryset)

        if self._model_has_field(model_class, "is_active"):
            if not self._should_include_inactive():
                queryset = queryset.filter(is_active=True)
            return queryset

        return queryset

    @transaction.atomic
    def perform_destroy(self, instance):
        model_class = instance.__class__

        content_type = ContentType.objects.get_for_model(model_class)
        SoftDeleteMarker.objects.get_or_create(
            content_type=content_type,
            object_id=str(instance.pk),
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="restore")
    @transaction.atomic
    def restore(self, request, *args, **kwargs):
        instance = self._get_restore_object()
        content_type = ContentType.objects.get_for_model(instance.__class__)

        deleted_qs = SoftDeleteMarker.objects.filter(
            content_type=content_type,
            object_id=str(instance.pk),
        )

        if not deleted_qs.exists():
            return Response(
                {"detail": "El registro no esta eliminado logicamente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_qs.delete()
        serializer = self.get_serializer(instance)
        return Response(serializer.data, status=status.HTTP_200_OK)
