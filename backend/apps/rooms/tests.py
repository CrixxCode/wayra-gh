from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Resource, Role
from apps.billing.models import Charge, Invoice, Payment
from apps.clients.models import Client
from apps.hotel_settings.models import HotelFloor, HotelSettings, PaymentMethod
from apps.inventory.models import InventoryMovement, Item, RoomInventory
from apps.master_data.models import MasterData
from apps.reservations.models import Reservation, ReservationRoom
from apps.reservations.services import get_reservation_financials
from apps.rooms.models import Amenity, CleaningTask, MaintenanceOrder, Rate, Room, RoomType
from apps.rooms.serializers import AmenitySerializer
from apps.rooms.views import AmenityViewSet, RoomTypeViewSet, RoomViewSet


class RoomOperationInventoryAutomationTestCase(TestCase):
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

    def setUp(self):
        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)

        self.maintenance_priority = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY,
            "MEDIA",
            "Media",
            1,
        )
        self.maintenance_status_pending = self._md(
            MasterData.Group.MAINTENANCE_STATUS,
            "PENDIENTE",
            "Pendiente",
            1,
        )
        self.maintenance_status_completed = self._md(
            MasterData.Group.MAINTENANCE_STATUS,
            "COMPLETADA",
            "Completada",
            2,
        )

        self.cleaning_task_type_checkout = self._md(
            MasterData.Group.CLEANING_TASK_TYPE,
            "SALIDA",
            "Salida",
            1,
        )
        self.cleaning_status_pending = self._md(
            MasterData.Group.CLEANING_STATUS,
            "PENDIENTE",
            "Pendiente",
            1,
        )
        self.cleaning_status_completed = self._md(
            MasterData.Group.CLEANING_STATUS,
            "COMPLETADA",
            "Completada",
            2,
        )

        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        self.unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Operaciones")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Standard",
            capacity=2,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )

        self.item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Agua",
            sku="WATER-001",
            stock=10,
            minimum_stock=2,
            maximum_stock=100,
            cost_price=1000,
            sale_price=2000,
            is_active=True,
        )

        self.room_inventory = RoomInventory.objects.create(
            room=self.room,
            item=self.item,
            quantity=1,
            minimum_quantity=3,
            is_active=True,
        )

    def test_closing_cleaning_task_replenishes_room_inventory_and_creates_out_movement(self):
        task = CleaningTask.objects.create(
            room=self.room,
            task_type=self.cleaning_task_type_checkout,
            status=self.cleaning_status_pending,
            notes="Limpieza normal",
        )

        task.status = self.cleaning_status_completed
        task.save(update_fields=["status"])

        self.room_inventory.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.room_inventory.quantity, 3)
        self.assertEqual(self.item.stock, 8)

        movement = InventoryMovement.objects.filter(
            item=self.item,
            movement_type__code="OUT",
            reference=f"ROOM_REPLENISH:CLEANING:{task.id}:{self.room_inventory.id}",
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, 2)

        task.notes = "Cierre confirmado"
        task.save(update_fields=["notes"])

        self.assertEqual(
            InventoryMovement.objects.filter(
                reference=f"ROOM_REPLENISH:CLEANING:{task.id}:{self.room_inventory.id}",
            ).count(),
            1,
        )

    def test_closing_maintenance_order_replenishes_partially_when_stock_is_low(self):
        self.room_inventory.quantity = 0
        self.room_inventory.minimum_quantity = 3
        self.room_inventory.save(update_fields=["quantity", "minimum_quantity"])

        self.item.stock = 1
        self.item.save(update_fields=["stock"])

        order = MaintenanceOrder.objects.create(
            room=self.room,
            title="Ajuste lavabo",
            description="Cambio de repuesto",
            priority=self.maintenance_priority,
            status=self.maintenance_status_pending,
        )

        order.status = self.maintenance_status_completed
        order.save(update_fields=["status"])

        self.room_inventory.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.room_inventory.quantity, 1)
        self.assertEqual(self.item.stock, 0)

        movement = InventoryMovement.objects.filter(
            item=self.item,
            movement_type__code="OUT",
            reference=f"ROOM_REPLENISH:MAINTENANCE:{order.id}:{self.room_inventory.id}",
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, 1)


