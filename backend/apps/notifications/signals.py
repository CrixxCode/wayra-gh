from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from accounts.models import User, UserRole
from apps.billing.models import Invoice, Payment
from apps.finance.models import Expense
from apps.inventory.models import Item
from apps.notifications.services import (
    notify_cleaning_completed,
    notify_expense_registered,
    notify_invoice_generated,
    notify_invoice_pending_payment,
    notify_maintenance_created,
    notify_maintenance_urgent,
    notify_payment_registered,
    notify_product_out_of_stock,
    notify_reservation_cancelled,
    notify_reservation_created,
    notify_room_out_of_service,
    notify_room_pending_cleaning,
    notify_room_ready_for_assignment,
    notify_stock_low,
    notify_user_created,
    notify_user_role_updated,
)
from apps.reservations.models import Reservation
from apps.rooms.models import CleaningTask, MaintenanceOrder, Room


def _normalize_code(value) -> str:
    return str(value or "").strip().upper()


def _is_cancelled_reservation_status(code: str) -> bool:
    return code in {"CANCELADA", "CANCELADO", "CANCELLED", "ANULADA", "ANULADO"}


def _is_completed_cleaning_status(code: str) -> bool:
    return code in {"COMPLETADA", "COMPLETADO", "COMPLETED", "DONE", "CERRADA", "CERRADO"}


def _is_high_maintenance_priority(code: str) -> bool:
    return code in {"ALTA", "URGENTE", "HIGH", "CRITICAL"}


def _is_invoice_pending_status(code: str) -> bool:
    return code in {"PENDIENTE", "PARCIAL", "EMITIDA"}


@receiver(pre_save, sender=Reservation)
def cache_previous_reservation_status(sender, instance, **kwargs):
    instance._previous_status_code = None
    if not instance.pk:
        return
    previous = (
        sender.objects.select_related("status")
        .filter(pk=instance.pk)
        .values("status__code")
        .first()
    )
    if previous:
        instance._previous_status_code = previous.get("status__code")


