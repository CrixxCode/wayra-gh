import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, Observable, of } from 'rxjs';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { ReportsService } from '../../../services/reports';
import { DetailReport } from '../detail-report/detail-report';
import {
  CategoryDetailItem,
  ExecutiveReportResponse,
  GuestOriginItem,
  OccupancyReportResponse,
  PaymentBreakdown,
  PaymentMethodSummary,
  ReportDetailData,
  ReportFilters,
  ReportQueryParams,
  ReportTab,
  RevenueReportResponse,
  RoomTypePerformanceItem,
  ServicesReportResponse,
  TopGuest,
} from '../report-model';

type KpiTone = 'blue' | 'green' | 'gold' | 'purple' | 'red';
type VariationTone = 'up' | 'down' | 'neutral';

type KpiCard = {
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: KpiTone;
  variationLabel: string;
  variationTone: VariationTone;
};

type ChartPoint = {
  x: number;
  y: number;
};

type TabOption = {
  key: ReportTab;
  label: string;
  icon: string;
};

@Component({
  selector: 'app-list-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, DetailReport],
  templateUrl: './list-reports.html',
  styleUrls: ['./list-reports.css'],
})
export class ListReports implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';

  activeTab: ReportTab = 'executive';

  detailData: ReportDetailData | null = null;

  hotelSettingsId: number | null = null;
  filterMode: 'year' | 'range' = 'year';
  selectedYear = new Date().getFullYear();
  startDate = '';
  endDate = '';
  yearOptions: number[] = [];
  reportQuery: ReportQueryParams = { year: this.selectedYear };
  lastUpdatedLabel = '';

  executiveReport: ExecutiveReportResponse | null = null;
  revenueReport: RevenueReportResponse | null = null;
  occupancyReport: OccupancyReportResponse | null = null;
  servicesReport: ServicesReportResponse | null = null;

  tabErrors: Partial<Record<ReportTab, string>> = {};

  readonly tabs: TabOption[] = [
    { key: 'executive', label: 'Resumen Ejecutivo', icon: 'fa-solid fa-house' },
    { key: 'revenue', label: 'Ingresos & Facturacion', icon: 'fa-solid fa-dollar-sign' },
    { key: 'occupancy', label: 'Ocupacion', icon: 'fa-solid fa-bed' },
    { key: 'services', label: 'Servicios & Consumos', icon: 'fa-solid fa-mug-hot' },
  ];

  private readonly chartWidth = 680;
  private readonly chartHeight = 220;
  private readonly chartPadding = 22;

  private readonly compactCurrencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  constructor(
    private reportsService: ReportsService,
    private hotelSettingsService: HotelSettingsService
  ) {}

  ngOnInit(): void {
    this.yearOptions = this.buildYearOptions();
    this.selectedYear = this.yearOptions[0] || new Date().getFullYear();
    this.syncRangeDatesFromYear(this.selectedYear);
    this.reportQuery = { year: this.selectedYear };
    this.bootstrapReports();
  }

  get activeKpiCards(): KpiCard[] {
    if (this.activeTab === 'executive') return this.buildExecutiveKpis();
    if (this.activeTab === 'revenue') return this.buildRevenueKpis();
    if (this.activeTab === 'occupancy') return this.buildOccupancyKpis();
    return this.buildServicesKpis();
  }

  get activeTabError(): string {
    return this.tabErrors[this.activeTab] || '';
  }

  onYearChange(): void {
    this.syncRangeDatesFromYear(this.selectedYear);
  }

  selectTab(tab: ReportTab): void {
    this.activeTab = tab;
    this.errorMessage = this.tabErrors[tab] || '';
    if (!this.hasTabData(tab) && !this.loading) {
      this.loadReports(tab);
    }
  }

  setFilterMode(mode: 'year' | 'range'): void {
    this.filterMode = mode;
    this.errorMessage = '';
    if (mode === 'year') {
      this.syncRangeDatesFromYear(this.selectedYear);
    }
  }

  applyTopFilters(): void {
    this.errorMessage = '';

    if (this.filterMode === 'year') {
      if (this.selectedYear < 1900 || this.selectedYear > 2999) {
        this.errorMessage = 'El ano debe estar entre 1900 y 2999.';
        return;
      }
      this.reportQuery = { year: this.selectedYear };
      this.syncRangeDatesFromYear(this.selectedYear);
    } else {
      if (!this.startDate || !this.endDate) {
        this.errorMessage = 'Debes seleccionar fecha inicial y fecha final.';
        return;
      }
      if (this.startDate > this.endDate) {
        this.errorMessage = 'La fecha inicial no puede ser mayor que la fecha final.';
        return;
      }
      this.reportQuery = {
        start_date: this.startDate,
        end_date: this.endDate,
      };
    }

    if (this.hotelSettingsId) {
      this.reportQuery.hotel_settings = this.hotelSettingsId;
    }

    this.loadReports('all');
  }

  closeDetailDrawer(): void {
    this.detailData = null;
  }

  refreshReports(): void {
    this.loadReports('all');
  }

  exportCurrentReportPdf(): void {
    const summaryLines = this.buildSummaryLinesForPdf();
    if (!summaryLines.length) return;

    const title = `Reporte ${this.resolveTabLabel(this.activeTab)}`;
    const period = this.getPeriodBadgeLabel();
    const updated = this.lastUpdatedLabel || 'Sin registro';
    const rows = summaryLines
      .map(
        (line) =>
          `<tr><th>${this.escapeHtml(line.label)}</th><td>${this.escapeHtml(line.value)}</td></tr>`
      )
      .join('');

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=720');
    if (!popup) return;

    popup.document.open();
    popup.document.write(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${this.escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 28px; color: #1f2937; }
          h1 { margin: 0 0 8px; font-size: 26px; }
          p { margin: 0 0 6px; color: #475569; }
          table { margin-top: 18px; width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d7deea; padding: 10px 12px; text-align: left; }
          th { width: 42%; background: #f8fbff; color: #334155; }
          td { color: #0f172a; }
        </style>
      </head>
      <body>
        <h1>${this.escapeHtml(title)}</h1>
        <p><strong>Periodo:</strong> ${this.escapeHtml(period)}</p>
        <p><strong>Actualizado:</strong> ${this.escapeHtml(updated)}</p>
        <table>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  openPaymentMethodDetail(item: PaymentMethodSummary): void {
    this.detailData = {
      title: item.method || 'Metodo',
      subtitle: 'Metodo de pago',
      tone: 'purple',
      metrics: [
        { label: 'Monto', value: this.formatCurrency(item.amount) },
        { label: 'Participacion', value: this.formatPercent(item.pct) },
      ],
      note: 'Distribucion de pagos del periodo seleccionado.',
    };
  }

  openTopGuestDetail(item: TopGuest): void {
    this.detailData = {
      title: item.guest_name || 'Huesped',
      subtitle: 'Top huesped',
      tone: 'blue',
      metrics: [
        { label: 'Pais', value: item.country || 'N/D' },
        { label: 'Estancias', value: this.formatInteger(item.stays) },
        { label: 'Noches', value: this.formatInteger(item.nights) },
        { label: 'Gasto total', value: this.formatCurrency(item.total_spent) },
        { label: 'Segmento', value: item.segment || 'N/D' },
      ],
      note: 'Ranking por gasto total en el periodo.',
    };
  }

  openPaymentBreakdownDetail(item: PaymentBreakdown): void {
    this.detailData = {
      title: item.method || 'Metodo',
      subtitle: 'Desglose de pagos',
      tone: 'green',
      metrics: [
        { label: 'Transacciones', value: this.formatPercent(item.transactions_pct) },
        { label: 'Monto', value: this.formatCurrency(item.amount) },
        { label: 'Participacion', value: this.formatPercent(item.amount_pct) },
      ],
      note: 'Participacion anual por metodo de pago.',
    };
  }

  openGuestOriginDetail(item: GuestOriginItem): void {
    this.detailData = {
      title: item.country || 'Pais',
      subtitle: 'Origen de huespedes',
      tone: 'purple',
      metrics: [{ label: 'Participacion', value: this.formatPercent(item.pct) }],
      note: 'Distribucion por pais de procedencia.',
    };
  }

  openRoomTypeDetail(item: RoomTypePerformanceItem): void {
    this.detailData = {
      title: item.room_type || 'Tipo de habitacion',
      subtitle: 'Performance por tipo',
      tone: 'gold',
      metrics: [
        { label: 'Ocupacion', value: this.formatPercent(item.occupancy_pct) },
        { label: 'Estancia promedio', value: `${this.formatNumber(item.avg_stay, 1)} noches` },
        { label: 'Ingresos', value: this.formatCurrency(item.income) },
      ],
      note: 'Indicadores combinados de ocupacion e ingresos.',
    };
  }

  openServiceCategoryDetail(item: CategoryDetailItem): void {
    this.detailData = {
      title: item.category || 'Categoria',
      subtitle: 'Detalle de categoria',
      tone: 'red',
      metrics: [
        { label: 'Ingresos', value: this.formatCurrency(item.income) },
        { label: 'Transacciones', value: this.formatInteger(item.transactions) },
        { label: 'Ticket promedio', value: this.formatCurrency(item.average_ticket, 1) },
        { label: 'Participacion', value: this.formatPercent(item.share_pct) },
        {
          label: 'Tendencia',
          value:
            item.trend_pct === null
              ? 'Sin comparativo'
              : `${item.trend_pct > 0 ? '+' : ''}${this.formatNumber(item.trend_pct, 1)}%`,
        },
      ],
      note: 'Comportamiento de la categoria en el periodo.',
    };
  }

  trackByTab(_: number, tab: TabOption): ReportTab {
    return tab.key;
  }

  trackByIndex(index: number): number {
    return index;
  }

  getExecutiveIncomeSeries(): number[] {
    return (this.executiveReport?.income_vs_profit_chart || []).map((item) => this.toNumber(item.income));
  }

  getExecutiveProfitSeries(): number[] {
    return (this.executiveReport?.income_vs_profit_chart || []).map((item) => this.toNumber(item.profit));
  }

  getExecutiveChartLabels(): string[] {
    return (this.executiveReport?.income_vs_profit_chart || []).map((item) => item.month || '-');
  }

  getRevenueIncomeSeries(): number[] {
    return (this.revenueReport?.monthly_income_vs_expenses || []).map((item) => this.toNumber(item.income));
  }

  getRevenueExpensesSeries(): number[] {
    return (this.revenueReport?.monthly_income_vs_expenses || []).map((item) => this.toNumber(item.expenses));
  }

  getRevenueCombinedSeries(): number[] {
    return [...this.getRevenueIncomeSeries(), ...this.getRevenueExpensesSeries()];
  }

  getRevenueNetProfitSeries(): number[] {
    return (this.revenueReport?.monthly_net_profit || []).map((item) => this.toNumber(item.value));
  }

  getRevenueChartLabels(): string[] {
    return (this.revenueReport?.monthly_income_vs_expenses || []).map((item) => item.month || '-');
  }

  getWeeklyOccupancyRoomsSeries(): number[] {
    return (this.executiveReport?.weekly_occupancy || []).map((item) => this.toNumber(item.occupied_rooms));
  }

  getOccupancyRateSeries(): number[] {
    return (this.occupancyReport?.monthly_occupancy_rate || []).map((item) => this.toNumber(item.pct));
  }

  getOccupancyRateLabels(): string[] {
    return (this.occupancyReport?.monthly_occupancy_rate || []).map((item) => item.month || '-');
  }

  getOccupiedRoomsSeries(): number[] {
    return (this.occupancyReport?.occupied_rooms_by_month || []).map((item) => this.toNumber(item.rooms));
  }

  getOccupiedRoomsLabels(): string[] {
    return (this.occupancyReport?.occupied_rooms_by_month || []).map((item) => item.month || '-');
  }

  getServicesIncomeSeries(): number[] {
    return (this.servicesReport?.income_by_category || []).map((item) => this.toNumber(item.amount));
  }

  getServicesTransactionsSeries(): number[] {
    return (this.servicesReport?.transactions_by_category || []).map((item) => this.toNumber(item.transactions));
  }

  getMaxValue(values: number[]): number {
    if (!values.length) return 0;
    return Math.max(...values.map((value) => this.toNumber(value)));
  }

  getBarHeight(value: number, max: number): string {
    if (!Number.isFinite(max) || max <= 0) return '6%';
    const ratio = (this.toNumber(value) / max) * 100;
    return `${Math.min(100, Math.max(6, ratio))}%`;
  }

  getBarWidth(value: number, max: number): string {
    if (!Number.isFinite(max) || max <= 0) return '0%';
    const ratio = (this.toNumber(value) / max) * 100;
    return `${Math.min(100, Math.max(2, ratio))}%`;
  }

  getDonutGradient(items: Array<{ pct: number }>): string {
    if (!items.length) return 'conic-gradient(var(--gh-border-strong) 0deg, var(--gh-border-strong) 360deg)';

    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];
    let current = 0;
    const segments: string[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const rawPct = this.toNumber(items[i]?.pct);
      const safePct = Math.max(0, rawPct);
      const start = current;
      const end = current + safePct * 3.6;
      const color = palette[i % palette.length];
      segments.push(`${color} ${start}deg ${end}deg`);
      current = end;
    }

    if (current < 360) {
      segments.push(`var(--gh-border) ${current}deg 360deg`);
    }

    return `conic-gradient(${segments.join(',')})`;
  }

  getPaletteColor(index: number): string {
    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];
    return palette[index % palette.length];
  }

  getLinePath(values: number[]): string {
    const points = this.getChartPoints(values);
    if (!points.length) return '';
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  }

  getAreaPath(values: number[]): string {
    const points = this.getChartPoints(values);
    if (!points.length) return '';

    const baseline = this.chartHeight - this.chartPadding;
    const first = points[0];
    const last = points[points.length - 1];
    const linePath = this.getLinePath(values);
    return `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  }

  getChartPoints(values: number[]): ChartPoint[] {
    if (!values.length) return [];

    const normalizedValues = values.map((value) => this.toNumber(value));
    const min = Math.min(...normalizedValues);
    const max = Math.max(...normalizedValues);
    const width = this.chartWidth;
    const height = this.chartHeight;
    const padding = this.chartPadding;

    return normalizedValues.map((value, index) => {
      const ratio = max === min ? 0.5 : (value - min) / (max - min);

      const x =
        normalizedValues.length === 1
          ? width / 2
          : padding + (index / (normalizedValues.length - 1)) * (width - padding * 2);

      const y = height - padding - ratio * (height - padding * 2);

      return {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      };
    });
  }

  getPeriodBadgeLabel(): string {
    if (typeof this.reportQuery.year === 'number') return `Ano ${this.reportQuery.year}`;
    if (this.reportQuery.start_date && this.reportQuery.end_date) {
      return `${this.reportQuery.start_date} a ${this.reportQuery.end_date}`;
    }
    return 'Periodo no definido';
  }

  private bootstrapReports(): void {
    this.loading = true;
    this.errorMessage = '';

    this.hotelSettingsService
      .getCurrentSettings()
      .pipe(catchError(() => of(null)))
      .subscribe((settings) => {
        const id = Number(settings?.id || 0);
        this.hotelSettingsId = id > 0 ? id : null;
        if (this.hotelSettingsId) {
          this.reportQuery.hotel_settings = this.hotelSettingsId;
        }
        this.loadReports('all');
      });
  }

  private loadReports(target: ReportTab | 'all'): void {
    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';
    if (target === 'all') {
      this.tabErrors = {};
    }

    if (target === 'all') {
      forkJoin({
        executive: this.reportsService
          .getExecutiveReport(this.reportQuery)
          .pipe(catchError((error) => this.handleTabError<ExecutiveReportResponse>('executive', error))),
        revenue: this.reportsService
          .getRevenueReport(this.reportQuery)
          .pipe(catchError((error) => this.handleTabError<RevenueReportResponse>('revenue', error))),
        occupancy: this.reportsService
          .getOccupancyReport(this.reportQuery)
          .pipe(catchError((error) => this.handleTabError<OccupancyReportResponse>('occupancy', error))),
        services: this.reportsService
          .getServicesReport(this.reportQuery)
          .pipe(catchError((error) => this.handleTabError<ServicesReportResponse>('services', error))),
      })
        .pipe(
          finalize(() => {
            this.loading = false;
          })
        )
        .subscribe((response) => {
          if (response.executive) this.executiveReport = response.executive;
          if (response.revenue) this.revenueReport = response.revenue;
          if (response.occupancy) this.occupancyReport = response.occupancy;
          if (response.services) this.servicesReport = response.services;

          if (!response.executive && !response.revenue && !response.occupancy && !response.services) {
            this.errorMessage = 'No fue posible cargar reportes para este periodo.';
            return;
          }

          this.syncLastUpdatedLabel();
          this.syncInfoMessage();
        });
      return;
    }

    this.getRequestByTab(target)
      .pipe(
        catchError((error) =>
          this.handleTabError<
            ExecutiveReportResponse | RevenueReportResponse | OccupancyReportResponse | ServicesReportResponse
          >(target, error)
        ),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe((payload) => {
        if (payload) {
          this.assignTabData(target, payload);
          delete this.tabErrors[target];
          this.syncLastUpdatedLabel();
          this.syncInfoMessage();
        } else {
          this.errorMessage = this.tabErrors[target] || 'No fue posible cargar este tab.';
        }
      });
  }

  private getRequestByTab(
    tab: ReportTab
  ): Observable<ExecutiveReportResponse | RevenueReportResponse | OccupancyReportResponse | ServicesReportResponse> {
    if (tab === 'executive') {
      return this.reportsService.getExecutiveReport(this.reportQuery);
    }
    if (tab === 'revenue') {
      return this.reportsService.getRevenueReport(this.reportQuery);
    }
    if (tab === 'occupancy') {
      return this.reportsService.getOccupancyReport(this.reportQuery);
    }
    return this.reportsService.getServicesReport(this.reportQuery);
  }

  private assignTabData(
    tab: ReportTab,
    payload: ExecutiveReportResponse | RevenueReportResponse | OccupancyReportResponse | ServicesReportResponse
  ): void {
    if (tab === 'executive') {
      this.executiveReport = payload as ExecutiveReportResponse;
      return;
    }
    if (tab === 'revenue') {
      this.revenueReport = payload as RevenueReportResponse;
      return;
    }
    if (tab === 'occupancy') {
      this.occupancyReport = payload as OccupancyReportResponse;
      return;
    }
    this.servicesReport = payload as ServicesReportResponse;
  }

  private hasTabData(tab: ReportTab): boolean {
    if (tab === 'executive') return !!this.executiveReport;
    if (tab === 'revenue') return !!this.revenueReport;
    if (tab === 'occupancy') return !!this.occupancyReport;
    return !!this.servicesReport;
  }

  private handleTabError<T>(tab: ReportTab, error: unknown): Observable<T | null> {
    const label = this.resolveTabLabel(tab);
    const message = this.extractHttpErrorMessage(error, `No fue posible cargar ${label}.`);
    this.tabErrors[tab] = message;
    return of(null);
  }

  private syncLastUpdatedLabel(): void {
    const activeFilters = this.getFiltersByTab(this.activeTab);
    const fallbackFilters =
      this.getFiltersByTab('executive') ||
      this.getFiltersByTab('revenue') ||
      this.getFiltersByTab('occupancy') ||
      this.getFiltersByTab('services');

    const filters = activeFilters || fallbackFilters;
    if (!filters?.generated_at) {
      this.lastUpdatedLabel = '';
      return;
    }

    const parsed = new Date(filters.generated_at);
    if (Number.isNaN(parsed.getTime())) {
      this.lastUpdatedLabel = filters.generated_at;
      return;
    }

    this.lastUpdatedLabel = parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getFiltersByTab(tab: ReportTab): ReportFilters | null {
    if (tab === 'executive') return this.executiveReport?.filters || null;
    if (tab === 'revenue') return this.revenueReport?.filters || null;
    if (tab === 'occupancy') return this.occupancyReport?.filters || null;
    return this.servicesReport?.filters || null;
  }

  private syncInfoMessage(): void {
    const activeHasData =
      (this.activeTab === 'executive' && !!this.executiveReport) ||
      (this.activeTab === 'revenue' && !!this.revenueReport) ||
      (this.activeTab === 'occupancy' && !!this.occupancyReport) ||
      (this.activeTab === 'services' && !!this.servicesReport);

    if (!activeHasData) {
      this.infoMessage = 'No hay datos disponibles para el tab seleccionado.';
      return;
    }

    this.infoMessage = '';
  }

  private buildExecutiveKpis(): KpiCard[] {
    const kpis = this.executiveReport?.kpis;
    if (!kpis) return [];

    return [
      {
        label: 'Ingresos anuales',
        value: this.formatCurrency(kpis.annual_income.value),
        note: 'vs ano anterior',
        icon: 'fa-solid fa-sack-dollar',
        tone: 'green',
        variationLabel: this.formatVariation(kpis.annual_income.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.annual_income.variation_pct),
      },
      {
        label: 'Utilidad neta',
        value: this.formatCurrency(kpis.net_profit.value),
        note: 'margen anual',
        icon: 'fa-solid fa-arrow-trend-up',
        tone: 'blue',
        variationLabel: this.formatVariation(kpis.net_profit.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.net_profit.variation_pct),
      },
      {
        label: 'Ocupacion media',
        value: this.formatPercent(kpis.average_occupancy.value),
        note: 'promedio del periodo',
        icon: 'fa-solid fa-bed',
        tone: 'purple',
        variationLabel: this.formatVariation(kpis.average_occupancy.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.average_occupancy.variation_pct),
      },
      {
        label: 'RevPAR',
        value: this.formatCurrency(kpis.revpar.value),
        note: 'ingreso por hab/noche',
        icon: 'fa-solid fa-percent',
        tone: 'gold',
        variationLabel: this.formatVariation(kpis.revpar.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.revpar.variation_pct),
      },
    ];
  }

  private buildRevenueKpis(): KpiCard[] {
    const kpis = this.revenueReport?.kpis;
    if (!kpis) return [];

    return [
      {
        label: 'Ingresos brutos',
        value: this.formatCurrency(kpis.gross_income.value),
        note: 'periodo consolidado',
        icon: 'fa-solid fa-arrow-trend-up',
        tone: 'green',
        variationLabel: this.formatVariation(kpis.gross_income.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.gross_income.variation_pct),
      },
      {
        label: 'Gastos totales',
        value: this.formatCurrency(kpis.total_expenses.value),
        note: 'operacion anual',
        icon: 'fa-solid fa-arrow-trend-down',
        tone: 'red',
        variationLabel: this.formatVariation(kpis.total_expenses.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.total_expenses.variation_pct),
      },
      {
        label: 'Utilidad neta',
        value: this.formatCurrency(kpis.net_profit.value),
        note: 'despues de gastos',
        icon: 'fa-solid fa-dollar-sign',
        tone: 'blue',
        variationLabel: this.formatVariation(kpis.net_profit.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.net_profit.variation_pct),
      },
      {
        label: 'Margen neto',
        value: this.formatPercent(kpis.net_margin.value),
        note: 'eficiencia financiera',
        icon: 'fa-solid fa-percent',
        tone: 'purple',
        variationLabel: this.formatVariation(kpis.net_margin.variation_points, 'pp'),
        variationTone: this.resolveVariationTone(kpis.net_margin.variation_points),
      },
    ];
  }

  private buildOccupancyKpis(): KpiCard[] {
    const kpis = this.occupancyReport?.kpis;
    if (!kpis) return [];

    return [
      {
        label: 'Ocupacion media anual',
        value: this.formatPercent(kpis.average_occupancy.value),
        note: 'habitaciones ocupadas',
        icon: 'fa-solid fa-percent',
        tone: 'blue',
        variationLabel: this.formatVariation(kpis.average_occupancy.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.average_occupancy.variation_pct),
      },
      {
        label: 'Pico de ocupacion',
        value: this.formatPercent(kpis.occupancy_peak.value),
        note: `mes: ${kpis.occupancy_peak.month || 'N/D'}`,
        icon: 'fa-regular fa-star',
        tone: 'gold',
        variationLabel: 'Record anual',
        variationTone: 'up',
      },
      {
        label: 'Estancia promedio',
        value: `${this.formatNumber(kpis.average_stay.value, 1)} noches`,
        note: 'por reserva',
        icon: 'fa-regular fa-calendar',
        tone: 'purple',
        variationLabel: this.formatVariation(kpis.average_stay.variation_nights, ' noches'),
        variationTone: this.resolveVariationTone(kpis.average_stay.variation_nights),
      },
      {
        label: 'Huespedes totales',
        value: this.formatInteger(kpis.total_guests.value),
        note: 'acumulado anual',
        icon: 'fa-solid fa-users',
        tone: 'green',
        variationLabel: this.formatVariation(kpis.total_guests.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.total_guests.variation_pct),
      },
    ];
  }

  private buildServicesKpis(): KpiCard[] {
    const kpis = this.servicesReport?.kpis;
    if (!kpis) return [];

    return [
      {
        label: 'Ingresos por servicios',
        value: this.formatCurrency(kpis.service_income.value),
        note: 'todos los departamentos',
        icon: 'fa-solid fa-mug-hot',
        tone: 'gold',
        variationLabel: this.formatVariation(kpis.service_income.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.service_income.variation_pct),
      },
      {
        label: 'Transacciones',
        value: this.formatInteger(kpis.transactions.value),
        note: 'total de cargos',
        icon: 'fa-regular fa-credit-card',
        tone: 'blue',
        variationLabel: this.formatVariation(kpis.transactions.variation_pct, '%'),
        variationTone: this.resolveVariationTone(kpis.transactions.variation_pct),
      },
      {
        label: 'Ticket promedio',
        value: this.formatCurrency(kpis.average_ticket.value, 1),
        note: 'por transaccion',
        icon: 'fa-solid fa-dollar-sign',
        tone: 'green',
        variationLabel: this.formatVariation(kpis.average_ticket.variation_value, ''),
        variationTone: this.resolveVariationTone(kpis.average_ticket.variation_value),
      },
      {
        label: 'Top categoria',
        value: kpis.top_category.name || 'Sin datos',
        note: this.formatCurrency(kpis.top_category.amount),
        icon: 'fa-regular fa-star',
        tone: 'purple',
        variationLabel: 'Mayor aporte',
        variationTone: 'up',
      },
    ];
  }

  private buildSummaryLinesForPdf(): Array<{ label: string; value: string }> {
    if (this.activeTab === 'executive') {
      const report = this.executiveReport;
      if (!report) return [];
      return [
        { label: 'Ingresos anuales', value: this.formatCurrency(report.kpis.annual_income.value) },
        { label: 'Utilidad neta', value: this.formatCurrency(report.kpis.net_profit.value) },
        { label: 'Ocupacion media', value: this.formatPercent(report.kpis.average_occupancy.value) },
        { label: 'RevPAR', value: this.formatCurrency(report.kpis.revpar.value) },
      ];
    }

    if (this.activeTab === 'revenue') {
      const report = this.revenueReport;
      if (!report) return [];
      return [
        { label: 'Ingresos brutos', value: this.formatCurrency(report.kpis.gross_income.value) },
        { label: 'Gastos totales', value: this.formatCurrency(report.kpis.total_expenses.value) },
        { label: 'Utilidad neta', value: this.formatCurrency(report.kpis.net_profit.value) },
        { label: 'Margen neto', value: this.formatPercent(report.kpis.net_margin.value) },
      ];
    }

    if (this.activeTab === 'occupancy') {
      const report = this.occupancyReport;
      if (!report) return [];
      return [
        { label: 'Ocupacion media', value: this.formatPercent(report.kpis.average_occupancy.value) },
        { label: 'Pico ocupacion', value: this.formatPercent(report.kpis.occupancy_peak.value) },
        { label: 'Estancia promedio', value: `${this.formatNumber(report.kpis.average_stay.value, 1)} noches` },
        { label: 'Huespedes totales', value: this.formatInteger(report.kpis.total_guests.value) },
      ];
    }

    const report = this.servicesReport;
    if (!report) return [];
    return [
      { label: 'Ingresos por servicios', value: this.formatCurrency(report.kpis.service_income.value) },
      { label: 'Transacciones', value: this.formatInteger(report.kpis.transactions.value) },
      { label: 'Ticket promedio', value: this.formatCurrency(report.kpis.average_ticket.value, 1) },
      { label: 'Top categoria', value: report.kpis.top_category.name || 'Sin datos' },
    ];
  }

  private resolveTabLabel(tab: ReportTab): string {
    const match = this.tabs.find((item) => item.key === tab);
    return match?.label || tab;
  }

  private buildYearOptions(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear + 1; year >= currentYear - 8; year -= 1) {
      years.push(year);
    }
    return years;
  }

  private syncRangeDatesFromYear(year: number): void {
    const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
    this.startDate = `${safeYear}-01-01`;
    this.endDate = `${safeYear}-12-31`;
  }

  formatCurrency(value: number, maxFractionDigits = 0): string {
    const safe = this.toNumber(value);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: maxFractionDigits > 0 ? 1 : 0,
    }).format(safe);
  }

  formatCompactCurrency(value: number): string {
    return this.compactCurrencyFormatter.format(this.toNumber(value));
  }

  formatPercent(value: number): string {
    return `${this.formatNumber(value, 1)}%`;
  }

  formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(this.toNumber(value));
  }

  formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(this.toNumber(value));
  }

  formatVariation(value: number | null, suffix: string): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return 'Sin comparativo';
    }
    const sign = value > 0 ? '+' : '';
    const numberLabel = this.formatNumber(value, 1);
    return `${sign}${numberLabel}${suffix}`;
  }

  resolveVariationTone(value: number | null): VariationTone {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'neutral';
    if (value > 0) return 'up';
    if (value < 0) return 'down';
    return 'neutral';
  }

  private extractHttpErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;

    if (error.status === 403) {
      return 'No tienes permisos para consultar reportes (reports.read).';
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

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
