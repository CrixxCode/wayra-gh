"""
Como una promocion llega a la factura (ver AGENTS.md, seccion 5.27).

- **Servicio especifico** — sola: descuenta cada cargo de ese servicio cuya fecha cae en la
  vigencia. Un monto fijo se descuenta por unidad del cargo.
- **Paquete especifico** — sola: descuenta el precio del paquete de la reserva si el check-in
  cae en la vigencia.
- **General** — la elige recepcion: descuenta la estadia (noches por tarifa) si el check-in cae
  en la vigencia.

Las que coinciden sobre lo mismo se suman, con tope en el valor de lo descontado. El resultado
se guarda en `PromotionApplication`; `get_reservation_financials` lo resta.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from accounts.soft_delete import exclude_soft_deleted
from apps.promotions.models import Promotion, PromotionApplication

MONEY_ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return MONEY_ZERO


def is_percentage_discount(promotion: Promotion) -> bool:
    # Misma regla que el frontend (`create-promotion`, `list-promotions`): el catalogo de
    # tipos de descuento es editable y no hay un unico codigo para "porcentaje".
    code = str(getattr(promotion, "discount_type_code", "") or "").strip().upper()
    return "PERCENT" in code or "PORCEN" in code or code == "PCT"


def promotion_scope(promotion: Promotion) -> str:
    if promotion.service_id:
        return PromotionApplication.Scope.SERVICE
    if promotion.package_id:
        return PromotionApplication.Scope.PACKAGE
    return PromotionApplication.Scope.STAY


def is_promotion_valid_on(promotion: Promotion, day) -> bool:
    if day is None:
        return False
    return promotion.start_date <= day <= promotion.end_date


def usable_promotions(hotel_settings_id):
    """Activas y no eliminadas: lo mismo que ve el catalogo."""
    queryset = Promotion.objects.filter(
        hotel_settings_id=hotel_settings_id,
        is_active=True,
    ).select_related("discount_type")
    return exclude_soft_deleted(queryset).order_by("id")


def _discount(promotion: Promotion, base: Decimal, units: int = 1) -> Decimal:
    value = _to_decimal(promotion.discount_value)
    if is_percentage_discount(promotion):
        raw = base * value / Decimal("100")
    else:
        raw = value * Decimal(max(int(units or 1), 1))
    return raw.quantize(CENT, rounding=ROUND_HALF_UP)


def _stack(promotions: list[Promotion], base: Decimal, units: int = 1) -> dict[int, Decimal]:
    """Suma las promociones sobre una misma base sin pasarse de ella."""
    remaining = max(_to_decimal(base), MONEY_ZERO)
    amounts: dict[int, Decimal] = {}
    for promotion in promotions:
        amount = min(_discount(promotion, _to_decimal(base), units), remaining)
        amounts[promotion.id] = amount
        remaining -= amount
    return amounts


def is_reservation_frozen(reservation) -> bool:
    """Cerrada, cancelada o no-show: sus descuentos ya no se recalculan."""
    from apps.reservations.services import is_reservation_status_closed_without_stay

    if getattr(reservation, "real_check_out", None) is not None:
        return True
    return is_reservation_status_closed_without_stay(getattr(reservation, "status_code", None))


def sync_reservation_promotions(reservation) -> None:
    """
    Recalcula los descuentos de una reserva abierta.

    Se llama desde `sync_default_invoice_for_reservation`, que corre cada vez que cambia algo
    que mueve el total (cargos, habitaciones, la reserva misma) y antes de recalcular la
    factura.
    """
    if not reservation or not getattr(reservation, "pk", None):
        return
    if is_reservation_frozen(reservation):
        return

    from apps.billing.models import Charge
    from apps.reservations.services import get_reservation_rooms_subtotal

    promotions = list(usable_promotions(reservation.hotel_settings_id))
    by_id = {promotion.id: promotion for promotion in promotions}
    check_in_day = reservation.expected_check_in

    # (promotion_id, charge_id) -> (scope, amount)
    desired: dict[tuple[int, int | None], tuple[str, Decimal]] = {}

    charges = Charge.objects.filter(
        reservation=reservation,
        is_active=True,
        is_automatic=False,
        service__isnull=False,
    ).order_by("id")
    for charge in charges:
        charge_day = timezone.localdate(charge.charge_date) if charge.charge_date else None
        matching = [
            promotion
            for promotion in promotions
            if promotion.service_id == charge.service_id
            and is_promotion_valid_on(promotion, charge_day)
        ]
        for promotion_id, amount in _stack(
            matching, _to_decimal(charge.total_amount), charge.quantity
        ).items():
            desired[(promotion_id, charge.id)] = (PromotionApplication.Scope.SERVICE, amount)

    if reservation.package_id:
        matching = [
            promotion
            for promotion in promotions
            if promotion.package_id == reservation.package_id
            and is_promotion_valid_on(promotion, check_in_day)
        ]
        for promotion_id, amount in _stack(
            matching, _to_decimal(reservation.package_price)
        ).items():
            desired[(promotion_id, None)] = (PromotionApplication.Scope.PACKAGE, amount)

    existing = {
        (application.promotion_id, application.charge_id): application
        for application in PromotionApplication.objects.filter(reservation=reservation)
    }

    # Las generales solo existen si recepcion las eligio; aqui se recalcula su monto. Si la
    # promocion dejo de ser usable o el check-in salio de su vigencia, dejan de descontar.
    chosen_general = [
        by_id[application.promotion_id]
        for application in existing.values()
        if not application.is_automatic
        and application.is_active
        and application.scope == PromotionApplication.Scope.STAY
        and application.promotion_id in by_id
        and is_promotion_valid_on(by_id[application.promotion_id], check_in_day)
    ]
    for promotion_id, amount in _stack(
        chosen_general, get_reservation_rooms_subtotal(reservation)
    ).items():
        desired[(promotion_id, None)] = (PromotionApplication.Scope.STAY, amount)

    for key, (scope, amount) in desired.items():
        application = existing.get(key)
        if application is None:
            PromotionApplication.objects.create(
                reservation=reservation,
                promotion_id=key[0],
                charge_id=key[1],
                scope=scope,
                amount=amount,
                is_automatic=scope != PromotionApplication.Scope.STAY,
            )
            continue
        if application.amount != amount or not application.is_active:
            application.amount = amount
            application.is_active = True
            application.save(update_fields=["amount", "is_active", "updated_at"])

    for key, application in existing.items():
        if key in desired or not application.is_active:
            continue
        # Una general que recepcion quito ya viene inactiva; aqui caen las automaticas que
        # dejaron de aplicar y las generales que perdieron vigencia. No se borran: el rastro
        # de que hubo un descuento importa.
        application.amount = MONEY_ZERO
        application.is_active = False
        application.save(update_fields=["amount", "is_active", "updated_at"])


def eligible_general_promotions(reservation) -> list[Promotion]:
    """Generales vigentes para el check-in de la reserva que todavia no se aplicaron."""
    applied_ids = set(
        PromotionApplication.objects.filter(
            reservation=reservation,
            is_active=True,
        ).values_list("promotion_id", flat=True)
    )
    return [
        promotion
        for promotion in usable_promotions(reservation.hotel_settings_id)
        if promotion_scope(promotion) == PromotionApplication.Scope.STAY
        and is_promotion_valid_on(promotion, reservation.expected_check_in)
        and promotion.id not in applied_ids
    ]


def _resync_invoice(reservation) -> None:
    from apps.billing.services import sync_default_invoice_for_reservation

    sync_default_invoice_for_reservation(
        reservation.id,
        expected_hotel_settings_id=reservation.hotel_settings_id,
    )


@transaction.atomic
def apply_general_promotion(reservation, promotion_id, *, applied_by=None) -> PromotionApplication:
    if is_reservation_frozen(reservation):
        raise ValidationError(
            {"promotion": "La reserva ya esta cerrada o cancelada: no admite promociones."}
        )

    promotion = next(
        (
            candidate
            for candidate in eligible_general_promotions(reservation)
            if str(candidate.id) == str(promotion_id)
        ),
        None,
    )
    if promotion is None:
        raise ValidationError(
            {
                "promotion": (
                    "Esa promocion no se puede aplicar a esta reserva: debe ser general, estar "
                    "activa, tener vigente la fecha de llegada y no estar ya aplicada."
                )
            }
        )

    application, _created = PromotionApplication.objects.update_or_create(
        reservation=reservation,
        promotion=promotion,
        charge=None,
        defaults={
            "scope": PromotionApplication.Scope.STAY,
            "is_automatic": False,
            "is_active": True,
            "applied_by": applied_by if getattr(applied_by, "is_authenticated", False) else None,
        },
    )
    _resync_invoice(reservation)
    application.refresh_from_db()
    return application


@transaction.atomic
def remove_general_promotion(reservation, promotion_id) -> None:
    if is_reservation_frozen(reservation):
        raise ValidationError(
            {"promotion": "La reserva ya esta cerrada o cancelada: sus descuentos no cambian."}
        )

    application = PromotionApplication.objects.filter(
        reservation=reservation,
        promotion_id=promotion_id,
        charge__isnull=True,
        is_automatic=False,
        is_active=True,
    ).first()
    if application is None:
        raise ValidationError(
            {
                "promotion": (
                    "Solo se pueden quitar promociones generales aplicadas a mano; las de "
                    "servicio y paquete se aplican solas."
                )
            }
        )

    application.amount = MONEY_ZERO
    application.is_active = False
    application.save(update_fields=["amount", "is_active", "updated_at"])
    _resync_invoice(reservation)


def resync_reservations_for_promotion(promotion: Promotion) -> None:
    """
    Al crear o editar una promocion, las reservas abiertas a las que toca ven el cambio sin
    esperar a que se mueva otra cosa en ellas.
    """
    from apps.reservations.models import Reservation

    reservations = Reservation.objects.filter(
        hotel_settings_id=promotion.hotel_settings_id,
        real_check_out__isnull=True,
    )
    if promotion.service_id:
        reservations = reservations.filter(charges__service_id=promotion.service_id)
    elif promotion.package_id:
        reservations = reservations.filter(package_id=promotion.package_id)
    else:
        reservations = reservations.filter(promotion_applications__promotion=promotion)

    for reservation in reservations.distinct().select_related("status"):
        if not is_reservation_frozen(reservation):
            _resync_invoice(reservation)
