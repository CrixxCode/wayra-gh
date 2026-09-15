from datetime import time

from apps.hotel_settings.models import HotelSettings


def create_configured_hotel(**overrides):
    """Operational API fixtures must satisfy the same setup gate as real hotels."""
    fields = {
        "hotel_name": "Hotel de prueba", "address": "Calle 10 # 20-30",
        "country": "Colombia", "state": "Antioquia", "city": "Medellín",
        "primary_phone": "+573001234567", "general_email": "hotel@example.com",
        "check_in_time": time(15), "check_out_time": time(12),
    }
    fields.update(overrides)
    return HotelSettings.objects.create(**fields)
