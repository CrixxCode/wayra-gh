import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { FinancialControlConfigPayload, FinancialControlService } from '../../../services/financial-control';

type CardTone = 'blue' | 'green' | 'amber' | 'red' | 'gray';
type TrafficTone = 'green' | 'yellow' | 'red' | 'gray';
type FinancialTab = 'dashboard' | 'what_if' | 'statements' | 'config';

type HotelConfigOption = {
  id: number;
  configId: number | null;
  hotelSettingsId: number;
  hotelName: string;
  districtName: string;
};

type FinancialControlConfigRecord = {
  id: number;
  hotelSettingsId: number;
  hotelName: string;
  districtName: string;
  tourismLawEnabled: boolean;
  tourismLawPreferentialRate: number;
  standardIncomeTaxRate: number;
  hasIvaExemption: boolean;
  ivaRate: number;
  icaRatePerThousand: number;
  fonturRatePerThousand: number;
  breakEvenWarningPct: number;
  breakEvenOptimalPct: number;
  operationalHighOccupancyThresholdPct: number;
  operationalLowAvailabilityThresholdRooms: number;
  operationalRevenueDropThresholdPct: number;
  operationalHighRefundsThresholdCount: number;
  operationalRevenueWindowDays: number;
  operationalRefundWindowDays: number;
};

type FinancialControlConfigForm = {
  districtName: string;
  tourismLawEnabled: boolean;
  tourismLawPreferentialRate: number | null;
  standardIncomeTaxRate: number | null;
  hasIvaExemption: boolean;
  ivaRate: number | null;
  icaRatePerThousand: number | null;
  fonturRatePerThousand: number | null;
  breakEvenWarningPct: number | null;
  breakEvenOptimalPct: number | null;
  operationalHighOccupancyThresholdPct: number | null;
  operationalLowAvailabilityThresholdRooms: number | null;
  operationalRevenueDropThresholdPct: number | null;
  operationalHighRefundsThresholdCount: number | null;
  operationalRevenueWindowDays: number | null;
  operationalRefundWindowDays: number | null;
};

type SummaryCard = {
  label: string;
  valueLabel: string;
  note: string;
  icon: string;
  tone: CardTone;
};

type MetricCard = {
  label: string;
  valueLabel: string;
  note: string;
  icon: string;
  tone: CardTone;
};

type TrendRow = {
  month: string;
  revpar: number;
  roomRevenue: number;
  roomCount: number;
  availableRoomNights: number;
};

type DashboardVm = {
  periodLabel: string;
  summaryCards: SummaryCard[];
  benchmarkCards: MetricCard[];
  taxCards: MetricCard[];
  revparTrend: TrendRow[];
  breakEven: {
    progressPct: number;
    status: string;
    breakEvenRevenue: number | null;
    fixedCosts: number;
    variableCosts: number;
    cpho: number;
  };
  traffic: {
    tone: TrafficTone;
    label: string;
    reasons: string[];
  };
};

type WhatIfVm = {
  periodLabel: string;
  baseCards: MetricCard[];
  projectedCards: MetricCard[];
  deltaCards: MetricCard[];
};

