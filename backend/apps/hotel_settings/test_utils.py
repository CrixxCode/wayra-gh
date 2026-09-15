from datetime import time

from apps.hotel_settings.models import HotelFloor, HotelSettings


def create_configured_hotel(*, with_structure=True, **overrides):
    """Operational API fixtures must satisfy the same setup gate as real hotels."""
    fields = {
        "hotel_name": "Hotel de prueba", "address": "Calle 10 # 20-30",
        "country": "Colombia", "state": "Antioquia", "city": "Medellín",
        "primary_phone": "+573001234567", "general_email": "hotel@example.com",
        "check_in_time": time(15), "check_out_time": time(12),
        "legal_name": "Hotel de prueba SAS", "reservations_email": "reservas@example.com",
        "latitude": 6.24, "longitude": -75.57,
    }
    fields.update(overrides)
    hotel = HotelSettings.objects.create(**fields)
    if with_structure:
        HotelFloor.objects.create(hotel_settings=hotel, floor_number=1, name="Piso 1", prefix="1", room_count=1)
    return hotel
