"""Rastro de auditoria: quien hizo que, cuando, desde donde y que cambio exactamente.

Antes de esto la pantalla de "actividad" no leia ninguna tabla: **reconstruia** una linea
de tiempo pidiendo pagos, movimientos, ordenes y reservas, y mezclandolos. Eso deja fuera
casi todo el sistema, solo ensena altas --nunca ediciones ni borrados-- y, peor, cambia
retroactivamente: si alguien edita el monto de un pago, la "actividad" pasa a contar otra
cosa y nadie se entera. Un rastro de auditoria tiene que ser **inmutable y propio**.

## Por que por señales y no por el viewset

Un mixin en el viewset habria obligado a tocar los 43 endpoints y solo cubriria lo que
entra por la API. Con `post_save`/`post_delete` se cubre **toda** escritura del ORM
--incluidos comandos de gestion y tareas internas-- sin tocar ni un viewset.

Lo que las señales no saben es *quien*: no tienen la peticion. Ese hueco lo tapa
`AuditContextMiddleware`, que deja usuario, IP y ruta en un `ContextVar` mientras dura la
peticion. Un `ContextVar` y no una variable global de hilo porque Django puede servir en
contextos asincronos, donde varias peticiones comparten hilo.

Una escritura sin peticion --un comando, el materializador de trabajo periodico-- queda
registrada igual, como accion del sistema. Eso es correcto: en una auditoria "lo hizo un
proceso automatico a las 3am" es una respuesta, y "no hay registro" no lo es.
"""

from __future__ import annotations

import contextvars
from typing import Any

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

# Contexto de la peticion en curso. Vacio cuando la escritura no viene de la API.
_audit_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "audit_context", default={}
)


