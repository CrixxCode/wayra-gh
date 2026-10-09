from __future__ import annotations

from django.core.exceptions import ValidationError
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.billing.models import Charge, Invoice, PaymentRefund
from apps.inventory.models import Item
from apps.master_data.models import MasterData
from apps.reservations.models import Reservation
from apps.reservations.services import get_reservation_financials


AUTO_ROOM_KEY_PREFIX = "ROOM"
AUTO_PACKAGE_KEY = "PACKAGE"
AUTO_INVENTORY_MISSING_KEY_PREFIX = "INVENTORY_MISSING"
MONEY_ZERO = Decimal("0.00")

DEFAULT_CHARGE_TYPES: dict[str, tuple[str, int]] = {
    "HABITACION": ("Habitacion", 1),
    "PAQUETE": ("Paquete", 2),
    "SERVICIO": ("Servicio", 3),
    "OTRO": ("Otro", 4),
}

DEFAULT_INVOICE_STATUSES: dict[str, tuple[str, int]] = {
    "BORRADOR": ("Borrador", 1),
    "PENDIENTE": ("Pendiente", 2),
    "PARCIAL": ("Parcial", 3),
    "PAGADA": ("Pagada", 4),
    "REEMBOLSADA": ("Reembolsada", 5),
    "ANULADA": ("Anulada", 6),
    # Compatibilidad con catalogos existentes.
    "EMITIDA": ("Emitida", 7),
}

DEFAULT_PAYMENT_REFUND_STATUSES: dict[str, tuple[str, int]] = {
    "PENDIENTE": ("Pendiente", 1),
    "APROBADO": ("Aprobado", 2),
    "PROCESADO": ("Procesado", 3),
    "RECHAZADO": ("Rechazado", 4),
    "ANULADO": ("Anulado", 5),
}


def get_or_create_default_charge_type(code: str):
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None

    name, sort_order = DEFAULT_CHARGE_TYPES.get(
        normalized_code,
        (normalized_code.replace("_", " ").title(), 99),
    )
    charge_type, _ = MasterData.objects.get_or_create(
        group=MasterData.Group.CHARGE_TYPE,
        code=normalized_code,
        defaults={
            "name": name,
            "sort_order": sort_order,
            "is_active": True,
        },
    )

    if not charge_type.is_active:
        charge_type.is_active = True
        charge_type.save(update_fields=["is_active"])

    return charge_type


def get_or_create_default_invoice_status(code: str):
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None

    name, sort_order = DEFAULT_INVOICE_STATUSES.get(
        normalized_code,
        (normalized_code.replace("_", " ").title(), 99),
    )
    invoice_status, _ = MasterData.objects.get_or_create(
        group=MasterData.Group.INVOICE_STATUS,
        code=normalized_code,
        defaults={
            "name": name,
            "sort_order": sort_order,
            "is_active": True,
        },
    )

    if not invoice_status.is_active:
        invoice_status.is_active = True
        invoice_status.save(update_fields=["is_active"])

    return invoice_status


def get_or_create_default_payment_refund_status(code: str):
    normalized_code = str(code or "").strip().upper()
    if not normalized_code:
        return None

    name, sort_order = DEFAULT_PAYMENT_REFUND_STATUSES.get(
        normalized_code,
        (normalized_code.replace("_", " ").title(), 99),
    )
    refund_status, _ = MasterData.objects.get_or_create(
        group=MasterData.Group.PAYMENT_REFUND_STATUS,
        code=normalized_code,
        defaults={
            "name": name,
            "sort_order": sort_order,
            "is_active": True,
        },
    )

    if not refund_status.is_active:
        refund_status.is_active = True
        refund_status.save(update_fields=["is_active"])

    return refund_status


def _to_decimal(value) -> Decimal:
    if value is None:
        return MONEY_ZERO
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return MONEY_ZERO


