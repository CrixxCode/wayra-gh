from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0012_user_hotel_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="job_title",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]

