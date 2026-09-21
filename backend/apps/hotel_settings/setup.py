"""Reglas compartidas para la alerta y el bloqueo de operaciones del hotel."""

from django.contrib.contenttypes.models import ContentType
from django.db.models import CharField, F
from django.db.models.functions import Cast

from accounts.models import SoftDeleteMarker
from accounts.tenancy import is_effective_global_admin
from apps.rooms.models import Room


REQUIRED_SETUP_FIELDS = (
    ("hotel_name", "nombre del hotel"),
    ("legal_name", "razón social"),
    ("address", "dirección"),
    ("country", "país"),
    ("state", "departamento"),
    ("city", "ciudad"),
    ("primary_phone", "teléfono"),
    ("general_email", "correo"),
    ("reservations_email", "correo de reservas"),
    ("check_in_time", "hora de check-in"),
    ("check_out_time", "hora de check-out"),
)


def missing_hotel_setup_fields(user):
    # El administrador de plataforma conserva el acceso a la gestion global.
    exempt = is_effective_global_admin(user)
    hotel = getattr(user, "hotel_settings", None)
    if exempt:
        return []
    missing = [
        {"field": field, "label": label}
        for field, label in REQUIRED_SETUP_FIELDS
        if not str(getattr(hotel, field, None) or "").strip()
    ]
    if hotel is None or hotel.latitude is None or hotel.longitude is None:
        missing.append({"field": "coordinates", "label": "ubicación en el mapa"})
    if hotel is None or not has_operable_room_structure(hotel):
        missing.append(
            {
                "field": "floors",
                "label": "habitaciones con tipo y tarifa",
            }
        )
    return missing


def configured_room_queryset(hotel):
    if hotel is None:
        return Room.objects.none()

    room_content_type = ContentType.objects.get_for_model(Room)
    deleted_ids = SoftDeleteMarker.objects.filter(
        content_type=room_content_type,
    ).values("object_id")

    return (
        Room.objects.filter(
            floor__hotel_settings=hotel,
            room_type__is_active=True,
            rate__is_active=True,
            room_type__hotel_settings_id=F("floor__hotel_settings_id"),
            rate__hotel_settings_id=F("floor__hotel_settings_id"),
            rate__room_type_id=F("room_type_id"),
        )
        .annotate(_soft_pk=Cast("pk", output_field=CharField()))
        .exclude(_soft_pk__in=deleted_ids)
    )


def has_operable_room_structure(hotel) -> bool:
    return configured_room_queryset(hotel).exists()


def hotel_setup_status(user):
    missing = missing_hotel_setup_fields(user)
    exempt = is_effective_global_admin(user)
    keys = {str(key).replace("-", "_").lower() for key in user.resource_keys()}
    return {
        "is_complete": not missing,
        "missing_fields": missing,
        "can_configure": exempt or bool(keys & {"*", "hotel_settings.*", "hotel_settings.write"}),
        "must_change_password": bool(user.must_change_password),
    }
