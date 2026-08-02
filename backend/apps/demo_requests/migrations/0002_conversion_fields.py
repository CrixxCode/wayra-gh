from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("demo_requests", "0001_initial"),
        ("hotel_settings", "0004_alter_hotelsettings_logo_url"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="demorequest",
            name="converted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="converted_hotel_settings",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="demo_requests",
                to="hotel_settings.hotelsettings",
            ),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="converted_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="demo_requests",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="demorequest",
            name="password_reset_sent",
            field=models.BooleanField(default=False),
        ),
    ]
