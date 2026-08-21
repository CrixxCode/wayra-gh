import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../enviorements/environment';

export interface OnlineCheckInLookupPayload {
  reservationCode: string;
  documentType: string;
  documentNumber: string;
}

export interface OnlineCheckInExistingGuest {
  first_name: string;
  last_name: string;
  document_type: string;
  document_number: string;
  birth_date: string | null;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  arrival_time_window: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  accepts_data_policy: boolean;
}

export interface OnlineCheckInHolder {
  first_name: string;
  last_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string | null;
  nationality: string | null;
}

export interface OnlineCheckInLookupResponse {
  reservation_id: number;
  hotel_name: string;
  status_code: string;
  status_label: string;
  expected_check_in: string;
  expected_check_out: string;
  total_guests: number;
  room_summary: string;
  payment_status_code: string;
  payment_status_label: string;
  holder: OnlineCheckInHolder;
  eligible: boolean;
  eligible_reason: string | null;
  existing_guests: OnlineCheckInExistingGuest[];
}

export interface OnlineCheckInGuestPayload {
  firstName: string;
  lastName: string;
  documentType: string;
  documentNumber: string;
  birthDate: string;
  nationality: string;
}

export interface OnlineCheckInPayload {
  reservationCode: string;
  guests: OnlineCheckInGuestPayload[];
  email: string;
  phone: string;
  arrivalTime: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  signature: string;
  notes?: string;
  acceptsDataPolicy: boolean;
}

export interface OnlineCheckInSubmittedGuest {
  full_name: string;
  document_number: string;
  online_check_in_submitted_at: string;
}

export interface OnlineCheckInResponse {
  reservation_id: number;
  hotel_name: string;
  status_code: string;
  expected_check_in: string;
  expected_check_out: string;
  guests: OnlineCheckInSubmittedGuest[];
}

@Injectable({ providedIn: 'root' })
export class OnlineCheckInService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly onlineCheckInUrl = `${this.apiBase}/api/online-check-in/`;
  private readonly onlineCheckInLookupUrl = `${this.apiBase}/api/online-check-in/lookup/`;

  constructor(private readonly http: HttpClient) {}

  lookupOnlineCheckIn(payload: OnlineCheckInLookupPayload): Observable<OnlineCheckInLookupResponse> {
    return this.http.post<OnlineCheckInLookupResponse>(this.onlineCheckInLookupUrl, payload);
  }

  submitOnlineCheckIn(payload: OnlineCheckInPayload): Observable<OnlineCheckInResponse> {
    return this.http.post<OnlineCheckInResponse>(this.onlineCheckInUrl, payload);
  }
}
