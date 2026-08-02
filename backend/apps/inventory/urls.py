from rest_framework.routers import DefaultRouter

from apps.inventory.views import (
    ItemViewSet,
    InventoryMovementViewSet,
    RoomInventoryViewSet,
)

router = DefaultRouter()
router.register(r"items", ItemViewSet, basename="items")
router.register(r"inventory-movements", InventoryMovementViewSet, basename="inventory-movements")
router.register(r"room-inventory", RoomInventoryViewSet, basename="room-inventory")

urlpatterns = router.urls