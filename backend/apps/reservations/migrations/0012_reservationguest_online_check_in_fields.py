from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reservations", "0011_reservation_web_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservationguest",
            name="email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name="reservationguest",
            name="phone",
            field=models.CharField(blank=True, max_length=40, null=True),
        ),
        migrations.AddField(
            model_name="reservationguest",
            name="arrival_time_window",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="reservationguest",
            name="notes",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reservationguest",
            name="accepts_data_policy",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservationguest",
            name="online_check_in_submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
