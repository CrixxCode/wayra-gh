import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import {
  AmenityI,
  HotelFloorI,
  RateFormPayload,
  RateI,
  RoomFormPayload,
  RoomI,
  RoomPanelI,
  RoomTypeFormPayload,
  RoomTypeI,
  RoomVisualStatus
} from '../modules/rooms/room-model';

@Injectable({
  providedIn: 'root'
})
export class RoomService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly roomsUrl = `${this.apiBase}/api/rooms/`;
  private readonly roomTypesUrl = `${this.apiBase}/api/room-types/`;
  private readonly amenitiesUrl = `${this.apiBase}/api/amenities/`;
  private readonly ratesUrl = `${this.apiBase}/api/rates/`;
  private readonly floorsUrl = `${this.apiBase}/api/hotel-floors/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // ------------------------------------------------------------------ cache
  //
  // Cache-aside sobre las lecturas del modulo (ver `resource-cache.ts`). Los catalogos
  // viven 5 minutos porque solo cambian cuando alguien los edita; las habitaciones, 20
  // segundos, porque recepcion no puede ver un estado viejo. Toda escritura invalida lo
  // que corresponde, asi que el TTL es solo la red de seguridad.

  private static readonly ROOMS_KEY = 'rooms';
  private static readonly ROOM_TYPES_KEY = 'room-types';
  private static readonly AMENITIES_KEY = 'amenities';
  private static readonly RATES_KEY = 'rates';
  private static readonly FLOORS_KEY = 'hotel-floors';

  /** Clave estable a partir de los filtros: dos llamadas iguales comparten entrada. */
  private cacheKey(prefix: string, filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length ? `${prefix}:${entries.join('&')}` : prefix;
  }

  /** Tras crear, editar, borrar o restaurar una habitacion. */
  private invalidateRooms(): void {
    this.cache.invalidate(RoomService.ROOMS_KEY);
  }

  /**
   * Para cambios que ocurren **fuera** de este servicio y que igual mueven el estado
   * de una habitacion: check-in, check-out, confirmar reserva, cerrar una limpieza.
   * Sin esto, el listado cacheado seguiria mostrando el estado anterior hasta que
   * venciera el TTL.
   */
  invalidateRoomsCache(): void {
    this.invalidateRooms();
  }

  /**
   * Un cambio de catalogo tambien afecta al listado: la tarjeta muestra el nombre del
   * tipo y el precio de la tarifa.
   */
  private invalidateCatalog(key: string): void {
    this.cache.invalidateAll([key, RoomService.ROOMS_KEY]);
  }

  /** Vacia todo el cache del modulo. Util al cambiar de hotel. */
  invalidateRoomModuleCache(): void {
    this.cache.invalidateAll([
      RoomService.ROOMS_KEY,
      RoomService.ROOM_TYPES_KEY,
      RoomService.AMENITIES_KEY,
      RoomService.RATES_KEY,
      RoomService.FLOORS_KEY
    ]);
  }

  listRooms(filters?: {
    search?: string;
    status?: RoomVisualStatus | 'ALL';
    floor?: number | 'ALL';
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
    /** Salta el cache y lo repuebla: es lo que usa el boton de refrescar. */
    forceRefresh?: boolean;
  }): Observable<RoomI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.status && filters.status !== 'ALL' && filters.status !== 'POR_SALIR_HOY') {
      params = params.set('status', filters.status);
    }

    if (filters?.floor && filters.floor !== 'ALL') {
      params = params.set('floor', String(filters.floor));
    }

    if (filters?.ordering) {
      params = params.set('ordering', filters.ordering);
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.cache.get(
      this.cacheKey(RoomService.ROOMS_KEY, { ...filters, forceRefresh: undefined }),
      () =>
        this.http
          .get<RoomI[] | { results?: RoomI[] }>(this.roomsUrl, { withCredentials: true, params })
          .pipe(map((res) => this.unwrapArray<RoomI>(res))),
      CACHE_TTL.OPERATIONAL,
      filters?.forceRefresh
    );
  }

  getRoomById(id: number): Observable<RoomI> {
    return this.http.get<RoomI>(`${this.roomsUrl}${id}/`, { withCredentials: true });
  }

  getRoomPanel(id: number): Observable<RoomPanelI> {
    return this.http.get<RoomPanelI>(`${this.roomsUrl}${id}/panel/`, { withCredentials: true });
  }

  createRoom(payload: RoomFormPayload): Observable<RoomI> {
    return this.http.post<RoomI>(
      this.roomsUrl,
      this.normalizePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateRooms()));
  }

  updateRoom(id: number, payload: RoomFormPayload): Observable<RoomI> {
    return this.http.patch<RoomI>(
      `${this.roomsUrl}${id}/`,
      this.normalizePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateRooms()));
  }

  updateRoomRate(id: number, rate: number | null): Observable<RoomI> {
    const normalizedRate = typeof rate === 'number' && rate > 0 ? Number(rate) : null;
    return this.http.patch<RoomI>(
      `${this.roomsUrl}${id}/`,
      { rate: normalizedRate },
      this.auth.buildCsrfRequestOptions()
    ).pipe(
      // Se invalida apenas responde el PATCH, antes de la relectura, para que nadie
      // alcance a leer el listado viejo entre las dos peticiones.
      tap(() => this.invalidateRooms()),
      switchMap((updated) =>
        this.getRoomById(id).pipe(
          map((fresh) => ({ ...updated, ...fresh })),
          catchError(() => of(updated))
        )
      )
    );
  }

  deleteRoom(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.roomsUrl}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateRooms()));
  }

  restoreRoom(id: number): Observable<RoomI> {
    return this.http
      .post<RoomI>(`${this.roomsUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateRooms()));
  }

  listRoomTypes(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<RoomTypeI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.cache.get(
      this.cacheKey(RoomService.ROOM_TYPES_KEY, filters as Record<string, unknown>),
      () =>
        this.http
          .get<RoomTypeI[] | { results?: RoomTypeI[] }>(this.roomTypesUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<RoomTypeI>(res))),
      CACHE_TTL.CATALOG
    );
  }

  getRoomTypeById(id: number): Observable<RoomTypeI> {
    return this.http.get<RoomTypeI>(`${this.roomTypesUrl}${id}/`, { withCredentials: true });
  }

  createRoomType(payload: RoomTypeFormPayload): Observable<RoomTypeI> {
    return this.http.post<RoomTypeI>(
      this.roomTypesUrl,
      this.normalizeCreateRoomTypePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.ROOM_TYPES_KEY)));
  }

  updateRoomType(id: number, payload: Partial<RoomTypeFormPayload>): Observable<RoomTypeI> {
    return this.http.patch<RoomTypeI>(
      `${this.roomTypesUrl}${id}/`,
      this.normalizePatchRoomTypePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.ROOM_TYPES_KEY)));
  }

  deleteRoomType(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.roomTypesUrl}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateCatalog(RoomService.ROOM_TYPES_KEY)));
  }

  restoreRoomType(id: number): Observable<RoomTypeI> {
    return this.http
      .post<RoomTypeI>(
        `${this.roomTypesUrl}${id}/restore/`,
        {},
        this.auth.buildCsrfRequestOptions()
      )
      .pipe(tap(() => this.invalidateCatalog(RoomService.ROOM_TYPES_KEY)));
  }

  listAmenities(filters?: {
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<AmenityI[]> {
    let params = new HttpParams();

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.cache.get(
      this.cacheKey(RoomService.AMENITIES_KEY, filters as Record<string, unknown>),
      () =>
        this.http
          .get<AmenityI[] | { results?: AmenityI[] }>(this.amenitiesUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<AmenityI>(res))),
      CACHE_TTL.CATALOG
    );
  }

  createAmenity(payload: Partial<AmenityI>): Observable<AmenityI> {
    return this.http.post<AmenityI>(
      this.amenitiesUrl,
      this.normalizeAmenityPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.AMENITIES_KEY)));
  }

  updateAmenity(id: number, payload: Partial<AmenityI>): Observable<AmenityI> {
    return this.http.patch<AmenityI>(
      `${this.amenitiesUrl}${id}/`,
      this.normalizeAmenityPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.AMENITIES_KEY)));
  }

  deleteAmenity(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.amenitiesUrl}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateCatalog(RoomService.AMENITIES_KEY)));
  }

  restoreAmenity(id: number): Observable<AmenityI> {
    return this.http
      .post<AmenityI>(`${this.amenitiesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateCatalog(RoomService.AMENITIES_KEY)));
  }

  listRates(filters?: {
    search?: string;
    ordering?: string;
    room_type?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<RateI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.room_type === 'number' && filters.room_type > 0) {
      params = params.set('room_type', String(filters.room_type));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.cache.get(
      this.cacheKey(RoomService.RATES_KEY, filters as Record<string, unknown>),
      () =>
        this.http
          .get<RateI[] | { results?: RateI[] }>(this.ratesUrl, { withCredentials: true, params })
          .pipe(map((res) => this.unwrapArray<RateI>(res))),
      CACHE_TTL.CATALOG
    );
  }

  getRateById(id: number): Observable<RateI> {
    return this.http.get<RateI>(`${this.ratesUrl}${id}/`, { withCredentials: true });
  }

  createRate(payload: RateFormPayload): Observable<RateI> {
    return this.http.post<RateI>(
      this.ratesUrl,
      this.normalizeCreateRatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.RATES_KEY)));
  }

  updateRate(id: number, payload: Partial<RateFormPayload>): Observable<RateI> {
    return this.http.patch<RateI>(
      `${this.ratesUrl}${id}/`,
      this.normalizePatchRatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateCatalog(RoomService.RATES_KEY)));
  }

  deleteRate(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.ratesUrl}${id}/`, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateCatalog(RoomService.RATES_KEY)));
  }

  restoreRate(id: number): Observable<RateI> {
    return this.http
      .post<RateI>(`${this.ratesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions())
      .pipe(tap(() => this.invalidateCatalog(RoomService.RATES_KEY)));
  }

  listFloors(): Observable<HotelFloorI[]> {
    return this.cache.get(
      RoomService.FLOORS_KEY,
      () =>
        this.http
          .get<HotelFloorI[] | { results?: HotelFloorI[] }>(this.floorsUrl, {
            withCredentials: true
          })
          .pipe(map((res) => this.unwrapArray<HotelFloorI>(res))),
      CACHE_TTL.CATALOG
    );
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object') {
      const maybeResults = (res as Record<string, unknown>)['results'];
      if (Array.isArray(maybeResults)) return maybeResults as T[];
    }
    return [];
  }

  private normalizePayload(payload: RoomFormPayload): RoomFormPayload {
    const normalized: RoomFormPayload = {
      number: (payload.number || '').trim(),
      floor: Number(payload.floor),
      status: payload.status,
      notes: (payload.notes || '').trim(),
      amenity_ids: Array.isArray(payload.amenity_ids) ? payload.amenity_ids : []
    };

    if (payload.room_type) {
      normalized.room_type = Number(payload.room_type);
    } else {
      normalized.room_type = null;
    }

    if (payload.rate) {
      normalized.rate = Number(payload.rate);
    } else {
      normalized.rate = null;
    }

    return normalized;
  }

  private normalizeAmenityPayload(payload: Partial<AmenityI>): Partial<AmenityI> {
    const normalized: Partial<AmenityI> = {};

    if (typeof payload.name === 'string') {
      normalized.name = payload.name.trim();
    }
    if (typeof payload.description === 'string') {
      normalized.description = payload.description.trim();
    }
    if (payload.description === null) {
      normalized.description = null;
    }
    if (typeof payload.icon === 'string') {
      normalized.icon = payload.icon.trim();
    }
    if (payload.icon === null) {
      normalized.icon = null;
    }
    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizeCreateRatePayload(payload: RateFormPayload): RateFormPayload {
    return {
      room_type: Number(payload.room_type),
      name: (payload.name || '').trim(),
      price: this.normalizePrice(payload.price),
      start_date: this.normalizeDate(payload.start_date),
      end_date: this.normalizeDate(payload.end_date),
      is_active: !!payload.is_active
    };
  }

  private normalizePatchRatePayload(payload: Partial<RateFormPayload>): Partial<RateFormPayload> {
    const normalized: Partial<RateFormPayload> = {};

    if (typeof payload.room_type === 'number') {
      normalized.room_type = Number(payload.room_type);
    }

    if (typeof payload.name === 'string') {
      normalized.name = payload.name.trim();
    }

    if (typeof payload.price === 'number') {
      normalized.price = this.normalizePrice(payload.price);
    }

    if (payload.start_date !== undefined) {
      normalized.start_date = this.normalizeDate(payload.start_date);
    }

    if (payload.end_date !== undefined) {
      normalized.end_date = this.normalizeDate(payload.end_date);
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizePrice(value: unknown): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber) || asNumber < 0) return 0;
    return Number(asNumber.toFixed(2));
  }

  private normalizeCreateRoomTypePayload(payload: RoomTypeFormPayload): RoomTypeFormPayload {
    return {
      code: this.normalizeRoomTypeCode(payload.code),
      name: this.normalizeRoomTypeName(payload.name),
      description: this.normalizeNullableText(payload.description),
      capacity: this.normalizePositiveInteger(payload.capacity, 1),
      bed_count: this.normalizePositiveInteger(payload.bed_count, 1),
      bed_type: this.normalizeNullableText(payload.bed_type),
      is_active: !!payload.is_active,
      sort_order: this.normalizeNonNegativeInteger(payload.sort_order)
    };
  }

  private normalizePatchRoomTypePayload(payload: Partial<RoomTypeFormPayload>): Partial<RoomTypeFormPayload> {
    const normalized: Partial<RoomTypeFormPayload> = {};

    if (payload.code !== undefined) {
      normalized.code = this.normalizeRoomTypeCode(payload.code);
    }

    if (payload.name !== undefined) {
      normalized.name = this.normalizeRoomTypeName(payload.name);
    }

    if (payload.description !== undefined) {
      normalized.description = this.normalizeNullableText(payload.description);
    }

    if (payload.capacity !== undefined) {
      normalized.capacity = this.normalizePositiveInteger(payload.capacity, 1);
    }

    if (payload.bed_count !== undefined) {
      normalized.bed_count = this.normalizePositiveInteger(payload.bed_count, 1);
    }

    if (payload.bed_type !== undefined) {
      normalized.bed_type = this.normalizeNullableText(payload.bed_type);
    }

    if (payload.is_active !== undefined) {
      normalized.is_active = !!payload.is_active;
    }

    if (payload.sort_order !== undefined) {
      normalized.sort_order = this.normalizeNonNegativeInteger(payload.sort_order);
    }

    return normalized;
  }

  private normalizeDate(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeRoomTypeCode(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }

  private normalizeRoomTypeName(value: unknown): string {
    return String(value || '').trim();
  }

  private normalizeNullableText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizePositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private normalizeNonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
  }
}
