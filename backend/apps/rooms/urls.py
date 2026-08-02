from rest_framework.routers import DefaultRouter
from .views import (
    RoomTypeViewSet,
    RateViewSet,
    AmenityViewSet,
    RoomViewSet,
    MaintenanceOrderViewSet,
    CleaningTaskViewSet
)

router = DefaultRouter()
router.register(r"amenities", AmenityViewSet, basename="amenity")
router.register(r"room-types", RoomTypeViewSet, basename="room-type")
router.register(r"rates", RateViewSet, basename="rate")
router.register(r"rooms", RoomViewSet, basename="room")
router.register(r"maintenance-orders", MaintenanceOrderViewSet, basename="maintenance-order")
router.register(r"cleaning-tasks", CleaningTaskViewSet, basename="cleaning-task")

urlpatterns = router.urls