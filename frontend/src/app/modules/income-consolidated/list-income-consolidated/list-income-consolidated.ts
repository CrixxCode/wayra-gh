import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import {
  IncomeConsolidatedDailyRow,
  IncomeConsolidatedMethodRow,
  IncomeConsolidatedQueryParams,
  IncomeConsolidatedReportResponse,
  IncomeConsolidatedSummary,
} from '../../reports/report-model';
import { ReportsService } from '../../../services/reports';
import { AuthService, MeResponse } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelContextService } from '../../../services/hotel-context';

type IncomeActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type IncomePeriodFilter = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'THIS_YEAR';
type IncomeViewMode = 'daily' | 'methods';

type DailyIncomeRow = {
  dateKey: string;
  dateLabel: string;
  transactions: number;
  activeTransactions: number;
  inactiveTransactions: number;
  totalAmount: number;
  averageTicket: number;
  topMethod: string;
  topGuest: string;
};

type MethodIncomeRow = {
  methodKey: string;
  methodLabel: string;
  transactions: number;
  activeTransactions: number;
  inactiveTransactions: number;
  totalAmount: number;
  averageTicket: number;
  sharePercent: number;
};

@Component({
  selector: 'app-list-income-consolidated',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-income-consolidated.html',
  styleUrls: ['./list-income-consolidated.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListIncomeConsolidated implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';

  dailyRows: DailyIncomeRow[] = [];
  methodRows: MethodIncomeRow[] = [];
  methodCatalog = new Map<string, string>();

  search = '';
  periodFilter: IncomePeriodFilter = 'THIS_MONTH';
  activityFilter: IncomeActivityFilter = 'ACTIVE';
  methodFilter = 'ALL';
  viewMode: IncomeViewMode = 'daily';
  renderReady = false;
  hotelSettingsId: number | null = null;

  totalTransactions = 0;
  activeTransactionsCount = 0;
  totalCollectedLabel = this.formatCurrency(0);
  todayCollectedLabel = this.formatCurrency(0);
  monthCollectedLabel = this.formatCurrency(0);
  averageTicketLabel = this.formatCurrency(0);

  readonly activityOptions: Array<{ value: IncomeActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' },
  ];

  readonly periodOptions: Array<{ value: IncomePeriodFilter; label: string }> = [
    { value: 'TODAY', label: 'Hoy' },
    { value: 'LAST_7_DAYS', label: 'Ultimos 7 dias' },
    { value: 'THIS_MONTH', label: 'Mes actual' },
    { value: 'THIS_YEAR', label: 'Ano actual' },
    { value: 'ALL', label: 'Todo el historico' },
  ];

  constructor(
    private reportsService: ReportsService,
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private hotelContextService: HotelContextService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.resolveHotelSettingsAndLoad();
  }

  get methodOptions(): Array<{ value: string; label: string }> {
    const base = [{ value: 'ALL', label: 'Todos los metodos' }];
    const options = Array.from(this.methodCatalog.entries()).map(([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return [...base, ...options];
  }

  get hasResults(): boolean {
    return this.dailyRows.length > 0 || this.methodRows.length > 0;
  }

  loadIncomeData(): void {
    this.fetchIncomeConsolidated();
  }

  refreshIncomeData(): void {
    this.fetchIncomeConsolidated();
  }

  applyFilters(): void {
    this.fetchIncomeConsolidated();
  }

  setViewMode(mode: IncomeViewMode): void {
    this.viewMode = mode;
  }

  exportCsv(): void {
    if (this.viewMode === 'daily') {
      this.exportDailyCsv();
      return;
    }
    this.exportMethodsCsv();
  }

  trackByDailyRow(_: number, row: DailyIncomeRow): string {
    return row.dateKey;
  }

  trackByMethodRow(_: number, row: MethodIncomeRow): string {
    return row.methodKey;
  }

  getMethodCardTone(index: number): { bg: string; accent: string } {
    const palette = [
      { bg: 'var(--gh-status-info-bg)', accent: 'var(--gh-status-info-text)' },
      { bg: 'var(--gh-status-success-bg)', accent: 'var(--gh-status-success-text)' },
      { bg: 'var(--gh-status-orange-bg)', accent: 'var(--gh-status-orange-text)' },
      { bg: 'var(--gh-status-violet-bg)', accent: 'var(--gh-status-violet-text)' },
      { bg: 'var(--gh-status-danger-bg)', accent: 'var(--gh-status-danger-text)' },
      { bg: 'var(--gh-status-neutral-bg)', accent: 'var(--gh-status-neutral-text)' },
    ];
    return palette[index % palette.length];
  }

  formatShare(value: number): string {
    const safe = Number.isFinite(value) ? value : 0;
    return `${safe.toFixed(1)}%`;
  }

  formatTransactions(value: number): string {
    return new Intl.NumberFormat('es-CO').format(value || 0);
  }

  private fetchIncomeConsolidated(): void {
    if (!this.hotelSettingsId || this.hotelSettingsId <= 0) {
      this.loading = false;
      this.renderReady = false;
      this.errorMessage =
        'No se pudo determinar el hotel activo para consultar el consolidado de ingresos.';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.renderReady = false;
    this.errorMessage = '';
    this.infoMessage = '';

    const params: IncomeConsolidatedQueryParams = {
      hotel_settings: this.hotelSettingsId,
      period: this.periodFilter,
      activity: this.activityFilter,
      method: this.methodFilter === 'ALL' ? '' : this.methodFilter,
      search: String(this.search || '').trim(),
    };

    this.reportsService
      .getIncomeConsolidatedReport(params)
      .pipe(
        catchError(() => {
          this.loading = false;
          this.renderReady = false;
          this.errorMessage = 'No fue posible cargar el consolidado de ingresos.';
          this.cdr.markForCheck();
          return of(null);
        })
      )
      .subscribe((response) => {
        if (!response) return;

        this.applyResponse(response);
        this.revealContentReady();
      });
  }

  private applyResponse(response: IncomeConsolidatedReportResponse): void {
    this.dailyRows = this.mapDailyRows(response.daily_rows || []);
    this.methodRows = this.mapMethodRows(response.method_rows || []);
    this.updateMethodCatalog(response.method_rows || []);
    this.recomputeSummaryCards(response.summary);

    const hasRows = this.dailyRows.length > 0 || this.methodRows.length > 0;
    if (!hasRows) {
      this.infoMessage = 'No hay ingresos para los filtros seleccionados.';
    }
  }

  private resolveHotelSettingsAndLoad(): void {
    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    forkJoin({
      settings: this.hotelSettingsService
        .getCurrentSettings()
        .pipe(catchError(() => of(null))),
      me: this.authService.getUserInfo().pipe(catchError(() => of(null as MeResponse | null))),
    }).subscribe(({ settings, me }) => {
      const settingsId = Number((settings as { id?: unknown } | null)?.id || 0);
      const meId = this.resolveHotelIdFromMe(me);
      const contextId = Number(this.hotelContextService.selectedHotelSettingsId || 0);
      const isGlobalAdmin = Boolean(me?.is_staff) && meId <= 0;
      const resolvedId = isGlobalAdmin
        ? contextId
        : meId > 0
          ? meId
          : settingsId;

      this.hotelSettingsId = resolvedId > 0 ? resolvedId : null;
      if (!this.hotelSettingsId) {
        this.loading = false;
        this.renderReady = false;
        this.errorMessage =
          'No se encontro un hotel activo. Selecciona un hotel en el encabezado.';
        this.cdr.markForCheck();
        return;
      }
      this.loadIncomeData();
    });
  }

  private resolveHotelIdFromMe(me: MeResponse | null): number {
    const unknownMe = me as unknown as {
      hotel_settings?: { id?: unknown } | number | null;
      hotel_settings_id?: unknown;
    } | null;

    const nestedId =
      unknownMe && typeof unknownMe.hotel_settings === 'object'
        ? Number(unknownMe.hotel_settings?.id || 0)
        : 0;
    if (nestedId > 0) return nestedId;

    const directHotelSettings =
      unknownMe && typeof unknownMe.hotel_settings === 'number'
        ? Number(unknownMe.hotel_settings)
        : 0;
    if (directHotelSettings > 0) return directHotelSettings;

    const topLevelId = Number(unknownMe?.hotel_settings_id || 0);
    if (topLevelId > 0) return topLevelId;

    return 0;
  }

  private mapDailyRows(rows: IncomeConsolidatedDailyRow[]): DailyIncomeRow[] {
    return rows.map((row) => ({
      dateKey: row.date_key,
      dateLabel: this.formatBackendDateLabel(row.date_key, row.date_label),
      transactions: this.toNumber(row.transactions),
      activeTransactions: this.toNumber(row.active_transactions),
      inactiveTransactions: this.toNumber(row.inactive_transactions),
      totalAmount: this.toNumber(row.total_amount),
      averageTicket: this.toNumber(row.average_ticket),
      topMethod: row.top_method || 'Sin metodo',
      topGuest: row.top_guest || 'Huesped sin nombre',
    }));
  }

  private mapMethodRows(rows: IncomeConsolidatedMethodRow[]): MethodIncomeRow[] {
    return rows.map((row) => ({
      methodKey: row.method_key || 'SINMETODO',
      methodLabel: row.method_label || 'Sin metodo',
      transactions: this.toNumber(row.transactions),
      activeTransactions: this.toNumber(row.active_transactions),
      inactiveTransactions: this.toNumber(row.inactive_transactions),
      totalAmount: this.toNumber(row.total_amount),
      averageTicket: this.toNumber(row.average_ticket),
      sharePercent: this.toNumber(row.share_percent),
    }));
  }

  private updateMethodCatalog(rows: IncomeConsolidatedMethodRow[]): void {
    const nextCatalog = new Map(this.methodCatalog);

    for (const row of rows) {
      const key = String(row.method_key || '').trim();
      const label = String(row.method_label || '').trim();
      if (!key || !label) continue;
      if (!nextCatalog.has(key)) {
        nextCatalog.set(key, label);
      }
    }

    this.methodCatalog = nextCatalog;
  }

  private recomputeSummaryCards(summary: IncomeConsolidatedSummary): void {
    this.totalTransactions = this.toNumber(summary?.total_transactions);
    this.activeTransactionsCount = this.toNumber(summary?.active_transactions);
    this.totalCollectedLabel = this.formatCurrency(this.toNumber(summary?.total_collected));
    this.todayCollectedLabel = this.formatCurrency(this.toNumber(summary?.today_collected));
    this.monthCollectedLabel = this.formatCurrency(this.toNumber(summary?.month_collected));
    this.averageTicketLabel = this.formatCurrency(this.toNumber(summary?.average_ticket));
  }

  private formatBackendDateLabel(dateKey: string, fallbackLabel: string): string {
    if (!dateKey || dateKey === 'SIN_FECHA') return fallbackLabel || 'Sin fecha';

    const parsed = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return fallbackLabel || dateKey;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  private exportDailyCsv(): void {
    if (!this.dailyRows.length) return;

    const headers = [
      'fecha',
      'transacciones',
      'activas',
      'inactivas',
      'total_ingresos',
      'ticket_promedio',
      'metodo_principal',
      'huesped_principal',
    ];

    const rows = this.dailyRows.map((row) =>
      [
        row.dateLabel,
        row.transactions,
        row.activeTransactions,
        row.inactiveTransactions,
        row.totalAmount.toFixed(2),
        row.averageTicket.toFixed(2),
        row.topMethod,
        row.topGuest,
      ]
        .map((cell) => this.escapeCsvCell(cell))
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    this.downloadCsv(csv, `consolidado-ingresos-diario-${this.formatFileDate(new Date())}.csv`);
  }

  private exportMethodsCsv(): void {
    if (!this.methodRows.length) return;

    const headers = ['metodo', 'transacciones', 'activas', 'inactivas', 'total_ingresos', 'ticket_promedio', 'participacion'];

    const rows = this.methodRows.map((row) =>
      [
        row.methodLabel,
        row.transactions,
        row.activeTransactions,
        row.inactiveTransactions,
        row.totalAmount.toFixed(2),
        row.averageTicket.toFixed(2),
        this.formatShare(row.sharePercent),
      ]
        .map((cell) => this.escapeCsvCell(cell))
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    this.downloadCsv(csv, `consolidado-ingresos-metodos-${this.formatFileDate(new Date())}.csv`);
  }

  private downloadCsv(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private revealContentReady(): void {
    const schedule = (cb: () => void): void => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => cb());
        return;
      }
      setTimeout(cb, 0);
    };

    schedule(() => {
      schedule(() => {
        this.loading = false;
        this.renderReady = true;
        this.cdr.markForCheck();
      });
    });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  private formatFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private escapeCsvCell(value: unknown): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
