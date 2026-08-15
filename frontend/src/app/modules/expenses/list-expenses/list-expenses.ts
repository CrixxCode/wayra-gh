import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { CreateExpense } from '../create-expense/create-expense';
import { DetailExpense } from '../detail-expense/detail-expense';
import { ExpenseI } from '../expense-model';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { PaymentMethodI, PaymentMethodService } from '../../../services/payment-method';
import { ExpenseService } from '../../../services/expense';
import { MotionService } from '../../../services/motion';

type ExpenseActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
/**
 * Antes era `table | grid`: los **mismos datos dos veces**, con las mismas columnas en
 * dos formas. Ahora son dos preguntas distintas --el detalle de cada gasto, y en que se
 * va el dinero por categoria--.
 */
type ExpenseViewMode = 'list' | 'categories';

/**
 * El filtro que faltaba.
 *
 * Se podia filtrar por estado, categoria y metodo, pero **no por fecha**: la pregunta
 * mas comun sobre un gasto --"cuanto llevo gastado este mes"-- no tenia respuesta en su
 * propia pantalla. Se resolvia mirando la lista entera a ojo.
 */
type ExpensePeriodFilter = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'ALL';

/** Por fecha se lee el diario; por monto se encuentra el gasto gordo. */
type ExpenseSort = 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC';

@Component({
  selector: 'app-list-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateExpense, DetailExpense],
  templateUrl: './list-expenses.html',
  styleUrls: ['./list-expenses.css']
})
export class ListExpenses implements OnInit, OnChanges, OnDestroy {
  /** Dentro del contenedor de finanzas: sin encabezado ni metricas propias. */
  @Input() embedded = false;

  /**
   * Rango que impone el contenedor (dias sueltos `YYYY-MM-DD`, vacios = todo).
   *
   * Cuando llega, manda sobre el selector de periodo propio: las tres pestañas de
   * finanzas tienen que estar mirando lo mismo o sus cifras no se pueden comparar.
   */
  @Input() rangeFrom = '';
  @Input() rangeTo = '';

  /** Un cambio aqui mueve el resultado que ensena el contenedor. */
  @Output() changed = new EventEmitter<void>();

  /** Primera carga: no hay nada que ensenar todavia. */
  loading = false;

  /** Recargas: hay datos en pantalla y se atenuan en vez de desaparecer. */
  refreshing = false;

  errorMessage = '';
  infoMessage = '';

  expenses: ExpenseI[] = [];
  filteredExpenses: ExpenseI[] = [];
  expenseCategories: MasterDataI[] = [];
  paymentMethods: PaymentMethodI[] = [];

  search = '';
  activityFilter: ExpenseActivityFilter = 'ACTIVE';
  categoryFilter = 'ALL';
  methodFilter = 'ALL';
  periodFilter: ExpensePeriodFilter = 'THIS_MONTH';
  sortBy: ExpenseSort = 'DATE_DESC';
  viewMode: ExpenseViewMode = 'list';

  hotelSettingsId: number | null = null;
  showCreateDrawer = false;
  selectedExpense: ExpenseI | null = null;

  readonly activityOptions: Array<{ value: ExpenseActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' }
  ];

  readonly periodOptions: Array<{ value: ExpensePeriodFilter; label: string }> = [
    { value: 'THIS_MONTH', label: 'Este mes' },
    { value: 'LAST_MONTH', label: 'Mes pasado' },
    { value: 'LAST_30', label: 'Ultimos 30 dias' },
    { value: 'THIS_YEAR', label: 'Este ano' },
    { value: 'ALL', label: 'Todo el historico' }
  ];

  readonly sortOptions: Array<{ value: ExpenseSort; label: string }> = [
    { value: 'DATE_DESC', label: 'Mas reciente' },
    { value: 'DATE_ASC', label: 'Mas antiguo' },
    { value: 'AMOUNT_DESC', label: 'Mayor monto' },
    { value: 'AMOUNT_ASC', label: 'Menor monto' }
  ];

  private revealFrame: number | null = null;

  constructor(
    private paymentMethodService: PaymentMethodService,
    private expenseService: ExpenseService,
    private masterDataService: MasterDataService,
    private hotelSettingsService: HotelSettingsService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadExpensesData();
  }

