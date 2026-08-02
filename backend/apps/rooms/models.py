from django.db import models

from apps.hotel_settings.models import HotelFloor
from apps.master_data.models import MasterData


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
    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.PROTECT,
        related_name="amenities",
        null=False,   # temporal para migración
        blank=False,  # temporal para migración
    )

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
                fields=["hotel_settings", "name"],
                name="uq_amenity_hotel_name",
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
