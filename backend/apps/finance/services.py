from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.billing.models import Charge, CreditNote, Invoice, PaymentRefund
from apps.finance.models import (
    MONEY_ZERO,
    Expense,
    FinancialControlConfig,
    OperationalAlert,
    FinancialStatementSnapshot,
)
from apps.hotel_settings.models import HotelSettings
from apps.reservations.models import ReservationRoom
from apps.rooms.models import Room


ANULLED_INVOICE_STATUS_CODES = {
    "ANULADA",
    "ANULADO",
    "CANCELADA",
    "CANCELADO",
}

CANCELLED_RESERVATION_STATUS_CODES = {
    "CANCELADA",
    "CANCELADO",
    "ANULADA",
    "ANULADO",
    "NO_SHOW",
}

ROOM_CHARGE_CODES = {"HABITACION", "ROOM"}
PACKAGE_CHARGE_CODES = {"PAQUETE", "PACKAGE"}
AVAILABLE_ROOM_STATUS_CODES = {"DISPONIBLE"}
OCCUPIED_ROOM_STATUS_CODES = {"OCUPADA", "RESERVADA"}
REFUND_ALERT_STATUS_CODES = {"APROBADO", "PROCESADO"}


@dataclass(frozen=True)
class ResolvedFinancialConfig:
    hotel_settings_id: int
    hotel_city: str
    district_name: str
    tourism_law_enabled: bool
    tourism_law_preferential_rate: Decimal
    standard_income_tax_rate: Decimal
    has_iva_exemption: bool
    iva_rate: Decimal
    ica_rate_per_thousand: Decimal
    fontur_rate_per_thousand: Decimal
    break_even_warning_pct: Decimal
    break_even_optimal_pct: Decimal


def resolve_period(
    *,
    start_date_raw: str | None = None,
    end_date_raw: str | None = None,
) -> tuple[date, date]:
    today = timezone.localdate()
    default_start = today.replace(day=1)

    start_date = _parse_iso_date(start_date_raw, default=default_start)
    end_date = _parse_iso_date(end_date_raw, default=today)

    if start_date > end_date:
        raise ValidationError({"date_range": "start_date must be less than or equal to end_date."})

    return start_date, end_date


def resolve_year_month(
    *,
    year_raw: str | None = None,
    month_raw: str | None = None,
) -> tuple[int, int]:
    today = timezone.localdate()
    year = today.year
    month = today.month

    if year_raw is not None and str(year_raw).strip():
        try:
            year = int(str(year_raw).strip())
        except (TypeError, ValueError):
            raise ValidationError({"year": "year must be a valid integer."}) from None

    if month_raw is not None and str(month_raw).strip():
        try:
            month = int(str(month_raw).strip())
        except (TypeError, ValueError):
            raise ValidationError({"month": "month must be a valid integer."}) from None

    if year < 1900 or year > 2999:
        raise ValidationError({"year": "year must be between 1900 and 2999."})
    if month < 1 or month > 12:
        raise ValidationError({"month": "month must be between 1 and 12."})

    return year, month


def parse_decimal_param(
    *,
    value: str | None,
    field: str,
    default: Decimal = MONEY_ZERO,
) -> Decimal:
    if value is None or str(value).strip() == "":
        return default
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError({field: f"{field} must be a valid decimal number."}) from None


def build_financial_dashboard(
    *,
    hotel_settings_id: int | None,
    start_date: date,
    end_date: date,
) -> dict[str, Any]:
    resolved_hotel_settings_id = _resolve_required_hotel_settings_id(hotel_settings_id)
    config = _resolve_financial_config(hotel_settings_id=resolved_hotel_settings_id)
    period_metrics = _build_period_metrics(
        hotel_settings_id=resolved_hotel_settings_id,
        start_date=start_date,
        end_date=end_date,
        config=config,
    )
    previous_start = _shift_year_safe(start_date, years=-1)
    previous_end = _shift_year_safe(end_date, years=-1)
    previous_period_metrics = _build_period_metrics(
        hotel_settings_id=resolved_hotel_settings_id,
        start_date=previous_start,
        end_date=previous_end,
        config=config,
    )
    revpar_trend = _build_revpar_trend(
        hotel_settings_id=resolved_hotel_settings_id,
        end_date=end_date,
        months=12,
    )

    benchmark = {
        "current_period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "revenue": _to_float(period_metrics["net_revenue"]),
            "net_profit": _to_float(period_metrics["net_profit"]),
            "occupancy_rate_pct": _to_float(period_metrics["occupancy_rate_pct"]),
            "revpar": _to_float(period_metrics["revpar"]),
        },
        "previous_year_same_period": {
            "start_date": previous_start.isoformat(),
            "end_date": previous_end.isoformat(),
            "revenue": _to_float(previous_period_metrics["net_revenue"]),
            "net_profit": _to_float(previous_period_metrics["net_profit"]),
            "occupancy_rate_pct": _to_float(previous_period_metrics["occupancy_rate_pct"]),
            "revpar": _to_float(previous_period_metrics["revpar"]),
        },
        "variance": {
            "revenue_pct": _to_float(
                _calculate_percentage_change(
                    current=period_metrics["net_revenue"],
                    previous=previous_period_metrics["net_revenue"],
                ),
                places=2,
                allow_null=True,
            ),
            "net_profit_pct": _to_float(
                _calculate_percentage_change(
                    current=period_metrics["net_profit"],
                    previous=previous_period_metrics["net_profit"],
                ),
                places=2,
                allow_null=True,
            ),
            "occupancy_rate_pts": _to_float(
                period_metrics["occupancy_rate_pct"] - previous_period_metrics["occupancy_rate_pct"]
            ),
            "revpar_pct": _to_float(
                _calculate_percentage_change(
                    current=period_metrics["revpar"],
                    previous=previous_period_metrics["revpar"],
                ),
                places=2,
                allow_null=True,
            ),
        },
    }

    net_revenue = period_metrics["net_revenue"]
    cost_pct = _percentage(period_metrics["total_costs"], net_revenue)
    expense_pct = _percentage(period_metrics["operating_expenses"], net_revenue)
    tax_pct = _percentage(period_metrics["total_tax_burden"], net_revenue)
    profit_pct = _percentage(period_metrics["net_profit"], net_revenue)

    tourism_status = _build_tourism_law_status(
        config=config,
        occupancy_rate_pct=period_metrics["occupancy_rate_pct"],
        net_revenue=period_metrics["net_revenue"],
    )
    traffic_light = _build_financial_traffic_light(
        metrics=period_metrics,
        config=config,
        tourism_status=tourism_status,
    )

    return {
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": (end_date - start_date).days + 1,
        },
        "summary": {
            "revenue": _to_float(period_metrics["net_revenue"]),
            "costs": _to_float(period_metrics["total_costs"]),
            "expenses": _to_float(period_metrics["operating_expenses"]),
            "gross_operating_profit": _to_float(period_metrics["gross_operating_profit"]),
            "net_profit": _to_float(period_metrics["net_profit"]),
            "occupied_room_nights": int(period_metrics["occupied_room_nights"]),
            "available_room_nights": int(period_metrics["available_room_nights"]),
            "occupancy_rate_pct": _to_float(period_metrics["occupancy_rate_pct"]),
        },
        "profitability_and_sales": {
            "revpar_monthly_trend": revpar_trend,
            "gross_operating_profit": {
                "amount": _to_float(period_metrics["gross_operating_profit"]),
                "margin_pct": _to_float(period_metrics["gross_operating_margin_pct"]),
            },
            "net_margin_breakdown": {
                "net_margin_pct": _to_float(period_metrics["net_margin_pct"]),
                "cost_pct": _to_float(cost_pct),
                "expense_pct": _to_float(expense_pct),
                "tax_pct": _to_float(tax_pct),
                "profit_pct": _to_float(profit_pct),
            },
        },
        "operational_efficiency": {
            "break_even_dynamic": {
                "fixed_costs": _to_float(period_metrics["fixed_costs"]),
                "variable_costs": _to_float(period_metrics["variable_costs"]),
                "variable_cost_ratio_pct": _to_float(
                    period_metrics["variable_cost_ratio_pct"],
                    allow_null=True,
                ),
                "break_even_revenue": _to_float(
                    period_metrics["break_even_revenue"],
                    allow_null=True,
                ),
                "progress_pct": _to_float(period_metrics["break_even_progress_pct"]),
                "status": period_metrics["break_even_status"],
            },
            "cost_per_occupied_room": {
                "cpho": _to_float(period_metrics["cpho"]),
                "total_operating_costs": _to_float(period_metrics["total_operating_costs"]),
                "occupied_room_nights": int(period_metrics["occupied_room_nights"]),
            },
        },
        "tax_optimization": {
            "benefits_monitoring": {
                "tourism_law_income_tax": tourism_status,
                "iva_exemption": {
                    "enabled": bool(config.has_iva_exemption),
                    "iva_rate_pct": _to_float(config.iva_rate),
                    "package_revenue": _to_float(period_metrics["package_revenue"]),
                    "estimated_savings": _to_float(period_metrics["iva_savings"]),
                },
            },
            "provisions_and_compliance": {
                "ica": {
                    "district": config.district_name,
                    "taxable_base": _to_float(period_metrics["ica_taxable_base"]),
                    "rate_per_thousand": _to_float(config.ica_rate_per_thousand, places=4),
                    "amount": _to_float(period_metrics["ica_amount"]),
                },
                "fontur": {
                    "taxable_base": _to_float(period_metrics["fontur_taxable_base"]),
                    "rate_per_thousand": _to_float(config.fontur_rate_per_thousand, places=4),
                    "amount": _to_float(period_metrics["fontur_amount"]),
                },
                "income_tax": {
                    "taxable_base": _to_float(period_metrics["income_tax_base"]),
                    "rate_pct": _to_float(period_metrics["applied_income_tax_rate"]),
                    "amount": _to_float(period_metrics["income_tax_amount"]),
                },
                "total_provisions": _to_float(period_metrics["total_tax_provisions"]),
            },
        },
        "benchmarking": benchmark,
        "financial_traffic_light": traffic_light,
    }