def _build_room_charge_description(reservation_room, nights: int) -> str:
    room_label = getattr(getattr(reservation_room, "room", None), "number", None) or str(
        reservation_room.room_id
    )
    return f"Hospedaje habitacion {room_label} ({nights} noche(s))"


def _build_package_charge_description(reservation) -> str:
    package_name = (
        str(getattr(reservation, "package_display_name", "") or "")
        or str(getattr(reservation, "package_name", "") or "")
        or str(getattr(getattr(reservation, "package", None), "name", "") or "")
    ).strip()
    if package_name:
        return f"Paquete: {package_name}"
    return "Paquete"


def _build_inventory_missing_charge_description(
    *,
    reservation_id: int,
    room_label: str,
    item_name: str,
) -> str:
    return (
        f"Faltante inventario habitacion {room_label}: {item_name} "
        f"(post check-out reserva #{reservation_id})"
    )


def create_inventory_missing_charges_for_checkout(
    reservation,
    *,
    inventory_comparison: dict[str, Any] | None,
) -> int:
    if not reservation or not getattr(reservation, "id", None):
        return 0
    if not isinstance(inventory_comparison, dict):
        return 0

    lines = inventory_comparison.get("lines") or []
    if not isinstance(lines, list):
        return 0

    shortage_lines = [
        line
        for line in lines
        if isinstance(line, dict) and int(line.get("difference_quantity") or 0) < 0
    ]
    if not shortage_lines:
        return 0

    charge_type = get_or_create_default_charge_type("INVENTARIO_FALTANTE")
    if not charge_type:
        charge_type = get_or_create_default_charge_type("OTRO")
    if not charge_type:
        return 0

    item_ids = {int(line.get("item_id")) for line in shortage_lines if line.get("item_id")}
    reservation_hotel_settings_id = getattr(reservation, "hotel_settings_id", None)
    item_by_id = {
        item.id: item
        for item in Item.objects.filter(
            id__in=item_ids,
            hotel_settings_id=reservation_hotel_settings_id,
        ).only("id", "name", "sale_price")
    }

    # Un faltante de un item sin precio de venta se cobraba a $0 en silencio, y uno cuyo item
    # no aparecia se saltaba sin rastro (auditoria, Bloque 6 #7). Se frena con un mensaje que
    # dice que configurar, antes de crear ningun cargo.
    unpriced = sorted(
        {
            str(getattr(item_by_id.get(int(line["item_id"])), "name", "") or line.get("item_name") or line["item_id"])
            for line in shortage_lines
            if line.get("item_id")
            and (
                int(line["item_id"]) not in item_by_id
                or _to_decimal(getattr(item_by_id[int(line["item_id"])], "sale_price", MONEY_ZERO)) <= MONEY_ZERO
            )
        }
    )
    if unpriced:
        raise ValidationError(
            {
                "inventory_review": (
                    "No se puede cobrar el faltante de: " + ", ".join(unpriced) + ". "
                    "Configura su precio de venta en Inventario (o corrige el conteo) y repite el check-out."
                )
            }
        )

    check_id = inventory_comparison.get("check_id")
    created_or_updated = 0

    for line in shortage_lines:
        item_id = line.get("item_id")
        room_id = line.get("room_id")
        if not item_id or not room_id:
            continue

        try:
            item_id = int(item_id)
            room_id = int(room_id)
        except (TypeError, ValueError):
            continue

        missing_quantity = abs(int(line.get("difference_quantity") or 0))
        if missing_quantity <= 0:
            continue

        item = item_by_id.get(item_id)
        if not item:
            continue

        unit_price = _to_decimal(getattr(item, "sale_price", MONEY_ZERO))
        if unit_price < MONEY_ZERO:
            unit_price = MONEY_ZERO

        room_label = str(line.get("room_number") or room_id)
        item_name = str(getattr(item, "name", "") or line.get("item_name") or f"Item {item_id}").strip()
        automation_key = (
            f"{AUTO_INVENTORY_MISSING_KEY_PREFIX}:"
            f"{check_id or 'NA'}:{room_id}:{item_id}"
        )

        Charge.objects.update_or_create(
            reservation=reservation,
            automation_key=automation_key,
            defaults={
                "charge_type": charge_type,
                "service": None,
                "package": None,
                "description": _build_inventory_missing_charge_description(
                    reservation_id=reservation.id,
                    room_label=room_label,
                    item_name=item_name,
                ),
                "quantity": missing_quantity,
                "unit_price": unit_price,
                "is_active": True,
                # Se marca como manual para que entre al total de cargos de la reserva.
                "is_automatic": False,
            },
        )
        created_or_updated += 1

    return created_or_updated


