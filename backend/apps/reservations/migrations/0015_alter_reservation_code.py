from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0014_backfill_reservation_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="reservation",
            name="code",
            field=models.CharField(blank=True, editable=False, max_length=20, unique=True),
        ),
    ]
