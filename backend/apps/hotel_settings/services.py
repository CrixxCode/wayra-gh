import re

from django.utils.text import slugify

from apps.rooms.models import Rate

from .models import HotelSettings


def build_active_allied_hotels() -> list[dict]:
    hotels = (
        HotelSettings.objects.filter(is_active=True)
        .prefetch_related(
            "floors",
            "rates",
            "rates__room_type",
        )
        .order_by("hotel_name", "id")
    )

    return [build_allied_hotel_payload(hotel) for hotel in hotels]


def build_allied_hotel_payload(hotel: HotelSettings) -> dict:
    active_rates = sorted(
        (
            rate
            for rate in hotel.rates.all()
            if rate.is_active and rate.room_type and rate.room_type.is_active
        ),
        key=lambda rate: (rate.price, rate.name.lower(), rate.id),
    )
    room_rates = [build_allied_room_rate_payload(rate) for rate in active_rates]
    max_guests = max(
        [rate["maxGuests"] for rate in room_rates] + [int(hotel.max_guests_per_room or 1)]
    )
    nightly_rate_from = min([rate["nightlyRate"] for rate in room_rates], default=0)
    rooms = sum(int(floor.room_count or 0) for floor in hotel.floors.all())

    return {
        "slug": build_allied_hotel_slug(hotel),
        "name": hotel.hotel_name,
        "type": resolve_allied_hotel_type(hotel),
        "city": hotel.city or "",
        "department": hotel.state or "",
        "country": hotel.country or "",
        "description": hotel.description or "",
        "highlights": build_allied_hotel_highlights(hotel, rooms, max_guests),
        "rooms": rooms,
        "maxGuestsPerRoom": max_guests,
        "nightlyRateFrom": nightly_rate_from,
        "roomRates": room_rates,
        "contact": hotel.reservations_email or hotel.general_email or hotel.primary_phone or "",
    }


def build_allied_room_rate_payload(rate: Rate) -> dict:
    room_type = rate.room_type
    return {
        "id": f"rate-{rate.id}",
        "roomType": room_type.name,
        "rateName": rate.name,
        "description": room_type.description or rate.name,
        "maxGuests": int(room_type.capacity or 1),
        "nightlyRate": int(rate.price or 0),
    }


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