def build_what_if_scenario(
    *,
    hotel_settings_id: int | None,
    start_date: date,
    end_date: date,
    rate_change_pct: Decimal = MONEY_ZERO,
    occupancy_change_pct: Decimal = MONEY_ZERO,
    target_occupancy_pct: Decimal | None = None,
    operating_cost_change_pct: Decimal = MONEY_ZERO,
) -> dict[str, Any]:
    resolved_hotel_settings_id = _resolve_required_hotel_settings_id(hotel_settings_id)
    config = _resolve_financial_config(hotel_settings_id=resolved_hotel_settings_id)
    base_metrics = _build_period_metrics(
        hotel_settings_id=resolved_hotel_settings_id,
        start_date=start_date,
        end_date=end_date,
        config=config,
    )

    base_revenue = base_metrics["net_revenue"]
    base_room_revenue = base_metrics["room_revenue"]
    base_other_revenue = base_revenue - base_room_revenue
    base_occupancy = base_metrics["occupancy_rate_pct"]

    if target_occupancy_pct is not None:
        projected_occupancy = max(min(target_occupancy_pct, Decimal("100.00")), MONEY_ZERO)
    else:
        projected_occupancy = base_occupancy * (Decimal("1.00") + (occupancy_change_pct / Decimal("100.00")))
        projected_occupancy = max(min(projected_occupancy, Decimal("100.00")), MONEY_ZERO)

    if base_occupancy > 0:
        occupancy_factor = projected_occupancy / base_occupancy
    else:
        occupancy_factor = Decimal("1.00") + (occupancy_change_pct / Decimal("100.00"))

    rate_factor = Decimal("1.00") + (rate_change_pct / Decimal("100.00"))
    projected_room_revenue = base_room_revenue * occupancy_factor * rate_factor
    projected_other_revenue = base_other_revenue * occupancy_factor
    projected_revenue = max(projected_room_revenue + projected_other_revenue, MONEY_ZERO)

    projected_fixed_costs = base_metrics["fixed_costs"]
    projected_variable_costs = (
        base_metrics["variable_costs"]
        * occupancy_factor
        * (Decimal("1.00") + (operating_cost_change_pct / Decimal("100.00")))
    )
    projected_total_operating_costs = max(projected_fixed_costs + projected_variable_costs, MONEY_ZERO)
    projected_gop = projected_revenue - projected_total_operating_costs

    tourism_status = _build_tourism_law_status(
        config=config,
        occupancy_rate_pct=projected_occupancy,
        net_revenue=projected_revenue,
    )
    applied_income_tax_rate = (
        config.tourism_law_preferential_rate
        if tourism_status["eligible"]
        else config.standard_income_tax_rate
    )

    projected_income_tax = MONEY_ZERO
    if projected_gop > 0:
        projected_income_tax = projected_gop * (applied_income_tax_rate / Decimal("100.00"))

    projected_ica = projected_revenue * (config.ica_rate_per_thousand / Decimal("1000.00"))
    projected_fontur = projected_revenue * (config.fontur_rate_per_thousand / Decimal("1000.00"))
    projected_tax_burden = projected_income_tax + projected_ica + projected_fontur
    projected_net_profit = projected_gop - projected_tax_burden
    projected_income_tax_base = projected_gop if projected_gop > MONEY_ZERO else MONEY_ZERO

    return {
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        "inputs": {
            "rate_change_pct": _to_float(rate_change_pct),
            "occupancy_change_pct": _to_float(occupancy_change_pct),
            "target_occupancy_pct": _to_float(target_occupancy_pct, allow_null=True),
            "operating_cost_change_pct": _to_float(operating_cost_change_pct),
        },
        "base": {
            "revenue": _to_float(base_revenue),
            "gross_operating_profit": _to_float(base_metrics["gross_operating_profit"]),
            "net_profit": _to_float(base_metrics["net_profit"]),
            "occupancy_rate_pct": _to_float(base_metrics["occupancy_rate_pct"]),
            "revpar": _to_float(base_metrics["revpar"]),
        },
        "projected": {
            "revenue": _to_float(projected_revenue),
            "gross_operating_profit": _to_float(projected_gop),
            "net_profit": _to_float(projected_net_profit),
            "occupancy_rate_pct": _to_float(projected_occupancy),
            "revpar": _to_float(
                projected_room_revenue / Decimal(base_metrics["available_room_nights"])
                if base_metrics["available_room_nights"] > 0
                else MONEY_ZERO
            ),
            "income_tax_amount": _to_float(projected_income_tax),
            "income_tax_taxable_base": _to_float(projected_income_tax_base),
            "ica_amount": _to_float(projected_ica),
            "ica_taxable_base": _to_float(projected_revenue),
            "fontur_amount": _to_float(projected_fontur),
            "fontur_taxable_base": _to_float(projected_revenue),
            "total_tax_provisions": _to_float(projected_tax_burden),
        },
        "delta": {
            "revenue_pct": _to_float(
                _calculate_percentage_change(
                    current=projected_revenue,
                    previous=base_revenue,
                ),
                allow_null=True,
            ),
            "net_profit_pct": _to_float(
                _calculate_percentage_change(
                    current=projected_net_profit,
                    previous=base_metrics["net_profit"],
                ),
                allow_null=True,
            ),
            "occupancy_rate_pts": _to_float(projected_occupancy - base_metrics["occupancy_rate_pct"]),
        },
    }


