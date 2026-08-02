from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.inventory.models import Item
from apps.inventory.services import sync_low_stock_restock_alert_for_item


@receiver(post_save, sender=Item)
def sync_restock_alert_on_item_change(sender, instance, created, raw=False, update_fields=None, **kwargs):
    if raw:
        return

    tracked_fields = {"stock", "minimum_stock", "is_active"}
    if not created and update_fields is not None and tracked_fields.isdisjoint(set(update_fields)):
        return

    sync_low_stock_restock_alert_for_item(item_id=getattr(instance, "id", None))
