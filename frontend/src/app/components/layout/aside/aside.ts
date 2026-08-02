import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, catchError, filter, of } from 'rxjs';
import { AuthService, MenuItem, MeResponse, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelSettings } from '../../pages/hotel-settings/hotel-setting-model';

@Component({
  selector: 'app-aside',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './aside.html',
  styleUrls: ['./aside.css']
})
export class Aside implements OnInit, OnDestroy {
  readonly defaultBrandLogo = 'logo-white.png';
  readonly defaultBrandName = 'Wayra';

  brandLogo = this.defaultBrandLogo;
  brandName = this.defaultBrandName;

  menu: MenuItem[] = [];
  openGroups: Record<string, boolean> = {};
  currentTime = '';
  currentDate = '';
  private clockTimer?: ReturnType<typeof setInterval>;
  private routeEventsSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.startClock();
    this.loadBranding();
    this.routeEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.openCurrentRouteGroup());

    this.authService.getUserInfo().subscribe({
      next: (user: MeResponse) => {
        const rawMenu = Array.isArray(user.menu) ? user.menu : [];
        const visibleMenu = isEffectivePlatformAdmin(user)
          ? rawMenu
          : this.excludeSaasAdminItems(rawMenu);
        this.menu = this.normalizeSecurityGroup(visibleMenu);

        // Inicializa estados
        this.openGroups = {};

        this.openCurrentRouteGroup();
      },
      error: () => {
        this.menu = [];
        this.openGroups = {};
      }
    });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
    this.routeEventsSubscription?.unsubscribe();
  }

  @HostListener('window:gh-hotel-brand-updated')
  onHotelBrandingUpdated(): void {
    this.loadBranding();
  }

  toggleGroup(id: string): void {
    this.openGroups[id] = !this.openGroups[id];
  }

  isOpen(id: string): boolean {
    return !!this.openGroups[id];
  }

  isGroup(item: MenuItem): boolean {
    return Array.isArray(item.children) && item.children.length > 0;
  }

  private normalizeSecurityGroup(menu: MenuItem[]): MenuItem[] {
    const securityLabel = 'seguridad';
    const securityRoutes = new Set(['/usuarios', '/roles', '/recursos']);

    const normalized = this.normalizeMenuRoutes(menu);
    const hasSecurityGroup = normalized.some(
      (item) => (item.label || '').trim().toLowerCase() === securityLabel
    );

    const extractedItems: MenuItem[] = [];
    const extractedIds = new Set<string>();

    for (const item of normalized) {
      if (!this.isGroup(item) && item.route && securityRoutes.has(item.route)) {
        extractedItems.push(item);
        extractedIds.add(item.id);
      }
    }

    if (extractedItems.length === 0) {
      return normalized;
    }

    const filteredTopLevel = normalized.filter((item) => !extractedIds.has(item.id));

    if (hasSecurityGroup) {
      const updated = [...filteredTopLevel];
      const securityIndex = updated.findIndex(
        (item) => (item.label || '').trim().toLowerCase() === securityLabel
      );
      if (securityIndex < 0) return updated;

      const existingSecurity = { ...updated[securityIndex] };
      const existingChildren = Array.isArray(existingSecurity.children) ? [...existingSecurity.children] : [];
      const existingChildRoutes = new Set(existingChildren.map((child) => child.route || ''));

      for (const item of extractedItems) {
        if (item.route && !existingChildRoutes.has(item.route)) {
          existingChildren.push(item);
        }
      }

      existingSecurity.children = existingChildren;
      existingSecurity.icon = existingSecurity.icon || 'fa-solid fa-shield-halved';
      updated[securityIndex] = existingSecurity;
      return updated;
    }

    const firstExtractedIndex = normalized.findIndex((item) => extractedIds.has(item.id));
    const insertAt = firstExtractedIndex >= 0 ? firstExtractedIndex : filteredTopLevel.length;

    const securityGroup: MenuItem = {
      id: 'security-group',
      label: 'Seguridad',
      icon: 'fa-solid fa-shield-halved',
      route: '',
      children: extractedItems
    };

    return [
      ...filteredTopLevel.slice(0, insertAt),
      securityGroup,
      ...filteredTopLevel.slice(insertAt)
    ];
  }

  private excludeSaasAdminItems(items: MenuItem[]): MenuItem[] {
    return items
      .map((item) => ({
        ...item,
        children: Array.isArray(item.children)
          ? this.excludeSaasAdminItems(item.children)
          : item.children,
      }))
      .filter((item) => {
        if (this.isSaasAdminItem(item)) return false;
        return !Array.isArray(item.children) || item.children.length > 0 || Boolean(item.route);
      });
  }

  private isSaasAdminItem(item: MenuItem): boolean {
    const route = this.normalizeRoute(item.route);
    const label = String(item.label || '').trim().toLowerCase();
    return route.startsWith('/saas-') || label.includes('saas');
  }

  private normalizeMenuRoutes(items: MenuItem[]): MenuItem[] {
    return items.map((item) => ({
      ...item,
      route: this.normalizeRoute(item.route),
      children: Array.isArray(item.children) ? this.normalizeMenuRoutes(item.children) : item.children
    }));
  }

  private normalizeRoute(route?: string): string {
    const safe = (route || '').trim();
    if (!safe) return '';
    const withPrefix = safe.startsWith('/') ? safe : `/${safe}`;
    const withoutTrailing = withPrefix.replace(/\/+$/, '');
    return withoutTrailing || '/';
  }

  private openCurrentRouteGroup(): void {
    const currentUrl = this.normalizeRoute(this.router.url.split('?')[0].split('#')[0]);

    for (const item of this.menu) {
      if (this.isGroup(item)) {
        const hasActiveChild = (item.children || []).some(
          (child) => this.normalizeRoute(child.route) === currentUrl
        );
        if (hasActiveChild) {
          this.openGroups[item.id] = true;
        }
      }
    }
  }

  private startClock(): void {
    const locale = 'es-CO';
    const timeZone = 'America/Bogota';
    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone,
    });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone,
    });

    const updateClock = () => {
      const now = new Date();
      this.currentTime = timeFormatter.format(now);
      const date = dateFormatter.format(now);
      this.currentDate = date.charAt(0).toUpperCase() + date.slice(1);
    };

    updateClock();
    this.clockTimer = setInterval(updateClock, 1000);
  }

  private loadBranding(): void {
    this.hotelSettingsService
      .getCurrentSettings()
      .pipe(catchError(() => of(null)))
      .subscribe((settings) => {
        this.applyBranding(settings);
      });
  }

  private applyBranding(settings: HotelSettings | null): void {
    const hotelName = String(settings?.hotel_name || '').trim();
    this.brandName = hotelName || this.defaultBrandName;

    const logoPath = String(settings?.logo || '').trim();
    const resolvedLogo = this.authService.buildMediaUrl(logoPath);
    this.brandLogo = resolvedLogo || this.defaultBrandLogo;
  }
}
