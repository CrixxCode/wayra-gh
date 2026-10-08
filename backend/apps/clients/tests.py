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


class ManualClientTypeTests(TestCase):
    """Auditoria, Bloque 5 #1: el tipo de cliente se puede fijar a mano y volver a automatico."""

    def setUp(self):
        from rest_framework.test import APIClient

        from apps.clients.models import Client

        def md(group, code):
            return MasterData.objects.update_or_create(
                group=group, code=code, defaults={"name": code.title(), "is_active": True}
            )[0]

        for code in ("REGULAR", "FRECUENTE", "VIP"):
            md(MasterData.Group.CLIENT_TYPE, code)
        hotel = HotelSettings.objects.create(hotel_name="Hotel Tipos")
        self.customer = Client.objects.create(
            hotel_settings=hotel,
            document_type=md(MasterData.Group.DOCUMENT_TYPE, "CC"),
            document_number="5050",
            first_name="Marta",
            last_name="Diaz",
            email="marta.tipos@example.com",
            client_type=MasterData.objects.get(group=MasterData.Group.CLIENT_TYPE, code="REGULAR"),
            status=md(MasterData.Group.CLIENT_STATUS, "ACTIVO"),
        )
        self.api = APIClient()
        self.api.force_login(
            User.objects.create_superuser(
                username="platform_types", email="pt@example.com", password="pass12345"
            )
        )
        self.url = f"/api/clients/{self.customer.id}/set-client-type/"

    def test_manual_type_persists_and_survives_later_saves(self):
        response = self.api.patch(self.url, {"client_type": "VIP"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["client_type"], "VIP")
        self.assertTrue(response.data["client_type_is_manual"])

        # Un guardado cualquiera (p. ej. el de un check-out) ya no lo pisa.
        self.customer.refresh_from_db()
        self.customer.total_stay_nights = 2
        self.customer.save()
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.client_type.code, "VIP")

    def test_auto_returns_to_the_type_by_stay_nights(self):
        self.api.patch(self.url, {"client_type": "VIP"}, format="json")
        self.customer.refresh_from_db()
        self.customer.total_stay_nights = 12
        self.customer.save()

        response = self.api.patch(self.url, {"client_type": "AUTO"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["client_type"], "FRECUENTE")
        self.assertFalse(response.data["client_type_is_manual"])

    def test_generic_update_cannot_change_the_type(self):
        response = self.api.patch(
            f"/api/clients/{self.customer.id}/", {"client_type": "VIP"}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.client_type.code, "REGULAR")
        self.assertFalse(self.customer.client_type_is_manual)
