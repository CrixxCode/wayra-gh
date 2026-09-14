import re
import unicodedata
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

    @property
    def has_structure(self) -> bool:
        """Una solicitud creada despues de 2026-09-14 trae pisos y tipos de habitacion.

        Las solicitudes viejas solo tienen `rooms`, y al convertirlas hay que caer al
        piso unico historico (ver `apps.demo_requests.views.build_hotel_structure`).
        """
        return self.floors.exists()


class DemoRequestRoomType(models.Model):
    """Tipo de habitacion declarado por el solicitante.

    Es una copia plana de `rooms.RoomType` + su tarifa base: la solicitud no puede
    apuntar al catalogo real porque el hotel todavia no existe. Al convertir, cada fila
    de aqui se convierte en un `RoomType` y un `Rate` del hotel nuevo.
    """

    class BillingMode(models.TextChoices):
        ROOM = "ROOM", "Habitacion completa"
        PERSON = "PERSON", "Por persona"

    demo_request = models.ForeignKey(
        DemoRequest,
        on_delete=models.CASCADE,
        related_name="room_types",
    )
    name = models.CharField(max_length=120)
    capacity = models.PositiveIntegerField(default=2)
    bed_count = models.PositiveIntegerField(default=1)
    bed_type = models.CharField(max_length=50, blank=True, default="")
    billing_mode = models.CharField(
        max_length=12,
        choices=BillingMode.choices,
        default=BillingMode.ROOM,
    )
    base_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "demo_request_room_type"
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["demo_request", "name"],
                name="uq_demo_req_room_type_name",
            ),
        ]

    @staticmethod
    def build_code(name: str) -> str:
        """`Suite Doble` -> `SUITE_DOBLE`. Mismo criterio que `PaymentMethod.build_code`."""
        normalized = unicodedata.normalize("NFD", str(name or ""))
        without_accents = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
        slug = re.sub(r"[^A-Za-z0-9]+", "_", without_accents).strip("_").upper()
        return slug[:80]

    def __str__(self):
        return f"{self.demo_request_id} - {self.name}"


class DemoRequestFloor(models.Model):
    """Piso declarado por el solicitante, con su prefijo de numeracion."""

    demo_request = models.ForeignKey(
        DemoRequest,
        on_delete=models.CASCADE,
        related_name="floors",
    )
    floor_number = models.PositiveIntegerField()
    name = models.CharField(max_length=80)
    prefix = models.CharField(max_length=10)

    class Meta:
        db_table = "demo_request_floor"
        ordering = ["floor_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["demo_request", "floor_number"],
                name="uq_demo_req_floor_number",
            ),
        ]

    @property
    def total_rooms(self) -> int:
        return sum(group.quantity for group in self.room_groups.all())

    def __str__(self):
        return f"{self.demo_request_id} - {self.name}"


class DemoRequestFloorRoomGroup(models.Model):
    """Cuantas habitaciones de un tipo hay en un piso.

    Se guarda agrupado y no habitacion por habitacion porque el formulario publico
    pide la estructura, no el inventario: un hotel de 40 habitaciones no va a escribir
    40 numeros en la landing. El numero de cada habitacion se genera al convertir,
    con el prefijo del piso (`prefix` + consecutivo de dos digitos).
    """

    floor = models.ForeignKey(
        DemoRequestFloor,
        on_delete=models.CASCADE,
        related_name="room_groups",
    )
    room_type = models.ForeignKey(
        DemoRequestRoomType,
        on_delete=models.CASCADE,
        related_name="floor_groups",
    )
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "demo_request_floor_room_group"
        ordering = ["room_type__sort_order", "room_type_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["floor", "room_type"],
                name="uq_demo_req_floor_room_type",
            ),
        ]

    def __str__(self):
        return f"{self.floor_id} - {self.room_type_id} x{self.quantity}"


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
