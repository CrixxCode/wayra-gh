# Generated manually for the demo_requests app.

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="DemoRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hotel_name", models.CharField(max_length=150)),
                ("hotel_type", models.CharField(max_length=80)),
                ("city", models.CharField(max_length=100)),
                ("rooms", models.PositiveIntegerField()),
                ("website", models.CharField(blank=True, default="", max_length=255)),
                ("requester_first_name", models.CharField(max_length=80)),
                ("requester_last_name", models.CharField(max_length=120)),
                ("requester_username", models.CharField(max_length=150)),
                ("requester_email", models.EmailField(max_length=254)),
                ("requester_job_title", models.CharField(max_length=120)),
                ("requester_phone", models.CharField(max_length=40)),
                ("message", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("NEW", "Nueva"),
                            ("CONTACTED", "Contactada"),
                            ("CONVERTED", "Convertida"),
                            ("DISCARDED", "Descartada"),
                        ],
                        db_index=True,
                        default="NEW",
                        max_length=20,
                    ),
                ),
                ("source_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "demo_request",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="demorequest",
            index=models.Index(fields=["requester_email", "created_at"], name="demo_req_email_created_idx"),
        ),
        migrations.AddIndex(
            model_name="demorequest",
            index=models.Index(fields=["status", "created_at"], name="demo_req_status_created_idx"),
        ),
    ]