def build_financial_statements(
    *,
    hotel_settings_id: int | None,
    year: int,
    month: int,
) -> dict[str, Any]:
    resolved_hotel_settings_id = _resolve_required_hotel_settings_id(hotel_settings_id)
    current_start = date(year, month, 1)
    current_end = date(year, month, monthrange(year, month)[1])
    previous_start = _shift_year_safe(current_start, years=-1)
    previous_end = _shift_year_safe(current_end, years=-1)

    config = _resolve_financial_config(hotel_settings_id=resolved_hotel_settings_id)

    current_metrics = _build_period_metrics(
        hotel_settings_id=resolved_hotel_settings_id,
        start_date=current_start,
        end_date=current_end,
        config=config,
    )
    previous_metrics = _build_period_metrics(
        hotel_settings_id=resolved_hotel_settings_id,
        start_date=previous_start,
        end_date=previous_end,
        config=config,
    )

    current_snapshot = _get_snapshot_or_default(
        hotel_settings_id=resolved_hotel_settings_id,
        year=year,
        month=month,
    )
    previous_snapshot = _get_snapshot_or_default(
        hotel_settings_id=resolved_hotel_settings_id,
        year=year - 1,
        month=month,
    )

    current_income = _build_income_statement_values(
        metrics=current_metrics,
        snapshot=current_snapshot,
    )
    previous_income = _build_income_statement_values(
        metrics=previous_metrics,
        snapshot=previous_snapshot,
    )

    return {
        "period": {
            "current": f"{year}-{month:02d}",
            "previous": f"{year - 1}-{month:02d}",
            "current_start_date": current_start.isoformat(),
            "current_end_date": current_end.isoformat(),
        },
        "balance_sheet": {
            "title": "Estado de Situacion Financiera",
            "rows": _build_balance_sheet_rows(
                current_snapshot=current_snapshot,
                previous_snapshot=previous_snapshot,
            ),
            "totals": {
                "total_assets": {
                    "current": _to_float(current_snapshot.total_assets),
                    "previous": _to_float(previous_snapshot.total_assets),
                },
                "total_liabilities": {
                    "current": _to_float(current_snapshot.total_liabilities),
                    "previous": _to_float(previous_snapshot.total_liabilities),
                },
                "total_equity": {
                    "current": _to_float(current_snapshot.total_equity),
                    "previous": _to_float(previous_snapshot.total_equity),
                },
                "total_liabilities_and_equity": {
                    "current": _to_float(current_snapshot.total_liabilities + current_snapshot.total_equity),
                    "previous": _to_float(previous_snapshot.total_liabilities + previous_snapshot.total_equity),
                },
            },
        },
        "income_statement": {
            "title": "Estado de Resultados Integrales",
            "rows": _build_income_statement_rows(
                current_values=current_income,
                previous_values=previous_income,
            ),
        },
        "indicators": {
            "liquidity_current_ratio": {
                "formula": "Activo corriente / Pasivo corriente",
                "current": _to_float(current_snapshot.current_ratio, places=4, allow_null=True),
                "previous": _to_float(previous_snapshot.current_ratio, places=4, allow_null=True),
            },
            "indebtedness_ratio": {
                "formula": "Total activo / Total pasivo",
                "current": _to_float(current_snapshot.indebtedness_ratio, places=4, allow_null=True),
                "previous": _to_float(previous_snapshot.indebtedness_ratio, places=4, allow_null=True),
            },
            "ebitda": {
                "formula": "Utilidad operacional + depreciacion + intereses",
                "current": _to_float(
                    current_income["operating_profit"]
                    + current_snapshot.depreciation_expense
                    + current_snapshot.financial_expense
                ),
                "previous": _to_float(
                    previous_income["operating_profit"]
                    + previous_snapshot.depreciation_expense
                    + previous_snapshot.financial_expense
                ),
            },
            "receivables_turnover": {
                "formula": "Ventas netas a credito / Promedio cuentas por cobrar",
                "current": _to_float(current_snapshot.receivables_turnover, places=4, allow_null=True),
                "previous": _to_float(previous_snapshot.receivables_turnover, places=4, allow_null=True),
            },
        },
        "tax_provisions_traceability": {
            "current_period_estimate": {
                "income_tax_base": _to_float(current_metrics["income_tax_base"]),
                "income_tax_amount": _to_float(current_metrics["income_tax_amount"]),
                "ica_taxable_base": _to_float(current_metrics["ica_taxable_base"]),
                "ica_amount": _to_float(current_metrics["ica_amount"]),
                "fontur_taxable_base": _to_float(current_metrics["fontur_taxable_base"]),
                "fontur_amount": _to_float(current_metrics["fontur_amount"]),
                "total": _to_float(current_metrics["total_tax_provisions"]),
            },
            "snapshot_balances": {
                "current": {
                    "income_tax": _to_float(current_snapshot.provision_income_tax),
                    "ica": _to_float(current_snapshot.provision_ica),
                    "fontur": _to_float(current_snapshot.provision_fontur),
                    "other_taxes": _to_float(current_snapshot.other_tax_provisions),
                    "taxes_payable": _to_float(current_snapshot.taxes_payable),
                },
                "previous": {
                    "income_tax": _to_float(previous_snapshot.provision_income_tax),
                    "ica": _to_float(previous_snapshot.provision_ica),
                    "fontur": _to_float(previous_snapshot.provision_fontur),
                    "other_taxes": _to_float(previous_snapshot.other_tax_provisions),
                    "taxes_payable": _to_float(previous_snapshot.taxes_payable),
                },
            },
        },
        "ai_interpretation_prompt": (
            "Actua como analista financiero y usa estos indicadores para generar recomendaciones "
            "de toma de decisiones informadas para la gerencia del hotel."
        ),
    }


def _build_income_statement_values(
    *,
    metrics: dict[str, Any],
    snapshot: FinancialStatementSnapshot,
) -> dict[str, Decimal]:
    revenue = metrics["net_revenue"]
    cost = metrics["total_costs"]
    gross_profit = revenue - cost
    admin_expenses = metrics["admin_expenses"]
    sales_expenses = metrics["sales_expenses"]
    other_income_expense = _to_decimal(snapshot.other_income_expense)
    operating_profit = gross_profit - admin_expenses - sales_expenses + other_income_expense
    financial_income = _to_decimal(snapshot.financial_income)
    financial_expense = _to_decimal(snapshot.financial_expense)
    income_tax_expense = _to_decimal(snapshot.income_tax_expense)
    if income_tax_expense <= MONEY_ZERO:
        income_tax_expense = metrics["income_tax_amount"]
    net_result = operating_profit + financial_income - financial_expense - income_tax_expense
    other_comprehensive_income = _to_decimal(snapshot.other_comprehensive_income)
    total_comprehensive_result = net_result + other_comprehensive_income

    return {
        "revenue": revenue,
        "cost": cost,
        "gross_profit": gross_profit,
        "admin_expenses": admin_expenses,
        "sales_expenses": sales_expenses,
        "other_income_expense": other_income_expense,
        "operating_profit": operating_profit,
        "financial_income": financial_income,
        "financial_expense": financial_expense,
        "income_tax_expense": income_tax_expense,
        "net_result": net_result,
        "other_comprehensive_income": other_comprehensive_income,
        "total_comprehensive_result": total_comprehensive_result,
    }


