from accounts.tenancy import is_effective_global_admin


class NotificationAccessPolicy:
    @staticmethod
    def can_use_hotel_scope(user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if is_effective_global_admin(user):
            return True

        if getattr(user, "hotel_settings_id", None) is None:
            return False

        resource_keys = {str(key or "").strip().lower() for key in user.resource_keys()}
        return (
            "notifications.write" in resource_keys
            or "notifications.*" in resource_keys
            or "*" in resource_keys
        )

    @staticmethod
    def can_access_notification(user, notification, *, hotel_scope_enabled: bool = False) -> bool:
        if not user or not user.is_authenticated:
            return False

        if is_effective_global_admin(user):
            return True

        if getattr(notification, "user_id", None) == getattr(user, "id", None):
            return True

        if (
            hotel_scope_enabled
            and NotificationAccessPolicy.can_use_hotel_scope(user)
            and getattr(notification, "hotel_settings_id", None) == getattr(user, "hotel_settings_id", None)
        ):
            return True

        return False
