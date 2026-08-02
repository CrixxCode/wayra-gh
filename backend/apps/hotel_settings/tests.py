from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient, APITestCase

from accounts.models import Resource, Role, SoftDeleteMarker
from apps.hotel_settings.models import HotelFloor, HotelSettings, ReservationPolicy
from apps.master_data.models import MasterData
from apps.rooms.models import Room

User = get_user_model()


class HotelSettingsTenantIsolationTests(APITestCase):
    def setUp(self):
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        self._seed_required_master_data()
        self._seed_rbac()

        self.manager_b = User.objects.create_user(
            username="manager_b",
            email="manager_b@example.com",
            password="pass12345",
            hotel_settings=self.hotel_b,
        )
        self.manager_b.roles.add(self.manager_role)

        self.client = APIClient()
        self.client.force_login(self.manager_b)

    def _seed_required_master_data(self):
        self.room_status_available = MasterData.objects.update_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={"name": "Disponible", "sort_order": 1, "is_active": True},
        )[0]
        self.policy_type = MasterData.objects.update_or_create(
            group=MasterData.Group.RESERVATION_POLICY_TYPE,
            code="FLEXIBLE",
            defaults={"name": "Flexible", "sort_order": 1, "is_active": True},
        )[0]
        self.penalty_type = MasterData.objects.update_or_create(
            group=MasterData.Group.RESERVATION_PENALTY_TYPE,
            code="FIXED",
            defaults={"name": "Fijo", "sort_order": 1, "is_active": True},
        )[0]

    def _seed_rbac(self):
        self.hs_read = Resource.objects.create(
            key="hotel_settings.read",
            name="Hotel settings read",
            link_backend="/api/hotel-settings/",
        )
        self.hs_write = Resource.objects.create(
            key="hotel_settings.write",
            name="Hotel settings write",
            link_backend="/api/hotel-settings/",
        )
        self.rp_read = Resource.objects.create(
            key="reservation-policies.read",
            name="Reservation policies read",
            link_backend="/api/reservation-policies/",
        )
        self.rp_write = Resource.objects.create(
            key="reservation-policies.write",
            name="Reservation policies write",
            link_backend="/api/reservation-policies/",
        )

        self.manager_role = Role.objects.create(
            name="Hotel Settings Manager",
            slug="hotel-settings-manager",
        )
        self.manager_role.resources.add(
            self.hs_read,
            self.hs_write,
            self.rp_read,
            self.rp_write,
        )

    def test_current_returns_only_authenticated_users_hotel(self):
        response = self.client.get("/api/hotel-settings/current/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data)
        self.assertEqual(response.data["id"], self.hotel_b.id)
        self.assertEqual(response.data["hotel_name"], "Hotel B")

    def test_update_other_hotel_is_blocked(self):
        response = self.client.patch(
            f"/api/hotel-settings/{self.hotel_a.id}/",
            {"hotel_name": "Hotel A Modificado"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_update_own_hotel_does_not_affect_other_hotels(self):
        response = self.client.patch(
            f"/api/hotel-settings/{self.hotel_b.id}/",
            {"hotel_name": "Hotel B Modificado"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.hotel_a.refresh_from_db()
        self.hotel_b.refresh_from_db()
        self.assertEqual(self.hotel_a.hotel_name, "Hotel A")
        self.assertEqual(self.hotel_b.hotel_name, "Hotel B Modificado")

    def test_create_hotel_settings_is_rejected_when_user_is_already_assigned(self):
        response = self.client.post(
            "/api/hotel-settings/",
            {"hotel_name": "Hotel Extra"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.data)

    def test_create_hotel_settings_still_rejected_after_clear(self):
        clear_response = self.client.post("/api/hotel-settings/clear/", {}, format="json")
        self.assertEqual(clear_response.status_code, 200)

        create_response = self.client.post(
            "/api/hotel-settings/",
            {"hotel_name": "Hotel B Nuevo"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 400)
        self.assertIn("detail", create_response.data)

    def test_floor_create_forces_authenticated_users_hotel(self):
        response = self.client.post(
            "/api/hotel-floors/",
            {
                "hotel_settings": self.hotel_a.id,
                "floor_number": 1,
                "name": "Piso 1",
                "prefix": "1",
                "room_count": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        floor = HotelFloor.objects.get(pk=response.data["id"])
        self.assertEqual(floor.hotel_settings_id, self.hotel_b.id)

    def test_floor_create_ignores_same_room_numbers_from_other_hotel(self):
        floor_a = HotelFloor.objects.create(
            hotel_settings=self.hotel_a,
            floor_number=7,
            name="A Piso 7",
            prefix="1",
            room_count=4,
        )
        for number in ("101", "102", "103", "104"):
            Room.objects.create(
                number=number,
                floor=floor_a,
                status=self.room_status_available,
            )

        response = self.client.post(
            "/api/hotel-floors/",
            {
                "hotel_settings": self.hotel_b.id,
                "floor_number": 1,
                "name": "B Piso 1",
                "prefix": "1",
                "room_count": 4,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_by_settings_respects_tenant_scope(self):
        HotelFloor.objects.create(
            hotel_settings=self.hotel_a,
            floor_number=1,
            name="A Piso 1",
            prefix="1",
            room_count=1,
        )
        HotelFloor.objects.create(
            hotel_settings=self.hotel_b,
            floor_number=1,
            name="B Piso 1",
            prefix="2",
            room_count=1,
        )

        response = self.client.get(f"/api/hotel-floors/by-settings/{self.hotel_a.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

        response = self.client.get(f"/api/hotel-floors/by-settings/{self.hotel_b.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["hotel_settings"], self.hotel_b.id)

    def test_policy_create_forces_authenticated_users_hotel(self):
        response = self.client.post(
            "/api/reservation-policies/",
            {
                "hotel_settings": self.hotel_a.id,
                "policy_type": self.policy_type.id,
                "penalty_type": self.penalty_type.id,
                "name": "Politica B",
                "description": "",
                "penalty_value": 50,
                "hours_before_checkin": 24,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["hotel_settings"], self.hotel_b.id)

    def test_policy_list_stays_in_user_tenant_even_with_hotel_filter(self):
        ReservationPolicy.objects.create(
            hotel_settings=self.hotel_a,
            policy_type=self.policy_type,
            penalty_type=self.penalty_type,
            name="Politica A",
            penalty_value=10,
            hours_before_checkin=12,
            is_active=True,
        )
        ReservationPolicy.objects.create(
            hotel_settings=self.hotel_b,
            policy_type=self.policy_type,
            penalty_type=self.penalty_type,
            name="Politica B",
            penalty_value=20,
            hours_before_checkin=6,
            is_active=True,
        )

        response = self.client.get(
            f"/api/reservation-policies/?hotel_settings={self.hotel_a.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

        response = self.client.get(
            f"/api/reservation-policies/?hotel_settings={self.hotel_b.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["hotel_settings"], self.hotel_b.id)


class HotelSettingsSuperAdminClearTests(APITestCase):
    def setUp(self):
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        self.superadmin = User.objects.create_superuser(
            username="superadmin_hs",
            email="superadmin_hs@example.com",
            password="pass12345",
        )

        self.client = APIClient()
        self.client.force_login(self.superadmin)

    def test_clear_requires_explicit_hotel_settings_for_superadmin(self):
        response = self.client.post("/api/hotel-settings/clear/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.data)

        list_response = self.client.get("/api/hotel-settings/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 2)

    def test_clear_with_explicit_hotel_settings_only_clears_target(self):
        response = self.client.post(
            f"/api/hotel-settings/clear/?hotel_settings={self.hotel_b.id}",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.hotel_a.refresh_from_db()
        self.hotel_b.refresh_from_db()
        self.assertEqual(self.hotel_a.hotel_name, "Hotel A")
        self.assertEqual(self.hotel_b.hotel_name, "Hotel B")

        list_response = self.client.get("/api/hotel-settings/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 2)

    def test_clear_keeps_hotel_settings_and_soft_deletes_floors_and_rooms(self):
        floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_b,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=2,
        )
        room_status = MasterData.objects.update_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={"name": "Disponible", "sort_order": 1, "is_active": True},
        )[0]
        room = Room.objects.create(number="101", floor=floor, status=room_status)

        response = self.client.post(
            f"/api/hotel-settings/clear/?hotel_settings={self.hotel_b.id}",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.hotel_b.refresh_from_db()
        self.assertEqual(self.hotel_b.hotel_name, "Hotel B")
        self.assertIsNone(self.hotel_b.legal_name)
        self.assertIsNone(self.hotel_b.check_in_time)
        self.assertEqual(self.hotel_b.currency, "COP")

        floor_ct = ContentType.objects.get_for_model(HotelFloor)
        room_ct = ContentType.objects.get_for_model(Room)
        self.assertTrue(
            SoftDeleteMarker.objects.filter(
                content_type=floor_ct,
                object_id=str(floor.id),
            ).exists()
        )
        self.assertTrue(
            SoftDeleteMarker.objects.filter(
                content_type=room_ct,
                object_id=str(room.id),
            ).exists()
        )
