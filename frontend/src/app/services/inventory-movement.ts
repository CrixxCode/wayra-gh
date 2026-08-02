import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import {
  InventoryMovementFormPayload,
  InventoryMovementI
} from '../modules/inventory-movements/inventory-movement-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class InventoryMovementsService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly movementsUrl = `${this.apiBase}/api/inventory-movements/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listInventoryMovements(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<InventoryMovementI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<InventoryMovementI[] | DRFPaginated<InventoryMovementI>>(this.movementsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<InventoryMovementI>(res)));
  }

  getInventoryMovementById(id: number): Observable<InventoryMovementI> {
    return this.http.get<InventoryMovementI>(`${this.movementsUrl}${id}/`, { withCredentials: true });
  }

  createInventoryMovement(payload: InventoryMovementFormPayload): Observable<InventoryMovementI> {
    return this.http.post<InventoryMovementI>(
      this.movementsUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateInventoryMovement(
    id: number,
    payload: Partial<InventoryMovementFormPayload>
  ): Observable<InventoryMovementI> {
    return this.http.patch<InventoryMovementI>(
      `${this.movementsUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteInventoryMovement(id: number): Observable<void> {
    return this.http.delete<void>(`${this.movementsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreInventoryMovement(id: number): Observable<InventoryMovementI> {
    return this.http.post<InventoryMovementI>(
      `${this.movementsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: InventoryMovementFormPayload): InventoryMovementFormPayload {
    return {
      item: Number(payload.item),
      movement_type: Number(payload.movement_type),
      quantity: this.toPositiveInt(payload.quantity),
      reference: this.normalizeNullableString(payload.reference),
      notes: (payload.notes || '').trim(),
      is_active: !!payload.is_active
    };
  }

  private normalizePatchPayload(
    payload: Partial<InventoryMovementFormPayload>
  ): Partial<InventoryMovementFormPayload> {
    const normalized: Partial<InventoryMovementFormPayload> = {};

    if (typeof payload.item === 'number') {
      normalized.item = Number(payload.item);
    }

    if (typeof payload.movement_type === 'number') {
      normalized.movement_type = Number(payload.movement_type);
    }

    if (typeof payload.quantity === 'number') {
      normalized.quantity = this.toPositiveInt(payload.quantity);
    }

    if (payload.reference !== undefined) {
      normalized.reference = this.normalizeNullableString(payload.reference);
    }

    if (typeof payload.notes === 'string') {
      normalized.notes = payload.notes.trim();
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private toPositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
