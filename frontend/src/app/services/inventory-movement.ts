import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { CACHE_TTL, ResourceCache } from './resource-cache';
import {
  InventoryMovementFormPayload,
  InventoryMovementI
} from '../modules/inventory-movements/inventory-movement-model';

type DRFPaginated<T> = {
  results?: T[];
};

/** Lo que devuelve un conteo: cuantas lineas se contaron y cuantas descuadraron. */
export interface StockCountResultI {
  reference: string;
  counted_lines: number;
  adjusted_lines: number;
  unchanged_lines: number;
  unknown_items: number[];
  movement_ids: number[];
}

export interface PurchaseEntryResultI {
  reference: string;
  entered_lines: number;
  unknown_items: number[];
  movement_ids: number[];
}

@Injectable({
  providedIn: 'root'
})
export class InventoryMovementsService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly movementsUrl = `${this.apiBase}/api/inventory-movements/`;

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
    this.cache.invalidateAll(InventoryMovementsService.INVENTORY_KEYS);
  }


  listInventoryMovements(filters?: {
    search?: string;
    ordering?: string;
    /** Bitacora de un item concreto: la que explica su stock actual. */
    item?: number;
    include_inactive?: boolean;
    include_deleted?: boolean;
    /** Salta el cache y lo repuebla: es lo que usa el boton de actualizar. */
    forceRefresh?: boolean;
  }): Observable<InventoryMovementI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.item === 'number' && Number.isFinite(filters.item) && filters.item > 0) {
      params = params.set('item', String(filters.item));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.cache.get(
      this.cacheKey('inventory-movements', filters as Record<string, unknown>),
      () =>
        this.http
          .get<InventoryMovementI[] | DRFPaginated<InventoryMovementI>>(this.movementsUrl, {
            withCredentials: true,
            params
          })
          .pipe(map((res) => this.unwrapArray<InventoryMovementI>(res))),
      CACHE_TTL.OPERATIONAL,
      filters?.forceRefresh
    );
  }

  getInventoryMovementById(id: number): Observable<InventoryMovementI> {
    return this.http.get<InventoryMovementI>(`${this.movementsUrl}${id}/`, { withCredentials: true });
  }

  createInventoryMovement(payload: InventoryMovementFormPayload): Observable<InventoryMovementI> {
    return this.http.post<InventoryMovementI>(
      this.movementsUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  updateInventoryMovement(
    id: number,
    payload: Partial<InventoryMovementFormPayload>
  ): Observable<InventoryMovementI> {
    return this.http.patch<InventoryMovementI>(
      `${this.movementsUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  deleteInventoryMovement(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.movementsUrl}${id}/`,
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  restoreInventoryMovement(id: number): Observable<InventoryMovementI> {
    return this.http.post<InventoryMovementI>(
      `${this.movementsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    ).pipe(tap(() => this.invalidateInventory()));
  }

  /**
   * Asienta un conteo fisico completo.
   *
   * Va en una sola peticion, no en una por linea: un conteo es **una** operacion y el
   * backend la resuelve en una transaccion con referencia compartida. Ochenta peticiones
   * sueltas dejarian el inventario a medio contar en cuanto una fallara.
   */
  registerStockCount(payload: {
    lines: Array<{ item: number; counted: number }>;
    notes?: string;
  }): Observable<StockCountResultI> {
    return this.http
      .post<StockCountResultI>(
        `${this.movementsUrl}stock-count/`,
        payload,
        this.auth.buildCsrfRequestOptions()
      )
      .pipe(tap(() => this.invalidateInventory()));
  }

  /** Asienta la entrada de una compra: una linea `IN` por item recibido. */
  registerPurchaseEntry(payload: {
    lines: Array<{ item: number; quantity: number }>;
    reference?: string;
    notes?: string;
  }): Observable<PurchaseEntryResultI> {
    return this.http
      .post<PurchaseEntryResultI>(
        `${this.movementsUrl}purchase-entry/`,
        payload,
        this.auth.buildCsrfRequestOptions()
      )
      .pipe(tap(() => this.invalidateInventory()));
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: InventoryMovementFormPayload): InventoryMovementFormPayload {
    return {
      item: Number(payload.item),
      movement_type: Number(payload.movement_type),
      quantity: this.toPositiveInt(payload.quantity),
      reference: this.normalizeNullableString(payload.reference),
      notes: (payload.notes || '').trim(),
      is_active: !!payload.is_active
    };
  }

  private normalizePatchPayload(
    payload: Partial<InventoryMovementFormPayload>
  ): Partial<InventoryMovementFormPayload> {
    const normalized: Partial<InventoryMovementFormPayload> = {};

    if (typeof payload.item === 'number') {
      normalized.item = Number(payload.item);
    }

    if (typeof payload.movement_type === 'number') {
      normalized.movement_type = Number(payload.movement_type);
    }

    if (typeof payload.quantity === 'number') {
      normalized.quantity = this.toPositiveInt(payload.quantity);
    }

    if (payload.reference !== undefined) {
      normalized.reference = this.normalizeNullableString(payload.reference);
    }

    if (typeof payload.notes === 'string') {
      normalized.notes = payload.notes.trim();
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private toPositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