def _build_balance_sheet_rows(
    *,
    current_snapshot: FinancialStatementSnapshot,
    previous_snapshot: FinancialStatementSnapshot,
) -> list[dict[str, Any]]:
    return [
        {
            "section": "ACTIVO",
            "account": "Efectivo y equivalentes de efectivo",
            "current": _to_float(current_snapshot.cash_and_equivalents),
            "previous": _to_float(previous_snapshot.cash_and_equivalents),
        },
        {
            "section": "ACTIVO",
            "account": "Deudores comerciales y otras",
            "current": _to_float(current_snapshot.trade_receivables),
            "previous": _to_float(previous_snapshot.trade_receivables),
        },
        {
            "section": "ACTIVO",
            "account": "Activos financieros corrientes",
            "current": _to_float(current_snapshot.current_financial_assets),
            "previous": _to_float(previous_snapshot.current_financial_assets),
        },
        {
            "section": "ACTIVO",
            "account": "Inventarios",
            "current": _to_float(current_snapshot.inventories),
            "previous": _to_float(previous_snapshot.inventories),
        },
        {
            "section": "ACTIVO",
            "account": "Total activos corrientes",
            "current": _to_float(current_snapshot.current_assets),
            "previous": _to_float(previous_snapshot.current_assets),
        },
        {
            "section": "ACTIVO",
            "account": "Propiedad, planta y equipo",
            "current": _to_float(current_snapshot.property_plant_equipment),
            "previous": _to_float(previous_snapshot.property_plant_equipment),
        },
        {
            "section": "ACTIVO",
            "account": "Activos financieros no corrientes",
            "current": _to_float(current_snapshot.non_current_financial_assets),
            "previous": _to_float(previous_snapshot.non_current_financial_assets),
        },
        {
            "section": "ACTIVO",
            "account": "Activos intangibles y otros",
            "current": _to_float(current_snapshot.intangibles_other),
            "previous": _to_float(previous_snapshot.intangibles_other),
        },
        {
            "section": "ACTIVO",
            "account": "Total activos no corrientes",
            "current": _to_float(current_snapshot.non_current_assets),
            "previous": _to_float(previous_snapshot.non_current_assets),
        },
        {
            "section": "PASIVO",
            "account": "Cuentas por pagar comerciales",
            "current": _to_float(current_snapshot.accounts_payable),
            "previous": _to_float(previous_snapshot.accounts_payable),
        },
        {
            "section": "PASIVO",
            "account": "Obligaciones financieras corrientes",
            "current": _to_float(current_snapshot.financial_obligations_current),
            "previous": _to_float(previous_snapshot.financial_obligations_current),
        },
        {
            "section": "PASIVO",
            "account": "Acreedores comerciales",
            "current": _to_float(current_snapshot.trade_creditors),
            "previous": _to_float(previous_snapshot.trade_creditors),
        },
        {
            "section": "PASIVO",
            "account": "Impuestos por pagar",
            "current": _to_float(current_snapshot.taxes_payable),
            "previous": _to_float(previous_snapshot.taxes_payable),
        },
        {
            "section": "PASIVO",
            "account": "Total pasivo corriente",
            "current": _to_float(current_snapshot.current_liabilities),
            "previous": _to_float(previous_snapshot.current_liabilities),
        },
        {
            "section": "PASIVO",
            "account": "Obligaciones financieras no corrientes",
            "current": _to_float(current_snapshot.financial_obligations_non_current),
            "previous": _to_float(previous_snapshot.financial_obligations_non_current),
        },
        {
            "section": "PASIVO",
            "account": "Total pasivo no corriente",
            "current": _to_float(current_snapshot.non_current_liabilities),
            "previous": _to_float(previous_snapshot.non_current_liabilities),
        },
        {
            "section": "PATRIMONIO",
            "account": "Capital social",
            "current": _to_float(current_snapshot.equity_capital),
            "previous": _to_float(previous_snapshot.equity_capital),
        },
        {
            "section": "PATRIMONIO",
            "account": "Reservas",
            "current": _to_float(current_snapshot.equity_reserves),
            "previous": _to_float(previous_snapshot.equity_reserves),
        },
        {
            "section": "PATRIMONIO",
            "account": "Superavit de capital",
            "current": _to_float(current_snapshot.equity_surplus),
            "previous": _to_float(previous_snapshot.equity_surplus),
        },
        {
            "section": "PATRIMONIO",
            "account": "Resultados acumulados",
            "current": _to_float(current_snapshot.retained_earnings),
            "previous": _to_float(previous_snapshot.retained_earnings),
        },
    ]


def _build_income_statement_rows(
    *,
    current_values: dict[str, Decimal],
    previous_values: dict[str, Decimal],
) -> list[dict[str, Any]]:
    return [
        {
            "account": "Ingresos ordinarios",
            "current": _to_float(current_values["revenue"]),
            "previous": _to_float(previous_values["revenue"]),
        },
        {
            "account": "Costo de prestacion de servicios",
            "current": _to_float(current_values["cost"]),
            "previous": _to_float(previous_values["cost"]),
        },
        {
            "account": "Excedente bruto",
            "current": _to_float(current_values["gross_profit"]),
            "previous": _to_float(previous_values["gross_profit"]),
        },
        {
            "account": "Gastos de administracion hotelera",
            "current": _to_float(current_values["admin_expenses"]),
            "previous": _to_float(previous_values["admin_expenses"]),
        },
        {
            "account": "Gastos de ventas",
            "current": _to_float(current_values["sales_expenses"]),
            "previous": _to_float(previous_values["sales_expenses"]),
        },
        {
            "account": "Otros (gastos) ingresos",
            "current": _to_float(current_values["other_income_expense"]),
            "previous": _to_float(previous_values["other_income_expense"]),
        },
        {
            "account": "Excedente (deficit) operacional",
            "current": _to_float(current_values["operating_profit"]),
            "previous": _to_float(previous_values["operating_profit"]),
        },
        {
            "account": "Ingresos financieros",
            "current": _to_float(current_values["financial_income"]),
            "previous": _to_float(previous_values["financial_income"]),
        },
        {
            "account": "Costos financieros",
            "current": _to_float(current_values["financial_expense"]),
            "previous": _to_float(previous_values["financial_expense"]),
        },
        {
            "account": "Gasto por impuesto a las ganancias",
            "current": _to_float(current_values["income_tax_expense"]),
            "previous": _to_float(previous_values["income_tax_expense"]),
        },
        {
            "account": "Excedente (deficit) neto (A)",
            "current": _to_float(current_values["net_result"]),
            "previous": _to_float(previous_values["net_result"]),
        },
        {
            "account": "Otro resultado integral (B)",
            "current": _to_float(current_values["other_comprehensive_income"]),
            "previous": _to_float(previous_values["other_comprehensive_income"]),
        },
        {
            "account": "Resultado integral total (A+/-B)",
            "current": _to_float(current_values["total_comprehensive_result"]),
            "previous": _to_float(previous_values["total_comprehensive_result"]),
        },
    ]


