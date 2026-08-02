from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("rooms", "0009_alter_amenity_hotel_settings_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="room",
            name="number",
            field=models.CharField(max_length=20),
        ),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.UniqueConstraint(
                fields=("floor", "number"),
                name="uq_room_floor_number",
            ),
        ),
    ]
