from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers as drf_serializers
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Resource, Role, SoftDeleteMarker, User
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.inventory.models import InventoryMovement, InventoryRestockAlert, Item, RoomInventory
from apps.inventory.serializers import RoomInventorySerializer
from apps.inventory.services import register_purchase_entry, register_stock_count
from apps.master_data.models import MasterData
from apps.rooms.models import Room, RoomType
from apps.inventory.views import (
    InventoryMovementViewSet,
    ItemViewSet,
    RoomInventoryViewSet,
)
from apps.master_data.models import MasterData
from apps.rooms.models import Room, RoomType


class RoomInventoryAutomaticMovementTestCase(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def setUp(self):
        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        self.unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Test")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Primer piso",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Standard",
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
            name="Toalla",
            item_purpose=Item.Purpose.ROOM,
            stock=20,
            minimum_stock=2,
            maximum_stock=100,
            cost_price=10000,
            sale_price=12000,
            is_active=True,
        )

    def _create_room_inventory(self, quantity=4):
        serializer = RoomInventorySerializer(
            data={
                "room": self.room.id,
                "item": self.item.id,
                "quantity": quantity,
                "minimum_quantity": 1,
                "notes": "Asignacion inicial",
                "is_active": True,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def test_create_room_inventory_decrements_item_stock_and_creates_out_movement(self):
        assignment = self._create_room_inventory(quantity=5)

        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 15)

        movement = InventoryMovement.objects.filter(
            item=self.item,
            reference=f"ROOM_INV_CREATE:{assignment.id}",
        ).order_by("-id").first()

        self.assertIsNotNone(movement)
        self.assertEqual(movement.movement_type.code, "OUT")
        self.assertEqual(movement.quantity, 5)
        self.assertEqual(movement.previous_stock, 20)
        self.assertEqual(movement.new_stock, 15)

    def test_create_room_inventory_rejects_if_quantity_exceeds_central_stock(self):
        serializer = RoomInventorySerializer(
            data={
                "room": self.room.id,
                "item": self.item.id,
                "quantity": 25,
                "minimum_quantity": 1,
                "notes": "",
                "is_active": True,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.assertRaises(drf_serializers.ValidationError) as context:
            serializer.save()

        self.assertIn("quantity", context.exception.detail)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 20)
        self.assertEqual(RoomInventory.objects.count(), 0)

    def test_create_room_inventory_rejects_reception_item(self):
        reception_item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Gaseosa",
            item_purpose=Item.Purpose.RECEPTION,
            stock=20,
            minimum_stock=2,
            maximum_stock=100,
            cost_price=3000,
            sale_price=6000,
            is_active=True,
        )
        serializer = RoomInventorySerializer(
            data={
                "room": self.room.id,
                "item": reception_item.id,
                "quantity": 1,
                "minimum_quantity": 0,
                "notes": "",
                "is_active": True,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("item", serializer.errors)

    def test_update_room_inventory_quantity_adjusts_stock_with_movements(self):
        assignment = self._create_room_inventory(quantity=4)

        serializer_increase = RoomInventorySerializer(
            instance=assignment,
            data={"quantity": 7},
            partial=True,
        )
        self.assertTrue(serializer_increase.is_valid(), serializer_increase.errors)
        serializer_increase.save()

        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 13)

        out_update_movement = InventoryMovement.objects.filter(
            item=self.item,
            reference=f"ROOM_INV_UPDATE:{assignment.id}",
            movement_type__code="OUT",
            quantity=3,
        ).first()
        self.assertIsNotNone(out_update_movement)

        serializer_decrease = RoomInventorySerializer(
            instance=assignment,
            data={"quantity": 2},
            partial=True,
        )
        self.assertTrue(serializer_decrease.is_valid(), serializer_decrease.errors)
        serializer_decrease.save()

        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 18)

        in_update_movement = InventoryMovement.objects.filter(
            item=self.item,
            reference=f"ROOM_INV_UPDATE:{assignment.id}",
            movement_type__code="IN",
            quantity=5,
        ).first()
        self.assertIsNotNone(in_update_movement)


class InventoryLowStockAutomationTestCase(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def setUp(self):
        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        self.unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)
        self.out_movement_type = self._md(
            MasterData.Group.INVENTORY_MOVEMENT_TYPE,
            "OUT",
            "Salida de inventario",
            1,
        )
        self.in_movement_type = self._md(
            MasterData.Group.INVENTORY_MOVEMENT_TYPE,
            "IN",
            "Entrada de inventario",
            2,
        )

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Stock")
        self.item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Shampoo",
            stock=10,
            minimum_stock=5,
            maximum_stock=100,
            cost_price=5000,
            sale_price=7000,
            is_active=True,
        )

    def test_creates_restock_alert_when_stock_goes_below_minimum(self):
        InventoryMovement.objects.create(
            item=self.item,
            movement_type=self.out_movement_type,
            quantity=6,
            reference="TEST:LOW_STOCK",
            notes="Consumo de prueba",
            is_active=True,
        )

        self.item.refresh_from_db()
        self.assertEqual(self.item.stock, 4)

        alert = InventoryRestockAlert.objects.filter(
            item=self.item,
            status=InventoryRestockAlert.Status.DRAFT,
            is_active=True,
        ).first()
        self.assertIsNotNone(alert)
        self.assertEqual(alert.reference, f"LOW_STOCK:{self.item.id}")
        self.assertEqual(alert.current_stock, 4)
        self.assertEqual(alert.minimum_stock, 5)
        self.assertEqual(alert.suggested_quantity, 1)

    def test_updates_existing_draft_alert_without_creating_duplicates(self):
        InventoryMovement.objects.create(
            item=self.item,
            movement_type=self.out_movement_type,
            quantity=6,
            reference="TEST:LOW_STOCK:1",
            notes="Consumo inicial",
            is_active=True,
        )
        first_alert = InventoryRestockAlert.objects.get(item=self.item, status=InventoryRestockAlert.Status.DRAFT)

        InventoryMovement.objects.create(
            item=self.item,
            movement_type=self.out_movement_type,
            quantity=1,
            reference="TEST:LOW_STOCK:2",
            notes="Consumo adicional",
            is_active=True,
        )

        draft_alerts = InventoryRestockAlert.objects.filter(
            item=self.item,
            status=InventoryRestockAlert.Status.DRAFT,
            is_active=True,
        )
        self.assertEqual(draft_alerts.count(), 1)

        draft_alert = draft_alerts.first()
        self.assertEqual(draft_alert.id, first_alert.id)
        self.assertEqual(draft_alert.current_stock, 3)
        self.assertEqual(draft_alert.minimum_stock, 5)
        self.assertEqual(draft_alert.suggested_quantity, 2)

    def test_resolves_draft_alert_when_stock_recovers(self):
        InventoryMovement.objects.create(
            item=self.item,
            movement_type=self.out_movement_type,
            quantity=6,
            reference="TEST:LOW_STOCK:3",
            notes="Consumo inicial",
            is_active=True,
        )
        self.assertEqual(
            InventoryRestockAlert.objects.filter(
                item=self.item,
                status=InventoryRestockAlert.Status.DRAFT,
                is_active=True,
            ).count(),
            1,
        )

        InventoryMovement.objects.create(
            item=self.item,
            movement_type=self.in_movement_type,
            quantity=3,
            reference="TEST:RECOVER_STOCK",
            notes="Reposicion",
            is_active=True,
        )

        self.assertFalse(
            InventoryRestockAlert.objects.filter(
                item=self.item,
                status=InventoryRestockAlert.Status.DRAFT,
                is_active=True,
            ).exists()
        )

        resolved_alert = InventoryRestockAlert.objects.filter(
            item=self.item,
            status=InventoryRestockAlert.Status.RESOLVED,
        ).first()
        self.assertIsNotNone(resolved_alert)
        self.assertEqual(resolved_alert.current_stock, 7)
        self.assertEqual(resolved_alert.minimum_stock, 5)
        self.assertEqual(resolved_alert.suggested_quantity, 0)
        self.assertIsNotNone(resolved_alert.resolved_at)


