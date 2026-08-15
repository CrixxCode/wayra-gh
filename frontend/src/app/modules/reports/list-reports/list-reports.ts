import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { catchError, finalize, forkJoin, Observable, of } from 'rxjs';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MotionService } from '../../../services/motion';
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

type TabOption = {
  key: ReportTab;
  label: string;
  icon: string;
};

@Component({
  selector: 'app-list-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, DetailReport],
  templateUrl: './list-reports.html',
  styleUrls: ['./list-reports.css'],
})
export class ListReports implements OnInit, OnDestroy {
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

  // ------------------------------------------------------------------ graficos
  //
  // Antes eran SVG a mano con `preserveAspectRatio="none"`, que estira el trazo de forma
  // no uniforme: la pendiente que se veia no era la de los datos. Y barras de `div` sin
  // eje ni valor, donde pasar el cursor no daba nada.
  //
  // Se arman al llegar la respuesta y no en un getter: Chart.js redibuja ante cada
  // cambio de referencia, y un getter le daria un objeto nuevo por ciclo de deteccion.
  incomeProfitData: ChartData<'line'> = { labels: [], datasets: [] };
  incomeProfitOptions: ChartOptions<'line'> = {};

  paymentMethodsData: ChartData<'bar'> = { labels: [], datasets: [] };
  paymentMethodsOptions: ChartOptions<'bar'> = {};

  weeklyOccupancyData: ChartData<'bar'> = { labels: [], datasets: [] };
  weeklyOccupancyOptions: ChartOptions<'bar'> = {};

  incomeVsExpensesData: ChartData<'bar'> = { labels: [], datasets: [] };
  incomeVsExpensesOptions: ChartOptions<'bar'> = {};

  netProfitData: ChartData<'line'> = { labels: [], datasets: [] };
  netProfitOptions: ChartOptions<'line'> = {};

  guestOriginData: ChartData<'bar'> = { labels: [], datasets: [] };
  guestOriginOptions: ChartOptions<'bar'> = {};

  occupancyRateData: ChartData<'line'> = { labels: [], datasets: [] };
  occupancyRateOptions: ChartOptions<'line'> = {};

  occupiedRoomsData: ChartData<'bar'> = { labels: [], datasets: [] };
  occupiedRoomsOptions: ChartOptions<'bar'> = {};

  servicesIncomeData: ChartData<'bar'> = { labels: [], datasets: [] };
  servicesIncomeOptions: ChartOptions<'bar'> = {};

  servicesTransactionsData: ChartData<'bar'> = { labels: [], datasets: [] };
  servicesTransactionsOptions: ChartOptions<'bar'> = {};

  /**
   * Paleta validada contra el fondo real de la tarjeta (#ffffff).
   *
   * Azul/rojo pasan todo. El verde queda por debajo de 3:1 de contraste, asi que los
   * graficos que lo usan llevan **leyenda visible**: es el alivio que exige esa regla,
   * no algo que se pueda ignorar.
   */
  private readonly viz = {
    income: '#2a78d6',
    profit: '#1baf7a',
    expenses: '#e34948',
    fill: 'rgba(42, 120, 214, 0.1)',
    profitFill: 'rgba(27, 175, 122, 0.12)',
    tick: '#64748b',
    grid: '#e8edf6',
  };

  readonly tabs: TabOption[] = [
    { key: 'executive', label: 'Resumen Ejecutivo', icon: 'fa-solid fa-house' },
    { key: 'revenue', label: 'Ingresos & Facturacion', icon: 'fa-solid fa-dollar-sign' },
    { key: 'occupancy', label: 'Ocupacion', icon: 'fa-solid fa-bed' },
    { key: 'services', label: 'Servicios & Consumos', icon: 'fa-solid fa-mug-hot' },
  ];

  private readonly compactCurrencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  private revealFrame: number | null = null;

