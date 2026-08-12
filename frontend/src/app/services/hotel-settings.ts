import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import { HotelSettings } from '../components/pages/hotel-settings/hotel-setting-model';

@Injectable({ providedIn: 'root' })
export class HotelSettingsService {

  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly settingsUrl = `${this.apiBase}/api/hotel-settings/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) { }

  // --------------------------------------------------------------------- cache
  // La configuracion del hotel la piden casi todas las pantallas al cargar y al
  // refrescar, y cambia cuando alguien la edita, no sola. Sin cache, cada accion
  // pequena arrastraba esta consulta de mas.
  private static readonly CACHE_KEY = 'hotel-settings-current';

  private invalidateSettings(): void {
    this.cache.invalidate(HotelSettingsService.CACHE_KEY);
  }

  /**
   * Obtiene la configuración actual del hotel
   */
  getCurrentSettings(hotelSettingsId?: number | null): Observable<HotelSettings | null> {
    let params = new HttpParams();
    if (hotelSettingsId && Number.isFinite(hotelSettingsId) && hotelSettingsId > 0) {
      params = params.set('hotel_settings', String(hotelSettingsId));
    }

    const key = hotelSettingsId
      ? `${HotelSettingsService.CACHE_KEY}:${hotelSettingsId}`
      : HotelSettingsService.CACHE_KEY;

    return this.cache.get(
      key,
      () =>
        this.http.get<HotelSettings | null>(`${this.settingsUrl}current/`, {
          withCredentials: true,
          params
        }),
      CACHE_TTL.CATALOG
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
    ).pipe(tap(() => this.invalidateSettings()));
  }

  /**
   * Actualizar configuración existente
   */
  updateSettings(id: number, payload: Partial<HotelSettings>): Observable<HotelSettings> {
    return this.http.patch<HotelSettings>(
      `${this.settingsUrl}${id}/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateSettings()));
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
    ).pipe(tap(() => this.invalidateSettings()));
  }

}
