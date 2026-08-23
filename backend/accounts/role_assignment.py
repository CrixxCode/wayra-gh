from accounts.tenancy import is_effective_global_admin


HOTEL_MANAGEMENT_ROLE_SLUGS = {"admin", "manager", "staff"}
HOTEL_ROLE_ASSIGNMENT_ERROR = "No puedes asignar este rol desde la vista de usuarios del hotel."


def is_hotel_role_assignment_context(*, target_user=None, target_hotel=None, force_hotel_context=False) -> bool:
    if force_hotel_context:
        return True
    if target_hotel is not None:
        return True
    return bool(getattr(target_user, "hotel_settings_id", None))


def assignable_roles_for_actor(
    actor,
    *,
    target_user=None,
    target_hotel=None,
    force_hotel_context=False,
):
    from .models import Role

    queryset = Role.objects.filter(is_active=True)
    if is_hotel_role_assignment_context(
        target_user=target_user,
        target_hotel=target_hotel,
        force_hotel_context=force_hotel_context,
    ):
        return queryset.filter(slug__in=HOTEL_MANAGEMENT_ROLE_SLUGS)

    if is_effective_global_admin(actor):
        return queryset

    return queryset.filter(slug__in=HOTEL_MANAGEMENT_ROLE_SLUGS)
