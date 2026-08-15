import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, forkJoin, of, takeUntil } from 'rxjs';
import { MotionService } from '../../../services/motion';
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
import { BillingService } from '../../../services/billing';
import { PaymentI } from '../../billing/billing-model';

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
export class ListIncomeConsolidated implements OnInit, OnChanges, OnDestroy {
  /** Dentro del contenedor de finanzas: sin encabezado ni metricas propias. */
  @Input() embedded = false;

  /**
   * Rango que impone el contenedor (dias sueltos `YYYY-MM-DD`, vacios = todo).
   *
   * Manda sobre el selector de periodo propio: las tres pestañas de finanzas tienen que
   * mirar lo mismo o sus cifras no se pueden comparar.
   */
  @Input() rangeFrom = '';
  @Input() rangeTo = '';

  /** Un cambio aqui mueve el resultado que ensena el contenedor. */
  @Output() changed = new EventEmitter<void>();

  /** Primera carga: la vista aun no tiene nada que ensenar. */
  loading = false;

  /**
   * Recargas posteriores: hay datos en pantalla y se atenuan mientras llegan los nuevos.
   *
   * Antes toda consulta blanqueaba la vista y la reconstruia, asi que teclear en el
   * buscador la hacia parpadear entera.
   */
  refreshing = false;

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

  /**
   * El buscador escribe aqui, no en la API.
   *
   * Antes cada tecla disparaba una consulta al consolidado --una agregacion sobre todos
   * los pagos del periodo--. Escribir "Juan" eran cuatro. De ahi la lentitud.
   */
  private readonly searchInput = new Subject<void>();
  private readonly destroyed = new Subject<void>();
  private revealFrame: number | null = null;

  constructor(
    private reportsService: ReportsService,
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private hotelContextService: HotelContextService,
    private billingService: BillingService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.searchInput
      .pipe(debounceTime(350), takeUntil(this.destroyed))
      .subscribe(() => this.fetchIncomeConsolidated());

    this.resolveHotelSettingsAndLoad();
  }