class InventoryTenantIsolationTests(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def test_room_inventory_viewset_excludes_cross_hotel_room_item_rows(self):
        room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)

        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")
        floor_a = HotelFloor.objects.create(
            hotel_settings=hotel_a,
            floor_number=1,
            name="Piso A",
            prefix="A",
            room_count=1,
        )
        room_type_a = RoomType.objects.create(
            hotel_settings=hotel_a,
            code="STD-A",
            name="Standard A",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )
        room_a = Room.objects.create(
            number="A101",
            room_type=room_type_a,
            floor=floor_a,
            status=room_status,
        )
        item_a = Item.objects.create(
            hotel_settings=hotel_a,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Toalla A",
            item_purpose=Item.Purpose.ROOM,
            stock=20,
            minimum_stock=2,
            maximum_stock=100,
            cost_price=1000,
            sale_price=2000,
            is_active=True,
        )
        item_b = Item.objects.create(
            hotel_settings=hotel_b,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Toalla B",
            item_purpose=Item.Purpose.ROOM,
            stock=20,
            minimum_stock=2,
            maximum_stock=100,
            cost_price=1000,
            sale_price=2000,
            is_active=True,
        )

        valid_row = RoomInventory.objects.create(
            room=room_a,
            item=item_a,
            quantity=2,
            minimum_quantity=1,
            is_active=True,
        )
        invalid_row = RoomInventory.objects.create(
            room=room_a,
            item=item_b,
            quantity=1,
            minimum_quantity=1,
            is_active=True,
        )

        ids = set(RoomInventoryViewSet().get_base_queryset().values_list("id", flat=True))
        self.assertIn(valid_row.id, ids)
        self.assertNotIn(invalid_row.id, ids)


