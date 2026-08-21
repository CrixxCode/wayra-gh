import re
import unicodedata

from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction

from apps.master_data.models import MasterData


MAX_GALLERY_IMAGE_SIZE = 2 * 1024 * 1024


def hotel_photo_upload_to(instance, filename):
    return f"hotel/photos/{instance.hotel_settings_id}/{filename}"


class HotelSettings(models.Model):
    RESERVATION_PREFIX_MAX_LENGTH = 5
    RESERVATION_PREFIX_GENERATION_ATTEMPTS = 1000
    RESERVATION_PREFIX_STOP_WORDS = {
        "APARTA",
        "APARTAHOTEL",
        "APARTAMENTO",
        "CASA",
        "EL",
        "FINCA",
        "HACIENDA",
        "HOSTAL",
        "HOSTEL",
        "HOTEL",
        "LA",
        "LAS",
        "LOS",
        "POSADA",
        "RESORT",
    }
    RESERVATION_PREFIX_HONORIFICS = {"DON", "DONA", "SAN", "SANTA"}

    # ====== Información general ======

    # Nombre comercial del hotel
    hotel_name = models.CharField(max_length=150)

    # Prefijo estable y globalmente unico para codigos publicos de reserva.
    reservation_code_prefix = models.CharField(
        max_length=RESERVATION_PREFIX_MAX_LENGTH,
        unique=True,
        editable=False,
        blank=True,
    )

    # Razón social o nombre legal
    legal_name = models.CharField(max_length=180, blank=True, null=True)

    # Eslogan del hotel
    slogan = models.CharField(max_length=180, blank=True, null=True)

    # Descripción general
    description = models.TextField(blank=True, null=True)

    # Logo del hotel
    logo = models.URLField(blank=True, null=True)

    # Categoría del hotel (1 a 5 estrellas)
    stars = models.PositiveSmallIntegerField(default=3)

    # Redes sociales
    facebook = models.CharField(max_length=180, blank=True, null=True)
    instagram = models.CharField(max_length=180, blank=True, null=True)
    twitter_x = models.CharField(max_length=180, blank=True, null=True)

    # Colores de marca (hex, "#rrggbb"). Se guardan en el hotel -y no en el navegador de
    # cada usuario- para que todo el personal del hotel vea la misma interfaz coloreada,
    # sin importar desde que dispositivo entre.
    primary_color = models.CharField(max_length=7, default="#0f1f41")
    secondary_color = models.CharField(max_length=7, default="#112853")

    # ====== Contacto y ubicación ======

    # Dirección física
    address = models.CharField(max_length=255, blank=True, null=True)

    # Ciudad
    city = models.CharField(max_length=100, blank=True, null=True)

    # Estado / provincia / departamento
    state = models.CharField(max_length=100, blank=True, null=True)

    # País
    country = models.CharField(max_length=100, blank=True, null=True)

    # Código postal
    postal_code = models.CharField(max_length=20, blank=True, null=True)

    # Punto exacto en el mapa.
    #
    # La dirección escrita no basta para ubicar un hotel: "carrera 14a # 27b 28" puede
    # geocodificarse a media cuadra de distancia, y en un pueblo pequeño a varias. Por eso
    # el usuario puede corregir el punto a mano en el mapa, y lo que manda es lo que quedó
    # guardado aquí.
    #
    # `Decimal` y no `Float`: la latitud/longitud es un dato que se compara y se muestra,
    # y el binario flotante arrastra error de redondeo al guardarse y releerse. Seis
    # decimales dan ~11 cm, de sobra para señalar una puerta.
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, blank=True, null=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, blank=True, null=True
    )

    # Teléfonos
    primary_phone = models.CharField(max_length=30, blank=True, null=True)
    secondary_phone = models.CharField(max_length=30, blank=True, null=True)

    # Correos
    general_email = models.EmailField(blank=True, null=True)
    reservations_email = models.EmailField(blank=True, null=True)

    # Sitio web
    website = models.URLField(blank=True, null=True)

    # ====== Operación ======

    # Hora estándar de check-in
    check_in_time = models.TimeField(blank=True, null=True)

    # Hora estándar de check-out
    check_out_time = models.TimeField(blank=True, null=True)

    # Máximo de huéspedes por habitación
    max_guests_per_room = models.PositiveIntegerField(default=2)

    # Moneda principal
    currency = models.CharField(max_length=20, default="COP")

    # Tasa de impuesto (%)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # Idioma del sistema
    system_language = models.CharField(max_length=20, default="es")

    # Zona horaria
    timezone = models.CharField(max_length=80, default="America/Bogota")

    # Estado operativo del hotel dentro de Wayra.
    is_active = models.BooleanField(default=True)

    # Fechas de control
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hotel_settings"
        verbose_name = "Hotel Settings"
        verbose_name_plural = "Hotel Settings"

    def __str__(self):
        return self.hotel_name

    @classmethod
    def build_reservation_code_prefix(cls, hotel_name: str) -> str:
        normalized = unicodedata.normalize("NFD", str(hotel_name or ""))
        without_accents = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
        raw_tokens = re.findall(r"[A-Za-z0-9]+", without_accents.upper())
        tokens = [token for token in raw_tokens if token not in cls.RESERVATION_PREFIX_STOP_WORDS]
        if not tokens:
            tokens = raw_tokens

        first = tokens[0] if tokens else "HTL"
        second = tokens[1] if len(tokens) > 1 else ""

        if first in cls.RESERVATION_PREFIX_HONORIFICS and second:
            prefix = f"{first[0]}{second[0]}{second[-1]}"
        elif len(first) >= 3:
            prefix = first[:3]
        elif second:
            prefix = f"{first[:1]}{second[:1]}{second[-1:]}"
        else:
            prefix = first

        return re.sub(r"[^A-Z0-9]", "", prefix).ljust(3, "X")[:3]

    @classmethod
    def build_unique_reservation_code_prefix(cls, hotel_name: str, exclude_pk=None) -> str:
        base = cls.build_reservation_code_prefix(hotel_name)

        for attempt in range(cls.RESERVATION_PREFIX_GENERATION_ATTEMPTS):
            if attempt == 0:
                candidate = base
            else:
                suffix = str(attempt + 1)
                candidate = f"{base[: cls.RESERVATION_PREFIX_MAX_LENGTH - len(suffix)]}{suffix}"

            qs = cls.objects.filter(reservation_code_prefix=candidate)
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)

            if not qs.exists():
                return candidate

        raise ValidationError(
            {
                "reservation_code_prefix": (
                    "No fue posible generar un prefijo unico para codigos de reserva."
                )
            }
        )

    def save(self, *args, **kwargs):
        if self.hotel_name:
            self.hotel_name = str(self.hotel_name).strip()

        if not self.reservation_code_prefix:
            self.reservation_code_prefix = self.build_unique_reservation_code_prefix(
                self.hotel_name,
                exclude_pk=self.pk,
            )
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {"reservation_code_prefix"}

        should_retry_prefix = self._state.adding
        for attempt in range(5):
            try:
                with transaction.atomic():
                    return super().save(*args, **kwargs)
            except IntegrityError:
                if not should_retry_prefix or attempt >= 4:
                    raise
                self.pk = None
                self._state.adding = True
                self.reservation_code_prefix = self.build_unique_reservation_code_prefix(
                    self.hotel_name
                )


