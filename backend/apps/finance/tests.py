from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Resource, Role
from apps.billing.models import Charge, Invoice, Payment, PaymentRefund
from apps.clients.models import Client
from apps.finance.models import (
    Expense,
    FinancialControlConfig,
    FinancialStatementSnapshot,
    OperationalAlert,
)
from apps.finance.services import sync_operational_alerts_for_hotel
from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.master_data.models import MasterData
from apps.reservations.models import Reservation, ReservationRoom
from apps.rooms.models import Room, RoomType


class FinancialControlApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(
            username="finance_admin_test",
            email="finance@test.local",
            password="test-pass-123",
        )
        self.client.force_authenticate(user=self.user)

        self.document_type = self._create_master_data(
            group=MasterData.Group.DOCUMENT_TYPE,
            code="CC",
            name="Cedula",
        )
        self.client_type = self._create_master_data(
            group=MasterData.Group.CLIENT_TYPE,
            code="REGULAR",
            name="Regular",
        )
        self.client_status = self._create_master_data(
            group=MasterData.Group.CLIENT_STATUS,
            code="ACTIVO",
            name="Activo",
        )
        self.reservation_status = self._create_master_data(
            group=MasterData.Group.RESERVATION_STATUS,
            code="FINALIZADA",
            name="Finalizada",
        )
        self.reservation_origin = self._create_master_data(
            group=MasterData.Group.RESERVATION_ORIGIN,
            code="WEB",
            name="Web",
        )
        self.invoice_status = self._create_master_data(
            group=MasterData.Group.INVOICE_STATUS,
            code="PAGADA",
            name="Pagada",
        )
        self.charge_type_room = self._create_master_data(
            group=MasterData.Group.CHARGE_TYPE,
            code="HABITACION",
            name="Habitacion",
        )
        self.charge_type_service = self._create_master_data(
            group=MasterData.Group.CHARGE_TYPE,
            code="SERVICIO",
            name="Servicio",
        )
        self.expense_category_cost = self._create_master_data(
            group=MasterData.Group.EXPENSE_CATEGORY,
            code="COSTO_OPERATIVO",
            name="Costo operativo",
        )
        self.expense_category_admin = self._create_master_data(
            group=MasterData.Group.EXPENSE_CATEGORY,
            code="GASTO_ADMINISTRATIVO",
            name="Gasto administrativo",
        )
        self.room_status = self._create_master_data(
            group=MasterData.Group.ROOM_STATUS,
            code="DISPONIBLE",
            name="Disponible",
        )

        self.hotel = HotelSettings.objects.create(
            hotel_name="Hotel Prueba",
            legal_name="Hotel Prueba SAS",
            city="Riohacha",
            currency="COP",
        )
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=1,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Estandar",
        )
        self.room = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status,
        )

        self.customer = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=self.document_type,
            document_number="123456789",
            first_name="Ana",
            last_name="Diaz",
            email="ana.diaz@test.local",
            phone="3000000000",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        today = timezone.localdate()
        # Use a stable rolling window to avoid month-boundary flakiness (day=1 edge case).
        self.period_start = today - timedelta(days=6)
        self.period_end = today
        self.invoice_counter = 1

        check_in = self.period_start
        check_out = min(self.period_start + timedelta(days=3), self.period_end + timedelta(days=1))
        if check_out <= check_in:
            check_out = check_in + timedelta(days=1)

        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=self.customer,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=check_in,
            expected_check_out=check_out,
            created_by=self.user,
        )
        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room,
            night_rate=Decimal("120000.00"),
            adults=2,
            children=0,
        )

        self.invoice = Invoice.objects.filter(
            reservation=self.reservation,
            is_active=True,
        ).first()
        if self.invoice is None:
            self.invoice = Invoice.objects.create(
                reservation=self.reservation,
                status=self.invoice_status,
                invoice_number=self._next_invoice_number(),
                subtotal=Decimal("360000.00"),
                tax_amount=Decimal("0.00"),
                total_amount=Decimal("360000.00"),
            )
        invoice_datetime = datetime.combine(
            self.period_start,
            time(10, 0),
            tzinfo=timezone.get_current_timezone(),
        )
        Invoice.objects.filter(reservation=self.reservation, is_active=True).update(issue_date=invoice_datetime)

        self.charge = Charge.objects.filter(
            reservation=self.reservation,
            charge_type=self.charge_type_room,
            is_active=True,
        ).first()
        if self.charge is None:
            self.charge = Charge.objects.create(
                reservation=self.reservation,
                charge_type=self.charge_type_room,
                description="Cargo habitacion",
                quantity=1,
                unit_price=Decimal("360000.00"),
                total_amount=Decimal("360000.00"),
                is_active=True,
            )
        charge_datetime = datetime.combine(
            self.period_start,
            time(11, 0),
            tzinfo=timezone.get_current_timezone(),
        )
        Charge.objects.filter(reservation=self.reservation, is_active=True).update(charge_date=charge_datetime)

        Expense.objects.create(
            hotel_settings=self.hotel,
            expense_category=self.expense_category_cost,
            expense_type=Expense.ExpenseType.OPERATING_COST,
            cost_behavior=Expense.CostBehavior.FIXED,
            concept="Nomina operativa",
            amount=Decimal("120000.00"),
            expense_date=self.period_start,
            is_active=True,
        )
        Expense.objects.create(
            hotel_settings=self.hotel,
            expense_category=self.expense_category_admin,
            expense_type=Expense.ExpenseType.ADMIN_EXPENSE,
            cost_behavior=Expense.CostBehavior.FIXED,
            concept="Servicios administrativos",
            amount=Decimal("40000.00"),
            expense_date=self.period_start,
            is_active=True,
        )

        FinancialControlConfig.objects.create(
            hotel_settings=self.hotel,
            district_name="Riohacha",
            tourism_law_enabled=True,
            tourism_law_preferential_rate=Decimal("9.00"),
            standard_income_tax_rate=Decimal("35.00"),
            has_iva_exemption=True,
            iva_rate=Decimal("19.00"),
            ica_rate_per_thousand=Decimal("9.6600"),
            fontur_rate_per_thousand=Decimal("2.5000"),
            break_even_warning_pct=Decimal("90.00"),
            break_even_optimal_pct=Decimal("110.00"),
        )

    def _create_master_data(self, *, group: str, code: str, name: str) -> MasterData:
        obj, _ = MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={
                "name": name,
                "sort_order": 1,
                "is_active": True,
            },
        )
        return obj

    def _next_invoice_number(self) -> str:
        value = f"FAC-TEST-{self.invoice_counter:04d}"
        self.invoice_counter += 1
        return value

    def _create_hotel_fixture(
        self,
        *,
        hotel_name: str,
        room_number: str,
        room_charge_amount: Decimal,
        extra_service_charge_amount: Decimal = Decimal("0.00"),
    ) -> HotelSettings:
        hotel = HotelSettings.objects.create(
            hotel_name=hotel_name,
            legal_name=f"{hotel_name} SAS",
            city="Riohacha",
            currency="COP",
        )
        floor = HotelFloor.objects.create(
            hotel_settings=hotel,
            floor_number=1,
            name=f"Piso {hotel_name}",
            prefix=room_number[:1],
            room_count=1,
        )
        room = Room.objects.create(
            number=room_number,
            room_type=self.room_type,
            floor=floor,
            status=self.room_status,
        )
        reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=self.customer,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=self.period_start,
            expected_check_out=min(
                self.period_start + timedelta(days=2),
                self.period_end + timedelta(days=1),
            ),
            created_by=self.user,
        )
        ReservationRoom.objects.create(
            reservation=reservation,
            room=room,
            night_rate=Decimal("100000.00"),
            adults=2,
            children=0,
        )
        invoice = Invoice.objects.filter(reservation=reservation, is_active=True).first()
        invoice_datetime = datetime.combine(
            self.period_start,
            time(9, 0),
            tzinfo=timezone.get_current_timezone(),
        )
        Invoice.objects.filter(reservation=reservation, is_active=True).update(issue_date=invoice_datetime)

        room_charge = Charge.objects.filter(
            reservation=reservation,
            charge_type=self.charge_type_room,
            is_active=True,
        ).first()
        if room_charge is None:
            room_charge = Charge.objects.create(
                reservation=reservation,
                charge_type=self.charge_type_room,
                description="Cargo habitacion fixture",
                quantity=1,
                unit_price=room_charge_amount,
                total_amount=room_charge_amount,
                is_active=True,
            )
        if room_charge:
            room_charge.quantity = 1
            room_charge.unit_price = room_charge_amount
            room_charge.save()
        Charge.objects.filter(
            reservation=reservation,
            charge_type=self.charge_type_room,
            is_active=True,
        ).update(
            charge_date=datetime.combine(
                self.period_start,
                time(9, 30),
                tzinfo=timezone.get_current_timezone(),
            )
        )

        if extra_service_charge_amount > 0:
            service_charge = Charge.objects.create(
                reservation=reservation,
                charge_type=self.charge_type_service,
                description="Cargo servicio fixture",
                quantity=1,
                unit_price=extra_service_charge_amount,
                total_amount=extra_service_charge_amount,
                is_active=True,
            )
            Charge.objects.filter(id=service_charge.id).update(
                charge_date=datetime.combine(
                    self.period_start,
                    time(9, 45),
                    tzinfo=timezone.get_current_timezone(),
                )
            )

        FinancialControlConfig.objects.create(
            hotel_settings=hotel,
            district_name="Riohacha",
            tourism_law_enabled=True,
            tourism_law_preferential_rate=Decimal("9.00"),
            standard_income_tax_rate=Decimal("35.00"),
            has_iva_exemption=False,
            iva_rate=Decimal("19.00"),
            ica_rate_per_thousand=Decimal("9.6600"),
            fontur_rate_per_thousand=Decimal("2.5000"),
            break_even_warning_pct=Decimal("90.00"),
            break_even_optimal_pct=Decimal("110.00"),
        )
        return hotel

    def test_dashboard_endpoint_returns_expected_sections(self):
        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("profitability_and_sales", response.data)
        self.assertIn("operational_efficiency", response.data)
        self.assertIn("tax_optimization", response.data)
        self.assertIn("benchmarking", response.data)
        self.assertIn("financial_traffic_light", response.data)

    def test_dashboard_requires_hotel_settings_param(self):
        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("hotel_settings", response.data)

    def test_dashboard_does_not_mix_hotels_when_hotel_settings_is_provided(self):
        hotel_2 = self._create_hotel_fixture(
            hotel_name="Hotel Secundario",
            room_number="201",
            room_charge_amount=Decimal("900000.00"),
        )
        Expense.objects.create(
            hotel_settings=hotel_2,
            expense_category=self.expense_category_cost,
            expense_type=Expense.ExpenseType.OPERATING_COST,
            cost_behavior=Expense.CostBehavior.FIXED,
            concept="Costo hotel 2",
            amount=Decimal("500000.00"),
            expense_date=self.period_start,
            is_active=True,
        )

        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Decimal(str(response.data["summary"]["revenue"])),
            Decimal("360000.00"),
        )
        self.assertEqual(
            Decimal(str(response.data["summary"]["costs"])),
            Decimal("120000.00"),
        )


    def test_revpar_uses_only_room_revenue(self):
        service_charge = Charge.objects.create(
            reservation=self.reservation,
            charge_type=self.charge_type_service,
            description="Servicio no habitacion",
            quantity=1,
            unit_price=Decimal("640000.00"),
            total_amount=Decimal("640000.00"),
            is_active=True,
        )
        Charge.objects.filter(id=service_charge.id).update(
            charge_date=datetime.combine(
                self.period_start,
                time(14, 0),
                tzinfo=timezone.get_current_timezone(),
            )
        )
        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        available_room_nights = Decimal(str(response.data["summary"]["available_room_nights"]))
        expected_revpar = Decimal("360000.00") / available_room_nights
        self.assertAlmostEqual(
            float(response.data["benchmarking"]["current_period"]["revpar"]),
            float(expected_revpar),
            places=2,
        )

    def test_break_even_is_based_on_structured_cost_behavior(self):
        Expense.objects.filter(hotel_settings=self.hotel).delete()
        Expense.objects.create(
            hotel_settings=self.hotel,
            expense_category=self.expense_category_cost,
            expense_type=Expense.ExpenseType.OPERATING_COST,
            cost_behavior=Expense.CostBehavior.FIXED,
            concept="Costo fijo estructurado",
            amount=Decimal("100000.00"),
            expense_date=self.period_start,
            is_active=True,
        )
        Expense.objects.create(
            hotel_settings=self.hotel,
            expense_category=self.expense_category_admin,
            expense_type=Expense.ExpenseType.SALES_EXPENSE,
            cost_behavior=Expense.CostBehavior.VARIABLE,
            concept="Costo variable estructurado",
            amount=Decimal("50000.00"),
            expense_date=self.period_start,
            is_active=True,
        )

        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        break_even = Decimal(
            str(response.data["operational_efficiency"]["break_even_dynamic"]["break_even_revenue"])
        )
        expected_break_even = Decimal("100000.00") / (Decimal("1.00") - (Decimal("50000.00") / Decimal("360000.00")))
        self.assertAlmostEqual(float(break_even), float(expected_break_even), places=2)

    def test_expense_classification_is_structured_not_text_based(self):
        Expense.objects.filter(hotel_settings=self.hotel).delete()
        neutral_category = self._create_master_data(
            group=MasterData.Group.EXPENSE_CATEGORY,
            code="SIN_PALABRA_CLAVE",
            name="Sin palabra clave",
        )
        Expense.objects.create(
            hotel_settings=self.hotel,
            expense_category=neutral_category,
            expense_type=Expense.ExpenseType.OPERATING_COST,
            cost_behavior=Expense.CostBehavior.VARIABLE,
            concept="Costo estructurado",
            amount=Decimal("12345.00"),
            expense_date=self.period_start,
            is_active=True,
        )

        response = self.client.get(
            "/api/financial-control/dashboard/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Decimal(str(response.data["summary"]["costs"])),
            Decimal("12345.00"),
        )

    def test_what_if_endpoint_increases_revenue_with_positive_rate_change(self):
        response = self.client.get(
            "/api/financial-control/what-if/",
            {
                "hotel_settings": self.hotel.id,
                "start_date": self.period_start.isoformat(),
                "end_date": self.period_end.isoformat(),
                "rate_change_pct": "10",
                "occupancy_change_pct": "5",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(
            Decimal(str(response.data["projected"]["revenue"])),
            Decimal(str(response.data["base"]["revenue"])),
        )
        self.assertIn("total_tax_provisions", response.data["projected"])

    def test_snapshot_endpoint_recalculates_totals_and_taxes_payable(self):
        response = self.client.post(
            "/api/financial-statement-snapshots/",
            {
                "hotel_settings": self.hotel.id,
                "period_year": self.period_start.year,
                "period_month": self.period_start.month,
                "cash_and_equivalents": "100.00",
                "trade_receivables": "50.00",
                "current_financial_assets": "25.00",
                "inventories": "25.00",
                "property_plant_equipment": "300.00",
                "non_current_financial_assets": "100.00",
                "intangibles_other": "100.00",
                "accounts_payable": "50.00",
                "financial_obligations_current": "20.00",
                "trade_creditors": "30.00",
                "financial_obligations_non_current": "70.00",
                "provision_income_tax": "40.00",
                "provision_ica": "10.00",
                "provision_fontur": "5.00",
                "other_tax_provisions": "5.00",
                "current_assets": "99999.00",
                "taxes_payable": "99999.00",
                "current_liabilities": "99999.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(str(response.data["current_assets"])), Decimal("200.00"))
        self.assertEqual(Decimal(str(response.data["non_current_assets"])), Decimal("500.00"))
        self.assertEqual(Decimal(str(response.data["taxes_payable"])), Decimal("60.00"))
        self.assertEqual(Decimal(str(response.data["current_liabilities"])), Decimal("160.00"))
        self.assertEqual(Decimal(str(response.data["non_current_liabilities"])), Decimal("70.00"))

    def test_statements_endpoint_returns_financial_indicators_and_tax_traceability(self):
        year = self.period_start.year
        month = self.period_start.month

        FinancialStatementSnapshot.objects.create(
            hotel_settings=self.hotel,
            period_year=year,
            period_month=month,
            cash_and_equivalents=Decimal("600000.00"),
            trade_receivables=Decimal("200000.00"),
            current_financial_assets=Decimal("100000.00"),
            inventories=Decimal("100000.00"),
            property_plant_equipment=Decimal("1000000.00"),
            non_current_financial_assets=Decimal("500000.00"),
            intangibles_other=Decimal("200000.00"),
            accounts_payable=Decimal("150000.00"),
            financial_obligations_current=Decimal("100000.00"),
            trade_creditors=Decimal("50000.00"),
            financial_obligations_non_current=Decimal("700000.00"),
            equity_capital=Decimal("1000000.00"),
            equity_reserves=Decimal("100000.00"),
            equity_surplus=Decimal("50000.00"),
            retained_earnings=Decimal("1250000.00"),
            provision_income_tax=Decimal("40000.00"),
            provision_ica=Decimal("10000.00"),
            provision_fontur=Decimal("5000.00"),
            other_tax_provisions=Decimal("5000.00"),
            average_accounts_receivable=Decimal("150000.00"),
            net_credit_sales=Decimal("600000.00"),
            depreciation_expense=Decimal("30000.00"),
            financial_expense=Decimal("15000.00"),
            financial_income=Decimal("8000.00"),
        )
        FinancialStatementSnapshot.objects.create(
            hotel_settings=self.hotel,
            period_year=year - 1,
            period_month=month,
            cash_and_equivalents=Decimal("500000.00"),
            trade_receivables=Decimal("180000.00"),
            current_financial_assets=Decimal("90000.00"),
            inventories=Decimal("90000.00"),
            property_plant_equipment=Decimal("900000.00"),
            non_current_financial_assets=Decimal("450000.00"),
            intangibles_other=Decimal("180000.00"),
            accounts_payable=Decimal("140000.00"),
            financial_obligations_current=Decimal("90000.00"),
            trade_creditors=Decimal("45000.00"),
            financial_obligations_non_current=Decimal("650000.00"),
            equity_capital=Decimal("900000.00"),
            equity_reserves=Decimal("90000.00"),
            equity_surplus=Decimal("45000.00"),
            retained_earnings=Decimal("1180000.00"),
            provision_income_tax=Decimal("35000.00"),
            provision_ica=Decimal("9000.00"),
            provision_fontur=Decimal("4000.00"),
            other_tax_provisions=Decimal("4000.00"),
            average_accounts_receivable=Decimal("140000.00"),
            net_credit_sales=Decimal("520000.00"),
            depreciation_expense=Decimal("28000.00"),
            financial_expense=Decimal("13000.00"),
            financial_income=Decimal("7000.00"),
        )

        response = self.client.get(
            "/api/financial-control/statements/",
            {
                "hotel_settings": self.hotel.id,
                "year": year,
                "month": month,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("balance_sheet", response.data)
        self.assertIn("income_statement", response.data)
        self.assertIn("indicators", response.data)
        self.assertIn("tax_provisions_traceability", response.data)
        self.assertEqual(
            Decimal(
                str(
                    response.data["tax_provisions_traceability"]["snapshot_balances"]["current"][
                        "taxes_payable"
                    ]
                )
            ),
            Decimal("60000.00"),
        )


class FinancialControlTenantIsolationTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.hotel_a = HotelSettings.objects.create(
            hotel_name="Hotel Tenant A",
            legal_name="Hotel Tenant A SAS",
            city="Riohacha",
            currency="COP",
        )
        self.hotel_b = HotelSettings.objects.create(
            hotel_name="Hotel Tenant B",
            legal_name="Hotel Tenant B SAS",
            city="Riohacha",
            currency="COP",
        )

        role = Role.objects.create(name="Finance Tenant Role", slug="finance-tenant-role")
        resources = [
            Resource.objects.create(
                key=key,
                name=f"Permiso {key}",
                link_backend="/api/financial-control/",
            )
            for key in ("financial_control.read", "financial_control.write")
        ]
        role.resources.add(*resources)

        self.user = User.objects.create_user(
            username="finance_tenant_user",
            email="finance_tenant_user@test.local",
            password="test-pass-123",
            hotel_settings=self.hotel_a,
        )
        self.user.roles.add(role)
        self.client.force_authenticate(user=self.user)

    def test_dashboard_rejects_cross_tenant_hotel_settings_for_non_superuser(self):
        response = self.client.get(
            "/api/financial-control/dashboard/",
            {"hotel_settings": self.hotel_b.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("hotel_settings", response.data)

    def test_operational_alert_sync_rejects_cross_tenant_hotel_settings_for_non_superuser(self):
        response = self.client.post(
            "/api/operational-alerts/sync/",
            {"hotel_settings": self.hotel_b.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("hotel_settings", response.data)


class OperationalAlertsAutomationTests(TestCase):
    def _md(self, group, code, name, sort_order=1):
        return MasterData.objects.update_or_create(
            group=group,
            code=code,
            defaults={"name": name, "is_active": True, "sort_order": sort_order},
        )[0]

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_superuser(
            username="ops_alert_admin",
            email="ops_alert@test.local",
            password="test-pass-123",
        )

        self.document_type = self._md(MasterData.Group.DOCUMENT_TYPE, "CC", "Cedula")
        self.client_type = self._md(MasterData.Group.CLIENT_TYPE, "REGULAR", "Regular")
        self.client_status = self._md(MasterData.Group.CLIENT_STATUS, "ACTIVO", "Activo")
        self.reservation_status = self._md(MasterData.Group.RESERVATION_STATUS, "FINALIZADA", "Finalizada")
        self.reservation_origin = self._md(MasterData.Group.RESERVATION_ORIGIN, "WEB", "Web")
        self.invoice_status = self._md(MasterData.Group.INVOICE_STATUS, "PAGADA", "Pagada")
        self.payment_method = self._md(MasterData.Group.PAYMENT_METHOD, "EFECTIVO", "Efectivo")
        self.refund_status_approved = self._md(
            MasterData.Group.PAYMENT_REFUND_STATUS,
            "APROBADO",
            "Aprobado",
        )

        self.room_status_available = self._md(MasterData.Group.ROOM_STATUS, "DISPONIBLE", "Disponible")
        self.room_status_occupied = self._md(MasterData.Group.ROOM_STATUS, "OCUPADA", "Ocupada")
        self.room_status_reserved = self._md(MasterData.Group.ROOM_STATUS, "RESERVADA", "Reservada")

        self.hotel = HotelSettings.objects.create(
            hotel_name="Hotel Alertas",
            legal_name="Hotel Alertas SAS",
            city="Riohacha",
            currency="COP",
        )
        self.floor = HotelFloor.objects.create(
            hotel_settings=self.hotel,
            floor_number=1,
            name="Piso 1",
            prefix="1",
            room_count=3,
        )
        self.room_type = RoomType.objects.create(
            hotel_settings=self.hotel,
            code="STD",
            name="Estandar",
        )
        self.room_1 = Room.objects.create(
            number="101",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status_available,
        )
        self.room_2 = Room.objects.create(
            number="102",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status_available,
        )
        self.room_3 = Room.objects.create(
            number="103",
            room_type=self.room_type,
            floor=self.floor,
            status=self.room_status_available,
        )

        self.client_obj = Client.objects.create(
            hotel_settings=self.hotel,
            document_type=self.document_type,
            document_number="123456789",
            first_name="Ana",
            last_name="Diaz",
            email="ana.alert@test.local",
            phone="3000000000",
            country="CO",
            client_type=self.client_type,
            status=self.client_status,
        )

        today = timezone.localdate()
        self.reservation = Reservation.objects.create(
            hotel_settings=self.hotel,
            client=self.client_obj,
            status=self.reservation_status,
            origin=self.reservation_origin,
            expected_check_in=today - timedelta(days=1),
            expected_check_out=today + timedelta(days=1),
            created_by=self.user,
        )
        ReservationRoom.objects.create(
            reservation=self.reservation,
            room=self.room_1,
            night_rate=Decimal("120000.00"),
            adults=2,
            children=0,
        )

        Invoice.objects.filter(reservation=self.reservation).update(is_active=False)
        Charge.objects.filter(reservation=self.reservation).update(is_active=False)

        FinancialControlConfig.objects.create(
            hotel_settings=self.hotel,
            district_name="Riohacha",
            tourism_law_enabled=True,
            tourism_law_preferential_rate=Decimal("9.00"),
            standard_income_tax_rate=Decimal("35.00"),
            has_iva_exemption=False,
            iva_rate=Decimal("19.00"),
            ica_rate_per_thousand=Decimal("9.6600"),
            fontur_rate_per_thousand=Decimal("2.5000"),
            break_even_warning_pct=Decimal("90.00"),
            break_even_optimal_pct=Decimal("110.00"),
            operational_high_occupancy_threshold_pct=Decimal("60.00"),
            operational_low_availability_threshold_rooms=1,
            operational_revenue_drop_threshold_pct=Decimal("20.00"),
            operational_high_refunds_threshold_count=1,
            operational_revenue_window_days=7,
            operational_refund_window_days=7,
        )

    def _create_invoice(self, *, invoice_number: str, total_amount: Decimal, issue_date):
        invoice = Invoice.objects.create(
            reservation=self.reservation,
            status=self.invoice_status,
            invoice_number=invoice_number,
            subtotal=total_amount,
            tax_amount=Decimal("0.00"),
            total_amount=total_amount,
            is_active=True,
        )
        issue_datetime = datetime.combine(
            issue_date,
            time(9, 0),
            tzinfo=timezone.get_current_timezone(),
        )
        Invoice.objects.filter(id=invoice.id).update(issue_date=issue_datetime)
        invoice.refresh_from_db()
        return invoice

    def test_sync_creates_occupancy_and_availability_alerts(self):
        Room.objects.filter(id=self.room_1.id).update(status=self.room_status_occupied)
        Room.objects.filter(id=self.room_2.id).update(status=self.room_status_reserved)

        result = sync_operational_alerts_for_hotel(
            hotel_settings_id=self.hotel.id,
            alert_types={
                OperationalAlert.AlertType.HIGH_OCCUPANCY,
                OperationalAlert.AlertType.LOW_AVAILABILITY,
            },
        )

        self.assertEqual(result["created"], 2)
        self.assertTrue(
            OperationalAlert.objects.filter(
                hotel_settings=self.hotel,
                alert_type=OperationalAlert.AlertType.HIGH_OCCUPANCY,
                status=OperationalAlert.Status.OPEN,
            ).exists()
        )
        self.assertTrue(
            OperationalAlert.objects.filter(
                hotel_settings=self.hotel,
                alert_type=OperationalAlert.AlertType.LOW_AVAILABILITY,
                status=OperationalAlert.Status.OPEN,
            ).exists()
        )

    def test_sync_creates_revenue_drop_alert(self):
        today = timezone.localdate()
        self._create_invoice(
            invoice_number="FAC-OPS-0001",
            total_amount=Decimal("1000000.00"),
            issue_date=today - timedelta(days=10),
        )
        self._create_invoice(
            invoice_number="FAC-OPS-0002",
            total_amount=Decimal("500000.00"),
            issue_date=today - timedelta(days=1),
        )

        result = sync_operational_alerts_for_hotel(
            hotel_settings_id=self.hotel.id,
            alert_types={OperationalAlert.AlertType.REVENUE_DROP},
        )

        self.assertGreaterEqual(result["created"] + result["updated"], 1)
        alert = OperationalAlert.objects.filter(
            hotel_settings=self.hotel,
            alert_type=OperationalAlert.AlertType.REVENUE_DROP,
            status=OperationalAlert.Status.OPEN,
        ).first()
        self.assertIsNotNone(alert)
        self.assertIn("Caida de ingresos", alert.title)

    def test_refund_signal_creates_high_refunds_alert(self):
        invoice = self._create_invoice(
            invoice_number="FAC-OPS-0003",
            total_amount=Decimal("400000.00"),
            issue_date=timezone.localdate() - timedelta(days=1),
        )
        payment = Payment.objects.create(
            invoice=invoice,
            payment_method=self.payment_method,
            amount=Decimal("400000.00"),
            is_active=True,
        )

        PaymentRefund.objects.create(
            payment=payment,
            status=self.refund_status_approved,
            amount=Decimal("100000.00"),
            reason="Prueba de alto volumen",
            is_active=True,
        )

        self.assertTrue(
            OperationalAlert.objects.filter(
                hotel_settings=self.hotel,
                alert_type=OperationalAlert.AlertType.HIGH_REFUNDS,
                status=OperationalAlert.Status.OPEN,
            ).exists()
        )

    def test_sync_resolves_occupancy_alert_when_metric_recovers(self):
        Room.objects.filter(id=self.room_1.id).update(status=self.room_status_occupied)
        Room.objects.filter(id=self.room_2.id).update(status=self.room_status_reserved)
        sync_operational_alerts_for_hotel(
            hotel_settings_id=self.hotel.id,
            alert_types={
                OperationalAlert.AlertType.HIGH_OCCUPANCY,
                OperationalAlert.AlertType.LOW_AVAILABILITY,
            },
        )

        Room.objects.filter(id=self.room_1.id).update(status=self.room_status_available)
        Room.objects.filter(id=self.room_2.id).update(status=self.room_status_available)
        result = sync_operational_alerts_for_hotel(
            hotel_settings_id=self.hotel.id,
            alert_types={
                OperationalAlert.AlertType.HIGH_OCCUPANCY,
                OperationalAlert.AlertType.LOW_AVAILABILITY,
            },
        )

        self.assertGreaterEqual(result["resolved"], 2)
        self.assertFalse(
            OperationalAlert.objects.filter(
                hotel_settings=self.hotel,
                alert_type=OperationalAlert.AlertType.HIGH_OCCUPANCY,
                status=OperationalAlert.Status.OPEN,
            ).exists()
        )
