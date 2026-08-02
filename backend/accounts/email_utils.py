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


def email_backend_delivers_to_inbox() -> bool:
    backend = str(getattr(settings, "EMAIL_BACKEND", "") or "").strip()
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
