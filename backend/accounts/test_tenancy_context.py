from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import ValidationError

from accounts.tenancy import scope_queryset_to_hotel
from apps.hotel_settings.models import HotelFloor, HotelSettings


User = get_user_model()


class HotelContextScopeTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")
        HotelFloor.objects.create(
            hotel_settings=self.hotel_a,
            floor_number=1,
            name="Piso A",
            prefix="A",
            room_count=1,
        )
        HotelFloor.objects.create(
            hotel_settings=self.hotel_b,
            floor_number=1,
            name="Piso B",
            prefix="B",
            room_count=1,
        )

    def _request(self, user, hotel_settings):
        django_request = self.factory.get(
            "/api/hotel-floors/",
            {"hotel_settings": hotel_settings},
        )
        return SimpleNamespace(user=user, query_params=django_request.GET)

    def test_global_admin_queryset_uses_selected_hotel(self):
        user = User.objects.create_superuser(
            username="global-context-admin",
            email="global-context@example.com",
            password="test-pass-123",
        )
        request = self._request(user, self.hotel_b.id)

        queryset = scope_queryset_to_hotel(
            HotelFloor.objects.all(),
            request=request,
            tenant_filter="hotel_settings",
        )

        self.assertEqual(list(queryset.values_list("name", flat=True)), ["Piso B"])

    def test_hotel_user_cannot_override_assigned_hotel(self):
        user = User.objects.create_user(
            username="hotel-context-user",
            email="hotel-context@example.com",
            password="test-pass-123",
            hotel_settings=self.hotel_a,
        )
        request = self._request(user, self.hotel_b.id)

        queryset = scope_queryset_to_hotel(
            HotelFloor.objects.all(),
            request=request,
            tenant_filter="hotel_settings",
        )

        self.assertEqual(list(queryset.values_list("name", flat=True)), ["Piso A"])

    def test_invalid_selected_hotel_is_rejected(self):
        user = User.objects.create_superuser(
            username="invalid-context-admin",
            email="invalid-context@example.com",
            password="test-pass-123",
        )
        request = self._request(user, "invalid")

        with self.assertRaises(ValidationError):
            scope_queryset_to_hotel(
                HotelFloor.objects.all(),
                request=request,
                tenant_filter="hotel_settings",
            )
