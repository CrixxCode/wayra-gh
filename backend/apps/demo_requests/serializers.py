from rest_framework import serializers

from accounts.email_utils import email_backend_delivers_to_inbox
from .models import DemoRequest


class DemoRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemoRequest
        fields = [
            "id",
            "hotel_name",
            "hotel_type",
            "city",
            "rooms",
            "website",
            "requester_first_name",
            "requester_last_name",
            "requester_username",
            "requester_email",
            "requester_job_title",
            "requester_phone",
            "message",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "status", "created_at"]

    def validate_rooms(self, value):
        if value < 1:
            raise serializers.ValidationError("Ingresa una cantidad valida de habitaciones.")
        return value

    def validate_requester_username(self, value):
        username = str(value or "").strip()
        if len(username) < 3:
            raise serializers.ValidationError("El usuario debe tener al menos 3 caracteres.")
        return username

    def validate(self, attrs):
        text_fields = [
            "hotel_name",
            "hotel_type",
            "city",
            "website",
            "requester_first_name",
            "requester_last_name",
            "requester_job_title",
            "requester_phone",
            "message",
        ]

        for field in text_fields:
            if field in attrs:
                attrs[field] = str(attrs.get(field) or "").strip()

        attrs["requester_email"] = str(attrs.get("requester_email") or "").strip().lower()
        attrs["requester_username"] = str(attrs.get("requester_username") or "").strip()
        return attrs


class DemoRequestSerializer(DemoRequestCreateSerializer):
    email_delivery_enabled = serializers.SerializerMethodField()

    class Meta(DemoRequestCreateSerializer.Meta):
        fields = DemoRequestCreateSerializer.Meta.fields + [
            "converted_hotel_settings",
            "converted_user",
            "converted_at",
            "password_reset_sent",
            "email_delivery_enabled",
            "source_ip",
            "user_agent",
            "updated_at",
        ]
        read_only_fields = fields

    def get_email_delivery_enabled(self, obj):
        return email_backend_delivers_to_inbox()


class DemoRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemoRequest
        fields = ["status"]
