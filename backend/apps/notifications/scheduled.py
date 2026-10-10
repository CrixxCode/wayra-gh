"""
Notificaciones diarias: check-ins y check-outs proximos y reporte del dia.

Igual que el trabajo periodico (AGENTS.md 5.21), **no dependen de un cron**: la primera
consulta del dia a la campana las genera para el hotel de quien consulta
(`ensure_daily_notifications`). Antes existian solo como comandos que nadie programaba, asi
que nunca le llegaban a nadie. Los comandos siguen sirviendo para quien si tenga programador.

Es seguro llamarlo desde varios sitios: cada `notify_*` ya deduplica por dia, y el lock
sobre la fila del hotel evita que dos peticiones simultaneas generen lo mismo dos veces.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.hotel_settings.models import HotelSettings
from apps.notifications.services import (
    notify_daily_report_available,
    notify_reservation_upcoming_checkin,
    notify_reservation_upcoming_checkout,
)
from apps.notifications.retention import purge_expired_notifications
from apps.reservations.models import Reservation

logger = logging.getLogger(__name__)

EXCLUDED_RESERVATION_STATUS_CODES = {
    "CANCELADA",
    "CANCELADO",
    "CANCELLED",
    "ANULADA",
    "ANULADO",
    "FINALIZADA",
    "FINALIZADO",
    "COMPLETADA",
    "COMPLETADO",
    "CHECKED_OUT",
}


def _open_reservations(hotel_settings_id: int | None):
    queryset = Reservation.objects.select_related("hotel_settings", "status", "client").exclude(
        status__code__in=EXCLUDED_RESERVATION_STATUS_CODES
    )
    if hotel_settings_id:
        queryset = queryset.filter(hotel_settings_id=hotel_settings_id)
    return queryset


def notify_upcoming_checkins(*, hotel_settings_id=None, days=1, today=None) -> tuple[int, int]:
    """Devuelve `(reservas_revisadas, notificaciones_creadas)`."""
    today = today or timezone.localdate()
    queryset = _open_reservations(hotel_settings_id).filter(
        real_check_in__isnull=True,
        real_check_out__isnull=True,
        expected_check_in__gte=today,
        expected_check_in__lte=today + timedelta(days=max(int(days), 0)),
    ).order_by("expected_check_in", "id")

    processed = created = 0
    for reservation in queryset:
        processed += 1
        days_until = max((reservation.expected_check_in - today).days, 0)
        created += len(notify_reservation_upcoming_checkin(reservation, days_until=days_until))
    return processed, created


def notify_upcoming_checkouts(*, hotel_settings_id=None, days=1, today=None) -> tuple[int, int]:
    today = today or timezone.localdate()
    queryset = _open_reservations(hotel_settings_id).filter(
        real_check_out__isnull=True,
        expected_check_out__gte=today,
        expected_check_out__lte=today + timedelta(days=max(int(days), 0)),
    ).order_by("expected_check_out", "id")

    processed = created = 0
    for reservation in queryset:
        processed += 1
        days_until = max((reservation.expected_check_out - today).days, 0)
        created += len(notify_reservation_upcoming_checkout(reservation, days_until=days_until))
    return processed, created


def notify_daily_reports(*, hotel_settings_id=None, report_date=None) -> tuple[int, int]:
    queryset = HotelSettings.objects.order_by("id")
    if hotel_settings_id:
        queryset = queryset.filter(id=hotel_settings_id)

    processed = created = 0
    for hotel_settings in queryset:
        processed += 1
        created += len(
            notify_daily_report_available(hotel_settings=hotel_settings, report_date=report_date)
        )
    return processed, created


def ensure_daily_notifications(hotel_settings_id: int | None) -> bool:
    """
    Genera las notificaciones del dia del hotel si todavia no se generaron. Devuelve si las
    genero en esta llamada. Un fallo se registra y no se propaga: la campana se tiene que
    poder leer igual; la siguiente consulta lo reintenta.
    """
    if not hotel_settings_id:
        return False

    today = timezone.localdate()
    # Lectura barata para el caso normal: ya corrio hoy.
    if HotelSettings.objects.filter(pk=hotel_settings_id, daily_notifications_ran_on=today).exists():
        return False

    try:
        with transaction.atomic():
            hotel = (
                HotelSettings.objects.select_for_update().filter(pk=hotel_settings_id).first()
            )
            if hotel is None or hotel.daily_notifications_ran_on == today:
                return False

            notify_upcoming_checkins(hotel_settings_id=hotel.id, today=today)
            notify_upcoming_checkouts(hotel_settings_id=hotel.id, today=today)
            notify_daily_reports(hotel_settings_id=hotel.id, report_date=today)
            # Una vez al dia por hotel tambien se borra lo vencido (Bloque 12 #7).
            purge_expired_notifications(hotel_settings_id=hotel.id)

            HotelSettings.objects.filter(pk=hotel.id).update(daily_notifications_ran_on=today)
        return True
    except Exception:  # noqa: BLE001 - la lectura de la campana no puede caerse por esto
        logger.exception("No se pudieron generar las notificaciones diarias del hotel %s", hotel_settings_id)
        return False
