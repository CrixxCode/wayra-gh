import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from '../../enviorements/environment';
import {
  SaasCountrySummary,
  SaasDashboardSnapshot,
  SaasHotelHealth,
  SaasHotelSnapshot,
} from '../modules/saas/saas-dashboard-model';

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

type HotelRow = {
  id: number;
  hotel_name?: string;
  city?: string | null;
  country?: string | null;
  general_email?: string | null;
  reservations_email?: string | null;
  primary_phone?: string | null;
  updated_at?: string;
  created_at?: string;
};

type UserRow = {
  id: string;
  is_active?: boolean;
};

type ReservationRow = {
  id: number;
  status_code?: string;
  expected_check_in?: string;
  expected_check_out?: string;
  real_check_in?: string | null;
  real_check_out?: string | null;
};

type InvoiceRow = {
  id: number;
  status_code?: string;
  total_amount?: string | number;
  is_active?: boolean;
};

type PaymentRow = {
  id: number;
  amount?: string | number;
  payment_date?: string;
  created_at?: string;
  is_active?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SaasDashboardService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly hotelSettingsUrl = `${this.apiBase}/api/hotel-settings/`;
  private readonly usersUrl = `${this.apiBase}/api/users/`;
  private readonly reservationsUrl = `${this.apiBase}/api/reservations/`;
  private readonly invoicesUrl = `${this.apiBase}/api/invoices/`;
  private readonly paymentsUrl = `${this.apiBase}/api/payments/`;

  constructor(private http: HttpClient) {}

  getSnapshot(): Observable<SaasDashboardSnapshot> {
    return forkJoin({
      hotels: this.fetchAllPages<HotelRow>(this.hotelSettingsUrl, this.withPaginationParams()),
      users: this.fetchAllPages<UserRow>(
        this.usersUrl,
        this.withPaginationParams({ include_inactive: 'true' })
      ),
      reservations: this.fetchAllPages<ReservationRow>(
        this.reservationsUrl,
        this.withPaginationParams({ include_finished: 'true' })
      ),
      invoices: this.fetchAllPages<InvoiceRow>(
        this.invoicesUrl,
        this.withPaginationParams({ include_inactive: 'true' })
      ),
      payments: this.fetchAllPages<PaymentRow>(
        this.paymentsUrl,
        this.withPaginationParams({ include_inactive: 'false' })
      ),
    }).pipe(
      map(({ hotels, users, reservations, invoices, payments }) => {
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();

        const activeUsers = users.filter((user) => user.is_active !== false).length;
        const activeReservations = reservations.filter((reservation) =>
          this.isActiveReservation(reservation)
        ).length;

        const monthRevenue = payments
          .filter((payment) => payment.is_active !== false)
          .filter((payment) => {
            const paymentDate = this.parseDate(payment.payment_date || payment.created_at);
            return (
              paymentDate &&
              paymentDate.getMonth() === thisMonth &&
              paymentDate.getFullYear() === thisYear
            );
          })
          .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);

        const openInvoices = invoices.filter((invoice) => {
          if (invoice.is_active === false) return false;
          const status = String(invoice.status_code || '').toUpperCase();
          return status === 'EMITIDA' || status === 'PENDIENTE';
        }).length;

        const enrichedHotels = hotels.map((hotel) => this.buildHotelSnapshot(hotel, now));
        const hotelsWithContact = enrichedHotels.filter((hotel) => hotel.hasContact).length;
        const hotelsWithoutContact = enrichedHotels.length - hotelsWithContact;
        const recentlyUpdatedHotels = enrichedHotels.filter((hotel) =>
          this.isRecentlyUpdated(hotel.lastUpdatedDays)
        ).length;

        const countries = this.buildCountrySummary(enrichedHotels);

        return {
          totals: {
            hotels: hotels.length,
            users: users.length,
            activeUsers,
            activeReservations,
            monthRevenue,
            openInvoices,
          },
          quality: {
            hotelsWithContact,
            hotelsWithoutContact,
            recentlyUpdatedHotels,
          },
          hotels: enrichedHotels,
          countries,
        };
      })
    );
  }

  getHotelsDirectory(): Observable<SaasHotelSnapshot[]> {
    const now = new Date();
    return this.fetchAllPages<HotelRow>(this.hotelSettingsUrl, this.withPaginationParams()).pipe(
      map((hotels) =>
        hotels
          .map((hotel) => this.buildHotelSnapshot(hotel, now))
          .sort((a, b) => {
            if (a.health !== b.health) {
              const order: Record<SaasHotelHealth, number> = { risk: 0, warning: 1, healthy: 2 };
              return order[a.health] - order[b.health];
            }

            if (a.lastUpdatedDays !== b.lastUpdatedDays) {
              const aDays = a.lastUpdatedDays ?? Number.MAX_SAFE_INTEGER;
              const bDays = b.lastUpdatedDays ?? Number.MAX_SAFE_INTEGER;
              return aDays - bDays;
            }

            return a.name.localeCompare(b.name, 'es');
          })
      )
    );
  }

  private withPaginationParams(extra?: Record<string, string>): HttpParams {
    let params = new HttpParams().set('page_size', '200');
    Object.entries(extra || {}).forEach(([key, value]) => {
      params = params.set(key, value);
    });
    return params;
  }

  private fetchAllPages<T>(url: string, params?: HttpParams): Observable<T[]> {
    return this.http
      .get<T[] | PaginatedResponse<T>>(url, { withCredentials: true, params })
      .pipe(switchMap((res) => this.collectPages<T>(res, [])));
  }

  private collectPages<T>(res: T[] | PaginatedResponse<T>, acc: T[]): Observable<T[]> {
    const rows = this.unwrapRows<T>(res);
    const merged = [...acc, ...rows];
    const next = this.extractNext(res);

    if (!next) {
      return of(merged);
    }

    return this.http
      .get<T[] | PaginatedResponse<T>>(next, { withCredentials: true })
      .pipe(switchMap((nextRes) => this.collectPages(nextRes, merged)));
  }

  private unwrapRows<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as PaginatedResponse<T>).results)) {
      return (res as PaginatedResponse<T>).results as T[];
    }
    return [];
  }

  private extractNext<T>(res: T[] | PaginatedResponse<T>): string | null {
    if (!res || Array.isArray(res)) return null;
    const next = res.next;
    return typeof next === 'string' && next.trim() ? next : null;
  }

  private buildHotelSnapshot(hotel: HotelRow, now: Date): SaasHotelSnapshot {
    const name = String(hotel.hotel_name || `Hotel #${hotel.id}`).trim();
    const city = String(hotel.city || '').trim();
    const country = String(hotel.country || '').trim();
    const location = [city, country].filter(Boolean).join(', ') || 'Sin ubicacion';
    const generalEmail = String(hotel.general_email || '').trim();
    const reservationsEmail = String(hotel.reservations_email || '').trim();
    const primaryPhone = String(hotel.primary_phone || '').trim();
    const hasContact = Boolean(generalEmail);
    const hasReservationsEmail = Boolean(reservationsEmail);
    const hasPhone = Boolean(primaryPhone);
    const updated = this.parseDate(hotel.updated_at || hotel.created_at);
    const lastUpdatedDays = this.daysFromNow(updated, now);
    const lastUpdatedLabel = this.relativeDateLabel(lastUpdatedDays);

    const missingContact = !hasContact || !hasPhone;
    const staleConfig = updated ? now.getTime() - updated.getTime() > 1000 * 60 * 60 * 24 * 45 : true;
    let health: SaasHotelHealth = 'healthy';

    if (missingContact || staleConfig) {
      health = 'warning';
    }
    if (!hasContact && !hasReservationsEmail) {
      health = 'risk';
    }

    let contactCompleteness: SaasHotelSnapshot['contactCompleteness'] = 'full';
    if (!hasContact && !hasReservationsEmail && !hasPhone) {
      contactCompleteness = 'none';
    } else if (!hasContact || !hasReservationsEmail || !hasPhone) {
      contactCompleteness = 'partial';
    }

    return {
      id: hotel.id,
      name,
      city,
      country,
      location,
      generalEmail,
      reservationsEmail,
      primaryPhone,
      hasContact,
      hasReservationsEmail,
      hasPhone,
      contactCompleteness,
      lastUpdatedLabel,
      lastUpdatedDays,
      lastUpdatedAt: hotel.updated_at || null,
      createdAt: hotel.created_at || null,
      health,
    };
  }

  private buildCountrySummary(hotels: SaasHotelSnapshot[]): SaasCountrySummary[] {
    const total = hotels.length || 1;
    const counter = new Map<string, number>();

    hotels.forEach((hotel) => {
      const country = hotel.location.split(',').pop()?.trim() || 'Sin pais';
      counter.set(country, (counter.get(country) || 0) + 1);
    });

    return [...counter.entries()]
      .map(([country, count]) => ({
        country,
        hotels: count,
        ratio: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.hotels - a.hotels)
      .slice(0, 8);
  }

  private isActiveReservation(row: ReservationRow): boolean {
    const status = String(row.status_code || '').toUpperCase();
    if (status.includes('CANCEL') || status.includes('FINALIZ')) return false;
    if (row.real_check_out) return false;
    return true;
  }

  private isRecentlyUpdated(days: number | null): boolean {
    if (days === null) return false;
    return days <= 30;
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private relativeDateLabel(days: number | null): string {
    if (days === null) return 'Sin fecha';
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    return `Hace ${days} dias`;
  }

  private daysFromNow(date: Date | null, now: Date): number | null {
    if (!date) return null;
    const ms = now.getTime() - date.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }
}
