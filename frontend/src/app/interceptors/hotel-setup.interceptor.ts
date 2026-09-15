import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { HotelSetupService } from '../services/hotel-setup';

export const hotelSetupInterceptor: HttpInterceptorFn = (request, next) => {
  const setup = inject(HotelSetupService);
  return next(request).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status === 403 && error.error?.code === 'hotel_setup_required') {
      setup.status.set(error.error);
    }
    return throwError(() => error);
  }));
};