class AuditLog(models.Model):
    """Una fila por escritura. Solo se inserta: nada la edita ni la borra."""

    class Action(models.TextChoices):
        CREATE = "CREATE", "Creacion"
        UPDATE = "UPDATE", "Modificacion"
        DELETE = "DELETE", "Eliminacion"

    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)

    # El usuario puede borrarse o cambiar de nombre; el rastro no puede perderse ni
    # mentir, asi que ademas de la relacion se guarda el nombre **tal como estaba**.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_entries",
    )
    username = models.CharField(max_length=150, blank=True)

    # Para aislar por hotel sin tener que resolver la entidad en cada consulta.
    hotel_settings_id = models.IntegerField(null=True, blank=True, db_index=True)

    action = models.CharField(max_length=10, choices=Action.choices, db_index=True)

    # Se guarda la etiqueta ademas del ContentType: si el modelo desaparece, la fila
    # tiene que seguir diciendo sobre que era.
    content_type = models.ForeignKey(
        ContentType, null=True, blank=True, on_delete=models.SET_NULL
    )
    entity = models.CharField(max_length=120, db_index=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_label = models.CharField(max_length=255, blank=True)

    # `{campo: {"before": ..., "after": ...}}`. En una auditoria el "de cuanto a cuanto"
    # suele ser justo lo que se pregunta.
    changes = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    request_path = models.CharField(max_length=255, blank=True)
    request_method = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [
            models.Index(fields=["-occurred_at"]),
            models.Index(fields=["entity", "object_id"]),
            models.Index(fields=["user", "-occurred_at"]),
            models.Index(fields=["hotel_settings_id", "-occurred_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.occurred_at:%Y-%m-%d %H:%M} {self.username or 'sistema'} {self.action} {self.entity}"


class AuditContextMiddleware:
    """Deja usuario, IP y ruta al alcance de las señales mientras dura la peticion."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        authenticated = bool(user and getattr(user, "is_authenticated", False))

        token = _audit_context.set(
            {
                "user": user if authenticated else None,
                "username": getattr(user, "username", "") if authenticated else "",
                "hotel_settings_id": getattr(user, "hotel_settings_id", None)
                if authenticated
                else None,
                "ip_address": _client_ip(request),
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
                "path": request.path[:255],
                "method": request.method,
            }
        )
        try:
            return self.get_response(request)
        finally:
            _audit_context.reset(token)


def _client_ip(request) -> str | None:
    """La IP real detras del proxy de Railway, si viene."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        # El primero de la lista es el cliente; el resto son saltos intermedios.
        candidate = forwarded.split(",")[0].strip()
        if candidate:
            return candidate
    return request.META.get("REMOTE_ADDR") or None


# --------------------------------------------------------------------- que se audita

#: Apps cuyas escrituras se registran. Se listan las del proyecto: auditar las de Django
#: llenaria la tabla de sesiones y de entradas de log sin aportar nada.
AUDITED_APPS = {
    "accounts",
    "billing",
    "clients",
    "finance",
    "hotel_settings",
    "inventory",
    "master_data",
    "notifications",
    "packages",
    "promotions",
    "reservations",
    "rooms",
    "services",
}

#: Modelos que se quedan fuera aunque esten en esas apps.
EXCLUDED_MODELS = {
    # Auditar el propio rastro seria un bucle.
    "accounts.AuditLog",
    # Ruido de infraestructura, no acciones de nadie.
    "accounts.SoftDeleteMarker",
    "notifications.NotificationRead",
}

#: Campos que nunca entran en el diff, ni siquiera enmascarados.
SENSITIVE_FIELDS = {"password", "token", "secret", "api_key", "signature"}


def is_audited(model_class) -> bool:
    """Si esta escritura debe dejar rastro.

    El caso que no se ve venir son las **migraciones de datos**: Django las ejecuta con
    modelos historicos reconstruidos al vuelo, que viven en el modulo `__fake__`. Sus
    escrituras tambien disparan las señales, y en ese momento la tabla de auditoria puede
    no existir todavia --las migraciones anteriores a la que la crea-- o tener otra
    forma. Eso reventaba un `migrate` desde cero, que es exactamente lo que hace un
    despliegue nuevo. Ademas, poblar catalogos en una migracion no es una accion de nadie
    que auditar.
    """
    if model_class.__module__ == "__fake__":
        return False

    label = f"{model_class._meta.app_label}.{model_class.__name__}"
    if label in EXCLUDED_MODELS:
        return False
    return model_class._meta.app_label in AUDITED_APPS


def _serialize(value: Any) -> Any:
    """Deja el valor en algo que quepa en JSON y se lea en una tabla."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def _auto_timestamp_fields(model_class) -> set[str]:
    """Campos que el ORM mueve solo en cada guardado."""
    return {
        field.name
        for field in model_class._meta.concrete_fields
        if getattr(field, "auto_now", False)
    }


def _snapshot(instance) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for field in instance._meta.concrete_fields:
        if field.name in SENSITIVE_FIELDS:
            continue
        data[field.name] = _serialize(getattr(instance, field.attname, None))
    return data


def _label_for(instance) -> str:
    try:
        return str(instance)[:255]
    except Exception:
        # Un `__str__` que revienta no puede tumbar la escritura que se esta auditando.
        return ""


def _hotel_of(instance) -> int | None:
    value = getattr(instance, "hotel_settings_id", None)
    if isinstance(value, int):
        return value
    return _audit_context.get().get("hotel_settings_id")


def _write(action: str, instance, changes: dict[str, Any]) -> None:
    context = _audit_context.get()
    user = context.get("user")

    AuditLog.objects.create(
        user=user,
        username=context.get("username", ""),
        hotel_settings_id=_hotel_of(instance),
        action=action,
        content_type=ContentType.objects.get_for_model(instance.__class__),
        entity=instance._meta.verbose_name.title()[:120],
        object_id=str(getattr(instance, "pk", "") or "")[:64],
        object_label=_label_for(instance),
        changes=changes,
        ip_address=context.get("ip_address"),
        user_agent=context.get("user_agent", ""),
        request_path=context.get("path", ""),
        request_method=context.get("method", ""),
    )


@receiver(pre_save)
def capture_previous_state(sender, instance, **kwargs):
    """Guarda el estado en base antes de escribir, para poder comparar despues."""
    if not is_audited(sender) or instance.pk is None:
        return

    try:
        previous = sender.objects.filter(pk=instance.pk).first()
    except Exception:
        previous = None

    # Se cuelga de la instancia y no de un diccionario global: dos guardados en paralelo
    # no pueden pisarse el estado previo el uno al otro.
    instance._audit_previous = _snapshot(previous) if previous else None


@receiver(post_save)
def record_save(sender, instance, created, **kwargs):
    if not is_audited(sender):
        return

    current = _snapshot(instance)

    if created:
        _write(AuditLog.Action.CREATE, instance, {"after": current})
        return

    previous = getattr(instance, "_audit_previous", None)
    if previous is None:
        # No se pudo leer el estado anterior: se registra el cambio igual, sin diff.
        # Perder la fila entera seria peor que perder el detalle.
        _write(AuditLog.Action.UPDATE, instance, {})
        return

    ignored = _auto_timestamp_fields(sender)
    diff = {
        field: {"before": previous.get(field), "after": value}
        for field, value in current.items()
        if field not in ignored and previous.get(field) != value
    }
    if not diff:
        # Un `save()` que no cambio nada --o que solo movio su propia marca de tiempo--
        # no es un hecho auditable. Sin esta salida, cada `save()` de cualquier modelo
        # con `auto_now` dejaria una fila que solo dice "updated_at cambio", y la tabla
        # se llenaria de ruido que ademas esconde los cambios de verdad.
        return

    _write(AuditLog.Action.UPDATE, instance, diff)


@receiver(post_delete)
def record_delete(sender, instance, **kwargs):
    if not is_audited(sender):
        return
    _write(AuditLog.Action.DELETE, instance, {"before": _snapshot(instance)})
