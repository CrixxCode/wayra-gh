from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import Role
from apps.demo_requests.models import (
    DemoRequest,
    DemoRequestEmailVerification,
    DemoRequestFloor,
    DemoRequestFloorRoomGroup,
    DemoRequestRoomType,
)
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.master_data.models import MasterData
from apps.rooms.models import Rate, Room, RoomType
from backend.settings import resolve_email_backend


class DemoRequestFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.payload = {
            "hotel_name": "Hotel Demo Test",
            "hotel_type": "Hotel",
            "country": "Colombia",
            "state": "La Guajira",
            "city": "Riohacha",
            "address": "Calle 1 # 2-3",
            "rooms": 24,
            "website": "https://demo.example.com",
            "check_in_time": "15:00",
            "check_out_time": "11:00",
            "requester_first_name": "Laura",
            "requester_last_name": "Diaz",
            "requester_username": "laura.demo.test",
            "requester_email": "laura.demo.test@example.com",
            "requester_job_title": "Administradora",
            "requester_phone": "+57 300 111 2222",
            "message": "Solicitud desde test",
        }
        # La estructura solo viaja en el payload de la API: en el modelo se guarda en
        # tablas aparte, y `rooms` es la suma que calcula el serializer.
        self.structure = {
            "room_types": [
                {
                    "name": "Sencilla",
                    "capacity": 2,
                    "bed_count": 1,
                    "bed_type": "Doble",
                    "billing_mode": "ROOM",
                    "base_price": "180000.00",
                },
                {
                    "name": "Suite",
                    "capacity": 4,
                    "bed_count": 2,
                    "bed_type": "King",
                    "billing_mode": "PERSON",
                    "base_price": "320000.00",
                },
            ],
            "floors": [
                {
                    "floor_number": 1,
                    "name": "Piso 1",
                    "prefix": "1",
                    "room_groups": [
                        {"room_type_index": 0, "quantity": 3},
                        {"room_type_index": 1, "quantity": 1},
                    ],
                },
                {
                    "floor_number": 2,
                    "name": "Piso 2",
                    "prefix": "2",
                    "room_groups": [
                        {"room_type_index": 0, "quantity": 2},
                    ],
                },
            ],
        }
        MasterData.objects.get_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={"name": "Disponible", "sort_order": 1, "is_active": True},
        )

    def build_structured_demo_request(self, **overrides):
        """Crea la solicitud y su estructura sin pasar por la API publica."""
        demo_request = DemoRequest.objects.create(
            **{**self.payload, "rooms": 6, **overrides}
        )
        room_types = [
            DemoRequestRoomType.objects.create(
                demo_request=demo_request,
                name=data["name"],
                capacity=data["capacity"],
                bed_count=data["bed_count"],
                bed_type=data["bed_type"],
                billing_mode=data["billing_mode"],
                base_price=data["base_price"],
                sort_order=index,
            )
            for index, data in enumerate(self.structure["room_types"])
        ]
        for floor_data in self.structure["floors"]:
            floor = DemoRequestFloor.objects.create(
                demo_request=demo_request,
                floor_number=floor_data["floor_number"],
                name=floor_data["name"],
                prefix=floor_data["prefix"],
            )
            for group in floor_data["room_groups"]:
                DemoRequestFloorRoomGroup.objects.create(
                    floor=floor,
                    room_type=room_types[group["room_type_index"]],
                    quantity=group["quantity"],
                )
        return demo_request

    def verified_payload(self, payload=None, code="123456"):
        request_payload = {**self.payload, **self.structure, **(payload or {})}
        verification = DemoRequestEmailVerification.create_for_email(
            email=request_payload["requester_email"],
            code=code,
            expires_at=timezone.now() + timedelta(minutes=15),
        )
        return {
            **request_payload,
            "email_verification_token": str(verification.token),
            "email_verification_code": code,
        }

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    @patch("apps.demo_requests.views.generate_demo_email_verification_code", return_value="654321")
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_public_user_can_request_demo_email_verification(self, send_mock, code_mock):
        response = self.client.post(
            "/api/demo-requests/request-email-verification/",
            {"requester_email": self.payload["requester_email"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("email_verification_token", response.data)
        self.assertEqual(DemoRequestEmailVerification.objects.count(), 1)
        verification = DemoRequestEmailVerification.objects.first()
        self.assertEqual(verification.email, "laura.demo.test@example.com")
        self.assertTrue(check_password("654321", verification.code_hash))
        send_mock.assert_called_once()
        code_mock.assert_called_once()

    def test_public_request_rejects_missing_email_verification(self):
        response = self.client.post("/api/demo-requests/", self.payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email_verification_token", response.data["errors"])
        self.assertIn("email_verification_code", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_public_user_can_create_demo_request_with_verified_email(self):
        response = self.client.post("/api/demo-requests/", self.verified_payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(DemoRequest.objects.count(), 1)
        demo_request = DemoRequest.objects.first()
        self.assertEqual(demo_request.requester_email, "laura.demo.test@example.com")
        self.assertIsNotNone(DemoRequestEmailVerification.objects.first().used_at)

        self.assertEqual(demo_request.room_types.count(), 2)
        self.assertEqual(demo_request.floors.count(), 2)
        # El total lo calcula el serializer desde la estructura, no el formulario.
        self.assertEqual(demo_request.rooms, 6)
        self.assertEqual(
            DemoRequestFloor.objects.get(demo_request=demo_request, floor_number=1).total_rooms, 4
        )

    def test_public_request_rejects_missing_structure(self):
        payload = self.verified_payload()
        payload.pop("room_types")
        payload.pop("floors")

        response = self.client.post("/api/demo-requests/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("room_types", response.data["errors"])
        self.assertIn("floors", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_public_request_rejects_floor_without_rooms(self):
        payload = self.verified_payload()
        payload["floors"][1]["room_groups"] = [{"room_type_index": 0, "quantity": 0}]

        response = self.client.post("/api/demo-requests/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("floors", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_public_request_rejects_repeated_floor_prefix(self):
        payload = self.verified_payload()
        payload["floors"][1]["prefix"] = payload["floors"][0]["prefix"]

        response = self.client.post("/api/demo-requests/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("floors", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_public_request_ignores_client_sent_room_total(self):
        payload = self.verified_payload({"rooms": 999})

        response = self.client.post("/api/demo-requests/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(DemoRequest.objects.first().rooms, 6)

    def test_public_request_rejects_wrong_email_verification_code(self):
        payload = self.verified_payload(code="123456")
        payload["email_verification_code"] = "000000"

        response = self.client.post("/api/demo-requests/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("email_verification_code", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)
        self.assertEqual(DemoRequestEmailVerification.objects.first().attempts, 1)

    def test_public_request_rejects_existing_username(self):
        User = get_user_model()
        User.objects.create_superuser(
            username="laura.demo.test",
            email="other.demo.user@example.com",
            password="TempPass123!",
        )

        response = self.client.post("/api/demo-requests/", self.verified_payload(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("requester_username", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_public_request_rejects_existing_email(self):
        User = get_user_model()
        User.objects.create_superuser(
            username="other.demo.user",
            email="laura.demo.test@example.com",
            password="TempPass123!",
        )

        response = self.client.post("/api/demo-requests/", self.verified_payload(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("requester_email", response.data["errors"])
        self.assertEqual(DemoRequest.objects.count(), 0)

    def test_email_backend_resolves_to_resend(self):
        self.assertEqual(
            resolve_email_backend("", "re_test_key"),
            "anymail.backends.resend.EmailBackend",
        )
        self.assertEqual(
            resolve_email_backend("django.core.mail.backends.smtp.EmailBackend", "re_test_key"),
            "anymail.backends.resend.EmailBackend",
        )
        self.assertEqual(
            resolve_email_backend("django.core.mail.backends.smtp.EmailBackend", ""),
            "anymail.backends.resend.EmailBackend",
        )
        self.assertEqual(
            resolve_email_backend("django.core.mail.backends.console.EmailBackend", ""),
            "django.core.mail.backends.console.EmailBackend",
        )

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        ANYMAIL={"RESEND_API_KEY": "re_test_key"},
        DEFAULT_FROM_EMAIL="Wayra <notificaciones@example.com>",
    )
    @patch("apps.demo_requests.views.generate_temporary_access_password")
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_platform_admin_can_convert_request_into_hotel_and_first_user(self, send_mock, password_mock):
        password_mock.side_effect = ["DemoTemp123!AA", "DemoTemp456!BB"]
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin",
            email="platform-admin@example.com",
            password="TempPass123!",
        )
        demo_request = DemoRequest.objects.create(**self.payload)
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONVERTED", "base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.CONVERTED)
        self.assertIsNotNone(demo_request.converted_hotel_settings_id)
        self.assertIsNotNone(demo_request.converted_user_id)
        self.assertTrue(demo_request.password_reset_sent)

        hotel = HotelSettings.objects.get(id=demo_request.converted_hotel_settings_id)
        first_user = User.objects.get(id=demo_request.converted_user_id)
        self.assertEqual(hotel.hotel_name, self.payload["hotel_name"])
        self.assertEqual(hotel.country, self.payload["country"])
        self.assertEqual(hotel.state, self.payload["state"])
        self.assertEqual(hotel.city, self.payload["city"])
        self.assertEqual(hotel.address, self.payload["address"])
        self.assertEqual(str(hotel.check_in_time), "15:00:00")
        self.assertEqual(str(hotel.check_out_time), "11:00:00")
        # Esta solicitud se creo sin estructura (como las anteriores a 2026-09-14),
        # asi que la conversion cae al piso unico historico.
        self.assertEqual(HotelFloor.objects.filter(hotel_settings=hotel).count(), 1)
        self.assertEqual(
            HotelFloor.objects.get(hotel_settings=hotel, floor_number=1).room_count,
            self.payload["rooms"],
        )
        self.assertEqual(Room.objects.filter(floor__hotel_settings=hotel).count(), self.payload["rooms"])
        self.assertTrue(
            Room.objects.filter(
                floor__hotel_settings=hotel,
                number="101",
                status__code="DISPONIBLE",
            ).exists()
        )
        self.assertEqual(first_user.hotel_settings_id, hotel.id)
        self.assertEqual(first_user.email, self.payload["requester_email"])
        self.assertTrue(first_user.has_usable_password())
        self.assertTrue(first_user.check_password("DemoTemp123!AA"))
        self.assertTrue(first_user.must_change_password)
        self.assertTrue(first_user.roles.filter(slug="admin").exists())
        send_mock.assert_called_once()

        demo_request.password_reset_sent = False
        demo_request.save(update_fields=["password_reset_sent"])
        send_mock.reset_mock()

        resend_response = self.client.post(
            f"/api/demo-requests/{demo_request.id}/resend-access-email/",
            {"base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(resend_response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertTrue(demo_request.password_reset_sent)
        self.assertTrue(resend_response.data["password_reset_sent"])
        first_user.refresh_from_db()
        self.assertTrue(first_user.check_password("DemoTemp456!BB"))
        self.assertTrue(first_user.must_change_password)
        send_mock.assert_called_once()

        link_response = self.client.post(
            f"/api/demo-requests/{demo_request.id}/access-link/",
            {"base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(link_response.status_code, 200)
        self.assertIn("access_url", link_response.data)
        self.assertEqual(link_response.data["access_url"], "http://localhost:4200/login")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    @patch("apps.demo_requests.views.generate_temporary_access_password", return_value="DemoTemp123!AA")
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_converting_structured_request_builds_full_hotel_structure(self, send_mock, password_mock):
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin",
            email="platform-admin@example.com",
            password="TempPass123!",
        )
        demo_request = self.build_structured_demo_request()
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONVERTED", "base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        hotel = HotelSettings.objects.get(id=demo_request.converted_hotel_settings_id)

        floors = HotelFloor.objects.filter(hotel_settings=hotel).order_by("floor_number")
        self.assertEqual([floor.floor_number for floor in floors], [1, 2])
        self.assertEqual([floor.room_count for floor in floors], [4, 2])

        room_types = RoomType.objects.filter(hotel_settings=hotel).order_by("sort_order")
        self.assertEqual([room_type.name for room_type in room_types], ["Sencilla", "Suite"])
        self.assertEqual([room_type.code for room_type in room_types], ["SENCILLA", "SUITE"])
        self.assertEqual([room_type.capacity for room_type in room_types], [2, 4])
        self.assertEqual(
            [room_type.billing_mode for room_type in room_types],
            [RoomType.BillingMode.ROOM, RoomType.BillingMode.PERSON],
        )

        rates = Rate.objects.filter(hotel_settings=hotel).order_by("room_type__sort_order")
        self.assertEqual([str(rate.price) for rate in rates], ["180000.00", "320000.00"])
        # La tarifa hereda el modo de cobro de su tipo (ver `Rate.save`).
        self.assertEqual(
            [rate.billing_mode for rate in rates],
            [RoomType.BillingMode.ROOM, RoomType.BillingMode.PERSON],
        )

        rooms = Room.objects.filter(floor__hotel_settings=hotel).order_by("number")
        self.assertEqual(rooms.count(), 6)
        self.assertEqual(
            [room.number for room in rooms],
            ["101", "102", "103", "104", "201", "202"],
        )
        self.assertEqual(
            Room.objects.get(floor__hotel_settings=hotel, number="104").room_type.name,
            "Suite",
        )
        self.assertTrue(all(room.rate_id for room in rooms))
        self.assertTrue(all(room.status.code == "DISPONIBLE" for room in rooms))

    def test_converting_structured_request_deduplicates_room_type_codes(self):
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin",
            email="platform-admin@example.com",
            password="TempPass123!",
        )
        demo_request = self.build_structured_demo_request()
        # "Sencilla" y "Sencillá" normalizan al mismo codigo: la unicidad
        # `(hotel_settings, code)` de RoomType no puede tumbar la conversion.
        demo_request.room_types.filter(name="Suite").update(name="Sencilla ")
        self.client.force_authenticate(user=admin)

        with patch(
            "apps.demo_requests.views.send_demo_temporary_password_email",
            return_value={"sent": True, "error_detail": ""},
        ):
            response = self.client.patch(
                f"/api/demo-requests/{demo_request.id}/",
                {"status": "CONVERTED"},
                format="json",
                HTTP_HOST="localhost",
            )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        hotel = HotelSettings.objects.get(id=demo_request.converted_hotel_settings_id)
        codes = list(
            RoomType.objects.filter(hotel_settings=hotel)
            .order_by("sort_order")
            .values_list("code", flat=True)
        )
        self.assertEqual(codes, ["SENCILLA", "SENCILLA_2"])

    def test_converted_request_cannot_return_to_followup_status(self):
        User = get_user_model()
        admin = User.objects.create_superuser(
            username="platform-admin-lock-converted",
            email="platform-admin-lock-converted@example.com",
            password="TempPass123!",
        )
        hotel = HotelSettings.objects.create(
            hotel_name="Hotel Convertido",
            city="Riohacha",
            country="Colombia",
            general_email="converted@example.com",
        )
        converted_user = User.objects.create_user(
            username="converted-demo-user",
            email="converted@example.com",
            password="TempPass123!",
            hotel_settings=hotel,
        )
        demo_request = DemoRequest.objects.create(
            **{
                **self.payload,
                "status": DemoRequest.Status.CONVERTED,
                "requester_username": "converted-demo-user",
                "requester_email": "converted@example.com",
                "converted_hotel_settings": hotel,
                "converted_user": converted_user,
            }
        )
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONTACTED"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.data["errors"])
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.CONVERTED)

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="",
        ANYMAIL={"RESEND_API_KEY": ""},
        DEFAULT_FROM_EMAIL="Wayra <notificaciones@example.com>",
    )
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_missing_resend_api_key_keeps_access_link_pending(self, send_mock):
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin-missing-resend-key",
            email="platform-admin-missing-resend-key@example.com",
            password="TempPass123!",
        )
        demo_request = DemoRequest.objects.create(
            **{
                **self.payload,
                "requester_username": "laura.demo.missing-key",
                "requester_email": "laura.demo.missing-key@example.com",
            }
        )
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONVERTED", "base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.CONVERTED)
        self.assertFalse(demo_request.password_reset_sent)
        self.assertFalse(response.data["password_reset_sent"])
        self.assertFalse(response.data["email_delivery_enabled"])
        self.assertIn("RESEND_API_KEY", response.data["email_delivery_error"])
        send_mock.assert_not_called()

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        ANYMAIL={"RESEND_API_KEY": "re_test_key"},
        DEFAULT_FROM_EMAIL="Wayra <onboarding@resend.dev>",
    )
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_resend_test_domain_error_is_returned_to_admin(self, send_mock):
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin-resend-domain",
            email="platform-admin-resend-domain@example.com",
            password="TempPass123!",
        )
        demo_request = DemoRequest.objects.create(
            **{
                **self.payload,
                "requester_username": "laura.demo.resend-domain",
                "requester_email": "laura.demo.resend-domain@example.com",
            }
        )
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONVERTED", "base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertFalse(demo_request.password_reset_sent)
        self.assertFalse(response.data["password_reset_sent"])
        self.assertIn("onboarding@resend.dev", response.data["email_delivery_error"])
        self.assertIn("dominio", response.data["email_delivery_error"])
        send_mock.assert_not_called()

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    @patch("apps.demo_requests.views.EmailMultiAlternatives.send", return_value=1)
    def test_console_email_backend_keeps_access_link_pending(self, send_mock):
        User = get_user_model()
        Role.objects.create(name="Administrador", slug="admin")
        admin = User.objects.create_superuser(
            username="platform-admin-console",
            email="platform-admin-console@example.com",
            password="TempPass123!",
        )
        demo_request = DemoRequest.objects.create(
            **{
                **self.payload,
                "requester_username": "laura.demo.console",
                "requester_email": "laura.demo.console@example.com",
            }
        )
        self.client.force_authenticate(user=admin)

        response = self.client.patch(
            f"/api/demo-requests/{demo_request.id}/",
            {"status": "CONVERTED", "base_url": "http://localhost:4200/login"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertEqual(demo_request.status, DemoRequest.Status.CONVERTED)
        self.assertFalse(demo_request.password_reset_sent)
        self.assertFalse(response.data["password_reset_sent"])
        self.assertFalse(response.data["email_delivery_enabled"])
        send_mock.assert_called_once()
