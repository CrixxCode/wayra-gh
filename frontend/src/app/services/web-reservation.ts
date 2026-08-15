import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../enviorements/environment';

export interface WebReservationPayload {
  hotelSlug: string;
  roomRateId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestDocumentType: string;
  guestDocumentNumber: string;
  guestCountry?: string;
  notes?: string;
  sourceDetail?: string;
  sourceUrl?: string;
  sourceReferrer?: string;
  sourceMetadata?: Record<string, unknown>;
}

export interface WebReservationResponse {
  id: number;
  hotel_settings: number;
  hotel_name: string;
  client: number;
  client_full_name: string;
  status_code: string;
  origin_code: string;
  expected_check_in: string;
  expected_check_out: string;
  total_rooms: number;
  total_guests: number;
  total_nights: number;
  source_channel: string;
  source_detail: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class WebReservationService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly webReservationsUrl = `${this.apiBase}/api/web-reservations/`;

  constructor(private readonly http: HttpClient) {}

  createWebReservation(payload: WebReservationPayload): Observable<WebReservationResponse> {
    return this.http.post<WebReservationResponse>(this.webReservationsUrl, payload);
  }
}
