from django.db import migrations


def backfill_client_hotel(apps, schema_editor):
    Client = apps.get_model("clients", "Client")
    HotelSettings = apps.get_model("hotel_settings", "HotelSettings")

    hotel = HotelSettings.objects.order_by("id").first()
    if hotel is None:
        return

    Client.objects.filter(hotel_settings__isnull=True).update(hotel_settings=hotel)


def reverse_backfill_client_hotel(apps, schema_editor):
    Client = apps.get_model("clients", "Client")
    Client.objects.all().update(hotel_settings=None)


class Migration(migrations.Migration):

    dependencies = [
        ("clients", "0004_client_hotel_settings_alter_client_document_number_and_more"),
        ("hotel_settings", "0003_reservationpolicy"),
    ]

    operations = [
        migrations.RunPython(
            backfill_client_hotel,
            reverse_backfill_client_hotel,
        ),
    ]