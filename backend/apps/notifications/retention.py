"""
Retencion de notificaciones (auditoria, Bloque 12 #7; decision del 2026-10-10).

Las leidas se borran a los `NOTIFICATION_READ_RETENTION_DAYS` (90) y las que nunca se leyeron
a los `NOTIFICATION_UNREAD_RETENTION_DAYS` (180). Antes la tabla crecia sin limite: cada
recordatorio diario es una fila por usuario y por dia.

Sin cron, como el resto de la campana (5.12): la purga corre dentro de
`ensure_daily_notifications`, una vez al dia por hotel. El comando `purge_notifications` hace
lo mismo para quien prefiera programarlo. Es un borrado fisico: las notificaciones son avisos,
no el rastro de auditoria (ese vive en `AuditLog`, 5.23).
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.notifications.models import Notification


def retention_days() -> tuple[int, int]:
    read_days = int(getattr(settings, "NOTIFICATION_READ_RETENTION_DAYS", 90) or 90)
    unread_days = int(getattr(settings, "NOTIFICATION_UNREAD_RETENTION_DAYS", 180) or 180)
    return read_days, unread_days


def expired_notifications(*, hotel_settings_id: int | None = None, now=None):
    now = now or timezone.now()
    read_days, unread_days = retention_days()
    queryset = Notification.objects.filter(
        Q(is_read=True, created_at__lt=now - timedelta(days=read_days))
        | Q(is_read=False, created_at__lt=now - timedelta(days=unread_days))
    )
    if hotel_settings_id:
        queryset = queryset.filter(hotel_settings_id=hotel_settings_id)
    return queryset


def purge_expired_notifications(*, hotel_settings_id: int | None = None, now=None) -> int:
    deleted, _ = expired_notifications(hotel_settings_id=hotel_settings_id, now=now).delete()
    return deleted
