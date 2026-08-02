import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HotelContextService {
  private readonly storageKey = 'gh_selected_hotel_settings_id';
  private readonly selectedHotelSubject = new BehaviorSubject<number | null>(
    this.readStoredHotelId()
  );

  readonly selectedHotelId$ = this.selectedHotelSubject.asObservable();

  get selectedHotelSettingsId(): number | null {
    return this.selectedHotelSubject.value;
  }

  selectHotel(hotelSettingsId: number | null): void {
    const normalizedId = Number(hotelSettingsId || 0);
    const selectedId = Number.isFinite(normalizedId) && normalizedId > 0 ? normalizedId : null;

    this.selectedHotelSubject.next(selectedId);

    if (typeof localStorage === 'undefined') return;
    if (selectedId) {
      localStorage.setItem(this.storageKey, String(selectedId));
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }

  clearSelection(): void {
    this.selectHotel(null);
  }

  private readStoredHotelId(): number | null {
    if (typeof localStorage === 'undefined') return null;
    const parsed = Number(localStorage.getItem(this.storageKey) || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
