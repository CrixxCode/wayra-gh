import re
import unicodedata

from django.db import migrations


def _build_code(hotel_name, year, reservation_id):
    normalized = unicodedata.normalize("NFD", str(hotel_name or ""))
    without_accents = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    letters = re.sub(r"[^A-Za-z]", "", without_accents).upper()
    prefix = (letters[:3] or "HTL").ljust(3, "X")
    return f"{prefix}{year}{reservation_id:03d}"


def backfill_reservation_code(apps, schema_editor):
    Reservation = apps.get_model("reservations", "Reservation")

    for reservation in Reservation.objects.select_related("hotel_settings").filter(code__isnull=True):
        hotel_name = getattr(reservation.hotel_settings, "hotel_name", "")
        year = reservation.created_at.year if reservation.created_at else reservation.id
        reservation.code = _build_code(hotel_name, year, reservation.id)
        reservation.save(update_fields=["code"])


def reverse_backfill_reservation_code(apps, schema_editor):
    Reservation = apps.get_model("reservations", "Reservation")
    Reservation.objects.all().update(code=None)


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0013_reservation_code"),
    ]

    operations = [
        migrations.RunPython(
            backfill_reservation_code,
            reverse_backfill_reservation_code,
        ),
    ]
