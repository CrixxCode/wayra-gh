"""`Payment.payment_method` deja de apuntar al catalogo global y pasa al del hotel.

Se hace en una sola migracion con cuatro pasos: se agrega el campo nuevo anulable, se
mapean los pagos existentes, se borra el viejo y se renombra. Al final el campo vuelve a
ser obligatorio, como era.

El mapeo usa `get_or_create`: si un pago viejo apunta a un metodo que no se sembro
—porque estaba inactivo en el catalogo global— se crea para ese hotel en vez de perder
el dato o dejar el campo en null.
"""

from django.db import migrations, models
import django.db.models.deletion


def resolve_hotel_id(payment):
    """Un pago llega al hotel por factura -> reserva."""
    invoice = getattr(payment, "invoice", None)
    reservation = getattr(invoice, "reservation", None)
    return getattr(reservation, "hotel_settings_id", None)


def migrate_payment_methods(apps, schema_editor):
    Payment = apps.get_model("billing", "Payment")
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")

    payments = Payment.objects.select_related(
        "payment_method", "invoice__reservation"
    ).all()

    cache = {}
    for payment in payments:
        legacy = payment.payment_method
        hotel_id = resolve_hotel_id(payment)
        if legacy is None or hotel_id is None:
            continue

        code = str(legacy.code or "").strip().upper()
        key = (hotel_id, code)
        method = cache.get(key)
        if method is None:
            method, _ = PaymentMethod.objects.get_or_create(
                hotel_settings_id=hotel_id,
                code=code,
                defaults={
                    "name": legacy.name,
                    "description": legacy.description,
                    "is_active": legacy.is_active,
                    "sort_order": legacy.sort_order,
                },
            )
            cache[key] = method

        payment.hotel_payment_method = method
        payment.save(update_fields=["hotel_payment_method"])


def reverse_payment_methods(apps, schema_editor):
    """Vuelve al catalogo global buscando por codigo."""
    Payment = apps.get_model("billing", "Payment")
    MasterData = apps.get_model("master_data", "MasterData")

    for payment in Payment.objects.select_related("hotel_payment_method").all():
        method = payment.hotel_payment_method
        if method is None:
            continue

        legacy = MasterData.objects.filter(
            group="PAYMENT_METHOD", code=method.code
        ).first()
        if legacy is None:
            legacy = MasterData.objects.create(
                group="PAYMENT_METHOD",
                code=method.code,
                name=method.name,
                is_active=method.is_active,
                sort_order=method.sort_order,
            )

        payment.payment_method = legacy
        payment.save(update_fields=["payment_method"])


class Migration(migrations.Migration):

    atomic = False

    dependencies = [
        ("billing", "0006_paymentrefund"),
        ("hotel_settings", "0006_seed_payment_methods"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="hotel_payment_method",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="payments_by_method",
                to="hotel_settings.paymentmethod",
            ),
        ),
        migrations.RunPython(migrate_payment_methods, reverse_payment_methods),
        migrations.RemoveField(model_name="payment", name="payment_method"),
        migrations.RenameField(
            model_name="payment",
            old_name="hotel_payment_method",
            new_name="payment_method",
        ),
        migrations.AlterField(
            model_name="payment",
            name="payment_method",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="payments_by_method",
                to="hotel_settings.paymentmethod",
            ),
        ),
    ]
