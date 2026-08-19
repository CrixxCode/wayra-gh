from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.clients.models import Client
from apps.clients.serializers import normalize_document_type
from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData
from apps.reservations.emails import send_reservation_registered_email
from apps.reservations.models import Reservation, ReservationGuest, ReservationRoom
from apps.reservations.services import (
    RESERVATION_STATUS_PENDING_CODES,
    ROOM_STATUS_AVAILABLE,
    find_overlapping_reservation_room,
    get_master_data_code,
    get_pending_reservation_status,
)
from apps.rooms.models import Rate, Room


WEB_RESERVATION_SOURCE_CHANNEL = "WEB"
WEB_RESERVATION_ORIGIN_CODE = "WEB"


@dataclass(frozen=True)
class GuestName:
    first_name: str
    last_name: str


def create_web_reservation(*, data: dict[str, Any], request=None) -> Reservation:
    hotel = _resolve_hotel(data["hotel_slug"])
    rate = _resolve_rate(
        hotel=hotel,
        room_rate_id=data["room_rate_id"],
        expected_check_in=data["expected_check_in"],
        expected_check_out=data["expected_check_out"],
    )

    with transaction.atomic():
        selected_rooms = _select_available_rooms(
            hotel=hotel,
            rate=rate,
            room_count=int(data["rooms"]),
            guest_count=int(data["guests"]),
            expected_check_in=data["expected_check_in"],
            expected_check_out=data["expected_check_out"],
        )
        client = _get_or_create_web_client(hotel=hotel, data=data)
        reservation = _create_reservation(
            hotel=hotel,
            client=client,
            data=data,
            request=request,
        )
        _create_reservation_rooms(
            reservation=reservation,
            rooms=selected_rooms,
            rate=rate,
            guest_count=int(data["guests"]),
        )
        _create_primary_guest(
            reservation=reservation,
            data=data,
        )

    reservation = (
        Reservation.objects.select_related("hotel_settings", "client", "status", "origin")
        .prefetch_related("rooms_detail__room__room_type", "rooms_detail__meal_plan")
        .get(pk=reservation.pk)
    )
    send_reservation_registered_email(reservation, request=request)
    return reservation


def _resolve_hotel(hotel_slug: str) -> HotelSettings:
    normalized_slug = str(hotel_slug or "").strip()
    raw_id = normalized_slug.rsplit("-", 1)[-1]

    if not raw_id.isdigit():
        raise ValidationError({"hotel_slug": "El hotel seleccionado no es valido."})

    hotel = HotelSettings.objects.filter(id=int(raw_id), is_active=True).first()
    if not hotel:
        raise ValidationError({"hotel_slug": "El hotel seleccionado no esta activo."})

    # El ID al final del slug es la parte estable. Si el nombre cambio, aceptamos el ID
    # para no romper enlaces generados antes del cambio de nombre.
    return hotel


def _parse_rate_id(room_rate_id: str) -> int:
    value = str(room_rate_id or "").strip()
    match = re.fullmatch(r"(?:rate-)?(\d+)", value)
    if not match:
        raise ValidationError({"room_rate_id": "La tarifa seleccionada no es valida."})
    return int(match.group(1))


def _resolve_rate(
    *,
    hotel: HotelSettings,
    room_rate_id: str,
    expected_check_in,
    expected_check_out,
) -> Rate:
    rate = (
        Rate.objects.select_related("room_type", "hotel_settings")
        .filter(
            id=_parse_rate_id(room_rate_id),
            hotel_settings=hotel,
            is_active=True,
            room_type__is_active=True,
        )
        .first()
    )
    if not rate:
        raise ValidationError({"room_rate_id": "La tarifa seleccionada no esta disponible."})

    if rate.start_date and expected_check_in < rate.start_date:
        raise ValidationError({"room_rate_id": "La tarifa no aplica para la fecha de llegada."})

    if rate.end_date and expected_check_out > rate.end_date:
        raise ValidationError({"room_rate_id": "La tarifa no aplica para la fecha de salida."})

    return rate


