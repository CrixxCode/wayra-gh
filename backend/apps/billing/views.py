import re
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Q
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.billing.models import Charge, Invoice, InvoiceCharge, Payment, PaymentRefund, CreditNote
from apps.billing.pdf_generator import build_invoice_pdf
from apps.billing.serializers import (
    ChargeSerializer,
    InvoiceSerializer,
    InvoiceChargeSerializer,
    PaymentSerializer,
    PaymentRefundSerializer,
    CreditNoteSerializer,
)
from apps.billing.services import (
    get_or_create_default_charge_type,
    get_or_create_default_payment_refund_status,
)
from apps.inventory.models import InventoryMovement, Item
from apps.inventory.services import get_or_create_inventory_movement_type
from apps.reservations.models import Reservation
from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin


class ChargeViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Charge.objects.select_related(
            "reservation",
            "reservation__hotel_settings",
            "charge_type",
            "service",
            "package",
        )
    )
    tenant_filter = "reservation__hotel_settings"
    serializer_class = ChargeSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["charges.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["reservation", "charge_type", "service", "package", "is_active", "is_automatic"]
    search_fields = [
        "description",
        "reservation__id",
        "charge_type__name",
        "charge_type__code",
        "service__name",
        "package__name",
        "automation_key",
    ]
    ordering_fields = [
        "id",
        "quantity",
        "unit_price",
        "total_amount",
        "charge_date",
        "is_automatic",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.filter(
            Q(service__isnull=True) | Q(service__hotel_settings_id=F("reservation__hotel_settings_id")),
            Q(package__isnull=True) | Q(package__hotel_settings_id=F("reservation__hotel_settings_id")),
        ).order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["charges.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @staticmethod
    def _is_checked_out_reservation(reservation) -> bool:
        if reservation is None:
            return False
        if getattr(reservation, "real_check_out", None) is not None:
            return True

        status_code = str(getattr(reservation, "status_code", "") or "").strip().upper()
        return status_code in {
            "FINALIZADA",
            "FINALIZADO",
            "CHECKED_OUT",
            "FINISHED",
            "COMPLETADA",
            "COMPLETADO",
        }

    def _ensure_charge_mutation_allowed(self, reservation):
        if self._is_checked_out_reservation(reservation):
            raise ValidationError(
                {
                    "reservation": "No puedes agregar o modificar cargos en una reserva finalizada. Solo se permiten pagos."
                }
            )

    def _ensure_reservation_tenant_access(self, reservation):
        user = self.request.user
        if not user.is_authenticated:
            raise PermissionDenied("Debes autenticarte.")
        if is_effective_global_admin(user):
            return
        if user.hotel_settings_id is None:
            raise PermissionDenied("El usuario autenticado no tiene un hotel asignado.")
        if reservation.hotel_settings_id != user.hotel_settings_id:
            raise PermissionDenied("La reserva no pertenece al hotel del usuario autenticado.")

    def _ensure_item_tenant_access(self, item):
        user = self.request.user
        if not user.is_authenticated:
            raise PermissionDenied("Debes autenticarte.")
        if is_effective_global_admin(user):
            return
        if user.hotel_settings_id is None:
            raise PermissionDenied("El usuario autenticado no tiene un hotel asignado.")
        if item.hotel_settings_id != user.hotel_settings_id:
            raise PermissionDenied("El item no pertenece al hotel del usuario autenticado.")

    def perform_create(self, serializer):
        reservation = serializer.validated_data.get("reservation")
        self._ensure_reservation_tenant_access(reservation)
        self._ensure_charge_mutation_allowed(reservation)
        serializer.save()

    def perform_update(self, serializer):
        reservation = serializer.validated_data.get(
            "reservation",
            getattr(serializer.instance, "reservation", None),
        )
        self._ensure_reservation_tenant_access(reservation)
        self._ensure_charge_mutation_allowed(reservation)
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_reservation_tenant_access(getattr(instance, "reservation", None))
        self._ensure_charge_mutation_allowed(getattr(instance, "reservation", None))
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"], url_path="pos-batch")
    def pos_batch(self, request):
        raw_reservation = request.data.get("reservation")
        raw_lines = request.data.get("lines")
        raw_reference = request.data.get("reference")
        raw_charge_type_code = request.data.get("charge_type_code")

        reservation_id = self._parse_positive_int(
            raw_reservation,
            field_name="reservation",
        )
        if reservation_id is None:
            raise ValidationError({"reservation": "Debes enviar una reserva valida."})

        if not isinstance(raw_lines, list) or not raw_lines:
            raise ValidationError(
                {"lines": "Debes enviar al menos una linea de consumo para registrar."}
            )

        charge_type_code = str(raw_charge_type_code or "BAR").strip().upper() or "BAR"
        charge_type = get_or_create_default_charge_type(charge_type_code)
        if not charge_type:
            raise ValidationError(
                {"charge_type_code": "No fue posible resolver el tipo de cargo para POS."}
            )

        movement_type = get_or_create_inventory_movement_type(
            "OUT",
            "Salida de inventario",
            sort_order=1,
        )
        if not movement_type:
            raise ValidationError(
                {"movement_type": "No fue posible resolver el tipo de movimiento de inventario OUT."}
            )

        reference = str(raw_reference or "").strip()
        operation_reference = reference or self._build_operation_reference(reservation_id)

        with transaction.atomic():
            reservation_queryset = Reservation.objects.select_for_update().filter(id=reservation_id)
            if (
                not is_effective_global_admin(request.user)
                and request.user.hotel_settings_id is not None
            ):
                reservation_queryset = reservation_queryset.filter(
                    hotel_settings_id=request.user.hotel_settings_id
                )
            reservation = reservation_queryset.first()
            if not reservation:
                raise ValidationError({"reservation": "La reserva indicada no existe."})

            self._ensure_reservation_tenant_access(reservation)
            self._ensure_charge_mutation_allowed(reservation)

            created_charges: list[Charge] = []
            total_amount = Decimal("0.00")

            for index, raw_line in enumerate(raw_lines, start=1):
                if not isinstance(raw_line, dict):
                    raise ValidationError(
                        {"lines": f"La linea {index} no tiene un formato valido."}
                    )

                item_id = self._parse_positive_int(
                    raw_line.get("item"),
                    field_name="item",
                    line_number=index,
                )
                if item_id is None:
                    raise ValidationError(
                        {"lines": f"La linea {index} debe incluir un item valido."}
                    )

                quantity = self._parse_positive_int(
                    raw_line.get("quantity"),
                    field_name="quantity",
                    line_number=index,
                )
                if quantity is None:
                    raise ValidationError(
                        {"lines": f"La linea {index} debe incluir una cantidad mayor o igual a 1."}
                    )

                item_queryset = Item.objects.select_for_update().filter(
                    id=item_id,
                    is_active=True,
                )
                if (
                    not is_effective_global_admin(request.user)
                    and request.user.hotel_settings_id is not None
                ):
                    item_queryset = item_queryset.filter(
                        hotel_settings_id=request.user.hotel_settings_id
                    )
                item = item_queryset.first()
                if not item:
                    raise ValidationError(
                        {"lines": f"La linea {index} referencia un item inactivo o inexistente."}
                    )

                self._ensure_item_tenant_access(item)

                available_stock = int(item.stock or 0)
                if quantity > available_stock:
                    raise ValidationError(
                        {
                            "lines": (
                                f"La linea {index} excede el stock disponible para "
                                f"{item.name} (disponible: {available_stock})."
                            )
                        }
                    )

                unit_price = self._parse_non_negative_decimal(
                    raw_line.get("unit_price"),
                    default=item.sale_price,
                    field_name="unit_price",
                    line_number=index,
                )
                description = str(raw_line.get("description") or "").strip()
                if not description:
                    description = f"Consumo bar/mini tienda: {item.name}"

                movement_notes = str(raw_line.get("notes") or "").strip()
                if not movement_notes:
                    movement_notes = (
                        f"Salida por POS bar/mini tienda para reserva #{reservation.id}. "
                        f"Item: {item.name}."
                    )

                line_reference = f"{operation_reference}:{index}"

                InventoryMovement.objects.create(
                    item=item,
                    movement_type=movement_type,
                    quantity=quantity,
                    reference=line_reference,
                    notes=movement_notes,
                    is_active=True,
                )

                charge = Charge.objects.create(
                    reservation=reservation,
                    charge_type=charge_type,
                    service=None,
                    package=None,
                    description=description,
                    quantity=quantity,
                    unit_price=unit_price,
                    is_active=True,
                    is_automatic=False,
                )
                created_charges.append(charge)
                total_amount += charge.total_amount or Decimal("0.00")

            serialized_charges = ChargeSerializer(created_charges, many=True).data

        return Response(
            {
                "reservation": reservation_id,
                "reference": operation_reference,
                "charge_type_code": charge_type.code,
                "charges_created": len(created_charges),
                "total_amount": str(total_amount),
                "charges": serialized_charges,
            },
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _build_operation_reference(reservation_id: int) -> str:
        stamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
        return f"POS:{reservation_id}:{stamp}"

    @staticmethod
    def _parse_positive_int(value, *, field_name: str, line_number: int | None = None) -> int | None:
        if value is None or value == "":
            return None

        try:
            parsed = int(value)
        except (TypeError, ValueError):
            if line_number is None:
                raise ValidationError({field_name: f"El campo {field_name} debe ser numerico."})
            raise ValidationError(
                {"lines": f"La linea {line_number} debe incluir un {field_name} numerico."}
            )

        if parsed < 1:
            if line_number is None:
                raise ValidationError(
                    {field_name: f"El campo {field_name} debe ser mayor o igual a 1."}
                )
            raise ValidationError(
                {
                    "lines": (
                        f"La linea {line_number} debe incluir un {field_name} mayor o igual a 1."
                    )
                }
            )

        return parsed

    @staticmethod
    def _parse_non_negative_decimal(
        value,
        *,
        default,
        field_name: str,
        line_number: int,
    ) -> Decimal:
        candidate = default if value in (None, "") else value

        try:
            parsed = Decimal(str(candidate))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError(
                {"lines": f"La linea {line_number} incluye un {field_name} invalido."}
            )

        if parsed < 0:
            raise ValidationError(
                {"lines": f"La linea {line_number} no permite {field_name} negativo."}
            )

        return parsed


class InvoiceViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Invoice.objects.select_related(
            "reservation",
            "reservation__hotel_settings",
            "reservation__client",
            "reservation__origin",
            "status",
        )
        .prefetch_related(
            "invoice_charges__charge",
            "reservation__rooms_detail__room__floor__hotel_settings",
        )
    )
    tenant_filter = "reservation__hotel_settings"
    serializer_class = InvoiceSerializer
    permission_classes = [HasResourcePermission]
    required_scopes = ["invoices.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["reservation", "status", "is_active"]
    search_fields = [
        "invoice_number",
        "notes",
        "reservation__id",
        "status__name",
        "status__code",
    ]
    ordering_fields = [
        "id",
        "invoice_number",
        "issue_date",
        "subtotal",
        "tax_amount",
        "total_amount",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["invoices.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        charges = (
            Charge.objects.select_related("charge_type")
            .filter(
                reservation_id=invoice.reservation_id,
                is_active=True,
            )
            .filter(
                Q(service__isnull=True) | Q(service__hotel_settings_id=F("reservation__hotel_settings_id")),
                Q(package__isnull=True) | Q(package__hotel_settings_id=F("reservation__hotel_settings_id")),
            )
            .order_by("charge_date", "id")
        )
        payments = (
            Payment.objects.select_related("payment_method")
            .filter(invoice_id=invoice.id, is_active=True)
            .order_by("payment_date", "id")
        )
        credit_notes = (
            CreditNote.objects.select_related("status")
            .filter(invoice_id=invoice.id, is_active=True)
            .order_by("issue_date", "id")
        )

        try:
            pdf_content = build_invoice_pdf(
                invoice=invoice,
                charges=charges,
                payments=payments,
                credit_notes=credit_notes,
            )
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        base_name = invoice.invoice_number or f"FAC-{invoice.id}"
        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", base_name).strip("_") or f"FAC-{invoice.id}"
        response = HttpResponse(pdf_content, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}.pdf"'
        return response


class InvoiceChargeViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        InvoiceCharge.objects.select_related(
            "invoice",
            "invoice__reservation",
            "invoice__reservation__hotel_settings",
            "charge",
        )
    )
    tenant_filter = "invoice__reservation__hotel_settings"
    serializer_class = InvoiceChargeSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["invoices.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice", "charge"]
    search_fields = [
        "invoice__invoice_number",
        "charge__description",
        "invoice__reservation__id",
    ]
    ordering_fields = [
        "id",
        "created_at",
    ]
    ordering = ["id"]

    def get_base_queryset(self):
        return self.queryset.order_by("id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["invoices.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class PaymentViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Payment.objects.select_related(
            "invoice",
            "invoice__reservation",
            "invoice__reservation__hotel_settings",
            "payment_method",
        )
    )
    tenant_filter = "invoice__reservation__hotel_settings"
    serializer_class = PaymentSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["payments.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice", "payment_method", "is_active"]
    search_fields = [
        "invoice__invoice_number",
        "payment_method__name",
        "payment_method__code",
        "reference",
        "notes",
    ]
    ordering_fields = [
        "id",
        "amount",
        "payment_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["payments.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_update(self, serializer):
        requested_is_active = serializer.validated_data.get("is_active", None)
        current_is_active = bool(getattr(serializer.instance, "is_active", False))

        if (
            requested_is_active is False
            and current_is_active
            and not self._is_admin_user(self.request.user)
        ):
            raise PermissionDenied("Solo un administrador puede inactivar pagos.")

        serializer.save()

    @action(detail=True, methods=["post"], url_path="inactivate")
    def inactivate(self, request, pk=None):
        payment = self.get_object()
        if payment.is_active and not self._is_admin_user(request.user):
            raise PermissionDenied("Solo un administrador puede inactivar pagos.")

        if payment.is_active:
            payment.is_active = False
            payment.save(update_fields=["is_active"])

        serializer = self.get_serializer(payment)
        return Response(serializer.data)

    @staticmethod
    def _is_admin_user(user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if is_effective_global_admin(user):
            return True
        return user.roles.filter(
            slug__iexact="admin",
            is_active=True,
            userrole__is_active=True,
        ).exists()


class PaymentRefundViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        PaymentRefund.objects.select_related(
            "payment",
            "payment__invoice",
            "payment__invoice__reservation",
            "payment__invoice__reservation__hotel_settings",
            "payment__payment_method",
            "status",
        )
    )
    tenant_filter = "payment__invoice__reservation__hotel_settings"
    serializer_class = PaymentRefundSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["payments.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["payment", "status", "is_active"]
    search_fields = [
        "payment__invoice__invoice_number",
        "payment__reference",
        "reason",
        "reference",
        "notes",
        "status__name",
        "status__code",
    ]
    ordering_fields = [
        "id",
        "amount",
        "refund_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    allowed_transitions = {
        "PENDIENTE": {"APROBADO", "RECHAZADO", "ANULADO"},
        "APROBADO": {"PROCESADO", "ANULADO"},
        "PROCESADO": set(),
        "RECHAZADO": set(),
        "ANULADO": set(),
    }

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_queryset(self):
        queryset = super().get_queryset()
        invoice_id = self.request.query_params.get("invoice")
        if invoice_id is not None:
            try:
                invoice_id_value = int(invoice_id)
            except (TypeError, ValueError):
                return queryset.none()
            queryset = queryset.filter(payment__invoice_id=invoice_id_value)
        return queryset

    def get_required_scopes(self):
        if self.action == "create":
            return ["payments.read"]
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return ["payments.write"]
        if self.action in {"approve", "process", "reject", "cancel"}:
            return ["payments.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def perform_create(self, serializer):
        pending_status = get_or_create_default_payment_refund_status("PENDIENTE")
        if not pending_status:
            raise ValidationError({"status": "Unable to resolve default pending status."})
        serializer.save(status=pending_status)

    def perform_update(self, serializer):
        requested_status = serializer.validated_data.get("status")
        if requested_status and not self._is_admin_user(self.request.user):
            raise PermissionDenied("Solo un administrador puede cambiar el estado del reembolso.")
        serializer.save()

    @staticmethod
    def _is_admin_user(user) -> bool:
        if not user or not user.is_authenticated:
            return False
        if is_effective_global_admin(user):
            return True
        return user.roles.filter(
            slug__iexact="admin",
            is_active=True,
            userrole__is_active=True,
        ).exists()

    def _ensure_admin_approval(self):
        if not self._is_admin_user(self.request.user):
            raise PermissionDenied("Solo un administrador puede aprobar o rechazar reembolsos.")

    def _update_status(self, refund: PaymentRefund, target_status_code: str):
        current_code = str(getattr(getattr(refund, "status", None), "code", "") or "").strip().upper()
        next_code = str(target_status_code or "").strip().upper()

        if not next_code:
            raise ValidationError({"status": "Refund target status is required."})
        if current_code == next_code:
            return refund

        allowed = self.allowed_transitions.get(current_code, set())
        if next_code not in allowed:
            raise ValidationError(
                {"status": f"Transition from {current_code or 'SIN_ESTADO'} to {next_code} is not allowed."}
            )

        target_status = get_or_create_default_payment_refund_status(next_code)
        if not target_status:
            raise ValidationError({"status": f"Unable to resolve status {next_code}."})

        refund.status = target_status
        refund.save(update_fields=["status"])
        return refund

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        self._ensure_admin_approval()
        refund = self.get_object()
        updated = self._update_status(refund, "APROBADO")
        serializer = self.get_serializer(updated)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="process")
    def process(self, request, pk=None):
        self._ensure_admin_approval()
        refund = self.get_object()
        updated = self._update_status(refund, "PROCESADO")
        serializer = self.get_serializer(updated)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        self._ensure_admin_approval()
        refund = self.get_object()
        updated = self._update_status(refund, "RECHAZADO")
        serializer = self.get_serializer(updated)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        self._ensure_admin_approval()
        refund = self.get_object()
        updated = self._update_status(refund, "ANULADO")
        serializer = self.get_serializer(updated)
        return Response(serializer.data)


class CreditNoteViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        CreditNote.objects.select_related(
            "invoice",
            "invoice__reservation",
            "invoice__reservation__hotel_settings",
            "status",
        )
    )
    tenant_filter = "invoice__reservation__hotel_settings"
    serializer_class = CreditNoteSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["credit-notes.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice", "status", "is_active"]
    search_fields = [
        "credit_note_number",
        "reason",
        "notes",
        "invoice__invoice_number",
        "status__name",
        "status__code",
    ]
    ordering_fields = [
        "id",
        "credit_note_number",
        "amount",
        "issue_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["credit-notes.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
