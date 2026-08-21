from datetime import time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.clients.models import Client
from apps.billing.models import Charge, Invoice, Payment
from apps.billing.services import ensure_default_invoice_for_reservation
from apps.hotel_settings.models import HotelFloor, HotelSettings, PaymentMethod, ReservationPolicy
from apps.inventory.models import InventoryMovement, Item, RoomInventory
from apps.master_data.models import MasterData
from apps.notifications.models import Notification
from apps.hotel_settings.services import build_allied_hotel_slug
from apps.packages.models import Package
from apps.reservations.models import (
    Reservation,
    ReservationInventoryCheck,
    ReservationInventoryCheckLine,
    ReservationGuest,
    ReservationRoom,
)
from apps.reservations.serializers import (
    ReservationDetailSerializer,
    ReservationDepositSerializer,
    ReservationGuestSerializer,
    ReservationListSerializer,
    ReservationRoomSerializer,
    ReservationWriteSerializer,
)
from apps.inventory.services import apply_checkout_consumption_inventory
from apps.reservations.services import (
    create_post_checkout_cleaning_tasks,
    validate_reservation_status_transition,
)
from apps.rooms.models import CleaningTask, Rate, Room, RoomType

User = get_user_model()


class ReservationFlowTestCase(TestCase):
    def _same_day_future_past_times(self):
        now_local = timezone.localtime()
        now_date = now_local.date()

        future_candidate = now_local + timedelta(hours=2)
        if future_candidate.date() != now_date:
            future_time = time(23, 59)
        else:
            future_time = future_candidate.time()

        past_candidate = now_local - timedelta(hours=2)
        if past_candidate.date() != now_date:
            past_time = time(0, 0)
        else:
            past_time = past_candidate.time()

        return now_date, future_time, past_time

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
        now_local = timezone.localtime()
        self.hotel_settings = HotelSettings.objects.create(
            hotel_name="Hotel Test",
            check_in_time=(now_local + timedelta(hours=1)).time(),
        )

        self.room_status_available = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        self.room_status_reserved = self._md(MasterData.Group.ROOM_STATUS, "RESERVADA", "Reservada", 2)
        self.room_status_occupied = self._md(MasterData.Group.ROOM_STATUS, "OCUPADA", "Ocupada", 3)
        self.room_status_maintenance = self._md(MasterData.Group.ROOM_STATUS, "MANTENIMIENTO", "Mantenimiento", 4)
        self.room_status_cleaning = self._md(MasterData.Group.ROOM_STATUS, "LIMPIEZA", "Limpieza", 5)
        self.room_type_standard = RoomType.objects.update_or_create(
            hotel_settings=self.hotel_settings,
            code="STD",
            defaults={
                "name": "Standard",
                "description": "",
                "capacity": 2,
                "bed_count": 1,
                "bed_type": "Queen",
                "is_active": True,
                "sort_order": 1,
            },
        )[0]
        self.room_type_suite = RoomType.objects.update_or_create(
            hotel_settings=self.hotel_settings,
            code="SUI",
            defaults={
                "name": "Suite",
                "description": "",
                "capacity": 4,
                "bed_count": 2,
                "bed_type": "King",
                "is_active": True,
                "sort_order": 2,
            },
        )[0]

        self.reservation_status_confirmed = self._md(
            MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada", 1
        )
        self.reservation_status_pending = self._md(
            MasterData.Group.RESERVATION_STATUS, "PENDIENTE", "Pendiente", 0
        )
        self.reservation_status_in_progress = self._md(
            MasterData.Group.RESERVATION_STATUS, "EN_CURSO", "En curso", 2
        )
        self.reservation_status_cancelled = self._md(
            MasterData.Group.RESERVATION_STATUS, "CANCELADA", "Cancelada", 2
        )
        self.reservation_status_finished = self._md(
            MasterData.Group.RESERVATION_STATUS, "FINALIZADA", "Finalizada", 3
        )
        self.reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)
        self.payment_method_cash = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel_settings,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]
        self.deposit_status_validated = self._md(
            MasterData.Group.RESERVATION_DEPOSIT_STATUS, "VALIDADO", "Validado", 1
        )
        self.item_type_amenity = self._md(
            MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1
        )
        self.unit_measure_unit = self._md(
            MasterData.Group.UNIT_MEASURE, "UNIDAD", "Unidad", 1
        )
        self.policy_type = self._md(
            MasterData.Group.RESERVATION_POLICY_TYPE, "CANCELLATION", "Cancellation", 1
        )
        self.penalty_type = self._md(
            MasterData.Group.RESERVATION_PENALTY_TYPE, "PERCENTAGE", "Percentage", 1
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
            room_type=self.room_type_standard,
            floor=self.floor,
            status=self.room_status_available,
        )

        self.client = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="123456789",
            first_name="Ana",
            last_name="Lopez",
            email="ana@example.com",
            phone="3001234567",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        self.policy_flexible = ReservationPolicy.objects.create(
            hotel_settings=self.hotel_settings,
            policy_type=self.policy_type,
            penalty_type=self.penalty_type,
            name="Flexible",
            penalty_value=10,
            hours_before_checkin=24,
            is_active=True,
        )
        self.policy_strict = ReservationPolicy.objects.create(
            hotel_settings=self.hotel_settings,
            policy_type=self.policy_type,
            penalty_type=self.penalty_type,
            name="Strict",
            penalty_value=50,
            hours_before_checkin=48,
            is_active=True,
        )
        self.package_standard = Package.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type_standard,
            name="Paquete Standard",
            base_price=25000,
            is_active=True,
        )

    def _create_reservation(self, *, check_in, check_out, status=None):
        return Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client,
            status=status or self.reservation_status_confirmed,
            origin=self.reservation_origin,
            expected_check_in=check_in,
            expected_check_out=check_out,
        )

    def test_status_transition_validator_rejects_inconsistent_changes(self):
        validate_reservation_status_transition("PENDIENTE", "CONFIRMADA")
        validate_reservation_status_transition("CONFIRMADA", "EN_CURSO")
        validate_reservation_status_transition("EN_CURSO", "FINALIZADA")

        with self.assertRaises(ValueError):
            validate_reservation_status_transition("PENDIENTE", "FINALIZADA")

        with self.assertRaises(ValueError):
            validate_reservation_status_transition("CANCELADA", "CONFIRMADA")

    def test_reservation_code_uses_hotel_prefix_year_and_random_segment(self):
        today = timezone.now().date()

        with patch.object(Reservation, "build_random_segment", return_value="K7F9Q2"):
            reservation = self._create_reservation(
                check_in=today + timedelta(days=1),
                check_out=today + timedelta(days=2),
                status=self.reservation_status_pending,
            )

        expected_year = str(timezone.localtime(timezone.now()).year)[-2:]
        self.assertEqual(
            reservation.code,
            f"{self.hotel_settings.reservation_code_prefix}-{expected_year}-K7F9Q2",
        )

    def test_reservation_code_retries_when_random_segment_collides(self):
        today = timezone.now().date()
        expected_year = str(timezone.localtime(timezone.now()).year)[-2:]
        existing_code = f"{self.hotel_settings.reservation_code_prefix}-{expected_year}-AAAAAA"

        Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client,
            status=self.reservation_status_pending,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=3),
            expected_check_out=today + timedelta(days=4),
            code=existing_code,
        )

        with patch.object(Reservation, "build_random_segment", side_effect=["AAAAAA", "BBBBBB"]):
            reservation = self._create_reservation(
                check_in=today + timedelta(days=5),
                check_out=today + timedelta(days=6),
                status=self.reservation_status_pending,
            )

        self.assertEqual(
            reservation.code,
            f"{self.hotel_settings.reservation_code_prefix}-{expected_year}-BBBBBB",
        )

    def test_guest_document_number_is_unique_inside_reservation_case_insensitive(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=2),
            status=self.reservation_status_pending,
        )

        ReservationGuest.objects.create(
            reservation=reservation,
            document_type=self.document_type,
            document_number="ABC123",
            first_name="Maria",
            last_name="Lopez",
        )

        serializer = ReservationGuestSerializer(
            data={
                "reservation": reservation.id,
                "document_type": self.document_type.id,
                "document_number": "abc123",
                "first_name": "Maria",
                "last_name": "Lopez",
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("document_number", serializer.errors)

    def test_room_status_changes_across_reservation_lifecycle(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
        )

        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=150000,
            adults=2,
            children=0,
        )
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "DISPONIBLE")

        reservation.real_check_in = timezone.now()
        reservation.save(update_fields=["real_check_in"])
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "OCUPADA")

        reservation.real_check_out = timezone.now()
        reservation.save(update_fields=["real_check_out"])
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "DISPONIBLE")

    def test_cannot_create_overlapping_reservation_room(self):
        today = timezone.now().date()
        reservation_a = self._create_reservation(
            check_in=today + timedelta(days=10),
            check_out=today + timedelta(days=15),
        )
        ReservationRoom.objects.create(
            reservation=reservation_a,
            room=self.room,
            night_rate=150000,
            adults=2,
            children=0,
        )

        reservation_b = self._create_reservation(
            check_in=today + timedelta(days=12),
            check_out=today + timedelta(days=14),
        )

        serializer = ReservationRoomSerializer(
            data={
                "reservation": reservation_b.id,
                "room": self.room.id,
                "night_rate": "140000.00",
                "adults": 1,
                "children": 0,
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("room", serializer.errors)

    def test_room_serializer_rejects_room_in_maintenance_or_cleaning(self):
        today = timezone.now().date()

        for blocked_status in (self.room_status_maintenance, self.room_status_cleaning):
            with self.subTest(status=blocked_status.code):
                self.room.status = blocked_status
                self.room.save(update_fields=["status"])

                reservation = self._create_reservation(
                    check_in=today + timedelta(days=20),
                    check_out=today + timedelta(days=22),
                )

                serializer = ReservationRoomSerializer(
                    data={
                        "reservation": reservation.id,
                        "room": self.room.id,
                        "night_rate": "100000.00",
                        "adults": 2,
                        "children": 0,
                    }
                )

                self.assertFalse(serializer.is_valid())
                self.assertIn("room", serializer.errors)

    def test_reservation_serializer_snapshots_package_and_updates_total(self):
        today = timezone.now().date()
        serializer = ReservationWriteSerializer(
            data={
                "client": self.client.id,
                "origin": self.reservation_origin.id,
                "package": self.package_standard.id,
                "expected_check_in": today + timedelta(days=1),
                "expected_check_out": today + timedelta(days=3),
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        reservation = serializer.save()

        self.assertEqual(reservation.package_id, self.package_standard.id)
        self.assertEqual(reservation.package_name, self.package_standard.name)
        self.assertEqual(str(reservation.package_price), "25000.00")

        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=100000,
            adults=2,
            children=0,
        )

        data = ReservationListSerializer(instance=reservation).data
        self.assertEqual(str(data["rooms_subtotal"]), "200000.00")
        self.assertEqual(str(data["package_subtotal"]), "25000.00")
        self.assertEqual(str(data["total_amount"]), "225000.00")

    def test_reservation_serializer_rejects_package_outside_booking_dates(self):
        today = timezone.now().date()
        limited_package = Package.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type_standard,
            name="Paquete por temporada",
            base_price=15000,
            is_active=True,
            start_date=today + timedelta(days=10),
            end_date=today + timedelta(days=20),
        )

        serializer = ReservationWriteSerializer(
            data={
                "client": self.client.id,
                "origin": self.reservation_origin.id,
                "package": limited_package.id,
                "expected_check_in": today + timedelta(days=1),
                "expected_check_out": today + timedelta(days=3),
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("package", serializer.errors)

    def test_room_serializer_rejects_room_type_when_reservation_has_package(self):
        today = timezone.now().date()
        suite_package = Package.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type_suite,
            name="Paquete Suite",
            base_price=50000,
            is_active=True,
        )
        reservation_serializer = ReservationWriteSerializer(
            data={
                "client": self.client.id,
                "origin": self.reservation_origin.id,
                "package": suite_package.id,
                "expected_check_in": today + timedelta(days=1),
                "expected_check_out": today + timedelta(days=3),
            }
        )
        self.assertTrue(reservation_serializer.is_valid(), reservation_serializer.errors)
        reservation = reservation_serializer.save()

        serializer = ReservationRoomSerializer(
            data={
                "reservation": reservation.id,
                "room": self.room.id,
                "night_rate": "90000.00",
                "adults": 2,
                "children": 0,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("room", serializer.errors)

    def test_room_serializer_rejects_room_hotel_when_reservation_has_package(self):
        today = timezone.now().date()
        reservation_serializer = ReservationWriteSerializer(
            data={
                "client": self.client.id,
                "origin": self.reservation_origin.id,
                "package": self.package_standard.id,
                "expected_check_in": today + timedelta(days=1),
                "expected_check_out": today + timedelta(days=3),
            }
        )
        self.assertTrue(reservation_serializer.is_valid(), reservation_serializer.errors)
        reservation = reservation_serializer.save()

        other_hotel = HotelSettings.objects.create(hotel_name="Hotel Other")
        other_floor = HotelFloor.objects.create(
            hotel_settings=other_hotel,
            floor_number=1,
            name="Piso Other",
            prefix="2",
            room_count=1,
        )
        other_room = Room.objects.create(
            number="201",
            room_type=self.room_type_standard,
            floor=other_floor,
            status=self.room_status_available,
        )

        serializer = ReservationRoomSerializer(
            data={
                "reservation": reservation.id,
                "room": other_room.id,
                "night_rate": "90000.00",
                "adults": 2,
                "children": 0,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("room", serializer.errors)

    def test_room_serializer_rejects_night_rate_mismatch_with_active_rate(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
        )
        Rate.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type_standard,
            name="Tarifa estandar vigente",
            price=150000,
            start_date=today,
            end_date=today + timedelta(days=10),
            is_active=True,
        )

        serializer = ReservationRoomSerializer(
            data={
                "reservation": reservation.id,
                "room": self.room.id,
                "night_rate": "120000.00",
                "adults": 2,
                "children": 0,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("night_rate", serializer.errors)

    def test_room_serializer_accepts_night_rate_matching_active_rate(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
        )
        Rate.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type_standard,
            name="Tarifa estandar vigente",
            price=150000,
            start_date=today,
            end_date=today + timedelta(days=10),
            is_active=True,
        )

        serializer = ReservationRoomSerializer(
            data={
                "reservation": reservation.id,
                "room": self.room.id,
                "night_rate": "150000.00",
                "adults": 2,
                "children": 0,
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_updating_reservation_dates_validates_existing_room_conflicts(self):
        today = timezone.now().date()
        reservation_a = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
        )
        ReservationRoom.objects.create(
            reservation=reservation_a,
            room=self.room,
            night_rate=150000,
            adults=2,
            children=0,
        )

        reservation_b = self._create_reservation(
            check_in=today + timedelta(days=5),
            check_out=today + timedelta(days=8),
        )
        ReservationRoom.objects.create(
            reservation=reservation_b,
            room=self.room,
            night_rate=140000,
            adults=1,
            children=0,
        )

        serializer = ReservationWriteSerializer(
            instance=reservation_b,
            data={
                "expected_check_in": today + timedelta(days=2),
                "expected_check_out": today + timedelta(days=6),
            },
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("rooms_detail", serializer.errors)

    def test_room_becomes_reserved_only_after_check_in_window_starts(self):
        now_local = timezone.localtime()
        future_check_in = now_local + timedelta(hours=2)
        past_check_in = now_local - timedelta(hours=2)

        self.hotel_settings.check_in_time = future_check_in.time()
        self.hotel_settings.save(update_fields=["check_in_time"])

        reservation = self._create_reservation(
            check_in=future_check_in.date(),
            check_out=future_check_in.date() + timedelta(days=2),
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=150000,
            adults=2,
            children=0,
        )
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "DISPONIBLE")

        self.hotel_settings.check_in_time = past_check_in.time()
        self.hotel_settings.save(update_fields=["check_in_time"])

        reservation.expected_check_in = past_check_in.date()
        reservation.notes = "sync trigger"
        reservation.save(update_fields=["expected_check_in", "notes"])
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "RESERVADA")

    def test_sync_command_updates_status_when_only_time_changes(self):
        check_in_date, future_time, past_time = self._same_day_future_past_times()

        self.hotel_settings.check_in_time = future_time
        self.hotel_settings.save(update_fields=["check_in_time"])

        reservation = self._create_reservation(
            check_in=check_in_date,
            check_out=check_in_date + timedelta(days=1),
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=120000,
            adults=2,
            children=0,
        )
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "DISPONIBLE")

        self.hotel_settings.check_in_time = past_time
        self.hotel_settings.save(update_fields=["check_in_time"])

        call_command("sync_reservation_room_statuses")
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "RESERVADA")

    def test_create_reservation_assigns_policies(self):
        today = timezone.now().date()
        serializer = ReservationWriteSerializer(
            data={
                "client": self.client.id,
                "origin": self.reservation_origin.id,
                "policies": [self.policy_flexible.id],
                "expected_check_in": today + timedelta(days=1),
                "expected_check_out": today + timedelta(days=2),
            }
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        reservation = serializer.save()

        self.assertEqual(reservation.status_id, self.reservation_status_pending.id)
        self.assertEqual(
            list(reservation.policies.values_list("id", flat=True)),
            [self.policy_flexible.id],
        )

    def test_update_reservation_policies_replaces_and_clears(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=4),
            check_out=today + timedelta(days=6),
        )
        reservation.policies.add(self.policy_flexible)

        replace_serializer = ReservationWriteSerializer(
            instance=reservation,
            data={"policies": [self.policy_strict.id]},
            partial=True,
        )
        self.assertTrue(replace_serializer.is_valid(), replace_serializer.errors)
        reservation = replace_serializer.save()
        self.assertEqual(
            list(reservation.policies.values_list("id", flat=True)),
            [self.policy_strict.id],
        )

        clear_serializer = ReservationWriteSerializer(
            instance=reservation,
            data={"policies": []},
            partial=True,
        )
        self.assertTrue(clear_serializer.is_valid(), clear_serializer.errors)
        reservation = clear_serializer.save()
        self.assertEqual(reservation.policies.count(), 0)

    def test_update_reservation_rejects_changes_after_check_in(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
            status=self.reservation_status_in_progress,
        )
        reservation.real_check_in = timezone.now()
        reservation.save(update_fields=["real_check_in"])

        serializer = ReservationWriteSerializer(
            instance=reservation,
            data={"notes": "Intento de edicion"},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("reservation", serializer.errors)

    def test_detail_serializer_includes_policies(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=7),
            check_out=today + timedelta(days=8),
        )
        reservation.policies.add(self.policy_flexible, self.policy_strict)

        data = ReservationDetailSerializer(instance=reservation).data
        policy_ids = sorted(item["id"] for item in data["policies"])

        self.assertIn("policies", data)
        self.assertEqual(policy_ids, sorted([self.policy_flexible.id, self.policy_strict.id]))

    def test_list_serializer_exposes_centralized_business_rules(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=1),
            check_out=today + timedelta(days=3),
            status=self.reservation_status_confirmed,
        )
        reservation.total_discount = 10000
        reservation.save(update_fields=["total_discount"])

        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=100000,
            adults=2,
            children=0,
        )
        invoice = ensure_default_invoice_for_reservation(reservation.id)
        self.assertIsNotNone(invoice)
        Payment.objects.create(
            invoice=invoice,
            amount=50000,
            payment_method=self.payment_method_cash,
        )

        data = ReservationListSerializer(instance=reservation).data

        self.assertEqual(str(data["rooms_subtotal"]), "200000.00")
        self.assertEqual(str(data["total_amount"]), "190000.00")
        self.assertEqual(str(data["total_deposits"]), "50000.00")
        self.assertEqual(str(data["pending_amount"]), "140000.00")
        self.assertEqual(data["payment_status_code"], "PARCIAL")
        self.assertEqual(data["payment_status_label"], "Parcial")
        self.assertTrue(data["can_add_payment"])
        self.assertFalse(data["can_confirm"])
        self.assertFalse(data["can_check_in"])
        self.assertFalse(data["can_check_out"])
        self.assertTrue(data["can_cancel"])

    def test_deposit_serializer_rejects_amount_greater_than_pending(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=10),
            check_out=today + timedelta(days=12),
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=100000,
            adults=2,
            children=0,
        )
        invoice = ensure_default_invoice_for_reservation(reservation.id)
        self.assertIsNotNone(invoice)
        Payment.objects.create(
            invoice=invoice,
            amount=150000,
            payment_method=self.payment_method_cash,
        )

        serializer = ReservationDepositSerializer(
            data={
                "reservation": reservation.id,
                "deposit_date": today,
                "amount": "60000.00",
                "payment_method": self.payment_method_cash.id,
                "status": self.deposit_status_validated.id,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("amount", serializer.errors)

    def test_deposit_serializer_rejects_cancelled_reservation(self):
        today = timezone.now().date()
        reservation = self._create_reservation(
            check_in=today + timedelta(days=15),
            check_out=today + timedelta(days=16),
            status=self.reservation_status_cancelled,
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=100000,
            adults=2,
            children=0,
        )

        serializer = ReservationDepositSerializer(
            data={
                "reservation": reservation.id,
                "deposit_date": today,
                "amount": "20000.00",
                "payment_method": self.payment_method_cash.id,
                "status": self.deposit_status_validated.id,
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("reservation", serializer.errors)


class ReservationAutoCancelCommandTestCase(TestCase):
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
        self.hotel_settings = HotelSettings.objects.create(
            hotel_name="Hotel Auto Cancel Test",
        )

        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)
        self.reservation_status_pending = self._md(
            MasterData.Group.RESERVATION_STATUS, "PENDIENTE", "Pendiente", 0
        )
        self.reservation_status_confirmed = self._md(
            MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada", 1
        )
        self.reservation_status_in_progress = self._md(
            MasterData.Group.RESERVATION_STATUS, "EN_CURSO", "En curso", 2
        )
        self._md(MasterData.Group.RESERVATION_STATUS, "CANCELADA", "Cancelada", 3)

        self.client_model = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="555001",
            first_name="Auto",
            last_name="Cancel",
            email="autocancel@example.com",
            phone="3000000000",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

    def _create_reservation(self, *, expected_check_in, expected_check_out, status):
        return Reservation.objects.create(
            client=self.client_model,
            hotel_settings=self.hotel_settings,
            status=status,
            origin=self.reservation_origin,
            expected_check_in=expected_check_in,
            expected_check_out=expected_check_out,
        )

    def test_command_auto_cancels_overdue_pending_without_check_in(self):
        today = timezone.localdate()
        reservation = self._create_reservation(
            expected_check_in=today - timedelta(days=3),
            expected_check_out=today - timedelta(days=1),
            status=self.reservation_status_pending,
        )

        call_command("sync_reservation_room_statuses")
        reservation.refresh_from_db()

        self.assertEqual(reservation.status.code, "CANCELADA")
        self.assertIn("AUTOCANCEL_OVERDUE:", reservation.notes or "")

    def test_command_auto_cancels_overdue_confirmed_without_check_in(self):
        today = timezone.localdate()
        reservation = self._create_reservation(
            expected_check_in=today - timedelta(days=2),
            expected_check_out=today - timedelta(days=1),
            status=self.reservation_status_confirmed,
        )

        call_command("sync_reservation_room_statuses")
        reservation.refresh_from_db()

        self.assertEqual(reservation.status.code, "CANCELADA")
        self.assertIn("AUTOCANCEL_OVERDUE:", reservation.notes or "")

    def test_command_does_not_cancel_when_real_check_in_exists(self):
        today = timezone.localdate()
        reservation = self._create_reservation(
            expected_check_in=today - timedelta(days=3),
            expected_check_out=today - timedelta(days=1),
            status=self.reservation_status_in_progress,
        )
        reservation.real_check_in = timezone.now() - timedelta(days=2)
        reservation.save(update_fields=["real_check_in"])

        call_command("sync_reservation_room_statuses")
        reservation.refresh_from_db()

        self.assertEqual(reservation.status.code, "EN_CURSO")
        self.assertNotIn("AUTOCANCEL_OVERDUE:", reservation.notes or "")

    def test_list_serializer_includes_notes_for_auto_cancelled_reservation(self):
        today = timezone.localdate()
        reservation = self._create_reservation(
            expected_check_in=today - timedelta(days=3),
            expected_check_out=today - timedelta(days=1),
            status=self.reservation_status_pending,
        )
        call_command("sync_reservation_room_statuses")
        reservation.refresh_from_db()

        data = ReservationListSerializer(instance=reservation).data
        self.assertIn("notes", data)
        self.assertIn("AUTOCANCEL_OVERDUE:", data["notes"] or "")


class ReservationApiFlowTestCase(APITestCase):
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

        self.room_status_available = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        self._md(MasterData.Group.ROOM_STATUS, "RESERVADA", "Reservada", 2)
        self._md(MasterData.Group.ROOM_STATUS, "OCUPADA", "Ocupada", 3)
        self.room_status_cleaning = self._md(MasterData.Group.ROOM_STATUS, "LIMPIEZA", "Limpieza", 4)

        self.reservation_status_pending = self._md(
            MasterData.Group.RESERVATION_STATUS, "PENDIENTE", "Pendiente", 0
        )
        self.reservation_status_confirmed = self._md(
            MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada", 1
        )
        self.reservation_status_in_progress = self._md(
            MasterData.Group.RESERVATION_STATUS, "EN_CURSO", "En curso", 2
        )
        self.reservation_status_finished = self._md(
            MasterData.Group.RESERVATION_STATUS, "FINALIZADA", "Finalizada", 3
        )
        self.reservation_status_cancelled = self._md(
            MasterData.Group.RESERVATION_STATUS, "CANCELADA", "Cancelada", 4
        )
        self.cleaning_task_type_checkout = self._md(
            MasterData.Group.CLEANING_TASK_TYPE, "SALIDA", "Salida", 1
        )
        self.cleaning_status_pending = self._md(
            MasterData.Group.CLEANING_STATUS, "PENDIENTE", "Pendiente", 1
        )
        self.cleaning_status_in_progress = self._md(
            MasterData.Group.CLEANING_STATUS, "EN_PROCESO", "En proceso", 2
        )
        self.cleaning_priority_low = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "BAJA", "Baja", 1
        )
        self.cleaning_priority_medium = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "MEDIA", "Media", 2
        )
        self.cleaning_priority_high = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "ALTA", "Alta", 3
        )
        self.cleaning_priority_urgent = self._md(
            MasterData.Group.MAINTENANCE_PRIORITY, "URGENTE", "Urgente", 4
        )
        self.reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)
        self.deposit_status_validated = self._md(
            MasterData.Group.RESERVATION_DEPOSIT_STATUS, "VALIDADO", "Validado", 1
        )
        self.item_type_amenity = self._md(
            MasterData.Group.ITEM_TYPE, "AMENITY", "Amenidad", 1
        )
        self.unit_measure_unit = self._md(
            MasterData.Group.UNIT_MEASURE, "UNIDAD", "Unidad", 1
        )

        self.hotel_settings = HotelSettings.objects.create(
            hotel_name="Hotel API Test",
            check_in_time=time(0, 0),
        )
        self.payment_method_cash = PaymentMethod.objects.get_or_create(
            hotel_settings=self.hotel_settings,
            code="EFECTIVO",
            defaults={"name": "Efectivo"}
        )[0]
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_settings,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room = Room.objects.create(
            number="101",
            floor=self.floor,
            status=self.room_status_available,
        )
        self.towel_item = Item.objects.create(
            hotel_settings=self.hotel_settings,
            item_type=self.item_type_amenity,
            unit_measure=self.unit_measure_unit,
            name="Toalla",
            sku="TOWEL-001",
            stock=100,
            minimum_stock=10,
            cost_price=10000,
            sale_price=12000,
            is_active=True,
        )
        self.room_towel_inventory = RoomInventory.objects.create(
            room=self.room,
            item=self.towel_item,
            quantity=3,
            minimum_quantity=2,
            is_active=True,
        )

        self.client_model = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="99887766",
            first_name="Cliente",
            last_name="API",
            email="cliente.api@example.com",
            phone="3009998877",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        self.user = User.objects.create_superuser(
            username="admin_res_api",
            email="admin.res.api@example.com",
            password="Pass12345!",
        )
        self.client = APIClient()
        self.client.force_login(self.user)

    def _create_reservation(self, *, check_in_offset=-1, check_out_offset=1, status=None):
        today = timezone.now().date()
        return Reservation.objects.create(
            hotel_settings=self.hotel_settings,
            client=self.client_model,
            status=status or self.reservation_status_pending,
            origin=self.reservation_origin,
            expected_check_in=today + timedelta(days=check_in_offset),
            expected_check_out=today + timedelta(days=check_out_offset),
        )

    def _create_room_line(
        self,
        reservation: Reservation,
        night_rate=100000,
        *,
        adults=2,
        children=0,
    ):
        return ReservationRoom.objects.create(
            reservation=reservation,
            room=self.room,
            night_rate=night_rate,
            adults=adults,
            children=children,
        )

    def _mark_reservation_as_checked_in(self, reservation: Reservation):
        reservation.status = self.reservation_status_in_progress
        reservation.real_check_in = timezone.now() - timedelta(hours=1)
        reservation.save(update_fields=["status", "real_check_in"])

    def test_reservations_list_is_paginated(self):
        for index in range(25):
            self._create_reservation(check_in_offset=5 + index, check_out_offset=6 + index)

        response = self.client.get("/api/reservations/?ordering=-id")
        self.assertEqual(response.status_code, 200)
        self.assertIn("count", response.data)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])

        response_page_size = self.client.get("/api/reservations/?ordering=-id&page_size=10")
        self.assertEqual(response_page_size.status_code, 200)
        self.assertEqual(len(response_page_size.data["results"]), 10)

    def test_reservation_flow_endpoints_confirm_checkin_checkout(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self.assertEqual(confirm.data["status_code"], "CONFIRMADA")
        self.assertTrue(confirm.data["can_check_in"])

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        ANYMAIL={"RESEND_API_KEY": "re_test_key"},
        DEFAULT_FROM_EMAIL="Wayra <notificaciones@example.com>",
    )
    @patch("apps.reservations.emails.EmailMultiAlternatives.send", return_value=1)
    def test_confirming_web_reservation_sends_confirmation_email(self, send_mock):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        reservation.source_channel = "WEB"
        reservation.save(update_fields=["source_channel"])
        self._create_room_line(reservation)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")

        self.assertEqual(confirm.status_code, 200)
        send_mock.assert_called_once()

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        ANYMAIL={"RESEND_API_KEY": "re_test_key"},
        DEFAULT_FROM_EMAIL="Wayra <notificaciones@example.com>",
    )
    @patch("apps.reservations.emails.EmailMultiAlternatives.send", return_value=1)
    def test_confirming_non_web_reservation_does_not_send_email(self, send_mock):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")

        self.assertEqual(confirm.status_code, 200)
        send_mock.assert_not_called()

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 200)
        self.assertEqual(check_in.data["status_code"], "EN_CURSO")
        self.assertIsNotNone(check_in.data["real_check_in"])

        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out.status_code, 200)
        self.assertEqual(check_out.data["status_code"], "FINALIZADA")
        self.assertIsNotNone(check_out.data["real_check_out"])

    def test_reservation_update_endpoint_rejects_edits_after_check_in(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 200)

        response = self.client.patch(
            f"/api/reservations/{reservation.id}/",
            data={"notes": "Cambio no permitido"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("check-in", str(response.data).lower())

    def test_check_out_updates_client_type_based_on_total_stay_nights(self):
        self._md(MasterData.Group.CLIENT_TYPE, "FRECUENTE", "Frecuente", 2)
        self._md(MasterData.Group.CLIENT_TYPE, "VIP", "VIP", 3)

        reservation = self._create_reservation(
            check_in_offset=-1,
            check_out_offset=9,
            status=self.reservation_status_pending,
        )
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 200)

        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out.status_code, 200)
        self.assertEqual(check_out.data["status_code"], "FINALIZADA")
        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "LIMPIEZA")

        reservation.refresh_from_db()
        self.client_model.refresh_from_db()

        self.assertEqual(self.client_model.total_stay_nights, 10)
        self.assertEqual(self.client_model.client_type.code, "FRECUENTE")
        self.assertEqual(
            self.client_model.last_stay,
            timezone.localtime(reservation.real_check_out).date(),
        )

        check_out_again = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out_again.status_code, 200)

        self.client_model.refresh_from_db()
        self.assertEqual(self.client_model.total_stay_nights, 10)
        self.assertEqual(self.client_model.client_type.code, "FRECUENTE")

    def test_check_in_endpoint_blocks_before_hotel_check_in_time(self):
        now_local = timezone.localtime()
        future_candidate = now_local + timedelta(hours=2)
        check_in_offset = 0
        future_time = future_candidate.time()
        if future_candidate.date() != now_local.date():
            check_in_offset = 1
            future_time = time(0, 0)

        self.hotel_settings.check_in_time = future_time
        self.hotel_settings.save(update_fields=["check_in_time"])

        reservation = self._create_reservation(
            check_in_offset=check_in_offset,
            check_out_offset=check_in_offset + 1,
            status=self.reservation_status_pending,
        )
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self.assertFalse(confirm.data["can_check_in"])

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 400)
        self.assertIn("check-in", str(check_in.data.get("detail", "")).lower())

    def test_check_in_endpoint_blocks_when_room_is_not_available(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        self.room.status = self.room_status_cleaning
        self.room.save(update_fields=["status"])

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 400)
        self.assertIn("no esta disponible", str(check_in.data.get("detail", "")).lower())

    def test_check_out_creates_post_checkout_cleaning_task(self):
        standard_type = RoomType.objects.create(
            hotel_settings=self.hotel_settings,
            code="STD",
            name="Standard",
            capacity=2,
            bed_count=1,
            bed_type="Queen",
            is_active=True,
            sort_order=1,
        )
        self.room.room_type = standard_type
        self.room.save(update_fields=["room_type"])

        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self._mark_reservation_as_checked_in(reservation)

        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out.status_code, 200)
        self.assertEqual(check_out.data["status_code"], "FINALIZADA")

        reservation.refresh_from_db()
        expected_scheduled_for = timezone.localtime(reservation.real_check_out).date()

        tasks = CleaningTask.objects.filter(room_id=self.room.id, task_type__code="SALIDA")
        self.assertEqual(tasks.count(), 1)

        task = tasks.first()
        self.assertIsNotNone(task)
        self.assertEqual(task.status.code, "PENDIENTE")
        self.assertEqual(task.priority.code, "ALTA")
        self.assertEqual(task.scheduled_for, expected_scheduled_for)
        self.assertIn(f"#{reservation.id}", task.notes or "")
        self.assertIn("AUTOGEN_CHECKOUT", task.notes or "")

        checkout_inventory_check = ReservationInventoryCheck.objects.filter(
            reservation=reservation,
            check_type=ReservationInventoryCheck.CheckType.CHECK_OUT,
        ).first()
        self.assertIsNotNone(checkout_inventory_check)

        checkout_line = ReservationInventoryCheckLine.objects.filter(
            inventory_check=checkout_inventory_check,
            room=self.room,
            item=self.towel_item,
        ).first()
        self.assertIsNotNone(checkout_line)
        self.assertEqual(checkout_line.expected_quantity, 3)
        self.assertEqual(checkout_line.reviewed_quantity, 3)
        self.assertEqual(checkout_line.difference_quantity, 0)

        check_out_again = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out_again.status_code, 200)
        self.assertEqual(
            CleaningTask.objects.filter(room_id=self.room.id, task_type__code="SALIDA").count(),
            1,
        )

    def test_check_out_assigns_low_cleaning_priority_for_low_occupancy(self):
        family_type = RoomType.objects.create(
            hotel_settings=self.hotel_settings,
            code="FAM",
            name="Familiar",
            capacity=4,
            bed_count=2,
            bed_type="Twin",
            is_active=True,
            sort_order=2,
        )
        self.room.room_type = family_type
        self.room.save(update_fields=["room_type"])

        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(
            reservation=reservation,
            night_rate=100000,
            adults=1,
            children=0,
        )

        self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self._mark_reservation_as_checked_in(reservation)
        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")

        self.assertEqual(check_out.status_code, 200)
        task = CleaningTask.objects.filter(room_id=self.room.id, task_type__code="SALIDA").first()
        self.assertIsNotNone(task)
        self.assertEqual(task.priority.code, "BAJA")
        self.assertIn("ocupacion baja", task.notes or "")

    def test_post_checkout_cleaning_task_creation_is_idempotent(self):
        standard_type = RoomType.objects.create(
            hotel_settings=self.hotel_settings,
            code="STD",
            name="Standard",
            capacity=2,
            bed_count=1,
            bed_type="Queen",
            is_active=True,
            sort_order=1,
        )
        self.room.room_type = standard_type
        self.room.save(update_fields=["room_type"])

        reservation = self._create_reservation(status=self.reservation_status_finished)
        self._create_room_line(reservation=reservation, night_rate=100000)
        reservation.real_check_out = timezone.now()
        reservation.save(update_fields=["real_check_out"])

        created_first = create_post_checkout_cleaning_tasks(reservation)
        created_second = create_post_checkout_cleaning_tasks(reservation)

        self.assertEqual(created_first, 1)
        self.assertEqual(created_second, 0)
        self.assertEqual(
            CleaningTask.objects.filter(room_id=self.room.id, task_type__code="SALIDA").count(),
            1,
        )

    def test_room_returns_to_available_when_cleaning_task_is_completed(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 200)

        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out.status_code, 200)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "LIMPIEZA")

        cleaning_task = CleaningTask.objects.filter(
            room_id=self.room.id,
            task_type__code="SALIDA",
            status__code="PENDIENTE",
        ).first()
        self.assertIsNotNone(cleaning_task)

        cleaning_task.status = self._md(
            MasterData.Group.CLEANING_STATUS, "COMPLETADA", "Completada", 3
        )
        cleaning_task.save(update_fields=["status"])

        self.room.refresh_from_db()
        self.assertEqual(self.room.status.code, "DISPONIBLE")

    def test_check_out_marks_default_invoice_as_pendiente(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        invoice = (
            Invoice.objects.filter(reservation=reservation, is_active=True)
            .order_by("id")
            .first()
        )
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.status.code, "BORRADOR")

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        self._mark_reservation_as_checked_in(reservation)

        check_out = self.client.post(f"/api/reservations/{reservation.id}/check-out/", data={}, format="json")
        self.assertEqual(check_out.status_code, 200)
        self.assertEqual(check_out.data["status_code"], "FINALIZADA")

        invoice.refresh_from_db()
        self.assertEqual(invoice.status.code, "PENDIENTE")

    def test_check_in_creates_inventory_snapshot(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        check_in = self.client.post(f"/api/reservations/{reservation.id}/check-in/", data={}, format="json")
        self.assertEqual(check_in.status_code, 200)
        self.assertEqual(check_in.data["status_code"], "EN_CURSO")

        inventory_check = ReservationInventoryCheck.objects.filter(
            reservation=reservation,
            check_type=ReservationInventoryCheck.CheckType.CHECK_IN,
        ).first()
        self.assertIsNotNone(inventory_check)

        line = ReservationInventoryCheckLine.objects.filter(
            inventory_check=inventory_check,
            room=self.room,
            item=self.towel_item,
        ).first()
        self.assertIsNotNone(line)
        self.assertEqual(line.expected_quantity, 3)
        self.assertEqual(line.reviewed_quantity, 3)
        self.assertEqual(line.difference_quantity, 0)

    def test_check_out_inventory_review_compares_against_check_in_snapshot(self):
        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)

        self._mark_reservation_as_checked_in(reservation)

        check_out = self.client.post(
            f"/api/reservations/{reservation.id}/check-out/",
            data={
                "inventory_review": [
                    {
                        "room": self.room.id,
                        "item": self.towel_item.id,
                        "quantity": 1,
                        "notes": "Faltan dos toallas",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(check_out.status_code, 200)
        self.assertIn("inventory_comparison", check_out.data)
        self.assertEqual(check_out.data["inventory_comparison"]["differences_count"], 1)
        self.assertEqual(check_out.data["inventory_comparison"]["missing_items_count"], 1)
        self.assertEqual(check_out.data["inventory_comparison"]["extra_items_count"], 0)

        checkout_inventory_check = ReservationInventoryCheck.objects.filter(
            reservation=reservation,
            check_type=ReservationInventoryCheck.CheckType.CHECK_OUT,
        ).first()
        self.assertIsNotNone(checkout_inventory_check)

        checkout_line = ReservationInventoryCheckLine.objects.filter(
            inventory_check=checkout_inventory_check,
            room=self.room,
            item=self.towel_item,
        ).first()
        self.assertIsNotNone(checkout_line)
        self.assertEqual(checkout_line.expected_quantity, 3)
        self.assertEqual(checkout_line.reviewed_quantity, 1)
        self.assertEqual(checkout_line.difference_quantity, -2)

        shortage_charge = Charge.objects.filter(
            reservation=reservation,
            is_active=True,
            automation_key__startswith="INVENTORY_MISSING:",
        ).first()
        self.assertIsNotNone(shortage_charge)
        self.assertEqual(shortage_charge.quantity, 2)
        self.assertEqual(shortage_charge.unit_price, self.towel_item.sale_price)
        self.assertEqual(shortage_charge.charge_type.code, "INVENTARIO_FALTANTE")

        self.towel_item.refresh_from_db()
        self.assertEqual(self.towel_item.stock, 98)

        check_id = check_out.data["inventory_comparison"]["check_id"]
        consumption_movement = InventoryMovement.objects.filter(
            item=self.towel_item,
            movement_type__code="LOSS",
            reference=f"ROOM_CONSUMPTION:{check_id}:{self.room.id}:{self.towel_item.id}",
        ).first()
        self.assertIsNotNone(consumption_movement)
        self.assertEqual(consumption_movement.quantity, 2)

        apply_checkout_consumption_inventory(
            reservation,
            inventory_comparison=check_out.data["inventory_comparison"],
        )
        self.towel_item.refresh_from_db()
        self.assertEqual(self.towel_item.stock, 98)
        self.assertEqual(
            InventoryMovement.objects.filter(
                item=self.towel_item,
                movement_type__code="LOSS",
                reference=f"ROOM_CONSUMPTION:{check_id}:{self.room.id}:{self.towel_item.id}",
            ).count(),
            1,
        )
        self.assertFalse(shortage_charge.is_automatic)

    def test_check_out_inventory_review_rejects_items_from_other_hotel(self):
        other_hotel = HotelSettings.objects.create(hotel_name="Hotel Other")
        other_item = Item.objects.create(
            hotel_settings=other_hotel,
            item_type=self.item_type_amenity,
            unit_measure=self.unit_measure_unit,
            name="Sabana Other",
            sku="SABANA-OTHER-001",
            stock=50,
            minimum_stock=5,
            cost_price=8000,
            sale_price=10000,
            is_active=True,
        )

        reservation = self._create_reservation(status=self.reservation_status_pending)
        self._create_room_line(reservation=reservation, night_rate=100000)

        confirm = self.client.post(f"/api/reservations/{reservation.id}/confirm/", data={}, format="json")
        self.assertEqual(confirm.status_code, 200)
        self._mark_reservation_as_checked_in(reservation)

        response = self.client.post(
            f"/api/reservations/{reservation.id}/check-out/",
            data={
                "inventory_review": [
                    {
                        "room": self.room.id,
                        "item": other_item.id,
                        "quantity": 1,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("mismo hotel", str(response.data.get("detail", "")).lower())

        reservation.refresh_from_db()
        self.assertEqual(reservation.status.code, "EN_CURSO")
        self.assertIsNone(reservation.real_check_out)

    def test_cancel_endpoint_blocks_confirm_after_cancellation(self):
        reservation = self._create_reservation(status=self.reservation_status_confirmed)

        cancel = self.client.post(f"/api/reservations/{reservation.id}/cancel/", data={}, format="json")
        self.assertEqual(cancel.status_code, 200)
        self.assertEqual(cancel.data["status_code"], "CANCELADA")

        confirm_after_cancel = self.client.post(
            f"/api/reservations/{reservation.id}/confirm/",
            data={},
            format="json",
        )
        self.assertEqual(confirm_after_cancel.status_code, 400)
        self.assertIn("detail", confirm_after_cancel.data)

    def test_reservation_deposit_endpoint_validates_pending_amount(self):
        reservation = self._create_reservation(status=self.reservation_status_confirmed)
        self._create_room_line(reservation=reservation, night_rate=100000)

        invoice = ensure_default_invoice_for_reservation(reservation.id)
        self.assertIsNotNone(invoice)
        Payment.objects.create(
            invoice=invoice,
            amount=150000,
            payment_method=self.payment_method_cash,
        )

        response = self.client.post(
            "/api/reservation-deposits/",
            data={
                "reservation": reservation.id,
                "deposit_date": timezone.now().date(),
                "amount": "60000.00",
                "payment_method": self.payment_method_cash.id,
                "status": self.deposit_status_validated.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("errors", response.data)
        self.assertIn("amount", response.data["errors"])


class WebReservationPublicApiTests(APITestCase):
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
        self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.room_status_available = self._md(
            MasterData.Group.ROOM_STATUS,
            "DISPONIBLE",
            "Disponible",
            1,
        )
        self.room_status_reserved = self._md(
            MasterData.Group.ROOM_STATUS,
            "RESERVADA",
            "Reservada",
            2,
        )
        self._md(MasterData.Group.RESERVATION_STATUS, "PENDIENTE", "Pendiente", 1)
        self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)

        self.hotel_settings = HotelSettings.objects.create(
            hotel_name="Hotel Web",
            city="Bogota",
            country="Colombia",
            reservations_email="reservas@hotelweb.test",
        )
        self.manager = User.objects.create_user(
            username="manager-web",
            email="manager-web@example.com",
            password="test-pass",
            hotel_settings=self.hotel_settings,
        )
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_settings,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel_settings,
            code="STD",
            name="Estandar",
            capacity=2,
            bed_count=1,
            is_active=True,
        )
        self.rate = Rate.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type,
            name="Flexible web",
            price=180000,
            is_active=True,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            rate=self.rate,
            floor=self.floor,
            status=self.room_status_available,
        )
        self.check_in = timezone.localdate() + timedelta(days=10)
        self.check_out = self.check_in + timedelta(days=2)

    def _payload(self):
        return {
            "hotelSlug": build_allied_hotel_slug(self.hotel_settings),
            "roomRateId": f"rate-{self.rate.id}",
            "checkIn": self.check_in.isoformat(),
            "checkOut": self.check_out.isoformat(),
            "rooms": 1,
            "guests": 2,
            "guestName": "Laura Gomez",
            "guestEmail": "laura@example.com",
            "guestPhone": "3001234567",
            "guestDocumentType": "CC",
            "guestDocumentNumber": "1234567890",
            "guestCountry": "CO",
            "notes": "Reserva desde la pagina publica.",
            "sourceDetail": "Landing publica",
            "sourceUrl": "https://wayra.example/reservar/solicitud",
            "sourceReferrer": "https://wayra.example/",
            "sourceMetadata": {"campaign": "verano"},
        }

    def test_public_user_can_create_web_reservation(self):
        response = self.client.post(
            "/api/web-reservations/",
            data=self._payload(),
            format="json",
            HTTP_USER_AGENT="WayraWebTest/1.0",
            REMOTE_ADDR="10.0.0.25",
        )

        self.assertEqual(response.status_code, 201)
        reservation = Reservation.objects.get(id=response.data["id"])

        self.assertEqual(reservation.hotel_settings_id, self.hotel_settings.id)
        self.assertEqual(reservation.origin.code, "WEB")
        self.assertEqual(reservation.status.code, "PENDIENTE")
        self.assertEqual(reservation.source_channel, "WEB")
        self.assertEqual(reservation.source_detail, "Landing publica")
        self.assertEqual(reservation.source_metadata["campaign"], "verano")
        self.assertEqual(reservation.source_metadata["ip_address"], "10.0.0.25")
        self.assertEqual(reservation.rooms_detail.count(), 1)
        self.assertEqual(reservation.total_guests, 2)
        self.assertEqual(reservation.guests.count(), 1)

        client = reservation.client
        self.assertEqual(client.email, "laura@example.com")
        self.assertEqual(client.document_number, "1234567890")

        notification = Notification.objects.filter(
            user=self.manager,
            related_object_id=str(reservation.id),
        ).first()
        self.assertIsNotNone(notification)
        self.assertEqual(notification.title, "Nueva reserva desde la web")
        self.assertEqual(notification.priority, Notification.Priority.HIGH)
        self.assertEqual(notification.metadata["source_channel"], "WEB")

    def test_public_web_reservation_requires_available_room(self):
        first_response = self.client.post(
            "/api/web-reservations/",
            data=self._payload(),
            format="json",
        )
        self.assertEqual(first_response.status_code, 201)

        second_payload = self._payload()
        second_payload["guestEmail"] = "otra@example.com"
        second_payload["guestDocumentNumber"] = "998877"
        second_response = self.client.post(
            "/api/web-reservations/",
            data=second_payload,
            format="json",
        )

        self.assertEqual(second_response.status_code, 400)
        self.assertEqual(Reservation.objects.count(), 1)

    def test_public_web_reservation_rejects_past_check_in(self):
        payload = self._payload()
        payload["checkIn"] = (timezone.localdate() - timedelta(days=1)).isoformat()
        payload["checkOut"] = timezone.localdate().isoformat()

        response = self.client.post(
            "/api/web-reservations/",
            data=payload,
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Reservation.objects.count(), 0)

    @override_settings(
        EMAIL_BACKEND="anymail.backends.resend.EmailBackend",
        RESEND_API_KEY="re_test_key",
        ANYMAIL={"RESEND_API_KEY": "re_test_key"},
        DEFAULT_FROM_EMAIL="Wayra <notificaciones@example.com>",
    )
    @patch("apps.reservations.emails.EmailMultiAlternatives.send", return_value=1)
    def test_public_web_reservation_sends_registered_email(self, send_mock):
        response = self.client.post(
            "/api/web-reservations/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        send_mock.assert_called_once()


class OnlineCheckInPublicApiTests(APITestCase):
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
        from django.core.cache import cache

        # El throttle publico usa el cache por defecto (proceso compartido entre
        # tests); lo limpiamos para que cada test empiece con su propia cuota.
        cache.clear()

        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula", 1)
        self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular", 1)
        self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo", 1)
        self.room_status_available = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible", 1)
        self.status_pending = self._md(MasterData.Group.RESERVATION_STATUS, "PENDIENTE", "Pendiente", 1)
        self.status_confirmed = self._md(MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada", 2)
        self.status_cancelled = self._md(MasterData.Group.RESERVATION_STATUS, "CANCELADA", "Cancelada", 3)
        self.origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web", 1)

        self.hotel_settings = HotelSettings.objects.create(
            hotel_name="Hotel Check-in Online",
            city="Bogota",
            country="Colombia",
            reservations_email="reservas@checkinonline.test",
        )
        self.manager = User.objects.create_user(
            username="manager-checkin",
            email="manager-checkin@example.com",
            password="test-pass",
            hotel_settings=self.hotel_settings,
        )
        self.client_record = Client.objects.create(
            hotel_settings=self.hotel_settings,
            document_type=self.document_type,
            document_number="1234567890",
            first_name="Laura",
            last_name="Gomez",
            email="laura@example.com",
            client_type=self._md(MasterData.Group.CLIENT_TYPE, "REGULAR"),
            status=self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO"),
        )
        self.check_in_date = timezone.localdate() + timedelta(days=1)
        self.check_out_date = self.check_in_date + timedelta(days=2)
        self.reservation = Reservation.objects.create(
            client=self.client_record,
            status=self.status_confirmed,
            origin=self.origin,
            hotel_settings=self.hotel_settings,
            expected_check_in=self.check_in_date,
            expected_check_out=self.check_out_date,
        )

        # Una habitacion para dos adultos: la reserva es para 2 huespedes.
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel_settings,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel_settings,
            code="STD",
            name="Estandar",
            capacity=2,
            bed_count=1,
            is_active=True,
        )
        self.rate = Rate.objects.create(
            hotel_settings=self.hotel_settings,
            room_type=self.room_type,
            name="Flexible check-in",
            price=180000,
            is_active=True,
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            rate=self.rate,
            floor=self.floor,
            status=self.room_status_available,
        )
        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=self.rate.price,
            adults=2,
            children=0,
        )

    def _guest_payload(self, **overrides):
        guest = {
            "firstName": "Laura",
            "lastName": "Gomez",
            "documentType": "CC",
            "documentNumber": "1234567890",
            "birthDate": "1990-05-10",
            "nationality": "Colombia",
        }
        guest.update(overrides)
        return guest

    def _payload(self, guests=None, **overrides):
        payload = {
            "reservationCode": self.reservation.code,
            "guests": guests
            if guests is not None
            else [
                self._guest_payload(),
                self._guest_payload(
                    firstName="Mario",
                    lastName="Gomez",
                    documentNumber="1234567891",
                    birthDate="1988-11-02",
                ),
            ],
            "email": "laura@example.com",
            "phone": "3001234567",
            "arrivalTime": "14:00-16:00",
            "emergencyContactName": "Carlos Gomez",
            "emergencyContactPhone": "3007654321",
            "signature": "Laura Gomez",
            "notes": "Llegada en vuelo nocturno.",
            "acceptsDataPolicy": True,
        }
        payload.update(overrides)
        return payload

    def test_guest_can_submit_online_check_in_for_two_guests(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reservation_id"], self.reservation.id)
        self.assertEqual(response.data["status_code"], "CONFIRMADA")
        self.assertEqual(len(response.data["guests"]), 2)

        self.assertEqual(self.reservation.guests.count(), 2)
        first_guest = self.reservation.guests.get(document_number="1234567890")
        second_guest = self.reservation.guests.get(document_number="1234567891")
        self.assertEqual(first_guest.email, "laura@example.com")
        self.assertEqual(second_guest.email, "laura@example.com")
        self.assertEqual(first_guest.arrival_time_window, "14:00-16:00")
        self.assertTrue(first_guest.accepts_data_policy)
        self.assertTrue(second_guest.accepts_data_policy)
        self.assertIsNotNone(first_guest.online_check_in_submitted_at)
        self.assertIsNotNone(second_guest.online_check_in_submitted_at)

        # No modifica el flujo operativo interno: sigue sin check-in real.
        self.reservation.refresh_from_db()
        self.assertIsNone(self.reservation.real_check_in)
        self.assertEqual(self.reservation.status_code, "CONFIRMADA")

        notification = Notification.objects.filter(
            user=self.manager,
            title="Check-in online recibido",
        ).first()
        self.assertIsNotNone(notification)
        self.assertIn("2 huespedes", notification.message)

    def test_resubmission_is_idempotent_and_updates_existing_guests(self):
        first = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/online-check-in/",
            data=self._payload(notes="Cambio de hora de llegada."),
            format="json",
        )
        self.assertEqual(second.status_code, 200)

        self.assertEqual(self.reservation.guests.count(), 2)
        first_guest = self.reservation.guests.get(document_number="1234567890")
        self.assertEqual(first_guest.notes, "Cambio de hora de llegada.")

        # La notificacion a recepcion solo se dispara en el primer envio.
        self.assertEqual(
            Notification.objects.filter(
                user=self.manager,
                title="Check-in online recibido",
            ).count(),
            1,
        )

    def test_guest_count_mismatch_is_rejected(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(guests=[self._guest_payload()]),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_duplicate_document_within_payload_is_rejected(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(
                guests=[
                    self._guest_payload(),
                    self._guest_payload(firstName="Mario", lastName="Gomez"),
                ]
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        # La transaccion no deja guardado ni al primer huesped.
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_document_mismatch_is_rejected_without_leaking_reservation_data(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(
                guests=[
                    self._guest_payload(documentNumber="999999"),
                    self._guest_payload(
                        firstName="Mario",
                        lastName="Gomez",
                        documentNumber="1234567891",
                        birthDate="1988-11-02",
                    ),
                ]
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_unknown_reservation_code_is_rejected(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(reservationCode="WYR-999999"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_pending_reservation_is_not_eligible(self):
        self.reservation.status = self.status_pending
        self.reservation.save(update_fields=["status"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirmada", response.data["detail"])
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_online_check_in_is_not_eligible_before_48_hours(self):
        self.reservation.expected_check_in = timezone.localdate() + timedelta(days=3)
        self.reservation.expected_check_out = self.reservation.expected_check_in + timedelta(days=2)
        self.reservation.save(update_fields=["expected_check_in", "expected_check_out"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("disponible desde", response.data["detail"])
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_online_check_in_is_eligible_from_48_hours_before_arrival(self):
        local_now = timezone.localtime()
        self.hotel_settings.check_in_time = local_now.time()
        self.hotel_settings.save(update_fields=["check_in_time"])
        self.reservation.expected_check_in = local_now.date() + timedelta(days=2)
        self.reservation.expected_check_out = self.reservation.expected_check_in + timedelta(days=2)
        self.reservation.save(update_fields=["expected_check_in", "expected_check_out"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.reservation.guests.count(), 2)

    def test_online_check_in_is_not_eligible_after_arrival_date(self):
        self.reservation.expected_check_in = timezone.localdate() - timedelta(days=1)
        self.reservation.expected_check_out = timezone.localdate() + timedelta(days=1)
        self.reservation.save(update_fields=["expected_check_in", "expected_check_out"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("vencio", response.data["detail"])
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_cancelled_reservation_is_not_eligible(self):
        self.reservation.status = self.status_cancelled
        self.reservation.save(update_fields=["status"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cancelada", response.data["detail"])

    def test_already_checked_in_reservation_is_not_eligible(self):
        self.reservation.real_check_in = timezone.now()
        self.reservation.save(update_fields=["real_check_in"])

        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("presencial", response.data["detail"])
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_missing_data_policy_consent_is_rejected(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(acceptsDataPolicy=False),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reservation.guests.count(), 0)

    def test_invalid_arrival_window_is_rejected(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(arrivalTime="00:00-99:00"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_signature_must_match_reservation_holder(self):
        response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(signature="Mario Gomez"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("titular", str(response.data))
        self.assertEqual(self.reservation.guests.count(), 0)

    def _lookup_payload(self, **overrides):
        payload = {
            "reservationCode": self.reservation.code,
            "documentType": "CC",
            "documentNumber": "1234567890",
        }
        payload.update(overrides)
        return payload

    def test_lookup_returns_reservation_summary_for_matching_titular(self):
        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reservation_id"], self.reservation.id)
        self.assertEqual(response.data["hotel_name"], "Hotel Check-in Online")
        self.assertEqual(response.data["status_label"], "Confirmada")
        self.assertEqual(response.data["room_summary"], "Estandar - 101")
        self.assertEqual(response.data["payment_status_code"], "PENDIENTE")
        self.assertEqual(response.data["payment_status_label"], "Pendiente")
        self.assertEqual(response.data["total_guests"], 2)
        self.assertTrue(response.data["eligible"])
        self.assertIsNone(response.data["eligible_reason"])
        self.assertEqual(response.data["existing_guests"], [])
        self.assertEqual(response.data["holder"]["first_name"], "Laura")
        self.assertEqual(response.data["holder"]["last_name"], "Gomez")
        self.assertEqual(response.data["holder"]["document_type"], "CC")
        self.assertEqual(response.data["holder"]["document_number"], "1234567890")
        self.assertEqual(response.data["holder"]["email"], "laura@example.com")

    def test_lookup_accepts_new_reservation_code_without_hyphens(self):
        compact_code = self.reservation.code.replace("-", "")

        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(reservationCode=compact_code),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reservation_id"], self.reservation.id)

    def test_lookup_rejects_document_mismatch(self):
        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(documentNumber="000000"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_lookup_rejects_unknown_reservation_code(self):
        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(reservationCode="WYR-999999"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_lookup_reports_not_eligible_reservation_without_error_status(self):
        self.reservation.status = self.status_pending
        self.reservation.save(update_fields=["status"])

        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(),
            format="json",
        )

        # No es un error HTTP: el documento si coincidio, solo no es elegible todavia.
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["eligible"])
        self.assertIn("confirmada", response.data["eligible_reason"])

    def test_lookup_reports_not_eligible_before_48_hours(self):
        self.reservation.expected_check_in = timezone.localdate() + timedelta(days=3)
        self.reservation.expected_check_out = self.reservation.expected_check_in + timedelta(days=2)
        self.reservation.save(update_fields=["expected_check_in", "expected_check_out"])

        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["eligible"])
        self.assertIn("disponible desde", response.data["eligible_reason"])

    def test_lookup_returns_existing_guests_after_submission(self):
        submit_response = self.client.post(
            "/api/online-check-in/",
            data=self._payload(),
            format="json",
        )
        self.assertEqual(submit_response.status_code, 200)

        response = self.client.post(
            "/api/online-check-in/lookup/",
            data=self._lookup_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["existing_guests"]), 2)
        documents = {guest["document_number"] for guest in response.data["existing_guests"]}
        self.assertEqual(documents, {"1234567890", "1234567891"})
