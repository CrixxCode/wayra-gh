from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from apps.reservations.models import Reservation, ReservationRoom
from apps.reservations.services import (
    sync_client_stay_metrics_by_id,
    sync_client_stay_metrics_for_reservation,
    sync_client_status_by_id,
    sync_client_status_for_reservation,
    sync_room_status_for_reservation,
    sync_room_status_for_room_ids,
)


@receiver(pre_save, sender=ReservationRoom)
def cache_previous_reservation_room(sender, instance, **kwargs):
    instance._previous_room_id = None

    if not instance.pk:
        return

    previous = sender.objects.filter(pk=instance.pk).values("room_id").first()
    if previous:
        instance._previous_room_id = previous["room_id"]


@receiver(pre_save, sender=Reservation)
def cache_previous_reservation_client(sender, instance, **kwargs):
    instance._previous_client_id = None

    if not instance.pk:
        return

    previous = sender.objects.filter(pk=instance.pk).values("client_id").first()
    if previous:
        instance._previous_client_id = previous["client_id"]


@receiver(post_save, sender=ReservationRoom)
def sync_room_status_on_reservation_room_save(sender, instance, **kwargs):
    sync_room_status_for_room_ids(
        [getattr(instance, "_previous_room_id", None), instance.room_id]
    )
    sync_client_status_for_reservation(instance.reservation)


@receiver(post_delete, sender=ReservationRoom)
def sync_room_status_on_reservation_room_delete(sender, instance, **kwargs):
    sync_room_status_for_room_ids([instance.room_id])
    sync_client_status_for_reservation(instance.reservation)


@receiver(post_save, sender=Reservation)
def sync_room_status_on_reservation_save(sender, instance, **kwargs):
    sync_room_status_for_reservation(instance)
    previous_client_id = getattr(instance, "_previous_client_id", None)
    current_client_id = getattr(instance, "client_id", None)

    if previous_client_id and previous_client_id != current_client_id:
        sync_client_status_by_id(previous_client_id)
        sync_client_stay_metrics_by_id(previous_client_id)

    sync_client_status_for_reservation(instance)
    sync_client_stay_metrics_for_reservation(instance)


@receiver(post_delete, sender=Reservation)
def sync_room_status_on_reservation_delete(sender, instance, **kwargs):
    sync_room_status_for_reservation(instance)
    sync_client_status_for_reservation(instance)
    sync_client_stay_metrics_for_reservation(instance)