def _build_period_metrics(
    *,
    hotel_settings_id: int,
    start_date: date,
    end_date: date,
    config: ResolvedFinancialConfig,
) -> dict[str, Any]:
    reservation_ids = _reservation_ids_queryset(hotel_settings_id=hotel_settings_id)

    invoice_queryset = Invoice.objects.filter(
        is_active=True,
        issue_date__date__gte=start_date,
        issue_date__date__lte=end_date,
        reservation_id__in=reservation_ids,
    ).exclude(status__code__in=ANULLED_INVOICE_STATUS_CODES)

    total_invoiced = _aggregate_sum(invoice_queryset, "total_amount")

    credit_note_queryset = CreditNote.objects.filter(
        is_active=True,
        issue_date__date__gte=start_date,
        issue_date__date__lte=end_date,
        invoice__is_active=True,
        invoice__reservation_id__in=reservation_ids,
    )
    credit_notes_total = _aggregate_sum(credit_note_queryset, "amount")

    net_revenue = total_invoiced - credit_notes_total
    if net_revenue < MONEY_ZERO:
        net_revenue = MONEY_ZERO

    charge_queryset = Charge.objects.filter(
        is_active=True,
        charge_date__date__gte=start_date,
        charge_date__date__lte=end_date,
        reservation_id__in=reservation_ids,
    )

    room_revenue = _aggregate_sum(charge_queryset.filter(charge_type__code__in=ROOM_CHARGE_CODES), "total_amount")
    package_revenue = _aggregate_sum(
        charge_queryset.filter(charge_type__code__in=PACKAGE_CHARGE_CODES),
        "total_amount",
    )

    expense_queryset = Expense.objects.select_related("expense_category").filter(
        hotel_settings_id=hotel_settings_id,
        is_active=True,
        expense_date__gte=start_date,
        expense_date__lte=end_date,
    )

    total_costs = MONEY_ZERO
    admin_expenses = MONEY_ZERO
    sales_expenses = MONEY_ZERO
    fixed_costs = MONEY_ZERO
    variable_costs = MONEY_ZERO

    for expense in expense_queryset:
        amount = _to_decimal(getattr(expense, "amount", MONEY_ZERO))
        expense_type = getattr(expense, "expense_type", Expense.ExpenseType.ADMIN_EXPENSE)
        cost_behavior = getattr(expense, "cost_behavior", Expense.CostBehavior.FIXED)

        if expense_type == Expense.ExpenseType.OPERATING_COST:
            total_costs += amount
        elif expense_type == Expense.ExpenseType.SALES_EXPENSE:
            sales_expenses += amount
        else:
            admin_expenses += amount

        if cost_behavior == Expense.CostBehavior.VARIABLE:
            variable_costs += amount
        else:
            fixed_costs += amount

    operating_expenses = admin_expenses + sales_expenses
    total_operating_costs = total_costs + operating_expenses

    variable_cost_ratio: Decimal | None = None
    contribution_margin_ratio: Decimal | None = None
    if net_revenue > MONEY_ZERO:
        variable_cost_ratio = variable_costs / net_revenue
        contribution_margin_ratio = Decimal("1.00") - variable_cost_ratio

    break_even_revenue: Decimal | None = None
    break_even_progress_pct = MONEY_ZERO
    if contribution_margin_ratio is not None and contribution_margin_ratio > MONEY_ZERO:
        break_even_revenue = fixed_costs / contribution_margin_ratio
        if break_even_revenue > MONEY_ZERO:
            break_even_progress_pct = (net_revenue / break_even_revenue) * Decimal("100.00")

    if break_even_progress_pct >= config.break_even_optimal_pct:
        break_even_status = "OPTIMAL"
    elif break_even_progress_pct >= config.break_even_warning_pct:
        break_even_status = "WARNING"
    else:
        break_even_status = "CRITICAL"

    room_count = _room_count(hotel_settings_id=hotel_settings_id)
    total_days = (end_date - start_date).days + 1
    available_room_nights = room_count * max(total_days, 1)
    occupied_room_nights = _calculate_occupied_room_nights(
        hotel_settings_id=hotel_settings_id,
        start_date=start_date,
        end_date=end_date,
    )

    occupancy_rate_pct = (
        (Decimal(occupied_room_nights) / Decimal(available_room_nights)) * Decimal("100.00")
        if available_room_nights > 0
        else MONEY_ZERO
    )
    revpar = (
        room_revenue / Decimal(available_room_nights)
        if available_room_nights > 0
        else MONEY_ZERO
    )
    cpho = (
        total_operating_costs / Decimal(occupied_room_nights)
        if occupied_room_nights > 0
        else MONEY_ZERO
    )

    tourism_status = _build_tourism_law_status(
        config=config,
        occupancy_rate_pct=occupancy_rate_pct,
        net_revenue=net_revenue,
    )
    applied_income_tax_rate = (
        config.tourism_law_preferential_rate
        if tourism_status["eligible"]
        else config.standard_income_tax_rate
    )

    gross_operating_profit = net_revenue - total_operating_costs
    income_tax_base = gross_operating_profit if gross_operating_profit > MONEY_ZERO else MONEY_ZERO
    income_tax_amount = income_tax_base * (applied_income_tax_rate / Decimal("100.00"))
    ica_taxable_base = net_revenue
    fontur_taxable_base = net_revenue
    ica_amount = ica_taxable_base * (config.ica_rate_per_thousand / Decimal("1000.00"))
    fontur_amount = fontur_taxable_base * (config.fontur_rate_per_thousand / Decimal("1000.00"))
    iva_savings = (
        package_revenue * (config.iva_rate / Decimal("100.00"))
        if config.has_iva_exemption
        else MONEY_ZERO
    )

    total_tax_burden = income_tax_amount + ica_amount + fontur_amount
    total_tax_provisions = total_tax_burden
    net_profit = gross_operating_profit - total_tax_burden

    gross_operating_margin_pct = _percentage(gross_operating_profit, net_revenue)
    net_margin_pct = _percentage(net_profit, net_revenue)
    variable_cost_ratio_pct = (
        variable_cost_ratio * Decimal("100.00")
        if variable_cost_ratio is not None
        else None
    )

    return {
        "net_revenue": net_revenue,
        "room_revenue": room_revenue,
        "package_revenue": package_revenue,
        "total_costs": total_costs,
        "admin_expenses": admin_expenses,
        "sales_expenses": sales_expenses,
        "operating_expenses": operating_expenses,
        "total_operating_costs": total_operating_costs,
        "fixed_costs": fixed_costs,
        "variable_costs": variable_costs,
        "variable_cost_ratio_pct": variable_cost_ratio_pct,
        "break_even_revenue": break_even_revenue,
        "break_even_progress_pct": break_even_progress_pct,
        "break_even_status": break_even_status,
        "room_count": room_count,
        "available_room_nights": available_room_nights,
        "occupied_room_nights": occupied_room_nights,
        "occupancy_rate_pct": occupancy_rate_pct,
        "revpar": revpar,
        "cpho": cpho,
        "applied_income_tax_rate": applied_income_tax_rate,
        "income_tax_base": income_tax_base,
        "income_tax_amount": income_tax_amount,
        "ica_taxable_base": ica_taxable_base,
        "ica_amount": ica_amount,
        "fontur_taxable_base": fontur_taxable_base,
        "fontur_amount": fontur_amount,
        "iva_savings": iva_savings,
        "total_tax_provisions": total_tax_provisions,
        "total_tax_burden": total_tax_burden,
        "gross_operating_profit": gross_operating_profit,
        "gross_operating_margin_pct": gross_operating_margin_pct,
        "net_profit": net_profit,
        "net_margin_pct": net_margin_pct,
    }


def _build_revpar_trend(
    *,
    hotel_settings_id: int,
    end_date: date,
    months: int = 12,
) -> list[dict[str, Any]]:
    if months <= 0:
        return []

    room_count = _room_count(hotel_settings_id=hotel_settings_id)
    reservation_ids = _reservation_ids_queryset(hotel_settings_id=hotel_settings_id)

    charge_queryset = Charge.objects.filter(
        is_active=True,
        charge_type__code__in=ROOM_CHARGE_CODES,
        charge_date__date__lte=end_date,
        reservation_id__in=reservation_ids,
    )

    room_revenue_by_month: dict[tuple[int, int], Decimal] = {}
    for row in (
        charge_queryset.annotate(month=TruncMonth("charge_date"))
        .values("month")
        .annotate(total=Sum("total_amount"))
        .order_by("month")
    ):
        month_value = row.get("month")
        if not month_value:
            continue
        room_revenue_by_month[(month_value.year, month_value.month)] = _to_decimal(row.get("total"))

    month_anchor = end_date.replace(day=1)
    trend: list[dict[str, Any]] = []
    for offset in range(months - 1, -1, -1):
        month_start = _add_months(month_anchor, -offset)
        month_end = date(
            month_start.year,
            month_start.month,
            monthrange(month_start.year, month_start.month)[1],
        )
        if month_start.year == end_date.year and month_start.month == end_date.month:
            effective_end = end_date
        else:
            effective_end = month_end
        days = (effective_end - month_start).days + 1
        available_room_nights = max(days, 0) * room_count
        revenue = room_revenue_by_month.get((month_start.year, month_start.month), MONEY_ZERO)
        revpar = revenue / Decimal(available_room_nights) if available_room_nights > 0 else MONEY_ZERO
        trend.append(
            {
                "month": f"{month_start.year}-{month_start.month:02d}",
                "room_revenue": _to_float(revenue),
                "room_count": int(room_count),
                "available_room_nights": int(available_room_nights),
                "revpar": _to_float(revpar),
            }
        )
    return trend


def _build_tourism_law_status(
    *,
    config: ResolvedFinancialConfig,
    occupancy_rate_pct: Decimal,
    net_revenue: Decimal,
) -> dict[str, Any]:
    district_match = _normalize_text(config.hotel_city) == _normalize_text(config.district_name)
    occupancy_threshold = Decimal("25.00")
    eligible = bool(
        config.tourism_law_enabled
        and district_match
        and occupancy_rate_pct >= occupancy_threshold
        and net_revenue > MONEY_ZERO
    )
    message = (
        "Cumple condiciones para aplicar la tarifa preferencial de renta."
        if eligible
        else "No cumple todas las condiciones para mantener la tarifa preferencial."
    )

    return {
        "enabled": bool(config.tourism_law_enabled),
        "district_match": bool(district_match),
        "occupancy_threshold_pct": _to_float(occupancy_threshold),
        "eligible": bool(eligible),
        "applied_rate_pct": _to_float(
            config.tourism_law_preferential_rate if eligible else config.standard_income_tax_rate
        ),
        "message": message,
    }


