from django.core.exceptions import ValidationError
from django.db import models

from apps.master_data.models import MasterData


class HotelSettings(models.Model):
    # ====== Información general ======

    # Nombre comercial del hotel
    hotel_name = models.CharField(max_length=150)

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

    # Fechas de control
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hotel_settings"
        verbose_name = "Hotel Settings"
        verbose_name_plural = "Hotel Settings"

    def __str__(self):
        return self.hotel_name


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
