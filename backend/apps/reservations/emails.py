from __future__ import annotations

import logging
from datetime import timedelta
from email.mime.image import MIMEImage
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from accounts.email_utils import (
    describe_email_send_failure,
    email_backend_configuration_error,
)
from apps.reservations.models import Reservation
from apps.reservations.services import get_reservation_check_in_start_datetime

logger = logging.getLogger(__name__)


def _build_hotel_email_brand(hotel_settings) -> tuple[dict, bytes | None, str, str]:
    app_name = str(getattr(settings, "APP_DISPLAY_NAME", "Wayra") or "Wayra").strip()
    primary_color = str(getattr(settings, "BRAND_PRIMARY_COLOR", "#0f1f41") or "#0f1f41").strip()
    hotel_name = str(getattr(hotel_settings, "hotel_name", "") or "").strip()
    support_email = (
        str(getattr(hotel_settings, "reservations_email", "") or "").strip()
        or str(getattr(hotel_settings, "general_email", "") or "").strip()
        or str(getattr(settings, "SUPPORT_EMAIL", "soporte@hotel.local") or "soporte@hotel.local").strip()
    )

    logo_url = str(getattr(hotel_settings, "logo", "") or "").strip()
    using_hotel_logo = bool(logo_url)
    if not logo_url:
        logo_url = str(getattr(settings, "BRAND_LOGO_URL", "") or "").strip()

    inline_logo_bytes = None
    inline_logo_name = "logo-white.png"
    inline_logo_cid = "platform-logo"
    if not logo_url:
        logo_candidates = [
            Path(settings.BASE_DIR).parent / "frontend" / "public" / "logo-white.png",
            Path(settings.BASE_DIR) / "static" / "logo-white.png",
        ]
        for candidate in logo_candidates:
            if candidate.exists() and candidate.is_file():
                try:
                    inline_logo_bytes = candidate.read_bytes()
                    inline_logo_name = candidate.name
                    logo_url = f"cid:{inline_logo_cid}"
                except OSError:
                    inline_logo_bytes = None
                break

    brand = {
        "app_name": app_name,
        "support_email": support_email,
        "primary_color": primary_color,
        "logo_url": logo_url or None,
        "logo_alt": "Logo del hotel" if using_hotel_logo else f"{app_name} logo",
        "hotel_name": hotel_name or app_name,
    }
    return brand, inline_logo_bytes, inline_logo_name, inline_logo_cid


def _build_public_url(path: str, *, request=None, base_url: str | None = None) -> str:
    clean_base_url = str(base_url or "").strip()
    if clean_base_url:
        return f"{clean_base_url.rstrip('/')}{path}"
    if request is not None:
        return request.build_absolute_uri(path)
    return f"http://localhost:4200{path}"


def _resolve_room_type_name(reservation: Reservation) -> str:
    first_room = reservation.rooms_detail.select_related("room__room_type").order_by("id").first()
    room_type = getattr(getattr(first_room, "room", None), "room_type", None)
    return str(getattr(room_type, "name", "") or "").strip()


def _send_reservation_email(
    *,
    reservation: Reservation,
    template_name: str,
    subject: str,
    text_body: str,
    extra_context: dict[str, Any],
) -> dict:
    client = reservation.client
    email = str(getattr(client, "email", "") or "").strip().lower()
    if not email:
        return {"sent": False, "error_detail": "La reserva no tiene un correo de cliente registrado."}

    hotel_settings = reservation.hotel_settings
    brand, inline_logo_bytes, inline_logo_name, inline_logo_cid = _build_hotel_email_brand(hotel_settings)

    html_body = render_to_string(template_name, {**extra_context, **brand})

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@hotel.local")
    msg = EmailMultiAlternatives(subject, text_body, from_email, [email])
    msg.attach_alternative(html_body, "text/html")
    if inline_logo_bytes:
        logo_attachment = MIMEImage(inline_logo_bytes)
        logo_attachment.add_header("Content-ID", f"<{inline_logo_cid}>")
        logo_attachment.add_header("Content-Disposition", "inline", filename=inline_logo_name)
        msg.attach(logo_attachment)

    configuration_error = email_backend_configuration_error()
    if configuration_error:
        logger.error(
            "Reservation email (%s) could not be sent for reservation_id=%s email=%s: %s",
            template_name,
            reservation.pk,
            email,
            configuration_error,
        )
        return {"sent": False, "error_detail": configuration_error}

    try:
        msg.send(fail_silently=False)
    except Exception as exc:
        error_detail = describe_email_send_failure(exc)
        logger.exception(
            "Reservation email (%s) could not be sent for reservation_id=%s email=%s: %s",
            template_name,
            reservation.pk,
            email,
            error_detail,
        )
        return {"sent": False, "error_detail": error_detail}

    return {"sent": True, "error_detail": ""}