def _build_financial_traffic_light(
    *,
    metrics: dict[str, Any],
    config: ResolvedFinancialConfig,
    tourism_status: dict[str, Any],
) -> dict[str, Any]:
    reasons: list[str] = []
    color = "GREEN"

    if metrics["net_profit"] <= MONEY_ZERO:
        color = "RED"
        reasons.append("Perdida operativa neta en el periodo.")

    break_even_progress = metrics["break_even_progress_pct"]
    if metrics.get("break_even_revenue") is None:
        color = "RED"
        reasons.append("No es posible calcular punto de equilibrio con el margen de contribucion actual.")
    elif break_even_progress < config.break_even_warning_pct:
        color = "RED"
        reasons.append("No se alcanza el punto de equilibrio.")
    elif break_even_progress < config.break_even_optimal_pct and color != "RED":
        color = "YELLOW"
        reasons.append("Operacion cercana al punto de equilibrio.")

    if (
        tourism_status.get("enabled")
        and tourism_status.get("district_match")
        and not tourism_status.get("eligible")
        and color == "GREEN"
    ):
        color = "YELLOW"
        reasons.append("Riesgo de perder la tarifa preferencial de renta.")

    if not reasons:
        reasons.append("Operacion optima y cumplimiento tributario en parametros esperados.")

    return {
        "color": color,
        "label": {
            "GREEN": "Verde",
            "YELLOW": "Amarillo",
            "RED": "Rojo",
        }[color],
        "reasons": reasons,
    }


def _resolve_required_hotel_settings_id(hotel_settings_id: int | None) -> int:
    if hotel_settings_id is None:
        raise ValidationError(
            {
                "hotel_settings": (
                    "hotel_settings is required to avoid mixing financial data "
                    "between different hotels."
                )
            }
        )
    if not HotelSettings.objects.filter(id=hotel_settings_id).exists():
        raise ValidationError({"hotel_settings": "The selected hotel_settings does not exist."})
    return hotel_settings_id


def _resolve_financial_config(*, hotel_settings_id: int) -> ResolvedFinancialConfig:
    hotel_settings = HotelSettings.objects.get(id=hotel_settings_id)
    config_obj = FinancialControlConfig.objects.filter(hotel_settings_id=hotel_settings_id).first()

    return ResolvedFinancialConfig(
        hotel_settings_id=hotel_settings.id,
        hotel_city=str(hotel_settings.city or ""),
        district_name=str(getattr(config_obj, "district_name", "") or "Riohacha"),
        tourism_law_enabled=bool(getattr(config_obj, "tourism_law_enabled", True)),
        tourism_law_preferential_rate=_to_decimal(
            getattr(config_obj, "tourism_law_preferential_rate", Decimal("9.00"))
        ),
        standard_income_tax_rate=_to_decimal(
            getattr(config_obj, "standard_income_tax_rate", Decimal("35.00"))
        ),
        has_iva_exemption=bool(getattr(config_obj, "has_iva_exemption", False)),
        iva_rate=_to_decimal(getattr(config_obj, "iva_rate", Decimal("19.00"))),
        ica_rate_per_thousand=_to_decimal(
            getattr(config_obj, "ica_rate_per_thousand", Decimal("9.6600"))
        ),
        fontur_rate_per_thousand=_to_decimal(
            getattr(config_obj, "fontur_rate_per_thousand", Decimal("2.5000"))
        ),
        break_even_warning_pct=_to_decimal(
            getattr(config_obj, "break_even_warning_pct", Decimal("90.00"))
        ),
        break_even_optimal_pct=_to_decimal(
            getattr(config_obj, "break_even_optimal_pct", Decimal("110.00"))
        ),
    )


def _get_snapshot_or_default(
    *,
    hotel_settings_id: int,
    year: int,
    month: int,
) -> FinancialStatementSnapshot:
    snapshot = FinancialStatementSnapshot.objects.filter(
        hotel_settings_id=hotel_settings_id,
        period_year=year,
        period_month=month,
        is_active=True,
    ).first()
    if snapshot:
        return snapshot
    return FinancialStatementSnapshot(
        hotel_settings_id=hotel_settings_id,
        period_year=year,
        period_month=month,
    )


def _reservation_ids_queryset(*, hotel_settings_id: int):
    return ReservationRoom.objects.filter(
        room__floor__hotel_settings_id=hotel_settings_id
    ).values_list("reservation_id", flat=True)


def _calculate_occupied_room_nights(
    *,
    hotel_settings_id: int,
    start_date: date,
    end_date: date,
) -> int:
    reservation_room_qs = ReservationRoom.objects.select_related(
        "reservation",
        "reservation__status",
    )
    reservation_room_qs = reservation_room_qs.filter(
        room__floor__hotel_settings_id=hotel_settings_id
    )

    total_nights = 0
    period_end_exclusive = end_date + timedelta(days=1)

    for row in reservation_room_qs:
        reservation = row.reservation
        status_code = _normalize_code(getattr(reservation.status, "code", None))
        if status_code in CANCELLED_RESERVATION_STATUS_CODES:
            continue

        check_in = (
            reservation.real_check_in.date()
            if reservation.real_check_in
            else reservation.expected_check_in
        )
        check_out = (
            reservation.real_check_out.date()
            if reservation.real_check_out
            else reservation.expected_check_out
        )
        if not check_in or not check_out:
            continue
        if check_out <= check_in:
            continue

        overlap_start = max(check_in, start_date)
        overlap_end = min(check_out, period_end_exclusive)
        overlap_nights = (overlap_end - overlap_start).days
        if overlap_nights > 0:
            total_nights += overlap_nights

    return total_nights


def _room_count(*, hotel_settings_id: int) -> int:
    return Room.objects.filter(floor__hotel_settings_id=hotel_settings_id).count()


def _aggregate_sum(queryset, field_name: str) -> Decimal:
    return _to_decimal(queryset.aggregate(total=Sum(field_name)).get("total"))


def _normalize_code(value: Any) -> str:
    return str(value or "").strip().upper()


def _normalize_text(value: Any) -> str:
    return "".join(ch for ch in _normalize_code(value) if ch.isalnum())


def _parse_iso_date(raw_value: str | None, *, default: date) -> date:
    if raw_value is None or str(raw_value).strip() == "":
        return default

    value = str(raw_value).strip()
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({"date": f"Invalid date format: {value}. Use YYYY-MM-DD."}) from exc


def _shift_year_safe(base_date: date, *, years: int) -> date:
    target_year = base_date.year + years
    try:
        return base_date.replace(year=target_year)
    except ValueError:
        return base_date.replace(year=target_year, day=28)


