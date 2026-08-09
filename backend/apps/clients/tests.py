from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.clients.serializers import ClientCreateUpdateSerializer
from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData

User = get_user_model()


class ClientCreateUpdateSerializerTests(TestCase):
    def setUp(self):
        self.hotel_settings = HotelSettings.objects.create(hotel_name="Hotel Clientes")
        self.document_type = MasterData.objects.update_or_create(
            group=MasterData.Group.DOCUMENT_TYPE,
            code="CC",
            defaults={"name": "Cedula", "is_active": True},
        )[0]
        self.client_type = MasterData.objects.update_or_create(
            group=MasterData.Group.CLIENT_TYPE,
            code="REGULAR",
            defaults={"name": "Regular", "is_active": True},
        )[0]
        self.client_status = MasterData.objects.update_or_create(
            group=MasterData.Group.CLIENT_STATUS,
            code="ACTIVO",
            defaults={"name": "Activo", "is_active": True},
        )[0]
        self.user = User.objects.create_user(
            username="client_tester",
            email="client.tester@example.com",
            password="Pass12345!",
            hotel_settings=self.hotel_settings,
        )

    def _request(self):
        return type("Request", (), {"user": self.user})()

    def _payload(self, **overrides):
        payload = {
            "document_type": self.document_type.code,
            "document_number": "123456789",
            "first_name": "Laura",
            "last_name": "Perez",
            "email": "laura@example.com",
            "phone": "+573001234567",
            "country": "CO",
            "client_type": self.client_type.code,
            "status": self.client_status.code,
        }
        payload.update(overrides)
        return payload

    def test_rejects_invalid_email_when_creating_client(self):
        serializer = ClientCreateUpdateSerializer(
            data=self._payload(email="correo-invalido"),
            context={"request": self._request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_rejects_phone_with_non_numeric_body(self):
        serializer = ClientCreateUpdateSerializer(
            data=self._payload(phone="+57ABC123"),
            context={"request": self._request()},
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("phone", serializer.errors)

    def test_accepts_international_phone_prefix_with_digits(self):
        serializer = ClientCreateUpdateSerializer(
            data=self._payload(phone="+573001234567"),
            context={"request": self._request()},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["phone"], "+573001234567")
