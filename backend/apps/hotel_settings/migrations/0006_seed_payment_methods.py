"""Siembra los metodos de pago de cada hotel a partir del catalogo global.

Los metodos de pago vivian en `MasterData` con `group='PAYMENT_METHOD'`, una tabla sin
FK a hotel: editar uno lo cambiaba para toda la plataforma. Aqui cada hotel recibe su
propia copia de los metodos **activos** del catalogo global, conservando codigo, nombre
y orden para no romper reportes ni filtros existentes.

Los duplicados inactivos del catalogo global (EFECTIVO junto a CASH, etc.) no se copian:
si algun pago viejo los usa, las migraciones de `billing`, `finance` y `reservations`
los crean bajo demanda al repuntar sus FK.
"""

from django.db import migrations

PAYMENT_METHOD_GROUP = "PAYMENT_METHOD"


def seed_payment_methods(apps, schema_editor):
    MasterData = apps.get_model("master_data", "MasterData")
    HotelSettings = apps.get_model("hotel_settings", "HotelSettings")
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")

    catalog = list(
        MasterData.objects.filter(group=PAYMENT_METHOD_GROUP, is_active=True).order_by(
            "sort_order", "name"
        )
    )
    if not catalog:
        return

    for hotel in HotelSettings.objects.all():
        for entry in catalog:
            code = str(entry.code or "").strip().upper()
            if not code:
                continue

            PaymentMethod.objects.get_or_create(
                hotel_settings=hotel,
                code=code,
                defaults={
                    "name": entry.name,
                    "description": entry.description,
                    "is_active": True,
                    "sort_order": entry.sort_order,
                },
            )


def drop_payment_methods(apps, schema_editor):
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")
    PaymentMethod.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("hotel_settings", "0005_paymentmethod"),
        ("master_data", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_payment_methods, drop_payment_methods),
    ]
