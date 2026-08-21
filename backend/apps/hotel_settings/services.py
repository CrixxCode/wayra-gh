import re
from dataclasses import dataclass
from datetime import date

from django.utils.text import slugify

from apps.reservations.services import ROOM_STATUS_AVAILABLE, find_overlapping_reservation_room
from apps.rooms.models import Rate, Room

from .models import HotelSettings


@dataclass(frozen=True)
class AlliedHotelAvailabilityCriteria:
    check_in: date
    check_out: date
    rooms: int
    guests: int


# Campos sin los cuales un hotel no puede *operar* una reserva publica: donde queda, con que
# horario recibe/entrega habitaciones, y con que correo se le contacta para confirmarla. A
# proposito es mas corto que `buildHotelSetupStatus()` (`hotel-setup-status.ts`) — esa lista
# tambien exige razon social y coordenadas de mapa, que son utiles para el panel del hotel pero
# no bloquean que una reserva se pueda tomar y confirmar.
REQUIRED_HOTEL_SETUP_FIELDS = (
    "hotel_name",
    "address",
    "country",
    "state",
    "city",
    "check_in_time",
    "check_out_time",
)


def _has_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    return True


def is_hotel_setup_complete(hotel: HotelSettings) -> bool:
    if not all(_has_value(getattr(hotel, field)) for field in REQUIRED_HOTEL_SETUP_FIELDS):
        return False

    has_contact = any(
        _has_value(getattr(hotel, field))
        for field in ("reservations_email", "general_email", "primary_phone")
    )
    if not has_contact:
        return False

    has_rooms = any(int(floor.room_count or 0) > 0 for floor in hotel.floors.all())
    return has_rooms


def build_active_allied_hotels(
    *,
    availability: AlliedHotelAvailabilityCriteria | None = None,
) -> list[dict]:
    hotels = (
        HotelSettings.objects.filter(is_active=True)
        .prefetch_related(
            "floors",
            "photos",
            "rates",
            "rates__room_type",
            "floors__rooms",
            "floors__rooms__photos",
        )
        .order_by("hotel_name", "id")
    )

    payloads = []
    for hotel in hotels:
        if not is_hotel_setup_complete(hotel):
            continue
        payload = build_allied_hotel_payload(hotel, availability=availability)
        if availability and not payload["roomRates"]:
            continue
        payloads.append(payload)
    return payloads


def build_allied_hotel_payload(
    hotel: HotelSettings,
    *,
    availability: AlliedHotelAvailabilityCriteria | None = None,
) -> dict:
    active_rates = sorted(
        (
            rate
            for rate in hotel.rates.all()
            if rate.is_active and rate.room_type and rate.room_type.is_active
        ),
        key=lambda rate: (rate.price, rate.name.lower(), rate.id),
    )
    room_rates = []
    available_rooms_by_type = {}
    included_rooms_by_type = {}

    for rate in active_rates:
        available_rooms = None
        if availability:
            if not rate_applies_to_allied_dates(rate, availability):
                continue

            available_rooms = available_rooms_by_type.get(rate.room_type_id)
            if available_rooms is None:
                available_rooms = count_allied_available_rooms(rate, availability)
                available_rooms_by_type[rate.room_type_id] = available_rooms

            if available_rooms < availability.rooms:
                continue

            if availability.guests > availability.rooms * int(rate.room_type.capacity or 1):
                continue

            included_rooms_by_type[rate.room_type_id] = available_rooms

        room_rates.append(
            build_allied_room_rate_payload(rate, available_rooms=available_rooms)
        )

    max_guests = max(
        [rate["maxGuests"] for rate in room_rates] + [int(hotel.max_guests_per_room or 1)]
    )
    nightly_rate_from = min([rate["nightlyRate"] for rate in room_rates], default=0)
    rooms = sum(int(floor.room_count or 0) for floor in hotel.floors.all())
    available_rooms_total = (
        sum(included_rooms_by_type.values()) if availability else None
    )

    return {
        "slug": build_allied_hotel_slug(hotel),
        "name": hotel.hotel_name,
        "type": resolve_allied_hotel_type(hotel),
        "city": hotel.city or "",
        "department": hotel.state or "",
        "country": hotel.country or "",
        "description": hotel.description or "",
        "highlights": build_allied_hotel_highlights(hotel, rooms, max_guests),
        "imageUrl": first_hotel_photo_url(hotel),
        "rooms": rooms,
        "availableRooms": available_rooms_total,
        "maxGuestsPerRoom": max_guests,
        "nightlyRateFrom": nightly_rate_from,
        "roomRates": room_rates,
        "contact": hotel.reservations_email or hotel.general_email or hotel.primary_phone or "",
    }


