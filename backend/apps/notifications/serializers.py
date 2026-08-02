from rest_framework import serializers

from apps.notifications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    hotel_name = serializers.CharField(source="hotel_settings.hotel_name", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    related_content_type_label = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "hotel_settings",
            "hotel_name",
            "user",
            "user_username",
            "title",
            "message",
            "notification_type",
            "priority",
            "is_read",
            "action_url",
            "related_content_type",
            "related_content_type_label",
            "related_object_id",
            "metadata",
            "created_at",
            "read_at",
        ]
        read_only_fields = fields

    def get_related_content_type_label(self, obj) -> str | None:
        content_type = getattr(obj, "related_content_type", None)
        if not content_type:
            return None
        return f"{content_type.app_label}.{content_type.model}"
