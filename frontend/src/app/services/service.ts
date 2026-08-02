import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
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
    private auth: AuthService
  ) {}

  listServices(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
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

    return this.http
      .get<ServiceI[] | DRFPaginated<ServiceI>>(this.servicesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ServiceI>(res)));
  }

  getServiceById(id: number): Observable<ServiceI> {
    return this.http.get<ServiceI>(`${this.servicesUrl}${id}/`, { withCredentials: true });
  }

  createService(payload: ServiceFormPayload): Observable<ServiceI> {
    return this.http.post<ServiceI>(
      this.servicesUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateService(id: number, payload: Partial<ServiceFormPayload>): Observable<ServiceI> {
    return this.http.patch<ServiceI>(
      `${this.servicesUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.servicesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreService(id: number): Observable<ServiceI> {
    return this.http.post<ServiceI>(`${this.servicesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
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
