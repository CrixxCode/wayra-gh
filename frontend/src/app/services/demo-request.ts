import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs';

import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';

export interface DemoRequestPayload {
  hotel_name: string;
  hotel_type: string;
  city: string;
  rooms: number;
  website?: string;
  requester_first_name: string;
  requester_last_name: string;
  requester_username: string;
  requester_email: string;
  requester_job_title: string;
  requester_phone: string;
  message?: string;
}

export interface DemoRequestResponse extends DemoRequestPayload {
  id: number;
  status: string;
  created_at: string;
  converted_hotel_settings?: number | null;
  converted_user?: number | null;
  converted_at?: string | null;
  password_reset_sent?: boolean;
  email_delivery_enabled?: boolean;
  source_ip?: string | null;
  user_agent?: string;
  updated_at?: string;
}

export interface DemoRequestListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  ordering?: string;
}

export interface PaginatedDemoRequests {
  count: number;
  next: string | null;
  previous: string | null;
  results: DemoRequestResponse[];
}

export interface DemoRequestAccessLinkResponse {
  access_url: string;
}

@Injectable({ providedIn: 'root' })
export class DemoRequestService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly demoRequestsUrl = `${this.apiBase}/api/demo-requests/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  createDemoRequest(payload: DemoRequestPayload): Observable<DemoRequestResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(() =>
        this.http.post<DemoRequestResponse>(
          this.demoRequestsUrl,
          payload,
          this.auth.buildCsrfRequestOptions()
        )
      )
    );
  }

  listDemoRequests(params?: DemoRequestListParams): Observable<PaginatedDemoRequests> {
    return this.http.get<PaginatedDemoRequests>(this.demoRequestsUrl, {
      withCredentials: true,
      params: this.buildParams(params),
    });
  }

  updateStatus(id: number, status: string, baseUrl?: string): Observable<DemoRequestResponse> {
    return this.http.patch<DemoRequestResponse>(
      `${this.demoRequestsUrl}${id}/`,
      { status, base_url: baseUrl || '' },
      this.auth.buildCsrfRequestOptions()
    );
  }

  resendAccessEmail(id: number, baseUrl?: string): Observable<DemoRequestResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(() =>
        this.http.post<DemoRequestResponse>(
          `${this.demoRequestsUrl}${id}/resend-access-email/`,
          { base_url: baseUrl || '' },
          this.auth.buildCsrfRequestOptions()
        )
      )
    );
  }

  generateAccessLink(id: number, baseUrl?: string): Observable<DemoRequestAccessLinkResponse> {
    return this.auth.getCsrfToken().pipe(
      switchMap(() =>
        this.http.post<DemoRequestAccessLinkResponse>(
          `${this.demoRequestsUrl}${id}/access-link/`,
          { base_url: baseUrl || '' },
          this.auth.buildCsrfRequestOptions()
        )
      )
    );
  }

  private buildParams(params?: DemoRequestListParams): HttpParams {
    let httpParams = new HttpParams();

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === '') return;
      httpParams = httpParams.set(key, String(value));
    });

    return httpParams;
  }
}
