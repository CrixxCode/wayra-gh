import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("demo_requests", "0003_demo_request_hotel_configuration_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="DemoRequestEmailVerification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(db_index=True, max_length=254)),
                ("token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("code_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("source_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "demo_request_email_verification",
                "ordering": ["-created_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="demorequestemailverification",
            index=models.Index(fields=["email", "used_at", "expires_at"], name="demo_verif_email_state_idx"),
        ),
        migrations.AddIndex(
            model_name="demorequestemailverification",
            index=models.Index(fields=["token", "expires_at"], name="demo_verif_token_exp_idx"),
        ),
    ]