class ItemLogicalDeleteApiTests(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_superuser(
            username="inventory_admin",
            email="inventory_admin@example.com",
            password="secret123",
        )

        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Inventario")

        self.item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Bata",
            stock=12,
            minimum_stock=2,
            maximum_stock=20,
            cost_price=15000,
            sale_price=22000,
            is_active=True,
        )

    def _delete_item(self):
        delete_request = self.factory.delete(f"/api/items/{self.item.id}/")
        force_authenticate(delete_request, user=self.user)
        response = ItemViewSet.as_view({"delete": "destroy"})(delete_request, pk=self.item.id)
        self.assertEqual(response.status_code, 204)

    def test_delete_item_creates_marker_without_physical_delete(self):
        self._delete_item()

        self.assertTrue(Item.objects.filter(pk=self.item.id).exists())

        content_type = ContentType.objects.get_for_model(Item)
        self.assertTrue(
            SoftDeleteMarker.objects.filter(
                content_type=content_type,
                object_id=str(self.item.id),
            ).exists()
        )

    def test_deleted_item_is_hidden_by_default_and_visible_with_include_deleted(self):
        self._delete_item()

        list_request = self.factory.get("/api/items/")
        force_authenticate(list_request, user=self.user)
        list_response = ItemViewSet.as_view({"get": "list"})(list_request)
        self.assertEqual(list_response.status_code, 200)

        visible_ids = [row["id"] for row in list_response.data]
        self.assertNotIn(self.item.id, visible_ids)

        list_with_deleted_request = self.factory.get("/api/items/?include_deleted=true")
        force_authenticate(list_with_deleted_request, user=self.user)
        list_with_deleted_response = ItemViewSet.as_view({"get": "list"})(list_with_deleted_request)
        self.assertEqual(list_with_deleted_response.status_code, 200)

        visible_ids_with_deleted = [row["id"] for row in list_with_deleted_response.data]
        self.assertIn(self.item.id, visible_ids_with_deleted)

    def test_restore_item_removes_marker_and_makes_item_visible_again(self):
        self._delete_item()

        restore_request = self.factory.post(f"/api/items/{self.item.id}/restore/")
        force_authenticate(restore_request, user=self.user)
        restore_response = ItemViewSet.as_view({"post": "restore"})(restore_request, pk=self.item.id)
        self.assertEqual(restore_response.status_code, 200)

        content_type = ContentType.objects.get_for_model(Item)
        self.assertFalse(
            SoftDeleteMarker.objects.filter(
                content_type=content_type,
                object_id=str(self.item.id),
            ).exists()
        )

        list_request = self.factory.get("/api/items/")
        force_authenticate(list_request, user=self.user)
        list_response = ItemViewSet.as_view({"get": "list"})(list_request)
        self.assertEqual(list_response.status_code, 200)
        visible_ids = [row["id"] for row in list_response.data]
        self.assertIn(self.item.id, visible_ids)


