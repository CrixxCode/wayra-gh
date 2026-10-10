from django.db import migrations


def seed_no_show_status(apps, schema_editor):
    """Estado "No se presento" de la reserva (auditoria, Bloque 6 #10; decision del 2026-10-09)."""
    MasterData = apps.get_model("master_data", "MasterData")
    MasterData.objects.update_or_create(
        group="RESERVATION_STATUS",
        code="NO_SHOW",
        defaults={"name": "No se presento", "sort_order": 6, "is_active": True},
    )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("master_data", "0020_seed_invoice_reconciliation_statuses"),
    ]

    operations = [
        migrations.RunPython(seed_no_show_status, noop_reverse),
    ]
