from rest_framework.routers import DefaultRouter

from apps.packages.views import PackageViewSet, PackageServiceViewSet

router = DefaultRouter()
router.register(r"packages", PackageViewSet, basename="packages")
router.register(r"package-services", PackageServiceViewSet, basename="package-services")

urlpatterns = router.urls