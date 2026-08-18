from __future__ import annotations

import re
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.clients.serializers import normalize_document_type
from apps.master_data.models import MasterData
from apps.notifications.services import notify_online_check_in_submitted
from apps.reservations.models import Reservation, ReservationGuest
from apps.reservations.services import (
    get_master_data_code,
    is_reservation_status_cancelled,
    is_reservation_status_confirmed,
    is_reservation_status_finished,
    is_reservation_status_pending,
)


ONLINE_CHECK_IN_ARRIVAL_WINDOWS = (
    "12:00-14:00",
    "14:00-16:00",
    "16:00-18:00",
    "18:00-21:00",
    "21:00+",
)

ONLINE_CHECK_IN_MAX_GUESTS = 8

# Mensaje generico y unico para codigo inexistente o documento que no coincide,
# asi evitamos que alguien enumere reservas ajenas probando solo el ID.
RESERVATION_LOOKUP_ERROR_MESSAGE = (
    "No encontramos una reserva con ese codigo y ese numero de documento."
)


def _normalize_document_number(value: str) -> str:
    return re.sub(r"[\s.-]", "", str(value or "")).strip().upper()


def _normalize_reservation_code(reservation_code: str) -> str:
    # Tolerante a espacios/guiones que el huesped pueda agregar al copiar el
    # codigo (ej. del correo o de la ficha de recepcion); Reservation.code se
    # guarda siempre sin separadores y en mayusculas.
    return re.sub(r"[^A-Za-z0-9]", "", str(reservation_code or "")).upper()


def _reservation_queryset() -> QuerySet[Reservation]:
    return Reservation.objects.select_related("client", "status", "hotel_settings")


def _get_reservation(reservation_code: str) -> Reservation:
    normalized = _normalize_reservation_code(reservation_code)
    reservation = _reservation_queryset().filter(code=normalized).first() if normalized else None
    if not reservation:
        raise ValidationError({"reservation_code": RESERVATION_LOOKUP_ERROR_MESSAGE})
    return reservation


def _get_locked_reservation(reservation_code: str) -> Reservation:
    normalized = _normalize_reservation_code(reservation_code)
    reservation = (
        _reservation_queryset().select_for_update().filter(code=normalized).first()
        if normalized
        else None
    )
    if not reservation:
        raise ValidationError({"reservation_code": RESERVATION_LOOKUP_ERROR_MESSAGE})
    return reservation


def _verify_titular_document(reservation: Reservation, document_number: str) -> None:
    client_document = _normalize_document_number(
        getattr(reservation.client, "document_number", "")
    )
    submitted_document = _normalize_document_number(document_number)
    if not submitted_document or client_document != submitted_document:
        raise ValidationError({"guest_document_number": RESERVATION_LOOKUP_ERROR_MESSAGE})


def _verify_titular_present(reservation: Reservation, guests_payload: list[dict[str, Any]]) -> None:
    client_document = _normalize_document_number(
        getattr(reservation.client, "document_number", "")
    )
    submitted_documents = {
        _normalize_document_number(guest.get("guest_document_number"))
        for guest in guests_payload
    }
    if not client_document or client_document not in submitted_documents:
        raise ValidationError(
            {
                "guests": (
                    "Uno de los huespedes debe ser el titular de la reserva "
                    "(mismo numero de documento verificado)."
                )
            }
        )


def get_online_check_in_eligibility(reservation: Reservation) -> dict[str, Any]:
    code = reservation.status_code

    if reservation.real_check_out is not None:
        return {"eligible": False, "reason": "La estadia de esta reserva ya finalizo."}

    if reservation.real_check_in is not None:
        return {
            "eligible": False,
            "reason": "Ya realizaste el check-in presencial en el hotel para esta reserva.",
        }

    if is_reservation_status_cancelled(code):
        return {"eligible": False, "reason": "Esta reserva fue cancelada."}

    if is_reservation_status_finished(code):
        return {"eligible": False, "reason": "La estadia de esta reserva ya finalizo."}

    if is_reservation_status_pending(code):
        return {
            "eligible": False,
            "reason": "Tu reserva todavia no fue confirmada por el hotel.",
        }

    if not is_reservation_status_confirmed(code):
        return {
            "eligible": False,
            "reason": "Esta reserva no esta disponible para check-in online.",
        }

    if reservation.expected_check_out and timezone.localdate() > reservation.expected_check_out:
        return {"eligible": False, "reason": "El periodo de esta reserva ya vencio."}

    return {"eligible": True, "reason": None}


