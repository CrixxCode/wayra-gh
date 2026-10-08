from urllib.parse import urlsplit

from django.conf import settings


def trusted_frontend_origins() -> set[str]:
    """
    Origenes desde los que se sirve el frontend legitimo.

    Son los mismos que ya se validan para CSRF y CORS (ver la seccion 5.8 de AGENTS.md):
    si un origen no es de confianza para enviar peticiones con la sesion, tampoco lo es para
    recibir un enlace con un token de un solo uso.
    """
    origins = list(getattr(settings, "CSRF_TRUSTED_ORIGINS", []) or [])
    origins += list(getattr(settings, "CORS_ALLOWED_ORIGINS", []) or [])
    return {str(origin).strip().rstrip("/").lower() for origin in origins if str(origin).strip()}


def safe_frontend_base_url(base_url) -> str | None:
    """
    Devuelve `base_url` (sin query ni fragmento) solo si apunta a un origen de confianza.

    Los endpoints anonimos que mandan correo (p. ej. el reset de contrasena) reciben el
    `base_url` del cliente para armar el enlace. Sin esta validacion, cualquiera podia pedir
    un reset para el correo de otra persona y hacer que el correo legitimo de Wayra llevara
    el `uid`+`token` a un dominio suyo. Si el valor no es de confianza se devuelve `None` y
    quien llama arma el enlace sobre el host de la peticion.
    """
    clean = str(base_url or "").strip()
    if not clean:
        return None

    try:
        parts = urlsplit(clean)
    except ValueError:
        return None

    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None

    # `netloc` incluye cualquier `usuario@` del enlace, asi que `https://wayra.app@evil.com`
    # no coincide con ningun origen de confianza.
    origin = f"{parts.scheme}://{parts.netloc}".lower()
    if origin not in trusted_frontend_origins():
        return None

    return f"{parts.scheme}://{parts.netloc}{parts.path}"