class HotelPhoto(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="photos",
    )
    image = models.ImageField(upload_to=hotel_photo_upload_to)
    alt_text = models.CharField(max_length=160, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hotel_photo"
        ordering = ["sort_order", "id"]

    def delete(self, *args, **kwargs):
        storage = self.image.storage if self.image else None
        name = self.image.name if self.image else None
        result = super().delete(*args, **kwargs)
        if storage and name:
            storage.delete(name)
        return result


class HotelFloor(models.Model):
    # Relación con la configuración general del hotel
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="floors"
    )

    # Número del piso
    floor_number = models.PositiveIntegerField()

    # Nombre visible del piso
    name = models.CharField(max_length=80)

    # Prefijo usado para numeración de habitaciones
    prefix = models.CharField(max_length=10)

    # Cantidad de habitaciones del piso
    room_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "hotel_floor"
        ordering = ["floor_number"]
        unique_together = ("hotel_settings", "floor_number")

    def __str__(self):
        return f"{self.name} ({self.floor_number})"

class ReservationPolicy(models.Model):
    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="reservation_policies",
    )
    policy_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="reservation_policies_by_type",
        limit_choices_to={"group": MasterData.Group.RESERVATION_POLICY_TYPE},
    )
    penalty_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="reservation_policies_by_penalty_type",
        limit_choices_to={"group": MasterData.Group.RESERVATION_PENALTY_TYPE},
    )

    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)

    penalty_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        blank=True,
        null=True,
        default=0,
    )
    hours_before_checkin = models.PositiveIntegerField(blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reservation_policy"
        ordering = ["-id"]
        unique_together = ("hotel_settings", "name")

    @property
    def policy_type_code(self):
        return self.policy_type.code if self.policy_type else None

    @property
    def penalty_type_code(self):
        return self.penalty_type.code if self.penalty_type else None

    def clean(self):
        errors = {}

        if self.penalty_value is not None and self.penalty_value < 0:
            errors["penalty_value"] = "Penalty value cannot be negative."

        if self.hours_before_checkin is not None and self.hours_before_checkin < 0:
            errors["hours_before_checkin"] = "Hours before check-in cannot be negative."

        if self.penalty_type:
            penalty_code = (self.penalty_type.code or "").strip().upper()

            if penalty_code in ["PERCENTAGE"] and self.penalty_value is None:
                errors["penalty_value"] = "Penalty value is required for percentage penalties."

            if penalty_code == "PERCENTAGE" and self.penalty_value is not None:
                if self.penalty_value > 100:
                    errors["penalty_value"] = "Percentage penalty cannot be greater than 100."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} - {self.hotel_settings.hotel_name}"


