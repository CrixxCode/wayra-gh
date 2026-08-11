import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';

export type PaymentMethodType = 'EFECTIVO' | 'TRANSFERENCIA';

/**
 * Metodo de pago **propio de cada hotel**.
 *
 * Reemplaza a `MasterData` con `group='PAYMENT_METHOD'`, que era global: cualquier
 * hotel que editara un metodo lo cambiaba para toda la plataforma (ver AGENTS.md 5.16).
 *
 * `code` lo deriva el backend del nombre; no se envia ni se edita.
 */
export interface PaymentMethodI {
  id: number;
  hotel_settings?: number | null;
  name: string;
  method_type: PaymentMethodType;
  method_type_label?: string;
  /** Solo en transferencias; en efectivo llega null. */
  account_number?: string | null;
  code: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethodPayloadI {
  name: string;
  method_type: PaymentMethodType;
  account_number?: string | null;
  is_active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly url = `${this.apiBase}/api/payment-methods/`;

  private static readonly CACHE_KEY = 'payment-methods';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  /** Catalogo cacheado: cambia solo cuando alguien lo edita en Configuracion del Hotel. */
  listPaymentMethods(filters?: {
    include_inactive?: boolean;
    search?: string;
    forceRefresh?: boolean;
  }): Observable<PaymentMethodI[]> {
    let params = new HttpParams();

    if (filters?.include_inactive) {
      params = params.set('include_inactive', 'true');
    }

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    const key = filters?.include_inactive
      ? `${PaymentMethodService.CACHE_KEY}:all`
      : PaymentMethodService.CACHE_KEY;

    return this.cache.get(
      filters?.search?.trim() ? `${key}:${filters.search.trim()}` : key,
      () =>
        this.http
          .get<PaymentMethodI[] | { results?: PaymentMethodI[] }>(this.url, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray(res))),
      CACHE_TTL.CATALOG,
      filters?.forceRefresh
    );
  }

  createPaymentMethod(payload: PaymentMethodPayloadI): Observable<PaymentMethodI> {
    return this.http
      .post<PaymentMethodI>(this.url, payload, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  updatePaymentMethod(
    id: number,
    payload: Partial<PaymentMethodPayloadI>
  ): Observable<PaymentMethodI> {
    return this.http
      .patch<PaymentMethodI>(`${this.url}${id}/`, payload, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  deletePaymentMethod(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  restorePaymentMethod(id: number): Observable<PaymentMethodI> {
    return this.http
      .post<PaymentMethodI>(`${this.url}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidate()));
  }

  invalidate(): void {
    this.cache.invalidate(PaymentMethodService.CACHE_KEY);
  }

  private unwrapArray(res: unknown): PaymentMethodI[] {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
      const results = (res as Record<string, unknown>)['results'];
      if (Array.isArray(results)) return results as PaymentMethodI[];
    }
    return [];
  }
}
