import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { HotelSetupService } from '../services/hotel-setup';

export const hotelSetupChildGuard: CanActivateChildFn = (route) => {
  const setup = inject(HotelSetupService);
  const router = inject(Router);
  const path = route.routeConfig?.path || '';
  return setup.refresh().pipe(map((status) => {
    if (status.is_complete || ['hotel-config', 'hotel-setup', 'mi-perfil'].includes(path)) {
      return true;
    }
    return router.createUrlTree([status.can_configure ? '/hotel-config' : '/hotel-setup']);
  }));
};
