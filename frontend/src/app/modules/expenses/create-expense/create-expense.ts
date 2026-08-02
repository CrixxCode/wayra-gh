import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { CostBehavior, ExpenseCreatePayloadI, ExpenseI, ExpenseType } from '../expense-model';
import { ExpenseService } from '../../../services/expense';

@Component({
  selector: 'app-create-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-expense.html',
  styleUrls: ['./create-expense.css']
})
export class CreateExpense implements OnChanges {
  readonly expenseTypeOptions: Array<{ value: ExpenseType; label: string }> = [
    { value: 'OPERATING_COST', label: 'Costo operativo' },
    { value: 'ADMIN_EXPENSE', label: 'Gasto administrativo' },
    { value: 'SALES_EXPENSE', label: 'Gasto de ventas' }
  ];

  readonly costBehaviorOptions: Array<{ value: CostBehavior; label: string }> = [
    { value: 'FIXED', label: 'Fijo' },
    { value: 'VARIABLE', label: 'Variable' }
  ];

  @Input() hotelSettingsId: number | null = null;
  @Input() expenseCategories: MasterDataI[] = [];
  @Input() paymentMethods: MasterDataI[] = [];

  @Output() created = new EventEmitter<ExpenseI>();
  @Output() cancelled = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  expenseForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private expenseService: ExpenseService
  ) {
    this.expenseForm = this.fb.group({
      expense_category: [null as number | null, [Validators.required]],
      expense_type: ['ADMIN_EXPENSE' as ExpenseType, [Validators.required]],
      cost_behavior: ['FIXED' as CostBehavior, [Validators.required]],
      payment_method: [null as number | null],
      concept: ['', [Validators.required, Validators.maxLength(150)]],
      amount: [0, [Validators.required, Validators.min(1)]],
      expense_date: [this.todayIsoDate(), [Validators.required]],
      supplier_name: ['', [Validators.maxLength(150)]],
      reference: ['', [Validators.maxLength(100)]],
      description: [''],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['expenseCategories']) {
      this.ensureDefaultCategory();
    }
  }

  get expense_category() {
    return this.expenseForm.get('expense_category');
  }

  get concept() {
    return this.expenseForm.get('concept');
  }

  get expense_type() {
    return this.expenseForm.get('expense_type');
  }

  get cost_behavior() {
    return this.expenseForm.get('cost_behavior');
  }

  get amount() {
    return this.expenseForm.get('amount');
  }

  get expense_date() {
    return this.expenseForm.get('expense_date');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.hotelSettingsId) {
      this.errorMessage = 'No se encontro configuracion de hotel para registrar el egreso.';
      return;
    }

    if (!this.expenseCategories.length) {
      this.errorMessage = 'No hay categorias de egreso activas en master data.';
      return;
    }

    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const raw = this.expenseForm.getRawValue();
    const amount = this.normalizeAmount(raw.amount);
    if (amount <= 0) {
      this.errorMessage = 'El monto del egreso debe ser mayor a 0.';
      return;
    }

    const concept = String(raw.concept || '').trim();
    if (!concept) {
      this.errorMessage = 'Debes ingresar un concepto para el egreso.';
      return;
    }

    const expenseDate = this.normalizeDate(raw.expense_date);
    if (!expenseDate) {
      this.errorMessage = 'Debes seleccionar una fecha valida para el egreso.';
      return;
    }

    const expenseCategoryId = Number(raw.expense_category || 0);
    if (!Number.isInteger(expenseCategoryId) || expenseCategoryId <= 0) {
      this.errorMessage = 'Debes seleccionar una categoria de egreso.';
      return;
    }

    const expenseType = this.normalizeExpenseType(raw.expense_type);
    if (!expenseType) {
      this.errorMessage = 'Debes seleccionar el tipo de egreso.';
      return;
    }

    const costBehavior = this.normalizeCostBehavior(raw.cost_behavior);
    if (!costBehavior) {
      this.errorMessage = 'Debes seleccionar el comportamiento del egreso.';
      return;
    }

    const payload: ExpenseCreatePayloadI = {
      hotel_settings: Number(this.hotelSettingsId),
      expense_category: expenseCategoryId,
      expense_type: expenseType,
      cost_behavior: costBehavior,
      payment_method: this.normalizeOptionalNumber(raw.payment_method),
      concept,
      description: this.cleanOptionalText(raw.description),
      amount,
      expense_date: expenseDate,
      supplier_name: this.cleanOptionalText(raw.supplier_name),
      reference: this.cleanOptionalText(raw.reference),
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.expenseService.createExpense(payload).subscribe({
      next: (expense) => {
        this.saving = false;
        this.created.emit(expense);
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error);
      }
    });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.cancelled.emit();
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private ensureDefaultCategory(): void {
    const selected = Number(this.expenseForm.getRawValue().expense_category || 0);
    if (selected > 0) return;
    if (!this.expenseCategories.length) return;

    this.expenseForm.patchValue({
      expense_category: this.expenseCategories[0].id
    });
  }

  private normalizeOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }

  private normalizeAmount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Number(parsed.toFixed(2));
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed;
  }

  private normalizeExpenseType(value: unknown): ExpenseType | null {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'OPERATING_COST') return 'OPERATING_COST';
    if (normalized === 'ADMIN_EXPENSE') return 'ADMIN_EXPENSE';
    if (normalized === 'SALES_EXPENSE') return 'SALES_EXPENSE';
    return null;
  }

  private normalizeCostBehavior(value: unknown): CostBehavior | null {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'FIXED') return 'FIXED';
    if (normalized === 'VARIABLE') return 'VARIABLE';
    return null;
  }

  private cleanOptionalText(value: unknown): string | null {
    const text = String(value || '').trim();
    return text ? text : null;
  }

  private todayIsoDate(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo registrar el egreso. Revisa los datos e intenta nuevamente.';

    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = (payload as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
    }

    return fallback;
  }
}
