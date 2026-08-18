import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth/auth';

// Modulo-level, no por inyeccion: el interceptor se re-crea por cada peticion, asi que un
// flag de instancia no serviria para deduplicar rafagas de peticiones paralelas (ej. un
// dashboard que carga varios widgets a la vez) que fallan todas al mismo tiempo.
let isHandlingHotelInactive = false;

/**
 * El backend (`accounts.middleware.HotelActiveMiddleware`) rechaza cualquier peticion API de
 * un usuario cuyo hotel se desactivo con `403 {code: "hotel_inactive"}`, sin importar en que
 * pantalla este parado. `auth.guard.ts` ya saca al usuario cuando vuelve a navegar, pero si se
 * queda quieto en la misma pantalla no habia nada que reaccionara de inmediato. Este
 * interceptor cierra ese hueco: ante la primera respuesta con ese codigo, cierra la sesion y
 * redirige a /login sin esperar a la proxima navegacion.
 */
export const hotelInactiveInterceptor: HttpInterceptorFn = (request, next) => {
  // El propio intento de login ya devuelve este mismo codigo cuando el hotel esta
  // desactivado; `login.ts` lo maneja con su propio mensaje en la pantalla de login, asi que
  // aqui no hay sesion que cerrar ni a donde redirigir.
  if (request.url.includes('/api/auth/login/')) {
    return next(request);
  }

  const router = inject(Router);
  const authService = inject(AuthService);
  const messageService = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        error.error?.code === 'hotel_inactive' &&
        !isHandlingHotelInactive
      ) {
        isHandlingHotelInactive = true;

        messageService.add({
          key: 'auth',
          severity: 'warn',
          summary: 'Hotel desactivado',
          detail: 'El hotel de tu cuenta esta desactivado. Contacta al administrador de la plataforma.',
          life: 4000,
        });

        authService.logout().subscribe({
          next: () => redirectToLogin(router),
          error: () => redirectToLogin(router),
        });
      }

      return throwError(() => error);
    })
  );
};

function redirectToLogin(router: Router): void {
  router.navigateByUrl('/login').finally(() => {
    isHandlingHotelInactive = false;
  });
}
