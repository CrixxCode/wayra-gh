import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { CreateExpense } from '../create-expense/create-expense';
import { DetailExpense } from '../detail-expense/detail-expense';
import { ExpenseI } from '../expense-model';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { ExpenseService } from '../../../services/expense';

type ExpenseActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ExpenseViewMode = 'table' | 'grid';

@Component({
  selector: 'app-list-expenses',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateExpense, DetailExpense],
  templateUrl: './list-expenses.html',
  styleUrls: ['./list-expenses.css']
})
export class ListExpenses implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';

  expenses: ExpenseI[] = [];
  filteredExpenses: ExpenseI[] = [];
  expenseCategories: MasterDataI[] = [];
  paymentMethods: MasterDataI[] = [];

  search = '';
  activityFilter: ExpenseActivityFilter = 'ACTIVE';
  categoryFilter = 'ALL';
  methodFilter = 'ALL';
  viewMode: ExpenseViewMode = 'table';

  hotelSettingsId: number | null = null;
  showCreateDrawer = false;
  selectedExpense: ExpenseI | null = null;

  readonly activityOptions: Array<{ value: ExpenseActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' }
  ];

  constructor(
    private expenseService: ExpenseService,
    private masterDataService: MasterDataService,
    private hotelSettingsService: HotelSettingsService
  ) {}

  ngOnInit(): void {
    this.loadExpensesData();
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
        label: method.name || method.code || `Metodo #${method.id}`
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
    this.loading = true;
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
      paymentMethods: this.masterDataService
        .listMasterData({ group: 'PAYMENT_METHOD', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ expenses, expenseCategories, paymentMethods, settings }) => {
        this.loading = false;
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
      return activityMatch && categoryMatch && methodMatch && searchMatch;
    });
  }

  setViewMode(mode: ExpenseViewMode): void {
    this.viewMode = mode;
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
