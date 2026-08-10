from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Resource, Role
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.inventory.models import InventoryMovement, Item, RoomInventory
from apps.master_data.models import MasterData
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
