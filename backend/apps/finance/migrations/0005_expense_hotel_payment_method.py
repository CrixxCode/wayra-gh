"""`Expense.payment_method` pasa del catalogo global al del hotel.

Mismo procedimiento que en `billing`: campo nuevo anulable, mapeo, borrado del viejo y
renombrado. El mapeo crea bajo demanda los metodos que no se sembraron, para no perder
el dato de registros historicos.
"""

from django.db import migrations, models
import django.db.models.deletion


def migrate_payment_methods(apps, schema_editor):
    Model = apps.get_model("finance", "Expense")
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")

    cache = {}
    for row in Model.objects.select_related("payment_method", "hotel_settings").all():
        legacy = row.payment_method
        hotel_id = getattr(row, "hotel_settings_id", None)
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

        row.hotel_payment_method = method
        row.save(update_fields=["hotel_payment_method"])


def reverse_payment_methods(apps, schema_editor):
    Model = apps.get_model("finance", "Expense")
    MasterData = apps.get_model("master_data", "MasterData")

    for row in Model.objects.select_related("hotel_payment_method").all():
        method = row.hotel_payment_method
        if method is None:
            continue

        legacy = MasterData.objects.filter(group="PAYMENT_METHOD", code=method.code).first()
        if legacy is None:
            legacy = MasterData.objects.create(
                group="PAYMENT_METHOD",
                code=method.code,
                name=method.name,
                is_active=method.is_active,
                sort_order=method.sort_order,
            )

        row.payment_method = legacy
        row.save(update_fields=["payment_method"])


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0004_financialcontrolconfig_operational_high_occupancy_threshold_pct_and_more"),
        ("hotel_settings", "0006_seed_payment_methods"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="hotel_payment_method",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expenses_by_payment_method",
                to="hotel_settings.paymentmethod",
            ),
        ),
        migrations.RunPython(migrate_payment_methods, reverse_payment_methods),
        migrations.RemoveField(model_name="expense", name="payment_method"),
        migrations.RenameField(
            model_name="expense",
            old_name="hotel_payment_method",
            new_name="payment_method",
        ),
        migrations.AlterField(
            model_name="expense",
            name="payment_method",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="expenses_by_payment_method",
                to="hotel_settings.paymentmethod",
            ),
        ),
    ]
