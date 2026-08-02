import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { MaintenanceOrderFormPayload, MaintenanceOrderI } from '../modules/maintenance-orders/maintenance-order-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class MaintenanceOrdersService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly maintenanceOrdersUrl = `${this.apiBase}/api/maintenance-orders/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listMaintenanceOrders(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<MaintenanceOrderI[]> {
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
      .get<MaintenanceOrderI[] | DRFPaginated<MaintenanceOrderI>>(this.maintenanceOrdersUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<MaintenanceOrderI>(res)));
  }

  getMaintenanceOrderById(id: number): Observable<MaintenanceOrderI> {
    return this.http.get<MaintenanceOrderI>(`${this.maintenanceOrdersUrl}${id}/`, { withCredentials: true });
  }

  createMaintenanceOrder(payload: MaintenanceOrderFormPayload): Observable<MaintenanceOrderI> {
    return this.http.post<MaintenanceOrderI>(
      this.maintenanceOrdersUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateMaintenanceOrder(id: number, payload: Partial<MaintenanceOrderFormPayload>): Observable<MaintenanceOrderI> {
    return this.http.patch<MaintenanceOrderI>(
      `${this.maintenanceOrdersUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteMaintenanceOrder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.maintenanceOrdersUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreMaintenanceOrder(id: number): Observable<MaintenanceOrderI> {
    return this.http.post<MaintenanceOrderI>(
      `${this.maintenanceOrdersUrl}${id}/restore/`,
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

  private normalizeCreatePayload(payload: MaintenanceOrderFormPayload): MaintenanceOrderFormPayload {
    return {
      room: Number(payload.room),
      title: String(payload.title || '').trim(),
      description: (payload.description || '').trim(),
      priority: this.normalizeCodeOrId(payload.priority),
      status: this.normalizeCodeOrId(payload.status),
      estimated_completed_at: this.normalizeDateTime(payload.estimated_completed_at),
      completed_at: this.normalizeDateTime(payload.completed_at)
    };
  }

  private normalizePatchPayload(payload: Partial<MaintenanceOrderFormPayload>): Partial<MaintenanceOrderFormPayload> {
    const normalized: Partial<MaintenanceOrderFormPayload> = {};

    if (typeof payload.room === 'number') {
      normalized.room = Number(payload.room);
    }

    if (typeof payload.title === 'string') {
      normalized.title = payload.title.trim();
    }

    if (typeof payload.description === 'string') {
      normalized.description = payload.description.trim();
    }

    if (payload.priority !== undefined) {
      normalized.priority = this.normalizeCodeOrId(payload.priority);
    }

    if (payload.status !== undefined) {
      normalized.status = this.normalizeCodeOrId(payload.status);
    }

    if (payload.estimated_completed_at !== undefined) {
      normalized.estimated_completed_at = this.normalizeDateTime(payload.estimated_completed_at);
    }

    if (payload.completed_at !== undefined) {
      normalized.completed_at = this.normalizeDateTime(payload.completed_at);
    }

    return normalized;
  }

  private normalizeCodeOrId(value: unknown): string | number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value);
    }

    const asString = String(value || '').trim();
    if (/^\d+$/.test(asString)) {
      return Number(asString);
    }

    return asString.toUpperCase();
  }

  private normalizeDateTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
