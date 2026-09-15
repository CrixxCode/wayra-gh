"""Reglas compartidas para la alerta y el bloqueo de operaciones del hotel."""

from accounts.tenancy import is_effective_global_admin


REQUIRED_SETUP_FIELDS = (
    ("hotel_name", "nombre del hotel"),
    ("legal_name", "razón social"),
    ("address", "dirección"),
    ("country", "país"),
    ("state", "departamento"),
    ("city", "ciudad"),
    ("primary_phone", "teléfono"),
    ("general_email", "correo"),
    ("reservations_email", "correo de reservas"),
    ("check_in_time", "hora de check-in"),
    ("check_out_time", "hora de check-out"),
)


def missing_hotel_setup_fields(user):
    # El administrador de plataforma conserva el acceso a la gestion global.
    exempt = is_effective_global_admin(user)
    hotel = getattr(user, "hotel_settings", None)
    if exempt:
        return []
    missing = [
        {"field": field, "label": label}
        for field, label in REQUIRED_SETUP_FIELDS
        if not str(getattr(hotel, field, None) or "").strip()
    ]
    if hotel is None or hotel.latitude is None or hotel.longitude is None:
        missing.append({"field": "coordinates", "label": "ubicación en el mapa"})
    if hotel is None or not hotel.floors.filter(room_count__gt=0).exists():
        missing.append({"field": "floors", "label": "estructura de pisos y habitaciones"})
    return missing


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