def _sync_automatic_room_charges(reservation, *, room_charge_type) -> set[str]:
    active_keys: set[str] = set()
    nights = max(int(getattr(reservation, "total_nights", 0) or 0), 0)

    for reservation_room in reservation.rooms_detail.select_related("room").all():
        automation_key = f"{AUTO_ROOM_KEY_PREFIX}:{reservation_room.id}"
        active_keys.add(automation_key)

        line_total = _to_decimal(getattr(reservation_room, "subtotal", MONEY_ZERO))
        if line_total < MONEY_ZERO:
            line_total = MONEY_ZERO

        Charge.objects.update_or_create(
            reservation=reservation,
            is_automatic=True,
            automation_key=automation_key,
            defaults={
                "charge_type": room_charge_type,
                "service": None,
                "package": None,
                "description": _build_room_charge_description(reservation_room, nights),
                "quantity": 1,
                "unit_price": line_total,
                "is_active": True,
            },
        )

    return active_keys


def _sync_automatic_package_charge(reservation, *, package_charge_type) -> set[str]:
    package_total = _to_decimal(getattr(reservation, "package_price", MONEY_ZERO))
    if not getattr(reservation, "package_id", None) or package_total <= MONEY_ZERO:
        return set()

    Charge.objects.update_or_create(
        reservation=reservation,
        is_automatic=True,
        automation_key=AUTO_PACKAGE_KEY,
        defaults={
            "charge_type": package_charge_type,
            "service": None,
            "package": reservation.package,
            "description": _build_package_charge_description(reservation),
            "quantity": 1,
            "unit_price": package_total,
            "is_active": True,
        },
    )
    return {AUTO_PACKAGE_KEY}


def sync_automatic_charges_for_reservation(reservation_id: int | None):
    if not reservation_id:
        return

    reservation = (
        Reservation.objects.select_related("package")
        .prefetch_related("rooms_detail__room")
        .filter(pk=reservation_id)
        .first()
    )
    if not reservation:
        return

    # Cancelada, la estadia y el paquete dejan de cobrarse: sin esto el siguiente guardado de
    # la reserva volvia a activar los cargos automaticos (Bloque 6 #9).
    from apps.reservations.services import is_reservation_status_cancelled

    if is_reservation_status_cancelled(reservation.status_code):
        Charge.objects.filter(reservation=reservation, is_automatic=True, is_active=True).update(
            is_active=False
        )
        return

    room_charge_type = get_or_create_default_charge_type("HABITACION")
    package_charge_type = get_or_create_default_charge_type("PAQUETE")

    active_keys: set[str] = set()
    if room_charge_type:
        active_keys.update(_sync_automatic_room_charges(reservation, room_charge_type=room_charge_type))
    if package_charge_type:
        active_keys.update(
            _sync_automatic_package_charge(reservation, package_charge_type=package_charge_type)
        )

    stale_qs = Charge.objects.filter(
        reservation=reservation,
        is_automatic=True,
        is_active=True,
    )
    if active_keys:
        stale_qs = stale_qs.exclude(automation_key__in=active_keys)
    stale_qs.update(is_active=False)


