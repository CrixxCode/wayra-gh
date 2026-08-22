from rest_framework import serializers

from accounts.email_utils import email_backend_delivers_to_inbox
from django.contrib.auth import get_user_model
from .models import DemoRequest

User = get_user_model()


class DemoRequestCreateSerializer(serializers.ModelSerializer):
    email_verification_token = serializers.UUIDField(write_only=True, required=True)
    email_verification_code = serializers.CharField(
        write_only=True,
        required=True,
        min_length=6,
        max_length=6,
        trim_whitespace=True,
    )

    class Meta:
        model = DemoRequest
        fields = [
            "id",
            "hotel_name",
            "hotel_type",
            "country",
            "state",
            "city",
            "address",
            "rooms",
            "website",
            "check_in_time",
            "check_out_time",
            "requester_first_name",
            "requester_last_name",
            "requester_username",
            "requester_email",
            "requester_job_title",
            "requester_phone",
            "message",
            "email_verification_token",
            "email_verification_code",
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
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Ya existe un usuario con este nombre de usuario.")
        return username

    def validate_requester_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email

    def validate(self, attrs):
        text_fields = [
            "hotel_name",
            "hotel_type",
            "country",
            "state",
            "city",
            "address",
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

        check_in_time = attrs.get("check_in_time")
        check_out_time = attrs.get("check_out_time")
        if check_in_time and check_out_time and check_in_time == check_out_time:
            raise serializers.ValidationError(
                {"check_out_time": "Check-out time must be different from check-in time."}
            )

        return attrs

    def create(self, validated_data):
        validated_data.pop("email_verification_token", None)
        validated_data.pop("email_verification_code", None)
        return super().create(validated_data)


class DemoRequestEmailVerificationRequestSerializer(serializers.Serializer):
    requester_email = serializers.EmailField()

    def validate_requester_email(self, value):
        email = str(value or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este correo.")
        return email


class DemoRequestSerializer(DemoRequestCreateSerializer):
    email_delivery_enabled = serializers.SerializerMethodField()
    email_delivery_error = serializers.SerializerMethodField()

    class Meta(DemoRequestCreateSerializer.Meta):
        fields = DemoRequestCreateSerializer.Meta.fields + [
            "converted_hotel_settings",
            "converted_user",
            "converted_at",
            "password_reset_sent",
            "email_delivery_enabled",
            "email_delivery_error",
            "source_ip",
            "user_agent",
            "updated_at",
        ]
        read_only_fields = fields

    def get_email_delivery_enabled(self, obj):
        return email_backend_delivers_to_inbox()

    def get_email_delivery_error(self, obj):
        return str(getattr(obj, "_email_delivery_error", "") or "")


class DemoRequestStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemoRequest
        fields = ["status"]
