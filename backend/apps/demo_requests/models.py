import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone


class DemoRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "NEW", "Nueva"
        CONTACTED = "CONTACTED", "Contactada"
        CONVERTED = "CONVERTED", "Convertida"
        DISCARDED = "DISCARDED", "Descartada"

    hotel_name = models.CharField(max_length=150)
    hotel_type = models.CharField(max_length=80)
    country = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    city = models.CharField(max_length=100)
    address = models.CharField(max_length=255, blank=True, default="")
    rooms = models.PositiveIntegerField()
    website = models.CharField(max_length=255, blank=True, default="")
    check_in_time = models.TimeField(blank=True, null=True)
    check_out_time = models.TimeField(blank=True, null=True)

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


class DemoRequestEmailVerification(models.Model):
    email = models.EmailField(db_index=True)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(blank=True, null=True)
    source_ip = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "demo_request_email_verification"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["email", "used_at", "expires_at"], name="demo_verif_email_state_idx"),
            models.Index(fields=["token", "expires_at"], name="demo_verif_token_exp_idx"),
        ]

    @classmethod
    def create_for_email(
        cls,
        *,
        email: str,
        code: str,
        expires_at,
        source_ip: str | None = None,
        user_agent: str = "",
    ):
        return cls.objects.create(
            email=str(email or "").strip().lower(),
            code_hash=make_password(code),
            expires_at=expires_at,
            source_ip=source_ip or None,
            user_agent=str(user_agent or "")[:255],
        )

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def code_matches(self, code: str) -> bool:
        return check_password(str(code or "").strip(), self.code_hash)

    def __str__(self):
        return f"{self.email} - {self.created_at:%Y-%m-%d %H:%M}"
