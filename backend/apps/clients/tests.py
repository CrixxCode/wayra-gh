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

    def test_only_deleted_lists_just_the_soft_deleted_clients(self):
        # Bloque 5 #7: "Ver eliminados" ya no baja el listado completo dos veces.
        from apps.clients.models import Client

        deleted = Client.objects.create(
            hotel_settings=self.customer.hotel_settings,
            document_type=self.customer.document_type,
            document_number="6060",
            first_name="Borrada",
            last_name="Prueba",
            email="borrada@example.com",
            client_type=self.customer.client_type,
            status=self.customer.status,
        )
        self.assertEqual(self.api.delete(f"/api/clients/{deleted.id}/").status_code, 204)

        response = self.api.get("/api/clients/", {"include_inactive": "true", "only_deleted": "true"})

        self.assertEqual(response.status_code, 200)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual([row["id"] for row in rows], [deleted.id])

    def test_generic_update_cannot_change_the_type(self):
        response = self.api.patch(
            f"/api/clients/{self.customer.id}/", {"client_type": "VIP"}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.client_type.code, "REGULAR")
        self.assertFalse(self.customer.client_type_is_manual)


class ClientDocumentAndAdminTests(TestCase):
    """Auditoria, Bloque 5 #3-#4."""

    def setUp(self):
        from apps.clients.models import Client

        def md(group, code):
            return MasterData.objects.update_or_create(
                group=group, code=code, defaults={"name": code.title(), "is_active": True}
            )[0]

        self.Client = Client
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Documentos")
        self.fields = {
            "hotel_settings": self.hotel,
            "document_type": md(MasterData.Group.DOCUMENT_TYPE, "PASAPORTE"),
            "first_name": "Ana",
            "last_name": "Gil",
            "client_type": md(MasterData.Group.CLIENT_TYPE, "REGULAR"),
            "status": md(MasterData.Group.CLIENT_STATUS, "ACTIVO"),
        }

    def test_document_is_stored_uppercase_so_case_variants_collide(self):
        from django.db import IntegrityError, transaction

        first = self.Client.objects.create(document_number=" ab123 ", email="a@example.com", **self.fields)
        self.assertEqual(first.document_number, "AB123")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.Client.objects.create(document_number="Ab123", email="b@example.com", **self.fields)

    def test_admin_delete_is_a_logical_delete(self):
        from django.contrib import admin as django_admin

        from accounts.soft_delete import is_soft_deleted

        customer = self.Client.objects.create(document_number="X1", email="x1@example.com", **self.fields)
        model_admin = django_admin.site._registry[self.Client]

        model_admin.delete_model(None, customer)

        self.assertTrue(self.Client.objects.filter(pk=customer.pk).exists())
        self.assertTrue(is_soft_deleted(customer))
        self.assertFalse(model_admin.get_queryset(type("R", (), {"user": None})()).filter(pk=customer.pk).exists())


class OnlyDeletedScopeTests(TestCase):
    """`only_deleted` muestra eliminados: exige `clients.read_deleted` como `include_deleted`."""

    def test_only_deleted_requires_the_read_deleted_scope(self):
        from rest_framework.test import APIClient

        from accounts.models import Resource, Role, RoleResource, UserRole
        from apps.hotel_settings.test_utils import create_configured_hotel

        hotel = create_configured_hotel(hotel_name="Hotel Scope Eliminados")
        role = Role.objects.create(name="Lectura clientes", slug="lectura-clientes", is_active=True)
        resource, _ = Resource.objects.get_or_create(
            key="clients.read", defaults={"name": "clients.read", "is_active": True}
        )
        RoleResource.objects.create(role=role, resource=resource)
        user = User.objects.create_user(username="lector_clientes", password="Pass12345!", hotel_settings=hotel)
        UserRole.objects.create(user=user, role=role, is_active=True)
        api = APIClient()
        api.force_authenticate(user)

        self.assertEqual(api.get("/api/clients/").status_code, 200)
        self.assertEqual(api.get("/api/clients/", {"only_deleted": "true"}).status_code, 403)


class ClientApiTests(TestCase):
    """ViewSet de clientes: scopes, unicidad por hotel, aislamiento y restauracion (B5 #8)."""

    def setUp(self):
        from rest_framework.test import APIClient

        from accounts.test_helpers import make_hotel_user
        from apps.hotel_settings.test_utils import create_configured_hotel

        def md(group, code):
            return MasterData.objects.update_or_create(
                group=group, code=code, defaults={"name": code.title(), "is_active": True}
            )[0]

        md(MasterData.Group.DOCUMENT_TYPE, "CC")
        md(MasterData.Group.CLIENT_STATUS, "ACTIVO")
        for code in ("REGULAR", "FRECUENTE", "VIP"):
            md(MasterData.Group.CLIENT_TYPE, code)

        self.hotel = create_configured_hotel(hotel_name="Hotel Clientes A")
        self.other_hotel = create_configured_hotel(hotel_name="Hotel Clientes B")
        self.writer = make_hotel_user(self.hotel, "clients.read", "clients.write")
        self.reader = make_hotel_user(self.hotel, "clients.read")
        self.other_writer = make_hotel_user(self.other_hotel, "clients.read", "clients.write")
        self.api = APIClient()

    def _create(self, document="1001", email="ana@example.com"):
        return self.api.post(
            "/api/clients/",
            {
                "document_type": "CC",
                "document_number": document,
                "first_name": "Ana",
                "last_name": "Perez",
                "email": email,
                "phone": "3000000000",
                "country": "CO",
            },
            format="json",
        )

    def _rows(self, response):
        return response.data["results"] if isinstance(response.data, dict) else response.data

    def test_reader_cannot_create(self):
        self.api.force_authenticate(self.reader)
        self.assertEqual(self._create().status_code, 403)

    def test_document_is_unique_per_hotel_not_globally(self):
        self.api.force_authenticate(self.writer)
        self.assertEqual(self._create().status_code, 201)
        self.assertEqual(self._create(email="otra@example.com").status_code, 400)

        # El mismo documento en otro hotel es otro cliente.
        self.api.force_authenticate(self.other_writer)
        self.assertEqual(self._create().status_code, 201)

    def test_listing_is_isolated_by_hotel(self):
        self.api.force_authenticate(self.other_writer)
        self._create(document="2002", email="b@example.com")
        self.api.force_authenticate(self.writer)
        self._create()

        documents = {row["document_number"] for row in self._rows(self.api.get("/api/clients/"))}

        self.assertEqual(documents, {"1001"})

    def test_delete_is_logical_and_can_be_restored(self):
        self.api.force_authenticate(self.writer)
        client_id = self._create().data["id"]
        self.assertEqual(self.api.delete(f"/api/clients/{client_id}/").status_code, 204)
        self.assertEqual(self.api.get(f"/api/clients/{client_id}/").status_code, 404)

        self.assertEqual(self.api.post(f"/api/clients/{client_id}/restore/").status_code, 200)
        self.assertEqual(self.api.get(f"/api/clients/{client_id}/").status_code, 200)

    def test_public_register_is_closed_by_default(self):
        response = self._create_anonymous()
        self.assertIn(response.status_code, (401, 403))

    def _create_anonymous(self):
        self.api.force_authenticate(None)
        return self.api.post(
            "/api/clients/register/",
            {"document_type": "CC", "document_number": "3003", "first_name": "X", "last_name": "Y"},
            format="json",
        )
