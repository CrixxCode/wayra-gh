from rest_framework.routers import DefaultRouter

from apps.reservations.views import (
    ReservationInventoryCheckLineViewSet,
    ReservationInventoryCheckViewSet,
    ReservationViewSet,
    ReservationRoomViewSet,
    ReservationGuestViewSet,
    ReservationDepositViewSet,
    WebReservationViewSet,
    OnlineCheckInViewSet,
)

router = DefaultRouter()
router.register(r"web-reservations", WebReservationViewSet, basename="web-reservations")
router.register(r"online-check-in", OnlineCheckInViewSet, basename="online-check-in")
router.register(r"reservations", ReservationViewSet, basename="reservations")
router.register(r"reservation-rooms", ReservationRoomViewSet, basename="reservation-rooms")
router.register(r"reservation-guests", ReservationGuestViewSet, basename="reservation-guests")
router.register(r"reservation-deposits", ReservationDepositViewSet, basename="reservation-deposits")
router.register(r"reservation-inventory-checks", ReservationInventoryCheckViewSet, basename="reservation-inventory-check")
router.register(r"reservation-inventory-check-lines", ReservationInventoryCheckLineViewSet, basename="reservation-inventory-check-line")

urlpatterns = router.urls
