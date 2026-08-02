from rest_framework import serializers


# =========================================================
# QUERY SERIALIZERS
# =========================================================
class ReportQuerySerializer(serializers.Serializer):
    hotel_settings = serializers.IntegerField(min_value=1, required=False)
    year = serializers.IntegerField(required=False, min_value=1900, max_value=2999)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)

    def validate(self, attrs):
        year = attrs.get("year")
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if year is not None and (start_date or end_date):
            raise serializers.ValidationError(
                "Send either year or start_date/end_date, not both."
            )

        if (start_date and not end_date) or (end_date and not start_date):
            raise serializers.ValidationError(
                "start_date and end_date must be sent together."
            )

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                "start_date must be less than or equal to end_date."
            )

        return attrs


class IncomeConsolidatedQuerySerializer(serializers.Serializer):
    PERIOD_CHOICES = (
        ("ALL", "All"),
        ("TODAY", "Today"),
        ("LAST_7_DAYS", "Last 7 days"),
        ("THIS_MONTH", "This month"),
        ("THIS_YEAR", "This year"),
    )
    ACTIVITY_CHOICES = (
        ("ALL", "All"),
        ("ACTIVE", "Active"),
        ("INACTIVE", "Inactive"),
    )

    hotel_settings = serializers.IntegerField(min_value=1, required=False)
    year = serializers.IntegerField(required=False, min_value=1900, max_value=2999)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    period = serializers.ChoiceField(choices=PERIOD_CHOICES, required=False, default="THIS_MONTH")
    activity = serializers.ChoiceField(
        choices=ACTIVITY_CHOICES,
        required=False,
        default="ALL",
    )
    method = serializers.CharField(required=False, allow_blank=True, max_length=120)
    search = serializers.CharField(required=False, allow_blank=True, max_length=160)

    def validate(self, attrs):
        year = attrs.get("year")
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        if year is not None and (start_date or end_date):
            raise serializers.ValidationError(
                "Send either year or start_date/end_date, not both."
            )

        if (start_date and not end_date) or (end_date and not start_date):
            raise serializers.ValidationError(
                "start_date and end_date must be sent together."
            )

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                "start_date must be less than or equal to end_date."
            )

        method_value = str(attrs.get("method", "") or "").strip()
        search_value = str(attrs.get("search", "") or "").strip()
        attrs["method"] = method_value
        attrs["search"] = search_value
        return attrs


# =========================================================
# COMMON SERIALIZERS
# =========================================================
class ReportFiltersSerializer(serializers.Serializer):
    hotel_settings = serializers.IntegerField()
    year = serializers.IntegerField(allow_null=True)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    generated_at = serializers.DateTimeField()


class ValueWithVariationPctSerializer(serializers.Serializer):
    value = serializers.FloatField()
    variation_pct = serializers.FloatField(allow_null=True)


class ValueWithVariationPointsSerializer(serializers.Serializer):
    value = serializers.FloatField()
    variation_points = serializers.FloatField(allow_null=True)


class ValueWithVariationValueSerializer(serializers.Serializer):
    value = serializers.FloatField()
    variation_value = serializers.FloatField(allow_null=True)


class OccupancyPeakSerializer(serializers.Serializer):
    value = serializers.FloatField()
    month = serializers.CharField()


class MonthlyIncomeProfitItemSerializer(serializers.Serializer):
    month = serializers.CharField()
    income = serializers.FloatField()
    profit = serializers.FloatField()


class WeeklyOccupancyItemSerializer(serializers.Serializer):
    week = serializers.CharField()
    occupied_rooms = serializers.IntegerField()
    occupancy_rate_pct = serializers.FloatField()


class PaymentMethodSummarySerializer(serializers.Serializer):
    method = serializers.CharField()
    amount = serializers.FloatField()
    pct = serializers.FloatField()


class PaymentBreakdownSerializer(serializers.Serializer):
    method = serializers.CharField()
    transactions_pct = serializers.FloatField()
    amount = serializers.FloatField()
    amount_pct = serializers.FloatField()


class TopGuestSerializer(serializers.Serializer):
    guest_name = serializers.CharField()
    country = serializers.CharField()
    stays = serializers.IntegerField()
    nights = serializers.IntegerField()
    total_spent = serializers.FloatField()
    segment = serializers.CharField()


class GuestOriginItemSerializer(serializers.Serializer):
    country = serializers.CharField()
    pct = serializers.FloatField()


class MonthlyIncomeExpensesItemSerializer(serializers.Serializer):
    month = serializers.CharField()
    income = serializers.FloatField()
    expenses = serializers.FloatField()


class MonthlyNetProfitItemSerializer(serializers.Serializer):
    month = serializers.CharField()
    value = serializers.FloatField()


class MonthlyOccupancyRateItemSerializer(serializers.Serializer):
    month = serializers.CharField()
    pct = serializers.FloatField()


class OccupiedRoomsByMonthItemSerializer(serializers.Serializer):
    month = serializers.CharField()
    rooms = serializers.IntegerField()


class RoomTypePerformanceItemSerializer(serializers.Serializer):
    room_type = serializers.CharField()
    occupancy_pct = serializers.FloatField()
    avg_stay = serializers.FloatField()
    income = serializers.FloatField()


class TopCategorySerializer(serializers.Serializer):
    name = serializers.CharField()
    amount = serializers.FloatField()


class IncomeByCategoryItemSerializer(serializers.Serializer):
    category = serializers.CharField()
    amount = serializers.FloatField()


class TransactionsByCategoryItemSerializer(serializers.Serializer):
    category = serializers.CharField()
    transactions = serializers.IntegerField()


