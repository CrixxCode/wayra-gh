import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, switchMap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { MasterDataGroupI, MasterDataI } from '../components/pages/master-data/master-data-model';

type DRFPaginated<T> = {
  next?: string | null;
  results?: T[];
};

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly masterDataUrl = `${this.apiBase}/api/master-data/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private extractNext<T>(res: unknown): string | null {
    if (!res || typeof res !== 'object') return null;
    const next = (res as DRFPaginated<T>).next;
    if (typeof next !== 'string' || !next.trim()) return null;
    return next;
  }

  private buildListParams(filters?: {
    group?: string;
    is_active?: 'true' | 'false';
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): HttpParams {
    let params = new HttpParams();
    if (filters?.group) params = params.set('group', filters.group);
    if (filters?.is_active) params = params.set('is_active', filters.is_active);
    if (filters?.search?.trim()) params = params.set('search', filters.search.trim());
    if (filters?.ordering?.trim()) params = params.set('ordering', filters.ordering.trim());
    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }
    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }
    return params;
  }

  private collectAllPages<T>(res: unknown, acc: T[] = []): Observable<T[]> {
    const pageItems = this.unwrapArray<T>(res);
    const next = this.extractNext<T>(res);
    const merged = [...acc, ...pageItems];

    if (!next) {
      return of(merged);
    }

    return this.http
      .get<T[] | DRFPaginated<T>>(next, { withCredentials: true })
      .pipe(switchMap((nextRes) => this.collectAllPages<T>(nextRes, merged)));
  }

  listMasterData(filters?: {
    group?: string;
    is_active?: 'true' | 'false';
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<MasterDataI[]> {
    const params = this.buildListParams(filters);

    return this.http
      .get<MasterDataI[] | DRFPaginated<MasterDataI>>(this.masterDataUrl, { withCredentials: true, params })
      .pipe(map((res) => this.unwrapArray<MasterDataI>(res)));
  }

  listMasterDataAll(filters?: {
    group?: string;
    is_active?: 'true' | 'false';
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<MasterDataI[]> {
    const params = this.buildListParams(filters);

    return this.http
      .get<MasterDataI[] | DRFPaginated<MasterDataI>>(this.masterDataUrl, { withCredentials: true, params })
      .pipe(switchMap((res) => this.collectAllPages<MasterDataI>(res)));
  }

  getMasterDataById(id: number): Observable<MasterDataI> {
    return this.http.get<MasterDataI>(`${this.masterDataUrl}${id}/`, { withCredentials: true });
  }

  listGroups(): Observable<MasterDataGroupI[]> {
    return this.http
      .get<MasterDataGroupI[] | DRFPaginated<MasterDataGroupI>>(`${this.masterDataUrl}groups/`, { withCredentials: true })
      .pipe(map((res) => this.unwrapArray<MasterDataGroupI>(res)));
  }

  createMasterData(payload: Partial<MasterDataI>): Observable<MasterDataI> {
    return this.http.post<MasterDataI>(this.masterDataUrl, payload, this.auth.buildCsrfRequestOptions());
  }

  updateMasterData(id: number, payload: Partial<MasterDataI>): Observable<MasterDataI> {
    return this.http.patch<MasterDataI>(`${this.masterDataUrl}${id}/`, payload, this.auth.buildCsrfRequestOptions());
  }

  deleteMasterData(id: number): Observable<unknown> {
    return this.http.delete(`${this.masterDataUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreMasterData(id: number): Observable<MasterDataI> {
    return this.http.post<MasterDataI>(
      `${this.masterDataUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }
}
