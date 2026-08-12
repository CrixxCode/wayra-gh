import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import { RoomInventoryFormPayload, RoomInventoryI } from '../modules/room-inventory/room-inventory-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class RoomInventoryService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly roomInventoryUrl = `${this.apiBase}/api/room-inventory/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cache: ResourceCache
  ) {}

  // --------------------------------------------------------------------- cache
  // Cache-aside sobre las lecturas de inventario (ver `resource-cache.ts`).
  //
  // TTL operativo: el stock de un item lo mueve cada consumo y cada check-out, no
  // solo quien edita el catalogo. El cache evita repetir consultas al saltar entre
  // pestañas, no guardar cifras viejas durante minutos.
  private static readonly INVENTORY_KEYS = ['items', 'room-inventory', 'inventory-movements'];

  private cacheKey(base: string, filters?: Record<string, unknown>): string {
    const entries = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    return entries.length ? `${base}:${entries.join('&')}` : base;
  }

  /**
   * Cualquier escritura tira las tres claves.
   *
   * `Item` es el centro: un movimiento cambia su stock y una asignacion a habitacion
   * lo reparte. Invalidar solo la entidad tocada dejaria a las otras dos pestañas
   * mostrando existencias que ya no son.
   */
  private invalidateInventory(): void {
    this.cache.invalidateAll(RoomInventoryService.INVENTORY_KEYS);
  }


  listRoomInventory(filters?: {
    room?: number;
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
    /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
    forceRefresh?: boolean;
  }): Observable<RoomInventoryI[]> {
    let params = new HttpParams();

    if (typeof filters?.room === 'number') {
      params = params.set('room', String(filters.room));
    }

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
      this.cacheKey('room-inventory', filters as Record<string, unknown>),
      () =>
        this.http
          .get<RoomInventoryI[] | DRFPaginated<RoomInventoryI>>(this.roomInventoryUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<RoomInventoryI>(res))),
      CACHE_TTL.OPERATIONAL,
      filters?.forceRefresh
    );
  }

  getRoomInventoryById(id: number): Observable<RoomInventoryI> {
    return this.http.get<RoomInventoryI>(`${this.roomInventoryUrl}${id}/`, { withCredentials: true });
  }

  createRoomInventory(payload: RoomInventoryFormPayload): Observable<RoomInventoryI> {
    return this.http.post<RoomInventoryI>(
      this.roomInventoryUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  updateRoomInventory(id: number, payload: Partial<RoomInventoryFormPayload>): Observable<RoomInventoryI> {
    return this.http.patch<RoomInventoryI>(
      `${this.roomInventoryUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  deleteRoomInventory(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.roomInventoryUrl}${id}/`,
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  restoreRoomInventory(id: number): Observable<RoomInventoryI> {
    return this.http.post<RoomInventoryI>(
      `${this.roomInventoryUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: RoomInventoryFormPayload): RoomInventoryFormPayload {
    return {
      room: Number(payload.room),
      item: Number(payload.item),
      quantity: this.toNonNegativeInt(payload.quantity),
      minimum_quantity: this.toNonNegativeInt(payload.minimum_quantity),
      notes: (payload.notes || '').trim(),
      is_active: !!payload.is_active
    };
  }

  private normalizePatchPayload(payload: Partial<RoomInventoryFormPayload>): Partial<RoomInventoryFormPayload> {
    const normalized: Partial<RoomInventoryFormPayload> = {};

    if (typeof payload.room === 'number') {
      normalized.room = Number(payload.room);
    }

    if (typeof payload.item === 'number') {
      normalized.item = Number(payload.item);
    }

    if (typeof payload.quantity === 'number') {
      normalized.quantity = this.toNonNegativeInt(payload.quantity);
    }

    if (typeof payload.minimum_quantity === 'number') {
      normalized.minimum_quantity = this.toNonNegativeInt(payload.minimum_quantity);
    }

    if (typeof payload.notes === 'string') {
      normalized.notes = payload.notes.trim();
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
