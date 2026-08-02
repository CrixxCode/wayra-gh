from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from apps.hotel_settings.models import HotelSettings
from apps.master_data.models import MasterData


MONEY_ZERO = Decimal("0.00")


class Expense(models.Model):
    class ExpenseType(models.TextChoices):
        OPERATING_COST = "OPERATING_COST", "Operating cost"
        ADMIN_EXPENSE = "ADMIN_EXPENSE", "Administrative expense"
        SALES_EXPENSE = "SALES_EXPENSE", "Sales expense"

    class CostBehavior(models.TextChoices):
        FIXED = "FIXED", "Fixed"
        VARIABLE = "VARIABLE", "Variable"

    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    expense_category = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="expenses_by_category",
        limit_choices_to={"group": MasterData.Group.EXPENSE_CATEGORY},
    )
    payment_method = models.ForeignKey(
        MasterData,
        on_delete=models.PROTECT,
        related_name="expenses_by_payment_method",
        limit_choices_to={"group": MasterData.Group.PAYMENT_METHOD},
        blank=True,
        null=True,
    )

    concept = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    expense_date = models.DateField()
    expense_type = models.CharField(
        max_length=30,
        choices=ExpenseType.choices,
        default=ExpenseType.ADMIN_EXPENSE,
        db_index=True,
    )
    cost_behavior = models.CharField(
        max_length=20,
        choices=CostBehavior.choices,
        default=CostBehavior.FIXED,
        db_index=True,
    )

    reference = models.CharField(max_length=100, blank=True, null=True)
    supplier_name = models.CharField(max_length=150, blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "expense"
        ordering = ["-id"]

    @property
    def expense_category_code(self):
        return self.expense_category.code if self.expense_category else None

    @property
    def payment_method_code(self):
        return self.payment_method.code if self.payment_method else None

    @property
    def expense_type_code(self):
        return self.expense_type

    @property
    def cost_behavior_code(self):
        return self.cost_behavior

    def clean(self):
        errors = {}

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Expense amount must be greater than 0."

        if self.expense_category and self.expense_category.group != MasterData.Group.EXPENSE_CATEGORY:
            errors["expense_category"] = "The selected category must belong to EXPENSE_CATEGORY."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.concept} - {self.hotel_settings.hotel_name}"


