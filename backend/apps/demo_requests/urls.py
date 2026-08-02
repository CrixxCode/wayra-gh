from rest_framework.routers import DefaultRouter

from .views import DemoRequestViewSet

router = DefaultRouter()
router.register(r"demo-requests", DemoRequestViewSet, basename="demo-requests")

urlpatterns = router.urls

