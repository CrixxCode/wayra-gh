import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
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
    private auth: AuthService
  ) {}

  listRoomInventory(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<RoomInventoryI[]> {
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

    return this.http
      .get<RoomInventoryI[] | DRFPaginated<RoomInventoryI>>(this.roomInventoryUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<RoomInventoryI>(res)));
  }

  getRoomInventoryById(id: number): Observable<RoomInventoryI> {
    return this.http.get<RoomInventoryI>(`${this.roomInventoryUrl}${id}/`, { withCredentials: true });
  }

  createRoomInventory(payload: RoomInventoryFormPayload): Observable<RoomInventoryI> {
    return this.http.post<RoomInventoryI>(
      this.roomInventoryUrl,
      this.normalizeCreatePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateRoomInventory(id: number, payload: Partial<RoomInventoryFormPayload>): Observable<RoomInventoryI> {
    return this.http.patch<RoomInventoryI>(
      `${this.roomInventoryUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteRoomInventory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.roomInventoryUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreRoomInventory(id: number): Observable<RoomInventoryI> {
    return this.http.post<RoomInventoryI>(
      `${this.roomInventoryUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
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
