from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasResourcePermission
from accounts.tenancy import is_effective_global_admin
from apps.hotel_settings.models import HotelSettings
from apps.reports.exporters import render as render_export
from apps.reports.serializers import (
    ExecutiveReportSerializer,
    IncomeConsolidatedQuerySerializer,
    IncomeConsolidatedReportSerializer,
    OccupancyReportSerializer,
    ReportQuerySerializer,
    RevenueReportSerializer,
    ServicesReportSerializer,
)
from apps.reports.services import (
    build_income_consolidated_report,
    build_executive_report,
    build_occupancy_report,
    build_revenue_report,
    build_services_report,
    parse_hotel_settings_id,
    resolve_income_consolidated_period,
    resolve_report_period,
)


class ReportsSchemaSerializer(serializers.Serializer):
    payload = serializers.JSONField(required=False)


class ReportsViewSet(viewsets.ViewSet):
    serializer_class = ReportsSchemaSerializer
    permission_classes = [HasResourcePermission]
    required_scopes = ["reports.read"]

    def get_required_scopes(self):
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def list(self, request):
        return Response(
            {
                "endpoints": {
                    "executive": "/api/reports/executive/",
                    "revenue": "/api/reports/revenue/",
                    "occupancy": "/api/reports/occupancy/",
                    "services": "/api/reports/services/",
                    "income_consolidated": "/api/reports/income-consolidated/",
                }
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="executive")
    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses=ExecutiveReportSerializer,
    )
    def executive(self, request):
        try:
            payload = self._build_payload(
                request=request,
                builder=build_executive_report,
                response_serializer_class=ExecutiveReportSerializer,
            )
            return Response(payload, status=status.HTTP_200_OK)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="revenue")
    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses=RevenueReportSerializer,
    )
    def revenue(self, request):
        try:
            payload = self._build_payload(
                request=request,
                builder=build_revenue_report,
                response_serializer_class=RevenueReportSerializer,
            )
            return Response(payload, status=status.HTTP_200_OK)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="occupancy")
    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses=OccupancyReportSerializer,
    )
    def occupancy(self, request):
        try:
            payload = self._build_payload(
                request=request,
                builder=build_occupancy_report,
                response_serializer_class=OccupancyReportSerializer,
            )
            return Response(payload, status=status.HTTP_200_OK)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="services")
    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses=ServicesReportSerializer,
    )
    def services(self, request):
        try:
            payload = self._build_payload(
                request=request,
                builder=build_services_report,
                response_serializer_class=ServicesReportSerializer,
            )
            return Response(payload, status=status.HTTP_200_OK)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    @action(detail=False, methods=["get"], url_path="income-consolidated")
    @extend_schema(
        parameters=[IncomeConsolidatedQuerySerializer],
        responses=IncomeConsolidatedReportSerializer,
    )
    def income_consolidated(self, request):
        try:
            return Response(self._income_consolidated_payload(request), status=status.HTTP_200_OK)
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

    # Reporte -> (titulo del documento, builder, serializer). `income-consolidated` tiene sus
    # propios filtros y se arma aparte.
    EXPORTABLE_REPORTS = {
        "executive": ("Resumen ejecutivo", build_executive_report, ExecutiveReportSerializer),
        "revenue": ("Ingresos y facturacion", build_revenue_report, RevenueReportSerializer),
        "occupancy": ("Ocupacion", build_occupancy_report, OccupancyReportSerializer),
        "services": ("Servicios y consumos", build_services_report, ServicesReportSerializer),
        "income-consolidated": ("Consolidado de ingresos", None, None),
    }

    @extend_schema(
        parameters=[ReportQuerySerializer],
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY},
    )
    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        """
        Reporte completo en PDF o Excel: `?report=<executive|revenue|occupancy|services|
        income-consolidated>&output=<pdf|xlsx>` mas los mismos filtros de cada reporte
        (auditoria, Bloque 11 #6-7 y Bloque 9 #11). `output` y no `format`: DRF reserva
        `?format=` para elegir el renderer.
        """
        report = str(request.query_params.get("report") or "").strip()
        output = str(request.query_params.get("output") or "pdf").strip().lower()
        if report not in self.EXPORTABLE_REPORTS:
            return Response({"report": "Reporte desconocido."}, status=status.HTTP_400_BAD_REQUEST)
        if output not in ("pdf", "xlsx"):
            return Response({"output": "Usa pdf o xlsx."}, status=status.HTTP_400_BAD_REQUEST)

        title, builder, serializer_class = self.EXPORTABLE_REPORTS[report]
        try:
            if report == "income-consolidated":
                payload = self._income_consolidated_payload(request)
            else:
                payload = self._build_payload(
                    request=request, builder=builder, response_serializer_class=serializer_class
                )
        except DjangoValidationError as exc:
            return self._validation_error_response(exc)

        filters = payload.get("filters") or {}
        hotel_name = (
            HotelSettings.objects.filter(pk=filters.get("hotel_settings"))
            .values_list("hotel_name", flat=True)
            .first()
            or ""
        )
        content, content_type, extension = render_export(output, title, payload, hotel_name=hotel_name)
        period = "-".join(str(filters.get(key) or "") for key in ("start_date", "end_date")).strip("-")
        filename = f"reporte-{report}{'-' + period if period else ''}.{extension}"
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _income_consolidated_payload(self, request):
        query_serializer = IncomeConsolidatedQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        validated = query_serializer.validated_data

        hotel_settings_id = self._resolve_hotel_settings_id(validated)
        start_date, end_date, period_key = resolve_income_consolidated_period(
            period_raw=validated.get("period"),
            year_raw=str(validated["year"]) if "year" in validated else None,
            start_date_raw=validated.get("start_date").isoformat() if validated.get("start_date") else None,
            end_date_raw=validated.get("end_date").isoformat() if validated.get("end_date") else None,
        )

        payload = build_income_consolidated_report(
            hotel_settings_id=hotel_settings_id,
            start_date=start_date,
            end_date=end_date,
            period=period_key,
            activity=validated.get("activity", "ALL"),
            method=validated.get("method", ""),
            search=validated.get("search", ""),
        )
        return IncomeConsolidatedReportSerializer(payload).data

    def _build_payload(self, *, request, builder, response_serializer_class):
        query_serializer = ReportQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        validated = query_serializer.validated_data

        hotel_settings_id = self._resolve_hotel_settings_id(validated)

        if "year" in validated:
            start_date, end_date, _ = resolve_report_period(
                year_raw=str(validated["year"]),
            )
        elif "start_date" in validated and "end_date" in validated:
            start_date, end_date, _ = resolve_report_period(
                start_date_raw=validated["start_date"].isoformat(),
                end_date_raw=validated["end_date"].isoformat(),
            )
        else:
            start_date, end_date, _ = resolve_report_period()

        payload = builder(
            hotel_settings_id=hotel_settings_id,
            start_date=start_date,
            end_date=end_date,
        )

        serializer = response_serializer_class(payload)
        return serializer.data

    def _resolve_hotel_settings_id(self, validated):
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            raise DjangoValidationError({"detail": "Authentication required."})

        hotel_settings_raw = validated.get("hotel_settings")
        if not is_effective_global_admin(user):
            user_hotel_settings_id = getattr(user, "hotel_settings_id", None)
            if user_hotel_settings_id is None:
                raise DjangoValidationError(
                    {"hotel_settings": "El usuario autenticado no tiene un hotel asignado."}
                )

            if hotel_settings_raw is not None:
                requested_hotel_settings_id = parse_hotel_settings_id(hotel_settings_raw)
                if requested_hotel_settings_id != user_hotel_settings_id:
                    raise DjangoValidationError(
                        {
                            "hotel_settings": (
                                "No puedes consultar reportes para un hotel diferente al "
                                "hotel del usuario autenticado."
                            )
                        }
                    )
            return user_hotel_settings_id

        if hotel_settings_raw is not None:
            return parse_hotel_settings_id(hotel_settings_raw)

        hotel_settings_ids = list(
            HotelSettings.objects.order_by("id").values_list("id", flat=True)
        )
        if len(hotel_settings_ids) == 1:
            return hotel_settings_ids[0]

        if not hotel_settings_ids:
            raise DjangoValidationError(
                {
                    "hotel_settings": (
                        "No hotel settings found. Create one or send hotel_settings in query params."
                    )
                }
            )

        raise DjangoValidationError(
            {
                "hotel_settings": (
                    "hotel_settings is required when multiple hotels are configured."
                )
            }
        )

    def _validation_error_response(self, exc):
        if hasattr(exc, "message_dict"):
            payload = exc.message_dict
        elif hasattr(exc, "messages"):
            payload = {"detail": exc.messages}
        else:
            payload = {"detail": str(exc)}
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)