class ItemDeletedListPermissionTests(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Permisos Inventario")

        self.item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Pantuflas",
            stock=8,
            minimum_stock=2,
            maximum_stock=20,
            cost_price=9000,
            sale_price=15000,
            is_active=True,
        )

        content_type = ContentType.objects.get_for_model(Item)
        SoftDeleteMarker.objects.get_or_create(
            content_type=content_type,
            object_id=str(self.item.id),
        )

        self.user = User.objects.create_user(
            username="items_reader",
            email="items_reader@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )

        self.role = Role.objects.create(name="Items Reader Role", slug="items-reader-role")
        self.items_read_resource, _ = Resource.objects.get_or_create(
            key="items.read",
            defaults={"name": "Items Read", "link_backend": "/api/items/"},
        )
        self.role.resources.add(self.items_read_resource)
        self.user.roles.add(self.role)

    def test_include_deleted_requires_items_read_deleted_scope(self):
        request = self.factory.get("/api/items/?include_deleted=true")
        force_authenticate(request, user=self.user)

        response = ItemViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 403)

    def test_include_deleted_is_allowed_with_items_read_deleted_scope(self):
        items_read_deleted_resource, _ = Resource.objects.get_or_create(
            key="items.read_deleted",
            defaults={"name": "Items Read Deleted", "link_backend": "/api/items/"},
        )
        self.role.resources.add(items_read_deleted_resource)

        request = self.factory.get("/api/items/?include_deleted=true")
        force_authenticate(request, user=self.user)

        response = ItemViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200)
        visible_ids = [row["id"] for row in response.data]
        self.assertIn(self.item.id, visible_ids)


class InventoryMovementDeletedListPermissionTests(TestCase):
    def _md(self, group, code, name=None, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name or code.title(),
                "is_active": True,
                "sort_order": sort_order,
            },
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)
        movement_type = self._md(
            MasterData.Group.INVENTORY_MOVEMENT_TYPE,
            "IN",
            "Entrada de inventario",
            1,
        )
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Permisos Movimientos")

        item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Kit aseo",
            stock=0,
            minimum_stock=1,
            maximum_stock=20,
            cost_price=5000,
            sale_price=9000,
            is_active=True,
        )

        self.movement = InventoryMovement.objects.create(
            item=item,
            movement_type=movement_type,
            quantity=2,
            reference="TEST:READ_DELETED",
            notes="Movimiento para prueba",
            is_active=True,
        )

        content_type = ContentType.objects.get_for_model(InventoryMovement)
        SoftDeleteMarker.objects.get_or_create(
            content_type=content_type,
            object_id=str(self.movement.id),
        )

        self.user = User.objects.create_user(
            username="inventory_mov_reader",
            email="inventory_mov_reader@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )

        self.role = Role.objects.create(
            name="Inventory Movements Reader Role",
            slug="inventory-movements-reader-role",
        )
        self.movements_read_resource, _ = Resource.objects.get_or_create(
            key="inventory-movements.read",
            defaults={"name": "Inventory Movements Read", "link_backend": "/api/inventory-movements/"},
        )
        self.role.resources.add(self.movements_read_resource)
        self.user.roles.add(self.role)

    def test_include_deleted_requires_inventory_movements_read_deleted_scope(self):
        request = self.factory.get("/api/inventory-movements/?include_deleted=true")
        force_authenticate(request, user=self.user)

        response = InventoryMovementViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 403)

    def test_include_deleted_is_allowed_with_inventory_movements_read_deleted_scope(self):
        movements_read_deleted_resource, _ = Resource.objects.get_or_create(
            key="inventory-movements.read_deleted",
            defaults={
                "name": "Inventory Movements Read Deleted",
                "link_backend": "/api/inventory-movements/",
            },
        )
        self.role.resources.add(movements_read_deleted_resource)

        request = self.factory.get("/api/inventory-movements/?include_deleted=true")
        force_authenticate(request, user=self.user)

        response = InventoryMovementViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200)
        visible_ids = [row["id"] for row in response.data]
        self.assertIn(self.movement.id, visible_ids)


