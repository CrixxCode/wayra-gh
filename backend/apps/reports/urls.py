from rest_framework.routers import DefaultRouter

from apps.reports.views import ReportsViewSet

router = DefaultRouter()
router.register(r"reports", ReportsViewSet, basename="reports")

urlpatterns = router.urls