def _resolve_document_type(value) -> MasterData:
    normalized = normalize_document_type(value or "CC")
    document_type = get_master_data_code(MasterData.Group.DOCUMENT_TYPE, normalized)
    if not document_type:
        raise ValidationError(
            {"guest_document_type": f"No existe un tipo de documento activo '{normalized}'."}
        )
    return document_type


def _full_clean_or_validation_error(instance) -> None:
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        message_dict = getattr(exc, "message_dict", None)
        if message_dict:
            raise ValidationError(message_dict)
        raise ValidationError({"detail": getattr(exc, "messages", [str(exc)])})


def lookup_online_check_in(*, data: dict[str, Any]) -> dict[str, Any]:
    reservation = _get_reservation(data["reservation_code"])
    _verify_titular_document(reservation, data["guest_document_number"])

    eligibility = get_online_check_in_eligibility(reservation)
    existing_guests = list(
        reservation.guests.filter(online_check_in_submitted_at__isnull=False)
        .select_related("document_type")
        .order_by("id")
    )

    return {
        "reservation": reservation,
        "eligibility": eligibility,
        "existing_guests": existing_guests,
    }


def submit_online_check_in(*, data: dict[str, Any]) -> dict[str, Any]:
    guests_payload = data["guests"]

    with transaction.atomic():
        reservation = _get_locked_reservation(data["reservation_code"])
        _verify_titular_present(reservation, guests_payload)

        eligibility = get_online_check_in_eligibility(reservation)
        if not eligibility["eligible"]:
            raise ValidationError({"detail": eligibility["reason"]})

        expected_guest_count = reservation.total_guests
        if expected_guest_count and len(guests_payload) != expected_guest_count:
            raise ValidationError(
                {
                    "guests": (
                        f"Esta reserva es para {expected_guest_count} huesped(es); "
                        f"recibimos datos de {len(guests_payload)}."
                    )
                }
            )

        seen_documents: set[tuple[int, str]] = set()
        saved_guests: list[ReservationGuest] = []
        any_first_submission = False

        for guest_data in guests_payload:
            document_type = _resolve_document_type(guest_data.get("guest_document_type"))
            document_number = str(guest_data["guest_document_number"]).strip()
            document_key = (document_type.id, _normalize_document_number(document_number))
            if document_key in seen_documents:
                raise ValidationError(
                    {"guests": "No repitas el mismo numero de documento entre huespedes."}
                )
            seen_documents.add(document_key)

            guest, _created = ReservationGuest.objects.get_or_create(
                reservation=reservation,
                document_type=document_type,
                document_number=document_number,
                defaults={
                    "first_name": guest_data["first_name"],
                    "last_name": guest_data["last_name"],
                },
            )

            if guest.online_check_in_submitted_at is None:
                any_first_submission = True

            guest.first_name = guest_data["first_name"]
            guest.last_name = guest_data["last_name"]
            guest.birth_date = guest_data.get("birth_date") or None
            guest.nationality = guest_data.get("nationality") or None
            guest.email = data.get("email") or None
            guest.phone = data.get("phone") or None
            guest.arrival_time_window = data.get("arrival_time_window") or None
            guest.emergency_contact_name = data.get("emergency_contact_name") or None
            guest.emergency_contact_phone = data.get("emergency_contact_phone") or None
            guest.notes = data.get("notes") or None
            guest.accepts_data_policy = bool(data.get("accepts_data_policy"))
            guest.online_check_in_submitted_at = timezone.now()
            _full_clean_or_validation_error(guest)
            guest.save()
            saved_guests.append(guest)

    if any_first_submission:
        notify_online_check_in_submitted(reservation, saved_guests)

    return {"reservation": reservation, "guests": saved_guests}
