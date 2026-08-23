from django.db import migrations, models


def backfill_rate_billing_mode(apps, schema_editor):
    Rate = apps.get_model("rooms", "Rate")

    for rate in Rate.objects.select_related("room_type").iterator():
        room_type = getattr(rate, "room_type", None)
        if room_type and rate.billing_mode != room_type.billing_mode:
            rate.billing_mode = room_type.billing_mode
            rate.save(update_fields=["billing_mode"])


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0014_roomphoto"),
    ]

    operations = [
        migrations.AddField(
            model_name="roomtype",
            name="billing_mode",
            field=models.CharField(
                choices=[
                    ("ROOM", "Habitacion completa"),
                    ("PERSON", "Por persona"),
                ],
                default="ROOM",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="rate",
            name="billing_mode",
            field=models.CharField(
                choices=[
                    ("ROOM", "Habitacion completa"),
                    ("PERSON", "Por persona"),
                ],
                default="ROOM",
                max_length=12,
            ),
        ),
        migrations.RunPython(backfill_rate_billing_mode, migrations.RunPython.noop),
    ]
