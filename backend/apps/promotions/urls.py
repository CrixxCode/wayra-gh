from rest_framework.routers import DefaultRouter

from apps.promotions.views import PromotionViewSet

router = DefaultRouter()
router.register(r"promotions", PromotionViewSet, basename="promotions")

urlpatterns = router.urls