"""Ayudas para tests de API: usuarios de hotel con exactamente los scopes pedidos."""

import uuid

from django.contrib.auth import get_user_model

from accounts.models import Resource, Role, RoleResource, UserRole


def make_hotel_user(hotel, *scopes, username=None, role_slug=None):
    """
    Crea un usuario del hotel con un rol propio que tiene solo `scopes`.

    Sirve para probar el RBAC de verdad (5.3): un superusuario pasa todos los permisos y
    ocultaria justo lo que el test quiere comprobar.
    """
    suffix = f"{hotel.pk}-{uuid.uuid4().hex[:8]}"
    username = username or f"user-{suffix}"
    role = Role.objects.create(name=f"Rol {suffix}", slug=role_slug or f"rol-{suffix}", is_active=True)
    for key in scopes:
        resource, _ = Resource.objects.get_or_create(key=key, defaults={"name": key, "is_active": True})
        RoleResource.objects.get_or_create(role=role, resource=resource)
    user = get_user_model().objects.create_user(
        username=username, password="Pass12345!", hotel_settings=hotel
    )
    UserRole.objects.create(user=user, role=role, is_active=True)
    return user
