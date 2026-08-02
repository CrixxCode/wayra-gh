from datetime import datetime, time

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.billing.models import Payment
from apps.billing.services import ensure_default_invoice_for_reservation
from apps.master_data.models import MasterData
from apps.packages.models import Package
from apps.reservations.models import (
    Reservation,
    ReservationInventoryCheck,
    ReservationInventoryCheckLine,
    ReservationRoom,
    ReservationGuest,
)
from apps.reservations.services import (
    RESERVATION_STATUS_PENDING_CODES,
    can_add_payment_to_reservation,
    find_active_rate_for_room_type_dates,
    find_overlapping_reservation_room,
    get_pending_reservation_status,
    get_reservation_financials,
    get_reservation_flow_permissions,
    get_reservation_payment_status,
    has_active_rate_for_room_type,
    is_room_status_blocked_for_reservation,
    sync_reservation_room_pricing_and_occupancy,
    validate_reservation_deposit_rules,
)
from apps.hotel_settings.models import ReservationPolicy, HotelSettings
from accounts.tenancy import TenantSerializerMixin, is_effective_global_admin
from apps.clients.models import Client
from apps.inventory.models import Item
from apps.rooms.models import Room


class ReservationPolicySummarySerializer(serializers.ModelSerializer):
    policy_type_name = serializers.CharField(source="policy_type.name", read_only=True)
    policy_type_code = serializers.CharField(source="policy_type.code", read_only=True)
    penalty_type_name = serializers.CharField(source="penalty_type.name", read_only=True)
    penalty_type_code = serializers.CharField(source="penalty_type.code", read_only=True)

    class Meta:
        model = ReservationPolicy
        fields = [
            "id",
            "hotel_settings",
            "policy_type",
            "policy_type_name",
            "policy_type_code",
            "penalty_type",
            "penalty_type_name",
            "penalty_type_code",
            "name",
            "description",
            "penalty_value",
            "hours_before_checkin",
            "is_active",
        ]
        read_only_fields = fields


def _as_serializer_error(error: Exception) -> dict:
    message_dict = getattr(error, "message_dict", None)
    if isinstance(message_dict, dict) and message_dict:
        return message_dict

    messages = getattr(error, "messages", None)
    if isinstance(messages, list) and messages:
        if len(messages) == 1:
            return {"detail": messages[0]}
        return {"detail": messages}

    return {"detail": str(error)}


class ReservationRoomSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.number", read_only=True)
    room_type_name = serializers.CharField(source="room.room_type.name", read_only=True)
    room_type_capacity = serializers.IntegerField(source="room.room_type.capacity", read_only=True)
    meal_plan_name = serializers.CharField(source="meal_plan.name", read_only=True)
    meal_plan_code = serializers.CharField(source="meal_plan.code", read_only=True)
    subtotal = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = ReservationRoom
        fields = [
            "id",
            "reservation",
            "room",
            "room_number",
            "room_type_name",
            "room_type_capacity",
            "night_rate",
            "adults",
            "children",
            "meal_plan",
            "meal_plan_name",
            "meal_plan_code",
            "subtotal",
            "created_at",
        ]
        read_only_fields = ("id", "created_at", "subtotal")
        extra_kwargs = {
            "night_rate": {"required": False},
            "adults": {"required": False},
            "children": {"required": False},
        }

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["reservation"].queryset = Reservation.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["room"].queryset = Room.objects.filter(
                floor__hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_night_rate(self, value):
        if value < 0:
            raise serializers.ValidationError("Night rate cannot be negative.")
        return value

    def validate_adults(self, value):
        if value < 1:
            raise serializers.ValidationError("There must be at least one adult assigned to the room.")
        return value

    def validate_children(self, value):
        if value < 0:
            raise serializers.ValidationError("Children cannot be negative.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        user = getattr(request, "user", None)

        reservation = attrs.get("reservation", getattr(self.instance, "reservation", None))
        room = attrs.get("room", getattr(self.instance, "room", None))
        provided_night_rate = attrs.get("night_rate", None)

        if reservation is None:
            raise serializers.ValidationError({
                "reservation": "La reserva es obligatoria."
            })

        if room is None:
            raise serializers.ValidationError({
                "room": "La habitacion es obligatoria."
            })

        reservation_hotel_id = reservation.hotel_settings_id
        room_hotel_id = getattr(getattr(room, "floor", None), "hotel_settings_id", None)

        if reservation_hotel_id and room_hotel_id and reservation_hotel_id != room_hotel_id:
            raise serializers.ValidationError({
                "room": "La habitacion no pertenece al mismo hotel de la reserva."
            })

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError({
                    "reservation": "El usuario autenticado no tiene un hotel asignado."
                })

            if reservation_hotel_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "reservation": "La reserva no pertenece al hotel del usuario autenticado."
                })

            if room_hotel_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "room": "La habitacion no pertenece al hotel del usuario autenticado."
                })

        should_validate_room_status = self.instance is None
        if self.instance is not None:
            if "room" in attrs and room and room.id != self.instance.room_id:
                should_validate_room_status = True
            if (
                "reservation" in attrs
                and reservation
                and reservation.id != self.instance.reservation_id
            ):
                should_validate_room_status = True

        if (
            should_validate_room_status
            and room
            and is_room_status_blocked_for_reservation(getattr(room, "status_code", None))
        ):
            status_label = room.get_status_display() or room.status_code or "estado actual"
            raise serializers.ValidationError(
                {
                    "room": (
                        f"La habitacion {room.number} no puede reservarse porque esta en {status_label.lower()}."
                    )
                }
            )

        if reservation and room:
            conflict = find_overlapping_reservation_room(
                room_id=room.id,
                expected_check_in=reservation.expected_check_in,
                expected_check_out=reservation.expected_check_out,
                exclude_reservation_room_id=getattr(self.instance, "id", None),
            )
            if conflict:
                conflict_reservation = conflict.reservation
                raise serializers.ValidationError(
                    {
                        "room": (
                            f"Room {room.number} already has an active reservation "
                            f"(#{conflict_reservation.id}) from "
                            f"{conflict_reservation.expected_check_in} to "
                            f"{conflict_reservation.expected_check_out}."
                        )
                    }
                )

        if reservation and room and reservation.package_id:
            package = reservation.package
            check_in = reservation.expected_check_in
            check_out = reservation.expected_check_out

            if package.start_date and check_in and check_in < package.start_date:
                raise serializers.ValidationError(
                    {"reservation": "Reservation check-in is outside the package validity period."}
                )

            if package.end_date and check_out and check_out > package.end_date:
                raise serializers.ValidationError(
                    {"reservation": "Reservation check-out is outside the package validity period."}
                )

            if room_hotel_id and package.hotel_settings_id != room_hotel_id:
                raise serializers.ValidationError(
                    {"room": "The room is not compatible with the package hotel."}
                )

            if package.room_type_id and room.room_type_id != package.room_type_id:
                raise serializers.ValidationError(
                    {"room": "The room type is not compatible with the selected package."}
                )

        if reservation and room:
            room_type_id = getattr(room, "room_type_id", None)
            if not room_type_id:
                raise serializers.ValidationError(
                    {"room": f"La habitacion {room.number} no tiene tipo de habitacion configurado."}
                )

            expected_rate = find_active_rate_for_room_type_dates(
                room_type_id=room_type_id,
                expected_check_in=reservation.expected_check_in,
                expected_check_out=reservation.expected_check_out,
            )
            has_active_rates = has_active_rate_for_room_type(room_type_id)

            if not expected_rate:
                if has_active_rates:
                    raise serializers.ValidationError(
                        {
                            "night_rate": (
                                "No existe una tarifa activa para el tipo de habitacion "
                                "en el rango de fechas de la reserva."
                            )
                        }
                    )
                raise serializers.ValidationError(
                    {
                        "night_rate": (
                            "La habitacion seleccionada no tiene una tarifa activa configurada "
                            "para su tipo de habitacion."
                        )
                    }
                )

            if provided_night_rate is not None and provided_night_rate != expected_rate.price:
                raise serializers.ValidationError(
                    {
                        "night_rate": (
                            f"La tarifa por noche debe coincidir con la tarifa activa "
                            f"({expected_rate.price}) para este tipo de habitacion."
                        )
                    }
                )

            attrs["night_rate"] = expected_rate.price

        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            instance = super().create(validated_data)
            try:
                sync_reservation_room_pricing_and_occupancy(instance.reservation)
            except Exception as exc:
                raise serializers.ValidationError(_as_serializer_error(exc))
            instance.refresh_from_db()
            return instance

    def update(self, instance, validated_data):
        with transaction.atomic():
            updated = super().update(instance, validated_data)
            try:
                sync_reservation_room_pricing_and_occupancy(updated.reservation)
            except Exception as exc:
                raise serializers.ValidationError(_as_serializer_error(exc))
            updated.refresh_from_db()
            return updated


class ReservationGuestSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    document_type_name = serializers.CharField(source="document_type.name", read_only=True)
    document_type_code = serializers.CharField(source="document_type.code", read_only=True)

    class Meta:
        model = ReservationGuest
        fields = [
            "id",
            "reservation",
            "document_type",
            "document_type_name",
            "document_type_code",
            "document_number",
            "first_name",
            "last_name",
            "full_name",
            "birth_date",
            "nationality",
            "blood_type",
            "emergency_contact_name",
            "emergency_contact_phone",
            "created_at",
        ]
        read_only_fields = ("id", "created_at", "full_name")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["reservation"].queryset = Reservation.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_document_number(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El numero de documento es obligatorio.")
        return value

    def validate_first_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_last_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("El apellido es obligatorio.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        reservation = attrs.get("reservation", getattr(self.instance, "reservation", None))
        document_type = attrs.get("document_type", getattr(self.instance, "document_type", None))
        document_number = attrs.get("document_number", getattr(self.instance, "document_number", None))

        if reservation is None:
            raise serializers.ValidationError({
                "reservation": "La reserva es obligatoria."
            })

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError({
                    "reservation": "El usuario autenticado no tiene un hotel asignado."
                })

            if reservation.hotel_settings_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "reservation": "La reserva no pertenece al hotel del usuario autenticado."
                })

        qs = ReservationGuest.objects.filter(
            reservation=reservation,
            document_type=document_type,
            document_number=document_number,
        )

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if document_type and document_number and qs.exists():
            raise serializers.ValidationError({
                "document_number": "Ya existe un huesped con ese documento en esta reserva."
            })

        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            instance = super().create(validated_data)
            try:
                sync_reservation_room_pricing_and_occupancy(instance.reservation)
            except Exception as exc:
                raise serializers.ValidationError(_as_serializer_error(exc))
            return instance

    def update(self, instance, validated_data):
        with transaction.atomic():
            updated = super().update(instance, validated_data)
            try:
                sync_reservation_room_pricing_and_occupancy(updated.reservation)
            except Exception as exc:
                raise serializers.ValidationError(_as_serializer_error(exc))
            return updated


