import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';

type ReadStateResponse = {
  read_keys?: string[];
};

@Injectable({
  providedIn: 'root',
})
export class NotificationStateService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly readStateUrl = `${this.apiBase}/api/auth/notifications/read-state/`;
  private readonly markReadUrl = `${this.apiBase}/api/auth/notifications/mark-read/`;
  private readonly markUnreadUrl = `${this.apiBase}/api/auth/notifications/mark-unread/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listReadKeys(): Observable<string[]> {
    return this.http
      .get<ReadStateResponse>(this.readStateUrl, { withCredentials: true })
      .pipe(
        map((res) => {
          const keys = Array.isArray(res?.read_keys) ? res.read_keys : [];
          return keys
            .map((key) => String(key || '').trim())
            .filter((key) => !!key);
        })
      );
  }

  markRead(keys: string[]): Observable<void> {
    const clean = this.sanitizeKeys(keys);
    if (!clean.length) return of(void 0);
    return this.http
      .post<void>(this.markReadUrl, { keys: clean }, this.auth.buildCsrfRequestOptions());
  }

  markUnread(keys: string[]): Observable<void> {
    const clean = this.sanitizeKeys(keys);
    if (!clean.length) return of(void 0);
    return this.http
      .post<void>(this.markUnreadUrl, { keys: clean }, this.auth.buildCsrfRequestOptions());
  }

  private sanitizeKeys(keys: string[]): string[] {
    const seen = new Set<string>();
    const clean: string[] = [];
    (Array.isArray(keys) ? keys : []).forEach((raw) => {
      const key = String(raw || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      clean.push(key);
    });
    return clean;
  }
}
