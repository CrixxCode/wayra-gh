from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData
from apps.services.models import Service
from apps.services.serializers import ServiceSerializer

User = get_user_model()


class ServiceTenantIsolationTests(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "sort_order": sort_order,
                "is_active": True,
            },
        )[0]

    def test_non_superuser_serializer_forces_actor_hotel(self):
        service_type = self._md(MasterData.Group.SERVICE_TYPE, "SPA", "Spa", 1)
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")
        user = User.objects.create_user(
            username="service_user_a",
            email="service_user_a@example.com",
            password="pass12345",
            hotel_settings=hotel_a,
        )

        request = APIRequestFactory().post("/api/services/")
        request.user = user

        serializer = ServiceSerializer(
            data={
                "hotel_settings": hotel_b.id,
                "service_type": service_type.id,
                "name": "Masaje",
                "base_price": "120000.00",
                "is_active": True,
            },
            context={"request": request},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        service = serializer.save()
        self.assertEqual(service.hotel_settings_id, hotel_a.id)

    def test_service_name_is_scoped_per_hotel(self):
        service_type = self._md(MasterData.Group.SERVICE_TYPE, "ROOMSERVICE", "Room Service", 1)
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        Service.objects.create(
            hotel_settings=hotel_a,
            service_type=service_type,
            name="Minibar",
            base_price="15000.00",
            is_active=True,
        )
        Service.objects.create(
            hotel_settings=hotel_b,
            service_type=service_type,
            name="Minibar",
            base_price="18000.00",
            is_active=True,
        )

        self.assertEqual(Service.objects.filter(hotel_settings=hotel_a, name="Minibar").count(), 1)
        self.assertEqual(Service.objects.filter(hotel_settings=hotel_b, name="Minibar").count(), 1)
