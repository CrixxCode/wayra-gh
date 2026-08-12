import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import { ServiceFormPayload, ServiceI } from '../modules/services/service-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class ServicesService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly servicesUrl = `${this.apiBase}/api/services/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  // Cache-aside sobre las lecturas (ver `resource-cache.ts`). Es un catalogo:
  // cambia cuando alguien lo edita, no solo.
  private static readonly CACHE_KEY = 'services';

  private cacheKey(filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length
      ? `${ServicesService.CACHE_KEY}:${entries.join('&')}`
      : ServicesService.CACHE_KEY;
  }

  /** Invalida tambien lo que muestra este dato prestado. */
  private invalidateCatalog(): void {
    this.cache.invalidateAll([
      'services',
      'packages',
      'promotions'
    ]);
  }

  listServices(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
    /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
    forceRefresh?: boolean;
  }): Observable<ServiceI[]> {
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
      this.cacheKey(filters as Record<string, unknown>),
      () =>
        this.http
          .get<ServiceI[] | DRFPaginated<ServiceI>>(this.servicesUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<ServiceI>(res))),
      CACHE_TTL.CATALOG,
      (filters as { forceRefresh?: boolean } | undefined)?.forceRefresh
    );
  }

  getServiceById(id: number): Observable<ServiceI> {
    return this.http.get<ServiceI>(`${this.servicesUrl}${id}/`, { withCredentials: true });
  }

  createService(payload: ServiceFormPayload): Observable<ServiceI> {
    return this.http.post<ServiceI>(
      this.servicesUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog()));
  }

  updateService(id: number, payload: Partial<ServiceFormPayload>): Observable<ServiceI> {
    return this.http.patch<ServiceI>(
      `${this.servicesUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog()));
  }

  deleteService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.servicesUrl}${id}/`, this.auth.buildCsrfRequestOptions()).pipe(tap(() => this.invalidateCatalog()));
  }

  restoreService(id: number): Observable<ServiceI> {
    return this.http.post<ServiceI>(`${this.servicesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions()).pipe(tap(() => this.invalidateCatalog()));
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: ServiceFormPayload): ServiceFormPayload {
    return {
      hotel_settings: Number(payload.hotel_settings),
      service_type: Number(payload.service_type),
      name: (payload.name || '').trim(),
      description: (payload.description || '').trim(),
      base_price: Number(payload.base_price) || 0,
      is_active: !!payload.is_active
    };
  }

  private normalizePatchPayload(payload: Partial<ServiceFormPayload>): Partial<ServiceFormPayload> {
    const normalized: Partial<ServiceFormPayload> = {};

    if (typeof payload.hotel_settings === 'number') {
      normalized.hotel_settings = Number(payload.hotel_settings);
    }

    if (typeof payload.service_type === 'number') {
      normalized.service_type = Number(payload.service_type);
    }

    if (typeof payload.name === 'string') {
      normalized.name = payload.name.trim();
    }

    if (typeof payload.description === 'string') {
      normalized.description = payload.description.trim();
    }

    if (typeof payload.base_price === 'number') {
      normalized.base_price = Number(payload.base_price) || 0;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }
}