class ReservationDepositSerializer(serializers.Serializer):
    """
    Compatibility serializer:
    mantiene el contrato de reservation-deposits pero persiste en billing.Payment.
    """

    id = serializers.IntegerField(read_only=True)
    reservation = serializers.PrimaryKeyRelatedField(
        queryset=Reservation.objects.all(),
        required=True,
        write_only=True,
    )
    deposit_date = serializers.DateField(required=False, allow_null=True, write_only=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_method = serializers.PrimaryKeyRelatedField(
        queryset=MasterData.objects.filter(group=MasterData.Group.PAYMENT_METHOD, is_active=True),
        required=True,
    )
    payment_method_name = serializers.CharField(source="payment_method.name", read_only=True)
    payment_method_code = serializers.CharField(source="payment_method.code", read_only=True)
    reference = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.PrimaryKeyRelatedField(
        queryset=MasterData.objects.filter(
            group=MasterData.Group.RESERVATION_DEPOSIT_STATUS,
            is_active=True,
        ),
        required=False,
        allow_null=True,
        write_only=True,
    )
    status_name = serializers.SerializerMethodField(read_only=True)
    status_code = serializers.SerializerMethodField(read_only=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["reservation"].queryset = Reservation.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Deposit amount must be greater than zero.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        user = getattr(request, "user", None)

        reservation = attrs.get("reservation")
        if reservation is None:
            reservation = getattr(getattr(self.instance, "invoice", None), "reservation", None)

        if reservation is None:
            raise serializers.ValidationError({
                "reservation": "Reservation is required."
            })

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError({
                    "reservation": "El usuario autenticado no tiene un hotel asignado."
                })

            if reservation.hotel_settings_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "reservation": "La reserva no pertenece al hotel del usuario autenticado."
                })

        amount = attrs.get("amount", getattr(self.instance, "amount", None))
        exclude_payment_id = getattr(self.instance, "id", None)

        errors = validate_reservation_deposit_rules(
            reservation,
            amount,
            exclude_payment_id=exclude_payment_id,
        )
        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def _get_cached_status(self, code: str):
        cache = getattr(self, "_deposit_status_cache", None)
        if cache is None:
            cache = {}
            self._deposit_status_cache = cache

        normalized_code = str(code or "").strip().upper()
        if normalized_code not in cache:
            cache[normalized_code] = (
                MasterData.objects.filter(
                    group=MasterData.Group.RESERVATION_DEPOSIT_STATUS,
                    code=normalized_code,
                    is_active=True,
                )
                .only("id", "name", "code")
                .first()
            )
        return cache[normalized_code]

    def _resolve_output_status(self, payment):
        status_cache = getattr(self, "_payment_status_cache", None)
        if status_cache is None:
            status_cache = {}
            self._payment_status_cache = status_cache

        cache_key = getattr(payment, "pk", None)
        if cache_key in status_cache:
            return status_cache[cache_key]

        if not getattr(payment, "is_active", True):
            status_obj = self._get_cached_status("RECHAZADO")
            if status_obj:
                status_cache[cache_key] = status_obj
                return status_obj

        refunds_manager = getattr(payment, "refunds", None)
        refunds = refunds_manager.all() if refunds_manager is not None else []
        for refund in refunds:
            if not getattr(refund, "is_active", True):
                continue
            refund_status_code = str(
                getattr(getattr(refund, "status", None), "code", "")
                or getattr(refund, "status_code", "")
            ).strip().upper()
            if refund_status_code == "PENDIENTE":
                status_obj = self._get_cached_status("PENDIENTE")
                if status_obj:
                    status_cache[cache_key] = status_obj
                    return status_obj

        status_obj = self._get_cached_status("VALIDADO")
        status_cache[cache_key] = status_obj
        return status_obj

    def get_status_name(self, obj):
        status_obj = self._resolve_output_status(obj)
        return getattr(status_obj, "name", None)

    def get_status_code(self, obj):
        status_obj = self._resolve_output_status(obj)
        return getattr(status_obj, "code", None)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation["reservation"] = getattr(
            getattr(instance, "invoice", None),
            "reservation_id",
            None,
        )

        payment_date = getattr(instance, "payment_date", None)
        representation["deposit_date"] = payment_date.date().isoformat() if payment_date else None

        status_obj = self._resolve_output_status(instance)
        representation["status"] = getattr(status_obj, "id", None)

        return representation

    def _lock_reservation(
        self,
        reservation_id: int,
        *,
        expected_hotel_settings_id: int | None = None,
    ):
        queryset = (
            Reservation.objects.select_related("status", "hotel_settings")
            .prefetch_related(
                "rooms_detail",
                "charges",
                "invoices__payments__refunds__status",
            )
            .select_for_update()
        )
        if expected_hotel_settings_id is not None:
            queryset = queryset.filter(hotel_settings_id=expected_hotel_settings_id)

        reservation = queryset.filter(pk=reservation_id).first()
        if reservation is None:
            raise serializers.ValidationError(
                {"reservation": "La reserva no existe o no pertenece al hotel esperado."}
            )
        return reservation

    @staticmethod
    def _apply_payment_date(payment, deposit_date):
        if not payment or not deposit_date:
            return

        target_datetime = datetime.combine(deposit_date, time(0, 0))
        if timezone.is_naive(target_datetime):
            target_datetime = timezone.make_aware(
                target_datetime,
                timezone.get_current_timezone(),
            )

        Payment.objects.filter(pk=payment.pk).update(payment_date=target_datetime)
        payment.payment_date = target_datetime

    def create(self, validated_data):
        reservation = validated_data.pop("reservation")
        amount = validated_data["amount"]
        deposit_date = validated_data.pop("deposit_date", None)
        validated_data.pop("status", None)

        with transaction.atomic():
            locked_reservation = self._lock_reservation(
                reservation.pk,
                expected_hotel_settings_id=reservation.hotel_settings_id,
            )

            errors = validate_reservation_deposit_rules(
                locked_reservation,
                amount,
            )
            if errors:
                raise serializers.ValidationError(errors)

            invoice = ensure_default_invoice_for_reservation(
                locked_reservation.id,
                expected_hotel_settings_id=locked_reservation.hotel_settings_id,
            )
            if invoice is None:
                raise serializers.ValidationError(
                    {"reservation": "No fue posible obtener la factura activa de la reserva."}
                )

            payment = Payment.objects.create(
                invoice=invoice,
                payment_method=validated_data["payment_method"],
                amount=amount,
                reference=validated_data.get("reference"),
                notes=validated_data.get("notes"),
                is_active=True,
            )
            self._apply_payment_date(payment, deposit_date)
            return payment

    def update(self, instance, validated_data):
        reservation = validated_data.pop(
            "reservation",
            getattr(getattr(instance, "invoice", None), "reservation", None),
        )
        amount = validated_data.get("amount", instance.amount)
        deposit_date = validated_data.pop("deposit_date", None)
        validated_data.pop("status", None)

        if reservation is None:
            raise serializers.ValidationError({"reservation": "Reservation is required."})

        with transaction.atomic():
            locked_reservation = self._lock_reservation(
                reservation.pk,
                expected_hotel_settings_id=reservation.hotel_settings_id,
            )

            errors = validate_reservation_deposit_rules(
                locked_reservation,
                amount,
                exclude_payment_id=instance.id,
            )
            if errors:
                raise serializers.ValidationError(errors)

            target_invoice = instance.invoice
            if getattr(target_invoice, "reservation_id", None) != locked_reservation.id:
                target_invoice = ensure_default_invoice_for_reservation(
                    locked_reservation.id,
                    expected_hotel_settings_id=locked_reservation.hotel_settings_id,
                )
                if target_invoice is None:
                    raise serializers.ValidationError(
                        {"reservation": "No fue posible obtener la factura activa de la reserva."}
                    )

            instance.invoice = target_invoice
            if "payment_method" in validated_data:
                instance.payment_method = validated_data["payment_method"]
            if "amount" in validated_data:
                instance.amount = validated_data["amount"]
            if "reference" in validated_data:
                instance.reference = validated_data["reference"]
            if "notes" in validated_data:
                instance.notes = validated_data["notes"]
            instance.save()
            self._apply_payment_date(instance, deposit_date)
            return instance


