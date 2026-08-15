import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import {
  RecurringWorkFormPayload,
  RecurringWorkI
} from '../modules/operations/recurring-work-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({ providedIn: 'root' })
export class RecurringWorkService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly rulesUrl = `${this.apiBase}/api/recurring-work/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  // Las reglas cambian cuando alguien las edita, no solas: TTL de catalogo. Al crear
  // una regla se invalida tambien el trabajo, porque el servidor puede materializarla
  // el mismo dia.
  private static readonly CACHE_KEY = 'recurring-work';

  private cacheKey(filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length
      ? `${RecurringWorkService.CACHE_KEY}:${entries.join('&')}`
      : RecurringWorkService.CACHE_KEY;
  }

  private invalidate(): void {
    this.cache.invalidateAll([
      RecurringWorkService.CACHE_KEY,
      'cleaning-tasks',
      'maintenance-orders'
    ]);
  }

  listRecurringWork(filters?: {
    kind?: 'CLEANING' | 'MAINTENANCE';
    search?: string;
    ordering?: string;
    /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
    forceRefresh?: boolean;
  }): Observable<RecurringWorkI[]> {
    let params = new HttpParams();

    if (filters?.kind) params = params.set('kind', filters.kind);
    if (filters?.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters?.ordering?.trim()) params = params.set('ordering', filters.ordering.trim());

    return this.cache.get(
      this.cacheKey(filters as Record<string, unknown>),
      () =>
        this.http
          .get<RecurringWorkI[] | DRFPaginated<RecurringWorkI>>(this.rulesUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<RecurringWorkI>(res))),
      CACHE_TTL.CATALOG,
      filters?.forceRefresh
    );
  }

  createRecurringWork(payload: RecurringWorkFormPayload): Observable<RecurringWorkI> {
    return this.http
      .post<RecurringWorkI>(this.rulesUrl, payload, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  updateRecurringWork(
    id: number,
    payload: Partial<RecurringWorkFormPayload>
  ): Observable<RecurringWorkI> {
    return this.http
      .patch<RecurringWorkI>(`${this.rulesUrl}${id}/`, payload, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  deleteRecurringWork(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.rulesUrl}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }
}
