from rest_framework.routers import DefaultRouter
from .views import (
    AlliedHotelViewSet,
    HotelSettingsViewSet,
    HotelFloorViewSet,
    PaymentMethodViewSet,
    ReservationPolicyViewSet,
)

router = DefaultRouter()
router.register(r"allied-hotels", AlliedHotelViewSet, basename="allied-hotels")
router.register(r"hotel-settings", HotelSettingsViewSet, basename="hotel-settings")
router.register(r"hotel-floors", HotelFloorViewSet, basename="hotel-floors")
router.register(r"reservation-policies", ReservationPolicyViewSet, basename="reservation-policies")
router.register(r"payment-methods", PaymentMethodViewSet, basename="payment-methods")

urlpatterns = router.urls
