import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { ItemFormPayload, ItemI } from '../modules/items/item-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class ItemsService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly itemsUrl = `${this.apiBase}/api/items/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listItems(filters?: {
    search?: string;
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<ItemI[]> {
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
      .get<ItemI[] | DRFPaginated<ItemI>>(this.itemsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ItemI>(res)));
  }

  getItemById(id: number): Observable<ItemI> {
    return this.http.get<ItemI>(`${this.itemsUrl}${id}/`, { withCredentials: true });
  }

  createItem(payload: ItemFormPayload): Observable<ItemI> {
    return this.http.post<ItemI>(this.itemsUrl, this.normalizeCreatePayload(payload), this.auth.buildCsrfRequestOptions());
  }

  updateItem(id: number, payload: Partial<ItemFormPayload>): Observable<ItemI> {
    return this.http.patch<ItemI>(
      `${this.itemsUrl}${id}/`,
      this.normalizePatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.itemsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreItem(id: number): Observable<ItemI> {
    return this.http.post<ItemI>(`${this.itemsUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeCreatePayload(payload: ItemFormPayload): ItemFormPayload {
    return {
      hotel_settings: Number(payload.hotel_settings),
      item_type: Number(payload.item_type),
      unit_measure: Number(payload.unit_measure),
      name: (payload.name || '').trim(),
      sku: this.normalizeNullableString(payload.sku),
      description: (payload.description || '').trim(),
      stock: this.toNonNegativeInt(payload.stock),
      minimum_stock: this.toNonNegativeInt(payload.minimum_stock),
      maximum_stock: this.toNonNegativeInt(payload.maximum_stock),
      cost_price: this.toNonNegativePrice(payload.cost_price),
      sale_price: this.toNonNegativePrice(payload.sale_price),
      is_active: !!payload.is_active
    };
  }

  private normalizePatchPayload(payload: Partial<ItemFormPayload>): Partial<ItemFormPayload> {
    const normalized: Partial<ItemFormPayload> = {};

    if (typeof payload.hotel_settings === 'number') {
      normalized.hotel_settings = Number(payload.hotel_settings);
    }

    if (typeof payload.item_type === 'number') {
      normalized.item_type = Number(payload.item_type);
    }

    if (typeof payload.unit_measure === 'number') {
      normalized.unit_measure = Number(payload.unit_measure);
    }

    if (typeof payload.name === 'string') {
      normalized.name = payload.name.trim();
    }

    if (payload.sku !== undefined) {
      normalized.sku = this.normalizeNullableString(payload.sku);
    }

    if (typeof payload.description === 'string') {
      normalized.description = payload.description.trim();
    }

    if (typeof payload.stock === 'number') {
      normalized.stock = this.toNonNegativeInt(payload.stock);
    }

    if (typeof payload.minimum_stock === 'number') {
      normalized.minimum_stock = this.toNonNegativeInt(payload.minimum_stock);
    }

    if (typeof payload.maximum_stock === 'number') {
      normalized.maximum_stock = this.toNonNegativeInt(payload.maximum_stock);
    }

    if (typeof payload.cost_price === 'number') {
      normalized.cost_price = this.toNonNegativePrice(payload.cost_price);
    }

    if (typeof payload.sale_price === 'number') {
      normalized.sale_price = this.toNonNegativePrice(payload.sale_price);
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private toNonNegativePrice(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Number(parsed.toFixed(2));
  }
}
