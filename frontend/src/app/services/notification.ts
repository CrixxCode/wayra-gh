import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';

type DRFPaginated<T> = {
  results?: T[];
};

type UnreadCountResponse = {
  unread_count?: number;
};

export interface NotificationI {
  id: number;
  hotel_settings?: number | null;
  hotel_name?: string | null;
  user?: string;
  user_username?: string | null;
  title: string;
  message: string;
  notification_type: string;
  priority: string;
  is_read: boolean;
  action_url?: string | null;
  related_content_type?: number | null;
  related_content_type_label?: string | null;
  related_object_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  read_at?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly notificationsUrl = `${this.apiBase}/api/notifications/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listNotifications(filters?: {
    is_read?: boolean;
    notification_type?: string;
    priority?: string;
    ordering?: string;
    scope?: 'self' | 'hotel';
  }): Observable<NotificationI[]> {
    let params = new HttpParams();

    if (typeof filters?.is_read === 'boolean') {
      params = params.set('is_read', String(filters.is_read));
    }

    if (filters?.notification_type?.trim()) {
      params = params.set('notification_type', filters.notification_type.trim().toUpperCase());
    }

    if (filters?.priority?.trim()) {
      params = params.set('priority', filters.priority.trim().toUpperCase());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (filters?.scope === 'hotel') {
      params = params.set('scope', 'hotel');
    }

    return this.http
      .get<NotificationI[] | DRFPaginated<NotificationI>>(this.notificationsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<NotificationI>(res)));
  }

  getUnreadCount(): Observable<number> {
    return this.http
      .get<UnreadCountResponse>(`${this.notificationsUrl}unread-count/`, { withCredentials: true })
      .pipe(map((res) => Number(res?.unread_count || 0)));
  }

  markAsRead(notificationId: number): Observable<NotificationI> {
    return this.http.post<NotificationI>(
      `${this.notificationsUrl}${notificationId}/mark-as-read/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  markAllAsRead(): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(
      `${this.notificationsUrl}mark-all-as-read/`,
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
}
