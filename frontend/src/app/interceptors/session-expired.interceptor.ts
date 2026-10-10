import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth/auth';

// Mismo criterio que `hotel-inactive.interceptor.ts`: un flag de modulo deduplica la rafaga
// de peticiones paralelas que fallan a la vez cuando vence la sesion.
let isHandlingExpiredSession = false;

/** Peticiones donde un "no autenticado" es normal y ya tiene quien lo maneje. */
const IGNORED_PATHS = ['/api/auth/login/', '/api/auth/logout/', '/api/auth/me/', '/api/auth/csrf/'];

/**
 * La sesion vencio mientras el usuario seguia en una pantalla (auditoria, Bloque 1 #15).
 *
 * `auth.guard.ts` solo lo detecta al navegar; quieto en la misma pantalla, cada peticion
 * fallaba con un error generico. El backend responde `403 {code: "not_authenticated"}`
 * (`accounts.exceptions`): aqui se marca la sesion como cerrada, se avisa y se manda a login
 * con la ruta actual como `returnUrl`.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  if (IGNORED_PATHS.some((path) => request.url.includes(path))) {
    return next(request);
  }

  const router = inject(Router);
  const authService = inject(AuthService);
  const messageService = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 401 || error.error?.code === 'not_authenticated') &&
        authService.getCachedSessionState() &&
        !isHandlingExpiredSession
      ) {
        isHandlingExpiredSession = true;
        authService.rememberSessionState(false);

        messageService.add({
          key: 'auth',
          severity: 'warn',
          summary: 'Sesion vencida',
          detail: 'Tu sesion expiro. Inicia sesion de nuevo para continuar.',
          life: 4000,
        });

        const currentUrl = router.url;
        const queryParams =
          currentUrl && currentUrl !== '/' && !currentUrl.startsWith('/login')
            ? { returnUrl: currentUrl }
            : undefined;
        router.navigate(['/login'], { queryParams }).finally(() => {
          isHandlingExpiredSession = false;
        });
      }

      return throwError(() => error);
    })
  );
};