  constructor(
    private reportsService: ReportsService,
    private hotelSettingsService: HotelSettingsService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.yearOptions = this.buildYearOptions();
    this.selectedYear = this.yearOptions[0] || new Date().getFullYear();
    this.syncRangeDatesFromYear(this.selectedYear);
    this.reportQuery = { year: this.selectedYear };
    this.bootstrapReports();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  private isTab(value: string): value is ReportTab {
    return (
      value === 'executive' || value === 'revenue' || value === 'occupancy' || value === 'services'
    );
  }

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;
        this.motion.reveal(host.querySelectorAll('.stat-card'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.panel'), {
          stagger: 0.05,
          y: 12,
          delay: 0.05,
        });
      });
    });
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

    // La pestaña vive en la URL: recargar o compartir el enlace cae donde estabas.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });

    if (!this.hasTabData(tab) && !this.loading) {
      this.loadReports(tab);
      return;
    }

    this.scheduleReveal();
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

  getRevenueNetProfitSeries(): number[] {
    return (this.revenueReport?.monthly_net_profit || []).map((item) => this.toNumber(item.value));
  }

  getRevenueChartLabels(): string[] {
    return (this.revenueReport?.monthly_income_vs_expenses || []).map((item) => item.month || '-');
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

  getBarWidth(value: number, max: number): string {
    if (!Number.isFinite(max) || max <= 0) return '0%';
    const ratio = (this.toNumber(value) / max) * 100;
    return `${Math.min(100, Math.max(2, ratio))}%`;
  }

  getPaletteColor(index: number): string {
    const palette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];
    return palette[index % palette.length];
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
          this.buildReportCharts();
          this.scheduleReveal();
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
          this.afterTabData();
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

  /** Toda asignacion de datos rehace las series y reanima la entrada. */
  private afterTabData(): void {
    this.buildReportCharts();
    this.scheduleReveal();
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

  // ------------------------------------------------------------------ graficos

  /** Rehace las series con lo que acaba de llegar. Una vez por respuesta. */
  private buildReportCharts(): void {
    this.buildServicesIncomeChart();
    this.buildServicesTransactionsChart();
    this.buildIncomeProfitChart();
    this.buildPaymentMethodsChart();
    this.buildWeeklyOccupancyChart();
    this.buildIncomeVsExpensesChart();
    this.buildNetProfitChart();
    this.buildGuestOriginChart();
    this.buildOccupancyRateChart();
    this.buildOccupiedRoomsChart();
  }

  /** Ejes de dinero: la cifra exacta la da el tooltip, el eje solo orienta. */
  private moneyScales(): ChartOptions<'line' | 'bar'>['scales'] {
    return {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: this.viz.tick, font: { size: 11 } },
      },
      y: {
        grid: { color: this.viz.grid },
        border: { display: false },
        ticks: {
          color: this.viz.tick,
          font: { size: 11 },
          callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
        },
      },
    };
  }

  private moneyTooltip() {
    return {
      callbacks: {
        label: (context: { dataset: { label?: string }; parsed: { x: number; y: number } }) => {
          const value = context.parsed.y ?? context.parsed.x;
          const name = context.dataset.label;
          const amount = this.formatCurrency(this.toNumber(value));
          return name ? `${name}: ${amount}` : amount;
        },
      },
    };
  }

  /**
   * Ingresos y utilidad comparten eje porque comparten unidad --pesos--.
   *
   * Dos series exigen leyenda, y aqui ademas es obligatoria: el verde queda por debajo
   * de 3:1 de contraste sobre blanco, y la etiqueta es el alivio de esa regla.
   */
  private buildIncomeProfitChart(): void {
    this.incomeProfitData = {
      labels: this.getExecutiveChartLabels(),
      datasets: [
        {
          label: 'Ingresos',
          data: this.getExecutiveIncomeSeries(),
          borderColor: this.viz.income,
          backgroundColor: this.viz.fill,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Utilidad',
          data: this.getExecutiveProfitSeries(),
          borderColor: this.viz.profit,
          backgroundColor: this.viz.profitFill,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    this.incomeProfitOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: this.viz.tick, usePointStyle: true, boxWidth: 8, font: { size: 12 } },
        },
        tooltip: { mode: 'index', intersect: false, ...this.moneyTooltip() },
      },
      scales: this.moneyScales(),
    };
  }

  /**
   * Metodos de pago: barras y no un anillo.
   *
   * Comparar longitudes es mas facil que comparar arcos, y una barra por metodo con el
   * nombre en el eje no necesita repartir seis colores que despues hay que descifrar en
   * una leyenda.
   */
  private buildPaymentMethodsChart(): void {
    const rows = this.executiveReport?.payment_methods || [];

    this.paymentMethodsData = {
      labels: rows.map((row) => row.method || 'Sin metodo'),
      datasets: [
        {
          data: rows.map((row) => this.toNumber(row.amount)),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 26,
        },
      ],
    };

    this.paymentMethodsOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: this.moneyTooltip() },
      scales: {
        x: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  private buildWeeklyOccupancyChart(): void {
    const rows = this.executiveReport?.weekly_occupancy || [];

    this.weeklyOccupancyData = {
      labels: rows.map((row) => row.week || '-'),
      datasets: [
        {
          data: rows.map((row) => this.toNumber(row.occupied_rooms)),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    };

    this.weeklyOccupancyOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${this.formatInteger(this.toNumber(context.parsed.y))} habitaciones`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
        y: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  /** Ingresos y gastos, misma unidad y mismo eje. */
  private buildIncomeVsExpensesChart(): void {
    this.incomeVsExpensesData = {
      labels: this.getRevenueChartLabels(),
      datasets: [
        {
          label: 'Ingresos',
          data: this.getRevenueIncomeSeries(),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 18,
        },
        {
          label: 'Gastos',
          data: this.getRevenueExpensesSeries(),
          backgroundColor: this.viz.expenses,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 18,
        },
      ],
    };

    this.incomeVsExpensesOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: this.viz.tick, usePointStyle: true, boxWidth: 8, font: { size: 12 } },
        },
        tooltip: this.moneyTooltip(),
      },
      scales: this.moneyScales(),
    };
  }

  private buildNetProfitChart(): void {
    this.netProfitData = {
      labels: this.getRevenueChartLabels(),
      datasets: [
        {
          data: this.getRevenueNetProfitSeries(),
          borderColor: this.viz.income,
          backgroundColor: this.viz.fill,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    this.netProfitOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, ...this.moneyTooltip() } },
      scales: this.moneyScales(),
    };
  }

  private buildGuestOriginChart(): void {
    const rows = this.revenueReport?.guest_origin || [];

    this.guestOriginData = {
      labels: rows.map((row) => row.country || 'Sin pais'),
      datasets: [
        {
          data: rows.map((row) => this.toNumber(row.pct)),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 22,
        },
      ],
    };

    this.guestOriginOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (context) => this.formatPercent(this.toNumber(context.parsed.x)) },
        },
      },
      scales: {
        x: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => `${this.toNumber(raw)}%`,
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  /** La ocupacion es un porcentaje: el eje se fija de 0 a 100 y no al maximo de la serie. */
  private buildOccupancyRateChart(): void {
    this.occupancyRateData = {
      labels: this.getOccupancyRateLabels(),
      datasets: [
        {
          data: this.getOccupancyRateSeries(),
          borderColor: this.viz.income,
          backgroundColor: this.viz.fill,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    this.occupancyRateOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: { label: (context) => this.formatPercent(this.toNumber(context.parsed.y)) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => `${this.toNumber(raw)}%`,
          },
        },
      },
    };
  }

  private buildOccupiedRoomsChart(): void {
    this.occupiedRoomsData = {
      labels: this.getOccupiedRoomsLabels(),
      datasets: [
        {
          data: this.getOccupiedRoomsSeries(),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    };

    this.occupiedRoomsOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${this.formatInteger(this.toNumber(context.parsed.y))} habitaciones`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
        y: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  private buildServicesIncomeChart(): void {
    const rows = this.servicesReport?.income_by_category || [];

    this.servicesIncomeData = {
      labels: rows.map((row) => row.category || 'Sin categoria'),
      datasets: [
        {
          data: rows.map((row) => this.toNumber(row.amount)),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 24,
        },
      ],
    };

    this.servicesIncomeOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: this.moneyTooltip() },
      scales: {
        x: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  private buildServicesTransactionsChart(): void {
    const rows = this.servicesReport?.transactions_by_category || [];

    this.servicesTransactionsData = {
      labels: rows.map((row) => row.category || 'Sin categoria'),
      datasets: [
        {
          data: rows.map((row) => this.toNumber(row.transactions)),
          backgroundColor: this.viz.income,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 34,
        },
      ],
    };

    this.servicesTransactionsOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${this.formatInteger(this.toNumber(context.parsed.y))} cargos`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
        y: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  // ------------------------------------------------------- hay algo que dibujar

  get hasServicesIncome(): boolean {
    return (this.servicesReport?.income_by_category || []).length > 0;
  }

  get hasServicesTransactions(): boolean {
    return (this.servicesReport?.transactions_by_category || []).length > 0;
  }

  get hasIncomeProfitChart(): boolean {
    return this.getExecutiveIncomeSeries().length > 0;
  }

  get hasPaymentMethods(): boolean {
    return (this.executiveReport?.payment_methods || []).length > 0;
  }

  get hasWeeklyOccupancy(): boolean {
    return (this.executiveReport?.weekly_occupancy || []).length > 0;
  }

  get hasIncomeVsExpenses(): boolean {
    return (this.revenueReport?.monthly_income_vs_expenses || []).length > 0;
  }

  get hasNetProfit(): boolean {
    return this.getRevenueNetProfitSeries().length > 0;
  }

  get hasGuestOrigin(): boolean {
    return (this.revenueReport?.guest_origin || []).length > 0;
  }

  get hasOccupancyRate(): boolean {
    return this.getOccupancyRateSeries().length > 0;
  }

  get hasOccupiedRooms(): boolean {
    return this.getOccupiedRoomsSeries().length > 0;
  }
}
