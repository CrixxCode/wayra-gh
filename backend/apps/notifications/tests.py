from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Resource, Role, UserRole
from apps.billing.models import Invoice, Payment
from apps.clients.models import Client
from apps.hotel_settings.models import HotelFloor, HotelSettings, PaymentMethod
from apps.inventory.models import Item
from apps.master_data.models import MasterData
from apps.notifications.models import Notification
from apps.reservations.models import Reservation
from apps.rooms.models import MaintenanceOrder, Room, RoomType


User = get_user_model()


class NotificationApiTests(APITestCase):
    def setUp(self):
        from django.utils import timezone

        # Estas pruebas miran el aislamiento entre usuarios: las notificaciones diarias que
        # la campana genera sola (`scheduled.py`) se dan por generadas para no mezclarlas.
        today = timezone.localdate()
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A", daily_notifications_ran_on=today)
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B", daily_notifications_ran_on=today)

        self.role = Role.objects.create(
            name="Notifications Reader",
            slug="notifications-reader",
            is_active=True,
        )
        self.notifications_read = Resource.objects.create(
            key="notifications.read",
            name="Notifications Read",
            is_active=True,
        )
        self.role.resources.add(self.notifications_read)

        self.user_a = User.objects.create_user(
            username="user_a",
            email="user_a@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel_a,
            is_active=True,
        )
        self.user_b = User.objects.create_user(
            username="user_b",
            email="user_b@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel_b,
            is_active=True,
        )

        UserRole.objects.create(user=self.user_a, role=self.role, is_active=True)
        UserRole.objects.create(user=self.user_b, role=self.role, is_active=True)

        Notification.objects.all().delete()

        self.notification_a_unread = Notification.objects.create(
            hotel_settings=self.hotel_a,
            user=self.user_a,
            title="N1",
            message="Mensaje A1",
            notification_type=Notification.NotificationType.SYSTEM,
            priority=Notification.Priority.MEDIUM,
            is_read=False,
        )
        self.notification_a_read = Notification.objects.create(
            hotel_settings=self.hotel_a,
            user=self.user_a,
            title="N2",
            message="Mensaje A2",
            notification_type=Notification.NotificationType.SYSTEM,
            priority=Notification.Priority.MEDIUM,
            is_read=True,
        )
        self.notification_b = Notification.objects.create(
            hotel_settings=self.hotel_b,
            user=self.user_b,
            title="N3",
            message="Mensaje B1",
            notification_type=Notification.NotificationType.SYSTEM,
            priority=Notification.Priority.MEDIUM,
            is_read=False,
        )

    def test_list_returns_only_authenticated_user_notifications(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        rows = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 2)
        returned_ids = {row["id"] for row in rows}
        self.assertIn(self.notification_a_unread.id, returned_ids)
        self.assertIn(self.notification_a_read.id, returned_ids)
        self.assertNotIn(self.notification_b.id, returned_ids)

    def test_cannot_retrieve_notification_from_another_hotel(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get(f"/api/notifications/{self.notification_b.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mark_as_read_updates_notification(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.post(
            f"/api/notifications/{self.notification_a_unread.id}/mark-as-read/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notification_a_unread.refresh_from_db()
        self.assertTrue(self.notification_a_unread.is_read)
        self.assertIsNotNone(self.notification_a_unread.read_at)

    def test_unread_count_only_counts_current_user(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.get("/api/notifications/unread-count/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unread_count"], 1)

    def test_global_admin_unread_count_matches_list_scope(self):
        global_admin = User.objects.create_user(
            username="global_admin",
            email="global_admin@test.local",
            password="test-pass-123",
            is_active=True,
            is_superuser=True,
        )
        self.client.force_authenticate(global_admin)

        list_response = self.client.get("/api/notifications/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        rows = (
            list_response.data.get("results")
            if isinstance(list_response.data, dict)
            else list_response.data
        )
        expected_unread = sum(1 for row in rows if not row.get("is_read"))

        count_response = self.client.get("/api/notifications/unread-count/")
        self.assertEqual(count_response.status_code, status.HTTP_200_OK)
        self.assertEqual(count_response.data["unread_count"], expected_unread)


class NotificationEventSignalsTests(TestCase):
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
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Notificaciones")
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=10,
        )

        self.role_manager = Role.objects.create(
            name="Manager",
            slug="manager",
            is_active=True,
        )
        self.manager = User.objects.create_user(
            username="manager_user",
            email="manager@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel,
            is_active=True,
        )
        UserRole.objects.create(user=self.manager, role=self.role_manager, is_active=True)

        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.reservation_status = self._md(MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada", 1)
        self.reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)
        self.payment_method = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]
        self.invoice_status = self._md(MasterData.Group.INVOICE_STATUS, "PENDIENTE", "Pendiente", 1)

        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1)
        self.unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)

        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        self.maintenance_priority = self._md(MasterData.Group.MAINTENANCE_PRIORITY, "BAJA", "Baja", 1)
        self.maintenance_status = self._md(MasterData.Group.MAINTENANCE_STATUS, "PENDIENTE", "Pendiente", 1)

        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Standard",
            capacity=2,
            bed_count=1,
            sort_order=1,
            is_active=True,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )

        self.client_obj = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=self.document_type,
            document_number="123456",
            first_name="Ana",
            last_name="Lopez",
            email="ana@test.local",
            phone="3000000000",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        Notification.objects.all().delete()

    def test_reservation_creation_generates_notification(self):
        reservation = Reservation.objects.create(
            client=self.client_obj,
            hotel_settings=self.hotel,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in="2026-04-27",
            expected_check_out="2026-04-28",
            created_by=self.manager,
        )

        notification = Notification.objects.get(
            user=self.manager,
            title="Nueva reserva registrada",
            related_object_id=str(reservation.id),
        )
        # El enlace abre esa reserva, no el listado (Bloque 12 #9).
        self.assertEqual(
            notification.action_url, f"/reservas?action=detail&reservationId={reservation.id}"
        )

    def test_payment_creation_generates_notification(self):
        reservation = Reservation.objects.create(
            client=self.client_obj,
            hotel_settings=self.hotel,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in="2026-04-27",
            expected_check_out="2026-04-28",
            created_by=self.manager,
        )
        invoice = Invoice.objects.create(
            reservation=reservation,
            status=self.invoice_status,
            invoice_number="FAC-TEST-1",
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            is_active=True,
        )

        payment = Payment.objects.create(
            invoice=invoice,
            payment_method=self.payment_method,
            amount=Decimal("50.00"),
            is_active=True,
        )

        notification = Notification.objects.get(
            user=self.manager,
            title="Pago registrado",
            related_object_id=str(payment.id),
        )
        self.assertEqual(notification.action_url, f"/facturacion?tab=invoices&invoice={invoice.id}")

    def test_room_notifications_link_to_the_room(self):
        from apps.notifications.services import notify_room_out_of_service, room_detail_url

        notify_room_out_of_service(self.room)
        notification = Notification.objects.get(user=self.manager, related_object_id=str(self.room.id))
        self.assertEqual(notification.action_url, f"/habitaciones?room={self.room.id}")
        # Limpieza y mantenimiento abren la pestana de operaciones de la habitacion.
        self.assertEqual(
            room_detail_url(self.room, tab="operations"),
            f"/habitaciones?room={self.room.id}&tab=operations",
        )
        self.assertEqual(room_detail_url(None), "/habitaciones")

    def test_low_stock_generates_notification(self):
        item = Item.objects.create(
            hotel_settings=self.hotel,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Shampoo",
            stock=10,
            minimum_stock=5,
            maximum_stock=20,
            cost_price=Decimal("1000.00"),
            sale_price=Decimal("1500.00"),
            is_active=True,
        )

        # Igual al minimo todavia no es "bajo minimo": la regla es la de la alerta de
        # reposicion, que la campana ahora sigue (Bloque 12 #8).
        item.stock = 5
        item.save(update_fields=["stock", "updated_at"])
        self.assertFalse(Notification.objects.filter(title="Stock bajo").exists())

        item.stock = 4
        item.save(update_fields=["stock", "updated_at"])

        self.assertTrue(
            Notification.objects.filter(
                user=self.manager,
                title="Stock bajo",
                related_object_id=str(item.id),
            ).exists()
        )

    def test_maintenance_creation_generates_notification(self):
        order = MaintenanceOrder.objects.create(
            room=self.room,
            title="Filtro de aire",
            description="Cambio de filtro",
            priority=self.maintenance_priority,
            status=self.maintenance_status,
        )

        self.assertTrue(
            Notification.objects.filter(
                user=self.manager,
                title="Nueva orden de mantenimiento creada",
                related_object_id=str(order.id),
            ).exists()
        )


