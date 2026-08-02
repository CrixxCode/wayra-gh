from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData
from apps.packages.models import Package, PackageService
from apps.packages.views import PackageServiceViewSet, PackageViewSet
from apps.rooms.models import RoomType
from apps.services.models import Service


class PackageTenantIsolationTests(TestCase):
    def _md(self, group: str, code: str, name: str):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name, "is_active": True, "sort_order": 1},
        )[0]

    def test_package_model_clean_rejects_room_type_from_other_hotel(self):
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        room_type_b = RoomType.objects.create(
            hotel_settings=hotel_b,
            code="STD-B",
            name="Standard B",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )

        package = Package(
            hotel_settings=hotel_a,
            room_type=room_type_b,
            name="Paquete invalido",
            base_price=100000,
            is_active=True,
        )

        with self.assertRaises(ValidationError) as ctx:
            package.full_clean()
        self.assertIn("room_type", ctx.exception.message_dict)

    def test_package_viewset_excludes_cross_hotel_room_type_rows(self):
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        room_type_a = RoomType.objects.create(
            hotel_settings=hotel_a,
            code="STD-A",
            name="Standard A",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )
        room_type_b = RoomType.objects.create(
            hotel_settings=hotel_b,
            code="STD-B",
            name="Standard B",
            capacity=2,
            bed_count=1,
            is_active=True,
            sort_order=1,
        )

        valid_pkg = Package.objects.create(
            hotel_settings=hotel_a,
            room_type=room_type_a,
            name="Paquete valido",
            base_price=100000,
            is_active=True,
        )
        invalid_pkg = Package.objects.create(
            hotel_settings=hotel_a,
            room_type=room_type_b,
            name="Paquete inconsistente",
            base_price=100000,
            is_active=True,
        )

        ids = set(PackageViewSet().get_base_queryset().values_list("id", flat=True))
        self.assertIn(valid_pkg.id, ids)
        self.assertNotIn(invalid_pkg.id, ids)

    def test_package_service_viewset_excludes_cross_hotel_service_rows(self):
        service_type = self._md(MasterData.Group.SERVICE_TYPE, "SPA", "Spa")
        hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        package_a = Package.objects.create(
            hotel_settings=hotel_a,
            name="Paquete A",
            base_price=120000,
            is_active=True,
        )
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

        valid_link = PackageService.objects.create(
            package=package_a,
            service=service_a,
            quantity=1,
            is_included=True,
        )
        invalid_link = PackageService.objects.create(
            package=package_a,
            service=service_b,
            quantity=1,
            is_included=True,
        )

        ids = set(PackageServiceViewSet().get_base_queryset().values_list("id", flat=True))
        self.assertIn(valid_link.id, ids)
        self.assertNotIn(invalid_link.id, ids)
