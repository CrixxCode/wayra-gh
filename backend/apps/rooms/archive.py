"""
Archivado (borrado logico) de habitaciones, con un solo freno para todos los caminos.

Una habitacion se archiva desde su propio endpoint, al reducir o borrar un piso, y al
"limpiar" la configuracion del hotel. Antes solo `RoomViewSet` frenaba el archivado con
reservas activas: por los otros tres caminos la reserva quedaba apuntando a una habitacion
que recepcion ya no ve (ver AGENTS.md 5.26).
"""

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from accounts.models import SoftDeleteMarker
from apps.reservations.services import INACTIVE_RESERVATION_STATUS_CODES

from .models import Room


def active_reservation_codes(room: Room, limit: int = 5) -> list[str]:
    """Codigos de las reservas vivas (ni canceladas ni finalizadas) de la habitacion."""
    blocking_reservations = (
        room.reservation_details.exclude(
            reservation__status__code__in=INACTIVE_RESERVATION_STATUS_CODES
        )
        .select_related("reservation")
        .order_by("reservation__expected_check_in")
    )
    return [
        detail.reservation.code
        for detail in blocking_reservations[:limit]
        if getattr(detail, "reservation", None)
    ]


def room_archive_blocker(room: Room) -> str | None:
    """Por que no se puede archivar la habitacion, o `None` si se puede."""
    blocking_codes = active_reservation_codes(room)
    if not blocking_codes:
        return None
    return (
        "No se puede eliminar la habitación "
        f"{room.number}: tiene reservas activas "
        f"({', '.join(blocking_codes)}). Cancélalas o muévelas a otra "
        "habitación primero."
    )


def ensure_rooms_can_be_archived(rooms) -> None:
    """Valida todas antes de archivar ninguna: un piso no queda borrado a medias."""
    messages = [message for message in (room_archive_blocker(room) for room in rooms) if message]
    if messages:
        # La clave no es `detail` a proposito: `accounts.exceptions.exception_handler`
        # descarta el `detail` que manda un ValidationError y lo cambia por un
        # "Solicitud invalida." generico. Bajo otra clave, el mensaje llega entero (5.26).
        raise ValidationError({"room": " ".join(messages)})


def archive_rooms(rooms) -> None:
    rooms = list(rooms)
    ensure_rooms_can_be_archived(rooms)
    content_type = ContentType.objects.get_for_model(Room)
    for room in rooms:
        SoftDeleteMarker.objects.get_or_create(content_type=content_type, object_id=str(room.pk))
