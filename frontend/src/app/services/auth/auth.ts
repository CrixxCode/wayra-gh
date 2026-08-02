// auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, switchMap, map, shareReplay } from 'rxjs';
import { environment } from '../../../enviorements/environment';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  route?: string;
  children?: MenuItem[];
}

export interface MeResponse {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: string | null;
  must_change_password?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  hotel_settings?: {
    id?: string | number;
    hotel_name?: string;
    city?: string;
    country?: string;
    timezone?: string;
    currency?: string;
  } | null;
  roles?: any[];
  resource_keys?: string[];
  menu?: MenuItem[];
}

export interface ProfileUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
}

export interface SessionLoginResponse {
  detail: string;
  remember_me: boolean;
  is_first_login?: boolean;
  must_change_password?: boolean;
  user?: MeResponse;
}

export const isEffectivePlatformAdmin = (user?: MeResponse | null): boolean =>
  Boolean(user?.is_superuser) && !user?.hotel_settings;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');

  private csrfUrl = `${this.apiBase}/api/auth/csrf/`;
  private loginUrl = `${this.apiBase}/api/auth/login/`;
  private logoutUrl = `${this.apiBase}/api/auth/logout/`;
  private meUrl = `${this.apiBase}/api/auth/me/`;
  private passwordChangeUrl = `${this.apiBase}/api/auth/password/change/`;
  private passwordResetRequestUrl = `${this.apiBase}/api/auth/password/reset/`;
  private passwordResetConfirmUrl = `${this.apiBase}/api/auth/password/reset/confirm/`;
  private profileUpdateUrl = `${this.apiBase}/api/auth/me/update/`;

  constructor(private http: HttpClient) {}

  /** Obtiene el token CSRF (cookie csrftoken) */
  getCsrfToken(): Observable<any> {
    return this.http.get(this.csrfUrl, { withCredentials: true });
  }

  /** Inicia sesión (flujo completo con CSRF) */
  login(username: string, password: string): Observable<SessionLoginResponse> {
    return this.getCsrfToken().pipe(
      switchMap(() =>
        this.http.post<SessionLoginResponse>(
          this.loginUrl,
          { username, password },
          this.buildCsrfRequestOptions()
        )
      )
    );
  }

  /** Cierra sesión */
  logout(): Observable<any> {
    return this.getCsrfToken().pipe(
      switchMap(() =>
        this.http.post(this.logoutUrl, {}, this.buildCsrfRequestOptions())
      )
    );
  }

  /** Verifica si hay sesión */
  checkSession(): Observable<boolean> {
    return this.http.get<MeResponse>(this.meUrl, { withCredentials: true }).pipe(
      map((res) => !!res?.username)
    );
  }

  /** Obtiene info del usuario autenticado (incluye menu si el backend lo devuelve) */
  getUserInfo(): Observable<MeResponse> {
    return this.http.get<MeResponse>(this.meUrl, { withCredentials: true }).pipe(
      shareReplay(1)
    );
  }

  requestPasswordReset(email: string, baseUrl: string): Observable<any> {
    return this.http.post(
      this.passwordResetRequestUrl,
      { email, base_url: baseUrl },
      this.buildCsrfRequestOptions()
    );
  }

  changePassword(old_password: string, new_password: string): Observable<any> {
    return this.http.post(
      this.passwordChangeUrl,
      { old_password, new_password },
      this.buildCsrfRequestOptions()
    );
  }

  updateMyProfile(payload: ProfileUpdatePayload): Observable<MeResponse> {
    return this.getCsrfToken().pipe(
      switchMap(() =>
        this.http.put<MeResponse>(
          this.profileUpdateUrl,
          payload,
          this.buildCsrfRequestOptions()
        )
      )
    );
  }

  confirmPasswordReset(uid: string, token: string, new_password: string): Observable<any> {
    return this.http.post(
      this.passwordResetConfirmUrl,
      { uid, token, new_password },
      this.buildCsrfRequestOptions()
    );
  }

  getApiBaseUrl(): string {
    return this.apiBase;
  }

  buildMediaUrl(path?: string | null): string {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiBase}${normalizedPath}`;
  }

  /**
   * ✅ IMPORTANTE: debe ser PÚBLICO porque otros services (ej: user.ts)
   * lo están usando para enviar X-CSRFToken + withCredentials.
   */
  public buildCsrfRequestOptions() {
    const options: { withCredentials: true; headers?: HttpHeaders } = { withCredentials: true };
    const token = this.getCookie('csrftoken');
    if (token) {
      options.headers = new HttpHeaders({ 'X-CSRFToken': token });
    }
    return options;
  }

  private getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }
}
