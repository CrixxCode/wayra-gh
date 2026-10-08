import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { HotelSetupService } from '../services/hotel-setup';

export const hotelSetupChildGuard: CanActivateChildFn = (route) => {
  const setup = inject(HotelSetupService);
  const router = inject(Router);
  const path = route.routeConfig?.path || '';
  return setup.refresh().pipe(map((status) => {
    // `habitaciones` entra porque el setup exige habitaciones reales con tipo y tarifa, y
    // solo se crean ahi: sin ella el hotel nuevo quedaba atrapado en /hotel-config.
    if (
      status.is_complete ||
      ['hotel-config', 'hotel-setup', 'mi-perfil', 'habitaciones'].includes(path)
    ) {
      return true;
    }
    return router.createUrlTree([status.can_configure ? '/hotel-config' : '/hotel-setup']);
  }));
};