class CategoryDetailItemSerializer(serializers.Serializer):
    category = serializers.CharField()
    income = serializers.FloatField()
    transactions = serializers.IntegerField()
    average_ticket = serializers.FloatField()
    share_pct = serializers.FloatField()
    trend_pct = serializers.FloatField(allow_null=True)


class IncomeConsolidatedSummarySerializer(serializers.Serializer):
    total_transactions = serializers.IntegerField()
    active_transactions = serializers.IntegerField()
    total_collected = serializers.FloatField()
    today_collected = serializers.FloatField()
    month_collected = serializers.FloatField()
    average_ticket = serializers.FloatField()


class IncomeConsolidatedDailyRowSerializer(serializers.Serializer):
    date_key = serializers.CharField()
    date_label = serializers.CharField()
    transactions = serializers.IntegerField()
    active_transactions = serializers.IntegerField()
    inactive_transactions = serializers.IntegerField()
    total_amount = serializers.FloatField()
    average_ticket = serializers.FloatField()
    top_method = serializers.CharField()
    top_guest = serializers.CharField()


class IncomeConsolidatedMethodRowSerializer(serializers.Serializer):
    method_key = serializers.CharField()
    method_label = serializers.CharField()
    transactions = serializers.IntegerField()
    active_transactions = serializers.IntegerField()
    inactive_transactions = serializers.IntegerField()
    total_amount = serializers.FloatField()
    average_ticket = serializers.FloatField()
    share_percent = serializers.FloatField()


class IncomeConsolidatedFiltersSerializer(serializers.Serializer):
    hotel_settings = serializers.IntegerField()
    period = serializers.CharField()
    activity = serializers.CharField()
    method = serializers.CharField()
    search = serializers.CharField()
    year = serializers.IntegerField(allow_null=True)
    start_date = serializers.DateField(allow_null=True)
    end_date = serializers.DateField(allow_null=True)
    generated_at = serializers.DateTimeField()


class IncomeConsolidatedReportSerializer(serializers.Serializer):
    filters = IncomeConsolidatedFiltersSerializer()
    summary = IncomeConsolidatedSummarySerializer()
    daily_rows = IncomeConsolidatedDailyRowSerializer(many=True)
    method_rows = IncomeConsolidatedMethodRowSerializer(many=True)


# =========================================================
# EXECUTIVE REPORT SERIALIZERS
# =========================================================
class ExecutiveKpisSerializer(serializers.Serializer):
    annual_income = ValueWithVariationPctSerializer()
    net_profit = ValueWithVariationPctSerializer()
    average_occupancy = ValueWithVariationPctSerializer()
    revpar = ValueWithVariationPctSerializer()


class ExecutiveReportSerializer(serializers.Serializer):
    filters = ReportFiltersSerializer()
    kpis = ExecutiveKpisSerializer()
    income_vs_profit_chart = MonthlyIncomeProfitItemSerializer(many=True)
    payment_methods = PaymentMethodSummarySerializer(many=True)
    weekly_occupancy = WeeklyOccupancyItemSerializer(many=True)
    top_guests = TopGuestSerializer(many=True)


# =========================================================
# REVENUE REPORT SERIALIZERS
# =========================================================
class RevenueKpisSerializer(serializers.Serializer):
    gross_income = ValueWithVariationPctSerializer()
    total_expenses = ValueWithVariationPctSerializer()
    net_profit = ValueWithVariationPctSerializer()
    net_margin = ValueWithVariationPointsSerializer()


class RevenueReportSerializer(serializers.Serializer):
    filters = ReportFiltersSerializer()
    kpis = RevenueKpisSerializer()
    monthly_income_vs_expenses = MonthlyIncomeExpensesItemSerializer(many=True)
    monthly_net_profit = MonthlyNetProfitItemSerializer(many=True)
    payment_breakdown = PaymentBreakdownSerializer(many=True)
    guest_origin = GuestOriginItemSerializer(many=True)


# =========================================================
# OCCUPANCY REPORT SERIALIZERS
# =========================================================
class AverageStayKpiSerializer(serializers.Serializer):
    value = serializers.FloatField()
    variation_nights = serializers.FloatField(allow_null=True)


class TotalGuestsKpiSerializer(serializers.Serializer):
    value = serializers.IntegerField()
    variation_pct = serializers.FloatField(allow_null=True)


class OccupancyKpisSerializer(serializers.Serializer):
    average_occupancy = ValueWithVariationPctSerializer()
    occupancy_peak = OccupancyPeakSerializer()
    average_stay = AverageStayKpiSerializer()
    total_guests = TotalGuestsKpiSerializer()


class OccupancyReportSerializer(serializers.Serializer):
    filters = ReportFiltersSerializer()
    kpis = OccupancyKpisSerializer()
    monthly_occupancy_rate = MonthlyOccupancyRateItemSerializer(many=True)
    by_room_type = RoomTypePerformanceItemSerializer(many=True)
    occupied_rooms_by_month = OccupiedRoomsByMonthItemSerializer(many=True)
    room_type_performance = RoomTypePerformanceItemSerializer(many=True)


# =========================================================
# SERVICES REPORT SERIALIZERS
# =========================================================
class ServicesKpisSerializer(serializers.Serializer):
    service_income = ValueWithVariationPctSerializer()
    transactions = ValueWithVariationPctSerializer()
    average_ticket = ValueWithVariationValueSerializer()
    top_category = TopCategorySerializer()


class ServicesReportSerializer(serializers.Serializer):
    filters = ReportFiltersSerializer()
    kpis = ServicesKpisSerializer()
    income_by_category = IncomeByCategoryItemSerializer(many=True)
    transactions_by_category = TransactionsByCategoryItemSerializer(many=True)
    category_detail = CategoryDetailItemSerializer(many=True)
