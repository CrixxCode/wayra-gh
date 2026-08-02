from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin
from apps.finance.models import (
    Expense,
    FinancialControlConfig,
    OperationalAlert,
    FinancialStatementSnapshot,
)
from apps.finance.serializers import (
    ExpenseSerializer,
    FinancialControlConfigSerializer,
    OperationalAlertSerializer,
    FinancialStatementSnapshotSerializer,
)
from apps.hotel_settings.models import HotelSettings
from apps.finance.services import (
    build_financial_dashboard,
    build_financial_statements,
    sync_operational_alerts_for_all_hotels,
    sync_operational_alerts_for_hotel,
    build_what_if_scenario,
    parse_decimal_param,
    resolve_period,
    resolve_year_month,
)


class FinancialControlSchemaSerializer(serializers.Serializer):
    payload = serializers.JSONField(required=False)


class ExpenseViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Expense.objects.select_related(
            "hotel_settings",
            "expense_category",
            "payment_method",
        )
    )
    tenant_filter = "hotel_settings"
    serializer_class = ExpenseSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["expenses.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["hotel_settings", "expense_category", "payment_method", "is_active"]
    search_fields = [
        "concept",
        "description",
        "reference",
        "supplier_name",
        "hotel_settings__hotel_name",
        "expense_category__name",
        "expense_category__code",
        "payment_method__name",
        "payment_method__code",
    ]
    ordering_fields = [
        "id",
        "concept",
        "amount",
        "expense_date",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["expenses.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class FinancialControlConfigViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = FinancialControlConfig.objects.select_related("hotel_settings")
    tenant_filter = "hotel_settings"
    serializer_class = FinancialControlConfigSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["financial_control.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["hotel_settings"]
    search_fields = ["hotel_settings__hotel_name", "district_name"]
    ordering_fields = [
        "id",
        "hotel_settings__hotel_name",
        "district_name",
        "updated_at",
        "created_at",
    ]
    ordering = ["hotel_settings__hotel_name"]

    def get_base_queryset(self):
        return self.queryset.order_by("hotel_settings__hotel_name")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["financial_control.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class OperationalAlertViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = OperationalAlert.objects.select_related("hotel_settings")
    tenant_filter = "hotel_settings"
    serializer_class = OperationalAlertSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["financial_control.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["hotel_settings", "alert_type", "severity", "status", "is_active"]
    search_fields = ["title", "message", "hotel_settings__hotel_name", "alert_type"]
    ordering_fields = [
        "id",
        "alert_type",
        "severity",
        "status",
        "metric_value",
        "threshold_value",
        "triggered_at",
        "resolved_at",
        "updated_at",
        "created_at",
    ]
    ordering = ["-triggered_at", "-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-triggered_at", "-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["financial_control.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        try:
            user = request.user
            raw_hotel_settings = (
                request.data.get("hotel_settings")
                if isinstance(request.data, dict)
                else None
            )
            if raw_hotel_settings is None:
                raw_hotel_settings = request.query_params.get("hotel_settings")

            if is_effective_global_admin(user):
                if raw_hotel_settings in (None, ""):
                    payload = sync_operational_alerts_for_all_hotels()
                    return Response(payload, status=status.HTTP_200_OK)

                hotel_settings_id = int(raw_hotel_settings)
                payload = sync_operational_alerts_for_hotel(hotel_settings_id=hotel_settings_id)
                return Response(payload, status=status.HTTP_200_OK)

            if user.hotel_settings_id is None:
                return Response(
                    {"hotel_settings": "El usuario autenticado no tiene un hotel asignado."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if raw_hotel_settings not in (None, ""):
                requested_hotel_settings_id = int(raw_hotel_settings)
                if requested_hotel_settings_id != user.hotel_settings_id:
                    return Response(
                        {
                            "hotel_settings": (
                                "No puedes sincronizar alertas para un hotel diferente al "
                                "hotel del usuario autenticado."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            payload = sync_operational_alerts_for_hotel(
                hotel_settings_id=user.hotel_settings_id
            )
            return Response(payload, status=status.HTTP_200_OK)

        except (TypeError, ValueError):
            return Response(
                {"hotel_settings": "hotel_settings must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class FinancialStatementSnapshotViewSet(TenantScopeMixin, LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = FinancialStatementSnapshot.objects.select_related("hotel_settings")
    tenant_filter = "hotel_settings"
    serializer_class = FinancialStatementSnapshotSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["financial_control.read"]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["hotel_settings", "period_year", "period_month", "is_active"]
    search_fields = ["hotel_settings__hotel_name", "notes"]
    ordering_fields = [
        "id",
        "period_year",
        "period_month",
        "created_at",
        "updated_at",
    ]
    ordering = ["-period_year", "-period_month", "-id"]

    def get_base_queryset(self):
        return self.queryset.order_by("-period_year", "-period_month", "-id")

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["financial_control.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()


class FinancialControlViewSet(viewsets.ViewSet):
    serializer_class = FinancialControlSchemaSerializer
    permission_classes = [HasResourcePermission]
    required_scopes = ["financial_control.read"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["financial_control.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def list(self, request):
        return Response(
            {
                "endpoints": {
                    "dashboard": "/api/financial-control/dashboard/",
                    "what_if": "/api/financial-control/what-if/",
                    "statements": "/api/financial-control/statements/",
                }
            }
        )

    @action(detail=False, methods=["get"], url_path="dashboard")
    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def dashboard(self, request):
        try:
            hotel_settings_id = self._resolve_hotel_settings_id()
            start_date, end_date = resolve_period(
                start_date_raw=request.query_params.get("start_date"),
                end_date_raw=request.query_params.get("end_date"),
            )
            payload = build_financial_dashboard(
                hotel_settings_id=hotel_settings_id,
                start_date=start_date,
                end_date=end_date,
            )
            return Response(payload)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="what-if")
    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def what_if(self, request):
        try:
            hotel_settings_id = self._resolve_hotel_settings_id()
            start_date, end_date = resolve_period(
                start_date_raw=request.query_params.get("start_date"),
                end_date_raw=request.query_params.get("end_date"),
            )
            rate_change_pct = parse_decimal_param(
                value=request.query_params.get("rate_change_pct"),
                field="rate_change_pct",
                default=Decimal("0"),
            )
            occupancy_change_pct = parse_decimal_param(
                value=request.query_params.get("occupancy_change_pct"),
                field="occupancy_change_pct",
                default=Decimal("0"),
            )
            target_occupancy_raw = request.query_params.get("target_occupancy_pct")
            target_occupancy_pct = (
                parse_decimal_param(
                    value=target_occupancy_raw,
                    field="target_occupancy_pct",
                )
                if target_occupancy_raw is not None and str(target_occupancy_raw).strip() != ""
                else None
            )
            operating_cost_change_pct = parse_decimal_param(
                value=request.query_params.get("operating_cost_change_pct"),
                field="operating_cost_change_pct",
                default=Decimal("0"),
            )
            payload = build_what_if_scenario(
                hotel_settings_id=hotel_settings_id,
                start_date=start_date,
                end_date=end_date,
                rate_change_pct=rate_change_pct,
                occupancy_change_pct=occupancy_change_pct,
                target_occupancy_pct=target_occupancy_pct,
                operating_cost_change_pct=operating_cost_change_pct,
            )
            return Response(payload)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="statements")
    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def statements(self, request):
        try:
            hotel_settings_id = self._resolve_hotel_settings_id()
            year, month = resolve_year_month(
                year_raw=request.query_params.get("year"),
                month_raw=request.query_params.get("month"),
            )
            payload = build_financial_statements(
                hotel_settings_id=hotel_settings_id,
                year=year,
                month=month,
            )
            return Response(payload)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    def _resolve_hotel_settings_id(self) -> int:
        user = self.request.user

        if not user or not user.is_authenticated:
            raise DjangoValidationError({"detail": "Authentication required."})

        if is_effective_global_admin(user):
            raw_value = (self.request.query_params.get("hotel_settings") or "").strip()
            if not raw_value:
                raise DjangoValidationError(
                    {"hotel_settings": "hotel_settings query parameter is required for superadmin."}
                )
            if not raw_value.isdigit():
                raise DjangoValidationError({"hotel_settings": "hotel_settings must be a valid integer."})
            hotel_settings_id = int(raw_value)
            if not HotelSettings.objects.filter(id=hotel_settings_id).exists():
                raise DjangoValidationError({"hotel_settings": "The selected hotel_settings does not exist."})
            return hotel_settings_id

        hotel_settings_id = getattr(user, "hotel_settings_id", None)
        if hotel_settings_id is None:
            raise DjangoValidationError(
                {"hotel_settings": "El usuario autenticado no tiene un hotel asignado."}
            )

        raw_value = (self.request.query_params.get("hotel_settings") or "").strip()
        if raw_value:
            if not raw_value.isdigit():
                raise DjangoValidationError({"hotel_settings": "hotel_settings must be a valid integer."})

            requested_hotel_settings_id = int(raw_value)
            if requested_hotel_settings_id != hotel_settings_id:
                raise DjangoValidationError(
                    {
                        "hotel_settings": (
                            "No puedes consultar dashboards financieros para un hotel "
                            "diferente al hotel del usuario autenticado."
                        )
                    }
                )
        return hotel_settings_id

    def _validation_error_response(self, exc: DjangoValidationError):
        if hasattr(exc, "message_dict"):
            payload = exc.message_dict
        elif hasattr(exc, "messages"):
            payload = {"detail": exc.messages}
        else:
            payload = {"detail": str(exc)}
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)
