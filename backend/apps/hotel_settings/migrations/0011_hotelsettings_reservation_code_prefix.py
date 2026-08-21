import re
import unicodedata

from django.db import migrations, models


RESERVATION_PREFIX_MAX_LENGTH = 5
RESERVATION_PREFIX_GENERATION_ATTEMPTS = 1000
RESERVATION_PREFIX_STOP_WORDS = {
    "APARTA",
    "APARTAHOTEL",
    "APARTAMENTO",
    "CASA",
    "EL",
    "FINCA",
    "HACIENDA",
    "HOSTAL",
    "HOSTEL",
    "HOTEL",
    "LA",
    "LAS",
    "LOS",
    "POSADA",
    "RESORT",
}
RESERVATION_PREFIX_HONORIFICS = {"DON", "DONA", "SAN", "SANTA"}


def build_reservation_code_prefix(hotel_name):
    normalized = unicodedata.normalize("NFD", str(hotel_name or ""))
    without_accents = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    raw_tokens = re.findall(r"[A-Za-z0-9]+", without_accents.upper())
    tokens = [token for token in raw_tokens if token not in RESERVATION_PREFIX_STOP_WORDS]
    if not tokens:
        tokens = raw_tokens

    first = tokens[0] if tokens else "HTL"
    second = tokens[1] if len(tokens) > 1 else ""

    if first in RESERVATION_PREFIX_HONORIFICS and second:
        prefix = f"{first[0]}{second[0]}{second[-1]}"
    elif len(first) >= 3:
        prefix = first[:3]
    elif second:
        prefix = f"{first[:1]}{second[:1]}{second[-1:]}"
    else:
        prefix = first

    return re.sub(r"[^A-Z0-9]", "", prefix).ljust(3, "X")[:3]


def build_unique_reservation_code_prefix(hotel_name, used_prefixes):
    base = build_reservation_code_prefix(hotel_name)

    for attempt in range(RESERVATION_PREFIX_GENERATION_ATTEMPTS):
        if attempt == 0:
            candidate = base
        else:
            suffix = str(attempt + 1)
            candidate = f"{base[: RESERVATION_PREFIX_MAX_LENGTH - len(suffix)]}{suffix}"

        if candidate not in used_prefixes:
            used_prefixes.add(candidate)
            return candidate

    raise RuntimeError("No fue posible generar un prefijo unico para codigos de reserva.")


def backfill_reservation_code_prefix(apps, schema_editor):
    HotelSettings = apps.get_model("hotel_settings", "HotelSettings")
    used_prefixes = {
        prefix
        for prefix in HotelSettings.objects.exclude(reservation_code_prefix__isnull=True)
        .exclude(reservation_code_prefix="")
        .values_list("reservation_code_prefix", flat=True)
    }

    for hotel in HotelSettings.objects.order_by("id"):
        if hotel.reservation_code_prefix:
            continue

        hotel.reservation_code_prefix = build_unique_reservation_code_prefix(
            hotel.hotel_name,
            used_prefixes,
        )
        hotel.save(update_fields=["reservation_code_prefix"])


def reverse_reservation_code_prefix(apps, schema_editor):
    HotelSettings = apps.get_model("hotel_settings", "HotelSettings")
    HotelSettings.objects.all().update(reservation_code_prefix=None)


class Migration(migrations.Migration):

    dependencies = [
        ("hotel_settings", "0010_hotelsettings_primary_color_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="hotelsettings",
            name="reservation_code_prefix",
            field=models.CharField(
                blank=True,
                editable=False,
                max_length=5,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(
            backfill_reservation_code_prefix,
            reverse_reservation_code_prefix,
        ),
        migrations.AlterField(
            model_name="hotelsettings",
            name="reservation_code_prefix",
            field=models.CharField(
                blank=True,
                editable=False,
                max_length=5,
                unique=True,
            ),
        ),
    ]
