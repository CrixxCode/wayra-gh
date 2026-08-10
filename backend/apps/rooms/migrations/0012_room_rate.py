from django.db import migrations, models
import django.db.models.deletion


def backfill_room_rates(apps, schema_editor):
    Room = apps.get_model("rooms", "Room")
    Rate = apps.get_model("rooms", "Rate")

    updates = []
    for room in Room.objects.exclude(room_type_id__isnull=True).iterator():
        rate = (
            Rate.objects.filter(room_type_id=room.room_type_id, is_active=True)
            .order_by("-created_at", "-id")
            .first()
        )
        if rate:
            room.rate_id = rate.id
            updates.append(room)

    if updates:
        Room.objects.bulk_update(updates, ["rate"])


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0011_global_amenities"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="rate",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="rooms",
                to="rooms.rate",
            ),
        ),
        migrations.RunPython(backfill_room_rates, migrations.RunPython.noop),
    ]
