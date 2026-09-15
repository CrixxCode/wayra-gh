from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import Resource, Role
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.hotel_settings.test_utils import create_configured_hotel


@override_settings(REST_FRAMEWORK={
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_THROTTLE_CLASSES": [],
})
class HotelSetupGateTests(APITestCase):
    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel de prueba")
        HotelFloor.objects.create(hotel_settings=self.hotel, floor_number=1, name="Piso 1", prefix="1", room_count=1)
        self.user = get_user_model().objects.create_user(
            username="setup-manager", password="test-password", hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Setup manager", slug="setup-manager")
        for key in ("hotel_settings.read", "hotel_settings.write", "clients.read", "clients.write"):
            resource, _ = Resource.objects.get_or_create(key=key, defaults={"name": key})
            role.resources.add(resource)
        self.user.roles.add(role)
        self.client.force_login(self.user)

    def complete_payload(self):
        return {
            "address": "Calle 10 # 20-30", "country": "Colombia", "state": "Antioquia",
            "city": "Medellín", "primary_phone": "+573001234567", "general_email": "hotel@example.com",
            "check_in_time": "15:00:00", "check_out_time": "12:00:00",
            "legal_name": "Hotel de prueba SAS", "reservations_email": "reservas@example.com",
            "latitude": 6.24, "longitude": -75.57,
        }

    def test_status_lists_missing_fields_without_settings_read_permission(self):
        self.user.roles.clear()
        response = self.client.get("/api/auth/hotel-setup/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_complete"])
        self.assertFalse(response.data["can_configure"])
        self.assertIn("address", [item["field"] for item in response.data["missing_fields"]])
        self.assertNotIn("hotel_name", [item["field"] for item in response.data["missing_fields"]])

    def test_direct_operational_reads_and_writes_are_blocked(self):
        for method, path in (("get", "/api/clients/"), ("post", "/api/clients/"),
                             ("patch", "/api/clients/1/"), ("delete", "/api/clients/1/"),
                             ("get", "/api/reports/"), ("get", "/api/rooms/")):
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["code"], "hotel_setup_required")

    def test_saved_completion_unlocks_and_clear_relocks_operations(self):
        response = self.client.patch(f"/api/hotel-settings/{self.hotel.pk}/", self.complete_payload(), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(self.client.get("/api/auth/hotel-setup/").data["is_complete"])
        self.assertEqual(self.client.get("/api/clients/").status_code, 200)
        self.assertEqual(self.client.post("/api/hotel-settings/clear/", {}, format="json").status_code, 200)
        self.assertEqual(self.client.get("/api/clients/").json()["code"], "hotel_setup_required")

    def test_partial_save_and_new_session_remain_blocked(self):
        self.client.patch(f"/api/hotel-settings/{self.hotel.pk}/", {"address": "Calle 1"}, format="json")
        self.client.logout()
        self.client.force_login(self.user)
        self.assertEqual(self.client.get("/api/clients/").json()["code"], "hotel_setup_required")

    def test_another_hotel_cannot_bypass_gate(self):
        other = create_configured_hotel(hotel_name="Completo")
        response = self.client.get("/api/clients/", {"hotel_settings": other.pk})
        self.assertEqual(response.json()["code"], "hotel_setup_required")

    def test_whitespace_and_unassigned_users_are_incomplete(self):
        HotelSettings.objects.filter(pk=self.hotel.pk).update(**self.complete_payload(), hotel_name="   ")
        status = self.client.get("/api/auth/hotel-setup/").data
        self.assertEqual([item["field"] for item in status["missing_fields"]], ["hotel_name"])
        self.user.hotel_settings = None
        self.user.save(update_fields=["hotel_settings"])
        self.assertFalse(self.client.get("/api/auth/hotel-setup/").data["is_complete"])

    def test_hotel_superuser_is_blocked_but_platform_administration_is_available(self):
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        self.assertEqual(self.client.get("/api/clients/").json()["code"], "hotel_setup_required")
        self.user.hotel_settings = None
        self.user.save(update_fields=["hotel_settings"])
        self.assertTrue(self.client.get("/api/auth/hotel-setup/").data["is_complete"])
        self.assertEqual(self.client.get("/api/hotel-settings/").status_code, 200)

    def test_password_change_takes_precedence_and_status_remains_available(self):
        self.user.must_change_password = True
        self.user.save(update_fields=["must_change_password"])
        self.assertTrue(self.client.get("/api/auth/hotel-setup/").data["must_change_password"])
        self.assertEqual(self.client.get("/api/clients/").json()["code"], "password_change_required")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)

    def test_setup_does_not_grant_write_permission(self):
        self.user.roles.clear()
        response = self.client.patch(f"/api/hotel-settings/{self.hotel.pk}/", self.complete_payload(), format="json")
        self.assertEqual(response.status_code, 403)

    def test_status_requires_authentication(self):
        self.client.logout()
        self.assertEqual(self.client.get("/api/auth/hotel-setup/").status_code, 403)

    def test_map_and_structure_remain_required_and_zero_coordinates_are_valid(self):
        HotelSettings.objects.filter(pk=self.hotel.pk).update(**self.complete_payload())
        HotelSettings.objects.filter(pk=self.hotel.pk).update(latitude=0, longitude=0)
        self.assertTrue(self.client.get("/api/auth/hotel-setup/").data["is_complete"])
        self.hotel.floors.update(room_count=0)
        response = self.client.get("/api/auth/hotel-setup/")
        self.assertEqual(response.data["missing_fields"], [{"field": "floors", "label": "estructura de pisos y habitaciones"}])

    def test_inactive_hotel_restriction_takes_precedence(self):
        HotelSettings.objects.filter(pk=self.hotel.pk).update(is_active=False)
        self.assertEqual(self.client.get("/api/clients/").json()["code"], "hotel_inactive")