class RoomInventoryRoomFilterTests(TestCase):
    """`?room=<id>`: la revision de salida pide el inventario de una sola habitacion."""

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "sort_order": 1, "is_active": True},
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible")
        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad")
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad")

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Filtro")
        floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=2,
        )
        room_type = RoomType.objects.create(
            hotel_settings=self.hotel, code="STD", name="Standard", capacity=2
        )
        self.room_a = Room.objects.create(
            number="101", room_type=room_type, floor=floor, status=room_status
        )
        self.room_b = Room.objects.create(
            number="102", room_type=room_type, floor=floor, status=room_status
        )

        item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=item_type,
            unit_measure=unit_measure,
            name="Toalla",
            sku="TOW-900",
            stock=50,
            minimum_stock=5,
            maximum_stock=100,
            cost_price=1000,
            sale_price=2000,
            is_active=True,
            item_purpose=Item.Purpose.ROOM,
        )
        RoomInventory.objects.create(
            room=self.room_a, item=item, quantity=1, minimum_quantity=3, is_active=True
        )
        RoomInventory.objects.create(
            room=self.room_b, item=item, quantity=4, minimum_quantity=3, is_active=True
        )

        self.user = User.objects.create_user(
            username="inventory_reader",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Inventory Reader", slug="inventory-reader")
        resource, _ = Resource.objects.get_or_create(
            key="room-inventory.read",
            defaults={"name": "Room Inventory Read", "link_backend": "/api/room-inventory/"},
        )
        role.resources.add(resource)
        self.user.roles.add(role)

    def _list(self, query=""):
        request = self.factory.get(f"/api/room-inventory/{query}")
        force_authenticate(request, user=self.user)
        response = RoomInventoryViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_without_filter_returns_the_whole_hotel(self):
        self.assertEqual(len(self._list()), 2)

    def test_room_filter_narrows_to_one_room(self):
        rows = self._list(f"?room={self.room_a.id}")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["room"], self.room_a.id)

    def test_invalid_room_filter_is_ignored(self):
        # Un valor no numerico no debe romper la vista ni vaciar el listado.
        self.assertEqual(len(self._list("?room=abc")), 2)


class InventoryMovementIsAppliedOnceTests(TestCase):
    """Un movimiento es un asiento: mueve el stock al registrarlo y nunca mas.

    Antes `save()` recalculaba el antes/despues en cada guardado, asi que editar el
    movimiento --marcarlo inactivo desde su detalle, por ejemplo-- volvia a aplicar la
    cantidad. Un OUT de 1 unidad restaba otra unidad cada vez que se tocaba el registro.
    """

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "is_active": True, "sort_order": 1},
        )[0]

    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Asiento")
        self.item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad"),
            unit_measure=self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad"),
            name="Cargador USB",
            stock=10,
            minimum_stock=0,
            maximum_stock=0,
            cost_price=0,
            sale_price=0,
        )
        self.out_type = self._md(MasterData.Group.INVENTORY_MOVEMENT_TYPE, "OUT", "Salida")
        self.in_type = self._md(MasterData.Group.INVENTORY_MOVEMENT_TYPE, "IN", "Entrada")

    def _stock(self):
        self.item.refresh_from_db()
        return self.item.stock

    def test_movement_applies_stock_when_created(self):
        movement = InventoryMovement.objects.create(
            item=self.item, movement_type=self.out_type, quantity=3
        )

        self.assertEqual(self._stock(), 7)
        self.assertEqual(movement.previous_stock, 10)
        self.assertEqual(movement.new_stock, 7)

    def test_deactivating_a_movement_does_not_move_stock_again(self):
        movement = InventoryMovement.objects.create(
            item=self.item, movement_type=self.out_type, quantity=1
        )
        self.assertEqual(self._stock(), 9)

        movement.is_active = False
        movement.save(update_fields=["is_active"])

        self.assertEqual(self._stock(), 9)

    def test_editing_a_movement_keeps_its_original_trace(self):
        movement = InventoryMovement.objects.create(
            item=self.item, movement_type=self.in_type, quantity=5
        )
        self.assertEqual(self._stock(), 15)

        movement.notes = "Corregida la nota"
        movement.save()
        movement.refresh_from_db()

        # El antes/despues registrado es el del momento en que ocurrio, no el de ahora.
        self.assertEqual(movement.previous_stock, 10)
        self.assertEqual(movement.new_stock, 15)
        self.assertEqual(self._stock(), 15)