class GlobalAmenityCatalogTests(TestCase):
    def test_create_without_hotel_settings_is_valid_for_global_catalog(self):
        serializer = AmenitySerializer(
            data={
                "name": "WiFi Premium",
                "icon": "fa-solid fa-wifi",
                "is_active": True,
            },
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_hotel_admin_cannot_create_global_amenity(self):
        user_model = get_user_model()
        hotel = HotelSettings.objects.create(hotel_name="Hotel Amenidades")
        user = user_model.objects.create_user(
            username="hotel_admin",
            password="secret123",
            hotel_settings=hotel,
        )

        role = Role.objects.create(name="Amenity Writer", slug="amenity-writer")
        read_resource = Resource.objects.create(
            key="amenities.read",
            name="Amenity Read",
            link_backend="/api/amenities/",
        )
        write_resource = Resource.objects.create(
            key="amenities.write",
            name="Amenity Write",
            link_backend="/api/amenities/",
        )
        role.resources.add(read_resource, write_resource)
        user.roles.add(role)

        request = APIRequestFactory().post(
            "/api/amenities/",
            {
                "name": "Piscina",
                "icon": "fa-solid fa-water-ladder",
                "is_active": True,
            },
            format="json",
        )
        force_authenticate(request, user=user)

        response = AmenityViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Amenity.objects.filter(name="Piscina").exists())


class RoomTypeInactiveUpdateTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Tipos")
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Standard",
            capacity=2,
            is_active=False,
        )

        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="room_type_writer",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        self.role = Role.objects.create(
            name="Room Type Writer Role",
            slug="room-type-writer-role",
        )

        read_resource, _ = Resource.objects.get_or_create(
            key="room_type.read",
            defaults={"name": "Room Type Read", "link_backend": "/api/room-types/"},
        )
        write_resource, _ = Resource.objects.get_or_create(
            key="room_type.write",
            defaults={"name": "Room Type Write", "link_backend": "/api/room-types/"},
        )
        self.role.resources.add(read_resource, write_resource)
        self.user.roles.add(self.role)

    def test_inactive_room_type_is_hidden_from_default_list(self):
        request = self.factory.get("/api/room-types/")
        force_authenticate(request, user=self.user)

        response = RoomTypeViewSet.as_view({"get": "list"})(request)

        self.assertEqual(response.status_code, 200)
        visible_ids = [row["id"] for row in response.data]
        self.assertNotIn(self.room_type.id, visible_ids)

    def test_patch_can_activate_inactive_room_type_without_query_filter(self):
        request = self.factory.patch(
            f"/api/room-types/{self.room_type.id}/",
            {"is_active": True},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = RoomTypeViewSet.as_view({"patch": "partial_update"})(
            request,
            pk=self.room_type.id,
        )

        self.assertEqual(response.status_code, 200)
        self.room_type.refresh_from_db()
        self.assertTrue(self.room_type.is_active)


class RoomRateSelectionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Tarifas")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.status, _ = MasterData.objects.update_or_create(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            defaults={
                "name": "Disponible",
                "is_active": True,
            },
        )
        self.standard = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Standard",
            capacity=2,
        )
        self.suite = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STE",
            name="Suite",
            capacity=4,
        )
        self.standard_low = Rate.objects.create(
            hotel_settings=self.hotel,
            room_type=self.standard,
            name="Temporada baja",
            price=120000,
            is_active=True,
        )
        self.standard_high = Rate.objects.create(
            hotel_settings=self.hotel,
            room_type=self.standard,
            name="Temporada alta",
            price=180000,
            is_active=True,
        )
        self.suite_rate = Rate.objects.create(
            hotel_settings=self.hotel,
            room_type=self.suite,
            name="Suite base",
            price=260000,
            is_active=True,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.standard,
            rate=self.standard_low,
            floor=self.floor,
            status=self.status,
        )

        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="room_writer",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Room Writer Role", slug="room-writer-role")
        read_resource, _ = Resource.objects.get_or_create(
            key="rooms.read",
            defaults={"name": "Rooms Read", "link_backend": "/api/rooms/"},
        )
        write_resource, _ = Resource.objects.get_or_create(
            key="rooms.write",
            defaults={"name": "Rooms Write", "link_backend": "/api/rooms/"},
        )
        role.resources.add(read_resource, write_resource)
        self.user.roles.add(role)

    def test_patch_can_select_one_rate_for_room_type(self):
        request = self.factory.patch(
            f"/api/rooms/{self.room.id}/",
            {"rate": self.standard_high.id},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = RoomViewSet.as_view({"patch": "partial_update"})(request, pk=self.room.id)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["rate"], self.standard_high.id)
        self.room.refresh_from_db()
        self.assertEqual(self.room.rate_id, self.standard_high.id)

    def test_room_list_returns_persisted_rate_price(self):
        self.room.rate = self.standard_high
        self.room.save(update_fields=["rate"])

        request = self.factory.get("/api/rooms/")
        force_authenticate(request, user=self.user)

        response = RoomViewSet.as_view({"get": "list"})(request)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        row = next(item for item in rows if item["id"] == self.room.id)

        self.assertEqual(row["rate"], self.standard_high.id)
        self.assertEqual(row["rate_name"], self.standard_high.name)
        self.assertEqual(row["rate_price"], "180000.00")

    def test_rate_action_persists_selected_rate(self):
        request = self.factory.post(
            f"/api/rooms/{self.room.id}/rate/",
            {"rate": self.standard_high.id},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = RoomViewSet.as_view({"post": "rate"})(request, pk=self.room.id)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["rate"], self.standard_high.id)
        self.room.refresh_from_db()
        self.assertEqual(self.room.rate_id, self.standard_high.id)

    def test_patch_rejects_rate_from_another_room_type(self):
        request = self.factory.patch(
            f"/api/rooms/{self.room.id}/",
            {"rate": self.suite_rate.id},
            format="json",
        )
        force_authenticate(request, user=self.user)

        response = RoomViewSet.as_view({"patch": "partial_update"})(request, pk=self.room.id)

        self.assertEqual(response.status_code, 400)
        self.room.refresh_from_db()
        self.assertEqual(self.room.rate_id, self.standard_low.id)