class ReservationBusinessRulesMixin:
    def _get_business_rules(self, obj):
        if not hasattr(self, "_business_rules_cache"):
            self._business_rules_cache = {}

        cache_key = getattr(obj, "pk", None)
        if cache_key in self._business_rules_cache:
            return self._business_rules_cache[cache_key]

        financials = get_reservation_financials(obj)
        payment = get_reservation_payment_status(obj, financials=financials)
        flow = get_reservation_flow_permissions(obj)

        values = {
            "rooms_subtotal": financials["rooms_subtotal"],
            "package_subtotal": financials["package_subtotal"],
            "additional_charges_total": financials["additional_charges_total"],
            "total_deposits": financials["total_deposits"],
            "total_amount": financials["total_amount"],
            "pending_amount": financials["pending_amount"],
            "payment_status_code": payment["code"],
            "payment_status_label": payment["label"],
            "can_add_payment": can_add_payment_to_reservation(obj, financials=financials),
            **flow,
        }
        self._business_rules_cache[cache_key] = values
        return values

    def get_rooms_subtotal(self, obj):
        return self._get_business_rules(obj)["rooms_subtotal"]

    def get_package_subtotal(self, obj):
        return self._get_business_rules(obj)["package_subtotal"]

    def get_additional_charges_total(self, obj):
        return self._get_business_rules(obj)["additional_charges_total"]

    def get_total_deposits(self, obj):
        return self._get_business_rules(obj)["total_deposits"]

    def get_total_amount(self, obj):
        return self._get_business_rules(obj)["total_amount"]

    def get_pending_amount(self, obj):
        return self._get_business_rules(obj)["pending_amount"]

    def get_payment_status_code(self, obj):
        return self._get_business_rules(obj)["payment_status_code"]

    def get_payment_status_label(self, obj):
        return self._get_business_rules(obj)["payment_status_label"]

    def get_can_add_payment(self, obj):
        return self._get_business_rules(obj)["can_add_payment"]

    def get_can_confirm(self, obj):
        return self._get_business_rules(obj)["can_confirm"]

    def get_can_check_in(self, obj):
        return self._get_business_rules(obj)["can_check_in"]

    def get_can_check_out(self, obj):
        return self._get_business_rules(obj)["can_check_out"]

    def get_can_cancel(self, obj):
        return self._get_business_rules(obj)["can_cancel"]