  /** El contenedor cambio de periodo: volver a consultar con el rango nuevo. */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['rangeFrom'] && !changes['rangeTo']) return;
    if (!this.hotelSettingsId) return;
    this.fetchIncomeConsolidated();
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // ----------------------------------------------------------- detalle del dia
  //
  // La fila dice cuanto entro ese dia; el modal dice **de donde salio cada peso**. Es la
  // pregunta que sigue siempre a la anterior --"entraron 200.000, si, pero de quien"-- y
  // hasta ahora obligaba a irse a la pantalla de pagos y filtrar a mano.

  /** El dia abierto, o `null` si no hay modal. */
  dayDetail: DailyIncomeRow | null = null;
  dayPayments: PaymentI[] = [];
  loadingDayDetail = false;
  dayDetailError = '';

  openDayDetail(row: DailyIncomeRow): void {
    // Un dia sin fecha es el cajon de lo que llego sin fecha: no hay detalle que pedir.
    if (!row.dateKey || row.dateKey === 'SIN_FECHA') return;

    this.dayDetail = row;
    this.dayPayments = [];
    this.dayDetailError = '';
    this.loadingDayDetail = true;
    this.cdr.markForCheck();

    this.billingService
      .listPayments({
        payment_date_after: row.dateKey,
        payment_date_before: row.dateKey,
        include_inactive: true,
        ordering: '-payment_date'
      })
      .pipe(
        catchError(() => {
          this.loadingDayDetail = false;
          this.dayDetailError = 'No fue posible cargar el detalle de este dia.';
          this.cdr.markForCheck();
          return of(null);
        })
      )
      .subscribe((payments) => {
        if (!payments) return;
        this.dayPayments = payments;
        this.loadingDayDetail = false;
        this.cdr.markForCheck();
      });
  }

  closeDayDetail(): void {
    this.dayDetail = null;
    this.dayPayments = [];
    this.dayDetailError = '';
    this.cdr.markForCheck();
  }

  /** Lo cobrado del dia segun el detalle: solo lo vigente, como en el consolidado. */
  get dayDetailTotal(): number {
    return this.dayPayments
      .filter((payment) => payment.is_active !== false)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
  }

  get dayDetailVoided(): number {
    return this.dayPayments.filter((payment) => payment.is_active === false).length;
  }

  /**
   * El detalle puede no cuadrar con la fila.
   *
   * Pasa cuando el consolidado esta filtrado por metodo o por busqueda y el detalle no:
   * decirlo es mejor que dejar dos cifras distintas sin explicacion.
   */
  get dayDetailMatchesRow(): boolean {
    if (!this.dayDetail) return true;
    // Sin cobros no hay nada que comparar: avisar de un descuadre aqui seria ruido
    // encima del "no hay cobros" que ya se esta ensenando.
    if (!this.dayPayments.length) return true;
    return Math.abs(this.dayDetailTotal - this.dayDetail.totalAmount) < 1;
  }

  /** Escape cierra, como en cualquier modal del sistema. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dayDetail) this.closeDayDetail();
  }

  paymentTime(payment: PaymentI): string {
    const raw = String(payment.payment_date || '');
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  paymentAmount(payment: PaymentI): string {
    return this.formatCurrency(this.toNumber(payment.amount));
  }

  trackByPayment(_: number, payment: PaymentI): number {
    return payment.id;
  }

  /** Lo que llama el buscador: espera a que el usuario termine de escribir. */
  onSearchInput(): void {
    this.searchInput.next();
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

  // ------------------------------------------------------------------- lectura
  //
  // Una tabla de ocho columnas obliga a comparar numeros a ojo. Lo que se quiere saber
  // mirando esto es "que dia entro mas" y "por donde entra la plata", y eso son barras,
  // no cifras alineadas.

  /** El dia mas alto marca el 100%: las barras se comparan entre si, no contra una meta. */
  get maxDailyAmount(): number {
    return this.dailyRows.reduce((max, row) => Math.max(max, row.totalAmount), 0);
  }

  dailyShare(row: DailyIncomeRow): number {
    const max = this.maxDailyAmount;
    if (max <= 0) return 0;
    return Math.max((row.totalAmount / max) * 100, 2);
  }

  /** El dia que mas entro, para poder senalarlo. */
  get bestDay(): DailyIncomeRow | null {
    if (!this.dailyRows.length) return null;
    return this.dailyRows.reduce((best, row) => (row.totalAmount > best.totalAmount ? row : best));
  }

  isBestDay(row: DailyIncomeRow): boolean {
    return this.bestDay !== null && row.dateKey === this.bestDay.dateKey && row.totalAmount > 0;
  }

  get periodTotal(): number {
    return this.dailyRows.reduce((sum, row) => sum + row.totalAmount, 0);
  }

  /** Lo que entra al dia, de media, contando solo los dias con movimiento. */
  get dailyAverage(): number {
    const active = this.dailyRows.filter((row) => row.totalAmount > 0);
    if (!active.length) return 0;
    return this.periodTotal / active.length;
  }

  /** El metodo por el que mas entra: el dato que resume el reparto entero. */
  get topMethodRow(): MethodIncomeRow | null {
    if (!this.methodRows.length) return null;
    return this.methodRows.reduce((top, row) => (row.totalAmount > top.totalAmount ? row : top));
  }

  formatMoney(value: number): string {
    return this.formatCurrency(value);
  }

  /** Solo la parte del dia: la fecha completa ya esta en la fila. */
  weekdayLabel(dateKey: string): string {
    if (!dateKey || dateKey === 'SIN_FECHA') return '';
    const parsed = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('es-CO', { weekday: 'long' });
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
      this.refreshing = false;
      this.renderReady = false;
      this.errorMessage =
        'No se pudo determinar el hotel activo para consultar el consolidado de ingresos.';
      this.cdr.markForCheck();
      return;
    }

    // Si ya hay algo en pantalla se atenua; solo la primera carga la deja en blanco.
    if (this.renderReady && this.hasResults) this.refreshing = true;
    else this.loading = true;

    this.errorMessage = '';
    this.infoMessage = '';

    const params: IncomeConsolidatedQueryParams = {
      hotel_settings: this.hotelSettingsId,
      period: this.periodFilter,
      activity: this.activityFilter,
      method: this.methodFilter === 'ALL' ? '' : this.methodFilter,
      search: String(this.search || '').trim(),
    };

    // El backend quiere las dos puntas juntas o ninguna; con rango impuesto el `period`
    // pasa a ser irrelevante, pero se manda igual porque el endpoint lo exige valido.
    if (this.rangeFrom && this.rangeTo) {
      params.start_date = this.rangeFrom;
      params.end_date = this.rangeTo;
    } else if (this.embedded) {
      // Empotrado sin rango es "todo el historico", no "vuelve a tu mes".
      params.period = 'ALL';
    }

    this.reportsService
      .getIncomeConsolidatedReport(params)
      .pipe(
        catchError(() => {
          this.loading = false;
          this.refreshing = false;
          this.errorMessage = this.hasResults
            ? 'No fue posible actualizar: se muestra la ultima version cargada.'
            : 'No fue posible cargar el consolidado de ingresos.';
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

  /**
   * Antes esto encadenaba dos `requestAnimationFrame` antes de mostrar nada: dos cuadros
   * de espera que se sumaban a cada consulta sin comprar nada. Se pinta al llegar.
   */
  private revealContentReady(): void {
    this.loading = false;
    this.refreshing = false;
    this.renderReady = true;
    this.cdr.markForCheck();
    this.scheduleReveal();
  }

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;
        this.motion.reveal(host.querySelectorAll('.day-row, .method-row'), {
          stagger: 0.03,
          y: 10,
          duration: 0.26
        });
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
