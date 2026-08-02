from rest_framework.routers import DefaultRouter
from .views import HotelSettingsViewSet, HotelFloorViewSet, ReservationPolicyViewSet

router = DefaultRouter()
router.register(r"hotel-settings", HotelSettingsViewSet, basename="hotel-settings")
router.register(r"hotel-floors", HotelFloorViewSet, basename="hotel-floors")
router.register(r"reservation-policies", ReservationPolicyViewSet, basename="reservation-policies")

urlpatterns = router.urls