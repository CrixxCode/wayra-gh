from email.utils import parseaddr
from email.mime.image import MIMEImage
from pathlib import Path

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.urls import reverse
from django.utils.encoding import smart_bytes
from django.utils.http import urlsafe_base64_encode


NON_INBOX_EMAIL_BACKENDS = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
}

RESEND_EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
RESEND_TEST_DOMAIN = "resend.dev"


def resend_api_key_is_configured() -> bool:
    direct_key = str(getattr(settings, "RESEND_API_KEY", "") or "").strip()
    anymail_key = str((getattr(settings, "ANYMAIL", {}) or {}).get("RESEND_API_KEY", "") or "").strip()
    return bool(direct_key or anymail_key)


def default_from_email_domain() -> str:
    from_email = str(getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()
    parsed_email = parseaddr(from_email)[1]
    if "@" not in parsed_email:
        return ""
    return parsed_email.rsplit("@", 1)[1].lower()


def email_backend_configuration_error() -> str:
    backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip()
    if backend == RESEND_EMAIL_BACKEND and not resend_api_key_is_configured():
        return "RESEND_API_KEY is required when using Resend."
    if backend == RESEND_EMAIL_BACKEND and default_from_email_domain() == RESEND_TEST_DOMAIN:
        return (
            "DEFAULT_FROM_EMAIL usa onboarding@resend.dev, que solo sirve para pruebas al "
            "correo dueno de la cuenta. Verifica un dominio en Resend y usa un remitente "
            "de ese dominio."
        )
    return ""


def describe_email_send_failure(exc: Exception) -> str:
    raw_message = str(exc)
    if "You can only send testing emails to your own email address" in raw_message:
        return (
            "Resend rechazo el envio porque onboarding@resend.dev solo permite pruebas al "
            "correo dueno de la cuenta. Verifica un dominio en Resend y configura "
            "DEFAULT_FROM_EMAIL con un correo de ese dominio."
        )
    if "verify a domain" in raw_message or "domain" in raw_message and "verified" in raw_message:
        return (
            "Resend rechazo el envio porque el remitente no pertenece a un dominio "
            "verificado. Verifica un dominio en Resend y actualiza DEFAULT_FROM_EMAIL."
        )
    if "API key" in raw_message or "api_key" in raw_message:
        return "Resend rechazo el envio por un problema con RESEND_API_KEY."
    return "No fue posible enviar el correo con Resend. Revisa los logs del backend."


def email_backend_delivers_to_inbox() -> bool:
    backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip()
    if email_backend_configuration_error():
        return False
    return backend not in NON_INBOX_EMAIL_BACKENDS


def build_email_brand_context(hotel_settings_obj=None) -> tuple[dict, bytes | None, str, str]:
    app_name = str(getattr(settings, "APP_DISPLAY_NAME", "Wayra") or "Wayra").strip()
    support_email = str(getattr(settings, "SUPPORT_EMAIL", "soporte@hotel.local") or "soporte@hotel.local").strip()
    primary_color = str(getattr(settings, "BRAND_PRIMARY_COLOR", "#0f1f41") or "#0f1f41").strip()
    logo_url = str(getattr(settings, "BRAND_LOGO_URL", "") or "").strip()

    using_hotel_logo = False
    if not logo_url and hotel_settings_obj is not None:
        hotel_logo = str(getattr(hotel_settings_obj, "logo", "") or "").strip()
        if hotel_logo:
            logo_url = hotel_logo
            using_hotel_logo = True

    inline_logo_bytes = None
    inline_logo_name = "logo.png"
    inline_logo_cid = "platform-logo"
    if not logo_url:
        logo_candidates = [
            Path(settings.BASE_DIR).parent / "frontend" / "public" / "logo.png",
            Path(settings.BASE_DIR) / "static" / "logo.png",
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

    address_parts = [
        str(getattr(hotel_settings_obj, "address", "") or "").strip(),
        str(getattr(hotel_settings_obj, "city", "") or "").strip(),
        str(getattr(hotel_settings_obj, "country", "") or "").strip(),
    ]
    hotel_footer_address = ", ".join(part for part in address_parts if part)

    return (
        {
            "app_name": app_name,
            "support_email": support_email,
            "primary_color": primary_color,
            "logo_url": logo_url or None,
            "logo_alt": "Logo del hotel" if using_hotel_logo else f"{app_name} logo",
            "hotel_footer_address": hotel_footer_address or None,
        },
        inline_logo_bytes,
        inline_logo_name,
        inline_logo_cid,
    )


def attach_inline_logo(message, inline_logo_bytes, inline_logo_name: str, inline_logo_cid: str) -> None:
    if not inline_logo_bytes:
        return

    logo_attachment = MIMEImage(inline_logo_bytes)
    logo_attachment.add_header("Content-ID", f"<{inline_logo_cid}>")
    logo_attachment.add_header(
        "Content-Disposition",
        "inline",
        filename=inline_logo_name,
    )
    message.attach(logo_attachment)


def build_password_reset_url(user, request=None, base_url=None) -> str:
    uid = urlsafe_base64_encode(smart_bytes(user.pk))
    token = PasswordResetTokenGenerator().make_token(user)

    clean_base_url = str(base_url or "").strip()
    if clean_base_url:
        return f"{clean_base_url}?uid={uid}&token={token}"

    path = reverse("password_reset_confirm")
    if request is not None:
        return request.build_absolute_uri(f"{path}?uid={uid}&token={token}")

    return f"http://localhost:8000{path}?uid={uid}&token={token}"
