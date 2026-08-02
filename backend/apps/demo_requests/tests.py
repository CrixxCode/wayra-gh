from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Role
from apps.demo_requests.models import DemoRequest
from apps.hotel_settings.models import HotelSettings


class DemoRequestFlowTests(APITestCase):
    def setUp(self):
        self.payload = {
            "hotel_name": "Hotel Demo Test",
            "hotel_type": "Hotel",
            "city": "Riohacha",
            "rooms": 24,
            "website": "https://demo.example.com",
            "requester_first_name": "Laura",
            "requester_last_name": "Diaz",
            "requester_username": "laura.demo.test",
            "requester_email": "laura.demo.test@example.com",
            "requester_job_title": "Administradora",
            "requester_phone": "+57 300 111 2222",
            "message": "Solicitud desde test",
        }

    def test_public_user_can_create_demo_request(self):
        response = self.client.post("/api/demo-requests/", self.payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(DemoRequest.objects.count(), 1)
        self.assertEqual(DemoRequest.objects.first().requester_email, "laura.demo.test@example.com")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend")
    @patch("accounts.serializers.EmailMultiAlternatives.send", return_value=1)
    def test_platform_admin_can_convert_request_into_hotel_and_first_user(self, send_mock):
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
            {"status": "CONVERTED", "base_url": "http://localhost:4200/reset-password"},
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
        self.assertEqual(first_user.hotel_settings_id, hotel.id)
        self.assertEqual(first_user.email, self.payload["requester_email"])
        self.assertFalse(first_user.has_usable_password())
        self.assertTrue(first_user.roles.filter(slug="admin").exists())
        send_mock.assert_called_once()

        demo_request.password_reset_sent = False
        demo_request.save(update_fields=["password_reset_sent"])
        send_mock.reset_mock()

        resend_response = self.client.post(
            f"/api/demo-requests/{demo_request.id}/resend-access-email/",
            {"base_url": "http://localhost:4200/reset-password"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(resend_response.status_code, 200)
        demo_request.refresh_from_db()
        self.assertTrue(demo_request.password_reset_sent)
        self.assertTrue(resend_response.data["password_reset_sent"])
        send_mock.assert_called_once()

        link_response = self.client.post(
            f"/api/demo-requests/{demo_request.id}/access-link/",
            {"base_url": "http://localhost:4200/reset-password"},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(link_response.status_code, 200)
        self.assertIn("access_url", link_response.data)
        self.assertTrue(
            link_response.data["access_url"].startswith("http://localhost:4200/reset-password?uid=")
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    @patch("accounts.serializers.EmailMultiAlternatives.send", return_value=1)
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
            {"status": "CONVERTED", "base_url": "http://localhost:4200/reset-password"},
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
