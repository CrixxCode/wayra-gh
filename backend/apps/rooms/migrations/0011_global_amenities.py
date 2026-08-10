from django.db import migrations, models


def normalize_name(value):
    return str(value or "").strip().casefold()


def consolidate_global_amenities(apps, schema_editor):
    Amenity = apps.get_model("rooms", "Amenity")
    Room = apps.get_model("rooms", "Room")
    Through = Room.amenities.through

    canonical_by_name = {}

    for amenity in Amenity.objects.all().order_by("name", "id"):
        key = normalize_name(amenity.name)
        if not key:
            key = f"amenity-{amenity.pk}"

        canonical = canonical_by_name.get(key)
        if canonical is None:
            amenity.name = str(amenity.name or "").strip()
            amenity.save(update_fields=["name"])
            canonical_by_name[key] = amenity
            continue

        room_ids = list(
            Through.objects.filter(amenity_id=amenity.pk).values_list("room_id", flat=True)
        )
        for room_id in room_ids:
            Through.objects.get_or_create(room_id=room_id, amenity_id=canonical.pk)

        Through.objects.filter(amenity_id=amenity.pk).delete()
        amenity.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0010_alter_room_number_and_unique_constraint"),
    ]

    operations = [
        migrations.RunPython(consolidate_global_amenities, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="amenity",
            name="uq_amenity_hotel_name",
        ),
        migrations.RemoveField(
            model_name="amenity",
            name="hotel_settings",
        ),
        migrations.AddConstraint(
            model_name="amenity",
            constraint=models.UniqueConstraint(fields=("name",), name="uq_amenity_name"),
        ),
    ]
