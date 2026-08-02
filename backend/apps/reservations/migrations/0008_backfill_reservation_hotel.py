from django.db import migrations


def backfill_reservation_hotel(apps, schema_editor):
    Reservation = apps.get_model("reservations", "Reservation")

    for reservation in Reservation.objects.select_related("client").filter(hotel_settings__isnull=True):
        client_hotel_id = getattr(reservation.client, "hotel_settings_id", None)
        if client_hotel_id:
            reservation.hotel_settings_id = client_hotel_id
            reservation.save(update_fields=["hotel_settings"])


def reverse_backfill_reservation_hotel(apps, schema_editor):
    Reservation = apps.get_model("reservations", "Reservation")
    Reservation.objects.all().update(hotel_settings=None)


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0007_reservation_hotel_settings"),
    ]

    operations = [
        migrations.RunPython(
            backfill_reservation_hotel,
            reverse_backfill_reservation_hotel,
        ),
    ]