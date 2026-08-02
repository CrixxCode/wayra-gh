from django.db import migrations


def backfill_rooms_tenant_data(apps, schema_editor):
    HotelSettings = apps.get_model("hotel_settings", "HotelSettings")
    RoomType = apps.get_model("rooms", "RoomType")
    Amenity = apps.get_model("rooms", "Amenity")
    Rate = apps.get_model("rooms", "Rate")

    hotel = HotelSettings.objects.order_by("id").first()
    if hotel is None:
        return

    RoomType.objects.filter(hotel_settings__isnull=True).update(hotel_settings=hotel)
    Amenity.objects.filter(hotel_settings__isnull=True).update(hotel_settings=hotel)
    Rate.objects.filter(hotel_settings__isnull=True).update(hotel_settings=hotel)


def reverse_backfill_rooms_tenant_data(apps, schema_editor):
    RoomType = apps.get_model("rooms", "RoomType")
    Amenity = apps.get_model("rooms", "Amenity")
    Rate = apps.get_model("rooms", "Rate")

    RoomType.objects.all().update(hotel_settings=None)
    Amenity.objects.all().update(hotel_settings=None)
    Rate.objects.all().update(hotel_settings=None)


class Migration(migrations.Migration):

    dependencies = [
        ("hotel_settings", "0003_reservationpolicy"),
        ("rooms", "0007_amenity_hotel_settings_rate_hotel_settings_and_more"),
    ]

    operations = [
        migrations.RunPython(
            backfill_rooms_tenant_data,
            reverse_backfill_rooms_tenant_data,
        ),
    ]