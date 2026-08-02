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
