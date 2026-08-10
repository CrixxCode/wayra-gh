from django.db import migrations, models


def mark_existing_room_inventory_items(apps, schema_editor):
    Item = apps.get_model("inventory", "Item")
    RoomInventory = apps.get_model("inventory", "RoomInventory")

    assigned_item_ids = RoomInventory.objects.values_list("item_id", flat=True).distinct()
    Item.objects.filter(id__in=assigned_item_ids).update(item_purpose="ROOM")


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0005_inventory_restock_alert"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="item_purpose",
            field=models.CharField(
                choices=[
                    ("ROOM", "Habitacion"),
                    ("RECEPTION", "Recepcion"),
                ],
                db_index=True,
                default="RECEPTION",
                max_length=20,
            ),
        ),
        migrations.RunPython(mark_existing_room_inventory_items, migrations.RunPython.noop),
    ]