class FinancialControlConfig(models.Model):
    hotel_settings = models.OneToOneField(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="financial_control_config",
    )

    district_name = models.CharField(max_length=120, default="Riohacha")
    tourism_law_enabled = models.BooleanField(default=True)
    tourism_law_preferential_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("9.00"),
    )
    standard_income_tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("35.00"),
    )
    has_iva_exemption = models.BooleanField(default=False)
    iva_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("19.00"),
    )
    ica_rate_per_thousand = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=Decimal("9.6600"),
    )
    fontur_rate_per_thousand = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=Decimal("2.5000"),
    )
    break_even_warning_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("90.00"),
    )
    break_even_optimal_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("110.00"),
    )
    operational_high_occupancy_threshold_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("85.00"),
    )
    operational_low_availability_threshold_rooms = models.PositiveIntegerField(default=3)
    operational_revenue_drop_threshold_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("20.00"),
    )
    operational_high_refunds_threshold_count = models.PositiveIntegerField(default=5)
    operational_revenue_window_days = models.PositiveIntegerField(default=7)
    operational_refund_window_days = models.PositiveIntegerField(default=7)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "financial_control_config"
        ordering = ["hotel_settings__hotel_name", "id"]

    def clean(self):
        errors = {}

        rate_fields = {
            "tourism_law_preferential_rate": self.tourism_law_preferential_rate,
            "standard_income_tax_rate": self.standard_income_tax_rate,
            "iva_rate": self.iva_rate,
            "ica_rate_per_thousand": self.ica_rate_per_thousand,
            "fontur_rate_per_thousand": self.fontur_rate_per_thousand,
            "break_even_warning_pct": self.break_even_warning_pct,
            "break_even_optimal_pct": self.break_even_optimal_pct,
            "operational_high_occupancy_threshold_pct": self.operational_high_occupancy_threshold_pct,
            "operational_revenue_drop_threshold_pct": self.operational_revenue_drop_threshold_pct,
        }
        for field_name, value in rate_fields.items():
            if value is not None and value < 0:
                errors[field_name] = "This value cannot be negative."
            if value is not None and field_name in {
                "operational_high_occupancy_threshold_pct",
                "operational_revenue_drop_threshold_pct",
            } and value > Decimal("100.00"):
                errors[field_name] = "This value cannot be greater than 100."

        if (
            self.break_even_warning_pct is not None
            and self.break_even_optimal_pct is not None
            and self.break_even_optimal_pct < self.break_even_warning_pct
        ):
            errors["break_even_optimal_pct"] = (
                "Optimal threshold must be greater than or equal to warning threshold."
            )

        if self.operational_revenue_window_days < 1:
            errors["operational_revenue_window_days"] = "This value must be greater than or equal to 1."

        if self.operational_refund_window_days < 1:
            errors["operational_refund_window_days"] = "This value must be greater than or equal to 1."

        if self.operational_high_refunds_threshold_count < 1:
            errors["operational_high_refunds_threshold_count"] = (
                "This value must be greater than or equal to 1."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"Financial config - {self.hotel_settings.hotel_name}"


class OperationalAlert(models.Model):
    class AlertType(models.TextChoices):
        HIGH_OCCUPANCY = "HIGH_OCCUPANCY", "High occupancy"
        LOW_AVAILABILITY = "LOW_AVAILABILITY", "Low availability"
        REVENUE_DROP = "REVENUE_DROP", "Revenue drop"
        HIGH_REFUNDS = "HIGH_REFUNDS", "High refunds"

    class Severity(models.TextChoices):
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="operational_alerts",
    )
    alert_type = models.CharField(
        max_length=30,
        choices=AlertType.choices,
        db_index=True,
    )
    severity = models.CharField(
        max_length=15,
        choices=Severity.choices,
        default=Severity.WARNING,
        db_index=True,
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )

    title = models.CharField(max_length=180)
    message = models.TextField()
    metric_value = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    threshold_value = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    triggered_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "operational_alert"
        ordering = ["-triggered_at", "-id"]
        indexes = [
            models.Index(fields=["hotel_settings", "status", "alert_type", "is_active"]),
        ]

    def __str__(self):
        return f"{self.hotel_settings.hotel_name} - {self.alert_type} - {self.status}"


