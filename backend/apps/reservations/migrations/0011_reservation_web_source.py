from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reservations", "0010_deposit_hotel_payment_method"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="source_channel",
            field=models.CharField(blank=True, db_index=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="reservation",
            name="source_detail",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddField(
            model_name="reservation",
            name="source_url",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="reservation",
            name="source_referrer",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="reservation",
            name="source_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
