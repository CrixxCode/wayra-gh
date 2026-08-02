from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.inventory.services import (
    is_completed_operation_status,
    replenish_room_inventory_on_operation_close,
)
from apps.reservations.services import sync_room_status_for_room_ids
from .models import CleaningTask, MaintenanceOrder


def _normalize_code(value) -> str:
    return str(value or "").strip().upper()


def _status_changed_to_completed(instance) -> bool:
    previous_status_code = _normalize_code(getattr(instance, "_previous_status_code", None))
    current_status_code = _normalize_code(getattr(getattr(instance, "status", None), "code", None))
    return is_completed_operation_status(current_status_code) and current_status_code != previous_status_code


@receiver(pre_save, sender=CleaningTask)
def cache_previous_cleaning_task_room(sender, instance, **kwargs):
    instance._previous_room_id = None
    instance._previous_status_code = None

    if not instance.pk:
        return

    previous = (
        sender.objects.select_related("status")
        .filter(pk=instance.pk)
        .values("room_id", "status__code")
        .first()
    )
    if previous:
        instance._previous_room_id = previous["room_id"]
        instance._previous_status_code = previous.get("status__code")


@receiver(post_save, sender=CleaningTask)
def sync_room_status_on_cleaning_task_save(sender, instance, **kwargs):
    sync_room_status_for_room_ids(
        [getattr(instance, "_previous_room_id", None), instance.room_id]
    )
    if _status_changed_to_completed(instance):
        replenish_room_inventory_on_operation_close(
            room_id=instance.room_id,
            source_type="CLEANING",
            source_id=instance.id,
        )


@receiver(post_delete, sender=CleaningTask)
def sync_room_status_on_cleaning_task_delete(sender, instance, **kwargs):
    sync_room_status_for_room_ids([instance.room_id])


@receiver(pre_save, sender=MaintenanceOrder)
def cache_previous_maintenance_status(sender, instance, **kwargs):
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


@receiver(post_save, sender=MaintenanceOrder)
def replenish_inventory_on_maintenance_close(sender, instance, **kwargs):
    if _status_changed_to_completed(instance):
        replenish_room_inventory_on_operation_close(
            room_id=instance.room_id,
            source_type="MAINTENANCE",
            source_id=instance.id,
        )
