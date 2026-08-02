from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hotel_settings", "0003_reservationpolicy"),
    ]

    operations = [
        migrations.AlterField(
            model_name="hotelsettings",
            name="logo",
            field=models.URLField(blank=True, null=True),
        ),
    ]

