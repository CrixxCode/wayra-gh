from django.test import TestCase

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData
from apps.packages.models import Package
from apps.promotions.models import Promotion
from apps.promotions.views import PromotionViewSet
from apps.services.models import Service


class PromotionTenantIsolationTests(TestCase):
    def _md(self, group: str, code: str, name: str):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name, "is_active": True, "sort_order": 1},
        )[0]

    def test_promotion_viewset_excludes_cross_hotel_related_rows(self):
        service_type = self._md(MasterData.Group.SERVICE_TYPE, "SPA", "Spa")
        discount_type = self._md(
            MasterData.Group.PROMOTION_DISCOUNT_TYPE,
            "PERCENTAGE",
            "Porcentaje",
        )
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        service_a = Service.objects.create(
            hotel_settings=hotel_a,
            service_type=service_type,
            name="Servicio A",
            base_price=20000,
            is_active=True,
        )
        service_b = Service.objects.create(
            hotel_settings=hotel_b,
            service_type=service_type,
            name="Servicio B",
            base_price=25000,
            is_active=True,
        )
        package_a = Package.objects.create(
            hotel_settings=hotel_a,
            name="Paquete A",
            base_price=120000,
            is_active=True,
        )
        package_b = Package.objects.create(
            hotel_settings=hotel_b,
            name="Paquete B",
            base_price=140000,
            is_active=True,
        )

        valid_service_promo = Promotion.objects.create(
            hotel_settings=hotel_a,
            discount_type=discount_type,
            service=service_a,
            name="Promo servicio valida",
            code="PROMO-SVC-A",
            discount_value=10,
            start_date="2026-01-01",
            end_date="2026-12-31",
            is_active=True,
            is_public=True,
        )
        invalid_service_promo = Promotion.objects.create(
            hotel_settings=hotel_a,
            discount_type=discount_type,
            service=service_b,
            name="Promo servicio inconsistente",
            code="PROMO-SVC-B",
            discount_value=10,
            start_date="2026-01-01",
            end_date="2026-12-31",
            is_active=True,
            is_public=True,
        )
        valid_package_promo = Promotion.objects.create(
            hotel_settings=hotel_a,
            discount_type=discount_type,
            package=package_a,
            name="Promo paquete valida",
            code="PROMO-PKG-A",
            discount_value=15,
            start_date="2026-01-01",
            end_date="2026-12-31",
            is_active=True,
            is_public=True,
        )
        invalid_package_promo = Promotion.objects.create(
            hotel_settings=hotel_a,
            discount_type=discount_type,
            package=package_b,
            name="Promo paquete inconsistente",
            code="PROMO-PKG-B",
            discount_value=15,
            start_date="2026-01-01",
            end_date="2026-12-31",
            is_active=True,
            is_public=True,
        )

        ids = set(PromotionViewSet().get_base_queryset().values_list("id", flat=True))
        self.assertIn(valid_service_promo.id, ids)
        self.assertIn(valid_package_promo.id, ids)
        self.assertNotIn(invalid_service_promo.id, ids)
        self.assertNotIn(invalid_package_promo.id, ids)


