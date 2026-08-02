import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { ClientI } from '../modules/clients/client-model';

type DRFPaginated<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly clientsUrl = `${this.apiBase}/api/clients/`;

  constructor(private http: HttpClient, private auth: AuthService) { }

  private unwrapArray<T>(res: any): T[] {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.results)) return (res as DRFPaginated<T>).results as T[];
    if (res && Array.isArray(res.data)) return res.data as T[];
    return [];
  }

  listClients(filters?: {
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<ClientI[]> {
    let params = new HttpParams();

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http.get<any>(this.clientsUrl, { withCredentials: true, params }).pipe(
      map((res) => this.unwrapArray<ClientI>(res))
    );
  }

  getClientById(id: number): Observable<ClientI> {
    return this.http.get<ClientI>(`${this.clientsUrl}${id}/`, { withCredentials: true });
  }

  createClient(payload: Partial<ClientI>): Observable<ClientI> {
    return this.http.post<ClientI>(
      this.clientsUrl,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateClient(id: number, payload: Partial<ClientI>): Observable<ClientI> {
    return this.http.patch<ClientI>(
      `${this.clientsUrl}${id}/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteClient(id: number): Observable<any> {
    return this.http.delete(
      `${this.clientsUrl}${id}/`,
      this.auth.buildCsrfRequestOptions()
    );
  }

  restoreClient(id: number): Observable<ClientI> {
    return this.http.post<ClientI>(
      `${this.clientsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  setStatus(id: number, status: ClientI['status']): Observable<ClientI> {
    return this.http.patch<ClientI>(
      `${this.clientsUrl}${id}/set-status/`,
      { status },
      this.auth.buildCsrfRequestOptions()
    );
  }

  setClientType(id: number, client_type: ClientI['client_type']): Observable<ClientI> {
    return this.http.patch<ClientI>(
      `${this.clientsUrl}${id}/set-client-type/`,
      { client_type },
      this.auth.buildCsrfRequestOptions()
    );
  }
}
