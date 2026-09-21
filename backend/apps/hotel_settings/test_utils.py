from datetime import time

from apps.master_data.models import MasterData
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.rooms.models import Rate, Room, RoomType


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
        floor = HotelFloor.objects.create(
            hotel_settings=hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        status = MasterData.objects.update_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={"name": "Disponible", "sort_order": 1, "is_active": True},
        )[0]
        room_type = RoomType.objects.create(
            hotel_settings=hotel,
            code=f"STD{hotel.id}",
            name="Habitacion estandar",
            capacity=2,
            is_active=True,
        )
        rate = Rate.objects.create(
            hotel_settings=hotel,
            room_type=room_type,
            name="Tarifa base",
            price=100000,
            is_active=True,
        )
        Room.objects.create(
            number="101",
            floor=floor,
            room_type=room_type,
            rate=rate,
            status=status,
        )
    return hotel