@receiver(post_save, sender=Reservation)
def create_reservation_notifications(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    if created:
        notify_reservation_created(instance)
        return

    previous_status = _normalize_code(getattr(instance, "_previous_status_code", None))
    current_status = _normalize_code(getattr(instance, "status_code", None))
    if previous_status != current_status and _is_cancelled_reservation_status(current_status):
        notify_reservation_cancelled(instance)


@receiver(pre_save, sender=Room)
def cache_previous_room_status(sender, instance, **kwargs):
    instance._previous_status_code = None
    if not instance.pk:
        return
    previous = (
        sender.objects.select_related("status")
        .filter(pk=instance.pk)
        .values("status__code")
        .first()
    )
    if previous:
        instance._previous_status_code = previous.get("status__code")


@receiver(post_save, sender=Room)
def create_room_notifications(sender, instance, created, raw=False, **kwargs):
    if raw or created:
        return

    previous_status = _normalize_code(getattr(instance, "_previous_status_code", None))
    current_status = _normalize_code(getattr(instance, "status_code", None))
    if previous_status == current_status:
        return

    if current_status == "LIMPIEZA":
        notify_room_pending_cleaning(instance)
        return

    if current_status == "DISPONIBLE":
        notify_room_ready_for_assignment(instance)
        return

    if current_status == "FUERA_DE_SERVICIO":
        notify_room_out_of_service(instance)


@receiver(pre_save, sender=CleaningTask)
def cache_previous_cleaning_status(sender, instance, **kwargs):
    instance._previous_status_code = None
    if not instance.pk:
        return
    previous = (
        sender.objects.select_related("status")
        .filter(pk=instance.pk)
        .values("status__code")
        .first()
    )
    if previous:
        instance._previous_status_code = previous.get("status__code")


@receiver(post_save, sender=CleaningTask)
def create_cleaning_notifications(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    previous_status = _normalize_code(getattr(instance, "_previous_status_code", None))
    current_status = _normalize_code(getattr(instance, "status_code", None))
    if _is_completed_cleaning_status(current_status) and current_status != previous_status:
        notify_cleaning_completed(instance)


@receiver(pre_save, sender=MaintenanceOrder)
def cache_previous_maintenance_priority(sender, instance, **kwargs):
    instance._previous_priority_code = None
    if not instance.pk:
        return
    previous = (
        sender.objects.select_related("priority")
        .filter(pk=instance.pk)
        .values("priority__code")
        .first()
    )
    if previous:
        instance._previous_priority_code = previous.get("priority__code")


@receiver(post_save, sender=MaintenanceOrder)
def create_maintenance_notifications(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    if created:
        notify_maintenance_created(instance)

    current_priority = _normalize_code(getattr(instance, "priority_code", None))
    previous_priority = _normalize_code(getattr(instance, "_previous_priority_code", None))
    if _is_high_maintenance_priority(current_priority) and (
        created or not _is_high_maintenance_priority(previous_priority)
    ):
        notify_maintenance_urgent(instance)


@receiver(pre_save, sender=Invoice)
def cache_previous_invoice_status(sender, instance, **kwargs):
    instance._previous_status_code = None
    if not instance.pk:
        return
    previous = (
        sender.objects.select_related("status")
        .filter(pk=instance.pk)
        .values("status__code")
        .first()
    )
    if previous:
        instance._previous_status_code = previous.get("status__code")


@receiver(post_save, sender=Invoice)
def create_invoice_notifications(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    if created:
        notify_invoice_generated(instance)

    previous_status = _normalize_code(getattr(instance, "_previous_status_code", None))
    current_status = _normalize_code(getattr(instance, "status_code", None))
    if _is_invoice_pending_status(current_status) and current_status != previous_status:
        notify_invoice_pending_payment(instance)


@receiver(post_save, sender=Payment)
def create_payment_notifications(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    notify_payment_registered(instance)


@receiver(pre_save, sender=Item)
def cache_previous_item_stock(sender, instance, **kwargs):
    instance._previous_stock = None
    instance._previous_minimum_stock = None
    instance._previous_is_active = None

    if not instance.pk:
        return

    previous = (
        sender.objects.filter(pk=instance.pk)
        .values("stock", "minimum_stock", "is_active")
        .first()
    )
    if previous:
        instance._previous_stock = previous.get("stock")
        instance._previous_minimum_stock = previous.get("minimum_stock")
        instance._previous_is_active = previous.get("is_active")


@receiver(post_save, sender=Item)
def create_inventory_notifications(sender, instance, created, raw=False, **kwargs):
    if raw or not instance.is_active:
        return

    current_stock = int(getattr(instance, "stock", 0) or 0)
    current_minimum = int(getattr(instance, "minimum_stock", 0) or 0)

    previous_stock = getattr(instance, "_previous_stock", None)
    previous_minimum = getattr(instance, "_previous_minimum_stock", None)

    if current_minimum > 0 and current_stock <= current_minimum:
        if previous_stock is None:
            notify_stock_low(instance)
        else:
            threshold = int(previous_minimum or current_minimum)
            if int(previous_stock) > threshold:
                notify_stock_low(instance)

    if current_stock == 0:
        if previous_stock is None or int(previous_stock) > 0:
            notify_product_out_of_stock(instance)


@receiver(post_save, sender=Expense)
def create_expense_notifications(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    notify_expense_registered(instance)


@receiver(post_save, sender=User)
def create_user_notifications(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    notify_user_created(instance)


@receiver(post_save, sender=UserRole)
def create_user_role_notifications(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    if instance.is_active:
        action_label = "asignado"
    else:
        action_label = "removido"

    notify_user_role_updated(
        user=getattr(instance, "user", None),
        role_name=getattr(getattr(instance, "role", None), "name", ""),
        action_label=action_label,
    )