def _select_available_rooms(
    *,
    hotel: HotelSettings,
    rate: Rate,
    room_count: int,
    guest_count: int,
    expected_check_in,
    expected_check_out,
) -> list[Room]:
    room_type = rate.room_type
    capacity = int(getattr(room_type, "capacity", 0) or 0)
    if capacity <= 0:
        raise ValidationError({"room_rate_id": "El tipo de habitacion no tiene capacidad valida."})

    if guest_count > capacity * room_count:
        raise ValidationError(
            {
                "guests": (
                    "La cantidad de huespedes supera la capacidad de las habitaciones "
                    "seleccionadas."
                )
            }
        )

    candidates = (
        Room.objects.select_for_update(of=("self",))
        .select_related("floor", "status", "room_type")
        .filter(
            floor__hotel_settings=hotel,
            room_type=room_type,
            status__code=ROOM_STATUS_AVAILABLE,
        )
        .order_by("number", "id")
    )

    selected_rooms = []
    for room in candidates:
        conflict = find_overlapping_reservation_room(
            room_id=room.id,
            expected_check_in=expected_check_in,
            expected_check_out=expected_check_out,
        )
        if conflict:
            continue
        selected_rooms.append(room)
        if len(selected_rooms) == room_count:
            return selected_rooms

    raise ValidationError(
        {
            "rooms": (
                "No hay suficientes habitaciones disponibles para la tarifa y fechas "
                "seleccionadas."
            )
        }
    )


def _get_or_create_web_client(*, hotel: HotelSettings, data: dict[str, Any]) -> Client:
    guest_name = _split_guest_name(data["guest_name"])
    email = str(data["guest_email"] or "").strip().lower()
    document_number = str(data["guest_document_number"] or "").strip()
    document_type = _resolve_document_type(data.get("guest_document_type"))

    client = Client.objects.filter(hotel_settings=hotel, email__iexact=email).first()
    if not client:
        client = Client.objects.filter(
            hotel_settings=hotel,
            document_number__iexact=document_number,
        ).first()

    if client:
        fields_to_update = []
        updates = {
            "first_name": guest_name.first_name,
            "last_name": guest_name.last_name,
            "email": email,
            "phone": data.get("guest_phone") or "",
            "country": data.get("guest_country") or "",
        }
        for field, value in updates.items():
            if value and getattr(client, field) != value:
                setattr(client, field, value)
                fields_to_update.append(field)
        if fields_to_update:
            client.full_clean()
            client.save(update_fields=fields_to_update)
        return client

    client_type = _required_master_data(MasterData.Group.CLIENT_TYPE, "REGULAR")
    client_status = _required_master_data(MasterData.Group.CLIENT_STATUS, "ACTIVO")
    client = Client(
        hotel_settings=hotel,
        document_type=document_type,
        document_number=document_number,
        first_name=guest_name.first_name,
        last_name=guest_name.last_name,
        email=email,
        phone=data.get("guest_phone") or "",
        country=data.get("guest_country") or "",
        client_type=client_type,
        status=client_status,
    )
    client.full_clean()
    client.save()
    return client


def _create_reservation(
    *,
    hotel: HotelSettings,
    client: Client,
    data: dict[str, Any],
    request=None,
) -> Reservation:
    pending_status = get_pending_reservation_status()
    if not pending_status:
        expected_codes = ", ".join(RESERVATION_STATUS_PENDING_CODES)
        raise ValidationError(
            {
                "status": (
                    f"No existe un estado activo de pendiente ({expected_codes}) "
                    f"en {MasterData.Group.RESERVATION_STATUS}."
                )
            }
        )

    origin = _required_master_data(MasterData.Group.RESERVATION_ORIGIN, WEB_RESERVATION_ORIGIN_CODE)
    source_metadata = _build_source_metadata(data=data, request=request)
    reservation = Reservation(
        hotel_settings=hotel,
        client=client,
        status=pending_status,
        origin=origin,
        expected_check_in=data["expected_check_in"],
        expected_check_out=data["expected_check_out"],
        notes=(data.get("notes") or "").strip() or None,
        source_channel=WEB_RESERVATION_SOURCE_CHANNEL,
        source_detail=(data.get("source_detail") or "Booking publico Wayra").strip(),
        source_url=(data.get("source_url") or "").strip(),
        source_referrer=(data.get("source_referrer") or "").strip(),
        source_metadata=source_metadata,
    )
    reservation.full_clean()
    reservation.save()
    return reservation


