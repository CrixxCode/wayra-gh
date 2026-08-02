from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_user_password_change_flags"),
    ]

    operations = [
        migrations.CreateModel(
            name="JobTitle",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("role", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="job_titles", to="accounts.role")),
            ],
            options={
                "ordering": ("sort_order", "name"),
                "unique_together": {("role", "slug")},
            },
        ),
    ]