def build_allied_room_rate_payload(
    rate: Rate,
    *,
    available_rooms: int | None = None,
) -> dict:
    room_type = rate.room_type
    return {
        "id": f"rate-{rate.id}",
        "roomType": room_type.name,
        "rateName": rate.name,
        "description": room_type.description or rate.name,
        "imageUrl": first_room_photo_url_for_type(rate.hotel_settings, rate.room_type_id),
        "maxGuests": int(room_type.capacity or 1),
        "nightlyRate": int(rate.price or 0),
        "availableRooms": available_rooms,
    }


def first_hotel_photo_url(hotel: HotelSettings) -> str:
    photo = next(iter(hotel.photos.all()), None)
    return photo.image.url if photo and photo.image else ""


def first_room_photo_url_for_type(hotel: HotelSettings, room_type_id: int | None) -> str:
    if not room_type_id:
        return ""

    for floor in hotel.floors.all():
        for room in floor.rooms.all():
            if room.room_type_id != room_type_id:
                continue
            photo = next(iter(room.photos.all()), None)
            if photo and photo.image:
                return photo.image.url

    return ""


def rate_applies_to_allied_dates(
    rate: Rate,
    availability: AlliedHotelAvailabilityCriteria,
) -> bool:
    if rate.start_date and availability.check_in < rate.start_date:
        return False
    if rate.end_date and availability.check_out > rate.end_date:
        return False
    return True


def count_allied_available_rooms(
    rate: Rate,
    availability: AlliedHotelAvailabilityCriteria,
) -> int:
    candidates = (
        Room.objects.select_related("floor", "status", "room_type")
        .filter(
            floor__hotel_settings=rate.hotel_settings,
            room_type=rate.room_type,
            status__code=ROOM_STATUS_AVAILABLE,
        )
        .order_by("number", "id")
    )

    available_rooms = 0
    for room in candidates:
        conflict = find_overlapping_reservation_room(
            room_id=room.id,
            expected_check_in=availability.check_in,
            expected_check_out=availability.check_out,
        )
        if conflict:
            continue
        available_rooms += 1

    return available_rooms


def build_allied_hotel_slug(hotel: HotelSettings) -> str:
    base = slugify(hotel.hotel_name or "")
    if not base:
        base = "hotel"
    return f"{base}-{hotel.id}"


def resolve_allied_hotel_type(hotel: HotelSettings) -> str:
    description = hotel.description or ""
    match = re.search(r"Tipo de alojamiento:\s*([^.]+)", description, flags=re.IGNORECASE)
    if match:
        hotel_type = match.group(1).strip()
        if hotel_type:
            return hotel_type
    return "Hotel"


def build_allied_hotel_highlights(
    hotel: HotelSettings,
    rooms: int,
    max_guests: int,
) -> list[str]:
    highlights = []

    if rooms:
        highlights.append(f"{rooms} habitaciones registradas")
    if max_guests:
        highlights.append(f"Hasta {max_guests} huespedes por habitacion")
    if hotel.reservations_email:
        highlights.append("Reservas por correo")
    elif hotel.primary_phone:
        highlights.append("Contacto telefonico disponible")
    if hotel.website:
        highlights.append("Sitio web disponible")

    return highlights[:3] or ["Aliado activo en Wayra"]
