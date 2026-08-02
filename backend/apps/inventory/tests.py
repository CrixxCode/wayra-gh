from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers as drf_serializers
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import Resource, Role, SoftDeleteMarker, User
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.inventory.models import InventoryMovement, InventoryRestockAlert, Item, RoomInventory
from apps.inventory.serializers import RoomInventorySerializer
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