class RoomOperationalSignalsTests(TestCase):
    """`/api/rooms/` debe decir, sin abrir la habitacion, que le falta a recepcion."""

    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "sort_order": sort_order, "is_active": True},
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible")
        self.cleaning_status_pending = self._md(
            MasterData.Group.CLEANING_STATUS, "PENDIENTE", "Pendiente"
        )
        self.cleaning_status_done = self._md(
            MasterData.Group.CLEANING_STATUS, "COMPLETADA", "Completada", 2
        )
        self.cleaning_type = self._md(MasterData.Group.CLEANING_TASK_TYPE, "SALIDA", "Salida")
        self.maintenance_status_pending = self._md(
            MasterData.Group.MAINTENANCE_STATUS, "PENDIENTE", "Pendiente"
        )
        self.maintenance_status_done = self._md(
            MasterData.Group.MAINTENANCE_STATUS, "COMPLETADA", "Completada", 2
        )
        self.maintenance_priority = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "MEDIA", "Media"
        )

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Senales")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=3,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel, code="STD", name="Standard", capacity=2
        )

        self.clean_room = self._room("101")
        self.dirty_room = self._room("102")
        self.broken_room = self._room("103")

        CleaningTask.objects.create(
            room=self.dirty_room,
            task_type=self.cleaning_type,
            status=self.cleaning_status_pending,
        )
        # Una tarea ya cerrada no debe contar.
        CleaningTask.objects.create(
            room=self.clean_room,
            task_type=self.cleaning_type,
            status=self.cleaning_status_done,
        )
        self.maintenance_priority_urgent = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "URGENTE", "Urgente", 2
        )
        MaintenanceOrder.objects.create(
            room=self.broken_room,
            title="Aire acondicionado",
            priority=self.maintenance_priority,
            status=self.maintenance_status_pending,
        )
        MaintenanceOrder.objects.create(
            room=self.clean_room,
            title="Revision anterior",
            priority=self.maintenance_priority,
            status=self.maintenance_status_done,
        )

        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="reception_signals",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Reception Signals", slug="reception-signals")
        resource, _ = Resource.objects.get_or_create(
            key="rooms.read",
            defaults={"name": "Rooms Read", "link_backend": "/api/rooms/"},
        )
        # Estas pruebas miran las senales, no la privacidad: el usuario es de recepcion
        # y por lo tanto ve documento y saldo. La restriccion se prueba aparte, en
        # `RoomGuestDataScopeTests`.
        guest_data, _ = Resource.objects.get_or_create(
            key="rooms.read_guest_data",
            defaults={"name": "Guest Data", "link_backend": ""},
        )
        role.resources.add(resource, guest_data)
        self.user.roles.add(role)

    def _room(self, number):
        return Room.objects.create(
            number=number,
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )

    def _list_rooms(self):
        request = self.factory.get("/api/rooms/")
        force_authenticate(request, user=self.user)
        response = RoomViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return {item["number"]: item for item in response.data}

    def test_list_exposes_pending_cleaning_and_open_maintenance(self):
        rooms = self._list_rooms()

        self.assertEqual(rooms["102"]["operations"]["pending_cleaning"], 1)
        self.assertEqual(rooms["103"]["operations"]["open_maintenance"], 1)

        # Las tareas y ordenes ya cerradas no dejan senal.
        self.assertEqual(rooms["101"]["operations"]["pending_cleaning"], 0)
        self.assertEqual(rooms["101"]["operations"]["open_maintenance"], 0)

    def test_list_separates_urgent_maintenance(self):
        MaintenanceOrder.objects.create(
            room=self.dirty_room,
            title="Fuga de agua",
            priority=self.maintenance_priority_urgent,
            status=self.maintenance_status_pending,
        )

        rooms = self._list_rooms()

        self.assertEqual(rooms["102"]["operations"]["open_maintenance"], 1)
        self.assertEqual(rooms["102"]["operations"]["urgent_maintenance"], 1)

        # La orden de prioridad media cuenta como abierta pero no como urgente.
        self.assertEqual(rooms["103"]["operations"]["open_maintenance"], 1)
        self.assertEqual(rooms["103"]["operations"]["urgent_maintenance"], 0)

    def test_list_marks_room_inventory_below_minimum(self):
        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad")
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad")
        item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Toalla",
            sku="TOW-001",
            stock=50,
            minimum_stock=5,
            maximum_stock=100,
            cost_price=1000,
            sale_price=2000,
            is_active=True,
        )
        other_item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Jabon",
            sku="SOAP-001",
            stock=50,
            minimum_stock=5,
            maximum_stock=100,
            cost_price=500,
            sale_price=1000,
            is_active=True,
        )

        RoomInventory.objects.create(
            room=self.dirty_room, item=item, quantity=1, minimum_quantity=3, is_active=True
        )
        # Con el minimo cubierto no hay senal.
        RoomInventory.objects.create(
            room=self.clean_room, item=item, quantity=5, minimum_quantity=3, is_active=True
        )
        # `minimum_quantity = 0` significa "sin minimo definido", no "todo falta".
        RoomInventory.objects.create(
            room=self.clean_room, item=other_item, quantity=0, minimum_quantity=0, is_active=True
        )

        rooms = self._list_rooms()

        self.assertEqual(rooms["102"]["operations"]["low_inventory"], 1)
        self.assertEqual(rooms["101"]["operations"]["low_inventory"], 0)

    def test_room_without_reservation_has_no_pending_balance(self):
        operations = self._list_rooms()["101"]["operations"]

        self.assertEqual(operations["pending_balance"], "0.00")
        self.assertEqual(operations["unbilled_charges"], "0.00")
        self.assertEqual(operations["pending_total"], "0.00")

    def test_signals_are_resolved_in_bulk(self):
        """Una consulta por habitacion volveria inusable un hotel grande."""
        for index in range(12):
            self._room(f"20{index}")

        request = self.factory.get("/api/rooms/")
        force_authenticate(request, user=self.user)

        with CaptureQueriesContext(connection) as queries:
            response = RoomViewSet.as_view({"get": "list"})(request)
            self.assertEqual(response.status_code, 200)

        # El listado sube a 15 habitaciones; el conteo de consultas no debe seguirlo.
        self.assertLess(len(queries), 40, f"Consultas: {len(queries)}")