  /** El contenedor cambio de periodo: re-filtrar sin volver a pedir nada. */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['rangeFrom'] && !changes['rangeTo']) return;
    if (!this.expenses.length) return;
    this.applyFilters();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;
        this.motion.reveal(host.querySelectorAll('.expense-row, .cat-row'), {
          stagger: 0.03,
          y: 10,
          duration: 0.26
        });
      });
    });
  }

  get totalExpenses(): number {
    return this.expenses.length;
  }

  get activeExpensesCount(): number {
    return this.expenses.filter((expense) => !!expense.is_active).length;
  }

  get totalSpentLabel(): string {
    const total = this.expenses
      .filter((expense) => !!expense.is_active)
      .reduce((sum, expense) => sum + this.toNumber(expense.amount), 0);
    return this.formatCurrency(total);
  }

  get averageExpenseLabel(): string {
    if (!this.activeExpensesCount) return this.formatCurrency(0);
    const total = this.expenses
      .filter((expense) => !!expense.is_active)
      .reduce((sum, expense) => sum + this.toNumber(expense.amount), 0);
    return this.formatCurrency(total / this.activeExpensesCount);
  }

  get canCreateExpense(): boolean {
    return !!this.hotelSettingsId && this.expenseCategories.length > 0;
  }

  // ------------------------------------------------------------------- lectura
  //
  // La tabla tenia diez columnas y encabezaba cada fila con un codigo --"EGR-0042"--
  // que no le dice nada a nadie. Lo que se quiere saber mirando los egresos es en que
  // se va el dinero y cual fue el gasto gordo, y eso son categorias y barras.

  /** Lo filtrado, no lo total: si hay un filtro puesto, la cifra debe seguirlo. */
  get filteredTotal(): number {
    return this.filteredExpenses
      .filter((expense) => expense.is_active !== false)
      .reduce((sum, expense) => sum + this.toNumber(expense.amount), 0);
  }

  /** El gasto mas grande marca el 100%: las barras se comparan entre si. */
  get maxAmount(): number {
    return this.filteredExpenses.reduce(
      (max, expense) => Math.max(max, this.toNumber(expense.amount)),
      0
    );
  }

  amountShare(expense: ExpenseI): number {
    const max = this.maxAmount;
    if (max <= 0) return 0;
    return Math.max((this.toNumber(expense.amount) / max) * 100, 2);
  }

  isBiggest(expense: ExpenseI): boolean {
    const amount = this.toNumber(expense.amount);
    return amount > 0 && amount === this.maxAmount;
  }

  /** En que se va: el desglose por categoria de lo que hay en pantalla. */
  get categoryBreakdown(): Array<{ label: string; amount: number; share: number; count: number }> {
    const byCategory = new Map<string, { amount: number; count: number }>();

    for (const expense of this.filteredExpenses) {
      if (expense.is_active === false) continue;
      const label = this.getCategoryLabel(expense);
      const current = byCategory.get(label) || { amount: 0, count: 0 };
      current.amount += this.toNumber(expense.amount);
      current.count += 1;
      byCategory.set(label, current);
    }

    const total = this.filteredTotal;
    return [...byCategory.entries()]
      .map(([label, entry]) => ({
        label,
        amount: entry.amount,
        count: entry.count,
        share: total > 0 ? (entry.amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  get topCategory(): { label: string; amount: number; share: number; count: number } | null {
    return this.categoryBreakdown[0] || null;
  }

  /**
   * Un tono por categoria, estable.
   *
   * Se deriva del nombre y no del orden en la lista: si cambia el filtro, "Nomina" sigue
   * siendo del mismo color y la vista se sigue reconociendo.
   */
  categoryTone(label: string): string {
    const palette = [
      'var(--gh-status-info-text)',
      'var(--gh-status-success-text)',
      'var(--gh-status-orange-text)',
      'var(--gh-status-violet-text)',
      'var(--gh-status-danger-text)',
      'var(--gh-status-neutral-text)'
    ];

    let hash = 0;
    for (let index = 0; index < label.length; index += 1) {
      hash = (hash * 31 + label.charCodeAt(index)) % 997;
    }
    return palette[hash % palette.length];
  }

  formatMoney(value: number): string {
    return this.formatCurrency(value);
  }

  get categoryOptions(): Array<{ value: string; label: string }> {
    const base = [{ value: 'ALL', label: 'Todas las categorias' }];
    const options = this.expenseCategories
      .map((category) => ({
        value: this.normalizeCode(category.code || category.name || String(category.id)),
        label: category.name || category.code || `Categoria #${category.id}`
      }))
      .filter((option) => !!option.value);

    const unique = new Map<string, string>();
    for (const option of options) {
      if (!unique.has(option.value)) {
        unique.set(option.value, option.label);
      }
    }

    return [
      ...base,
      ...Array.from(unique.entries()).map(([value, label]) => ({
        value,
        label
      }))
    ];
  }

  get methodOptions(): Array<{ value: string; label: string }> {
    const base = [{ value: 'ALL', label: 'Todos los metodos' }];
    const options = this.paymentMethods
      .map((method) => ({
        value: this.normalizeCode(method.code || method.name || String(method.id)),
        label: method.name || method.code || 'Metodo sin nombre'
      }))
      .filter((option) => !!option.value);

    const unique = new Map<string, string>();
    for (const option of options) {
      if (!unique.has(option.value)) {
        unique.set(option.value, option.label);
      }
    }

    return [
      ...base,
      ...Array.from(unique.entries()).map(([value, label]) => ({
        value,
        label
      }))
    ];
  }

  loadExpensesData(): void {
    // Si ya hay egresos en pantalla la recarga es silenciosa.
    if (this.expenses.length) this.refreshing = true;
    else this.loading = true;

    this.errorMessage = '';
    this.infoMessage = '';
    const selectedExpenseId = this.selectedExpense?.id ?? null;

    forkJoin({
      expenses: this.expenseService
        .listExpenses({ ordering: '-expense_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as ExpenseI[]))),
      expenseCategories: this.masterDataService
        .listMasterData({ group: 'EXPENSE_CATEGORY', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      paymentMethods: this.paymentMethodService
        .listPaymentMethods()
        .pipe(catchError(() => of([] as PaymentMethodI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ expenses, expenseCategories, paymentMethods, settings }) => {
        this.loading = false;
        this.refreshing = false;
        this.expenses = [...expenses].sort((a, b) => b.id - a.id);
        this.expenseCategories = expenseCategories;
        this.paymentMethods = paymentMethods;
        this.hotelSettingsId = this.resolveHotelSettingsId(settings, this.expenses, this.hotelSettingsId);

        if (selectedExpenseId) {
          this.selectedExpense = this.expenses.find((expense) => expense.id === selectedExpenseId) || null;
        }

        this.applyFilters();

        if (!this.hotelSettingsId) {
          this.infoMessage = 'No se encontro una configuracion activa de hotel. Podras consultar egresos, pero no crear nuevos.';
        } else if (!this.expenseCategories.length) {
          this.infoMessage = 'No hay categorias de egreso activas en master data.';
        } else if (!this.expenses.length) {
          this.infoMessage = 'No hay egresos registrados todavia.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar los egresos.';
      }
    });
  }

  refreshExpensesData(): void {
    this.loadExpensesData();
  }

  openCreateDrawer(): void {
    if (!this.canCreateExpense) return;
    this.selectedExpense = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onExpenseCreated(_: ExpenseI): void {
    this.showCreateDrawer = false;
    this.refreshExpensesData();
  }

  openDetail(expense: ExpenseI): void {
    this.showCreateDrawer = false;
    this.selectedExpense = expense;
  }

  closeDetail(): void {
    this.selectedExpense = null;
  }

  onExpenseUpdated(updatedExpense: ExpenseI): void {
    const index = this.expenses.findIndex((expense) => expense.id === updatedExpense.id);
    if (index >= 0) {
      this.expenses[index] = updatedExpense;
    } else {
      this.expenses.unshift(updatedExpense);
    }

    this.expenses = [...this.expenses].sort((a, b) => b.id - a.id);
    this.applyFilters();
    this.selectedExpense = this.expenses.find((expense) => expense.id === updatedExpense.id) || null;
  }

  exportCsv(): void {
    if (!this.filteredExpenses.length) return;

    const headers = [
      'codigo',
      'concepto',
      'categoria',
      'tipo_egreso',
      'comportamiento',
      'metodo_pago',
      'proveedor',
      'referencia',
      'fecha_egreso',
      'monto',
      'estado'
    ];

    const rows = this.filteredExpenses.map((expense) => {
      const row = [
        this.getExpenseCode(expense),
        expense.concept || '',
        this.getCategoryLabel(expense),
        this.getExpenseTypeLabel(expense),
        this.getCostBehaviorLabel(expense),
        this.getMethodLabel(expense),
        expense.supplier_name || '',
        expense.reference || '',
        this.getExpenseDateLabel(expense),
        this.toNumber(expense.amount),
        expense.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `egresos-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const query = String(this.search || '').trim().toLowerCase();

    this.filteredExpenses = this.expenses.filter((expense) => {
      const activityMatch =
        this.activityFilter === 'ALL' ||
        (this.activityFilter === 'ACTIVE' && expense.is_active) ||
        (this.activityFilter === 'INACTIVE' && !expense.is_active);

      const categoryCode = this.resolveExpenseCategoryCode(expense);
      const categoryMatch = this.categoryFilter === 'ALL' || categoryCode === this.categoryFilter;

      const methodCode = this.resolvePaymentMethodCode(expense);
      const methodMatch = this.methodFilter === 'ALL' || methodCode === this.methodFilter;

      const searchPool = [
        this.getExpenseCode(expense),
        expense.concept || '',
        expense.description || '',
        expense.reference || '',
        expense.supplier_name || '',
        this.getCategoryLabel(expense),
        this.getExpenseTypeLabel(expense),
        this.getCostBehaviorLabel(expense),
        expense.expense_category_code || '',
        this.getMethodLabel(expense),
        expense.payment_method_code || '',
        this.getExpenseDateLabel(expense),
        this.toNumber(expense.amount)
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !query || searchPool.includes(query);
      const periodMatch = this.matchesPeriod(expense);
      return activityMatch && categoryMatch && methodMatch && searchMatch && periodMatch;
    });

    this.sortFilteredExpenses();
    this.scheduleReveal();
  }

  /**
   * Las fechas de egreso son dias sueltos (`YYYY-MM-DD`), sin hora.
   *
   * Se comparan como texto contra los limites del periodo: parsearlas a `Date` las
   * desplazaria un dia segun el huso, y un gasto del dia 1 saldria del mes.
   */
  private matchesPeriod(expense: ExpenseI): boolean {
    const { from, to } = this.periodBounds();
    if (!from || !to) return true;

    const day = String(expense.expense_date || '').slice(0, 10);
    if (!day) return false;

    return day >= from && day <= to;
  }

  /** Manda el contenedor si impuso un rango; si no, el selector propio. */
  private get containerRange(): { from: string; to: string } | null {
    if (this.rangeFrom && this.rangeTo) return { from: this.rangeFrom, to: this.rangeTo };
    // Empotrado sin rango significa "todo el historico", no "vuelve a tu mes".
    return this.embedded ? { from: '', to: '' } : null;
  }

  private periodBounds(): { from: string; to: string } {
    const imposed = this.containerRange;
    if (imposed) return imposed;

    if (this.periodFilter === 'ALL') return { from: '', to: '' };

    const now = new Date();
    const iso = (date: Date): string => {
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };

    if (this.periodFilter === 'LAST_MONTH') {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        // Dia 0 del mes actual es el ultimo del anterior.
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0))
      };
    }

    if (this.periodFilter === 'LAST_30') {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
        to: iso(now)
      };
    }

    if (this.periodFilter === 'THIS_YEAR') {
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    }

    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }

  private sortFilteredExpenses(): void {
    const byDate = (a: ExpenseI, b: ExpenseI): number =>
      String(a.expense_date || '').localeCompare(String(b.expense_date || ''));

    this.filteredExpenses = [...this.filteredExpenses].sort((a, b) => {
      if (this.sortBy === 'AMOUNT_DESC') return this.toNumber(b.amount) - this.toNumber(a.amount);
      if (this.sortBy === 'AMOUNT_ASC') return this.toNumber(a.amount) - this.toNumber(b.amount);
      if (this.sortBy === 'DATE_ASC') return byDate(a, b) || a.id - b.id;
      // Mismo dia: el ultimo registrado primero, que es el orden en que se anotaron.
      return byDate(b, a) || b.id - a.id;
    });
  }

  /**
   * Salida del vacio.
   *
   * Con el periodo por defecto en "este mes", una lista vacia puede significar que no hay
   * gastos **o** que el filtro los esconde. Sin esto habria que adivinar cual de las dos.
   */
  showAllPeriods(): void {
    this.periodFilter = 'ALL';
    this.applyFilters();
  }

  /** El periodo en palabras, para que la cifra grande diga de que habla. */
  get periodLabel(): string {
    const imposed = this.containerRange;
    if (imposed) return imposed.from && imposed.to ? `${imposed.from} a ${imposed.to}` : 'todo el historico';

    return (
      this.periodOptions.find((option) => option.value === this.periodFilter)?.label ||
      'Todo el historico'
    );
  }

  setViewMode(mode: ExpenseViewMode): void {
    this.viewMode = mode;
    this.scheduleReveal();
  }

  getExpenseCode(expense: ExpenseI): string {
    return `EGR-${String(expense.id).padStart(4, '0')}`;
  }

  getCategoryLabel(expense: ExpenseI): string {
    if (expense.expense_category_name?.trim()) return expense.expense_category_name.trim();

    const categoryCode = this.resolveExpenseCategoryCode(expense);
    if (categoryCode && categoryCode !== 'SINCATEGORIA') {
      const category = this.expenseCategories.find((item) => this.normalizeCode(item.code) === categoryCode);
      if (category?.name?.trim()) return category.name.trim();
    }

    if (expense.expense_category_code?.trim()) return expense.expense_category_code.trim();
    return 'Sin categoria';
  }

  getMethodLabel(expense: ExpenseI): string {
    if (expense.payment_method_name?.trim()) return expense.payment_method_name.trim();

    const methodCode = this.resolvePaymentMethodCode(expense);
    if (methodCode && methodCode !== 'SINMETODO') {
      const method = this.paymentMethods.find((item) => this.normalizeCode(item.code) === methodCode);
      if (method?.name?.trim()) return method.name.trim();
    }

    if (expense.payment_method_code?.trim()) return expense.payment_method_code.trim();
    return 'Sin metodo';
  }

  getExpenseTypeLabel(expense: ExpenseI): string {
    if (expense.expense_type_label?.trim()) return expense.expense_type_label.trim();
    return this.mapExpenseType(expense.expense_type);
  }

  getCostBehaviorLabel(expense: ExpenseI): string {
    if (expense.cost_behavior_label?.trim()) return expense.cost_behavior_label.trim();
    return this.mapCostBehavior(expense.cost_behavior);
  }

  getStatusTone(expense: ExpenseI): { bg: string; color: string; dot: string } {
    if (expense.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-muted)'
    };
  }

  getAmountLabel(expense: ExpenseI): string {
    return this.formatCurrency(this.toNumber(expense.amount));
  }

  getExpenseDateLabel(expense: ExpenseI): string {
    return this.formatDate(expense.expense_date);
  }

  getRecordDateLabel(expense: ExpenseI): string {
    return this.formatDateTime(expense.created_at);
  }

  trackByExpense(_: number, expense: ExpenseI): number {
    return expense.id;
  }

  private resolveExpenseCategoryCode(expense: ExpenseI): string {
    const categoryCode = this.normalizeCode(expense.expense_category_code);
    if (categoryCode) return categoryCode;

    const categoryName = this.normalizeCode(expense.expense_category_name);
    if (categoryName) return categoryName;

    return 'SINCATEGORIA';
  }

  private resolvePaymentMethodCode(expense: ExpenseI): string {
    const methodCode = this.normalizeCode(expense.payment_method_code);
    if (methodCode) return methodCode;

    const methodName = this.normalizeCode(expense.payment_method_name);
    if (methodName) return methodName;

    return 'SINMETODO';
  }

  private resolveHotelSettingsId(
    settings: { id?: number } | null,
    expenses: ExpenseI[],
    current: number | null
  ): number | null {
    const fromSettings = Number(settings?.id || 0);
    if (fromSettings > 0) return fromSettings;

    if (typeof current === 'number' && current > 0) return current;

    const fromExpenses = expenses.find((expense) => Number(expense.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromExpenses === 'number' && fromExpenses > 0) return fromExpenses;

    return null;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private mapExpenseType(value: string | null | undefined): string {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'OPERATING_COST') return 'Costo operativo';
    if (normalized === 'SALES_EXPENSE') return 'Gasto de ventas';
    if (normalized === 'ADMIN_EXPENSE') return 'Gasto administrativo';
    return 'Sin clasificacion';
  }

  private mapCostBehavior(value: string | null | undefined): string {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'VARIABLE') return 'Variable';
    if (normalized === 'FIXED') return 'Fijo';
    return 'Sin clasificacion';
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