def send_reservation_registered_email(
    reservation: Reservation,
    *,
    request=None,
    base_url: str | None = None,
) -> dict:
    """Avisa al huesped que su solicitud de reserva web quedo registrada y a la espera
    de confirmacion del hotel."""

    try:
        client = reservation.client
        guest_name = str(getattr(client, "full_name", "") or getattr(client, "first_name", "")).strip()
        hotel_name = str(getattr(reservation.hotel_settings, "hotel_name", "") or "tu hotel").strip()
        reservation_reference = f"#{reservation.pk}"
        confirmation_url = _build_public_url(
            f"/reservar/confirmacion/{reservation.pk}", request=request, base_url=base_url
        )

        context = {
            "reservation": reservation,
            "guest_name": guest_name or "huesped",
            "reservation_reference": reservation_reference,
            "check_in_date": reservation.expected_check_in,
            "check_out_date": reservation.expected_check_out,
            "total_nights": reservation.total_nights,
            "total_rooms": reservation.total_rooms,
            "total_guests": reservation.total_guests,
            "room_type_name": _resolve_room_type_name(reservation),
            "confirmation_url": confirmation_url,
        }

        subject = f"Recibimos tu solicitud de reserva en {hotel_name}"
        text_body = (
            f"Hola {context['guest_name']},\n\n"
            f"Registramos tu solicitud de reserva en {hotel_name} para el "
            f"{reservation.expected_check_in:%d/%m/%Y} - {reservation.expected_check_out:%d/%m/%Y}.\n"
            f"Numero de referencia: {reservation_reference}.\n\n"
            "El hotel va a revisar la disponibilidad y te avisaremos a este correo en cuanto la "
            "reserva quede confirmada.\n\n"
            f"Puedes ver el detalle aqui: {confirmation_url}\n\n"
            f"Equipo {hotel_name}\n"
        )

        return _send_reservation_email(
            reservation=reservation,
            template_name="email/reservation_registered.html",
            subject=subject,
            text_body=text_body,
            extra_context=context,
        )
    except Exception as exc:
        logger.exception(
            "Unexpected error building reservation_registered email for reservation_id=%s: %s",
            reservation.pk,
            exc,
        )
        return {"sent": False, "error_detail": "No fue posible preparar el correo de la reserva."}


def send_reservation_confirmed_email(
    reservation: Reservation,
    *,
    request=None,
    base_url: str | None = None,
) -> dict:
    """Avisa al huesped que el hotel confirmo su reserva y le explica que puede hacer
    check-in online desde 48 horas antes de la llegada."""

    try:
        client = reservation.client
        guest_name = str(getattr(client, "full_name", "") or getattr(client, "first_name", "")).strip()
        hotel_name = str(getattr(reservation.hotel_settings, "hotel_name", "") or "tu hotel").strip()
        reservation_reference = f"#{reservation.pk}"

        check_in_start = get_reservation_check_in_start_datetime(reservation)
        online_check_in_available_from = check_in_start - timedelta(hours=48) if check_in_start else None
        check_in_online_url = _build_public_url("/check-in-online", request=request, base_url=base_url)

        context = {
            "reservation": reservation,
            "guest_name": guest_name or "huesped",
            "reservation_reference": reservation_reference,
            "check_in_date": reservation.expected_check_in,
            "check_out_date": reservation.expected_check_out,
            "total_nights": reservation.total_nights,
            "total_rooms": reservation.total_rooms,
            "total_guests": reservation.total_guests,
            "room_type_name": _resolve_room_type_name(reservation),
            "online_check_in_available_from": online_check_in_available_from,
            "check_in_online_url": check_in_online_url,
        }

        subject = f"Tu reserva en {hotel_name} quedo confirmada"
        text_body_lines = [
            f"Hola {context['guest_name']},",
            "",
            f"Tu reserva en {hotel_name} para el "
            f"{reservation.expected_check_in:%d/%m/%Y} - {reservation.expected_check_out:%d/%m/%Y} "
            "quedo confirmada.",
            f"Numero de referencia: {reservation_reference}.",
            "",
            "Puedes adelantar tu llegada haciendo el check-in online desde 48 horas antes de tu "
            "fecha de llegada.",
        ]
        if online_check_in_available_from:
            text_body_lines.append(
                f"Estara disponible desde el {online_check_in_available_from:%d/%m/%Y} a las "
                f"{online_check_in_available_from:%H:%M}."
            )
        text_body_lines.extend(
            [
                f"Ingresa aqui cuando llegue el momento: {check_in_online_url}",
                "",
                f"Equipo {hotel_name}",
                "",
            ]
        )

        return _send_reservation_email(
            reservation=reservation,
            template_name="email/reservation_confirmed.html",
            subject=subject,
            text_body="\n".join(text_body_lines),
            extra_context=context,
        )
    except Exception as exc:
        logger.exception(
            "Unexpected error building reservation_confirmed email for reservation_id=%s: %s",
            reservation.pk,
            exc,
        )
        return {"sent": False, "error_detail": "No fue posible preparar el correo de la reserva."}
