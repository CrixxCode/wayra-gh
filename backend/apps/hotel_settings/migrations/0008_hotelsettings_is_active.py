from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hotel_settings", "0007_payment_method_type_and_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="hotelsettings",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
