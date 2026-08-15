from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory, APITestCase, force_authenticate

from accounts.models import Resource, Role, SoftDeleteMarker
from apps.clients.models import Client
from apps.hotel_settings.models import HotelFloor, HotelSettings, PaymentMethod, ReservationPolicy
from apps.hotel_settings.views import PaymentMethodViewSet
from apps.master_data.models import MasterData
from apps.reservations.models import Reservation, ReservationRoom
from apps.rooms.models import Room
from apps.rooms.models import Rate, RoomType

User = get_user_model()


class AlliedHotelDirectoryTests(APITestCase):
    def setUp(self):
        self.document_type = MasterData.objects.update_or_create(
            group=MasterData.Group.DOCUMENT_TYPE,
            code="CC",
            defaults={"name": "Cedula", "sort_order": 1, "is_active": True},
        )[0]
        self.client_type = MasterData.objects.update_or_create(
            group=MasterData.Group.CLIENT_TYPE,
            code="REGULAR",
            defaults={"name": "Regular", "sort_order": 1, "is_active": True},
        )[0]
        self.client_status = MasterData.objects.update_or_create(
            group=MasterData.Group.CLIENT_STATUS,
            code="ACTIVO",
            defaults={"name": "Activo", "sort_order": 1, "is_active": True},
        )[0]
        self.room_status = MasterData.objects.update_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={"name": "Disponible", "sort_order": 1, "is_active": True},
        )[0]
        self.reservation_status = MasterData.objects.update_or_create(
            group=MasterData.Group.RESERVATION_STATUS,
            code="PENDIENTE",
            defaults={"name": "Pendiente", "sort_order": 1, "is_active": True},
        )[0]
        self.reservation_origin = MasterData.objects.update_or_create(
            group=MasterData.Group.RESERVATION_ORIGIN,
            code="WEB",
            defaults={"name": "Web", "sort_order": 1, "is_active": True},
        )[0]

    def _hotel(self, name, *, active=True):
        hotel = HotelSettings.objects.create(
            hotel_name=name,
            description="Creado desde solicitud de demo. Tipo de alojamiento: Hostal.",
            city="Bogota",
            state="Cundinamarca",
            country="Colombia",
            reservations_email=f"{name.lower().replace(' ', '')}@example.com",
            is_active=active,
        )
        floor = HotelFloor.objects.create(
            hotel_settings=hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=2,
        )
        room_type = RoomType.objects.create(
            hotel_settings=hotel,
            code=f"STD{hotel.id}",
            name="Habitacion estandar",
            description="Habitacion para reservas publicas.",
            capacity=2,
            is_active=True,
        )
        rate = Rate.objects.create(
            hotel_settings=hotel,
            room_type=room_type,
            name="Flexible",
            price=150000,
            is_active=True,
        )
        Room.objects.create(
            number="101",
            floor=floor,
            room_type=room_type,
            rate=rate,
            status=self.room_status,
        )
        return hotel

    def _create_client(self, hotel):
        return Client.objects.create(
            hotel_settings=hotel,
            document_type=self.document_type,
            document_number=f"CC-{hotel.id}",
            first_name="Cliente",
            last_name="Prueba",
            email=f"cliente-{hotel.id}@example.com",
            client_type=self.client_type,
            status=self.client_status,
        )

    def test_public_directory_returns_only_active_wayra_hotels(self):
        active_hotel = self._hotel("Hotel Activo", active=True)
        inactive_hotel = self._hotel("Hotel Inactivo", active=False)

        response = self.client.get("/api/allied-hotels/")

        self.assertEqual(response.status_code, 200)
        names = [row["name"] for row in response.data]
        self.assertEqual(names, [active_hotel.hotel_name])
        self.assertNotIn(inactive_hotel.hotel_name, names)
        self.assertEqual(response.data[0]["rooms"], 2)
        self.assertEqual(response.data[0]["roomRates"][0]["nightlyRate"], 150000)

    def test_public_directory_hides_inactive_rates(self):
        hotel = self._hotel("Hotel Solo Activo", active=True)
        room_type = RoomType.objects.get(hotel_settings=hotel)
        Rate.objects.create(
            hotel_settings=hotel,
            room_type=room_type,
            name="Suspendida",
            price=90000,
            is_active=False,
        )

        response = self.client.get("/api/allied-hotels/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([rate["rateName"] for rate in response.data[0]["roomRates"]], ["Flexible"])

    def test_public_directory_reports_available_rooms_for_search_dates(self):
        self._hotel("Hotel Con Cupo", active=True)
        check_in = timezone.localdate() + timedelta(days=7)
        check_out = check_in + timedelta(days=2)

        response = self.client.get(
            "/api/allied-hotels/",
            data={
                "checkIn": check_in.isoformat(),
                "checkOut": check_out.isoformat(),
                "rooms": 1,
                "guests": 2,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["availableRooms"], 1)
        self.assertEqual(response.data[0]["roomRates"][0]["availableRooms"], 1)

    def test_public_directory_hides_rates_without_rooms_for_search_dates(self):
        hotel = self._hotel("Hotel Sin Cupo", active=True)
        room = Room.objects.get(floor__hotel_settings=hotel)
        rate = Rate.objects.get(hotel_settings=hotel)
        check_in = timezone.localdate() + timedelta(days=7)
        check_out = check_in + timedelta(days=2)
        reservation = Reservation.objects.create(
            hotel_settings=hotel,
            client=self._create_client(hotel),
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=check_in,
            expected_check_out=check_out,
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=room,
            night_rate=rate.price,
            adults=1,
        )

        response = self.client.get(
            "/api/allied-hotels/",
            data={
                "checkIn": check_in.isoformat(),
                "checkOut": check_out.isoformat(),
                "rooms": 1,
                "guests": 1,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])


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

    def test_floor_update_renumbers_existing_rooms_without_recreating_them(self):
        floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_b,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=2,
        )
        room_101 = Room.objects.create(number="101", floor=floor, status=self.room_status_available)
        room_102 = Room.objects.create(number="102", floor=floor, status=self.room_status_available)

        response = self.client.patch(
            f"/api/hotel-floors/{floor.id}/?delete_extra_rooms=true",
            {
                "hotel_settings": self.hotel_b.id,
                "floor_number": 1,
                "name": "Piso renovado",
                "prefix": "2",
                "room_count": 3,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            list(Room.objects.filter(floor=floor).order_by("number").values_list("number", flat=True)),
            ["201", "202", "203"],
        )
        room_101.refresh_from_db()
        room_102.refresh_from_db()
        self.assertEqual(room_101.number, "201")
        self.assertEqual(room_102.number, "202")
        self.assertEqual(Room.objects.filter(floor=floor).count(), 3)

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


class PaymentMethodTenancyTests(TestCase):
    """Cada hotel administra sus metodos de pago sin ver ni tocar los de otro."""

    def setUp(self):
        self.factory = APIRequestFactory()

        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        self.cash_a = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel_a,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]
        PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel_b,
            code="NEQUI",
            defaults={"name": "Nequi"}
        )[0]

        self.user_a = self._user("hotel_a_admin", self.hotel_a)

    def _user(self, username, hotel):
        user = get_user_model().objects.create_user(
            username=username, password="test-pass-123", hotel_settings=hotel
        )
        role = Role.objects.create(name=f"Role {username}", slug=f"role-{username}")
        for key in ("hotel_settings.read", "hotel_settings.write"):
            resource, _ = Resource.objects.get_or_create(key=key, defaults={"name": key})
            role.resources.add(resource)
        user.roles.add(role)
        return user

    def _list(self, user):
        request = self.factory.get("/api/payment-methods/")
        force_authenticate(request, user=user)
        response = PaymentMethodViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_each_hotel_only_sees_its_own_methods(self):
        rows = self._list(self.user_a)

        self.assertEqual([row["code"] for row in rows], ["EFECTIVO"])

    def test_two_hotels_can_share_the_same_code(self):
        # Lo que era imposible con el catalogo global y su unicidad (group, code).
        method = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel_b,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]

        self.assertNotEqual(method.id, self.cash_a.id)
        self.assertEqual(PaymentMethod.objects.filter(code="EFECTIVO").count(), 2)

    def test_name_cannot_repeat_inside_the_same_hotel(self):
        request = self.factory.post(
            "/api/payment-methods/", {"name": "efectivo"}, format="json"
        )
        force_authenticate(request, user=self.user_a)

        response = PaymentMethodViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data["errors"])

    def test_created_method_belongs_to_the_user_hotel(self):
        request = self.factory.post(
            "/api/payment-methods/", {"name": "Nequi"}, format="json"
        )
        force_authenticate(request, user=self.user_a)

        response = PaymentMethodViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201, response.data)
        created = PaymentMethod.objects.get(pk=response.data["id"])
        self.assertEqual(created.hotel_settings_id, self.hotel_a.id)
        # El codigo se deriva del nombre; el usuario nunca lo escribe.
        self.assertEqual(created.code, "NEQUI")
        self.assertEqual(created.method_type, PaymentMethod.MethodType.CASH)

    def test_transfer_requires_account_number(self):
        request = self.factory.post(
            "/api/payment-methods/",
            {"name": "Bancolombia", "method_type": "TRANSFERENCIA"},
            format="json",
        )
        force_authenticate(request, user=self.user_a)

        response = PaymentMethodViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 400)
        self.assertIn("account_number", response.data["errors"])

    def test_cash_method_discards_the_account_number(self):
        request = self.factory.post(
            "/api/payment-methods/",
            {"name": "Caja menor", "method_type": "EFECTIVO", "account_number": "123-456"},
            format="json",
        )
        force_authenticate(request, user=self.user_a)

        response = PaymentMethodViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(PaymentMethod.objects.get(pk=response.data["id"]).account_number)

    def test_transfer_keeps_its_account_number(self):
        request = self.factory.post(
            "/api/payment-methods/",
            {"name": "Bancolombia", "method_type": "TRANSFERENCIA", "account_number": "123-456"},
            format="json",
        )
        force_authenticate(request, user=self.user_a)

        response = PaymentMethodViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201, response.data)
        created = PaymentMethod.objects.get(pk=response.data["id"])
        self.assertEqual(created.account_number, "123-456")
        self.assertEqual(created.code, "BANCOLOMBIA")

    def test_code_is_derived_from_the_name_without_accents(self):
        self.assertEqual(PaymentMethod.build_code("Transferencia Bancaria"), "TRANSFERENCIA_BANCARIA")
        self.assertEqual(PaymentMethod.build_code("Codigo QR"), "CODIGO_QR")
        self.assertEqual(PaymentMethod.build_code("Tarjeta débito"), "TARJETA_DEBITO")