class StockCountAndPurchaseEntryTests(TestCase):
    """Conteo fisico e ingreso de compra: las dos operaciones masivas del inventario."""

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "is_active": True, "sort_order": 1},
        )[0]

    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Conteo")
        self.otro_hotel = HotelSettings.objects.create(hotel_name="Hotel Ajeno")
        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad")
        self.unit = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad")

        self.user = User.objects.create_user(
            username="contador",
            email="contador@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )

        self.toallas = self._item("Toallas", 20)
        self.jabon = self._item("Jabon", 8)
        self.ajeno = self._item("Item ajeno", 5, hotel=self.otro_hotel)

    def _item(self, name, stock, hotel=None):
        return Item.objects.create(
            hotel_settings=hotel or self.hotel,
            item_type=self.item_type,
            unit_measure=self.unit,
            name=name,
            stock=stock,
            minimum_stock=5,
            maximum_stock=0,
            cost_price=1000,
            sale_price=2000,
        )

    def _stock(self, item):
        item.refresh_from_db()
        return item.stock

    # ------------------------------------------------------------- conteo

    def test_count_only_registers_the_lines_that_differ(self):
        # Contar 80 items y hallar 1 descuadre debe dejar 1 movimiento, no 80.
        result = register_stock_count(
            lines=[
                {"item": self.toallas.id, "counted": 17},
                {"item": self.jabon.id, "counted": 8},
            ],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertEqual(result["counted_lines"], 2)
        self.assertEqual(result["adjusted_lines"], 1)
        self.assertEqual(result["unchanged_lines"], 1)
        self.assertEqual(self._stock(self.toallas), 17)
        self.assertEqual(self._stock(self.jabon), 8)

    def test_count_sets_the_absolute_value_in_both_directions(self):
        register_stock_count(
            lines=[
                {"item": self.toallas.id, "counted": 25},
                {"item": self.jabon.id, "counted": 3},
            ],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertEqual(self._stock(self.toallas), 25)
        self.assertEqual(self._stock(self.jabon), 3)

    def test_count_records_who_did_it_and_what_the_system_had(self):
        register_stock_count(
            lines=[{"item": self.toallas.id, "counted": 17}],
            user=self.user,
            hotel_settings_id=self.hotel.id,
            notes="Conteo mensual",
        )

        movement = InventoryMovement.objects.get(item=self.toallas)
        self.assertEqual(movement.created_by, self.user)
        self.assertEqual(movement.previous_stock, 20)
        self.assertEqual(movement.new_stock, 17)
        self.assertIn("sistema tenia 20", movement.notes)
        self.assertIn("Conteo mensual", movement.notes)

    def test_every_line_of_a_count_shares_one_reference(self):
        # Sin referencia comun, un conteo queda como ajustes sueltos que nadie agrupa.
        result = register_stock_count(
            lines=[
                {"item": self.toallas.id, "counted": 1},
                {"item": self.jabon.id, "counted": 2},
            ],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        references = set(
            InventoryMovement.objects.filter(id__in=result["movement_ids"]).values_list(
                "reference", flat=True
            )
        )
        self.assertEqual(references, {result["reference"]})
        self.assertTrue(result["reference"].startswith("CONTEO-"))

    def test_count_ignores_items_from_another_hotel(self):
        result = register_stock_count(
            lines=[{"item": self.ajeno.id, "counted": 99}],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertEqual(result["adjusted_lines"], 0)
        self.assertEqual(result["unknown_items"], [self.ajeno.id])
        self.assertEqual(self._stock(self.ajeno), 5)

    # ------------------------------------------------------------ compra

    def test_purchase_entry_adds_what_arrived(self):
        result = register_purchase_entry(
            lines=[
                {"item": self.toallas.id, "quantity": 10},
                {"item": self.jabon.id, "quantity": 4},
            ],
            user=self.user,
            hotel_settings_id=self.hotel.id,
            reference="FACT-PROV-882",
        )

        self.assertEqual(result["entered_lines"], 2)
        self.assertEqual(result["reference"], "FACT-PROV-882")
        self.assertEqual(self._stock(self.toallas), 30)
        self.assertEqual(self._stock(self.jabon), 12)

    def test_purchase_entry_skips_empty_lines(self):
        # Una linea en cero es una linea que el usuario dejo vacia, no una entrada.
        result = register_purchase_entry(
            lines=[
                {"item": self.toallas.id, "quantity": 0},
                {"item": self.jabon.id, "quantity": 5},
            ],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertEqual(result["entered_lines"], 1)
        self.assertEqual(self._stock(self.toallas), 20)

    def test_purchase_entry_generates_a_reference_when_none_is_given(self):
        result = register_purchase_entry(
            lines=[{"item": self.toallas.id, "quantity": 1}],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertTrue(result["reference"].startswith("COMPRA-"))

    def test_purchase_entry_records_the_author(self):
        register_purchase_entry(
            lines=[{"item": self.toallas.id, "quantity": 1}],
            user=self.user,
            hotel_settings_id=self.hotel.id,
        )

        self.assertEqual(InventoryMovement.objects.get(item=self.toallas).created_by, self.user)


class InventoryMovementItemFilterTests(TestCase):
    """`?item=<id>`: el detalle de un item ensena su propia bitacora.

    Traer el historico entero del hotel para filtrarlo en el navegador no escala.
    """

    def _md(self, group, code, name=None):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.title(), "sort_order": 1, "is_active": True},
        )[0]

    def setUp(self):
        self.factory = APIRequestFactory()

        item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad")
        unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad")
        self.in_type = self._md(MasterData.Group.INVENTORY_MOVEMENT_TYPE, "IN", "Entrada")

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Bitacora")

        def _item(name):
            return Item.objects.create(
                hotel_settings=self.hotel,
                item_type=item_type,
                unit_measure=unit_measure,
                name=name,
                stock=10,
                minimum_stock=1,
                maximum_stock=0,
                cost_price=100,
                sale_price=200,
            )

        self.toallas = _item("Toallas")
        self.jabon = _item("Jabon")

        InventoryMovement.objects.create(item=self.toallas, movement_type=self.in_type, quantity=2)
        InventoryMovement.objects.create(item=self.toallas, movement_type=self.in_type, quantity=3)
        InventoryMovement.objects.create(item=self.jabon, movement_type=self.in_type, quantity=1)

        self.user = User.objects.create_user(
            username="movement_reader",
            password="test-pass-123",
            hotel_settings=self.hotel,
        )
        role = Role.objects.create(name="Movement Reader", slug="movement-reader")
        resource, _ = Resource.objects.get_or_create(
            key="inventory-movements.read",
            defaults={
                "name": "Inventory Movements Read",
                "link_backend": "/api/inventory-movements/",
            },
        )
        role.resources.add(resource)
        self.user.roles.add(role)

    def _list(self, query=""):
        request = self.factory.get(f"/api/inventory-movements/{query}")
        force_authenticate(request, user=self.user)
        response = InventoryMovementViewSet.as_view({"get": "list"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_without_filter_returns_the_whole_hotel(self):
        self.assertEqual(len(self._list()), 3)

    def test_item_filter_narrows_to_one_item(self):
        rows = self._list(f"?item={self.toallas.id}")

        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["item"] == self.toallas.id for row in rows))

    def test_invalid_item_filter_is_ignored(self):
        # Un valor no numerico no debe romper la vista ni vaciar el listado.
        self.assertEqual(len(self._list("?item=abc")), 3)