class RoomGuestDataScopeTests(TestCase):
    """El documento y el saldo solo viajan con `rooms.read_guest_data`."""

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "sort_order": 1, "is_active": True},
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible")
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Privacidad")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel, code="STD", name="Standard", capacity=2
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )

        self.read_resource, _ = Resource.objects.get_or_create(
            key="rooms.read",
            defaults={"name": "Rooms Read", "link_backend": "/api/rooms/"},
        )
        self.guest_data_resource, _ = Resource.objects.get_or_create(
            key="rooms.read_guest_data",
            defaults={"name": "Guest Data", "link_backend": ""},
        )

    def _user_with(self, username, resources):
        user_model = get_user_model()
        user = user_model.objects.create_user(
            username=username,
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name=f"Role {username}", slug=f"role-{username}")
        role.resources.add(*resources)
        user.roles.add(role)
        return user

    def _operations_for(self, user):
        request = self.factory.get("/api/rooms/")
        force_authenticate(request, user=user)
        response = RoomViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data[0]["operations"]

    def test_money_is_visible_with_the_scope(self):
        user = self._user_with("reception", [self.read_resource, self.guest_data_resource])

        operations = self._operations_for(user)

        self.assertEqual(operations["pending_balance"], "0.00")
        self.assertEqual(operations["pending_total"], "0.00")

    def test_money_is_hidden_without_the_scope(self):
        user = self._user_with("housekeeping", [self.read_resource])

        operations = self._operations_for(user)

        # null y no "0.00": "no te corresponde saberlo" no es lo mismo que "no debe nada".
        self.assertIsNone(operations["pending_balance"])
        self.assertIsNone(operations["unbilled_charges"])
        self.assertIsNone(operations["pending_total"])

    def test_operational_signals_stay_visible_without_the_scope(self):
        user = self._user_with("housekeeping_signals", [self.read_resource])

        operations = self._operations_for(user)

        # Limpieza, mantenimiento e inventario no son datos del huesped.
        self.assertEqual(operations["pending_cleaning"], 0)
        self.assertEqual(operations["open_maintenance"], 0)
        self.assertEqual(operations["low_inventory"], 0)


