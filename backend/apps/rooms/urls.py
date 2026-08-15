from rest_framework.routers import DefaultRouter
from .views import (
    RoomTypeViewSet,
    RateViewSet,
    AmenityViewSet,
    RoomViewSet,
    MaintenanceOrderViewSet,
    CleaningTaskViewSet,
    RecurringWorkViewSet,
)

router = DefaultRouter()
router.register(r"amenities", AmenityViewSet, basename="amenity")
router.register(r"room-types", RoomTypeViewSet, basename="room-type")
router.register(r"rates", RateViewSet, basename="rate")
router.register(r"rooms", RoomViewSet, basename="room")
router.register(r"maintenance-orders", MaintenanceOrderViewSet, basename="maintenance-order")
router.register(r"cleaning-tasks", CleaningTaskViewSet, basename="cleaning-task")
router.register(r"recurring-work", RecurringWorkViewSet, basename="recurring-work")

urlpatterns = router.urls