def _add_months(base_date: date, delta_months: int) -> date:
    month_index = (base_date.month - 1) + delta_months
    year = base_date.year + (month_index // 12)
    month = (month_index % 12) + 1
    return date(year, month, 1)


def _to_decimal(value: Any) -> Decimal:
    if value is None:
        return MONEY_ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return MONEY_ZERO


def _percentage(part: Decimal, total: Decimal) -> Decimal:
    if total <= MONEY_ZERO:
        return MONEY_ZERO
    return (part / total) * Decimal("100.00")


def _calculate_percentage_change(*, current: Decimal, previous: Decimal) -> Decimal | None:
    if previous == MONEY_ZERO:
        if current == MONEY_ZERO:
            return MONEY_ZERO
        return None
    return ((current - previous) / previous) * Decimal("100.00")


def _to_float(
    value: Decimal | None,
    *,
    places: int = 2,
    allow_null: bool = False,
) -> float | None:
    if value is None:
        return None if allow_null else 0.0
    quantizer = Decimal("1").scaleb(-places)
    rounded = _to_decimal(value).quantize(quantizer, rounding=ROUND_HALF_UP)
    return float(rounded)


def sync_operational_alerts_for_hotel(
    *,
    hotel_settings_id: int | None,
    as_of_date: date | None = None,
    alert_types: set[str] | None = None,
) -> dict[str, Any]:
    result = {
        "created": 0,
        "updated": 0,
        "resolved": 0,
        "skipped": 0,
        "evaluated_types": [],
    }
    if not hotel_settings_id:
        result["skipped"] = 1
        return result
    if not HotelSettings.objects.filter(id=hotel_settings_id).exists():
        result["skipped"] = 1
        return result

    selected_types = _resolve_operational_alert_types(alert_types)
    if not selected_types:
        result["skipped"] = 1
        return result

    config = _resolve_operational_alert_thresholds(hotel_settings_id=hotel_settings_id)
    reference_date = as_of_date or timezone.localdate()
    result["evaluated_types"] = sorted(selected_types)
    room_metrics: dict[str, Any] | None = None
    if {
        OperationalAlert.AlertType.HIGH_OCCUPANCY,
        OperationalAlert.AlertType.LOW_AVAILABILITY,
    } & selected_types:
        room_metrics = _build_operational_room_metrics(hotel_settings_id=hotel_settings_id)

    if OperationalAlert.AlertType.HIGH_OCCUPANCY in selected_types:
        room_metrics = room_metrics or _build_operational_room_metrics(hotel_settings_id=hotel_settings_id)
        high_occupancy_threshold = _to_decimal(config["high_occupancy_threshold_pct"])
        high_occupancy_triggered = (
            int(room_metrics["total_rooms"]) > 0
            and _to_decimal(room_metrics["occupancy_rate_pct"]) >= high_occupancy_threshold
        )
        high_occupancy_severity = (
            OperationalAlert.Severity.CRITICAL
            if _to_decimal(room_metrics["occupancy_rate_pct"]) >= high_occupancy_threshold + Decimal("10.00")
            else OperationalAlert.Severity.WARNING
        )
        high_occupancy_message = (
            f"Ocupacion alta detectada: {room_metrics['occupied_rooms']}/{room_metrics['total_rooms']} "
            f"habitaciones ({room_metrics['occupancy_rate_pct']}%). "
            f"Umbral configurado: {high_occupancy_threshold}%."
        )
        _merge_operational_sync_result(
            result,
            _sync_operational_alert_state(
                hotel_settings_id=hotel_settings_id,
                alert_type=OperationalAlert.AlertType.HIGH_OCCUPANCY,
                title="Ocupacion alta",
                message=high_occupancy_message,
                severity=high_occupancy_severity,
                is_triggered=high_occupancy_triggered,
                metric_value=_to_decimal(room_metrics["occupancy_rate_pct"]),
                threshold_value=high_occupancy_threshold,
                metadata={
                    "occupied_rooms": int(room_metrics["occupied_rooms"]),
                    "total_rooms": int(room_metrics["total_rooms"]),
                    "available_rooms": int(room_metrics["available_rooms"]),
                },
            ),
        )

    if OperationalAlert.AlertType.LOW_AVAILABILITY in selected_types:
        room_metrics = room_metrics or _build_operational_room_metrics(hotel_settings_id=hotel_settings_id)
        low_availability_threshold = int(config["low_availability_threshold_rooms"])
        low_availability_triggered = (
            int(room_metrics["total_rooms"]) > 0
            and int(room_metrics["available_rooms"]) <= low_availability_threshold
        )
        low_availability_severity = (
            OperationalAlert.Severity.CRITICAL
            if int(room_metrics["available_rooms"]) <= max(low_availability_threshold - 1, 0)
            else OperationalAlert.Severity.WARNING
        )
        low_availability_message = (
            f"Baja disponibilidad detectada: {room_metrics['available_rooms']} habitaciones disponibles "
            f"de {room_metrics['total_rooms']}. "
            f"Umbral configurado: <= {low_availability_threshold}."
        )
        _merge_operational_sync_result(
            result,
            _sync_operational_alert_state(
                hotel_settings_id=hotel_settings_id,
                alert_type=OperationalAlert.AlertType.LOW_AVAILABILITY,
                title="Baja disponibilidad",
                message=low_availability_message,
                severity=low_availability_severity,
                is_triggered=low_availability_triggered,
                metric_value=_to_decimal(room_metrics["available_rooms"]),
                threshold_value=_to_decimal(low_availability_threshold),
                metadata={
                    "available_rooms": int(room_metrics["available_rooms"]),
                    "total_rooms": int(room_metrics["total_rooms"]),
                },
            ),
        )

    if OperationalAlert.AlertType.REVENUE_DROP in selected_types:
        revenue_window_days = int(config["revenue_window_days"])
        revenue_drop_threshold = _to_decimal(config["revenue_drop_threshold_pct"])
        revenue_metrics = _build_operational_revenue_drop_metrics(
            hotel_settings_id=hotel_settings_id,
            reference_date=reference_date,
            window_days=revenue_window_days,
        )
        drop_pct = revenue_metrics["drop_pct"]
        revenue_drop_triggered = (
            drop_pct is not None
            and _to_decimal(drop_pct) >= revenue_drop_threshold
        )
        revenue_drop_severity = (
            OperationalAlert.Severity.CRITICAL
            if drop_pct is not None and _to_decimal(drop_pct) >= revenue_drop_threshold + Decimal("10.00")
            else OperationalAlert.Severity.WARNING
        )
        revenue_drop_message = (
            f"Caida de ingresos de {drop_pct if drop_pct is not None else Decimal('0.00')}% "
            f"en los ultimos {revenue_window_days} dias. "
            f"Ingreso actual: {revenue_metrics['current_revenue']}, "
            f"periodo previo: {revenue_metrics['previous_revenue']}. "
            f"Umbral configurado: >= {revenue_drop_threshold}%."
        )
        _merge_operational_sync_result(
            result,
            _sync_operational_alert_state(
                hotel_settings_id=hotel_settings_id,
                alert_type=OperationalAlert.AlertType.REVENUE_DROP,
                title="Caida de ingresos",
                message=revenue_drop_message,
                severity=revenue_drop_severity,
                is_triggered=revenue_drop_triggered,
                metric_value=_to_decimal(drop_pct if drop_pct is not None else Decimal("0.00")),
                threshold_value=revenue_drop_threshold,
                metadata={
                    "current_revenue": _to_float(_to_decimal(revenue_metrics["current_revenue"])),
                    "previous_revenue": _to_float(_to_decimal(revenue_metrics["previous_revenue"])),
                    "window_days": revenue_window_days,
                },
            ),
        )

    if OperationalAlert.AlertType.HIGH_REFUNDS in selected_types:
        refund_window_days = int(config["refund_window_days"])
        high_refunds_threshold = int(config["high_refunds_threshold_count"])
        refund_metrics = _build_operational_refund_metrics(
            hotel_settings_id=hotel_settings_id,
            reference_date=reference_date,
            window_days=refund_window_days,
        )
        high_refunds_triggered = int(refund_metrics["refund_count"]) >= high_refunds_threshold
        high_refunds_severity = (
            OperationalAlert.Severity.CRITICAL
            if int(refund_metrics["refund_count"]) >= max(high_refunds_threshold * 2, high_refunds_threshold + 1)
            else OperationalAlert.Severity.WARNING
        )
        high_refunds_message = (
            f"Se detectaron {refund_metrics['refund_count']} reembolsos en los ultimos "
            f"{refund_window_days} dias. "
            f"Umbral configurado: >= {high_refunds_threshold}."
        )
        _merge_operational_sync_result(
            result,
            _sync_operational_alert_state(
                hotel_settings_id=hotel_settings_id,
                alert_type=OperationalAlert.AlertType.HIGH_REFUNDS,
                title="Alto volumen de reembolsos",
                message=high_refunds_message,
                severity=high_refunds_severity,
                is_triggered=high_refunds_triggered,
                metric_value=_to_decimal(refund_metrics["refund_count"]),
                threshold_value=_to_decimal(high_refunds_threshold),
                metadata={
                    "refund_count": int(refund_metrics["refund_count"]),
                    "window_days": refund_window_days,
                },
            ),
        )

    return result


def sync_operational_alerts_for_all_hotels(
    *,
    as_of_date: date | None = None,
    alert_types: set[str] | None = None,
) -> dict[str, Any]:
    results = {
        "hotels_processed": 0,
        "created": 0,
        "updated": 0,
        "resolved": 0,
        "skipped": 0,
    }
    hotel_ids = list(HotelSettings.objects.order_by("id").values_list("id", flat=True))
    for hotel_settings_id in hotel_ids:
        sync_result = sync_operational_alerts_for_hotel(
            hotel_settings_id=hotel_settings_id,
            as_of_date=as_of_date,
            alert_types=alert_types,
        )
        results["hotels_processed"] += 1
        results["created"] += int(sync_result.get("created", 0))
        results["updated"] += int(sync_result.get("updated", 0))
        results["resolved"] += int(sync_result.get("resolved", 0))
        results["skipped"] += int(sync_result.get("skipped", 0))

    return results


def _resolve_operational_alert_types(alert_types: set[str] | None) -> set[str]:
    valid_types = {
        OperationalAlert.AlertType.HIGH_OCCUPANCY,
        OperationalAlert.AlertType.LOW_AVAILABILITY,
        OperationalAlert.AlertType.REVENUE_DROP,
        OperationalAlert.AlertType.HIGH_REFUNDS,
    }
    if not alert_types:
        return valid_types

    normalized = {str(value or "").strip().upper() for value in alert_types}
    return {alert_type for alert_type in normalized if alert_type in valid_types}


def _resolve_operational_alert_thresholds(*, hotel_settings_id: int) -> dict[str, Any]:
    config = FinancialControlConfig.objects.filter(hotel_settings_id=hotel_settings_id).first()
    return {
        "high_occupancy_threshold_pct": _to_decimal(
            getattr(config, "operational_high_occupancy_threshold_pct", Decimal("85.00"))
        ),
        "low_availability_threshold_rooms": int(
            getattr(config, "operational_low_availability_threshold_rooms", 3) or 0
        ),
        "revenue_drop_threshold_pct": _to_decimal(
            getattr(config, "operational_revenue_drop_threshold_pct", Decimal("20.00"))
        ),
        "high_refunds_threshold_count": int(
            getattr(config, "operational_high_refunds_threshold_count", 5) or 1
        ),
        "revenue_window_days": max(
            int(getattr(config, "operational_revenue_window_days", 7) or 7),
            1,
        ),
        "refund_window_days": max(
            int(getattr(config, "operational_refund_window_days", 7) or 7),
            1,
        ),
    }


def _build_operational_room_metrics(*, hotel_settings_id: int) -> dict[str, Any]:
    room_queryset = Room.objects.filter(floor__hotel_settings_id=hotel_settings_id)
    total_rooms = room_queryset.count()
    available_rooms = room_queryset.filter(status__code__in=AVAILABLE_ROOM_STATUS_CODES).count()
    occupied_rooms = room_queryset.filter(status__code__in=OCCUPIED_ROOM_STATUS_CODES).count()

    occupancy_rate_pct = Decimal("0.00")
    if total_rooms > 0:
        occupancy_rate_pct = (Decimal(occupied_rooms) / Decimal(total_rooms)) * Decimal("100.00")

    return {
        "total_rooms": total_rooms,
        "available_rooms": available_rooms,
        "occupied_rooms": occupied_rooms,
        "occupancy_rate_pct": _to_decimal(occupancy_rate_pct).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        ),
    }


