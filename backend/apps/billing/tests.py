from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Resource, Role
from apps.billing.models import Charge, CreditNote, Invoice, Payment, PaymentRefund
from apps.billing.serializers import ChargeSerializer
from apps.billing.services import get_or_create_default_charge_type
from apps.billing.views import ChargeViewSet
from apps.clients.models import Client
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.inventory.models import InventoryMovement, Item
from apps.master_data.models import MasterData
from apps.packages.models import Package
from apps.reservations.models import Reservation, ReservationRoom
from apps.reservations.services import get_reservation_financials
from apps.rooms.models import Room, RoomType
from apps.services.models import Service

User = get_user_model()


class BillingAutomationTestCase(TestCase):
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
        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.hotel_settings = HotelSettings.objects.create(hotel_name="Hotel Test")

        self.room_type = RoomType.objects.update_or_create(
            hotel_settings=self.hotel_settings,
            code="STD",
            defaults={
                "name": "Standard",
                "description": "",
                "capacity": 1,
                "bed_count": 1,
                "bed_type": "Sencilla",
                "is_active": True,
                "sort_order": 1,
            },
        )[0]
        self.room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)

        self.reservation_status = self._md(
            MasterData.Group.RESERVATION_STATUS,
            "CONFIRMADA",
            "Confirmada",
            1,
        )
        self.reservation_status_finished = self._md(
            MasterData.Group.RESERVATION_STATUS,
            "FINALIZADA",
            "Finalizada",
            2,
        )
        self.reservation_origin = self._md(
            MasterData.Group.RESERVATION_ORIGIN,
            "WEB",
            "Web",
            1,
        )
        self.service_type = self._md(MasterData.Group.SERVICE_TYPE, "ROOMSERVICE", "Room Service", 1)
        self.payment_method = self._md(MasterData.Group.PAYMENT_METHOD, "EFECTIVO", "Efectivo", 1)
        self.payment_refund_status_pending = self._md(
            MasterData.Group.PAYMENT_REFUND_STATUS,
            "PENDIENTE",
            "Pendiente",
            1,
        )
        self.payment_refund_status_approved = self._md(
            MasterData.Group.PAYMENT_REFUND_STATUS,
            "APROBADO",
            "Aprobado",
            2,
        )
        self.payment_refund_status_processed = self._md(
            MasterData.Group.PAYMENT_REFUND_STATUS,
            "PROCESADO",
            "Procesado",
            3,
        )

        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_settings,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )
        self.client = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="1234567890",
            first_name="Ana",
            last_name="Lopez",
            email="ana.billing@example.com",
            phone="3001234567",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )
        self.package = Package.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type,
            name="Paquete Standard",
            base_price=Decimal("25000.00"),
            is_active=True,
        )
        self.service = Service.objects.create(
            hotel_settings=self.hotel_settings,
            service_type=self.service_type,
            name="Minibar",
            base_price=Decimal("15000.00"),
            is_active=True,
        )

        today = timezone.now().date()
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client,
            status=self.reservation_status,
            origin=self.reservation_origin,
            package=self.package,
            package_name=self.package.name,
            package_price=self.package.base_price,
            expected_check_in=today + timedelta(days=1),
            expected_check_out=today + timedelta(days=3),
        )

    def _get_reservation_invoice(self):
        return (
            Invoice.objects.filter(reservation=self.reservation, is_active=True)
            .order_by("id")
            .first()
        )

    def _create_payment(self, invoice, amount: str):
        return Payment.objects.create(
            invoice=invoice,
            payment_method=self.payment_method,
            amount=Decimal(amount),
            is_active=True,
        )

    def _create_refund(self, payment, amount: str, status=None):
        return PaymentRefund.objects.create(
            payment=payment,
            status=status or self.payment_refund_status_pending,
            amount=Decimal(amount),
            reason="Prueba de reembolso",
            is_active=True,
        )

    def test_creates_default_invoice_when_reservation_is_created(self):
        invoice = self._get_reservation_invoice()

        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status.code, "BORRADOR")
        self.assertTrue(invoice.invoice_number.startswith("FAC-"))
        self.assertEqual(invoice.subtotal, Decimal("25000.00"))
        self.assertEqual(invoice.total_amount, Decimal("25000.00"))

    def test_does_not_duplicate_invoice_on_reservation_update(self):
        self.reservation.notes = "Actualizada"
        self.reservation.save(update_fields=["notes"])

        self.assertEqual(
            Invoice.objects.filter(reservation=self.reservation, is_active=True).count(),
            1,
        )

    def test_updates_invoice_subtotal_on_room_and_manual_charge_changes(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)

        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("100000.00"),
            adults=2,
            children=0,
        )

        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal("225000.00"))
        self.assertEqual(invoice.total_amount, Decimal("225000.00"))

        extra_type = get_or_create_default_charge_type("OTRO")
        manual_charge = Charge.objects.create(
            reservation=self.reservation,
            charge_type=extra_type,
            description="Consumo snack bar",
            quantity=2,
            unit_price=Decimal("15000.00"),
            is_active=True,
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal("255000.00"))

        manual_charge.is_active = False
        manual_charge.save(update_fields=["is_active"])
        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal("225000.00"))

    def test_updates_invoice_status_to_parcial_and_pagada_on_payments(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status.code, "BORRADOR")

        self._create_payment(invoice, "5000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PARCIAL")

        self._create_payment(invoice, "20000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

    def test_reverts_invoice_status_when_pending_balance_returns(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)

        self._create_payment(invoice, "25000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

        extra_type = get_or_create_default_charge_type("OTRO")
        Charge.objects.create(
            reservation=self.reservation,
            charge_type=extra_type,
            description="Cargo adicional",
            quantity=1,
            unit_price=Decimal("10000.00"),
            is_active=True,
        )
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PARCIAL")

        payment = Payment.objects.filter(invoice=invoice, is_active=True).first()
        self.assertIsNotNone(payment)
        payment.is_active = False
        payment.save(update_fields=["is_active"])
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PENDIENTE")

    def test_keeps_invoice_status_pendiente_after_checkout_without_payments(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status.code, "BORRADOR")

        now = timezone.now()
        self.reservation.status = self.reservation_status_finished
        self.reservation.real_check_in = now - timedelta(days=1)
        self.reservation.real_check_out = now
        self.reservation.save(update_fields=["status", "real_check_in", "real_check_out"])

        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PENDIENTE")

    def test_processed_refund_reopens_pending_balance(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)

        payment = self._create_payment(invoice, "25000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

        self._create_refund(payment, "5000.00", status=self.payment_refund_status_processed)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PARCIAL")

        self._create_payment(invoice, "5000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

    def test_pending_refund_does_not_impact_invoice_until_admin_approval(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)

        payment = self._create_payment(invoice, "25000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

        self._create_refund(payment, "5000.00", status=self.payment_refund_status_pending)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

        refund = PaymentRefund.objects.filter(payment=payment).order_by("-id").first()
        self.assertIsNotNone(refund)
        refund.status = self.payment_refund_status_approved
        refund.save(update_fields=["status"])
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PARCIAL")

    def test_processed_full_refund_marks_invoice_as_reembolsada(self):
        invoice = self._get_reservation_invoice()
        self.assertIsNotNone(invoice)

        payment = self._create_payment(invoice, "25000.00")
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PAGADA")

        self._create_refund(payment, "25000.00", status=self.payment_refund_status_processed)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "REEMBOLSADA")

    def test_charge_serializer_rejects_new_charge_for_checked_out_reservation(self):
        now = timezone.now()
        self.reservation.status = self.reservation_status_finished
        self.reservation.real_check_in = now - timedelta(days=1)
        self.reservation.real_check_out = now
        self.reservation.save(update_fields=["status", "real_check_in", "real_check_out"])

        serializer = ChargeSerializer(
            data={
                "reservation": self.reservation.id,
                "description": "Cargo tardio",
                "quantity": 1,
                "unit_price": "10000.00",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("reservation", serializer.errors)

    def test_creates_and_updates_automatic_room_and_package_charges(self):
        reservation_room = ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("100000.00"),
            adults=2,
            children=0,
        )

        room_key = f"ROOM:{reservation_room.id}"
        room_charge = Charge.objects.get(
            reservation=self.reservation,
            is_automatic=True,
            automation_key=room_key,
        )
        package_charge = Charge.objects.get(
            reservation=self.reservation,
            is_automatic=True,
            automation_key="PACKAGE",
        )

        self.assertEqual(room_charge.charge_type.code, "HABITACION")
        self.assertTrue(room_charge.is_active)
        self.assertEqual(room_charge.quantity, 1)
        self.assertEqual(room_charge.total_amount, Decimal("200000.00"))

        self.assertEqual(package_charge.charge_type.code, "PAQUETE")
        self.assertTrue(package_charge.is_active)
        self.assertEqual(package_charge.total_amount, Decimal("25000.00"))

    def test_deactivates_automatic_room_charge_when_room_line_is_deleted(self):
        reservation_room = ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("120000.00"),
            adults=2,
            children=0,
        )
        room_key = f"ROOM:{reservation_room.id}"
        reservation_room.delete()

        room_charge = Charge.objects.get(
            reservation=self.reservation,
            is_automatic=True,
            automation_key=room_key,
        )
        self.assertFalse(room_charge.is_active)

    def test_financials_include_manual_extra_charges_without_double_counting_automatic(self):
        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("100000.00"),
            adults=2,
            children=0,
        )
        self.reservation.total_discount = Decimal("10000.00")
        self.reservation.save(update_fields=["total_discount"])

        extra_type = get_or_create_default_charge_type("OTRO")
        Charge.objects.create(
            reservation=self.reservation,
            charge_type=extra_type,
            description="Consumo de minibar",
            quantity=2,
            unit_price=Decimal("15000.00"),
            is_active=True,
        )

        financials = get_reservation_financials(self.reservation)

        self.assertEqual(financials["rooms_subtotal"], Decimal("200000.00"))
        self.assertEqual(financials["package_subtotal"], Decimal("25000.00"))
        self.assertEqual(financials["additional_charges_total"], Decimal("30000.00"))
        self.assertEqual(financials["total_amount"], Decimal("245000.00"))

    def test_charge_serializer_autofills_service_charge_defaults(self):
        serializer = ChargeSerializer(
            data={
                "reservation": self.reservation.id,
                "service": self.service.id,
                "quantity": 2,
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        charge = serializer.save()

        self.assertEqual(charge.charge_type.code, "SERVICIO")
        self.assertEqual(charge.description, "Servicio: Minibar")
        self.assertEqual(charge.unit_price, Decimal("15000.00"))
        self.assertEqual(charge.total_amount, Decimal("30000.00"))


class BillingTenantIsolationTests(TestCase):
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
        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.reservation_status = self._md(
            MasterData.Group.RESERVATION_STATUS,
            "CONFIRMADA",
            "Confirmada",
            1,
        )
        self.reservation_origin = self._md(
            MasterData.Group.RESERVATION_ORIGIN,
            "WEB",
            "Web",
            1,
        )
        self.service_type = self._md(MasterData.Group.SERVICE_TYPE, "SPA", "Spa", 1)
        self.charge_type = self._md(MasterData.Group.CHARGE_TYPE, "SERVICIO", "Servicio", 1)

        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        self.room_type_a = RoomType.objects.create(
            hotel_settings=self.hotel_a,
            code="STD-A",
            name="Standard A",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )
        self.room_type_b = RoomType.objects.create(
            hotel_settings=self.hotel_b,
            code="STD-B",
            name="Standard B",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )

        self.client_a = Client.objects.create(
            hotel_settings=self.hotel_a,
            document_type=self.document_type,
            document_number="BILL-A-001",
            first_name="Ana",
            last_name="A",
            email="ana-a@example.com",
            phone="3001111111",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )
        today = timezone.now().date()
        self.reservation_a = Reservation.objects.create(
            hotel_settings=self.hotel_a,
            client=self.client_a,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=1),
            expected_check_out=today + timedelta(days=2),
        )

        self.service_a = Service.objects.create(
            hotel_settings=self.hotel_a,
            service_type=self.service_type,
            name="Servicio A",
            base_price=Decimal("10000.00"),
            is_active=True,
        )
        self.service_b = Service.objects.create(
            hotel_settings=self.hotel_b,
            service_type=self.service_type,
            name="Servicio B",
            base_price=Decimal("12000.00"),
            is_active=True,
        )
        self.package_a = Package.objects.create(
            hotel_settings=self.hotel_a,
            room_type=self.room_type_a,
            name="Paquete A",
            base_price=Decimal("50000.00"),
            is_active=True,
        )
        self.package_b = Package.objects.create(
            hotel_settings=self.hotel_b,
            room_type=self.room_type_b,
            name="Paquete B",
            base_price=Decimal("55000.00"),
            is_active=True,
        )

    def test_charge_model_clean_rejects_cross_hotel_service_and_package(self):
        invalid_service_charge = Charge(
            reservation=self.reservation_a,
            charge_type=self.charge_type,
            service=self.service_b,
            description="Servicio cruzado",
            quantity=1,
            unit_price=Decimal("1000.00"),
            total_amount=Decimal("1000.00"),
            is_active=True,
        )
        with self.assertRaises(DjangoValidationError) as service_ctx:
            invalid_service_charge.clean()
        self.assertIn("service", service_ctx.exception.message_dict)

        invalid_package_charge = Charge(
            reservation=self.reservation_a,
            charge_type=self.charge_type,
            package=self.package_b,
            description="Paquete cruzado",
            quantity=1,
            unit_price=Decimal("2000.00"),
            total_amount=Decimal("2000.00"),
            is_active=True,
        )
        with self.assertRaises(DjangoValidationError) as package_ctx:
            invalid_package_charge.clean()
        self.assertIn("package", package_ctx.exception.message_dict)

    def test_charge_viewset_excludes_cross_hotel_related_rows(self):
        valid_charge = Charge.objects.create(
            reservation=self.reservation_a,
            charge_type=self.charge_type,
            service=self.service_a,
            description="Servicio valido",
            quantity=1,
            unit_price=Decimal("10000.00"),
            is_active=True,
        )
        invalid_service_charge = Charge.objects.create(
            reservation=self.reservation_a,
            charge_type=self.charge_type,
            service=self.service_b,
            description="Servicio inconsistente",
            quantity=1,
            unit_price=Decimal("12000.00"),
            is_active=True,
        )
        invalid_package_charge = Charge.objects.create(
            reservation=self.reservation_a,
            charge_type=self.charge_type,
            package=self.package_b,
            description="Paquete inconsistente",
            quantity=1,
            unit_price=Decimal("55000.00"),
            is_active=True,
        )

        ids = set(ChargeViewSet().get_base_queryset().values_list("id", flat=True))
        self.assertIn(valid_charge.id, ids)
        self.assertNotIn(invalid_service_charge.id, ids)
        self.assertNotIn(invalid_package_charge.id, ids)


class BillingPosBatchApiTestCase(TestCase):
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
        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.reservation_status = self._md(
            MasterData.Group.RESERVATION_STATUS,
            "CONFIRMADA",
            "Confirmada",
            1,
        )
        self.reservation_origin = self._md(
            MasterData.Group.RESERVATION_ORIGIN,
            "WEB",
            "Web",
            1,
        )
        self.item_type = self._md(MasterData.Group.ITEM_TYPE, "MINIBAR", "Minibar", 1)
        self.unit_measure = self._md(MasterData.Group.UNIT_MEASURE, "UND", "Unidad", 1)
        self._md(
            MasterData.Group.INVENTORY_MOVEMENT_TYPE,
            "OUT",
            "Salida de inventario",
            1,
        )

        role = Role.objects.create(name="Charges Writer", slug="charges-writer")
        write_resource = Resource.objects.create(
            key="charges.write",
            name="Write charges",
            link_backend="/api/charges/",
        )
        role.resources.add(write_resource)

        self.user = User.objects.create_user(
            username="charges_writer",
            email="charges_writer@example.com",
            password="pass12345",
        )
        self.user.roles.add(role)

        self.client_api = APIClient()
        self.client_api.force_login(self.user)

        self.hotel_settings = HotelSettings.objects.create(hotel_name="Hotel POS")
        self.user.hotel_settings = self.hotel_settings
        self.user.save(update_fields=["hotel_settings"])
        self.client_api.force_login(self.user)
        self.client = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="POS-001",
            first_name="Sara",
            last_name="Pos",
            email="sara.pos@example.com",
            phone="3001112233",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )
        today = timezone.now().date()
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=1),
            expected_check_out=today + timedelta(days=2),
        )

        self.item_one = Item.objects.create(
            hotel_settings=self.hotel_settings,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Agua mineral",
            sku="POS-AGUA",
            stock=10,
            minimum_stock=2,
            maximum_stock=40,
            cost_price=Decimal("1200.00"),
            sale_price=Decimal("5000.00"),
            is_active=True,
        )
        self.item_two = Item.objects.create(
            hotel_settings=self.hotel_settings,
            item_type=self.item_type,
            unit_measure=self.unit_measure,
            name="Cerveza artesanal",
            sku="POS-CERV",
            stock=2,
            minimum_stock=1,
            maximum_stock=20,
            cost_price=Decimal("2000.00"),
            sale_price=Decimal("8000.00"),
            is_active=True,
        )

    def _reservation_invoice(self):
        return (
            Invoice.objects.filter(reservation=self.reservation, is_active=True)
            .order_by("id")
            .first()
        )

    def test_pos_batch_registers_charges_and_inventory_movements(self):
        response = self.client_api.post(
            "/api/charges/pos-batch/",
            {
                "reservation": self.reservation.id,
                "reference": "POS-TEST-001",
                "lines": [
                    {"item": self.item_one.id, "quantity": 2},
                    {
                        "item": self.item_two.id,
                        "quantity": 1,
                        "description": "Consumo especial bar",
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data.get("charges_created"), 2)
        self.assertEqual(len(response.data.get("charges", [])), 2)
        self.assertEqual(response.data.get("charge_type_code"), "BAR")

        charges = Charge.objects.filter(
            reservation=self.reservation,
            is_automatic=False,
            is_active=True,
        ).order_by("id")
        self.assertEqual(charges.count(), 2)
        self.assertTrue(all(charge.charge_type.code == "BAR" for charge in charges))

        self.item_one.refresh_from_db()
        self.item_two.refresh_from_db()
        self.assertEqual(self.item_one.stock, 8)
        self.assertEqual(self.item_two.stock, 1)

        movements = InventoryMovement.objects.filter(
            movement_type__code="OUT",
            reference__startswith="POS-TEST-001:",
        )
        self.assertEqual(movements.count(), 2)

        invoice = self._reservation_invoice()
        self.assertIsNotNone(invoice)
        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal("18000.00"))
        self.assertEqual(invoice.total_amount, Decimal("18000.00"))

    def test_pos_batch_rejects_when_stock_is_insufficient_and_rolls_back(self):
        response = self.client_api.post(
            "/api/charges/pos-batch/",
            {
                "reservation": self.reservation.id,
                "reference": "POS-TEST-ERR",
                "lines": [
                    {"item": self.item_one.id, "quantity": 1},
                    {"item": self.item_two.id, "quantity": 10},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        charges_count = Charge.objects.filter(
            reservation=self.reservation,
            is_automatic=False,
        ).count()
        self.assertEqual(charges_count, 0)

        movements_count = InventoryMovement.objects.filter(
            reference__startswith="POS-TEST-ERR:",
        ).count()
        self.assertEqual(movements_count, 0)

        self.item_one.refresh_from_db()
        self.item_two.refresh_from_db()
        self.assertEqual(self.item_one.stock, 10)
        self.assertEqual(self.item_two.stock, 2)

        invoice = self._reservation_invoice()
        self.assertIsNotNone(invoice)
        invoice.refresh_from_db()
        self.assertEqual(invoice.subtotal, Decimal("0.00"))
        self.assertEqual(invoice.total_amount, Decimal("0.00"))


class BillingApiFilterAndPaginationTestCase(TestCase):
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
        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.reservation_status = self._md(
            MasterData.Group.RESERVATION_STATUS,
            "CONFIRMADA",
            "Confirmada",
            1,
        )
        self.reservation_origin = self._md(
            MasterData.Group.RESERVATION_ORIGIN,
            "WEB",
            "Web",
            1,
        )
        self.charge_type = self._md(MasterData.Group.CHARGE_TYPE, "OTRO", "Otro", 1)
        self.payment_method = self._md(MasterData.Group.PAYMENT_METHOD, "EFECTIVO", "Efectivo", 1)
        self.invoice_status = self._md(MasterData.Group.INVOICE_STATUS, "BORRADOR", "Borrador", 1)
        self.credit_note_status = self._md(
            MasterData.Group.CREDIT_NOTE_STATUS,
            "EMITIDA",
            "Emitida",
            1,
        )
        self.payment_refund_status_pending = self._md(
            MasterData.Group.PAYMENT_REFUND_STATUS,
            "PENDIENTE",
            "Pendiente",
            1,
        )

        role = Role.objects.create(name="Billing Reader", slug="billing-reader")
        read_keys = ["charges.read", "invoices.read", "payments.read", "credit-notes.read"]
        resources = [
            Resource.objects.create(
                key=key,
                name=f"Read {key}",
                link_backend="/api/",
            )
            for key in read_keys
        ]
        role.resources.add(*resources)

        self.user = User.objects.create_user(
            username="billing_user",
            email="billing_user@example.com",
            password="pass12345",
        )
        self.user.roles.add(role)

        self.client_api = APIClient()
        self.client_api.force_login(self.user)
        self.hotel_settings = HotelSettings.objects.create(hotel_name="Hotel Billing API")
        self.user.hotel_settings = self.hotel_settings
        self.user.save(update_fields=["hotel_settings"])
        self.client_api.force_login(self.user)

        self.client_one = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="111",
            first_name="Ana",
            last_name="Lopez",
            email="ana.api@example.com",
            phone="300000001",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )
        self.client_two = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="222",
            first_name="Luis",
            last_name="Perez",
            email="luis.api@example.com",
            phone="300000002",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        today = timezone.now().date()
        self.reservation_one = Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client_one,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=2),
            expected_check_out=today + timedelta(days=5),
        )
        self.reservation_two = Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client_two,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=3),
            expected_check_out=today + timedelta(days=6),
        )

        self.invoice_one = Invoice.objects.create(
            reservation=self.reservation_one,
            status=self.invoice_status,
            invoice_number="FAC-FILTER-001",
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            is_active=True,
        )
        self.invoice_two = Invoice.objects.create(
            reservation=self.reservation_two,
            status=self.invoice_status,
            invoice_number="FAC-FILTER-002",
            subtotal=Decimal("200.00"),
            tax_amount=Decimal("0.00"),
            is_active=False,
        )

        self.charge_one = Charge.objects.create(
            reservation=self.reservation_one,
            charge_type=self.charge_type,
            description="Cargo activo reserva 1",
            quantity=1,
            unit_price=Decimal("50.00"),
            is_active=True,
        )
        self.charge_two = Charge.objects.create(
            reservation=self.reservation_two,
            charge_type=self.charge_type,
            description="Cargo inactivo reserva 2",
            quantity=1,
            unit_price=Decimal("80.00"),
            is_active=False,
        )

        self.payment_one = Payment.objects.create(
            invoice=self.invoice_one,
            payment_method=self.payment_method,
            amount=Decimal("25.00"),
            is_active=True,
        )
        self.payment_two = Payment.objects.create(
            invoice=self.invoice_one,
            payment_method=self.payment_method,
            amount=Decimal("15.00"),
            is_active=False,
        )
        self.payment_refund_one = PaymentRefund.objects.create(
            payment=self.payment_one,
            status=self.payment_refund_status_pending,
            amount=Decimal("5.00"),
            reason="Reembolso activo",
            is_active=True,
        )
        self.payment_refund_two = PaymentRefund.objects.create(
            payment=self.payment_two,
            status=self.payment_refund_status_pending,
            amount=Decimal("2.00"),
            reason="Reembolso inactivo",
            is_active=False,
        )

        self.credit_note_one = CreditNote.objects.create(
            invoice=self.invoice_one,
            status=self.credit_note_status,
            credit_note_number="NC-FILTER-001",
            amount=Decimal("10.00"),
            reason="Ajuste activo",
            is_active=True,
        )
        self.credit_note_two = CreditNote.objects.create(
            invoice=self.invoice_two,
            status=self.credit_note_status,
            credit_note_number="NC-FILTER-002",
            amount=Decimal("5.00"),
            reason="Ajuste inactivo",
            is_active=False,
        )

    def _as_list(self, response):
        data = response.data
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        return data

    def test_invoices_list_uses_pagination(self):
        for idx in range(35):
            Invoice.objects.create(
                reservation=self.reservation_one,
                status=self.invoice_status,
                invoice_number=f"FAC-PAGE-{idx:03d}",
                subtotal=Decimal("1.00"),
                tax_amount=Decimal("0.00"),
                is_active=True,
            )

        response = self.client_api.get("/api/invoices/")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, dict)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)
        self.assertLessEqual(len(response.data["results"]), 20)
        self.assertGreaterEqual(response.data["count"], 37)

    def test_charge_filters_by_reservation_and_is_active(self):
        response = self.client_api.get(
            "/api/charges/",
            {
                "reservation": self.reservation_one.id,
                "is_active": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self._as_list(response)
        charge_ids = {item["id"] for item in payload}
        self.assertIn(self.charge_one.id, charge_ids)
        self.assertNotIn(self.charge_two.id, charge_ids)

    def test_invoice_filters_by_reservation_and_is_active(self):
        response = self.client_api.get(
            "/api/invoices/",
            {
                "reservation": self.reservation_one.id,
                "is_active": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self._as_list(response)
        invoice_ids = {item["id"] for item in payload}
        self.assertIn(self.invoice_one.id, invoice_ids)
        self.assertNotIn(self.invoice_two.id, invoice_ids)

    def test_payment_filters_by_invoice_and_is_active(self):
        response = self.client_api.get(
            "/api/payments/",
            {
                "invoice": self.invoice_one.id,
                "is_active": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self._as_list(response)
        payment_ids = {item["id"] for item in payload}
        self.assertIn(self.payment_one.id, payment_ids)
        self.assertNotIn(self.payment_two.id, payment_ids)

    def test_credit_note_filters_by_invoice_and_is_active(self):
        response = self.client_api.get(
            "/api/credit-notes/",
            {
                "invoice": self.invoice_one.id,
                "is_active": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self._as_list(response)
        credit_note_ids = {item["id"] for item in payload}
        self.assertIn(self.credit_note_one.id, credit_note_ids)
        self.assertNotIn(self.credit_note_two.id, credit_note_ids)

    def test_payment_refund_filters_by_invoice_and_is_active(self):
        response = self.client_api.get(
            "/api/payment-refunds/",
            {
                "invoice": self.invoice_one.id,
                "is_active": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self._as_list(response)
        refund_ids = {item["id"] for item in payload}
        self.assertIn(self.payment_refund_one.id, refund_ids)
        self.assertNotIn(self.payment_refund_two.id, refund_ids)

    def test_any_read_role_can_register_refund_and_it_starts_pending(self):
        response = self.client_api.post(
            "/api/payment-refunds/",
            {
                "payment": self.payment_one.id,
                "amount": "3.00",
                "reason": "Solicitud operativa",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data.get("status_code", "")).upper(), "PENDIENTE")

    def test_non_admin_cannot_approve_refund_even_with_write_scope(self):
        writer_role = Role.objects.get_or_create(
            slug="billing-writer",
            defaults={"name": "Billing Writer"},
        )[0]
        write_resources = [
            Resource.objects.get_or_create(
                key="payments.write",
                defaults={"name": "Write payments", "link_backend": "/api/payments/"},
            )[0],
            Resource.objects.get_or_create(
                key="payment-refunds.read",
                defaults={
                    "name": "Read payment refunds",
                    "link_backend": "/api/payment-refunds/",
                },
            )[0],
        ]
        writer_role.resources.add(*write_resources)

        writer_user = User.objects.create_user(
            username="billing_writer",
            email="billing_writer@example.com",
            password="pass12345",
        )
        writer_user.roles.add(writer_role)

        writer_client = APIClient()
        writer_client.force_login(writer_user)

        response = writer_client.post(f"/api/payment-refunds/{self.payment_refund_one.id}/approve/")
        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_inactivate_payment_even_with_write_scope(self):
        writer_role = Role.objects.get_or_create(
            slug="payments-writer",
            defaults={"name": "Payments Writer"},
        )[0]
        write_resource = Resource.objects.get_or_create(
            key="payments.write",
            defaults={"name": "Write payments", "link_backend": "/api/payments/"},
        )[0]
        writer_role.resources.add(write_resource)

        writer_user = User.objects.create_user(
            username="payments_writer",
            email="payments_writer@example.com",
            password="pass12345",
        )
        writer_user.roles.add(writer_role)
        writer_user.hotel_settings = self.hotel_settings
        writer_user.save(update_fields=["hotel_settings"])

        writer_client = APIClient()
        writer_client.force_login(writer_user)

        response = writer_client.patch(
            f"/api/payments/{self.payment_one.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        self.payment_one.refresh_from_db()
        self.assertTrue(self.payment_one.is_active)

    def test_admin_can_inactivate_payment_with_write_scope(self):
        admin_role = Role.objects.get_or_create(
            slug="admin",
            defaults={"name": "Administrador"},
        )[0]
        write_resource = Resource.objects.get_or_create(
            key="payments.write",
            defaults={"name": "Write payments", "link_backend": "/api/payments/"},
        )[0]
        admin_role.resources.add(write_resource)

        admin_user = User.objects.create_user(
            username="payments_admin",
            email="payments_admin@example.com",
            password="pass12345",
        )
        admin_user.roles.add(admin_role)
        admin_user.hotel_settings = self.hotel_settings
        admin_user.save(update_fields=["hotel_settings"])

        admin_client = APIClient()
        admin_client.force_login(admin_user)

        response = admin_client.patch(
            f"/api/payments/{self.payment_one.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.payment_one.refresh_from_db()
        self.assertFalse(self.payment_one.is_active)

    def test_invoice_pdf_endpoint_returns_pdf_document(self):
        response = self.client_api.get(f"/api/invoices/{self.invoice_one.id}/pdf/")

        try:
            import reportlab  # noqa: F401

            reportlab_available = True
        except Exception:
            reportlab_available = False

        if not reportlab_available:
            self.assertEqual(response.status_code, 503)
            self.assertIn("detail", response.data)
            return

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(".pdf", response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF"))