class DailyNotificationsOnReadTests(APITestCase):
    """Auditoria, Bloque 12 #1: los recordatorios se generan sin cron, al consultar la campana."""

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        def md(group, code):
            return MasterData.objects.update_or_create(
                group=group, code=code, defaults={"name": code.title(), "is_active": True}
            )[0]

        self.today = timezone.localdate()
        from apps.hotel_settings.test_utils import create_configured_hotel

        self.hotel = create_configured_hotel(hotel_name="Hotel Campana")
        role = Role.objects.create(name="Lector campana", slug="lector-campana", is_active=True)
        role.resources.add(
            Resource.objects.create(key="notifications.read", name="Notifications Read", is_active=True)
        )
        self.user = User.objects.create_user(
            username="recepcion_campana", password="pass12345", hotel_settings=self.hotel
        )
        UserRole.objects.create(user=self.user, role=role, is_active=True)

        client = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=md(MasterData.Group.DOCUMENT_TYPE, "CC"),
            document_number="8080",
            first_name="Rosa",
            last_name="Vega",
            email="rosa.campana@example.com",
            client_type=md(MasterData.Group.CLIENT_TYPE, "REGULAR"),
            status=md(MasterData.Group.CLIENT_STATUS, "ACTIVO"),
        )
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=client,
            status=md(MasterData.Group.RESERVATION_STATUS, "CONFIRMADA"),
            origin=md(MasterData.Group.RESERVATION_ORIGIN, "DIRECTO"),
            expected_check_in=self.today + timedelta(days=1),
            expected_check_out=self.today + timedelta(days=3),
        )
        Notification.objects.all().delete()
        self.client.force_login(self.user)

    def test_first_read_of_the_day_generates_the_reminders_once(self):
        first = self.client.get("/api/notifications/unread-count/")
        self.assertEqual(first.status_code, 200)
        generated = Notification.objects.filter(hotel_settings=self.hotel).count()
        self.assertGreater(generated, 0)

        self.hotel.refresh_from_db()
        self.assertEqual(self.hotel.daily_notifications_ran_on, self.today)

        # Ni otra lectura ni el listado vuelven a generar.
        self.client.get("/api/notifications/unread-count/")
        self.client.get("/api/notifications/")
        self.assertEqual(Notification.objects.filter(hotel_settings=self.hotel).count(), generated)

    def test_a_failure_does_not_break_the_bell(self):
        from unittest.mock import patch

        with patch(
            "apps.notifications.scheduled.notify_upcoming_checkins", side_effect=RuntimeError("boom")
        ):
            response = self.client.get("/api/notifications/unread-count/")

        self.assertEqual(response.status_code, 200)
        self.hotel.refresh_from_db()
        # No se marca como hecho: la siguiente lectura lo reintenta.
        self.assertIsNone(self.hotel.daily_notifications_ran_on)


