import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { CACHE_TTL, ResourceCache } from './resource-cache';

/** Una fila del rastro. Solo se lee: el backend no expone escritura. */
export interface AuditEntryI {
  id: number;
  occurred_at: string;
  user: number | null;
  user_username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  action_label: string;
  entity: string;
  object_id: string;
  object_label: string;
  /** `{campo: {before, after}}`, o `{after}` en un alta y `{before}` en una baja. */
  changes: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
  request_path: string;
  request_method: string;
}

export interface AuditFiltersI {
  search?: string;
  action?: string;
  entity?: string;
  username?: string;
  occurred_after?: string;
  occurred_before?: string;
  page_size?: number;
  /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
  forceRefresh?: boolean;
}

type DRFPaginated<T> = { results?: T[] };

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly auditUrl = `${this.apiBase}/api/audit/`;

  constructor(
    private http: HttpClient,
    private cache: ResourceCache
  ) {}

  // El rastro solo crece, nunca cambia hacia atras, asi que el TTL corto basta: sirve
  // para no repetir la consulta al ir y volver entre filtros.
  private static readonly CACHE_KEY = 'audit';

  private cacheKey(filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([key, value]) => key !== 'forceRefresh' && value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length ? `${AuditService.CACHE_KEY}:${entries.join('&')}` : AuditService.CACHE_KEY;
  }

  private buildParams(filters?: AuditFiltersI): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters || {})) {
      if (key === 'forceRefresh') continue;
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  listAudit(filters?: AuditFiltersI): Observable<AuditEntryI[]> {
    return this.cache.get(
      this.cacheKey(filters as Record<string, unknown>),
      () =>
        this.http
          .get<AuditEntryI[] | DRFPaginated<AuditEntryI>>(this.auditUrl, {
            withCredentials: true,
            params: this.buildParams(filters)
          })
          .pipe(map((res) => (Array.isArray(res) ? res : res?.results || []))),
      CACHE_TTL.OPERATIONAL,
      filters?.forceRefresh === true
    );
  }

  /** Las entidades y usuarios que de verdad aparecen, para poblar los filtros. */
  listFacets(): Observable<{ entities: string[]; users: string[] }> {
    return this.cache.get(
      `${AuditService.CACHE_KEY}:facets`,
      () =>
        this.http.get<{ entities: string[]; users: string[] }>(`${this.auditUrl}entities/`, {
          withCredentials: true
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  /**
   * Descarga el periodo filtrado.
   *
   * Se navega en vez de pedirlo por `HttpClient`: el backend responde con
   * `Content-Disposition: attachment`, y dejar que el navegador lo maneje evita tener
   * que reconstruir el archivo en memoria solo para volver a soltarlo.
   */
  buildExportUrl(filters?: AuditFiltersI): string {
    const params = this.buildParams(filters).toString();
    return params ? `${this.auditUrl}export/?${params}` : `${this.auditUrl}export/`;
  }
}
