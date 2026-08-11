"""Señales operativas de una habitación para el tablero de recepción.

`/api/rooms/` ya expone el estado y la reserva activa, pero recepción necesita además
saber, sin abrir la habitación, si tiene **limpieza pendiente**, **mantenimiento
abierto** o **saldo por cobrar**. Esos tres datos viven en tres apps distintas
(`rooms`, `billing`) y calcularlos por habitación dentro del serializer sería un N+1
sobre un listado que puede traer cientos de habitaciones.

Por eso este módulo resuelve todo **en bloque**: recibe las habitaciones de la página y
devuelve un mapa `room_id -> señales` con un número fijo de consultas (7), sin importar
cuántas habitaciones sean.

El saldo se calcula igual que `apps.billing.services.get_invoice_reconciliation`
(`pendiente = total - (pagado - reembolsado)`) para que la tarjeta y la factura nunca
muestren cifras distintas.
"""

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import Count, F, Sum
from django.db.models.functions import Cast

from accounts.models import SoftDeleteMarker
from apps.billing.models import Charge, Invoice, Payment, PaymentRefund
from apps.inventory.models import RoomInventory
from apps.reservations.models import ReservationRoom
from apps.reservations.services import (
    CLEANING_ACTIVE_STATUS_CODES,
    INACTIVE_RESERVATION_STATUS_CODES,
    get_reservation_financials,
    is_reservation_in_house,
)
from apps.rooms.models import CleaningTask, MaintenanceOrder

MONEY_ZERO = Decimal("0.00")

# Una orden de mantenimiento sigue "abierta" mientras no se complete ni se cancele.
CLOSED_MAINTENANCE_STATUS_CODES = {"COMPLETADA", "COMPLETADO", "CANCELADA", "CANCELADO"}

# Prioridades que sacan una orden de la cola normal y la vuelven trabajo del día.
URGENT_MAINTENANCE_PRIORITY_CODES = {"URGENTE", "ALTA"}

# Una factura anulada no cuenta como saldo por cobrar.
VOID_INVOICE_STATUS_CODES = {"ANULADA", "ANULADO", "CANCELLED", "CANCELADA"}

# Los reembolsos solo descuentan cuando ya se materializaron.
SETTLED_REFUND_STATUS_CODES = ["APROBADO", "PROCESADO"]

EMPTY_SIGNALS = {
    "pending_cleaning": 0,
    "open_maintenance": 0,
    "urgent_maintenance": 0,
    "low_inventory": 0,
    "reservation_pending": MONEY_ZERO,
    "pending_balance": MONEY_ZERO,
    "unbilled_charges": MONEY_ZERO,
    "pending_total": MONEY_ZERO,
}


def _exclude_soft_deleted(queryset):
    """Descarta lo eliminado lógicamente.

    El borrado lógico vive en `SoftDeleteMarker` y solo se aplica en la capa API (ver
    AGENTS.md 5.5), así que un queryset crudo como estos lo ignoraría y contaría tareas
    que el usuario ya borró.
    """
    content_type = ContentType.objects.get_for_model(queryset.model)
    deleted_ids = SoftDeleteMarker.objects.filter(content_type=content_type).values("object_id")
    return queryset.annotate(
        _soft_pk=Cast("pk", output_field=models.CharField())
    ).exclude(_soft_pk__in=deleted_ids)


def _count_by_room(queryset):
    rows = queryset.order_by().values("room_id").annotate(total=Count("id"))
    return {row["room_id"]: row["total"] for row in rows}


def _sum_by(queryset, key_field):
    rows = queryset.order_by().values(key_field).annotate(total=Sum("amount"))
    return {row[key_field]: row["total"] or MONEY_ZERO for row in rows}


def _resolve_active_reservations(room_ids):
    """room_id -> reserva vigente, con el mismo criterio que `RoomSerializer`.

    Si una habitación tiene varias reservas abiertas se prefiere la que ya hizo
    check-in; si ninguna, la de check-in más próximo.
    """
    details = (
        ReservationRoom.objects.filter(room_id__in=room_ids)
        .select_related("reservation", "reservation__status")
        # `get_reservation_financials` respeta el cache de prefetch: sin esto haria
        # cinco consultas por reserva para calcular el saldo.
        .prefetch_related(
            "reservation__rooms_detail",
            "reservation__charges",
            "reservation__invoices__payments__refunds__status",
        )
        .filter(reservation__real_check_out__isnull=True)
        .exclude(reservation__status__code__in=INACTIVE_RESERVATION_STATUS_CODES)
        .order_by("room_id", "reservation__expected_check_in", "reservation__id")
    )

    by_room: dict[int, object] = {}
    for detail in details:
        reservation = detail.reservation
        current = by_room.get(detail.room_id)
        if current is None:
            by_room[detail.room_id] = reservation
            continue
        if is_reservation_in_house(reservation) and not is_reservation_in_house(current):
            by_room[detail.room_id] = reservation

    return by_room


