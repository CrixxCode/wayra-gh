import uuid
from django.contrib.auth.models import AbstractUser
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_title = models.CharField(max_length=120, blank=True, default="")
    avatar = models.URLField(blank=True, default="")
    must_change_password = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True)

    hotel_settings = models.ForeignKey(
        "hotel_settings.HotelSettings",
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )

    def resource_keys(self) -> set[str]:
        """
        Conjunto de Resource.key agregados por roles del usuario.
        """
        keys_qs = (
            Resource.objects.filter(
                is_active=True,
                roleresource__is_active=True,
                roleresource__role__is_active=True,
                roleresource__role__userrole__user=self,
                roleresource__role__userrole__is_active=True,
            )
            .exclude(key__isnull=True)
            .exclude(key__exact="")
            .values_list("key", flat=True)
            .distinct()
        )
        return set(keys_qs)
    def clean(self):
        super().clean()

        if not self.is_superuser and self.hotel_settings is None:
            raise ValidationError({
                "hotel_settings": "Este usuario debe pertenecer a un hotel."
            })


class Role(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    users = models.ManyToManyField("User", related_name="roles", through="UserRole")

    def __str__(self):
        return self.name


class JobTitle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="job_titles")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("role", "slug")
        ordering = ("sort_order", "name")

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.slug = slugify(self.slug)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.role.name} - {self.name}"


class Resource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # RBAC
    key = models.CharField(max_length=120, unique=True)  # p.ej. "users.read"
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    # Enlaces
    link = models.CharField(blank=True)         # ruta FRONTEND (Angular) ej: "/reservas"
    link_backend = models.CharField(blank=True) # ruta BACKEND (API) ej: "/api/reservas/"

    # CAMPOS PARA MENÚ DINÁMICO
    icon = models.CharField(max_length=160, blank=True)  # ej: "fa-solid fa-calendar w-5"
    order = models.PositiveIntegerField(default=0)       # orden en el menú
    is_menu = models.BooleanField(default=True)          # si se muestra en el aside
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.CASCADE
    )

    roles = models.ManyToManyField("Role", related_name="resources", through="RoleResource")

    def __str__(self):
        return self.key


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "role")


class RoleResource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("role", "resource")


class NotificationReadState(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("User", on_delete=models.CASCADE, related_name="notification_read_states")
    notification_key = models.CharField(max_length=180)
    read_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "notification_key")
        indexes = [
            models.Index(fields=["user", "notification_key"]),
            models.Index(fields=["user", "updated_at"]),
        ]

    def __str__(self):
        return f"{self.user_id}:{self.notification_key}"


class SoftDeleteMarker(models.Model):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64)
    deleted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("content_type", "object_id")
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
        ]
