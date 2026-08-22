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
WAYRA_LOGO_SOURCE_RELATIVE_PATH = Path("frontend") / "public" / "logo.png"
WAYRA_LOGO_DIST_RELATIVE_PATH = Path("frontend_dist") / "logo.png"


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


def wayra_logo_candidate_paths() -> list[Path]:
    project_root = Path(settings.BASE_DIR).parent
    candidates = [
        project_root / WAYRA_LOGO_SOURCE_RELATIVE_PATH,
        project_root / WAYRA_LOGO_DIST_RELATIVE_PATH,
    ]

    frontend_dist_dir = getattr(settings, "FRONTEND_DIST_DIR", None)
    if frontend_dist_dir:
        candidates.append(Path(frontend_dist_dir) / "logo.png")

    static_root = getattr(settings, "STATIC_ROOT", None)
    if static_root:
        candidates.append(Path(static_root) / "logo.png")

    unique_candidates: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            unique_candidates.append(candidate)
            seen.add(key)
    return unique_candidates


def wayra_logo_path() -> Path:
    return wayra_logo_candidate_paths()[0]


def build_wayra_logo_context(inline_logo_cid: str = "platform-logo") -> tuple[str | None, bytes | None, str, str]:
    inline_logo_name = "logo.png"
    for logo_path in wayra_logo_candidate_paths():
        if not logo_path.exists() or not logo_path.is_file():
            continue
        try:
            return f"cid:{inline_logo_cid}", logo_path.read_bytes(), logo_path.name, inline_logo_cid
        except OSError:
            continue

    logo_url = str(getattr(settings, "BRAND_LOGO_URL", "") or "").strip()
    return logo_url or None, None, inline_logo_name, inline_logo_cid


def build_email_brand_context(hotel_settings_obj=None) -> tuple[dict, bytes | None, str, str]:
    app_name = str(getattr(settings, "APP_DISPLAY_NAME", "Wayra") or "Wayra").strip()
    support_email = str(getattr(settings, "SUPPORT_EMAIL", "soporte@hotel.local") or "soporte@hotel.local").strip()
    primary_color = str(getattr(settings, "BRAND_PRIMARY_COLOR", "#0f1f41") or "#0f1f41").strip()
    logo_url, inline_logo_bytes, inline_logo_name, inline_logo_cid = build_wayra_logo_context()

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
            "logo_alt": f"{app_name} logo",
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
