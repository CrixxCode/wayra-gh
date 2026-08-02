from django.db import models


class DemoRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "Nueva"
        CONTACTED = "CONTACTED", "Contactada"
        CONVERTED = "CONVERTED", "Convertida"
        DISCARDED = "DISCARDED", "Descartada"

    hotel_name = models.CharField(max_length=150)
    hotel_type = models.CharField(max_length=80)
    city = models.CharField(max_length=100)
    rooms = models.PositiveIntegerField()
    website = models.CharField(max_length=255, blank=True, default="")

    requester_first_name = models.CharField(max_length=80)
    requester_last_name = models.CharField(max_length=120)
    requester_username = models.CharField(max_length=150)
    requester_email = models.EmailField()
    requester_job_title = models.CharField(max_length=120)
    requester_phone = models.CharField(max_length=40)
    message = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    converted_hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.PROTECT,
        related_name="demo_requests",
        blank=True,
        null=True,
    )
    converted_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.PROTECT,
        related_name="demo_requests",
        blank=True,
        null=True,
    )
    converted_at = models.DateTimeField(blank=True, null=True)
    password_reset_sent = models.BooleanField(default=False)
    source_ip = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "demo_request"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["requester_email", "created_at"], name="demo_req_email_created_idx"),
            models.Index(fields=["status", "created_at"], name="demo_req_status_created_idx"),
        ]

    def __str__(self):
        return f"{self.hotel_name} - {self.requester_email}"
