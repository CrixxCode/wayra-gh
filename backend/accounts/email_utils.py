from email.utils import parseaddr

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