class FinancialStatementSnapshot(models.Model):
    MONTH_CHOICES = tuple((month, f"{month:02d}") for month in range(1, 13))

    hotel_settings = models.ForeignKey(
        HotelSettings,
        on_delete=models.CASCADE,
        related_name="financial_statement_snapshots",
    )
    period_year = models.PositiveIntegerField()
    period_month = models.PositiveSmallIntegerField(
        choices=MONTH_CHOICES,
        default=12,
    )

    cash_and_equivalents = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    trade_receivables = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    current_financial_assets = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    inventories = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    current_assets = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    property_plant_equipment = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    non_current_financial_assets = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    intangibles_other = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    non_current_assets = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    accounts_payable = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    financial_obligations_current = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    trade_creditors = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    provision_income_tax = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    provision_ica = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    provision_fontur = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    other_tax_provisions = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    taxes_payable = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    current_liabilities = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    financial_obligations_non_current = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    non_current_liabilities = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    equity_capital = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    equity_reserves = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    equity_surplus = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    retained_earnings = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    depreciation_expense = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    financial_income = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    financial_expense = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    income_tax_expense = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    other_income_expense = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    other_comprehensive_income = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    average_accounts_receivable = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)
    net_credit_sales = models.DecimalField(max_digits=14, decimal_places=2, default=MONEY_ZERO)

    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "financial_statement_snapshot"
        ordering = ["-period_year", "-period_month", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["hotel_settings", "period_year", "period_month"],
                name="uq_financial_snapshot_period",
            )
        ]

    @property
    def total_assets(self):
        return (self.current_assets or MONEY_ZERO) + (self.non_current_assets or MONEY_ZERO)

    @property
    def total_liabilities(self):
        return (self.current_liabilities or MONEY_ZERO) + (self.non_current_liabilities or MONEY_ZERO)

    @property
    def total_tax_provisions(self):
        return (
            (self.provision_income_tax or MONEY_ZERO)
            + (self.provision_ica or MONEY_ZERO)
            + (self.provision_fontur or MONEY_ZERO)
            + (self.other_tax_provisions or MONEY_ZERO)
        )

    @property
    def total_equity(self):
        return (
            (self.equity_capital or MONEY_ZERO)
            + (self.equity_reserves or MONEY_ZERO)
            + (self.equity_surplus or MONEY_ZERO)
            + (self.retained_earnings or MONEY_ZERO)
        )

    @property
    def current_ratio(self):
        if not self.current_liabilities or self.current_liabilities <= 0:
            return None
        return (self.current_assets or MONEY_ZERO) / self.current_liabilities

    @property
    def indebtedness_ratio(self):
        if not self.total_liabilities or self.total_liabilities <= 0:
            return None
        return self.total_assets / self.total_liabilities

    @property
    def receivables_turnover(self):
        if not self.average_accounts_receivable or self.average_accounts_receivable <= 0:
            return None
        return (self.net_credit_sales or MONEY_ZERO) / self.average_accounts_receivable

    def recalculate_balances(self):
        self.taxes_payable = self.total_tax_provisions
        self.current_assets = (
            (self.cash_and_equivalents or MONEY_ZERO)
            + (self.trade_receivables or MONEY_ZERO)
            + (self.current_financial_assets or MONEY_ZERO)
            + (self.inventories or MONEY_ZERO)
        )
        self.non_current_assets = (
            (self.property_plant_equipment or MONEY_ZERO)
            + (self.non_current_financial_assets or MONEY_ZERO)
            + (self.intangibles_other or MONEY_ZERO)
        )
        self.current_liabilities = (
            (self.accounts_payable or MONEY_ZERO)
            + (self.financial_obligations_current or MONEY_ZERO)
            + (self.trade_creditors or MONEY_ZERO)
            + (self.taxes_payable or MONEY_ZERO)
        )
        self.non_current_liabilities = self.financial_obligations_non_current or MONEY_ZERO

    def clean(self):
        errors = {}

        if self.period_year and (self.period_year < 1900 or self.period_year > 2999):
            errors["period_year"] = "Year must be between 1900 and 2999."

        if self.period_month and (self.period_month < 1 or self.period_month > 12):
            errors["period_month"] = "Month must be between 1 and 12."

        non_negative_fields = [
            "cash_and_equivalents",
            "trade_receivables",
            "current_financial_assets",
            "inventories",
            "current_assets",
            "property_plant_equipment",
            "non_current_financial_assets",
            "intangibles_other",
            "non_current_assets",
            "accounts_payable",
            "financial_obligations_current",
            "trade_creditors",
            "provision_income_tax",
            "provision_ica",
            "provision_fontur",
            "other_tax_provisions",
            "taxes_payable",
            "current_liabilities",
            "financial_obligations_non_current",
            "non_current_liabilities",
            "equity_capital",
            "equity_reserves",
            "equity_surplus",
            "retained_earnings",
            "depreciation_expense",
            "financial_income",
            "financial_expense",
            "income_tax_expense",
            "average_accounts_receivable",
            "net_credit_sales",
        ]
        for field_name in non_negative_fields:
            value = getattr(self, field_name, MONEY_ZERO)
            if value is not None and value < 0:
                errors[field_name] = "This value cannot be negative."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.recalculate_balances()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"{self.hotel_settings.hotel_name} - "
            f"{self.period_year}-{self.period_month:02d}"
        )
