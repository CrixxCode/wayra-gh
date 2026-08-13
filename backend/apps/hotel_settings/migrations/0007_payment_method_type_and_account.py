"""Un metodo de pago pasa a ser: nombre, tipo y numero de cuenta.

Se agregan `method_type` y `account_number`, y se retiran `description` y `sort_order`,
que no aportaban nada a la operacion.

Los metodos que ya existian se clasifican por su nombre: los que suenan a movimiento
bancario quedan como transferencia y el resto como efectivo. Es una heuristica, no una
verdad: por eso las transferencias quedan **sin numero de cuenta**, para que el hotel lo
complete y de paso revise la clasificacion.
"""

from django.db import migrations, models

TRANSFER_HINTS = (
    "TRANSFER",
    "NEQUI",
    "DAVIPLATA",
    "PSE",
    "QR",
    "BANCO",
    "CONSIGNA",
    "DEPOSITO",
)

CASH = "EFECTIVO"
TRANSFER = "TRANSFERENCIA"


def classify_existing_methods(apps, schema_editor):
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")

    for method in PaymentMethod.objects.all():
        haystack = f"{method.code or ''} {method.name or ''}".upper()
        looks_like_transfer = any(hint in haystack for hint in TRANSFER_HINTS)
        method.method_type = TRANSFER if looks_like_transfer else CASH
        method.save(update_fields=["method_type"])


def reset_method_type(apps, schema_editor):
    PaymentMethod = apps.get_model("hotel_settings", "PaymentMethod")
    PaymentMethod.objects.update(method_type=CASH)


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("hotel_settings", "0006_seed_payment_methods"),
        ("billing", "0007_payment_hotel_payment_method"),
        ("finance", "0005_expense_hotel_payment_method"),
        ("reservations", "0010_deposit_hotel_payment_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentmethod",
            name="method_type",
            field=models.CharField(
                choices=[("EFECTIVO", "Efectivo"), ("TRANSFERENCIA", "Transferencia")],
                default="EFECTIVO",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="paymentmethod",
            name="account_number",
            field=models.CharField(blank=True, max_length=60, null=True),
        ),
        migrations.RunPython(classify_existing_methods, reset_method_type),
        migrations.RemoveField(model_name="paymentmethod", name="description"),
        migrations.RemoveField(model_name="paymentmethod", name="sort_order"),
        migrations.AlterModelOptions(
            name="paymentmethod",
            options={"ordering": ["name"]},
        ),
    ]
