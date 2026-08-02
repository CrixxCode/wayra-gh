from django.urls import path, include
from rest_framework.routers import DefaultRouter

from accounts.views import UserViewSet, RoleViewSet, ResourceViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")
router.register(r"roles", RoleViewSet, basename="roles")
router.register(r"resources", ResourceViewSet, basename="resources")

urlpatterns = [
    path("", include(router.urls)),
]
