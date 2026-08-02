from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasResourcePermission
from accounts.tenancy import is_effective_global_admin, scope_queryset_to_hotel
from apps.notifications.models import Notification
from apps.notifications.permissions import NotificationAccessPolicy
from apps.notifications.serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Notification.objects.select_related(
        "hotel_settings",
        "user",
        "related_content_type",
    )
    serializer_class = NotificationSerializer
    permission_classes = [HasResourcePermission]
    required_scopes = ["notifications.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_read", "notification_type", "priority"]
    search_fields = ["title", "message"]
    ordering_fields = ["created_at", "priority", "notification_type"]
    ordering = ["-created_at", "-id"]

    def _is_hotel_scope_requested(self) -> bool:
        return str(self.request.query_params.get("scope") or "").strip().lower() == "hotel"

    def _allow_hotel_scope(self) -> bool:
        return NotificationAccessPolicy.can_use_hotel_scope(self.request.user)

    def get_required_scopes(self):
        if self.action in {"mark_as_read", "mark_all_as_read"}:
            return ["notifications.read"]
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["notifications.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        queryset = self.queryset.order_by("-created_at", "-id")

        if not user or not user.is_authenticated:
            return queryset.none()

        if is_effective_global_admin(user):
            return scope_queryset_to_hotel(
                queryset,
                request=self.request,
                tenant_filter="hotel_settings",
            )

        if self._is_hotel_scope_requested() and self._allow_hotel_scope():
            tenant_id = getattr(user, "hotel_settings_id", None)
            if tenant_id is None:
                return queryset.none()
            return queryset.filter(hotel_settings_id=tenant_id)

        return queryset.filter(user=user)

    def retrieve(self, request, *args, **kwargs):
        notification = self.get_object()
        if not NotificationAccessPolicy.can_access_notification(
            request.user,
            notification,
            hotel_scope_enabled=self._allow_hotel_scope(),
        ):
            return Response({"detail": "No tienes permisos para ver esta notificacion."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({"unread_count": count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-as-read")
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        if not NotificationAccessPolicy.can_access_notification(
            request.user,
            notification,
            hotel_scope_enabled=self._allow_hotel_scope(),
        ):
            return Response({"detail": "No tienes permisos para modificar esta notificacion."}, status=status.HTTP_403_FORBIDDEN)

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])

        serializer = self.get_serializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="mark-all-as-read")
    def mark_all_as_read(self, request):
        now = timezone.now()
        updated = Notification.objects.filter(
            user=request.user,
            is_read=False,
        ).update(
            is_read=True,
            read_at=now,
        )
        return Response({"updated": updated}, status=status.HTTP_200_OK)
