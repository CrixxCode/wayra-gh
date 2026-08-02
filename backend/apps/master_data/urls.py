from rest_framework.routers import DefaultRouter

from .views import MasterDataViewSet

router = DefaultRouter()
router.register(r"master-data", MasterDataViewSet, basename="master-data")

urlpatterns = router.urls
