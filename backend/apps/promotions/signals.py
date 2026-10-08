from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from accounts.models import SoftDeleteMarker
from apps.promotions.models import Promotion
from apps.promotions.services import resync_reservations_for_promotion


@receiver(post_save, sender=Promotion)
def resync_reservations_on_promotion_save(sender, instance, raw=False, **kwargs):
    if raw:
        return
    resync_reservations_for_promotion(instance)


def _promotion_from_marker(marker):
    if marker.content_type_id != ContentType.objects.get_for_model(Promotion).id:
        return None
    return Promotion.objects.filter(pk=marker.object_id).first()


# Eliminar o restaurar una promocion no la guarda: solo crea o borra su marcador (5.5).
@receiver(post_save, sender=SoftDeleteMarker)
def resync_reservations_on_promotion_delete(sender, instance, raw=False, **kwargs):
    promotion = None if raw else _promotion_from_marker(instance)
    if promotion:
        resync_reservations_for_promotion(promotion)


@receiver(post_delete, sender=SoftDeleteMarker)
def resync_reservations_on_promotion_restore(sender, instance, **kwargs):
    promotion = _promotion_from_marker(instance)
    if promotion:
        resync_reservations_for_promotion(promotion)
