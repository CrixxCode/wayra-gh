import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
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

const validateSession = (targetUrl: string) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  return authService.getUserInfo().pipe(
    map((user: MeResponse) => {
      if (!user?.username) {
        showAuthRequiredToast(messageService);
        return buildLoginRedirect(router, targetUrl);
      }

      if (user.must_change_password && !isPasswordChangeRoute(targetUrl)) {
        showPasswordChangeRequiredToast(messageService);
        return buildForcedPasswordRedirect(router, targetUrl);
      }

      return true;
    }),
    catchError(() => {
      showAuthRequiredToast(messageService);
      return of(buildLoginRedirect(router, targetUrl));
    })
  );
};

export const authGuard: CanActivateFn = (_route, state) => validateSession(state.url);

export const authChildGuard: CanActivateChildFn = (_route, state) => validateSession(state.url);
