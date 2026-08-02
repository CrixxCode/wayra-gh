import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { ExpenseService } from '../../../services/expense';
import { ExpenseI } from '../expense-model';

@Component({
  selector: 'app-detail-expense',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-expense.html',
  styleUrls: ['./detail-expense.css']
})
export class DetailExpense implements OnChanges {
  @Input() expense: ExpenseI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() expenseUpdated = new EventEmitter<ExpenseI>();

  loading = false;
  updating = false;
  errorMessage = '';
  infoMessage = '';

  activeExpense: ExpenseI | null = null;

  constructor(
    private expenseService: ExpenseService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['expense']) {
      this.loadDetail();
    }
  }

  get statusLabel(): string {
    return this.activeExpense?.is_active ? 'Activo' : 'Inactivo';
  }

  get statusTone(): { bg: string; color: string; dot: string } {
    if (this.activeExpense?.is_active) {
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

  closeDrawer(): void {
    this.closed.emit();
  }

  refresh(): void {
    this.loadDetail();
  }

  toggleStatus(): void {
    if (!this.activeExpense || this.updating) return;

    if (!this.activeExpense.is_active) {
      this.updateStatus(true);
      return;
    }

    openActionConfirmation(this.confirmationService, {
      action: 'deactivate',
      target: 'egreso',
      onAccept: () => this.updateStatus(false)
    });
  }

  getAmountLabel(expenseData: ExpenseI | null): string {
    return this.formatCurrency(this.toNumber(expenseData?.amount));
  }

  getCategoryLabel(expenseData: ExpenseI | null): string {
    if (!expenseData) return 'Sin categoria';
    return expenseData.expense_category_name || expenseData.expense_category_code || 'Sin categoria';
  }

  getMethodLabel(expenseData: ExpenseI | null): string {
    if (!expenseData) return 'Sin metodo';
    return expenseData.payment_method_name || expenseData.payment_method_code || 'Sin metodo';
  }

  getExpenseTypeLabel(expenseData: ExpenseI | null): string {
    if (!expenseData) return 'Sin clasificacion';
    return expenseData.expense_type_label || this.mapExpenseType(expenseData.expense_type);
  }

  getCostBehaviorLabel(expenseData: ExpenseI | null): string {
    if (!expenseData) return 'Sin clasificacion';
    return expenseData.cost_behavior_label || this.mapCostBehavior(expenseData.cost_behavior);
  }

  getSupplierLabel(expenseData: ExpenseI | null): string {
    const supplier = expenseData?.supplier_name?.trim();
    return supplier || 'Sin proveedor';
  }

  getReferenceLabel(expenseData: ExpenseI | null): string {
    const reference = expenseData?.reference?.trim();
    return reference || 'Sin referencia';
  }

  getDescriptionLabel(expenseData: ExpenseI | null): string {
    const description = expenseData?.description?.trim();
    return description || 'Sin descripcion';
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatDateTime(value: string | null | undefined): string {
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

  private loadDetail(): void {
    if (!this.expense) {
      this.activeExpense = null;
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.expenseService
      .getExpenseById(this.expense.id)
      .pipe(catchError(() => of(this.expense as ExpenseI)))
      .subscribe({
        next: (expenseData) => {
          this.loading = false;
          this.activeExpense = expenseData;
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'No fue posible cargar el detalle del egreso.';
        }
      });
  }

  private updateStatus(nextStatus: boolean): void {
    if (!this.activeExpense) return;

    this.updating = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.expenseService.updateExpense(this.activeExpense.id, { is_active: nextStatus }).subscribe({
      next: (updatedExpense) => {
        this.updating = false;
        this.activeExpense = updatedExpense;
        this.expenseUpdated.emit(updatedExpense);
        this.infoMessage = nextStatus
          ? successActionAlert('update', 'egreso')
          : successActionAlert('deactivate', 'egreso');
      },
      error: (error) => {
        this.updating = false;
        this.errorMessage = this.extractErrorMessage(
          error,
          nextStatus ? errorActionAlert('update', 'egreso') : errorActionAlert('deactivate', 'egreso')
        );
      }
    });
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
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

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
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