class RoleUpdatedNotificationLinkTests(TestCase):
    """Auditoria, Bloque 12 #2: el enlace lleva a una pantalla que el destinatario puede abrir."""

    def test_affected_user_and_managers_get_links_they_can_open(self):
        from apps.notifications.services import notify_user_role_updated

        hotel = HotelSettings.objects.create(hotel_name="Hotel Enlaces")
        manager_role = Role.objects.create(name="Gerente", slug="manager", is_active=True)
        manager = User.objects.create_user(
            username="gerente_enlace", password="pass12345", hotel_settings=hotel
        )
        UserRole.objects.create(user=manager, role=manager_role, is_active=True)
        affected = User.objects.create_user(
            username="afectado_enlace", password="pass12345", hotel_settings=hotel
        )

        notify_user_role_updated(user=affected, role_name="Recepcion", action_label="asignado")

        links = dict(
            Notification.objects.filter(title="Rol de usuario actualizado").values_list(
                "user__username", "action_url"
            )
        )
        self.assertEqual(links, {"gerente_enlace": "/usuarios-hotel", "afectado_enlace": "/mi-perfil"})


class OperationalAlertReachesTheBellTests(TestCase):
    """Auditoria, Bloque 12 #8: una alerta de Finanzas llega a la campana."""

    def test_new_operational_alert_notifies_hotel_managers(self):
        from apps.finance.models import OperationalAlert

        hotel = HotelSettings.objects.create(hotel_name="Hotel Alertas")
        manager_role = Role.objects.create(name="Gerente", slug="manager", is_active=True)
        manager = User.objects.create_user(
            username="gerente_alertas", password="pass12345", hotel_settings=hotel
        )
        UserRole.objects.create(user=manager, role=manager_role, is_active=True)

        alert = OperationalAlert.objects.create(
            hotel_settings=hotel,
            alert_type=OperationalAlert.AlertType.REVENUE_DROP,
            severity=OperationalAlert.Severity.CRITICAL,
            status=OperationalAlert.Status.OPEN,
            title="Caida de ingresos",
            message="Los ingresos cayeron 40% frente al periodo anterior.",
        )

        notification = Notification.objects.get(user=manager, related_object_id=str(alert.id))
        self.assertEqual(notification.action_url, "/control-financiero")
        self.assertEqual(notification.priority, Notification.Priority.CRITICAL)