class DefaultPaymentMethodTests(TestCase):
    """Un hotel nuevo nace pudiendo cobrar en efectivo."""

    def test_new_hotel_gets_a_cash_method(self):
        hotel = HotelSettings.objects.create(hotel_name="Hotel Recien Creado")

        methods = list(hotel.payment_methods.all())

        self.assertEqual(len(methods), 1)
        self.assertEqual(methods[0].code, "EFECTIVO")
        self.assertEqual(methods[0].name, "Efectivo")
        self.assertEqual(methods[0].method_type, PaymentMethod.MethodType.CASH)
        self.assertTrue(methods[0].is_active)
        self.assertIsNone(methods[0].account_number)

    def test_each_hotel_gets_its_own_copy(self):
        first = HotelSettings.objects.create(hotel_name="Hotel Uno")
        second = HotelSettings.objects.create(hotel_name="Hotel Dos")

        self.assertEqual(first.payment_methods.count(), 1)
        self.assertEqual(second.payment_methods.count(), 1)
        self.assertNotEqual(
            first.payment_methods.first().id, second.payment_methods.first().id
        )

    def test_editing_a_hotel_does_not_duplicate_the_method(self):
        hotel = HotelSettings.objects.create(hotel_name="Hotel Editado")

        hotel.hotel_name = "Hotel Editado 2"
        hotel.save()

        self.assertEqual(hotel.payment_methods.count(), 1)

    def test_the_default_can_be_renamed_or_removed_afterwards(self):
        # El metodo es un punto de partida, no una imposicion.
        hotel = HotelSettings.objects.create(hotel_name="Hotel Personalizado")
        method = hotel.payment_methods.get()

        method.name = "Caja"
        method.save()

        self.assertEqual(hotel.payment_methods.get().name, "Caja")
        self.assertEqual(hotel.payment_methods.get().code, "CAJA")
