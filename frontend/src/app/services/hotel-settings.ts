import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { HotelSettings } from '../components/pages/hotel-settings/hotel-setting-model';

@Injectable({ providedIn: 'root' })
export class HotelSettingsService {

  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly settingsUrl = `${this.apiBase}/api/hotel-settings/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) { }

  /**
   * Obtiene la configuración actual del hotel
   */
  getCurrentSettings(hotelSettingsId?: number | null): Observable<HotelSettings | null> {
    let params = new HttpParams();
    if (hotelSettingsId && Number.isFinite(hotelSettingsId) && hotelSettingsId > 0) {
      params = params.set('hotel_settings', String(hotelSettingsId));
    }

    return this.http.get<HotelSettings | null>(
      `${this.settingsUrl}current/`,
      { withCredentials: true, params }
    );
  }

  listSettings(): Observable<HotelSettings[]> {
    return this.http.get<HotelSettings[]>(this.settingsUrl, { withCredentials: true });
  }

  /**
   * Crear configuración inicial del hotel
   */
  createSettings(payload: Partial<HotelSettings>): Observable<HotelSettings> {
    return this.http.post<HotelSettings>(
      this.settingsUrl,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  /**
   * Actualizar configuración existente
   */
  updateSettings(id: number, payload: Partial<HotelSettings>): Observable<HotelSettings> {
    return this.http.patch<HotelSettings>(
      `${this.settingsUrl}${id}/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  /**
   * Borrar completamente la configuración
   */
  clearSettings(hotelSettingsId?: number | null): Observable<any> {
    let params = new HttpParams();
    if (hotelSettingsId && Number.isFinite(hotelSettingsId) && hotelSettingsId > 0) {
      params = params.set('hotel_settings', String(hotelSettingsId));
    }

    const options = this.auth.buildCsrfRequestOptions();
    return this.http.post(
      `${this.settingsUrl}clear/`,
      {},
      { ...options, params }
    );
  }

}