class ReservationListSerializer(ReservationBusinessRulesMixin, serializers.ModelSerializer):
    client_full_name = serializers.CharField(source="client.full_name", read_only=True)
    client_document_number = serializers.CharField(source="client.document_number", read_only=True)
    status_name = serializers.CharField(source="status.name", read_only=True)
    status_code = serializers.CharField(source="status.code", read_only=True)
    origin_name = serializers.CharField(source="origin.name", read_only=True)
    origin_code = serializers.CharField(source="origin.code", read_only=True)
    package_catalog_name = serializers.CharField(source="package.name", read_only=True)
    package_display_name = serializers.CharField(read_only=True)
    total_rooms = serializers.IntegerField(read_only=True)
    total_guests = serializers.IntegerField(read_only=True)
    total_nights = serializers.IntegerField(read_only=True)
    policies = ReservationPolicySummarySerializer(many=True, read_only=True)
    rooms_subtotal = serializers.SerializerMethodField()
    package_subtotal = serializers.SerializerMethodField()
    additional_charges_total = serializers.SerializerMethodField()
    total_deposits = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    pending_amount = serializers.SerializerMethodField()
    payment_status_code = serializers.SerializerMethodField()
    payment_status_label = serializers.SerializerMethodField()
    can_add_payment = serializers.SerializerMethodField()
    can_confirm = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()
    can_check_out = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            "id",
            "client",
            "client_full_name",
            "client_document_number",
            "status",
            "status_name",
            "status_code",
            "origin",
            "origin_name",
            "origin_code",
            "package",
            "package_name",
            "package_catalog_name",
            "package_display_name",
            "package_price",
            "expected_check_in",
            "expected_check_out",
            "real_check_in",
            "real_check_out",
            "promo_code",
            "total_discount",
            "notes",
            "policies",
            "total_rooms",
            "total_guests",
            "total_nights",
            "rooms_subtotal",
            "package_subtotal",
            "additional_charges_total",
            "total_deposits",
            "total_amount",
            "pending_amount",
            "payment_status_code",
            "payment_status_label",
            "can_add_payment",
            "can_confirm",
            "can_check_in",
            "can_check_out",
            "can_cancel",
            "created_by",
            "created_at",
        ]
        read_only_fields = (
            "id",
            "client_full_name",
            "client_document_number",
            "status_name",
            "status_code",
            "origin_name",
            "origin_code",
            "package_name",
            "package_catalog_name",
            "package_display_name",
            "package_price",
            "total_rooms",
            "total_guests",
            "total_nights",
            "rooms_subtotal",
            "package_subtotal",
            "additional_charges_total",
            "total_deposits",
            "total_amount",
            "pending_amount",
            "payment_status_code",
            "payment_status_label",
            "can_add_payment",
            "can_confirm",
            "can_check_in",
            "can_check_out",
            "can_cancel",
            "created_at",
        )


