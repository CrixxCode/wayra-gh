from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.billing.models import Charge, Invoice, Payment, PaymentRefund
from apps.billing.services import (
    sync_automatic_charges_for_reservation,
    sync_default_invoice_for_reservation,
    sync_invoice_status,
)
from apps.reservations.models import Reservation, ReservationRoom


@receiver(post_save, sender=Reservation)
def sync_automatic_charges_on_reservation_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    sync_automatic_charges_for_reservation(instance.id)
    sync_default_invoice_for_reservation(instance.id)


@receiver(post_save, sender=ReservationRoom)
def sync_automatic_charges_on_room_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    sync_automatic_charges_for_reservation(instance.reservation_id)
    sync_default_invoice_for_reservation(instance.reservation_id)


@receiver(post_delete, sender=ReservationRoom)
def sync_automatic_charges_on_room_delete(sender, instance, **kwargs):
    sync_automatic_charges_for_reservation(instance.reservation_id)
    sync_default_invoice_for_reservation(instance.reservation_id)


@receiver(post_save, sender=Charge)
def sync_invoice_on_charge_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    sync_default_invoice_for_reservation(instance.reservation_id)


@receiver(post_delete, sender=Charge)
def sync_invoice_on_charge_delete(sender, instance, **kwargs):
    sync_default_invoice_for_reservation(instance.reservation_id)


@receiver(post_save, sender=Payment)
def sync_invoice_status_on_payment_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    sync_invoice_status(instance.invoice)


@receiver(post_delete, sender=Payment)
def sync_invoice_status_on_payment_delete(sender, instance, **kwargs):
    if not instance.invoice_id:
        return

    invoice = Invoice.objects.select_related("status").filter(
        id=instance.invoice_id,
        is_active=True,
    ).first()
    if not invoice:
        return

    sync_invoice_status(invoice)


@receiver(post_save, sender=PaymentRefund)
def sync_invoice_status_on_refund_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    invoice = getattr(getattr(instance, "payment", None), "invoice", None)
    if not invoice:
        return
    sync_invoice_status(invoice)


@receiver(post_delete, sender=PaymentRefund)
def sync_invoice_status_on_refund_delete(sender, instance, **kwargs):
    payment = getattr(instance, "payment", None)
    if not payment or not payment.invoice_id:
        return

    invoice = Invoice.objects.select_related("status").filter(
        id=payment.invoice_id,
        is_active=True,
    ).first()
    if not invoice:
        return

    sync_invoice_status(invoice)