def build_room_operations_map(rooms) -> dict[int, dict]:
    """Devuelve `room_id -> señales operativas` para las habitaciones recibidas."""
    room_ids = [room.id for room in rooms if getattr(room, "id", None)]
    if not room_ids:
        return {}

    # CleaningTask y MaintenanceOrder no tienen `is_active`: su ciclo de vida se
    # expresa solo con el estado y con el borrado lógico.
    cleaning_counts = _count_by_room(
        _exclude_soft_deleted(
            CleaningTask.objects.filter(
                room_id__in=room_ids,
                status__code__in=CLEANING_ACTIVE_STATUS_CODES,
            )
        )
    )

    open_maintenance = _exclude_soft_deleted(
        MaintenanceOrder.objects.filter(room_id__in=room_ids).exclude(
            status__code__in=CLOSED_MAINTENANCE_STATUS_CODES
        )
    )
    maintenance_counts = _count_by_room(open_maintenance)
    urgent_maintenance_counts = _count_by_room(
        open_maintenance.filter(priority__code__in=URGENT_MAINTENANCE_PRIORITY_CODES)
    )

    # Ítems de la habitación por debajo de su mínimo: lo que hay que reponer antes de
    # volver a vender. `minimum_quantity = 0` significa "sin mínimo definido".
    low_inventory_counts = _count_by_room(
        _exclude_soft_deleted(
            RoomInventory.objects.filter(
                room_id__in=room_ids,
                is_active=True,
                minimum_quantity__gt=0,
                quantity__lt=F("minimum_quantity"),
            )
        )
    )

    reservations_by_room = _resolve_active_reservations(room_ids)
    reservation_ids = {reservation.id for reservation in reservations_by_room.values()}

    balance_by_reservation: dict[int, Decimal] = {}
    unbilled_by_reservation: dict[int, Decimal] = {}

    if reservation_ids:
        invoices = list(
            _exclude_soft_deleted(
                Invoice.objects.filter(
                    reservation_id__in=reservation_ids, is_active=True
                ).exclude(status__code__in=VOID_INVOICE_STATUS_CODES)
            ).values("id", "reservation_id", "total_amount")
        )
        invoice_ids = [invoice["id"] for invoice in invoices]

        paid_by_invoice = _sum_by(
            _exclude_soft_deleted(
                Payment.objects.filter(invoice_id__in=invoice_ids, is_active=True)
            ),
            "invoice_id",
        )
        refunded_by_invoice = _sum_by(
            _exclude_soft_deleted(
                PaymentRefund.objects.filter(
                    payment__invoice_id__in=invoice_ids,
                    is_active=True,
                    status__code__in=SETTLED_REFUND_STATUS_CODES,
                )
            ),
            "payment__invoice_id",
        )

        for invoice in invoices:
            total = invoice["total_amount"] or MONEY_ZERO
            net_paid = paid_by_invoice.get(invoice["id"], MONEY_ZERO) - refunded_by_invoice.get(
                invoice["id"], MONEY_ZERO
            )
            if net_paid < MONEY_ZERO:
                net_paid = MONEY_ZERO

            pending = total - net_paid
            if pending < MONEY_ZERO:
                pending = MONEY_ZERO

            reservation_id = invoice["reservation_id"]
            balance_by_reservation[reservation_id] = (
                balance_by_reservation.get(reservation_id, MONEY_ZERO) + pending
            )

        # `is_automatic=False` a proposito: los cargos automaticos son la estadia y el
        # paquete, que ya estan contados en el saldo de la reserva. "Consumos" son los
        # extras que el huesped fue sumando y que hay que cobrarle en el mostrador.
        # Es el mismo criterio que usa `get_reservation_financials` para
        # `additional_charges_total`.
        unbilled_rows = (
            _exclude_soft_deleted(
                Charge.objects.filter(
                    reservation_id__in=reservation_ids,
                    is_active=True,
                    is_automatic=False,
                    invoice_links__isnull=True,
                )
            )
            .order_by()
            .values("reservation_id")
            .annotate(total=Sum("total_amount"))
        )
        unbilled_by_reservation = {
            row["reservation_id"]: row["total"] or MONEY_ZERO for row in unbilled_rows
        }

    # Saldo de la reserva (estadia + paquete + cargos - descuentos - abonos). Es el
    # mismo numero que muestra el modal de la habitacion: si la tarjeta usara el saldo
    # de facturacion, recepcion veria dos cifras distintas para la misma habitacion.
    reservation_pending_by_id = {
        reservation.id: get_reservation_financials(reservation)["pending_amount"]
        for reservation in reservations_by_room.values()
    }

    operations: dict[int, dict] = {}
    for room_id in room_ids:
        reservation = reservations_by_room.get(room_id)
        reservation_id = reservation.id if reservation else None

        pending_balance = balance_by_reservation.get(reservation_id, MONEY_ZERO)
        unbilled_charges = unbilled_by_reservation.get(reservation_id, MONEY_ZERO)
        reservation_pending = reservation_pending_by_id.get(reservation_id, MONEY_ZERO)

        operations[room_id] = {
            "pending_cleaning": cleaning_counts.get(room_id, 0),
            "open_maintenance": maintenance_counts.get(room_id, 0),
            "urgent_maintenance": urgent_maintenance_counts.get(room_id, 0),
            "low_inventory": low_inventory_counts.get(room_id, 0),
            "reservation_pending": reservation_pending,
            "pending_balance": pending_balance,
            "unbilled_charges": unbilled_charges,
            "pending_total": pending_balance + unbilled_charges,
        }

    return operations
