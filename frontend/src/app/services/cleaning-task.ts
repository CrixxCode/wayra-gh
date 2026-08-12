import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import { CleaningTaskFormPayload, CleaningTaskI } from '../modules/cleaning-tasks/cleaning-task-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class CleaningTasksService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly cleaningTasksUrl = `${this.apiBase}/api/cleaning-tasks/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  // Cache-aside sobre las lecturas del trabajo en habitaciones (ver
  // `resource-cache.ts`). TTL operativo: una tarea cambia de estado varias veces al
  // dia y recepcion no puede ver una cola vieja.
  private static readonly WORK_KEYS = ['cleaning-tasks', 'maintenance-orders'];

  private cacheKey(base: string, filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length ? `${base}:${entries.join('&')}` : base;
  }

  /**
   * Cualquier escritura tira las dos claves.
   *
   * Limpieza y mantenimiento comparten pantalla y comparten habitacion: cerrar una
   * tarea cambia lo que la otra pestaña ensena sobre esa misma habitacion.
   */
  private invalidateWork(): void {
    this.cache.invalidateAll(CleaningTasksService.WORK_KEYS);
  }


  listCleaningTasks(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
    /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
    forceRefresh?: boolean;
  }): Observable<CleaningTaskI[]> {
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

    return this.cache.get(
      this.cacheKey('cleaning-tasks', filters as Record<string, unknown>),
      () =>
        this.http
          .get<CleaningTaskI[] | DRFPaginated<CleaningTaskI>>(this.cleaningTasksUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<CleaningTaskI>(res))),
      CACHE_TTL.OPERATIONAL,
      filters?.forceRefresh
    );
  }

  getCleaningTaskById(id: number): Observable<CleaningTaskI> {
    return this.http.get<CleaningTaskI>(`${this.cleaningTasksUrl}${id}/`, { withCredentials: true });
  }

  createCleaningTask(payload: CleaningTaskFormPayload): Observable<CleaningTaskI> {
    return this.http.post<CleaningTaskI>(
      this.cleaningTasksUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateWork()));
  }

  updateCleaningTask(id: number, payload: Partial<CleaningTaskFormPayload>): Observable<CleaningTaskI> {
    return this.http.patch<CleaningTaskI>(
      `${this.cleaningTasksUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateWork()));
  }

  deleteCleaningTask(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.cleaningTasksUrl}${id}/`,
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateWork()));
  }

  restoreCleaningTask(id: number): Observable<CleaningTaskI> {
    return this.http.post<CleaningTaskI>(
      `${this.cleaningTasksUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateWork()));
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: CleaningTaskFormPayload): CleaningTaskFormPayload {
    return {
      room: Number(payload.room),
      task_type: this.normalizeCodeOrId(payload.task_type),
      status: this.normalizeCodeOrId(payload.status),
      scheduled_for: this.normalizeDate(payload.scheduled_for),
      completed_at: this.normalizeDateTime(payload.completed_at),
      notes: (payload.notes || '').trim()
    };
  }

  private normalizePatchPayload(payload: Partial<CleaningTaskFormPayload>): Partial<CleaningTaskFormPayload> {
    const normalized: Partial<CleaningTaskFormPayload> = {};

    if (typeof payload.room === 'number') {
      normalized.room = Number(payload.room);
    }

    if (payload.task_type !== undefined) {
      normalized.task_type = this.normalizeCodeOrId(payload.task_type);
    }

    if (payload.status !== undefined) {
      normalized.status = this.normalizeCodeOrId(payload.status);
    }

    if (payload.scheduled_for !== undefined) {
      normalized.scheduled_for = this.normalizeDate(payload.scheduled_for);
    }

    if (payload.completed_at !== undefined) {
      normalized.completed_at = this.normalizeDateTime(payload.completed_at);
    }

    if (typeof payload.notes === 'string') {
      normalized.notes = payload.notes.trim();
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

  private normalizeDate(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeDateTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