type StatementRowVm = {
  section: string;
  account: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

type IndicatorVm = {
  label: string;
  formula: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
};

type StatementsVm = {
  periodCurrent: string;
  periodPrevious: string;
  balanceRows: StatementRowVm[];
  balanceTotals: StatementRowVm[];
  incomeRows: StatementRowVm[];
  indicators: IndicatorVm[];
};

@Component({
  selector: 'app-list-financial-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-financial-control.html',
  styleUrls: ['./list-financial-control.css'],
})
export class ListFinancialControl implements OnInit {
  loadingConfigs = false;
  loadingDashboard = false;
  loadingWhatIf = false;
  loadingStatements = false;

  dashboardError = '';
  whatIfError = '';
  statementsError = '';
  configInfoMessage = '';
  configValidationError = '';
  configSaveMessage = '';
  periodValidationError = '';
  statementValidationError = '';
  activeTab: FinancialTab = 'dashboard';
  savingConfig = false;

  configs: HotelConfigOption[] = [];
  selectedHotelSettingsId: number | null = null;
  private readonly defaultDistrictName = 'Riohacha';
  private readonly configRecordByHotelSettingsId = new Map<number, FinancialControlConfigRecord>();
  configForm: FinancialControlConfigForm = this.emptyFinancialConfigForm();

  startDate = '';
  endDate = '';
  statementYear = new Date().getFullYear();
  statementMonth = new Date().getMonth() + 1;

  rateChangePct = 0;
  occupancyChangePct = 0;
  targetOccupancyPctInput = '';
  operatingCostChangePct = 0;

  dashboardVm: DashboardVm = this.emptyDashboardVm();
  whatIfVm: WhatIfVm = this.emptyWhatIfVm();
  statementsVm: StatementsVm = this.emptyStatementsVm();

  readonly monthOptions = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];
  readonly tabs: Array<{ key: FinancialTab; label: string; icon: string }> = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-chart-line' },
    { key: 'what_if', label: 'What-if', icon: 'fa-solid fa-flask' },
    { key: 'statements', label: 'Estados Financieros', icon: 'fa-solid fa-file-invoice' },
    { key: 'config', label: 'Configuracion de Alertas', icon: 'fa-solid fa-sliders' },
  ];

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
  private readonly amountFormatter = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  private readonly integerFormatter = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  });

  constructor(
    private financialControlService: FinancialControlService,
    private hotelSettingsService: HotelSettingsService
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.startDate = this.toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    this.endDate = this.toIsoDate(now);
    this.statementYear = now.getFullYear();
    this.statementMonth = now.getMonth() + 1;
    this.loadConfigsAndBootstrap();
  }

  get isRefreshing(): boolean {
    return this.loadingDashboard || this.loadingWhatIf || this.loadingStatements || this.loadingConfigs;
  }

  get breakEvenProgressWidth(): number {
    const value = Number(this.dashboardVm.breakEven.progressPct || 0);
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 100);
  }

  get breakEvenStatusTone(): TrafficTone {
    const status = String(this.dashboardVm.breakEven.status || '').toUpperCase();
    if (status === 'OPTIMAL') return 'green';
    if (status === 'WARNING') return 'yellow';
    if (status === 'CRITICAL') return 'red';
    return 'gray';
  }

  get selectedConfigRecord(): FinancialControlConfigRecord | null {
    if (!this.selectedHotelSettingsId) return null;
    return this.configRecordByHotelSettingsId.get(this.selectedHotelSettingsId) ?? null;
  }

  get hasSelectedConfig(): boolean {
    return this.selectedConfigRecord !== null;
  }

  trackByConfig(_: number, item: HotelConfigOption): number {
    return item.id;
  }

  trackByTab(_: number, tab: { key: FinancialTab }): FinancialTab {
    return tab.key;
  }

  trackBySummaryCard(_: number, card: SummaryCard): string {
    return card.label;
  }

  trackByMetricCard(_: number, card: MetricCard): string {
    return `${card.label}-${card.tone}`;
  }

  trackByTrend(_: number, row: TrendRow): string {
    return row.month;
  }

  trackByStatementRow(index: number, row: StatementRowVm): string {
    return `${row.section}-${row.account}-${index}`;
  }

  trackByIndicator(_: number, indicator: IndicatorVm): string {
    return indicator.label;
  }

  selectTab(tab: FinancialTab): void {
    this.activeTab = tab;
    if (tab === 'config') {
      this.configValidationError = '';
      this.configSaveMessage = '';
      this.syncConfigFormWithSelection();
    }
  }

  onHotelFilterChange(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    this.syncConfigFormWithSelection();
    this.refreshAll();
  }

  restoreConfigForm(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    this.syncConfigFormWithSelection();
  }

  saveConfig(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';

    const hotelSettingsId = this.selectedHotelSettingsId;
    if (!hotelSettingsId || hotelSettingsId <= 0) {
      this.configValidationError = 'Debes seleccionar un hotel para guardar la configuracion.';
      return;
    }

    const payloadResult = this.buildConfigPayload(hotelSettingsId);
    if (payloadResult.error) {
      this.configValidationError = payloadResult.error;
      return;
    }

    const existingConfig = this.selectedConfigRecord;
    const updatePayload: Partial<FinancialControlConfigPayload> = { ...payloadResult.payload };
    delete updatePayload.hotel_settings;

    const request$ = existingConfig
      ? this.financialControlService.updateConfig(existingConfig.id, updatePayload)
      : this.financialControlService.createConfig(payloadResult.payload);

    this.savingConfig = true;
    request$.subscribe({
      next: (payload) => {
        this.savingConfig = false;
        const parsed = this.parseConfigRecord(payload);
        if (parsed) {
          this.upsertConfigRecord(parsed);
          this.selectedHotelSettingsId = parsed.hotelSettingsId;
          this.syncConfigFormWithSelection();
          this.configSaveMessage = existingConfig
            ? 'Configuracion financiera actualizada.'
            : 'Configuracion financiera creada.';
        } else {
          this.configSaveMessage = 'Configuracion guardada. Actualiza para ver los cambios.';
          this.loadConfigsAndBootstrap();
        }
      },
      error: (error) => {
        this.savingConfig = false;
        this.configValidationError = this.extractHttpErrorMessage(
          error,
          'No fue posible guardar la configuracion financiera.'
        );
      },
    });
  }

  applyPeriodFilters(): void {
    if (!this.validateDateRange()) return;
    if (!this.ensureHotelSelection('dashboard')) return;
    this.loadDashboard();
    this.runWhatIf();
  }

  applyStatementsFilters(): void {
    if (!this.validateStatementPeriod()) return;
    if (!this.ensureHotelSelection('statements')) return;
    this.loadStatements();
  }

  refreshAll(): void {
    if (!this.ensureHotelSelection('all')) return;

    const validDateRange = this.validateDateRange();
    const validStatementPeriod = this.validateStatementPeriod();

    if (validDateRange) {
      this.loadDashboard();
      this.runWhatIf();
    }

    if (validStatementPeriod) {
      this.loadStatements();
    }
  }

  runWhatIf(): void {
    if (!this.validateDateRange()) return;
    if (!this.ensureHotelSelection('what_if')) return;

    this.loadingWhatIf = true;
    this.whatIfError = '';

    const targetOccupancyPct = this.parseOptionalNumber(this.targetOccupancyPctInput);
    this.financialControlService
      .getWhatIf({
        ...this.buildDateRangeParams(),
        rate_change_pct: this.rateChangePct,
        occupancy_change_pct: this.occupancyChangePct,
        target_occupancy_pct: targetOccupancyPct ?? undefined,
        operating_cost_change_pct: this.operatingCostChangePct,
      })
      .subscribe({
        next: (payload) => {
          this.whatIfVm = this.buildWhatIfVm(payload);
          this.loadingWhatIf = false;
        },
        error: (error) => {
          this.loadingWhatIf = false;
          this.whatIfVm = this.emptyWhatIfVm();
          this.whatIfError = this.extractHttpErrorMessage(error, 'No fue posible calcular el escenario.');
        },
      });
  }

  toggleConfigSection(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    if (this.selectedHotelSettingsId) {
      this.syncConfigFormWithSelection();
    }
  }

  saveConfiguration(): void {
    if (!this.selectedHotelSettingsId) {
      this.configValidationError = 'Debes seleccionar un hotel.';
      return;
    }

    this.configValidationError = '';
    this.configSaveMessage = '';

    const payloadResult = this.buildConfigPayload(this.selectedHotelSettingsId);
    if (payloadResult.error) {
      this.configValidationError = payloadResult.error;
      return;
    }

    const existingConfig = this.selectedConfigRecord;
    const updatePayload: Partial<FinancialControlConfigPayload> = { ...payloadResult.payload };
    delete updatePayload.hotel_settings;

    const request$ = existingConfig
      ? this.financialControlService.updateConfig(existingConfig.id, updatePayload)
      : this.financialControlService.createConfig(payloadResult.payload);

    this.savingConfig = true;
    request$.subscribe({
      next: (payload) => {
        this.savingConfig = false;
        const parsed = this.parseConfigRecord(payload);
        if (parsed) {
          this.upsertConfigRecord(parsed);
          this.selectedHotelSettingsId = parsed.hotelSettingsId;
          this.syncConfigFormWithSelection();
          this.configSaveMessage = existingConfig
            ? 'Configuracion financiera actualizada.'
            : 'Configuracion financiera creada.';
        } else {
          this.configSaveMessage = 'Configuracion guardada. Actualiza para ver los cambios.';
          this.loadConfigsAndBootstrap();
        }
      },
      error: (error) => {
        this.savingConfig = false;
        this.configValidationError = this.extractHttpErrorMessage(
          error,
          'No fue posible guardar la configuracion financiera.'
        );
      },
    });
  }

  private loadConfigsAndBootstrap(): void {
    this.loadingConfigs = true;
    this.configInfoMessage = '';

    forkJoin({
      configs: this.financialControlService.listConfigs().pipe(
        catchError((error) => {
          this.configInfoMessage = this.extractHttpErrorMessage(
            error,
            'No fue posible cargar configuraciones financieras.'
          );
          return of([] as Record<string, unknown>[]);
        })
      ),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe(({ configs, settings }) => {
      const records = this.parseConfigRecords(configs);
      this.configRecordByHotelSettingsId.clear();
      for (const record of records) {
        this.configRecordByHotelSettingsId.set(record.hotelSettingsId, record);
      }
      this.configs = records.map((record) => ({
        id: record.id,
        configId: record.id,
        hotelSettingsId: record.hotelSettingsId,
        hotelName: record.hotelName,
        districtName: record.districtName,
      }));

      const currentSettingsId = Number(settings?.id || 0);
      const currentHotelName = String(settings?.hotel_name || '').trim();

      if (currentSettingsId > 0 && !this.configs.some((item) => item.hotelSettingsId === currentSettingsId)) {
        this.configs.unshift({
          id: -currentSettingsId,
          configId: null,
          hotelSettingsId: currentSettingsId,
          hotelName: currentHotelName || `Hotel #${currentSettingsId}`,
          districtName: '',
        });
      }

      if (!this.selectedHotelSettingsId && this.configs.length > 0) {
        this.selectedHotelSettingsId = this.configs[0].hotelSettingsId;
      }

      this.syncConfigFormWithSelection();

      if (!this.configs.length && !this.configInfoMessage) {
        this.configInfoMessage =
          'No hay configuraciones financieras ni hotel activo. Debes crear o seleccionar un hotel para consultar el modulo.';
      }

      this.loadingConfigs = false;
      this.refreshAll();
    });
  }

  private loadDashboard(): void {
    if (!this.ensureHotelSelection('dashboard')) return;

    this.loadingDashboard = true;
    this.dashboardError = '';

    this.financialControlService.getDashboard(this.buildDateRangeParams()).subscribe({
      next: (payload) => {
        this.dashboardVm = this.buildDashboardVm(payload);
        this.loadingDashboard = false;
      },
      error: (error) => {
        this.loadingDashboard = false;
        this.dashboardVm = this.emptyDashboardVm();
        this.dashboardError = this.extractHttpErrorMessage(error, 'No fue posible cargar el tablero financiero.');
      },
    });
  }

  private loadStatements(): void {
    if (!this.ensureHotelSelection('statements')) return;

    this.loadingStatements = true;
    this.statementsError = '';

    this.financialControlService.getStatements(this.buildStatementParams()).subscribe({
      next: (payload) => {
        this.statementsVm = this.buildStatementsVm(payload);
        this.loadingStatements = false;
      },
      error: (error) => {
        this.loadingStatements = false;
        this.statementsVm = this.emptyStatementsVm();
        this.statementsError = this.extractHttpErrorMessage(
          error,
          'No fue posible cargar los estados financieros.'
        );
      },
    });
  }

  private buildDateRangeParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      start_date: this.startDate,
      end_date: this.endDate,
    };
    if (this.selectedHotelSettingsId) {
      params['hotel_settings'] = this.selectedHotelSettingsId;
    }
    return params;
  }

  private buildStatementParams(): Record<string, unknown> {
    const params: Record<string, unknown> = {
      year: this.statementYear,
      month: this.statementMonth,
    };
    if (this.selectedHotelSettingsId) {
      params['hotel_settings'] = this.selectedHotelSettingsId;
    }
    return params;
  }

  private validateDateRange(): boolean {
    this.periodValidationError = '';
    if (!this.startDate || !this.endDate) {
      this.periodValidationError = 'Debes seleccionar fecha inicial y fecha final.';
      return false;
    }
    if (this.startDate > this.endDate) {
      this.periodValidationError = 'La fecha inicial no puede ser mayor que la fecha final.';
      return false;
    }
    return true;
  }

  private validateStatementPeriod(): boolean {
    this.statementValidationError = '';
    if (this.statementYear < 1900 || this.statementYear > 2999) {
      this.statementValidationError = 'El ano debe estar entre 1900 y 2999.';
      return false;
    }
    if (this.statementMonth < 1 || this.statementMonth > 12) {
      this.statementValidationError = 'El mes debe estar entre 1 y 12.';
      return false;
    }
    return true;
  }

  private buildDashboardVm(payload: Record<string, unknown>): DashboardVm {
    const periodStart = this.getString(payload, ['period', 'start_date']);
    const periodEnd = this.getString(payload, ['period', 'end_date']);

    const revenue = this.getNumber(payload, ['summary', 'revenue']);
    const costs = this.getNumber(payload, ['summary', 'costs']);
    const expenses = this.getNumber(payload, ['summary', 'expenses']);
    const netProfit = this.getNumber(payload, ['summary', 'net_profit']);
    const occupancyRatePct = this.getNumber(payload, ['summary', 'occupancy_rate_pct']);
    const grossOperatingProfit = this.getNumber(payload, ['summary', 'gross_operating_profit']);

    const breakEvenProgress = this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'progress_pct']);
    const breakEvenStatus = this.getString(payload, ['operational_efficiency', 'break_even_dynamic', 'status']) || '-';

    const benchmarkRevenuePct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'revenue_pct']);
    const benchmarkNetProfitPct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'net_profit_pct']);
    const benchmarkOccupancyPts = this.getNumber(payload, ['benchmarking', 'variance', 'occupancy_rate_pts']);
    const benchmarkRevparPct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'revpar_pct']);

    const trafficColor = this.getString(payload, ['financial_traffic_light', 'color']).toUpperCase();
    const trafficTone: TrafficTone =
      trafficColor === 'GREEN'
        ? 'green'
        : trafficColor === 'YELLOW'
          ? 'yellow'
          : trafficColor === 'RED'
            ? 'red'
            : 'gray';
    const trafficLabel = this.getString(payload, ['financial_traffic_light', 'label']) || 'Sin clasificacion';
    const trafficReasons = this.getStringArray(payload, ['financial_traffic_light', 'reasons']);

    const revparTrend = this.getRecordArray(payload, ['profitability_and_sales', 'revpar_monthly_trend']).map(
      (row) => ({
        month: this.getString(row, ['month']) || '-',
        revpar: this.getNumber(row, ['revpar']),
        roomRevenue: this.getNumber(row, ['room_revenue']),
        roomCount: this.getNumber(row, ['room_count']),
        availableRoomNights: this.getNumber(row, ['available_room_nights']),
      })
    );

    return {
      periodLabel: periodStart && periodEnd ? `${periodStart} a ${periodEnd}` : 'Periodo sin definir',
      summaryCards: [
        {
          label: 'Ingresos',
          valueLabel: this.formatCurrency(revenue),
          note: 'Ingresos netos del periodo',
          icon: 'fa-solid fa-sack-dollar',
          tone: 'blue',
        },
        {
          label: 'Costos',
          valueLabel: this.formatCurrency(costs),
          note: 'Costos de prestacion de servicios',
          icon: 'fa-solid fa-industry',
          tone: 'amber',
        },
        {
          label: 'Gastos',
          valueLabel: this.formatCurrency(expenses),
          note: 'Gastos operativos registrados',
          icon: 'fa-solid fa-file-invoice-dollar',
          tone: 'red',
        },
        {
          label: 'Utilidad neta',
          valueLabel: this.formatCurrency(netProfit),
          note: `Ocupacion ${this.formatPercent(occupancyRatePct, 1)}`,
          icon: 'fa-solid fa-chart-line',
          tone: netProfit >= 0 ? 'green' : 'red',
        },
      ],
      benchmarkCards: [
        {
          label: 'Var. ingresos',
          valueLabel: this.formatPercentNullable(benchmarkRevenuePct, 2),
          note: 'Vs. mismo periodo ano anterior',
          icon: 'fa-solid fa-arrow-trend-up',
          tone: this.resolveToneFromNullableNumber(benchmarkRevenuePct),
        },
        {
          label: 'Var. utilidad neta',
          valueLabel: this.formatPercentNullable(benchmarkNetProfitPct, 2),
          note: 'Comparativo interanual',
          icon: 'fa-solid fa-scale-balanced',
          tone: this.resolveToneFromNullableNumber(benchmarkNetProfitPct),
        },
        {
          label: 'Var. ocupacion',
          valueLabel: this.formatSignedNumber(benchmarkOccupancyPts, 2) + ' pts',
          note: 'Puntos porcentuales',
          icon: 'fa-solid fa-bed',
          tone: benchmarkOccupancyPts >= 0 ? 'green' : 'red',
        },
        {
          label: 'Var. RevPAR',
          valueLabel: this.formatPercentNullable(benchmarkRevparPct, 2),
          note: 'Ingreso por habitacion disponible',
          icon: 'fa-solid fa-chart-area',
          tone: this.resolveToneFromNullableNumber(benchmarkRevparPct),
        },
      ],
      taxCards: [
        {
          label: 'Impuesto de renta',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'income_tax', 'amount'])),
          note:
            'Tarifa aplicada ' +
            this.formatPercent(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'income_tax', 'rate_pct']),
              2
            ),
          icon: 'fa-solid fa-receipt',
          tone: 'red',
        },
        {
          label: 'ICA',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'ica', 'amount'])),
          note:
            'Tarifa x mil ' +
            this.formatNumber(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'ica', 'rate_per_thousand']),
              4
            ),
          icon: 'fa-solid fa-city',
          tone: 'amber',
        },
        {
          label: 'FONTUR',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'fontur', 'amount'])),
          note:
            'Tarifa x mil ' +
            this.formatNumber(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'fontur', 'rate_per_thousand']),
              4
            ),
          icon: 'fa-solid fa-plane-up',
          tone: 'blue',
        },
        {
          label: 'Total provisiones',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'total_provisions'])),
          note: 'Renta + ICA + FONTUR',
          icon: 'fa-solid fa-layer-group',
          tone: 'red',
        },
        {
          label: 'Ahorro IVA estimado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'benefits_monitoring', 'iva_exemption', 'estimated_savings'])),
          note: this.getBoolean(payload, ['tax_optimization', 'benefits_monitoring', 'iva_exemption', 'enabled'])
            ? 'Exencion de IVA habilitada'
            : 'Exencion de IVA no habilitada',
          icon: 'fa-solid fa-percent',
          tone: 'green',
        },
      ],
      revparTrend,
      breakEven: {
        progressPct: breakEvenProgress,
        status: breakEvenStatus,
        breakEvenRevenue: this.getNullableNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'break_even_revenue']),
        fixedCosts: this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'fixed_costs']),
        variableCosts: this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'variable_costs']),
        cpho: this.getNumber(payload, ['operational_efficiency', 'cost_per_occupied_room', 'cpho']),
      },
      traffic: {
        tone: trafficTone,
        label: trafficLabel,
        reasons: trafficReasons,
      },
    };
  }

  private buildWhatIfVm(payload: Record<string, unknown>): WhatIfVm {
    const startDate = this.getString(payload, ['period', 'start_date']);
    const endDate = this.getString(payload, ['period', 'end_date']);

    const deltaRevenuePct = this.getNullableNumber(payload, ['delta', 'revenue_pct']);
    const deltaNetProfitPct = this.getNullableNumber(payload, ['delta', 'net_profit_pct']);
    const deltaOccupancyPts = this.getNullableNumber(payload, ['delta', 'occupancy_rate_pts']);

    return {
      periodLabel: startDate && endDate ? `${startDate} a ${endDate}` : 'Periodo sin definir',
      baseCards: [
        {
          label: 'Ingresos base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'revenue'])),
          note: 'Escenario actual',
          icon: 'fa-solid fa-wallet',
          tone: 'blue',
        },
        {
          label: 'Utilidad neta base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'net_profit'])),
          note: 'Antes de simulacion',
          icon: 'fa-solid fa-scale-balanced',
          tone: 'amber',
        },
        {
          label: 'Ocupacion base',
          valueLabel: this.formatPercent(this.getNumber(payload, ['base', 'occupancy_rate_pct']), 2),
          note: 'Tasa actual',
          icon: 'fa-solid fa-bed',
          tone: 'gray',
        },
        {
          label: 'RevPAR base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'revpar'])),
          note: 'Ingreso por hab. disponible',
          icon: 'fa-solid fa-chart-column',
          tone: 'gray',
        },
      ],
      projectedCards: [
        {
          label: 'Ingresos proyectados',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'revenue'])),
          note: 'Con supuestos del escenario',
          icon: 'fa-solid fa-coins',
          tone: 'blue',
        },
        {
          label: 'Utilidad neta proyectada',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'net_profit'])),
          note: 'Resultado esperado',
          icon: 'fa-solid fa-chart-line',
          tone: 'green',
        },
        {
          label: 'Ocupacion proyectada',
          valueLabel: this.formatPercent(this.getNumber(payload, ['projected', 'occupancy_rate_pct']), 2),
          note: 'Con ajuste aplicado',
          icon: 'fa-solid fa-hotel',
          tone: 'green',
        },
        {
          label: 'RevPAR proyectado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'revpar'])),
          note: 'Escenario simulado',
          icon: 'fa-solid fa-chart-area',
          tone: 'green',
        },
      ],
      deltaCards: [
        {
          label: 'Variacion ingresos',
          valueLabel: this.formatPercentNullable(deltaRevenuePct, 2),
          note: 'Cambio porcentual',
          icon: 'fa-solid fa-arrow-up-right-dots',
          tone: this.resolveToneFromNullableNumber(deltaRevenuePct),
        },
        {
          label: 'Variacion utilidad neta',
          valueLabel: this.formatPercentNullable(deltaNetProfitPct, 2),
          note: 'Impacto del escenario',
          icon: 'fa-solid fa-signal',
          tone: this.resolveToneFromNullableNumber(deltaNetProfitPct),
        },
        {
          label: 'Variacion ocupacion',
          valueLabel:
            (deltaOccupancyPts === null ? 'N/A' : this.formatSignedNumber(deltaOccupancyPts, 2)) +
            (deltaOccupancyPts === null ? '' : ' pts'),
          note: 'Diferencia en puntos',
          icon: 'fa-solid fa-bed-pulse',
          tone: this.resolveToneFromNullableNumber(deltaOccupancyPts),
        },
        {
          label: 'Impuesto renta proyectado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'income_tax_amount'])),
          note: 'Provision estimada',
          icon: 'fa-solid fa-file-circle-check',
          tone: 'red',
        },
      ],
    };
  }

  private buildStatementsVm(payload: Record<string, unknown>): StatementsVm {
    const periodCurrent = this.getString(payload, ['period', 'current']) || '-';
    const periodPrevious = this.getString(payload, ['period', 'previous']) || '-';

    const balanceRows = this.getRecordArray(payload, ['balance_sheet', 'rows']).map((row) => {
      const current = this.getNumber(row, ['current']);
      const previous = this.getNumber(row, ['previous']);
      return {
        section: this.getString(row, ['section']) || 'BALANCE',
        account: this.getString(row, ['account']) || '-',
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const totalsRecord = this.getRecord(payload, ['balance_sheet', 'totals']);
    const totalsLabelMap: Record<string, string> = {
      total_assets: 'Total activos',
      total_liabilities: 'Total pasivos',
      total_equity: 'Total patrimonio',
      total_liabilities_and_equity: 'Total pasivo + patrimonio',
    };

    const balanceTotals: StatementRowVm[] = Object.entries(totalsRecord).map(([key, value]) => {
      const entry = this.asRecord(value);
      const current = this.getNumber(entry, ['current']);
      const previous = this.getNumber(entry, ['previous']);
      return {
        section: 'TOTAL',
        account: totalsLabelMap[key] || this.keyToLabel(key),
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const incomeRows = this.getRecordArray(payload, ['income_statement', 'rows']).map((row) => {
      const current = this.getNumber(row, ['current']);
      const previous = this.getNumber(row, ['previous']);
      return {
        section: 'RESULTADOS',
        account: this.getString(row, ['account']) || '-',
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const indicatorRecord = this.getRecord(payload, ['indicators']);
    const indicators: IndicatorVm[] = Object.entries(indicatorRecord).map(([key, value]) => {
      const entry = this.asRecord(value);
      const current = this.getNullableNumber(entry, ['current']);
      const previous = this.getNullableNumber(entry, ['previous']);
      const delta = current === null || previous === null ? null : current - previous;
      return {
        label: this.keyToLabel(key),
        formula: this.getString(entry, ['formula']) || '',
        current,
        previous,
        delta,
        deltaPct: current === null || previous === null ? null : this.computeDeltaPct(current, previous),
      };
    });

    return {
      periodCurrent,
      periodPrevious,
      balanceRows,
      balanceTotals,
      incomeRows,
      indicators,
    };
  }

  private parseConfigRecords(items: Record<string, unknown>[]): FinancialControlConfigRecord[] {
    const records: FinancialControlConfigRecord[] = [];
    for (const item of items) {
      const parsed = this.parseConfigRecord(item);
      if (parsed) records.push(parsed);
    }
    return records;
  }

  private parseConfigRecord(item: Record<string, unknown>): FinancialControlConfigRecord | null {
    const hotelSettingsIdRaw = this.getNullableNumber(item, ['hotel_settings']);
    if (hotelSettingsIdRaw === null) return null;

    const hotelSettingsId = Math.trunc(hotelSettingsIdRaw);
    if (hotelSettingsId <= 0) return null;

    const id = Math.trunc(this.getNumber(item, ['id']));
    if (id <= 0) return null;

    return {
      id,
      hotelSettingsId,
      hotelName: this.getString(item, ['hotel_name']) || `Hotel #${hotelSettingsId}`,
      districtName: this.getString(item, ['district_name']) || this.defaultDistrictName,
      tourismLawEnabled: this.getBoolean(item, ['tourism_law_enabled']),
      tourismLawPreferentialRate: this.getNumber(item, ['tourism_law_preferential_rate']),
      standardIncomeTaxRate: this.getNumber(item, ['standard_income_tax_rate']),
      hasIvaExemption: this.getBoolean(item, ['has_iva_exemption']),
      ivaRate: this.getNumber(item, ['iva_rate']),
      icaRatePerThousand: this.getNumber(item, ['ica_rate_per_thousand']),
      fonturRatePerThousand: this.getNumber(item, ['fontur_rate_per_thousand']),
      breakEvenWarningPct: this.getNumber(item, ['break_even_warning_pct']),
      breakEvenOptimalPct: this.getNumber(item, ['break_even_optimal_pct']),
      operationalHighOccupancyThresholdPct: this.getNumber(item, ['operational_high_occupancy_threshold_pct']),
      operationalLowAvailabilityThresholdRooms: this.getNumber(item, ['operational_low_availability_threshold_rooms']),
      operationalRevenueDropThresholdPct: this.getNumber(item, ['operational_revenue_drop_threshold_pct']),
      operationalHighRefundsThresholdCount: this.getNumber(item, ['operational_high_refunds_threshold_count']),
      operationalRevenueWindowDays: this.getNumber(item, ['operational_revenue_window_days']),
      operationalRefundWindowDays: this.getNumber(item, ['operational_refund_window_days']),
    };
  }

  private emptyFinancialConfigForm(): FinancialControlConfigForm {
    return {
      districtName: this.defaultDistrictName,
      tourismLawEnabled: true,
      tourismLawPreferentialRate: null,
      standardIncomeTaxRate: null,
      hasIvaExemption: false,
      ivaRate: null,
      icaRatePerThousand: null,
      fonturRatePerThousand: null,
      breakEvenWarningPct: null,
      breakEvenOptimalPct: null,
      operationalHighOccupancyThresholdPct: null,
      operationalLowAvailabilityThresholdRooms: null,
      operationalRevenueDropThresholdPct: null,
      operationalHighRefundsThresholdCount: null,
      operationalRevenueWindowDays: null,
      operationalRefundWindowDays: null,
    };
  }

  private syncConfigFormWithSelection(): void {
    const hotelSettingsId = this.selectedHotelSettingsId;
    if (!hotelSettingsId || hotelSettingsId <= 0) {
      this.configForm = this.emptyFinancialConfigForm();
      return;
    }

    const existing = this.configRecordByHotelSettingsId.get(hotelSettingsId);
    if (!existing) {
      const optionDistrict =
        this.configs.find((item) => item.hotelSettingsId === hotelSettingsId)?.districtName?.trim() || '';
      this.configForm = {
        ...this.emptyFinancialConfigForm(),
        districtName: optionDistrict || this.defaultDistrictName,
      };
      return;
    }

    this.configForm = {
      districtName: existing.districtName || this.defaultDistrictName,
      tourismLawEnabled: existing.tourismLawEnabled,
      tourismLawPreferentialRate: existing.tourismLawPreferentialRate,
      standardIncomeTaxRate: existing.standardIncomeTaxRate,
      hasIvaExemption: existing.hasIvaExemption,
      ivaRate: existing.ivaRate,
      icaRatePerThousand: existing.icaRatePerThousand,
      fonturRatePerThousand: existing.fonturRatePerThousand,
      breakEvenWarningPct: existing.breakEvenWarningPct,
      breakEvenOptimalPct: existing.breakEvenOptimalPct,
      operationalHighOccupancyThresholdPct: existing.operationalHighOccupancyThresholdPct,
      operationalLowAvailabilityThresholdRooms: existing.operationalLowAvailabilityThresholdRooms,
      operationalRevenueDropThresholdPct: existing.operationalRevenueDropThresholdPct,
      operationalHighRefundsThresholdCount: existing.operationalHighRefundsThresholdCount,
      operationalRevenueWindowDays: existing.operationalRevenueWindowDays,
      operationalRefundWindowDays: existing.operationalRefundWindowDays,
    };
  }

  private buildConfigPayload(hotelSettingsId: number): {
    payload: FinancialControlConfigPayload;
    error: string | null;
  } {
    const districtName = String(this.configForm.districtName || '').trim();
    if (!districtName) {
      return {
        payload: {
          hotel_settings: hotelSettingsId,
          district_name: '',
          tourism_law_enabled: this.configForm.tourismLawEnabled,
          has_iva_exemption: this.configForm.hasIvaExemption,
        },
        error: 'Debes ingresar el nombre del distrito.',
      };
    }

    const payload: FinancialControlConfigPayload = {
      hotel_settings: hotelSettingsId,
      district_name: districtName,
      tourism_law_enabled: !!this.configForm.tourismLawEnabled,
      has_iva_exemption: !!this.configForm.hasIvaExemption,
    };

    const tourismRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'tourism_law_preferential_rate',
      this.configForm.tourismLawPreferentialRate,
      'Tarifa preferencial ley de turismo'
    );
    if (tourismRateError) return { payload, error: tourismRateError };

    const standardTaxError = this.appendOptionalNonNegativeNumber(
      payload,
      'standard_income_tax_rate',
      this.configForm.standardIncomeTaxRate,
      'Tarifa estandar de renta'
    );
    if (standardTaxError) return { payload, error: standardTaxError };

    const ivaRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'iva_rate',
      this.configForm.ivaRate,
      'Tarifa de IVA'
    );
    if (ivaRateError) return { payload, error: ivaRateError };

    const icaRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'ica_rate_per_thousand',
      this.configForm.icaRatePerThousand,
      'Tarifa ICA x mil'
    );
    if (icaRateError) return { payload, error: icaRateError };

    const fonturRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'fontur_rate_per_thousand',
      this.configForm.fonturRatePerThousand,
      'Tarifa FONTUR x mil'
    );
    if (fonturRateError) return { payload, error: fonturRateError };

    const warningRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'break_even_warning_pct',
      this.configForm.breakEvenWarningPct,
      'Umbral de alerta break-even'
    );
    if (warningRateError) return { payload, error: warningRateError };

    const optimalRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'break_even_optimal_pct',
      this.configForm.breakEvenOptimalPct,
      'Umbral optimo break-even'
    );
    if (optimalRateError) return { payload, error: optimalRateError };

    const occupancyThresholdError = this.appendOptionalNonNegativeNumber(
      payload,
      'operational_high_occupancy_threshold_pct',
      this.configForm.operationalHighOccupancyThresholdPct,
      'Umbral ocupacion alta'
    );
    if (occupancyThresholdError) return { payload, error: occupancyThresholdError };

    const availabilityThresholdError = this.appendOptionalPositiveInteger(
      payload,
      'operational_low_availability_threshold_rooms',
      this.configForm.operationalLowAvailabilityThresholdRooms,
      'Umbral habitaciones disponibles'
    );
    if (availabilityThresholdError) return { payload, error: availabilityThresholdError };

    const revenueDropError = this.appendOptionalNonNegativeNumber(
      payload,
      'operational_revenue_drop_threshold_pct',
      this.configForm.operationalRevenueDropThresholdPct,
      'Umbral caida ingresos'
    );
    if (revenueDropError) return { payload, error: revenueDropError };

    const refundsThresholdError = this.appendOptionalPositiveInteger(
      payload,
      'operational_high_refunds_threshold_count',
      this.configForm.operationalHighRefundsThresholdCount,
      'Umbral reembolsos altos'
    );
    if (refundsThresholdError) return { payload, error: refundsThresholdError };

    const revenueWindowError = this.appendOptionalPositiveInteger(
      payload,
      'operational_revenue_window_days',
      this.configForm.operationalRevenueWindowDays,
      'Ventana dias ingresos'
    );
    if (revenueWindowError) return { payload, error: revenueWindowError };

    const refundWindowError = this.appendOptionalPositiveInteger(
      payload,
      'operational_refund_window_days',
      this.configForm.operationalRefundWindowDays,
      'Ventana dias reembolsos'
    );
    if (refundWindowError) return { payload, error: refundWindowError };

    const selectedConfig = this.selectedConfigRecord;
    const effectiveWarning =
      payload.break_even_warning_pct !== undefined
        ? payload.break_even_warning_pct
        : selectedConfig?.breakEvenWarningPct;
    const effectiveOptimal =
      payload.break_even_optimal_pct !== undefined
        ? payload.break_even_optimal_pct
        : selectedConfig?.breakEvenOptimalPct;

    if (
      effectiveWarning !== undefined &&
      effectiveWarning !== null &&
      effectiveOptimal !== undefined &&
      effectiveOptimal !== null &&
      effectiveOptimal < effectiveWarning
    ) {
      return {
        payload,
        error: 'El umbral optimo debe ser mayor o igual al umbral de alerta.',
      };
    }

    return { payload, error: null };
  }

  private appendOptionalNonNegativeNumber(
    payload: FinancialControlConfigPayload,
    key:
      | 'tourism_law_preferential_rate'
      | 'standard_income_tax_rate'
      | 'iva_rate'
      | 'ica_rate_per_thousand'
      | 'fontur_rate_per_thousand'
      | 'break_even_warning_pct'
      | 'break_even_optimal_pct'
      | 'operational_high_occupancy_threshold_pct'
      | 'operational_revenue_drop_threshold_pct',
    value: number | null,
    label: string
  ): string | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return `${label} debe ser numerico.`;
    }
    if (parsed < 0) {
      return `${label} no puede ser negativo.`;
    }
    payload[key] = parsed;
    return null;
  }

  private appendOptionalPositiveInteger(
    payload: FinancialControlConfigPayload,
    key:
      | 'operational_low_availability_threshold_rooms'
      | 'operational_high_refunds_threshold_count'
      | 'operational_revenue_window_days'
      | 'operational_refund_window_days',
    value: number | null,
    label: string
  ): string | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return `${label} debe ser un numero entero.`;
    }
    if (parsed < 1) {
      return `${label} debe ser mayor a 0.`;
    }
    payload[key] = parsed;
    return null;
  }

  private upsertConfigRecord(record: FinancialControlConfigRecord): void {
    this.configRecordByHotelSettingsId.set(record.hotelSettingsId, record);

    const existingIndex = this.configs.findIndex((item) => item.hotelSettingsId === record.hotelSettingsId);
    const previousOption = existingIndex >= 0 ? this.configs[existingIndex] : null;
    const option: HotelConfigOption = {
      id: record.id,
      configId: record.id,
      hotelSettingsId: record.hotelSettingsId,
      hotelName: record.hotelName || previousOption?.hotelName || `Hotel #${record.hotelSettingsId}`,
      districtName: record.districtName || this.defaultDistrictName,
    };

    if (existingIndex >= 0) {
      this.configs[existingIndex] = option;
      this.configs = [...this.configs];
      return;
    }

    this.configs = [option, ...this.configs];
  }

  private emptyDashboardVm(): DashboardVm {
    return {
      periodLabel: '',
      summaryCards: [],
      benchmarkCards: [],
      taxCards: [],
      revparTrend: [],
      breakEven: {
        progressPct: 0,
        status: '',
        breakEvenRevenue: null,
        fixedCosts: 0,
        variableCosts: 0,
        cpho: 0,
      },
      traffic: {
        tone: 'gray',
        label: '',
        reasons: [],
      },
    };
  }

  private emptyWhatIfVm(): WhatIfVm {
    return {
      periodLabel: '',
      baseCards: [],
      projectedCards: [],
      deltaCards: [],
    };
  }

  private emptyStatementsVm(): StatementsVm {
    return {
      periodCurrent: '',
      periodPrevious: '',
      balanceRows: [],
      balanceTotals: [],
      incomeRows: [],
      indicators: [],
    };
  }

  private extractHttpErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;

    if (error.status === 403) {
      return 'No tienes permisos para consultar control financiero (financial_control.read).';
    }

    const payload = error.error;
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === 'object') {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
      }

      for (const value of Object.values(payload as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
          return value[0];
        }
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return fallback;
  }

  private ensureHotelSelection(target: 'dashboard' | 'what_if' | 'statements' | 'all'): boolean {
    if (typeof this.selectedHotelSettingsId === 'number' && this.selectedHotelSettingsId > 0) {
      return true;
    }

    const message = 'Debes seleccionar un hotel para consultar el control financiero.';
    if (target === 'all' || target === 'dashboard') {
      this.loadingDashboard = false;
      this.dashboardError = message;
      this.dashboardVm = this.emptyDashboardVm();
    }
    if (target === 'all' || target === 'what_if') {
      this.loadingWhatIf = false;
      this.whatIfError = message;
      this.whatIfVm = this.emptyWhatIfVm();
    }
    if (target === 'all' || target === 'statements') {
      this.loadingStatements = false;
      this.statementsError = message;
      this.statementsVm = this.emptyStatementsVm();
    }
    return false;
  }

  private parseOptionalNumber(raw: string): number | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  private formatNumber(value: number, digits = 2): string {
    const safe = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe);
  }

  private formatSignedNumber(value: number, digits = 2): string {
    const safe = Number.isFinite(value) ? value : 0;
    const abs = this.formatNumber(Math.abs(safe), digits);
    if (safe > 0) return `+${abs}`;
    if (safe < 0) return `-${abs}`;
    return abs;
  }

  private formatPercent(value: number, digits = 2): string {
    return `${this.formatNumber(value, digits)}%`;
  }

  private formatPercentNullable(value: number | null, digits = 2): string {
    if (value === null) return 'N/A';
    return `${this.formatNumber(value, digits)}%`;
  }

  formatCurrencyLabel(value: number): string {
    return this.formatCurrency(value);
  }

  formatCurrencyNullable(value: number | null): string {
    if (value === null) return 'N/A';
    return this.formatCurrency(value);
  }

  formatDeltaLabel(value: number): string {
    return this.formatSignedNumber(value, 2);
  }

  formatDeltaPctLabel(value: number | null): string {
    if (value === null) return 'N/A';
    return `${this.formatSignedNumber(value, 2)}%`;
  }

  formatIndicatorValue(value: number | null): string {
    if (value === null) return 'N/A';
    return this.amountFormatter.format(value);
  }

  formatInteger(value: number): string {
    const safe = Number.isFinite(value) ? value : 0;
    return this.integerFormatter.format(safe);
  }

  private resolveToneFromNullableNumber(value: number | null): CardTone {
    if (value === null) return 'gray';
    return value >= 0 ? 'green' : 'red';
  }

  private computeDeltaPct(current: number, previous: number): number | null {
    if (!Number.isFinite(previous) || previous === 0) return null;
    if (!Number.isFinite(current)) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private toIsoDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private keyToLabel(key: string): string {
    return String(key || '')
      .split('_')
      .map((part) => {
        if (!part) return '';
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private getValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private getRecord(source: unknown, path: string[]): Record<string, unknown> {
    return this.asRecord(this.getValue(source, path));
  }

  private getRecordArray(source: unknown, path: string[]): Record<string, unknown>[] {
    const value = this.getValue(source, path);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
    );
  }

  private getString(source: unknown, path: string[]): string {
    const value = this.getValue(source, path);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  private getStringArray(source: unknown, path: string[]): string[] {
    const value = this.getValue(source, path);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
  }

  private getNumber(source: unknown, path: string[]): number {
    const value = this.getValue(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private getNullableNumber(source: unknown, path: string[]): number | null {
    const value = this.getValue(source, path);
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private getBoolean(source: unknown, path: string[]): boolean {
    const value = this.getValue(source, path);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }
}
