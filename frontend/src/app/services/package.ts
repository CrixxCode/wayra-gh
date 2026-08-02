import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import {
  PackageFormPayload,
  PackageI,
  PackageServiceFormPayload,
  PackageServiceI
} from '../modules/packages/package-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class PackagesService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly packagesUrl = `${this.apiBase}/api/packages/`;
  private readonly packageServicesUrl = `${this.apiBase}/api/package-services/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listPackages(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<PackageI[]> {
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
      .get<PackageI[] | DRFPaginated<PackageI>>(this.packagesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<PackageI>(res)));
  }

  getPackageById(id: number): Observable<PackageI> {
    return this.http.get<PackageI>(`${this.packagesUrl}${id}/`, { withCredentials: true });
  }

  createPackage(payload: PackageFormPayload): Observable<PackageI> {
    return this.http.post<PackageI>(
      this.packagesUrl,
      this.normalizePackageCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updatePackage(id: number, payload: Partial<PackageFormPayload>): Observable<PackageI> {
    return this.http.patch<PackageI>(
      `${this.packagesUrl}${id}/`,
      this.normalizePackagePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deletePackage(id: number): Observable<void> {
    return this.http.delete<void>(`${this.packagesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restorePackage(id: number): Observable<PackageI> {
    return this.http.post<PackageI>(`${this.packagesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  listPackageServices(filters?: {
    ordering?: string;
    include_deleted?: boolean;
  }): Observable<PackageServiceI[]> {
    let params = new HttpParams();

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<PackageServiceI[] | DRFPaginated<PackageServiceI>>(this.packageServicesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<PackageServiceI>(res)));
  }

  createPackageService(payload: PackageServiceFormPayload): Observable<PackageServiceI> {
    return this.http.post<PackageServiceI>(
      this.packageServicesUrl,
      this.normalizePackageServicePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updatePackageService(id: number, payload: Partial<PackageServiceFormPayload>): Observable<PackageServiceI> {
    return this.http.patch<PackageServiceI>(
      `${this.packageServicesUrl}${id}/`,
      this.normalizePackageServicePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deletePackageService(id: number): Observable<void> {
    return this.http.delete<void>(`${this.packageServicesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restorePackageService(id: number): Observable<PackageServiceI> {
    return this.http.post<PackageServiceI>(
      `${this.packageServicesUrl}${id}/restore/`,
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

  private normalizePackageCreatePayload(payload: PackageFormPayload): PackageFormPayload {
    const normalized: PackageFormPayload = {
      hotel_settings: Number(payload.hotel_settings),
      name: (payload.name || '').trim(),
      description: (payload.description || '').trim(),
      base_price: Number(payload.base_price) || 0,
      is_active: !!payload.is_active
    };

    if (typeof payload.room_type === 'number') {
      normalized.room_type = Number(payload.room_type);
    } else {
      normalized.room_type = null;
    }

    if (typeof payload.start_date === 'string' && payload.start_date.trim()) {
      normalized.start_date = payload.start_date.trim();
    } else {
      normalized.start_date = null;
    }

    if (typeof payload.end_date === 'string' && payload.end_date.trim()) {
      normalized.end_date = payload.end_date.trim();
    } else {
      normalized.end_date = null;
    }

    return normalized;
  }

  private normalizePackagePatchPayload(payload: Partial<PackageFormPayload>): Partial<PackageFormPayload> {
    const normalized: Partial<PackageFormPayload> = {};

    if (typeof payload.hotel_settings === 'number') {
      normalized.hotel_settings = Number(payload.hotel_settings);
    }

    if (typeof payload.room_type === 'number') {
      normalized.room_type = Number(payload.room_type);
    }
    if (payload.room_type === null) {
      normalized.room_type = null;
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

    if (typeof payload.start_date === 'string') {
      normalized.start_date = payload.start_date.trim() || null;
    }
    if (payload.start_date === null) {
      normalized.start_date = null;
    }

    if (typeof payload.end_date === 'string') {
      normalized.end_date = payload.end_date.trim() || null;
    }
    if (payload.end_date === null) {
      normalized.end_date = null;
    }

    return normalized;
  }

  private normalizePackageServicePayload(payload: PackageServiceFormPayload): PackageServiceFormPayload {
    return {
      package: Number(payload.package),
      service: Number(payload.service),
      quantity: Math.max(1, Number(payload.quantity) || 1),
      is_included: !!payload.is_included
    };
  }

  private normalizePackageServicePatchPayload(
    payload: Partial<PackageServiceFormPayload>
  ): Partial<PackageServiceFormPayload> {
    const normalized: Partial<PackageServiceFormPayload> = {};

    if (typeof payload.package === 'number') {
      normalized.package = Number(payload.package);
    }

    if (typeof payload.service === 'number') {
      normalized.service = Number(payload.service);
    }

    if (typeof payload.quantity === 'number') {
      normalized.quantity = Math.max(1, Number(payload.quantity) || 1);
    }

    if (typeof payload.is_included === 'boolean') {
      normalized.is_included = payload.is_included;
    }

    return normalized;
  }
}
