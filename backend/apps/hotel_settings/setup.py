"""Shared readiness rules for the hotel setup screen and API gate."""

from accounts.tenancy import is_effective_global_admin


REQUIRED_SETUP_FIELDS = (
    ("hotel_name", "nombre del hotel"),
    ("address", "dirección"),
    ("country", "país"),
    ("state", "departamento"),
    ("city", "ciudad"),
    ("primary_phone", "teléfono"),
    ("general_email", "correo"),
    ("check_in_time", "hora de check-in"),
    ("check_out_time", "hora de check-out"),
)


def missing_hotel_setup_fields(user):
    # Platform administrators must retain access to global hotel administration.
    exempt = is_effective_global_admin(user)
    hotel = getattr(user, "hotel_settings", None)
    return [] if exempt else [
        {"field": field, "label": label}
        for field, label in REQUIRED_SETUP_FIELDS
        if not str(getattr(hotel, field, None) or "").strip()
    ]


def hotel_setup_status(user):
    missing = missing_hotel_setup_fields(user)
    exempt = is_effective_global_admin(user)
    keys = {str(key).replace("-", "_").lower() for key in user.resource_keys()}
    return {
        "is_complete": not missing,
        "missing_fields": missing,
        "can_configure": exempt or bool(keys & {"*", "hotel_settings.*", "hotel_settings.write"}),
        "must_change_password": bool(user.must_change_password),
    }
