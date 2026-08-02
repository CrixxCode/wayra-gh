import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { HotelContextService } from '../services/hotel-context';

export const hotelContextInterceptor: HttpInterceptorFn = (request, next) => {
  const selectedHotelId = inject(HotelContextService).selectedHotelSettingsId;

  if (!selectedHotelId || !isHotelScopedApiRequest(request.url) || request.params.has('hotel_settings')) {
    return next(request);
  }

  return next(
    request.clone({
      params: request.params.set('hotel_settings', String(selectedHotelId)),
    })
  );
};

function isHotelScopedApiRequest(url: string): boolean {
  const normalizedUrl = String(url || '').split('?')[0].replace(/\/$/, '');
  if (!normalizedUrl.includes('/api/')) return false;
  if (normalizedUrl.includes('/api/auth/')) return false;
  if (normalizedUrl.endsWith('/api/demo-requests')) return false;

  // The hotel catalog must remain global so the header can populate the selector.
  if (normalizedUrl.endsWith('/api/hotel-settings')) return false;

  return true;
}