def _create_reservation_rooms(
    *,
    reservation: Reservation,
    rooms: list[Room],
    rate: Rate,
    guest_count: int,
) -> None:
    adult_distribution = _distribute_adults(room_count=len(rooms), guest_count=guest_count)
    for room, adults in zip(rooms, adult_distribution):
        reservation_room = ReservationRoom(
            reservation=reservation,
            room=room,
            night_rate=rate.price,
            adults=adults,
            children=0,
        )
        _full_clean_or_validation_error(reservation_room)
        reservation_room.save()


def _create_primary_guest(*, reservation: Reservation, data: dict[str, Any]) -> ReservationGuest:
    guest_name = _split_guest_name(data["guest_name"])
    guest = ReservationGuest(
        reservation=reservation,
        document_type=_resolve_document_type(data.get("guest_document_type")),
        document_number=str(data["guest_document_number"]).strip(),
        first_name=guest_name.first_name,
        last_name=guest_name.last_name,
        nationality=data.get("guest_country") or None,
    )
    _full_clean_or_validation_error(guest)
    guest.save()
    return guest


def _split_guest_name(value: str) -> GuestName:
    parts = str(value or "").strip().split()
    if not parts:
        raise ValidationError({"guest_name": "El nombre del huesped es obligatorio."})
    return GuestName(
        first_name=parts[0],
        last_name=" ".join(parts[1:]) or "No informado",
    )


def _resolve_document_type(value) -> MasterData:
    normalized = normalize_document_type(value or "CC")
    document_type = get_master_data_code(MasterData.Group.DOCUMENT_TYPE, normalized)
    if not document_type:
        raise ValidationError(
            {
                "guest_document_type": (
                    f"No existe un tipo de documento activo '{normalized}'."
                )
            }
        )
    return document_type


def _required_master_data(group: str, code: str) -> MasterData:
    item = get_master_data_code(group, code)
    if not item:
        raise ValidationError({"detail": f"No existe el catalogo activo {group}:{code}."})
    return item


def _distribute_adults(*, room_count: int, guest_count: int) -> list[int]:
    if room_count <= 0:
        return []

    distribution = [1 for _ in range(room_count)]
    remaining = guest_count - room_count
    index = 0
    while remaining > 0:
        distribution[index % room_count] += 1
        remaining -= 1
        index += 1
    return distribution


def _build_source_metadata(*, data: dict[str, Any], request=None) -> dict[str, Any]:
    metadata = dict(data.get("source_metadata") or {})
    metadata.setdefault("source_channel", WEB_RESERVATION_SOURCE_CHANNEL)
    metadata.setdefault("hotel_slug", data.get("hotel_slug"))
    metadata.setdefault("room_rate_id", data.get("room_rate_id"))
    metadata.setdefault("rooms_requested", data.get("rooms"))
    metadata.setdefault("guests_requested", data.get("guests"))

    if request is not None:
        metadata.setdefault("ip_address", _get_request_ip(request))
        user_agent = str(request.META.get("HTTP_USER_AGENT", "") or "").strip()
        if user_agent:
            metadata.setdefault("user_agent", user_agent[:500])

    return metadata


def _get_request_ip(request) -> str:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return str(request.META.get("REMOTE_ADDR", "") or "").strip()


def _full_clean_or_validation_error(instance) -> None:
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        message_dict = getattr(exc, "message_dict", None)
        if message_dict:
            raise ValidationError(message_dict)
        raise ValidationError({"detail": getattr(exc, "messages", [str(exc)])})
