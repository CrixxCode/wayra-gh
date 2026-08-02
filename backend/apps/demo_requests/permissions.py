from rest_framework.permissions import BasePermission

from accounts.tenancy import is_effective_global_admin


class IsPlatformAdmin(BasePermission):
    message = "Solo los administradores globales pueden gestionar solicitudes de demo."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and is_effective_global_admin(user))