class ReservationDetailSerializer(ReservationBusinessRulesMixin, serializers.ModelSerializer):
    client_full_name = serializers.CharField(source="client.full_name", read_only=True)
    client_document_number = serializers.CharField(source="client.document_number", read_only=True)
    client_email = serializers.EmailField(source="client.email", read_only=True)
    client_phone = serializers.CharField(source="client.phone", read_only=True)

    status_name = serializers.CharField(source="status.name", read_only=True)
    status_code = serializers.CharField(source="status.code", read_only=True)
    origin_name = serializers.CharField(source="origin.name", read_only=True)
    origin_code = serializers.CharField(source="origin.code", read_only=True)
    package_catalog_name = serializers.CharField(source="package.name", read_only=True)
    package_display_name = serializers.CharField(read_only=True)

    rooms_detail = ReservationRoomSerializer(many=True, read_only=True)
    guests = ReservationGuestSerializer(many=True, read_only=True)
    deposits = serializers.SerializerMethodField()
    policies = ReservationPolicySummarySerializer(many=True, read_only=True)

    total_rooms = serializers.IntegerField(read_only=True)
    total_guests = serializers.IntegerField(read_only=True)
    total_nights = serializers.IntegerField(read_only=True)
    rooms_subtotal = serializers.SerializerMethodField()
    package_subtotal = serializers.SerializerMethodField()
    additional_charges_total = serializers.SerializerMethodField()
    total_deposits = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    pending_amount = serializers.SerializerMethodField()
    payment_status_code = serializers.SerializerMethodField()
    payment_status_label = serializers.SerializerMethodField()
    can_add_payment = serializers.SerializerMethodField()
    can_confirm = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()
    can_check_out = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            "id",
            "client",
            "client_full_name",
            "client_document_number",
            "client_email",
            "client_phone",
            "status",
            "status_name",
            "status_code",
            "origin",
            "origin_name",
            "origin_code",
            "package",
            "package_name",
            "package_catalog_name",
            "package_display_name",
            "package_price",
            "expected_check_in",
            "expected_check_out",
            "real_check_in",
            "real_check_out",
            "promo_code",
            "total_discount",
            "notes",
            "policies",
            "total_rooms",
            "total_guests",
            "total_nights",
            "rooms_subtotal",
            "package_subtotal",
            "additional_charges_total",
            "total_deposits",
            "total_amount",
            "pending_amount",
            "payment_status_code",
            "payment_status_label",
            "can_add_payment",
            "can_confirm",
            "can_check_in",
            "can_check_out",
            "can_cancel",
            "rooms_detail",
            "guests",
            "deposits",
            "created_by",
            "created_at",
        ]
        read_only_fields = (
            "id",
            "client_full_name",
            "client_document_number",
            "client_email",
            "client_phone",
            "status_name",
            "status_code",
            "origin_name",
            "origin_code",
            "package_name",
            "package_catalog_name",
            "package_display_name",
            "package_price",
            "total_rooms",
            "total_guests",
            "total_nights",
            "rooms_subtotal",
            "package_subtotal",
            "additional_charges_total",
            "total_deposits",
            "total_amount",
            "pending_amount",
            "payment_status_code",
            "payment_status_label",
            "can_add_payment",
            "can_confirm",
            "can_check_in",
            "can_check_out",
            "can_cancel",
            "policies",
            "rooms_detail",
            "guests",
            "deposits",
            "created_at",
        )


    def get_deposits(self, obj):
        payments = (
            Payment.objects.filter(
                invoice__reservation=obj,
                invoice__is_active=True,
                is_active=True,
            )
            .select_related("invoice", "payment_method")
            .prefetch_related("refunds__status")
            .order_by("-id")
        )
        return ReservationDepositSerializer(
            payments,
            many=True,
            context=self.context,
        ).data

class ReservationWriteSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    tenant_field_name = "hotel_settings"

    hotel_settings = serializers.PrimaryKeyRelatedField(
        queryset=HotelSettings.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(),
        required=True,
    )
    package = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.all(),
        required=False,
        allow_null=True,
    )
    policies = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=ReservationPolicy.objects.filter(is_active=True),
        required=False,
    )

    class Meta:
        model = Reservation
        fields = [
            "id",
            "hotel_settings",
            "client",
            "status",
            "origin",
            "package",
            "package_name",
            "package_price",
            "policies",
            "expected_check_in",
            "expected_check_out",
            "real_check_in",
            "real_check_out",
            "promo_code",
            "total_discount",
            "notes",
            "created_by",
            "created_at",
        ]
        read_only_fields = (
            "id",
            "created_at",
            "status",
            "real_check_in",
            "real_check_out",
            "package_name",
            "package_price",
        )

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["client"].queryset = Client.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["package"].queryset = Package.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )
            fields["policies"].child_relation.queryset = ReservationPolicy.objects.filter(
                hotel_settings_id=user.hotel_settings_id,
                is_active=True,
            )

        return fields

    def validate_package(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError("The selected package is inactive.")
        return value

    @staticmethod
    def _validate_package_dates(package, check_in, check_out):
        if not package:
            return None

        if package.start_date and check_in and check_in < package.start_date:
            return "The selected package is not available for the expected check-in date."

        if package.end_date and check_out and check_out > package.end_date:
            return "The selected package is not available for the expected check-out date."

        return None

    @staticmethod
    def _build_package_snapshot(package):
        if not package:
            return {
                "package_name": "",
                "package_price": 0,
            }

        return {
            "package_name": package.name,
            "package_price": package.base_price,
        }

    def validate(self, attrs):
        attrs.pop("status", None)
        attrs.pop("real_check_in", None)
        attrs.pop("real_check_out", None)

        if self.instance and getattr(self.instance, "real_check_in", None) is not None:
            raise serializers.ValidationError(
                {"reservation": "No puedes editar una reserva que ya tiene check-in registrado."}
            )

        client = attrs.get("client", getattr(self.instance, "client", None))

        # Permite inferir hotel desde el cliente cuando superadmin no lo manda explícito.
        if attrs.get("hotel_settings") is None and client is not None:
            attrs["hotel_settings"] = getattr(client, "hotel_settings", None)

        hotel = self.require_target_tenant(attrs)

        expected_check_in = attrs.get(
            "expected_check_in",
            getattr(self.instance, "expected_check_in", None),
        )
        expected_check_out = attrs.get(
            "expected_check_out",
            getattr(self.instance, "expected_check_out", None),
        )
        real_check_in = attrs.get(
            "real_check_in",
            getattr(self.instance, "real_check_in", None),
        )
        real_check_out = attrs.get(
            "real_check_out",
            getattr(self.instance, "real_check_out", None),
        )
        total_discount = attrs.get(
            "total_discount",
            getattr(self.instance, "total_discount", 0),
        )
        package = attrs.get("package", getattr(self.instance, "package", None))
        policies = attrs.get("policies", None)

        errors = {}

        if client and client.hotel_settings_id != hotel.id:
            errors["client"] = "El cliente no pertenece al mismo hotel de la reserva."

        if package and package.hotel_settings_id != hotel.id:
            errors["package"] = "El paquete no pertenece al mismo hotel de la reserva."

        if policies is not None:
            invalid_policies = [policy.id for policy in policies if policy.hotel_settings_id != hotel.id]
            if invalid_policies:
                errors["policies"] = "Una o mas politicas no pertenecen al mismo hotel de la reserva."

        if expected_check_in and expected_check_out:
            if expected_check_out <= expected_check_in:
                errors["expected_check_out"] = "Expected check-out must be later than expected check-in."

        if real_check_out and not real_check_in:
            errors["real_check_out"] = "Real check-out cannot be registered without a real check-in."

        if real_check_in and real_check_out and real_check_out < real_check_in:
            errors["real_check_out"] = "Real check-out cannot be earlier than real check-in."

        if total_discount is not None and total_discount < 0:
            errors["total_discount"] = "Total discount cannot be negative."

        package_date_error = self._validate_package_dates(
            package,
            expected_check_in,
            expected_check_out,
        )
        if package_date_error:
            errors["package"] = package_date_error

        if self.instance and expected_check_in and expected_check_out:
            room_conflicts = []
            reservation_rooms = self.instance.rooms_detail.select_related(
                "room",
                "room__floor",
            ).all()

            for reservation_room in reservation_rooms:
                conflict = find_overlapping_reservation_room(
                    room_id=reservation_room.room_id,
                    expected_check_in=expected_check_in,
                    expected_check_out=expected_check_out,
                    exclude_reservation_id=self.instance.id,
                )
                if conflict:
                    conflict_reservation = conflict.reservation
                    room_conflicts.append(
                        (
                            f"Room {reservation_room.room.number} conflicts with reservation "
                            f"#{conflict_reservation.id} "
                            f"({conflict_reservation.expected_check_in} to "
                            f"{conflict_reservation.expected_check_out})."
                        )
                    )

            if room_conflicts:
                errors["rooms_detail"] = room_conflicts

            if package:
                package_conflicts = []
                for reservation_room in reservation_rooms:
                    room = reservation_room.room
                    room_hotel_id = getattr(getattr(room, "floor", None), "hotel_settings_id", None)

                    if room_hotel_id and room_hotel_id != hotel.id:
                        package_conflicts.append(
                            f"Room {room.number} belongs to a different hotel than the reservation."
                        )
                        continue

                    if room_hotel_id and package.hotel_settings_id != room_hotel_id:
                        package_conflicts.append(
                            f"Room {room.number} belongs to a different hotel than the selected package."
                        )
                        continue

                    if package.room_type_id and room.room_type_id != package.room_type_id:
                        package_conflicts.append(
                            f"Room {room.number} is not compatible with package room type '{package.room_type.name}'."
                        )

                if package_conflicts:
                    errors["package"] = package_conflicts

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        policies = validated_data.pop("policies", None)
        package = validated_data.get("package")

        validated_data.pop("status", None)
        validated_data["real_check_in"] = None
        validated_data["real_check_out"] = None

        self.assign_target_tenant(validated_data)
        validated_data.update(self._build_package_snapshot(package))

        pending_status = get_pending_reservation_status()
        if not pending_status:
            expected_codes = ", ".join(RESERVATION_STATUS_PENDING_CODES)
            raise serializers.ValidationError(
                {
                    "status": (
                        f"No existe un estado activo de pendiente ({expected_codes}) "
                        f"en {MasterData.Group.RESERVATION_STATUS}."
                    )
                }
            )

        validated_data["status"] = pending_status
        reservation = super().create(validated_data)

        if policies is not None:
            reservation.policies.set(policies)

        return reservation

    def update(self, instance, validated_data):
        policies = validated_data.pop("policies", None)
        validated_data.pop("status", None)
        validated_data.pop("real_check_in", None)
        validated_data.pop("real_check_out", None)

        self.assign_target_tenant(validated_data)

        if "package" in validated_data:
            package = validated_data.get("package")
            validated_data.update(self._build_package_snapshot(package))

        reservation = super().update(instance, validated_data)

        if policies is not None:
            reservation.policies.set(policies)

        return reservation

class ReservationInventoryCheckSerializer(serializers.ModelSerializer):
    reservation_id = serializers.IntegerField(source="reservation.id", read_only=True)
    reservation_status = serializers.CharField(source="reservation.status.code", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ReservationInventoryCheck
        fields = [
            "id",
            "reservation",
            "reservation_id",
            "check_type",
            "created_by",
            "created_by_username",
            "notes",
            "created_at",
            "reservation_status",
        ]
        read_only_fields = ("id", "created_at", "created_by")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["reservation"].queryset = Reservation.objects.filter(
                hotel_settings_id=user.hotel_settings_id
            )

        return fields

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        reservation = attrs.get("reservation", getattr(self.instance, "reservation", None))
        if reservation is None:
            raise serializers.ValidationError({
                "reservation": "La reserva es obligatoria."
            })

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError({
                    "reservation": "El usuario autenticado no tiene un hotel asignado."
                })

            if reservation.hotel_settings_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "reservation": "La reserva no pertenece al hotel del usuario autenticado."
                })

        return attrs

class ReservationInventoryCheckLineSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.number", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)
    check_type = serializers.CharField(source="inventory_check.check_type", read_only=True)

    class Meta:
        model = ReservationInventoryCheckLine
        fields = [
            "id",
            "inventory_check",
            "reservation_room",
            "room",
            "room_number",
            "item",
            "item_name",
            "expected_quantity",
            "reviewed_quantity",
            "difference_quantity",
            "notes",
            "created_at",
            "check_type",
        ]
        read_only_fields = ("id", "created_at", "difference_quantity", "check_type")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated and not is_effective_global_admin(user) and user.hotel_settings_id:
            fields["inventory_check"].queryset = ReservationInventoryCheck.objects.filter(
                reservation__hotel_settings_id=user.hotel_settings_id
            )
            fields["reservation_room"].queryset = ReservationRoom.objects.filter(
                reservation__hotel_settings_id=user.hotel_settings_id
            )
            fields["room"].queryset = Room.objects.filter(
                floor__hotel_settings_id=user.hotel_settings_id
            )

            # Si Item ya es tenantizado, restringe también aquí.
            if "item" in fields and hasattr(fields["item"].queryset.model, "hotel_settings_id"):
                fields["item"].queryset = Item.objects.filter(
                    hotel_settings_id=user.hotel_settings_id
                )

        return fields

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        inventory_check = attrs.get("inventory_check", getattr(self.instance, "inventory_check", None))
        reservation_room = attrs.get("reservation_room", getattr(self.instance, "reservation_room", None))
        room = attrs.get("room", getattr(self.instance, "room", None))
        item = attrs.get("item", getattr(self.instance, "item", None))

        if inventory_check is None:
            raise serializers.ValidationError({
                "inventory_check": "El inventario de reserva es obligatorio."
            })

        if room is None:
            raise serializers.ValidationError({
                "room": "La habitacion es obligatoria."
            })

        reservation = inventory_check.reservation
        reservation_hotel_id = reservation.hotel_settings_id
        room_hotel_id = getattr(getattr(room, "floor", None), "hotel_settings_id", None)

        if room_hotel_id and reservation_hotel_id and room_hotel_id != reservation_hotel_id:
            raise serializers.ValidationError({
                "room": "La habitacion no pertenece al mismo hotel del control de inventario."
            })

        if reservation_room is not None:
            if reservation_room.reservation_id != reservation.id:
                raise serializers.ValidationError({
                    "reservation_room": "La habitacion de reserva no pertenece a la misma reserva del control."
                })

            if reservation_room.room_id != room.id:
                raise serializers.ValidationError({
                    "reservation_room": "La habitacion de reserva no coincide con la habitacion seleccionada."
                })

        if user and user.is_authenticated and not is_effective_global_admin(user):
            if user.hotel_settings_id is None:
                raise serializers.ValidationError({
                    "inventory_check": "El usuario autenticado no tiene un hotel asignado."
                })

            if reservation_hotel_id != user.hotel_settings_id:
                raise serializers.ValidationError({
                    "inventory_check": "El control de inventario no pertenece al hotel del usuario autenticado."
                })

        # Si Item tiene hotel_settings, validarlo también.
        if item is not None and hasattr(item, "hotel_settings_id"):
            item_hotel_id = getattr(item, "hotel_settings_id", None)
            if item_hotel_id and reservation_hotel_id and item_hotel_id != reservation_hotel_id:
                raise serializers.ValidationError({
                    "item": "El item no pertenece al mismo hotel del control de inventario."
                })

        return attrs
