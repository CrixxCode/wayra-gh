from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0004_room_type_model_fk"),
    ]

    operations = [
        migrations.AddField(
            model_name="maintenanceorder",
            name="estimated_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

