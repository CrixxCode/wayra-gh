from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("demo_requests", "0002_conversion_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="demorequest",
            name="address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="check_in_time",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="check_out_time",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="country",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="state",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
    ]