class PromotionBillingTests(TestCase):
    """Auditoria, Bloque 7 #1: una promocion vigente descuenta de verdad en la reserva."""

    def _md(self, group: str, code: str, name: str):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name, "is_active": True, "sort_order": 1},
        )[0]

    def setUp(self):
        from datetime import timedelta
        from decimal import Decimal

        from django.contrib.auth import get_user_model
        from django.utils import timezone
        from rest_framework.test import APIClient

        from apps.clients.models import Client
        from apps.hotel_settings.models import HotelFloor
        from apps.reservations.models import Reservation, ReservationRoom
        from apps.rooms.models import Room, RoomType

        self.Decimal = Decimal
        self.today = timezone.localdate()
        self.timedelta = timedelta

        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Promo")
        self.percentage = self._md(MasterData.Group.PROMOTION_DISCOUNT_TYPE, "PERCENTAGE", "Porcentaje")
        self.fixed = self._md(MasterData.Group.PROMOTION_DISCOUNT_TYPE, "FIXED", "Monto fijo")
        self.charge_type = self._md(MasterData.Group.CHARGE_TYPE, "SERVICIO", "Servicio")
        service_type = self._md(MasterData.Group.SERVICE_TYPE, "MINIBAR", "Minibar")
        self.confirmed = self._md(MasterData.Group.RESERVATION_STATUS, "CONFIRMADA", "Confirmada")
        origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "DIRECTO", "Directo")
        room_status = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible")

        self.service = Service.objects.create(
            hotel_settings=self.hotel,
            service_type=service_type,
            name="Minibar",
            base_price=Decimal("15000.00"),
            is_active=True,
        )
        room_type = RoomType.objects.create(
            hotel_settings=self.hotel, code="STD", name="Estandar", capacity=2, is_active=True
        )
        self.package = Package.objects.create(
            hotel_settings=self.hotel,
            room_type=room_type,
            name="Romantico",
            base_price=Decimal("50000.00"),
            is_active=True,
        )
        floor = HotelFloor.objects.create(
            hotel_settings=self.hotel, floor_number=1, name="Piso 1", prefix="1", room_count=1
        )
        room = Room.objects.create(number="101", room_type=room_type, floor=floor, status=room_status)
        client = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula"),
            document_number="900100",
            first_name="Ana",
            last_name="Ruiz",
            email="ana.promo@example.com",
            client_type=self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular"),
            status=self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo"),
        )
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=client,
            status=self.confirmed,
            origin=origin,
            expected_check_in=self.today,
            expected_check_out=self.today + timedelta(days=2),
        )
        # 2 noches x 100.000 = 200.000 de estadia.
        ReservationRoom.objects.create(
            reservation=self.reservation, room=room, night_rate=Decimal("100000.00"), adults=2
        )

        self.api = APIClient()
        self.api.force_login(
            get_user_model().objects.create_superuser(
                username="promo_admin", email="promo_admin@example.com", password="pass12345"
            )
        )

    def _promotion(self, name, *, discount_type=None, value="10", start=0, end=30, **targets):
        return Promotion.objects.create(
            hotel_settings=self.hotel,
            discount_type=discount_type or self.percentage,
            name=name,
            code=name.upper().replace(" ", "_"),
            discount_value=self.Decimal(value),
            start_date=self.today + self.timedelta(days=start),
            end_date=self.today + self.timedelta(days=end),
            is_active=True,
            **targets,
        )

    def _charge_minibar(self, quantity=2):
        from apps.billing.models import Charge

        return Charge.objects.create(
            reservation=self.reservation,
            charge_type=self.charge_type,
            service=self.service,
            description="Minibar",
            quantity=quantity,
            unit_price=self.Decimal("15000.00"),
        )

    def _financials(self):
        from apps.reservations.models import Reservation
        from apps.reservations.services import get_reservation_financials

        return get_reservation_financials(Reservation.objects.get(pk=self.reservation.pk))

    def _invoice_total(self):
        from apps.billing.models import Invoice

        return Invoice.objects.get(reservation=self.reservation, is_active=True).total_amount

    def test_service_promotions_apply_alone_and_stack(self):
        self._promotion("Minibar diez", service=self.service)  # 10% de 30.000 = 3.000
        self._promotion(  # monto fijo por unidad: 2 x 2.000
            "Minibar fijo", discount_type=self.fixed, value="2000", service=self.service
        )

        self._charge_minibar(quantity=2)

        financials = self._financials()
        self.assertEqual(financials["promotion_discount_total"], self.Decimal("7000.00"))
        self.assertEqual(financials["total_amount"], self.Decimal("223000.00"))
        self.assertEqual(self._invoice_total(), self.Decimal("223000.00"))

    def test_service_promotion_outside_validity_does_not_apply(self):
        self._promotion("Minibar vencida", service=self.service, start=-10, end=-1)

        self._charge_minibar()

        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("0"))

    def test_stacked_discount_never_exceeds_what_it_discounts(self):
        self.reservation.package = self.package
        self.reservation.package_price = self.Decimal("50000.00")
        self.reservation.save()

        self._promotion("Paquete 30", discount_type=self.fixed, value="30000", package=self.package)
        self._promotion("Paquete 40", discount_type=self.fixed, value="40000", package=self.package)

        # 70.000 de descuento sobre un paquete de 50.000: se queda en 50.000.
        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("50000.00"))

    def test_package_promotion_requires_check_in_within_validity(self):
        self.reservation.package = self.package
        self.reservation.package_price = self.Decimal("50000.00")
        self.reservation.save()

        self._promotion("Paquete futuro", package=self.package, start=5, end=30)

        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("0"))

    def test_general_promotion_is_chosen_by_reception_and_discounts_the_stay(self):
        general = self._promotion("Temporada baja", value="15")
        url = f"/api/reservations/{self.reservation.id}/promotions/"

        # No se aplica sola.
        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("0"))
        listed = self.api.get(url)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["id"] for row in listed.data["available"]], [general.id])

        applied = self.api.post(url, {"promotion": general.id}, format="json")
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(applied.data["available"], [])
        self.assertEqual(applied.data["applied"][0]["scope"], "STAY")
        # 15% de la estadia (200.000), no del total.
        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("30000.00"))

        removed = self.api.delete(f"{url}{general.id}/")
        self.assertEqual(removed.status_code, 200, removed.data)
        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("0"))

    def test_automatic_promotions_cannot_be_removed_by_hand(self):
        promotion = self._promotion("Minibar diez", service=self.service)
        self._charge_minibar()

        response = self.api.delete(
            f"/api/reservations/{self.reservation.id}/promotions/{promotion.id}/"
        )

        self.assertEqual(response.status_code, 400)
        self.assertGreater(self._financials()["promotion_discount_total"], self.Decimal("0"))

    def test_service_or_package_promotion_cannot_be_chosen_as_general(self):
        promotion = self._promotion("Minibar diez", service=self.service)

        response = self.api.post(
            f"/api/reservations/{self.reservation.id}/promotions/",
            {"promotion": promotion.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_deleting_a_promotion_removes_its_discount_from_open_reservations(self):
        from django.contrib.contenttypes.models import ContentType

        from accounts.models import SoftDeleteMarker

        promotion = self._promotion("Minibar diez", service=self.service)
        self._charge_minibar()
        self.assertGreater(self._financials()["promotion_discount_total"], self.Decimal("0"))

        SoftDeleteMarker.objects.create(
            content_type=ContentType.objects.get_for_model(Promotion),
            object_id=str(promotion.pk),
        )

        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("0"))

    def test_closed_reservation_keeps_the_discount_it_was_charged_with(self):
        from django.utils import timezone

        promotion = self._promotion("Minibar diez", service=self.service)
        self._charge_minibar()
        self.reservation.real_check_out = timezone.now()
        self.reservation.save()

        promotion.discount_value = self.Decimal("50")
        promotion.save()

        self.assertEqual(self._financials()["promotion_discount_total"], self.Decimal("3000.00"))