def _build_operational_revenue_drop_metrics(
    *,
    hotel_settings_id: int,
    reference_date: date,
    window_days: int,
) -> dict[str, Any]:
    current_start = reference_date - timedelta(days=max(window_days - 1, 0))
    current_end = reference_date
    previous_end = current_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=max(window_days - 1, 0))

    try:
        current_dashboard = build_financial_dashboard(
            hotel_settings_id=hotel_settings_id,
            start_date=current_start,
            end_date=current_end,
        )
        previous_dashboard = build_financial_dashboard(
            hotel_settings_id=hotel_settings_id,
            start_date=previous_start,
            end_date=previous_end,
        )
    except ValidationError:
        return {
            "current_revenue": MONEY_ZERO,
            "previous_revenue": MONEY_ZERO,
            "drop_pct": None,
        }

    current_revenue = _to_decimal(current_dashboard["summary"]["revenue"])
    previous_revenue = _to_decimal(previous_dashboard["summary"]["revenue"])
    if previous_revenue <= MONEY_ZERO:
        drop_pct = None
    else:
        drop_pct = ((previous_revenue - current_revenue) / previous_revenue) * Decimal("100.00")
        if drop_pct < MONEY_ZERO:
            drop_pct = MONEY_ZERO
        drop_pct = _to_decimal(drop_pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return {
        "current_revenue": current_revenue,
        "previous_revenue": previous_revenue,
        "drop_pct": drop_pct,
    }


def _build_operational_refund_metrics(
    *,
    hotel_settings_id: int,
    reference_date: date,
    window_days: int,
) -> dict[str, Any]:
    window_start = reference_date - timedelta(days=max(window_days - 1, 0))
    reservation_ids = _reservation_ids_queryset(hotel_settings_id=hotel_settings_id)
    refund_count = PaymentRefund.objects.filter(
        is_active=True,
        refund_date__date__gte=window_start,
        refund_date__date__lte=reference_date,
        status__code__in=REFUND_ALERT_STATUS_CODES,
        payment__invoice__reservation_id__in=reservation_ids,
    ).count()

    return {"refund_count": refund_count}


def _sync_operational_alert_state(
    *,
    hotel_settings_id: int,
    alert_type: str,
    title: str,
    message: str,
    severity: str,
    is_triggered: bool,
    metric_value: Decimal | None,
    threshold_value: Decimal | None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, int]:
    sync_result = {"created": 0, "updated": 0, "resolved": 0}
    now = timezone.now()

    with transaction.atomic():
        open_alerts = list(
            OperationalAlert.objects.select_for_update()
            .filter(
                hotel_settings_id=hotel_settings_id,
                alert_type=alert_type,
                status=OperationalAlert.Status.OPEN,
                is_active=True,
            )
            .order_by("-triggered_at", "-id")
        )

        if is_triggered:
            if open_alerts:
                primary = open_alerts[0]
                primary.title = title
                primary.message = message
                primary.severity = severity
                primary.metric_value = metric_value
                primary.threshold_value = threshold_value
                primary.metadata = metadata or {}
                primary.resolved_at = None
                primary.save(
                    update_fields=[
                        "title",
                        "message",
                        "severity",
                        "metric_value",
                        "threshold_value",
                        "metadata",
                        "resolved_at",
                        "updated_at",
                    ]
                )
                sync_result["updated"] += 1
            else:
                OperationalAlert.objects.create(
                    hotel_settings_id=hotel_settings_id,
                    alert_type=alert_type,
                    severity=severity,
                    status=OperationalAlert.Status.OPEN,
                    title=title,
                    message=message,
                    metric_value=metric_value,
                    threshold_value=threshold_value,
                    metadata=metadata or {},
                    is_active=True,
                )
                sync_result["created"] += 1

            duplicate_ids = [row.id for row in open_alerts[1:]]
            if duplicate_ids:
                sync_result["resolved"] += OperationalAlert.objects.filter(id__in=duplicate_ids).update(
                    status=OperationalAlert.Status.RESOLVED,
                    resolved_at=now,
                    updated_at=now,
                    message="Alerta duplicada cerrada automaticamente por consolidacion.",
                )
            return sync_result

        if open_alerts:
            open_ids = [row.id for row in open_alerts]
            sync_result["resolved"] += OperationalAlert.objects.filter(id__in=open_ids).update(
                status=OperationalAlert.Status.RESOLVED,
                resolved_at=now,
                metric_value=metric_value,
                threshold_value=threshold_value,
                metadata=metadata or {},
                message=(
                    f"{title} resuelta automaticamente. "
                    f"Metric value={metric_value}, threshold={threshold_value}."
                ),
                updated_at=now,
            )

    return sync_result


def _merge_operational_sync_result(base: dict[str, Any], updates: dict[str, int]) -> None:
    base["created"] = int(base.get("created", 0)) + int(updates.get("created", 0))
    base["updated"] = int(base.get("updated", 0)) + int(updates.get("updated", 0))
    base["resolved"] = int(base.get("resolved", 0)) + int(updates.get("resolved", 0))
