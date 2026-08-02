from django.contrib import admin

from apps.finance.models import (
    Expense,
    FinancialControlConfig,
    FinancialStatementSnapshot,
    OperationalAlert,
)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "concept",
        "expense_category",
        "payment_method",
        "amount",
        "expense_date",
        "supplier_name",
        "is_active",
    )
    search_fields = ("concept", "description", "reference", "supplier_name")
    list_filter = (
        "hotel_settings",
        "expense_category",
        "payment_method",
        "expense_date",
        "is_active",
    )


@admin.register(FinancialControlConfig)
class FinancialControlConfigAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "district_name",
        "tourism_law_enabled",
        "tourism_law_preferential_rate",
        "standard_income_tax_rate",
        "has_iva_exemption",
        "operational_high_occupancy_threshold_pct",
        "operational_low_availability_threshold_rooms",
        "operational_revenue_drop_threshold_pct",
        "operational_high_refunds_threshold_count",
        "updated_at",
    )
    search_fields = ("hotel_settings__hotel_name", "district_name")
    list_filter = ("tourism_law_enabled", "has_iva_exemption")


@admin.register(FinancialStatementSnapshot)
class FinancialStatementSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "period_year",
        "period_month",
        "current_assets",
        "current_liabilities",
        "non_current_assets",
        "non_current_liabilities",
        "is_active",
    )
    search_fields = ("hotel_settings__hotel_name", "notes")
    list_filter = ("hotel_settings", "period_year", "period_month", "is_active")


@admin.register(OperationalAlert)
class OperationalAlertAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "hotel_settings",
        "alert_type",
        "severity",
        "status",
        "metric_value",
        "threshold_value",
        "triggered_at",
        "resolved_at",
        "is_active",
    )
    search_fields = ("hotel_settings__hotel_name", "title", "message")
    list_filter = ("alert_type", "severity", "status", "is_active", "triggered_at")