def _generate_invoice_number(reservation_id: int) -> str:
    base = f"FAC-{int(reservation_id):08d}"
    if not Invoice.objects.filter(invoice_number=base).exists():
        return base

    suffix = 2
    while Invoice.objects.filter(invoice_number=f"{base}-{suffix}").exists():
        suffix += 1
        if suffix > 9999:
            timestamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
            return f"{base}-{timestamp}"

    return f"{base}-{suffix}"


def _get_existing_default_invoice(
    reservation_id: int,
    *,
    expected_hotel_settings_id: int | None = None,
):
    # Una factura anulada ya no es "la factura" de la reserva: si la reserva sigue viva,
    # `ensure_default_invoice_for_reservation` crea otra en su lugar.
    queryset = Invoice.objects.filter(
        reservation_id=reservation_id,
        is_active=True,
    ).exclude(status__code=INVOICE_VOID_STATUS_CODE)
    if expected_hotel_settings_id is not None:
        queryset = queryset.filter(
            reservation__hotel_settings_id=expected_hotel_settings_id
        )
    return (
        queryset
        .select_related("reservation")
        .order_by("id")
        .first()
    )


def ensure_default_invoice_for_reservation(
    reservation_id: int | None,
    *,
    expected_hotel_settings_id: int | None = None,
):
    if not reservation_id:
        return None

    existing_invoice = _get_existing_default_invoice(
        reservation_id,
        expected_hotel_settings_id=expected_hotel_settings_id,
    )
    if existing_invoice:
        return existing_invoice

    reservation_queryset = Reservation.objects.filter(pk=reservation_id)
    if expected_hotel_settings_id is not None:
        reservation_queryset = reservation_queryset.filter(
            hotel_settings_id=expected_hotel_settings_id
        )

    status = get_or_create_default_invoice_status("BORRADOR")
    if not status:
        return None

    from apps.reservations.services import is_reservation_status_cancelled

    with transaction.atomic():
        # Sin este lock, dos peticiones simultaneas veian "no hay factura" y cada una
        # creaba la suya: quedaba una segunda factura activa (`FAC-...-2`) desincronizada
        # del saldo real. Con la reserva bloqueada, la segunda espera y encuentra la
        # factura que creo la primera.
        reservation = reservation_queryset.select_for_update().first()
        if not reservation:
            return None
        # Una reserva cancelada no vuelve a facturarse (su factura se anula al cancelar).
        if is_reservation_status_cancelled(reservation.status_code):
            return None

        existing_invoice = _get_existing_default_invoice(
            reservation_id,
            expected_hotel_settings_id=expected_hotel_settings_id,
        )
        if existing_invoice:
            return existing_invoice

        for _ in range(3):
            invoice_number = _generate_invoice_number(reservation_id)
            try:
                with transaction.atomic():
                    return Invoice.objects.create(
                        reservation=reservation,
                        status=status,
                        invoice_number=invoice_number,
                        subtotal=MONEY_ZERO,
                        tax_amount=MONEY_ZERO,
                        is_active=True,
                    )
            except IntegrityError:
                continue

    return _get_existing_default_invoice(
        reservation_id,
        expected_hotel_settings_id=expected_hotel_settings_id,
    )


