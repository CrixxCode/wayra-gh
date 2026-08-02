import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';

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
    private auth: AuthService
  ) {}

  getDashboard(params?: FinancialDateRange): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.dashboardUrl, {
      withCredentials: true,
      params: this.buildParams(params)
    });
  }

  getWhatIf(params?: WhatIfParams): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.whatIfUrl, {
      withCredentials: true,
      params: this.buildParams(params)
    });
  }

  getStatements(params?: StatementParams): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.statementsUrl, {
      withCredentials: true,
      params: this.buildParams(params)
    });
  }

  listConfigs(filters?: { hotel_settings?: number }): Observable<Record<string, unknown>[]> {
    return this.http.get<Record<string, unknown>[]>(this.configsUrl, {
      withCredentials: true,
      params: this.buildParams(filters)
    });
  }

  createConfig(payload: FinancialControlConfigPayload): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      this.configsUrl,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateConfig(configId: number, payload: Partial<FinancialControlConfigPayload>): Observable<Record<string, unknown>> {
    return this.http.patch<Record<string, unknown>>(
      `${this.configsUrl}${configId}/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
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
