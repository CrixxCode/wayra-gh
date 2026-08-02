import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, PRIMARY_OUTLET, RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(Title);
  private readonly appPrefix = 'Wayra';
  private readonly defaultSection = 'Gestion Hotelera';

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot) ?? this.buildFallbackTitle(snapshot.root);
    const documentTitle = routeTitle ? `${this.appPrefix} - ${routeTitle}` : this.appPrefix;
    this.titleService.setTitle(documentTitle);
  }

  private buildFallbackTitle(routeSnapshot: ActivatedRouteSnapshot): string {
    const deepestPrimaryRoute = this.getDeepestPrimaryRoute(routeSnapshot);

    const breadcrumbLabel = deepestPrimaryRoute.data['breadcrumbLabel'];
    if (typeof breadcrumbLabel === 'string' && breadcrumbLabel.trim().length > 0) {
      return breadcrumbLabel.trim();
    }

    const routePath = deepestPrimaryRoute.routeConfig?.path ?? '';
    if (!routePath) {
      return this.defaultSection;
    }

    return this.humanizePath(routePath) || this.defaultSection;
  }

  private getDeepestPrimaryRoute(routeSnapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let currentRoute = routeSnapshot;

    while (true) {
      const primaryChild = currentRoute.children.find((child) => child.outlet === PRIMARY_OUTLET);
      if (!primaryChild) {
        return currentRoute;
      }
      currentRoute = primaryChild;
    }
  }

  private humanizePath(path: string): string {
    if (path === '**') {
      return 'Pagina No Encontrada';
    }

    return path
      .split('/')
      .map((segment) => this.humanizeSegment(segment))
      .filter((segment) => segment.length > 0)
      .join(' ');
  }

  private humanizeSegment(segment: string): string {
    if (!segment || segment.startsWith(':')) {
      return '';
    }

    return segment
      .split('-')
      .filter((part) => part.length > 0)
      .map((part) => {
        const normalized = part.toLowerCase();
        if (normalized === 'saas') {
          return 'SaaS';
        }
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      })
      .join(' ');
  }
}
