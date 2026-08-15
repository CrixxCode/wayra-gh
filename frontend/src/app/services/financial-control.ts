import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';

type FinancialDateRange = {
  hotel_settings?: number;
  start_date?: string;
  end_date?: string;
};

type WhatIfParams = FinancialDateRange & {
  rate_change_pct?: number;
  occupancy_change_pct?: number;
  target_occupancy_pct?: number;
  operating_cost_change_pct?: number;
};

type StatementParams = {
  hotel_settings?: number;
  year?: number;
  month?: number;
};

export type FinancialControlConfigPayload = {
  hotel_settings: number;
  district_name: string;
  tourism_law_enabled: boolean;
  tourism_law_preferential_rate?: number;
  standard_income_tax_rate?: number;
  has_iva_exemption: boolean;
  iva_rate?: number;
  ica_rate_per_thousand?: number;
  fontur_rate_per_thousand?: number;
  break_even_warning_pct?: number;
  break_even_optimal_pct?: number;
  operational_high_occupancy_threshold_pct?: number;
  operational_low_availability_threshold_rooms?: number;
  operational_revenue_drop_threshold_pct?: number;
  operational_high_refunds_threshold_count?: number;
  operational_revenue_window_days?: number;
  operational_refund_window_days?: number;
};

@Injectable({
  providedIn: 'root'
})
export class FinancialControlService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly dashboardUrl = `${this.apiBase}/api/financial-control/dashboard/`;
  private readonly whatIfUrl = `${this.apiBase}/api/financial-control/what-if/`;
  private readonly statementsUrl = `${this.apiBase}/api/financial-control/statements/`;
  private readonly configsUrl = `${this.apiBase}/api/financial-control-configs/`;
  private readonly snapshotsUrl = `${this.apiBase}/api/financial-statement-snapshots/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  //
  // Estas tres lecturas son las mas caras del sistema: el tablero, el escenario y los
  // estados agregan reservas, pagos y egresos de todo un periodo. Antes la pantalla las
  // pedia **las tres a la vez** en cada carga y en cada cambio de hotel, aunque el
  // usuario solo estuviera mirando una pestaña.
  //
  // La clave incluye los parametros: el tablero de enero y el de febrero son cosas
  // distintas y se cachean por separado; volver a un periodo ya consultado es gratis.
  //
  // TTL operativo (20 s) y no de catalogo: son cifras de dinero del dia, nadie quiere
  // verlas viejas. El TTL solo corta la rafaga de ir y volver entre pestañas.
  //
  // El *what-if* tambien se cachea aunque parezca interactivo: mover un deslizador y
  // devolverlo a su sitio es el caso normal, y esa vuelta no deberia costar una consulta.
  private static readonly DASHBOARD_KEY = 'financial-control-dashboard';
  private static readonly WHAT_IF_KEY = 'financial-control-what-if';
  private static readonly STATEMENTS_KEY = 'financial-control-statements';
  private static readonly CONFIGS_KEY = 'financial-control-configs';

  /** Todo lo que depende de la configuracion: cambiar un umbral recalcula el semaforo. */
  private static readonly DERIVED_KEYS = [
    FinancialControlService.CONFIGS_KEY,
    FinancialControlService.DASHBOARD_KEY,
    FinancialControlService.WHAT_IF_KEY,
    FinancialControlService.STATEMENTS_KEY
  ];

  private cacheKey(prefix: string, values?: Record<string, unknown>): string {
    const entries = Object.entries(values || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length ? `${prefix}:${entries.join('&')}` : prefix;
  }

  getDashboard(
    params?: FinancialDateRange & { forceRefresh?: boolean }
  ): Observable<Record<string, unknown>> {
    const { forceRefresh, ...query } = params || {};
    return this.cache.get(
      this.cacheKey(FinancialControlService.DASHBOARD_KEY, query),
      () =>
        this.http.get<Record<string, unknown>>(this.dashboardUrl, {
          withCredentials: true,
          params: this.buildParams(query)
        }),
      CACHE_TTL.OPERATIONAL,
      forceRefresh === true
    );
  }

  getWhatIf(params?: WhatIfParams & { forceRefresh?: boolean }): Observable<Record<string, unknown>> {
    const { forceRefresh, ...query } = params || {};
    return this.cache.get(
      this.cacheKey(FinancialControlService.WHAT_IF_KEY, query),
      () =>
        this.http.get<Record<string, unknown>>(this.whatIfUrl, {
          withCredentials: true,
          params: this.buildParams(query)
        }),
      CACHE_TTL.OPERATIONAL,
      forceRefresh === true
    );
  }

  getStatements(
    params?: StatementParams & { forceRefresh?: boolean }
  ): Observable<Record<string, unknown>> {
    const { forceRefresh, ...query } = params || {};
    return this.cache.get(
      this.cacheKey(FinancialControlService.STATEMENTS_KEY, query),
      () =>
        this.http.get<Record<string, unknown>>(this.statementsUrl, {
          withCredentials: true,
          params: this.buildParams(query)
        }),
      CACHE_TTL.OPERATIONAL,
      forceRefresh === true
    );
  }

  listConfigs(
    filters?: { hotel_settings?: number; forceRefresh?: boolean }
  ): Observable<Record<string, unknown>[]> {
    const { forceRefresh, ...query } = filters || {};
    return this.cache.get(
      this.cacheKey(FinancialControlService.CONFIGS_KEY, query),
      () =>
        this.http.get<Record<string, unknown>[]>(this.configsUrl, {
          withCredentials: true,
          params: this.buildParams(query)
        }),
      CACHE_TTL.CATALOG,
      forceRefresh === true
    );
  }

  createConfig(payload: FinancialControlConfigPayload): Observable<Record<string, unknown>> {
    return this.http
      .post<Record<string, unknown>>(this.configsUrl, payload, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.cache.invalidateAll(FinancialControlService.DERIVED_KEYS)));
  }

  updateConfig(configId: number, payload: Partial<FinancialControlConfigPayload>): Observable<Record<string, unknown>> {
    return this.http
      .patch<Record<string, unknown>>(
        `${this.configsUrl}${configId}/`,
        payload,
        this.auth.buildCsrfRequestOptions()
      )
      .pipe(tap(() => this.cache.invalidateAll(FinancialControlService.DERIVED_KEYS)));
  }

  listSnapshots(filters?: { hotel_settings?: number; period_year?: number; period_month?: number }): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(this.snapshotsUrl, {
      withCredentials: true,
      params: this.buildParams(filters)
    });
  }

  private buildParams(values?: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    if (!values) return params;

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }

    return params;
  }
}