def get_invoice_reconciliation(
    invoice: Invoice | None,
    *,
    exclude_payment_id: int | None = None,
) -> dict[str, Decimal | bool]:
    """
    Saldo de una factura. Es la unica cuenta: la usan el estado de la factura y la
    validacion de cada cobro, para que el tope de un pago y lo que muestra la factura no
    puedan contradecirse. `exclude_payment_id` deja fuera un pago (y sus reembolsos) al
    editarlo.
    """
    if not invoice:
        return {
            "total_amount": MONEY_ZERO,
            "total_paid": MONEY_ZERO,
            "total_refunded": MONEY_ZERO,
            "total_credited": MONEY_ZERO,
            "net_paid": MONEY_ZERO,
            "pending_balance": MONEY_ZERO,
            "fully_refunded": False,
        }

    total_amount = _to_decimal(invoice.total_amount)
    if total_amount < MONEY_ZERO:
        total_amount = MONEY_ZERO

    payments = invoice.payments.filter(is_active=True)
    refunds = PaymentRefund.objects.filter(
        payment__invoice=invoice,
        is_active=True,
        status__code__in=["APROBADO", "PROCESADO"],
    )
    if exclude_payment_id:
        payments = payments.exclude(pk=exclude_payment_id)
        refunds = refunds.exclude(payment_id=exclude_payment_id)

    total_paid = _to_decimal(sum(payment.amount for payment in payments.only("amount")))
    total_refunded = _to_decimal(sum(refund.amount for refund in refunds.only("amount")))
    # Mismo criterio que Finanzas y Reportes (`net_revenue`): una nota de credito activa
    # reduce lo que se le debe al hotel. Antes la restaban los reportes pero no el saldo,
    # y una factura saldada con nota de credito seguia bloqueando el check-out.
    total_credited = _to_decimal(
        sum(note.amount for note in invoice.credit_notes.filter(is_active=True).only("amount"))
    )

    net_paid = total_paid - total_refunded
    if net_paid < MONEY_ZERO:
        net_paid = MONEY_ZERO

    pending_balance = total_amount - total_credited - net_paid
    if pending_balance < MONEY_ZERO:
        pending_balance = MONEY_ZERO

    fully_refunded = (
        total_paid > MONEY_ZERO
        and net_paid == MONEY_ZERO
        and total_refunded >= total_paid
    )

    return {
        "total_amount": total_amount,
        "total_paid": total_paid,
        "total_refunded": total_refunded,
        "total_credited": total_credited,
        "net_paid": net_paid,
        "pending_balance": pending_balance,
        "fully_refunded": fully_refunded,
    }


def _get_invoice_total_paid(invoice: Invoice) -> Decimal:
    snapshot = get_invoice_reconciliation(invoice)
    return _to_decimal(snapshot.get("net_paid"))


def _resolve_invoice_status_code(invoice: Invoice) -> str | None:
    current_status_code = str(getattr(getattr(invoice, "status", None), "code", "") or "").strip().upper()
    if current_status_code == "ANULADA":
        return None

    snapshot = get_invoice_reconciliation(invoice)
    total_amount = _to_decimal(snapshot.get("total_amount"))
    total_paid = _to_decimal(snapshot.get("total_paid"))
    net_paid = _to_decimal(snapshot.get("net_paid"))
    total_credited = _to_decimal(snapshot.get("total_credited"))
    fully_refunded = bool(snapshot.get("fully_refunded"))

    has_checkout = getattr(getattr(invoice, "reservation", None), "real_check_out", None) is not None
    is_draft = current_status_code in {"", "BORRADOR"}

    if total_amount <= MONEY_ZERO:
        if fully_refunded:
            return "REEMBOLSADA"
        if has_checkout or not is_draft:
            return "PAGADA"
        return "BORRADOR"

    if net_paid + total_credited >= total_amount:
        return "PAGADA"
    if fully_refunded:
        return "REEMBOLSADA"
    if net_paid > MONEY_ZERO:
        return "PARCIAL"
    if has_checkout or not is_draft or total_paid > MONEY_ZERO:
        return "PENDIENTE"
    return "BORRADOR"


def sync_invoice_status(invoice: Invoice | None):
    if not invoice or not invoice.is_active:
        return invoice

    target_code = _resolve_invoice_status_code(invoice)
    if not target_code:
        return invoice

    target_status = get_or_create_default_invoice_status(target_code)
    if target_status and invoice.status_id != target_status.id:
        invoice.status = target_status
        invoice.save(update_fields=["status"])

    return invoice


