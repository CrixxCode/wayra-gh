import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthService, MeResponse } from '../services/auth/auth';

const normalizeRoutePath = (targetUrl: string): string => {
  const [pathOnly] = String(targetUrl || '/').split('?');
  const normalized = (pathOnly || '/').trim().replace(/\/+$/, '');
  return normalized || '/';
};

const isPasswordChangeRoute = (targetUrl: string): boolean => {
  return normalizeRoutePath(targetUrl) === '/mi-perfil';
};

const buildLoginRedirect = (router: Router, targetUrl: string) => {
  const returnUrl =
    targetUrl && targetUrl !== '/login' && targetUrl !== '/'
      ? { returnUrl: targetUrl }
      : undefined;
  return router.createUrlTree(['/login'], { queryParams: returnUrl });
};

const buildForcedPasswordRedirect = (router: Router, targetUrl: string) => {
  const returnUrl =
    targetUrl && targetUrl !== '/mi-perfil' && targetUrl !== '/'
      ? targetUrl
      : undefined;

  return router.createUrlTree(['/mi-perfil'], {
    queryParams: {
      forcePasswordChange: 1,
      tab: 'password',
      ...(returnUrl ? { returnUrl } : {}),
    },
  });
};

const showAuthRequiredToast = (messageService: MessageService) => {
  messageService.add({
    key: 'auth',
    severity: 'warn',
    summary: 'Sesion requerida',
    detail: 'Debes iniciar sesion para continuar.',
    life: 3000,
  });
};

const showPasswordChangeRequiredToast = (messageService: MessageService) => {
  messageService.add({
    key: 'auth',
    severity: 'warn',
    summary: 'Cambio de contrasena requerido',
    detail: 'Debes actualizar tu contrasena para continuar.',
    life: 3500,
  });
};

const showHotelInactiveToast = (messageService: MessageService) => {
  messageService.add({
    key: 'auth',
    severity: 'warn',
    summary: 'Hotel desactivado',
    detail: 'El hotel de tu cuenta esta desactivado. Contacta al administrador de la plataforma.',
    life: 4000,
  });
};

const isHotelInactive = (user: MeResponse): boolean =>
  Boolean(user?.hotel_settings) && user.hotel_settings?.is_active === false;

const validateSession = (targetUrl: string) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  return authService.getUserInfo().pipe(
    switchMap((user: MeResponse) => {
      if (!user?.username) {
        showAuthRequiredToast(messageService);
        return of(buildLoginRedirect(router, targetUrl));
      }

      if (isHotelInactive(user)) {
        showHotelInactiveToast(messageService);
        // El backend ya bloquea toda peticion API para este usuario (ver
        // accounts.middleware.HotelActiveMiddleware); mantener la sesion viva en el
        // navegador no sirve de nada, asi que se cierra y se vuelve a login.
        return authService.logout().pipe(
          catchError(() => of(null)),
          map(() => buildLoginRedirect(router, targetUrl))
        );
      }

      if (user.must_change_password && !isPasswordChangeRoute(targetUrl)) {
        showPasswordChangeRequiredToast(messageService);
        return of(buildForcedPasswordRedirect(router, targetUrl));
      }

      return of(true);
    }),
    catchError(() => {
      showAuthRequiredToast(messageService);
      return of(buildLoginRedirect(router, targetUrl));
    })
  );
};

export const authGuard: CanActivateFn = (_route, state) => validateSession(state.url);

export const authChildGuard: CanActivateChildFn = (_route, state) => validateSession(state.url);
