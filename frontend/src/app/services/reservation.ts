import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import {
  ReservationCheckOutPayloadI,
  ReservationCheckoutInventoryReviewLinePayloadI,
  ReservationDetailI,
  ReservationDepositI,
  ReservationDepositPayloadI,
  ReservationGuestI,
  ReservationGuestPayloadI,
  ReservationI,
  ReservationPolicyI,
  ReservationPolicyPayloadI,
  ReservationRoomI,
  ReservationRoomPayloadI,
  ReservationWritePayloadI
} from '../modules/reservations/reservation-model';

type DRFPaginated<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

export type PaginatedResponseI<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly reservationsUrl = `${this.apiBase}/api/reservations/`;
  private readonly reservationPoliciesUrl = `${this.apiBase}/api/reservation-policies/`;
  private readonly reservationRoomsUrl = `${this.apiBase}/api/reservation-rooms/`;
  private readonly reservationGuestsUrl = `${this.apiBase}/api/reservation-guests/`;
  private readonly reservationDepositsUrl = `${this.apiBase}/api/reservation-deposits/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listReservations(filters?: {
    search?: string;
    ordering?: string;
    include_finished?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
    page?: number;
    page_size?: number;
  }): Observable<ReservationI[]> {
    return this.listReservationsPage(filters).pipe(map((response) => response.results));
  }

  listReservationsPage(filters?: {
    search?: string;
    ordering?: string;
    include_finished?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
    page?: number;
    page_size?: number;
  }): Observable<PaginatedResponseI<ReservationI>> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.include_finished === 'boolean') {
      params = params.set('include_finished', String(filters.include_finished));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    if (filters?.page && Number.isFinite(filters.page) && filters.page > 0) {
      params = params.set('page', String(filters.page));
    }

    if (filters?.page_size && Number.isFinite(filters.page_size) && filters.page_size > 0) {
      params = params.set('page_size', String(filters.page_size));
    }

    return this.http
      .get<ReservationI[] | DRFPaginated<ReservationI>>(this.reservationsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapPaginated<ReservationI>(res)));
  }

  getReservationById(id: number): Observable<ReservationDetailI> {
    return this.http.get<ReservationDetailI>(`${this.reservationsUrl}${id}/`, {
      withCredentials: true
    });
  }

  listReservationPolicies(filters?: {
    search?: string;
    ordering?: string;
    hotel_settings?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<ReservationPolicyI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (filters?.hotel_settings && Number.isFinite(filters.hotel_settings) && filters.hotel_settings > 0) {
      params = params.set('hotel_settings', String(filters.hotel_settings));
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

    return this.http
      .get<ReservationPolicyI[] | DRFPaginated<ReservationPolicyI>>(this.reservationPoliciesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ReservationPolicyI>(res)));
  }

  createReservationPolicy(payload: ReservationPolicyPayloadI): Observable<ReservationPolicyI> {
    return this.http.post<ReservationPolicyI>(
      this.reservationPoliciesUrl,
      this.normalizeReservationPolicyPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateReservationPolicy(id: number, payload: Partial<ReservationPolicyPayloadI>): Observable<ReservationPolicyI> {
    return this.http.patch<ReservationPolicyI>(
      `${this.reservationPoliciesUrl}${id}/`,
      this.normalizeReservationPolicyPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteReservationPolicy(id: number): Observable<void> {
    return this.http.delete<void>(`${this.reservationPoliciesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreReservationPolicy(id: number): Observable<ReservationPolicyI> {
    return this.http.post<ReservationPolicyI>(
      `${this.reservationPoliciesUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  createReservation(payload: ReservationWritePayloadI): Observable<ReservationI> {
    return this.http.post<ReservationI>(
      this.reservationsUrl,
      this.normalizePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateReservation(id: number, payload: Partial<ReservationWritePayloadI>): Observable<ReservationI> {
    return this.http.patch<ReservationI>(
      `${this.reservationsUrl}${id}/`,
      this.normalizePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  confirmReservation(id: number): Observable<ReservationDetailI> {
    return this.http.post<ReservationDetailI>(
      `${this.reservationsUrl}${id}/confirm/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  checkInReservation(id: number): Observable<ReservationDetailI> {
    return this.http.post<ReservationDetailI>(
      `${this.reservationsUrl}${id}/check-in/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  checkOutReservation(id: number, payload?: ReservationCheckOutPayloadI): Observable<ReservationDetailI> {
    return this.http.post<ReservationDetailI>(
      `${this.reservationsUrl}${id}/check-out/`,
      this.normalizeCheckOutPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  cancelReservation(id: number): Observable<ReservationDetailI> {
    return this.http.post<ReservationDetailI>(
      `${this.reservationsUrl}${id}/cancel/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteReservation(id: number): Observable<void> {
    return this.http.delete<void>(`${this.reservationsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreReservation(id: number): Observable<ReservationI> {
    return this.http.post<ReservationI>(
      `${this.reservationsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  listReservationRooms(filters?: { reservation?: number }): Observable<ReservationRoomI[]> {
    let params = new HttpParams();

    if (filters?.reservation) {
      params = params.set('search', String(filters.reservation));
    }

    return this.http
      .get<ReservationRoomI[] | DRFPaginated<ReservationRoomI>>(this.reservationRoomsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ReservationRoomI>(res)));
  }

  createReservationRoom(payload: ReservationRoomPayloadI): Observable<ReservationRoomI> {
    return this.http.post<ReservationRoomI>(
      this.reservationRoomsUrl,
      this.normalizeRoomPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateReservationRoom(id: number, payload: Partial<ReservationRoomPayloadI>): Observable<ReservationRoomI> {
    return this.http.patch<ReservationRoomI>(
      `${this.reservationRoomsUrl}${id}/`,
      this.normalizeRoomPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteReservationRoom(id: number): Observable<void> {
    return this.http.delete<void>(`${this.reservationRoomsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreReservationRoom(id: number): Observable<ReservationRoomI> {
    return this.http.post<ReservationRoomI>(
      `${this.reservationRoomsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  listReservationGuests(filters?: { reservation?: number }): Observable<ReservationGuestI[]> {
    let params = new HttpParams();

    if (filters?.reservation) {
      params = params.set('search', String(filters.reservation));
    }

    return this.http
      .get<ReservationGuestI[] | DRFPaginated<ReservationGuestI>>(this.reservationGuestsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ReservationGuestI>(res)));
  }

  createReservationGuest(payload: ReservationGuestPayloadI): Observable<ReservationGuestI> {
    return this.http.post<ReservationGuestI>(
      this.reservationGuestsUrl,
      this.normalizeGuestPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  createReservationDeposit(payload: ReservationDepositPayloadI): Observable<ReservationDepositI> {
    return this.http.post<ReservationDepositI>(
      this.reservationDepositsUrl,
      this.normalizeDepositPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  private unwrapArray<T>(res: unknown): T[] {
    return this.unwrapPaginated<T>(res).results;
  }

  private unwrapPaginated<T>(res: unknown): PaginatedResponseI<T> {
    if (Array.isArray(res)) {
      return {
        count: (res as T[]).length,
        next: null,
        previous: null,
        results: res as T[],
      };
    }

    if (res && typeof res === 'object') {
      const maybeResults = (res as Record<string, unknown>)['results'];
      if (Array.isArray(maybeResults)) {
        const count = Number((res as Record<string, unknown>)['count']);
        const next = (res as Record<string, unknown>)['next'];
        const previous = (res as Record<string, unknown>)['previous'];

        return {
          count: Number.isFinite(count) && count >= 0 ? count : maybeResults.length,
          next: typeof next === 'string' || next === null ? next : null,
          previous: typeof previous === 'string' || previous === null ? previous : null,
          results: maybeResults as T[],
        };
      }
    }

    return {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
  }

  private normalizePayload(payload: Partial<ReservationWritePayloadI>): Partial<ReservationWritePayloadI> {
    const normalized: Partial<ReservationWritePayloadI> = { ...payload };

    if (typeof normalized.client === 'string') {
      normalized.client = Number(normalized.client);
    }

    if (typeof normalized.origin === 'string') {
      normalized.origin = Number(normalized.origin);
    }

    if (normalized.package !== undefined && normalized.package !== null) {
      normalized.package = Number(normalized.package);
    }

    if (normalized.package === null) {
      normalized.package = null;
    }

    if (normalized.promo_code !== undefined) {
      normalized.promo_code = normalized.promo_code ? String(normalized.promo_code).trim() : null;
    }

    if (normalized.notes !== undefined) {
      normalized.notes = normalized.notes ? String(normalized.notes).trim() : null;
    }

    if (normalized.total_discount !== undefined && normalized.total_discount !== null) {
      normalized.total_discount = Number(normalized.total_discount);
    }

    if (normalized.policies !== undefined) {
      if (Array.isArray(normalized.policies)) {
        normalized.policies = normalized.policies
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0);
      } else {
        normalized.policies = [];
      }
    }

    return normalized;
  }

  private normalizeReservationPolicyPayload(
    payload: Partial<ReservationPolicyPayloadI>
  ): Partial<ReservationPolicyPayloadI> {
    const normalized: Partial<ReservationPolicyPayloadI> = { ...payload };

    if (typeof normalized.hotel_settings === 'string') {
      normalized.hotel_settings = Number(normalized.hotel_settings);
    }

    if (typeof normalized.policy_type === 'string') {
      normalized.policy_type = Number(normalized.policy_type);
    }

    if (typeof normalized.penalty_type === 'string') {
      normalized.penalty_type = Number(normalized.penalty_type);
    }

    if (normalized.name !== undefined) {
      normalized.name = String(normalized.name || '').trim();
    }

    if (normalized.description !== undefined) {
      normalized.description = normalized.description ? String(normalized.description).trim() : null;
    }

    if (normalized.penalty_value !== undefined && normalized.penalty_value !== null) {
      normalized.penalty_value = Number(normalized.penalty_value);
    }

    if (normalized.hours_before_checkin !== undefined && normalized.hours_before_checkin !== null) {
      normalized.hours_before_checkin = Number(normalized.hours_before_checkin);
    }

    return normalized;
  }

  private normalizeRoomPayload(payload: Partial<ReservationRoomPayloadI>): Partial<ReservationRoomPayloadI> {
    const normalized: Partial<ReservationRoomPayloadI> = { ...payload };

    if (typeof normalized.reservation === 'string') {
      normalized.reservation = Number(normalized.reservation);
    }

    if (typeof normalized.room === 'string') {
      normalized.room = Number(normalized.room);
    }

    if (normalized.night_rate !== undefined && normalized.night_rate !== null) {
      normalized.night_rate = Number(normalized.night_rate);
    }

    if (normalized.adults !== undefined && normalized.adults !== null) {
      normalized.adults = Number(normalized.adults);
    }

    if (normalized.children !== undefined && normalized.children !== null) {
      normalized.children = Number(normalized.children);
    }

    if (normalized.meal_plan !== undefined && normalized.meal_plan !== null) {
      normalized.meal_plan = Number(normalized.meal_plan);
    }

    return normalized;
  }

  private normalizeGuestPayload(payload: Partial<ReservationGuestPayloadI>): Partial<ReservationGuestPayloadI> {
    const normalized: Partial<ReservationGuestPayloadI> = { ...payload };

    if (typeof normalized.reservation === 'string') {
      normalized.reservation = Number(normalized.reservation);
    }

    if (typeof normalized.document_type === 'string') {
      normalized.document_type = Number(normalized.document_type);
    }

    if (normalized.document_number !== undefined) {
      normalized.document_number = String(normalized.document_number || '').trim();
    }

    if (normalized.first_name !== undefined) {
      normalized.first_name = String(normalized.first_name || '').trim();
    }

    if (normalized.last_name !== undefined) {
      normalized.last_name = String(normalized.last_name || '').trim();
    }

    if (normalized.birth_date !== undefined) {
      normalized.birth_date = normalized.birth_date ? String(normalized.birth_date).trim() : null;
    }

    if (normalized.nationality !== undefined) {
      normalized.nationality = normalized.nationality ? String(normalized.nationality).trim() : null;
    }

    if (normalized.blood_type !== undefined) {
      normalized.blood_type = normalized.blood_type ? String(normalized.blood_type).trim() : null;
    }

    if (normalized.emergency_contact_name !== undefined) {
      normalized.emergency_contact_name = normalized.emergency_contact_name
        ? String(normalized.emergency_contact_name).trim()
        : null;
    }

    if (normalized.emergency_contact_phone !== undefined) {
      normalized.emergency_contact_phone = normalized.emergency_contact_phone
        ? String(normalized.emergency_contact_phone).trim()
        : null;
    }

    return normalized;
  }

  private normalizeDepositPayload(payload: Partial<ReservationDepositPayloadI>): Partial<ReservationDepositPayloadI> {
    const normalized: Partial<ReservationDepositPayloadI> = { ...payload };

    if (typeof normalized.reservation === 'string') {
      normalized.reservation = Number(normalized.reservation);
    }

    if (normalized.deposit_date !== undefined) {
      normalized.deposit_date = String(normalized.deposit_date || '').trim();
    }

    if (normalized.amount !== undefined && normalized.amount !== null) {
      normalized.amount = Number(normalized.amount);
    }

    if (typeof normalized.payment_method === 'string') {
      normalized.payment_method = Number(normalized.payment_method);
    }

    if (normalized.reference !== undefined) {
      normalized.reference = normalized.reference ? String(normalized.reference).trim() : null;
    }

    if (typeof normalized.status === 'string') {
      normalized.status = Number(normalized.status);
    }

    if (normalized.notes !== undefined) {
      normalized.notes = normalized.notes ? String(normalized.notes).trim() : null;
    }

    return normalized;
  }

  private normalizeCheckOutPayload(
    payload?: ReservationCheckOutPayloadI
  ): ReservationCheckOutPayloadI | Record<string, never> {
    const lines = payload?.inventory_review || [];
    if (!Array.isArray(lines) || lines.length === 0) return {};

    const normalizedLines = lines
      .map((line) => this.normalizeCheckoutInventoryLine(line))
      .filter((line): line is ReservationCheckoutInventoryReviewLinePayloadI => line !== null);

    if (normalizedLines.length === 0) return {};

    return { inventory_review: normalizedLines };
  }

  private normalizeCheckoutInventoryLine(
    line: ReservationCheckoutInventoryReviewLinePayloadI
  ): ReservationCheckoutInventoryReviewLinePayloadI | null {
    const roomId = Number(line.room);
    const itemId = Number(line.item);
    if (!Number.isFinite(roomId) || roomId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
      return null;
    }

    const quantity = this.toNonNegativeInt(line.quantity);
    const notes = typeof line.notes === 'string' ? line.notes.trim() : '';

    return {
      room: roomId,
      item: itemId,
      quantity,
      notes: notes || null
    };
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
