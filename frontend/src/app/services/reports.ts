import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import {
  ExecutiveReportResponse,
  IncomeConsolidatedQueryParams,
  IncomeConsolidatedReportResponse,
  OccupancyReportResponse,
  ReportQueryParams,
  RevenueReportResponse,
  ServicesReportResponse,
} from '../modules/reports/report-model';

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly reportsUrl = `${this.apiBase}/api/reports/`;

  constructor(
    private http: HttpClient,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  // Los informes son agregaciones caras del servidor y la vista de finanzas los pide
  // al abrir y al cambiar de pestaña. TTL operativo: son cifras del dia, no catalogo.
  //
  // Los invalida quien mueve dinero --pagos y egresos--, no este servicio, que solo lee.
  private static readonly CACHE_KEY = 'reports';

  private cacheKey(scope: string, params?: Record<string, unknown>): string {
    const entries = Object.entries(params || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    const base = `${ReportsService.CACHE_KEY}:${scope}`;
    return entries.length ? `${base}:${entries.join('&')}` : base;
  }

  getExecutiveReport(params?: ReportQueryParams): Observable<ExecutiveReportResponse> {
    return this.cache.get(
      this.cacheKey('executive', params as Record<string, unknown>),
      () =>
        this.http.get<ExecutiveReportResponse>(`${this.reportsUrl}executive/`, {
          withCredentials: true,
          params: this.buildParams(params),
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  getRevenueReport(params?: ReportQueryParams): Observable<RevenueReportResponse> {
    return this.cache.get(
      this.cacheKey('revenue', params as Record<string, unknown>),
      () =>
        this.http.get<RevenueReportResponse>(`${this.reportsUrl}revenue/`, {
          withCredentials: true,
          params: this.buildParams(params),
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  getOccupancyReport(params?: ReportQueryParams): Observable<OccupancyReportResponse> {
    return this.cache.get(
      this.cacheKey('occupancy', params as Record<string, unknown>),
      () =>
        this.http.get<OccupancyReportResponse>(`${this.reportsUrl}occupancy/`, {
          withCredentials: true,
          params: this.buildParams(params),
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  getServicesReport(params?: ReportQueryParams): Observable<ServicesReportResponse> {
    return this.cache.get(
      this.cacheKey('services', params as Record<string, unknown>),
      () =>
        this.http.get<ServicesReportResponse>(`${this.reportsUrl}services/`, {
          withCredentials: true,
          params: this.buildParams(params),
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  getIncomeConsolidatedReport(
    params?: IncomeConsolidatedQueryParams
  ): Observable<IncomeConsolidatedReportResponse> {
    return this.cache.get(
      this.cacheKey('income-consolidated', params as Record<string, unknown>),
      () =>
        this.http.get<IncomeConsolidatedReportResponse>(`${this.reportsUrl}income-consolidated/`, {
          withCredentials: true,
          params: this.buildParams(params),
        }),
      CACHE_TTL.OPERATIONAL
    );
  }

  private buildParams(values?: ReportQueryParams): HttpParams {
    let params = new HttpParams();
    if (!values) return params;

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }

    return params;
  }
}
