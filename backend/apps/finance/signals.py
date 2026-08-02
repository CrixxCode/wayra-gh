from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.billing.models import CreditNote, Invoice, PaymentRefund
from apps.finance.models import FinancialControlConfig, OperationalAlert
from apps.finance.services import sync_operational_alerts_for_hotel
from apps.reservations.models import ReservationRoom
from apps.rooms.models import Room


def _get_hotel_settings_id_by_reservation(reservation_id: int | None) -> int | None:
    if not reservation_id:
        return None
    return (
        ReservationRoom.objects.filter(reservation_id=reservation_id)
        .values_list("room__floor__hotel_settings_id", flat=True)
        .first()
    )


def _sync_room_operational_alerts(hotel_settings_id: int | None) -> None:
    if not hotel_settings_id:
        return
    sync_operational_alerts_for_hotel(
        hotel_settings_id=hotel_settings_id,
        alert_types={
            OperationalAlert.AlertType.HIGH_OCCUPANCY,
            OperationalAlert.AlertType.LOW_AVAILABILITY,
        },
    )


def _sync_revenue_drop_alert(hotel_settings_id: int | None) -> None:
    if not hotel_settings_id:
        return
    sync_operational_alerts_for_hotel(
        hotel_settings_id=hotel_settings_id,
        alert_types={OperationalAlert.AlertType.REVENUE_DROP},
    )


def _sync_refund_alert(hotel_settings_id: int | None) -> None:
    if not hotel_settings_id:
        return
    sync_operational_alerts_for_hotel(
        hotel_settings_id=hotel_settings_id,
        alert_types={OperationalAlert.AlertType.HIGH_REFUNDS},
    )


@receiver(post_save, sender=Room)
def sync_operational_alerts_on_room_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    hotel_settings_id = getattr(getattr(instance, "floor", None), "hotel_settings_id", None)
    _sync_room_operational_alerts(hotel_settings_id)


@receiver(post_delete, sender=Room)
def sync_operational_alerts_on_room_delete(sender, instance, **kwargs):
    hotel_settings_id = getattr(getattr(instance, "floor", None), "hotel_settings_id", None)
    _sync_room_operational_alerts(hotel_settings_id)


@receiver(post_save, sender=Invoice)
def sync_operational_alerts_on_invoice_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(instance, "reservation_id", None))
    _sync_revenue_drop_alert(hotel_settings_id)


@receiver(post_delete, sender=Invoice)
def sync_operational_alerts_on_invoice_delete(sender, instance, **kwargs):
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(instance, "reservation_id", None))
    _sync_revenue_drop_alert(hotel_settings_id)


@receiver(post_save, sender=CreditNote)
def sync_operational_alerts_on_credit_note_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    invoice = getattr(instance, "invoice", None)
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(invoice, "reservation_id", None))
    _sync_revenue_drop_alert(hotel_settings_id)


@receiver(post_delete, sender=CreditNote)
def sync_operational_alerts_on_credit_note_delete(sender, instance, **kwargs):
    invoice = getattr(instance, "invoice", None)
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(invoice, "reservation_id", None))
    _sync_revenue_drop_alert(hotel_settings_id)


@receiver(post_save, sender=PaymentRefund)
def sync_operational_alerts_on_refund_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    invoice = getattr(getattr(instance, "payment", None), "invoice", None)
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(invoice, "reservation_id", None))
    _sync_refund_alert(hotel_settings_id)


@receiver(post_delete, sender=PaymentRefund)
def sync_operational_alerts_on_refund_delete(sender, instance, **kwargs):
    invoice = getattr(getattr(instance, "payment", None), "invoice", None)
    hotel_settings_id = _get_hotel_settings_id_by_reservation(getattr(invoice, "reservation_id", None))
    _sync_refund_alert(hotel_settings_id)


@receiver(post_save, sender=FinancialControlConfig)
def sync_operational_alerts_on_config_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    sync_operational_alerts_for_hotel(hotel_settings_id=getattr(instance, "hotel_settings_id", None))
