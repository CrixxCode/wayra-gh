import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import {
  CostBehavior,
  ExpenseCreatePayloadI,
  ExpenseI,
  ExpenseType,
} from '../modules/expenses/expense-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly expensesUrl = `${this.apiBase}/api/expenses/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listExpenses(filters?: {
    search?: string;
    ordering?: string;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<ExpenseI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<ExpenseI[] | DRFPaginated<ExpenseI>>(this.expensesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ExpenseI>(res)));
  }

  getExpenseById(id: number): Observable<ExpenseI> {
    return this.http.get<ExpenseI>(`${this.expensesUrl}${id}/`, { withCredentials: true });
  }

  createExpense(payload: ExpenseCreatePayloadI): Observable<ExpenseI> {
    return this.http.post<ExpenseI>(
      this.expensesUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateExpense(id: number, payload: Partial<ExpenseCreatePayloadI>): Observable<ExpenseI> {
    return this.http.patch<ExpenseI>(
      `${this.expensesUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteExpense(id: number): Observable<void> {
    return this.http.delete<void>(`${this.expensesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreExpense(id: number): Observable<ExpenseI> {
    return this.http.post<ExpenseI>(`${this.expensesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: ExpenseCreatePayloadI): ExpenseCreatePayloadI {
    return {
      hotel_settings: Number(payload.hotel_settings),
      expense_category: Number(payload.expense_category),
      expense_type: this.normalizeExpenseType(payload.expense_type),
      cost_behavior: this.normalizeCostBehavior(payload.cost_behavior),
      payment_method: this.normalizeOptionalNumber(payload.payment_method),
      concept: String(payload.concept || '').trim(),
      description: this.normalizeNullableString(payload.description),
      amount: this.toPositiveAmount(payload.amount),
      expense_date: this.normalizeDate(payload.expense_date),
      reference: this.normalizeNullableString(payload.reference),
      supplier_name: this.normalizeNullableString(payload.supplier_name),
      is_active: payload.is_active !== false
    };
  }

  private normalizePatchPayload(payload: Partial<ExpenseCreatePayloadI>): Partial<ExpenseCreatePayloadI> {
    const normalized: Partial<ExpenseCreatePayloadI> = {};

    if (typeof payload.hotel_settings === 'number') {
      normalized.hotel_settings = Number(payload.hotel_settings);
    }

    if (typeof payload.expense_category === 'number') {
      normalized.expense_category = Number(payload.expense_category);
    }

    if (typeof payload.expense_type === 'string') {
      normalized.expense_type = this.normalizeExpenseType(payload.expense_type);
    }

    if (typeof payload.cost_behavior === 'string') {
      normalized.cost_behavior = this.normalizeCostBehavior(payload.cost_behavior);
    }

    if (payload.payment_method === null) {
      normalized.payment_method = null;
    } else if (typeof payload.payment_method === 'number') {
      normalized.payment_method = Number(payload.payment_method);
    }

    if (typeof payload.concept === 'string') {
      normalized.concept = payload.concept.trim();
    }

    if (payload.description !== undefined) {
      normalized.description = this.normalizeNullableString(payload.description);
    }

    if (typeof payload.amount === 'number') {
      normalized.amount = this.toPositiveAmount(payload.amount);
    }

    if (typeof payload.expense_date === 'string') {
      normalized.expense_date = this.normalizeDate(payload.expense_date);
    }

    if (payload.reference !== undefined) {
      normalized.reference = this.normalizeNullableString(payload.reference);
    }

    if (payload.supplier_name !== undefined) {
      normalized.supplier_name = this.normalizeNullableString(payload.supplier_name);
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizeOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toPositiveAmount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Number(parsed.toFixed(2));
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed;
  }

  private normalizeExpenseType(value: unknown): ExpenseType {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'OPERATING_COST') return 'OPERATING_COST';
    if (normalized === 'SALES_EXPENSE') return 'SALES_EXPENSE';
    return 'ADMIN_EXPENSE';
  }

  private normalizeCostBehavior(value: unknown): CostBehavior {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'VARIABLE') return 'VARIABLE';
    return 'FIXED';
  }
}
