from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelFloor
from apps.master_data.models import MasterData


def room_photo_upload_to(instance, filename):
    hotel_id = instance.room.floor.hotel_settings_id if instance.room_id else "pending"
    room_id = instance.room_id or "pending"
    return f"hotel/rooms/{hotel_id}/{room_id}/{filename}"


class RoomType(models.Model):
    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.PROTECT,
        related_name="room_types",
        null=False,   # temporal para migración
        blank=False,  # temporal para migración
    )

    code = models.CharField(max_length=80)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, null=True)
    capacity = models.PositiveIntegerField(default=1)
    bed_count = models.PositiveIntegerField(default=1)
    bed_type = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "room_type"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["hotel_settings", "code"],
                name="uq_room_type_hotel_code",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.code:
            self.code = str(self.code).strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Rate(models.Model):
    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.PROTECT,
        related_name="rates",
        null=False,   # temporal para migración
        blank=False,  # temporal para migración
    )
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name="rates")
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rate"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.room_type}"


class Amenity(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "amenity"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
                name="uq_amenity_name",
            ),
        ]

    def __str__(self):
        return self.name


class Room(models.Model):
    number = models.CharField(max_length=20)
    room_type = models.ForeignKey(
        RoomType,
        on_delete=models.SET_NULL,
        related_name="rooms",
        null=True,
        blank=True,
    )
    rate = models.ForeignKey(
        Rate,
        on_delete=models.SET_NULL,
        related_name="rooms",
        null=True,
        blank=True,
    )
    floor = models.ForeignKey(
        HotelFloor,
        on_delete=models.CASCADE,
        related_name="rooms",
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="rooms_by_status",
        limit_choices_to={"group": MasterData.Group.ROOM_STATUS},
    )
    notes = models.TextField(blank=True, null=True)
    amenities = models.ManyToManyField(
        Amenity,
        related_name="room",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "room"
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(
                fields=["floor", "number"],
                name="uq_room_floor_number",
            ),
        ]

    @property
    def status_code(self):
        return self.status.code if self.status else None

    def get_status_display(self):
        return self.status.name if self.status else ""

    def __str__(self):
        return self.number


class RoomPhoto(models.Model):
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="photos",
    )
    image = models.ImageField(upload_to=room_photo_upload_to)
    alt_text = models.CharField(max_length=160, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "room_photo"
        ordering = ["sort_order", "id"]

    def delete(self, *args, **kwargs):
        storage = self.image.storage if self.image else None
        name = self.image.name if self.image else None
        result = super().delete(*args, **kwargs)
        if storage and name:
            storage.delete(name)
        return result


class MaintenanceOrder(models.Model):
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="maintenance_orders",
    )
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    priority = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="maintenance_orders_by_priority",
        limit_choices_to={"group": MasterData.Group.MAINTENANCE_PRIORITY},
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="maintenance_orders_by_status",
        limit_choices_to={"group": MasterData.Group.MAINTENANCE_STATUS},
    )
    reported_at = models.DateTimeField(auto_now_add=True)
    estimated_completed_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "maintenance_order"
        ordering = ["-reported_at"]

    @property
    def priority_code(self):
        return self.priority.code if self.priority else None

    @property
    def status_code(self):
        return self.status.code if self.status else None

    def get_priority_display(self):
        return self.priority.name if self.priority else ""

    def get_status_display(self):
        return self.status.name if self.status else ""

    def __str__(self):
        return f"{self.room.number} - {self.title}"


class CleaningTask(models.Model):
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="cleaning_tasks",
    )
    task_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="cleaning_tasks_by_type",
        limit_choices_to={"group": MasterData.Group.CLEANING_TASK_TYPE},
    )
    status = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="cleaning_tasks_by_status",
        limit_choices_to={"group": MasterData.Group.CLEANING_STATUS},
    )
    priority = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="cleaning_tasks_by_priority",
        limit_choices_to={"group": MasterData.Group.MAINTENANCE_PRIORITY},
        blank=True,
        null=True,
    )
    scheduled_for = models.DateField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cleaning_task"
        ordering = ["-created_at"]

    @property
    def task_type_code(self):
        return self.task_type.code if self.task_type else None

    @property
    def status_code(self):
        return self.status.code if self.status else None

    @property
    def priority_code(self):
        return self.priority.code if self.priority else None

    def get_task_type_display(self):
        return self.task_type.name if self.task_type else ""

    def get_status_display(self):
        return self.status.name if self.status else ""

    def get_priority_display(self):
        return self.priority.name if self.priority else ""

    def __str__(self):
        return f"{self.room.number} - {self.task_type}"


