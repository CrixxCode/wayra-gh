import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthService, MeResponse, MenuItem, isEffectivePlatformAdmin } from '../services/auth/auth';

const PUBLIC_CHILD_PATHS = new Set(['403', '404', '**']);
const AUTHENTICATED_DEFAULT_PATHS = new Set(['mi-perfil', 'actividad']);

const normalizeRoute = (value?: string | null): string => {
  const safe = String(value || '').trim();
  if (!safe) return '';
  const withSlash = safe.startsWith('/') ? safe : `/${safe}`;
  const withoutTrailing = withSlash.replace(/\/+$/, '');
  return withoutTrailing || '/';
};

const collectMenuRoutes = (items: MenuItem[] | undefined, out: Set<string>) => {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const route = normalizeRoute(item?.route || '');
    if (route) out.add(route);
    if (Array.isArray(item?.children) && item.children.length) {
      collectMenuRoutes(item.children, out);
    }
  }
};

const canAccessChildRoute = (routePath: string, user: MeResponse): boolean => {
  const normalizedTarget = normalizeRoute(routePath);
  if (!normalizedTarget) return true;

  const allowedRoutes = new Set<string>();
  collectMenuRoutes(user?.menu, allowedRoutes);
  return allowedRoutes.has(normalizedTarget);
};

const buildForbiddenRedirect = (router: Router, targetUrl: string) => {
  const source =
    targetUrl && targetUrl !== '/403' && targetUrl !== '/404' ? { from: targetUrl } : undefined;
  return router.createUrlTree(['/403'], { queryParams: source });
};

const showForbiddenToast = (messageService: MessageService) => {
  messageService.add({
    key: 'auth',
    severity: 'error',
    summary: 'Acceso denegado',
    detail: 'No tienes permisos para acceder a esta pagina.',
    life: 3000,
  });
};

export const permissionChildGuard: CanActivateChildFn = (route, state) => {
  const routeConfig = route.routeConfig;
  const path = String(routeConfig?.path || '').trim();

  if (
    !path ||
    routeConfig?.redirectTo ||
    PUBLIC_CHILD_PATHS.has(path) ||
    AUTHENTICATED_DEFAULT_PATHS.has(path)
  ) {
    return true;
  }

  const authService = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  return authService.getUserInfo().pipe(
    map((user) => {
      if (routeConfig?.data?.['platformAdminOnly']) {
        if (isEffectivePlatformAdmin(user)) {
          return true;
        }
        showForbiddenToast(messageService);
        return buildForbiddenRedirect(router, state.url);
      }

      if (canAccessChildRoute(path, user)) {
        return true;
      }
      showForbiddenToast(messageService);
      return buildForbiddenRedirect(router, state.url);
    }),
    catchError(() => {
      showForbiddenToast(messageService);
      return of(buildForbiddenRedirect(router, state.url));
    })
  );
};
