from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("packages", "0001_initial"),
        ("reservations", "0003_reservation_policies"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="package",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="reservations",
                to="packages.package",
            ),
        ),
        migrations.AddField(
            model_name="reservation",
            name="package_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="reservation",
            name="package_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