class RoomReservationBalanceTests(TestCase):
    """La tarjeta y el modal deben mostrar el mismo saldo.

    El modal usa `Reservation.pending_amount` (estadia + cargos - abonos) y el listado
    usa `operations.reservation_pending`. Si se calcularan distinto, recepcion veria dos
    cifras para la misma habitacion; esta prueba amarra las dos al mismo servicio.
    """

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "sort_order": 1, "is_active": True},
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        room_status = self._md(MasterData.Group.ROOM_STATUS, "OCUPADA", "Ocupada")
        document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula")
        client_type = self._md(MasterData.Group.CLIENT_TYPE, "NATURAL", "Natural")
        client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo")
        reservation_status = self._md(MasterData.Group.RESERVATION_STATUS, "EN_CURSO", "En curso")
        reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "DIRECTA", "Directa")

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Saldos")
        floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        room_type = RoomType.objects.create(
            hotel_settings=self.hotel, code="STD", name="Standard", capacity=2
        )
        self.room = Room.objects.create(
            number="101", room_type=room_type, floor=floor, status=room_status
        )

        client = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=document_type,
            document_number="1006571234",
            first_name="Jose",
            last_name="Perez",
            email="jose@example.com",
            client_type=client_type,
            status=client_status,
        )

        today = timezone.now().date()
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=client,
            status=reservation_status,
            origin=reservation_origin,
            expected_check_in=today - timedelta(days=1),
            expected_check_out=today + timedelta(days=1),
            real_check_in=timezone.now(),
        )
        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("100000.00"),
            adults=1,
        )

        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="balance_reader",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Balance Reader", slug="balance-reader")
        for key in ("rooms.read", "rooms.read_guest_data"):
            resource, _ = Resource.objects.get_or_create(key=key, defaults={"name": key})
            role.resources.add(resource)
        self.user.roles.add(role)

    def _room_operations(self):
        request = self.factory.get("/api/rooms/")
        force_authenticate(request, user=self.user)
        response = RoomViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data[0]["operations"]

    def test_card_balance_matches_reservation_pending_amount(self):
        expected = get_reservation_financials(self.reservation)["pending_amount"]

        operations = self._room_operations()

        # Dos noches a 100.000 y sin abonos.
        self.assertEqual(expected, Decimal("200000.00"))
        self.assertEqual(operations["reservation_pending"], f"{expected:.2f}")

    def test_unbilled_charges_are_reported_apart(self):
        charge_type = self._md(MasterData.Group.CHARGE_TYPE, "CONSUMO", "Consumo")
        Charge.objects.create(
            reservation=self.reservation,
            charge_type=charge_type,
            description="Minibar",
            quantity=3,
            unit_price=Decimal("15000.00"),
            is_active=True,
        )

        operations = self._room_operations()

        # El consumo entra en el saldo de la reserva y ademas se reporta como cargo
        # sin facturar, que es lo que hay que cobrar en el mostrador.
        self.assertEqual(operations["unbilled_charges"], "45000.00")
        self.assertEqual(operations["reservation_pending"], "245000.00")

    def test_full_payment_of_the_reservation_balance_is_accepted(self):
        """El cobro del check-out debe poder saldar la reserva de una sola vez.

        La factura por defecto se sincroniza con el total de la reserva por signals, y
        `Payment.clean()` limita el monto al saldo **de la factura**. Si ambos numeros
        se separaran, el modal de salida pediria cobrar algo que el backend rechaza.
        """
        payment_method = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]

        pending = get_reservation_financials(self.reservation)["pending_amount"]
        self.assertEqual(pending, Decimal("200000.00"))

        invoice = Invoice.objects.filter(reservation=self.reservation, is_active=True).first()
        self.assertIsNotNone(invoice, "La reserva deberia tener factura por defecto.")
        self.assertEqual(invoice.total_amount, pending)

        payment = Payment(invoice=invoice, payment_method=payment_method, amount=pending)
        payment.full_clean()
        payment.save()

        self.reservation.refresh_from_db()
        self.assertEqual(
            get_reservation_financials(self.reservation)["pending_amount"],
            Decimal("0.00"),
        )
        self.assertEqual(self._room_operations()["reservation_pending"], "0.00")
