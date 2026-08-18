from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0012_reservationguest_online_check_in_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="reservation",
            name="code",
            field=models.CharField(blank=True, editable=False, max_length=20, null=True, unique=True),
        ),
    ]
