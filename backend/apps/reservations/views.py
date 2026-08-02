from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import is_effective_global_admin, scope_queryset_to_hotel
from apps.billing.models import Payment
from apps.inventory.services import apply_checkout_consumption_inventory
from apps.reservations.models import (
    Reservation,
    ReservationInventoryCheck,
    ReservationInventoryCheckLine,
    ReservationRoom,
    ReservationGuest,
)
from apps.reservations.serializers import (
    ReservationInventoryCheckLineSerializer,
    ReservationInventoryCheckSerializer,
    ReservationListSerializer,
    ReservationDetailSerializer,
    ReservationWriteSerializer,
    ReservationRoomSerializer,
    ReservationGuestSerializer,
    ReservationDepositSerializer,
)
from apps.reservations.services import (
    ROOM_STATUS_AVAILABLE,
    ROOM_STATUS_RESERVED,
    RESERVATION_STATUS_CANCELLED_CODES,
    RESERVATION_STATUS_CANCELLED,
    RESERVATION_STATUS_CONFIRMED_CODES,
    RESERVATION_STATUS_CONFIRMED,
    RESERVATION_STATUS_FINISHED_CODES,
    RESERVATION_STATUS_FINISHED,
    RESERVATION_STATUS_IN_PROGRESS_CODES,
    RESERVATION_STATUS_IN_PROGRESS,
    RESERVATION_STATUS_PENDING_CODES,
    RESERVATION_STATUS_PENDING,
    create_check_in_inventory_snapshot,
    create_checkout_inventory_comparison,
    create_post_checkout_cleaning_tasks,
    get_reservation_check_in_start_datetime,
    get_cancelled_reservation_status,
    get_confirmed_reservation_status,
    get_finished_reservation_status,
    get_in_progress_reservation_status,
    get_pending_reservation_status,
    get_reservation_status_by_code,
    is_reservation_status_cancelled,
    is_reservation_status_confirmed,
    is_reservation_status_finished,
    is_reservation_status_pending,
    validate_checkout_inventory_review_payload,
)


class ReservationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class ReservationViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = Reservation.objects.all()
    serializer_class = ReservationWriteSerializer
    pagination_class = ReservationPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservations.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "id",
        "client__first_name",
        "client__last_name",
        "client__document_number",
        "client__email",
        "package__name",
        "package_name",
        "promo_code",
        "notes",
    ]
    ordering_fields = [
        "id",
        "expected_check_in",
        "expected_check_out",
        "real_check_in",
        "real_check_out",
        "created_at",
        "package_price",
        "total_discount",
    ]
    ordering = ["-id"]

    @staticmethod
    def _parse_bool(value) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "si", "on"}

    @staticmethod
    def _get_finished_retention_days() -> int:
        raw_value = getattr(settings, "RESERVATIONS_FINISHED_RETENTION_DAYS", 30)
        try:
            days = int(raw_value)
        except (TypeError, ValueError):
            return 30
        return max(days, 0)

    def get_queryset(self):
        user = self.request.user

        queryset = (
            Reservation.objects.select_related(
                "hotel_settings",
                "client",
                "status",
                "origin",
                "package",
                "created_by",
            )
            .order_by("-id")
        )

        queryset = scope_queryset_to_hotel(
            queryset,
            request=self.request,
            tenant_filter="hotel_settings",
        )

        if self.action == "list":
            queryset = queryset.prefetch_related(
                "policies",
                "rooms_detail__room__floor__hotel_settings",
                "charges",
                "invoices__payments__refunds__status",
            )
        elif self.action in {"retrieve", "confirm", "check_in", "check_out", "cancel"}:
            queryset = queryset.prefetch_related(
                "policies",
                "rooms_detail__room__floor__hotel_settings",
                "rooms_detail__meal_plan",
                "guests__document_type",
                "charges",
                "invoices__payments__refunds__status",
            )

        if self.action != "list":
            return queryset

        include_finished = self._parse_bool(
            self.request.query_params.get("include_finished")
        )
        if include_finished:
            return queryset

        retention_days = self._get_finished_retention_days()
        cutoff = timezone.now() - timedelta(days=retention_days)

        return queryset.exclude(
            status__code__in=RESERVATION_STATUS_FINISHED_CODES,
            real_check_out__lt=cutoff,
        )

    def get_serializer_class(self):
        if self.action == "list":
            return ReservationListSerializer
        if self.action == "retrieve":
            return ReservationDetailSerializer
        return ReservationWriteSerializer

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservations.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @staticmethod
    def _normalize_code(value) -> str:
        return str(value or "").strip().upper()

    def _get_status_obj(self, code: str):
        status_obj = get_reservation_status_by_code(code)
        if status_obj:
            return status_obj

        resolver_map = {
            RESERVATION_STATUS_PENDING: (
                get_pending_reservation_status,
                RESERVATION_STATUS_PENDING_CODES,
            ),
            RESERVATION_STATUS_CONFIRMED: (
                get_confirmed_reservation_status,
                RESERVATION_STATUS_CONFIRMED_CODES,
            ),
            RESERVATION_STATUS_IN_PROGRESS: (
                get_in_progress_reservation_status,
                RESERVATION_STATUS_IN_PROGRESS_CODES,
            ),
            RESERVATION_STATUS_FINISHED: (
                get_finished_reservation_status,
                RESERVATION_STATUS_FINISHED_CODES,
            ),
            RESERVATION_STATUS_CANCELLED: (
                get_cancelled_reservation_status,
                RESERVATION_STATUS_CANCELLED_CODES,
            ),
        }

        resolver, aliases = resolver_map.get(code, (None, None))
        if resolver:
            status_obj = resolver()
            if status_obj:
                return status_obj
            aliases_text = ", ".join(aliases or ())
            raise ValueError(
                "No existe un estado activo para reservas "
                f"con ninguno de estos codigos: {aliases_text}."
            )

        raise ValueError(f"No existe un estado activo '{code}' para reservas.")

    def _set_status(
        self,
        reservation: Reservation,
        *,
        status_code: str,
        set_real_check_in: bool | None = None,
        set_real_check_out: bool | None = None,
    ) -> Reservation:
        status_obj = self._get_status_obj(status_code)
        update_fields = ["status"]

        reservation.status = status_obj

        if set_real_check_in is True and not reservation.real_check_in:
            reservation.real_check_in = timezone.now()
            update_fields.append("real_check_in")

        if set_real_check_out is True and not reservation.real_check_out:
            reservation.real_check_out = timezone.now()
            update_fields.append("real_check_out")

        if set_real_check_in is False and reservation.real_check_in is not None:
            reservation.real_check_in = None
            update_fields.append("real_check_in")

        if set_real_check_out is False and reservation.real_check_out is not None:
            reservation.real_check_out = None
            update_fields.append("real_check_out")

        reservation.save(update_fields=update_fields)
        reservation.refresh_from_db()
        return reservation

    def _error(self, message: str) -> Response:
        return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _validation_error_message(error: ValidationError) -> str:
        message_dict = getattr(error, "message_dict", None)
        if isinstance(message_dict, dict) and message_dict:
            first_value = next(iter(message_dict.values()))
            if isinstance(first_value, (list, tuple)) and first_value:
                return str(first_value[0])
            return str(first_value)

        messages = getattr(error, "messages", None)
        if isinstance(messages, list) and messages:
            return str(messages[0])

        return str(error)

    def _get_locked_reservation(self, reservation_id: int | str):
        return self.get_queryset().select_for_update().get(pk=reservation_id)

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        with transaction.atomic():
            reservation = self._get_locked_reservation(pk)
            code = self._normalize_code(reservation.status_code)

            if reservation.real_check_out:
                return self._error("La reserva ya fue finalizada.")

            if reservation.real_check_in:
                return self._error("La reserva ya tiene check-in registrado.")

            if is_reservation_status_cancelled(code):
                return self._error("No puedes confirmar una reserva cancelada.")

            if is_reservation_status_finished(code):
                return self._error("No puedes confirmar una reserva finalizada.")

            if is_reservation_status_confirmed(code):
                serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
                return Response(serializer.data, status=status.HTTP_200_OK)

            if not is_reservation_status_pending(code):
                return self._error("Solo se pueden confirmar reservas en estado pendiente.")

            try:
                reservation = self._set_status(reservation, status_code=RESERVATION_STATUS_CONFIRMED)
            except ValueError as exc:
                return self._error(str(exc))

        serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        with transaction.atomic():
            reservation = self._get_locked_reservation(pk)
            code = self._normalize_code(reservation.status_code)

            if reservation.real_check_out:
                return self._error("La reserva ya fue finalizada.")

            if reservation.real_check_in:
                return self._error("La reserva ya tiene check-in registrado.")

            if is_reservation_status_cancelled(code):
                return self._error("No puedes hacer check-in en una reserva cancelada.")

            if not is_reservation_status_confirmed(code):
                return self._error("Debes confirmar la reserva antes de hacer check-in.")

            room_details = reservation.rooms_detail.select_related("room__status").all()
            for room_detail in room_details:
                room = room_detail.room
                room_status_code = self._normalize_code(
                    getattr(getattr(room, "status", None), "code", None)
                )
                if room_status_code not in {ROOM_STATUS_AVAILABLE, ROOM_STATUS_RESERVED}:
                    room_number = getattr(room, "number", room.id)
                    room_status_name = (
                        getattr(getattr(room, "status", None), "name", None)
                        or room_status_code
                        or "SIN_ESTADO"
                    )
                    return self._error(
                        "No puedes hacer check-in porque la habitacion "
                        f"{room_number} no esta disponible (estado: {room_status_name})."
                    )

            check_in_start_datetime = get_reservation_check_in_start_datetime(reservation)
            if (
                check_in_start_datetime is not None
                and timezone.now() < check_in_start_datetime
            ):
                check_in_start_local = timezone.localtime(check_in_start_datetime)
                return self._error(
                    "El check-in aun no esta habilitado. "
                    f"Puedes registrarlo desde el {check_in_start_local:%Y-%m-%d} "
                    f"a las {check_in_start_local:%H:%M}."
                )

            try:
                reservation = self._set_status(
                    reservation,
                    status_code=RESERVATION_STATUS_IN_PROGRESS,
                    set_real_check_in=True,
                )
                create_check_in_inventory_snapshot(
                    reservation,
                    created_by=request.user,
                )
            except ValueError as exc:
                return self._error(str(exc))

        serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="check-out")
    def check_out(self, request, pk=None):
        inventory_comparison = None
        with transaction.atomic():
            reservation = self._get_locked_reservation(pk)
            code = self._normalize_code(reservation.status_code)

            if reservation.real_check_out:
                serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
                return Response(serializer.data, status=status.HTTP_200_OK)

            if reservation.real_check_in is None:
                return self._error("No puedes hacer check-out sin haber registrado check-in.")

            if is_reservation_status_cancelled(code):
                return self._error("No puedes hacer check-out en una reserva cancelada.")

            inventory_review_payload = request.data.get(
                "inventory_review",
                request.data.get("inventory"),
            )
            try:
                inventory_review_lines = validate_checkout_inventory_review_payload(
                    reservation,
                    inventory_review_payload,
                )
            except ValidationError as exc:
                return self._error(self._validation_error_message(exc))

            try:
                reservation = self._set_status(
                    reservation,
                    status_code=RESERVATION_STATUS_FINISHED,
                    set_real_check_out=True,
                )
                create_post_checkout_cleaning_tasks(reservation)
                inventory_comparison = create_checkout_inventory_comparison(
                    reservation,
                    inventory_review_lines=inventory_review_lines,
                    created_by=request.user,
                )
                apply_checkout_consumption_inventory(
                    reservation,
                    inventory_comparison=inventory_comparison,
                )
                from apps.billing.services import (
                    create_inventory_missing_charges_for_checkout,
                    issue_default_invoice_for_reservation,
                )

                create_inventory_missing_charges_for_checkout(
                    reservation,
                    inventory_comparison=inventory_comparison,
                )
                issue_default_invoice_for_reservation(
                    reservation.id,
                    expected_hotel_settings_id=reservation.hotel_settings_id,
                )
            except ValidationError as exc:
                return self._error(self._validation_error_message(exc))
            except ValueError as exc:
                return self._error(str(exc))

        serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
        response_data = dict(serializer.data)
        if inventory_comparison is not None:
            response_data["inventory_comparison"] = inventory_comparison
        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        with transaction.atomic():
            reservation = self._get_locked_reservation(pk)
            code = self._normalize_code(reservation.status_code)

            if reservation.real_check_in:
                return self._error("No puedes cancelar una reserva que ya tiene check-in.")

            if reservation.real_check_out:
                return self._error("No puedes cancelar una reserva finalizada.")

            if is_reservation_status_cancelled(code):
                serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
                return Response(serializer.data, status=status.HTTP_200_OK)

            if is_reservation_status_finished(code):
                return self._error("No puedes cancelar una reserva finalizada.")

            try:
                reservation = self._set_status(reservation, status_code=RESERVATION_STATUS_CANCELLED)
            except ValueError as exc:
                return self._error(str(exc))

        serializer = ReservationDetailSerializer(reservation, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReservationRoomViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = ReservationRoom.objects.all()
    serializer_class = ReservationRoomSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation_rooms.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "reservation__id",
        "room__number",
    ]
    ordering_fields = [
        "id",
        "night_rate",
        "adults",
        "children",
        "created_at",
    ]
    ordering = ["-id"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            ReservationRoom.objects.select_related(
                "reservation",
                "reservation__hotel_settings",
                "room",
                "room__floor",
                "room__floor__hotel_settings",
                "meal_plan",
            )
            .all()
            .order_by("-id")
        )

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="reservation__hotel_settings",
        )

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation_rooms.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

class ReservationGuestViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = ReservationGuest.objects.all()
    serializer_class = ReservationGuestSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation_guests.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "reservation__id",
        "document_number",
        "first_name",
        "last_name",
        "nationality",
    ]
    ordering_fields = [
        "id",
        "first_name",
        "last_name",
        "birth_date",
        "created_at",
    ]
    ordering = ["-id"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            ReservationGuest.objects.select_related(
                "reservation",
                "reservation__hotel_settings",
                "document_type",
            )
            .all()
            .order_by("-id")
        )

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="reservation__hotel_settings",
        )

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation_guests.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class ReservationDepositViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = ReservationDepositSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation_deposits.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "invoice__reservation__id",
        "reference",
        "notes",
    ]
    ordering_fields = [
        "id",
        "payment_date",
        "deposit_date",
        "amount",
        "created_at",
    ]
    ordering = ["-id"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            Payment.objects.select_related(
                "invoice",
                "invoice__reservation",
                "invoice__reservation__hotel_settings",
                "payment_method",
            )
            .prefetch_related("refunds__status")
            .annotate(deposit_date=F("payment_date"))
            .order_by("-id")
        )

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="invoice__reservation__hotel_settings",
        )

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation_deposits.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

class ReservationInventoryCheckViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = ReservationInventoryCheck.objects.all()
    serializer_class = ReservationInventoryCheckSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation_inventory_checks.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "reservation__id",
        "check_type",
        "notes",
        "created_by__username",
    ]
    ordering_fields = ["id", "check_type", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            ReservationInventoryCheck.objects.select_related(
                "reservation",
                "reservation__hotel_settings",
                "created_by",
            )
            .all()
            .order_by("-created_at")
        )

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="reservation__hotel_settings",
        )

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation_inventory_checks.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class ReservationInventoryCheckLineViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = ReservationInventoryCheckLine.objects.all()
    serializer_class = ReservationInventoryCheckLineSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation_inventory_check_lines.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "inventory_check__reservation__id",
        "room__number",
        "item__name",
        "notes",
    ]
    ordering_fields = ["id", "room__number", "item__name", "created_at"]
    ordering = ["room__number", "item__name", "id"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            ReservationInventoryCheckLine.objects.select_related(
                "inventory_check",
                "inventory_check__reservation",
                "inventory_check__reservation__hotel_settings",
                "reservation_room",
                "room",
                "room__floor",
                "item",
            )
            .all()
            .order_by("room__number", "item__name", "id")
        )

        return scope_queryset_to_hotel(
            qs,
            request=self.request,
            tenant_filter="inventory_check__reservation__hotel_settings",
        )

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation_inventory_check_lines.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