class PaymentMethod(models.Model):
    """Metodos de pago **propios de cada hotel** (ver AGENTS.md 5.16).

    Un metodo se define con tres cosas: nombre, tipo y —si es transferencia— el numero
    de cuenta al que se consigna. El `code` no lo escribe el usuario: se deriva del
    nombre, porque varias pantallas de facturacion lo usan para elegir icono y etiqueta,
    y porque su unicidad por hotel es lo que impide dos metodos con el mismo nombre.
    """

    class MethodType(models.TextChoices):
        CASH = "EFECTIVO", "Efectivo"
        TRANSFER = "TRANSFERENCIA", "Transferencia"

    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.CASCADE,
        related_name="payment_methods",
    )

    name = models.CharField(max_length=120)
    method_type = models.CharField(
        max_length=20,
        choices=MethodType.choices,
        default=MethodType.CASH,
    )
    # Solo aplica a transferencias; en efectivo se guarda vacio.
    account_number = models.CharField(max_length=60, blank=True, null=True)

    # Derivado del nombre, no editable desde la UI.
    code = models.CharField(max_length=40)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_method"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["hotel_settings", "code"],
                name="uq_payment_method_hotel_code",
            )
        ]

    @property
    def requires_account_number(self) -> bool:
        return self.method_type == self.MethodType.TRANSFER

    @staticmethod
    def build_code(name: str) -> str:
        """`Nequi Bancolombia` -> `NEQUI_BANCOLOMBIA`."""
        normalized = unicodedata.normalize("NFD", str(name or ""))
        without_accents = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
        slug = re.sub(r"[^A-Za-z0-9]+", "_", without_accents).strip("_").upper()
        return slug[:40]

    def save(self, *args, **kwargs):
        if self.name:
            self.name = str(self.name).strip()
        self.code = self.build_code(self.name)

        if not self.requires_account_number:
            # Un metodo en efectivo no arrastra numero de cuenta.
            self.account_number = None
        elif self.account_number:
            self.account_number = str(self.account_number).strip()

        super().save(*args, **kwargs)

    def clean(self):
        errors = {}

        if not str(self.name or "").strip():
            errors["name"] = "El nombre del metodo de pago es obligatorio."
        elif not self.build_code(self.name):
            errors["name"] = "El nombre debe tener al menos una letra o numero."

        if self.requires_account_number and not str(self.account_number or "").strip():
            errors["account_number"] = "Una transferencia necesita numero de cuenta."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} ({self.hotel_settings.hotel_name})"
