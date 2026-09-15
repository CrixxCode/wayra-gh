import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap } from 'rxjs';
import { environment } from '../../enviorements/environment';

export interface HotelSetupStatus {
  is_complete: boolean;
  missing_fields: Array<{ field: string; label: string }>;
  can_configure: boolean;
  must_change_password: boolean;
  verification_failed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class HotelSetupService {
  readonly status = signal<HotelSetupStatus | null>(null);
  private readonly url = `${environment.API_URI.replace(/\/$/, '')}/api/auth/hotel-setup/`;

  constructor(private http: HttpClient) {}

  refresh() {
    return this.http.get<HotelSetupStatus>(this.url, { withCredentials: true }).pipe(
      catchError(() => of<HotelSetupStatus>({
        is_complete: false,
        missing_fields: [],
        can_configure: false,
        must_change_password: false,
        verification_failed: true,
      })),
      tap((status) => this.status.set(status))
    );
  }

  afterSave<T>(result: T) {
    return this.refresh().pipe(map(() => result));
  }
}
