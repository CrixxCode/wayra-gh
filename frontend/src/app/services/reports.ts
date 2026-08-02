import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
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

  constructor(private http: HttpClient) {}

  getExecutiveReport(params?: ReportQueryParams): Observable<ExecutiveReportResponse> {
    return this.http.get<ExecutiveReportResponse>(`${this.reportsUrl}executive/`, {
      withCredentials: true,
      params: this.buildParams(params),
    });
  }

  getRevenueReport(params?: ReportQueryParams): Observable<RevenueReportResponse> {
    return this.http.get<RevenueReportResponse>(`${this.reportsUrl}revenue/`, {
      withCredentials: true,
      params: this.buildParams(params),
    });
  }

  getOccupancyReport(params?: ReportQueryParams): Observable<OccupancyReportResponse> {
    return this.http.get<OccupancyReportResponse>(`${this.reportsUrl}occupancy/`, {
      withCredentials: true,
      params: this.buildParams(params),
    });
  }

  getServicesReport(params?: ReportQueryParams): Observable<ServicesReportResponse> {
    return this.http.get<ServicesReportResponse>(`${this.reportsUrl}services/`, {
      withCredentials: true,
      params: this.buildParams(params),
    });
  }

  getIncomeConsolidatedReport(
    params?: IncomeConsolidatedQueryParams
  ): Observable<IncomeConsolidatedReportResponse> {
    return this.http.get<IncomeConsolidatedReportResponse>(`${this.reportsUrl}income-consolidated/`, {
      withCredentials: true,
      params: this.buildParams(params),
    });
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