class RecurringWork(models.Model):
    """Regla que genera trabajo periodico: "cada lunes", "el 1 de cada mes".

    Se modela como una **regla que produce tareas**, no como una tarea que se repite.
    La diferencia importa: si la periodicidad viviera en la propia tarea, cerrarla
    borraria la programacion, cambiar la frecuencia reescribiria el historico, y no
    habria forma de contestar "que trabajo esta programado" sin recorrer todo lo hecho.

    El trabajo real lo materializa el comando `generate_recurring_work`, igual que el
    resto de tareas programadas del sistema (AGENTS.md 5.12).
    """

    class Kind(models.TextChoices):
        CLEANING = "CLEANING", "Limpieza"
        MAINTENANCE = "MAINTENANCE", "Mantenimiento"

    class Frequency(models.TextChoices):
        DAILY = "DAILY", "Diaria"
        WEEKLY = "WEEKLY", "Semanal"
        MONTHLY = "MONTHLY", "Mensual"

    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.CASCADE,
        related_name="recurring_work",
    )

    # Sin habitacion, la regla aplica a **todas** las activas del hotel: es el caso de
    # "revision de aires cada mes", que no es de una habitacion sino de todas.
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="recurring_work",
        blank=True,
        null=True,
    )

    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    name = models.CharField(max_length=150)

    # Solo para limpieza: que tipo de tarea se crea.
    task_type = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="recurring_work_by_task_type",
        limit_choices_to={"group": MasterData.Group.CLEANING_TASK_TYPE},
        blank=True,
        null=True,
    )
    priority = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="recurring_work_by_priority",
        limit_choices_to={"group": MasterData.Group.MAINTENANCE_PRIORITY},
        blank=True,
        null=True,
    )
    notes = models.TextField(blank=True, null=True)

    frequency = models.CharField(max_length=20, choices=Frequency.choices)
    # Cada cuantos periodos: 1 = todas las semanas, 2 = cada dos semanas.
    interval = models.PositiveIntegerField(default=1)
    # Lunes = 0, domingo = 6. Solo aplica a la frecuencia semanal.
    weekday = models.PositiveSmallIntegerField(blank=True, null=True)
    # Dia del mes. Si el mes no lo tiene (31 en febrero) se usa el ultimo dia.
    day_of_month = models.PositiveSmallIntegerField(blank=True, null=True)

    starts_on = models.DateField()
    ends_on = models.DateField(blank=True, null=True)

    # Proxima fecha en la que toca generar. Es el estado de la regla: se adelanta al
    # generar, y consultarlo contesta "cuando vuelve a tocar" sin recalcular nada.
    next_run_on = models.DateField(db_index=True)
    last_generated_on = models.DateField(blank=True, null=True)
    generated_count = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "recurring_work"
        ordering = ["next_run_on", "id"]

    def clean(self):
        errors = {}

        if self.interval is not None and self.interval < 1:
            errors["interval"] = "El intervalo debe ser de al menos 1."

        if self.frequency == self.Frequency.WEEKLY and self.weekday is None:
            errors["weekday"] = "Una regla semanal necesita un dia de la semana."

        if self.frequency == self.Frequency.MONTHLY and self.day_of_month is None:
            errors["day_of_month"] = "Una regla mensual necesita un dia del mes."

        if self.weekday is not None and not 0 <= self.weekday <= 6:
            errors["weekday"] = "El dia de la semana va de 0 (lunes) a 6 (domingo)."

        if self.day_of_month is not None and not 1 <= self.day_of_month <= 31:
            errors["day_of_month"] = "El dia del mes va de 1 a 31."

        if self.ends_on and self.starts_on and self.ends_on < self.starts_on:
            errors["ends_on"] = "La fecha de fin no puede ser anterior a la de inicio."

        if self.kind == self.Kind.CLEANING and not self.task_type_id:
            errors["task_type"] = "Una regla de limpieza necesita un tipo de tarea."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.name} ({self.get_frequency_display()})"