def sync_default_invoice_for_reservation(
    reservation_id: int | None,
    *,
    expected_hotel_settings_id: int | None = None,
):
    invoice = ensure_default_invoice_for_reservation(
        reservation_id,
        expected_hotel_settings_id=expected_hotel_settings_id,
    )
    if not invoice:
        return None

    # Antes del total: los descuentos de promociones lo bajan.
    from apps.promotions.services import sync_reservation_promotions

    sync_reservation_promotions(invoice.reservation)

    financials = get_reservation_financials(invoice.reservation)
    subtotal = _to_decimal(financials.get("total_amount"))
    if subtotal < MONEY_ZERO:
        subtotal = MONEY_ZERO
    tax_amount = MONEY_ZERO

    if invoice.subtotal != subtotal or invoice.tax_amount != tax_amount:
        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.save(update_fields=["subtotal", "tax_amount", "total_amount"])

    sync_invoice_status(invoice)
    return invoice


def issue_default_invoice_for_reservation(
    reservation_id: int | None,
    *,
    expected_hotel_settings_id: int | None = None,
):
    invoice = ensure_default_invoice_for_reservation(
        reservation_id,
        expected_hotel_settings_id=expected_hotel_settings_id,
    )
    if not invoice or not invoice.is_active:
        return invoice

    current_status_code = str(getattr(getattr(invoice, "status", None), "code", "") or "").strip().upper()
    if current_status_code == "ANULADA":
        return invoice

    if current_status_code in {"BORRADOR", "EMITIDA"}:
        pending_status = get_or_create_default_invoice_status("PENDIENTE")
        if pending_status and invoice.status_id != pending_status.id:
            invoice.status = pending_status
            invoice.save(update_fields=["status"])

    sync_invoice_status(invoice)
    return invoice


INVOICE_VOID_STATUS_CODE = "ANULADA"


def void_invoice(invoice: Invoice) -> Invoice:
    """
    Anula una factura. Solo sin dinero cobrado: lo que entro se devuelve primero con un
    reembolso desde el pago, para que caja y factura no se contradigan. Una factura anulada
    queda congelada (`sync_invoice_status`) y deja de ser la factura por defecto.
    """
    code = str(getattr(invoice.status, "code", "") or "").strip().upper()
    if code == INVOICE_VOID_STATUS_CODE:
        raise ValidationError({"invoice": "La factura ya esta anulada."})

    net_paid = _to_decimal(get_invoice_reconciliation(invoice).get("net_paid"))
    if net_paid > MONEY_ZERO:
        raise ValidationError(
            {
                "invoice": (
                    f"La factura tiene {net_paid:.2f} cobrados. Registra el reembolso desde el "
                    "pago antes de anularla."
                )
            }
        )

    void_status = get_or_create_default_invoice_status(INVOICE_VOID_STATUS_CODE)
    if not void_status:
        raise ValidationError({"invoice": "No existe el estado ANULADA de factura."})
    invoice.status = void_status
    invoice.save(update_fields=["status"])
    return invoice


def settle_billing_for_cancelled_reservation(reservation) -> str | None:
    """
    Cancelar una reserva anula su facturacion (decision del 2026-10-09, Bloque 6 #9): los
    consumos se desactivan y la factura se anula. Si ya hay dinero cobrado, la factura no se
    puede anular y se devuelve el aviso de registrar el reembolso; nunca se devuelve dinero
    automaticamente.
    """
    Charge.objects.filter(reservation=reservation, is_active=True, is_automatic=False).update(
        is_active=False
    )
    sync_automatic_charges_for_reservation(reservation.id)

    pending_refund = MONEY_ZERO
    for invoice in Invoice.objects.filter(reservation=reservation, is_active=True).exclude(
        status__code=INVOICE_VOID_STATUS_CODE
    ):
        net_paid = _to_decimal(get_invoice_reconciliation(invoice).get("net_paid"))
        if net_paid > MONEY_ZERO:
            pending_refund += net_paid
            continue
        void_invoice(invoice)

    if pending_refund > MONEY_ZERO:
        return (
            f"La reserva tiene {pending_refund:.2f} en abonos. La factura sigue abierta hasta que "
            "registres el reembolso desde el pago (Facturacion > Pagos > Reembolsar)."
        )
    return None
