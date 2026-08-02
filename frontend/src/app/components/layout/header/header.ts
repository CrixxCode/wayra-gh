import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { NotificationI, NotificationService } from '../../../services/notification';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelContextService } from '../../../services/hotel-context';
import { HotelSettings } from '../../pages/hotel-settings/hotel-setting-model';
import { LogoutScreen } from '../../pages/logout-screen/logout-screen';

type NotificationTone = 'warning' | 'info' | 'success';

interface HeaderNotification {
  id: number | 'none';
  title: string;
  detail: string;
  age: string;
  icon: string;
  tone: NotificationTone;
  route: string;
  unread: boolean;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule, LogoutScreen],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header implements OnInit {
  @Output() menuToggle = new EventEmitter<void>();
  @Output() tourStart = new EventEmitter<void>();

  menuOpen = false;
  notificationsOpen = false;
  notificationsLoading = false;
  notificationsError = '';
  notifications: HeaderNotification[] = [];
  darkMode = false;
  showLogout = false;
  userName = '';
  userRole = '';
  userAvatar = 'avatar/default-avatar.png';
  unreadCountSnapshot = 0;
  hotelOptions: HotelSettings[] = [];
  selectedHotelSettingsId: number | null = null;
  hotelSelectorLoading = false;
  isGlobalAdmin = false;

  private readonly defaultAvatar = 'avatar/default-avatar.png';
  private readonly logoutAnimationDuration = 1000;
  private readonly themePrimaryStorageKey = 'gh_theme_primary';
  private readonly themeSecondaryStorageKey = 'gh_theme_secondary';
  private readonly darkModeStorageKey = 'gh_dark_mode';
  private readonly defaultThemePrimaryColor = '#0f1f41';
  private readonly defaultThemeSecondaryColor = '#112853';

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationsService: NotificationService,
    private hotelSettingsService: HotelSettingsService,
    private hotelContextService: HotelContextService
  ) {}

  get unreadCount(): number {
    if (!this.notifications.length) {
      return this.unreadCountSnapshot;
    }
    return this.notifications.reduce((sum, notification) => sum + (notification.unread ? 1 : 0), 0);
  }

  get readCount(): number {
    return this.notifications.reduce((sum, notification) => sum + (notification.unread ? 0 : 1), 0);
  }

  get actionableNotificationCount(): number {
    return this.notifications.filter((notification) => notification.id !== 'none').length;
  }

  ngOnInit(): void {
    this.darkMode = this.resolveStoredDarkMode();
    this.applyDarkModeClass();
    this.applyStoredThemeCustomization();
    this.loadUserInfo();
    this.loadUnreadCount();
  }

  loadUserInfo(): void {
    this.authService.getUserInfo().subscribe({
      next: (res: any) => {
        this.userName = res.username || 'Usuario';
        this.userRole = this.resolveUserRole(res);
        const resolvedAvatar = this.authService.buildMediaUrl(res.avatar);
        this.userAvatar = resolvedAvatar || this.defaultAvatar;
        this.initializeHotelSelector(res);
        this.loadUnreadCount();
      },
      error: () => {
        this.userName = 'Invitado';
        this.userRole = 'Sin rol';
        this.userAvatar = this.defaultAvatar;
        this.unreadCountSnapshot = 0;
      },
    });
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      this.notificationsOpen = false;
    }
  }

  startGuidedTour(): void {
    this.menuOpen = false;
    this.notificationsOpen = false;
    this.tourStart.emit();
  }

  onHotelSelectionChange(): void {
    const selectedId = Number(this.selectedHotelSettingsId || 0);
    if (!Number.isFinite(selectedId) || selectedId <= 0) return;

    this.hotelContextService.selectHotel(selectedId);
    window.location.reload();
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
    if (this.notificationsOpen) {
      this.menuOpen = false;
      this.loadNotifications();
    }
  }

  refreshNotifications(): void {
    this.loadNotifications();
  }

  markNotificationsAsRead(): void {
    const hasUnread = this.notifications.some(
      (notification) => notification.id !== 'none' && notification.unread
    );
    if (!hasUnread) return;

    this.notifications = this.notifications.map((notification) =>
      notification.id === 'none' ? notification : { ...notification, unread: false }
    );
    this.unreadCountSnapshot = 0;

    this.notificationsService
      .markAllAsRead()
      .pipe(catchError(() => of({ updated: 0 })))
      .subscribe();
  }

  openNotification(notification: HeaderNotification): void {
    if (notification.id !== 'none' && notification.unread) {
      this.notifications = this.notifications.map((current) =>
        current.id === notification.id ? { ...current, unread: false } : current
      );
      this.unreadCountSnapshot = Math.max(0, this.unreadCountSnapshot - 1);
      this.notificationsService
        .markAsRead(Number(notification.id))
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.notificationsOpen = false;
    void this.router.navigate([notification.route]);
  }

  openAllNotifications(): void {
    this.markNotificationsAsRead();
    this.notificationsOpen = false;
    void this.router.navigate(['/actividad']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      this.menuOpen = false;
    }
    if (!target.closest('.notifications-menu')) {
      this.notificationsOpen = false;
    }
  }

  openProfile(): void {
    this.menuOpen = false;
    this.notificationsOpen = false;
    void this.router.navigate(['/mi-perfil']);
  }

  openSettings(): void {
    this.menuOpen = false;
    this.notificationsOpen = false;
    void this.router.navigate(['/hotel-config']);
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.persistDarkMode();
    this.applyDarkModeClass();
    this.menuOpen = false;
    this.notificationsOpen = false;
  }

  logout(): void {
    this.menuOpen = false;
    this.notificationsOpen = false;
    this.showLogout = true;
    this.hotelContextService.clearSelection();
    this.authService.logout().subscribe({
      next: () => this.finishLogoutTransition(),
      error: () => this.finishLogoutTransition(),
    });
  }

  private finishLogoutTransition(): void {
    setTimeout(() => {
      this.router.navigate(['/login']).finally(() => {
        this.showLogout = false;
      });
    }, this.logoutAnimationDuration);
  }

  private initializeHotelSelector(user: any): void {
    const assignedHotelId = Number(user?.hotel_settings?.id || 0);
    if (assignedHotelId > 0) {
      const previousHotelId = this.hotelContextService.selectedHotelSettingsId;
      this.isGlobalAdmin = false;
      this.selectedHotelSettingsId = assignedHotelId;
      this.hotelOptions = [user.hotel_settings as HotelSettings];
      this.hotelContextService.selectHotel(assignedHotelId);
      if (previousHotelId && previousHotelId !== assignedHotelId) {
        window.location.reload();
      }
      return;
    }

    this.isGlobalAdmin = isEffectivePlatformAdmin(user);
    if (!this.isGlobalAdmin) {
      this.hotelOptions = [];
      this.selectedHotelSettingsId = null;
      this.hotelContextService.clearSelection();
      return;
    }

    this.hotelSelectorLoading = true;
    this.hotelSettingsService
      .listSettings()
      .pipe(catchError(() => of([] as HotelSettings[])))
      .subscribe((hotels) => {
        this.hotelOptions = [...hotels]
          .filter((hotel) => Number(hotel.id || 0) > 0)
          .sort((left, right) =>
            String(left.hotel_name || '').localeCompare(String(right.hotel_name || ''), 'es-CO')
          );

        const storedId = this.hotelContextService.selectedHotelSettingsId;
        const storedSelectionIsValid = this.hotelOptions.some(
          (hotel) => Number(hotel.id) === storedId
        );
        const fallbackId = Number(this.hotelOptions[0]?.id || 0) || null;
        const selectedId = storedSelectionIsValid ? storedId : fallbackId;

        this.selectedHotelSettingsId = selectedId;
        this.hotelSelectorLoading = false;

        if (selectedId && selectedId !== storedId) {
          this.hotelContextService.selectHotel(selectedId);
          window.location.reload();
        }
      });
  }

  private applyStoredThemeCustomization(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const normalizeColor = (value: string | null, fallback: string): string => {
      const candidate = String(value || '').trim();
      return /^#[\da-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
    };

    const resolveOnBrandColor = (hexColor: string): string => {
      const normalized = normalizeColor(hexColor, this.defaultThemePrimaryColor).slice(1);
      const red = parseInt(normalized.slice(0, 2), 16) / 255;
      const green = parseInt(normalized.slice(2, 4), 16) / 255;
      const blue = parseInt(normalized.slice(4, 6), 16) / 255;
      const linearize = (channel: number): number =>
        channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

      const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
      return luminance > 0.45 ? '#0f172a' : '#ffffff';
    };

    const primary = normalizeColor(localStorage.getItem(this.themePrimaryStorageKey), this.defaultThemePrimaryColor);
    const secondary = normalizeColor(localStorage.getItem(this.themeSecondaryStorageKey), this.defaultThemeSecondaryColor);

    const root = document.documentElement;
    root.style.setProperty('--gh-brand', primary);
    root.style.setProperty('--gh-brand-hover', secondary);
    root.style.setProperty('--gh-brand-secondary', secondary);
    root.style.setProperty('--gh-on-brand', resolveOnBrandColor(primary));
  }

  private loadNotifications(): void {
    this.notificationsLoading = true;
    this.notificationsError = '';

    this.notificationsService
      .listNotifications({ ordering: '-created_at' })
      .pipe(catchError(() => of([] as NotificationI[])))
      .subscribe({
        next: (rows) => {
          this.notifications = this.mapNotifications(rows);
          this.unreadCountSnapshot = this.notifications.reduce(
            (sum, notification) => sum + (notification.unread ? 1 : 0),
            0
          );
          this.notificationsLoading = false;
        },
        error: () => {
          this.notificationsLoading = false;
          this.notificationsError = 'No fue posible cargar las notificaciones.';
      },
    });
  }

  private loadUnreadCount(): void {
    this.notificationsService
      .getUnreadCount()
      .pipe(catchError(() => of(0)))
      .subscribe((count) => {
        this.unreadCountSnapshot = Math.max(0, Number(count || 0));
      });
  }

  private mapNotifications(rows: NotificationI[]): HeaderNotification[] {
    const mapped = rows.slice(0, 20).map((row) => this.toHeaderNotification(row));
    if (mapped.length > 0) return mapped;

    return [
      {
        id: 'none',
        title: 'Sin alertas activas',
        detail: 'No hay notificaciones pendientes por ahora.',
        age: 'Ahora',
        icon: 'fa-solid fa-circle-check',
        tone: 'success',
        route: '/dashboard',
        unread: false,
      },
    ];
  }

  private toHeaderNotification(row: NotificationI): HeaderNotification {
    const type = String(row.notification_type || '').toUpperCase();
    const priority = String(row.priority || '').toUpperCase();
    const icon = this.resolveNotificationIcon(type);
    const tone = this.resolveNotificationTone(priority);
    const route = this.resolveNotificationRoute(row.action_url);
    return {
      id: row.id,
      title: row.title || 'Notificacion',
      detail: row.message || '',
      age: this.relativeFromNow(row.created_at),
      icon,
      tone,
      route,
      unread: !row.is_read,
    };
  }

  private resolveNotificationTone(priority: string): NotificationTone {
    if (priority === 'CRITICAL' || priority === 'HIGH') return 'warning';
    if (priority === 'LOW') return 'success';
    return 'info';
  }

  private resolveNotificationIcon(notificationType: string): string {
    switch (notificationType) {
      case 'RESERVATION':
        return 'fa-regular fa-calendar-check';
      case 'ROOM':
        return 'fa-solid fa-bed';
      case 'CLEANING':
        return 'fa-solid fa-broom';
      case 'MAINTENANCE':
        return 'fa-solid fa-screwdriver-wrench';
      case 'PAYMENT':
        return 'fa-regular fa-credit-card';
      case 'INVOICE':
        return 'fa-solid fa-file-invoice-dollar';
      case 'INVENTORY':
        return 'fa-solid fa-boxes-stacked';
      case 'USER':
        return 'fa-regular fa-user';
      case 'FINANCE':
        return 'fa-solid fa-wallet';
      case 'REPORT':
        return 'fa-solid fa-chart-line';
      default:
        return 'fa-regular fa-bell';
    }
  }

  private resolveNotificationRoute(actionUrl?: string | null): string {
    const normalized = String(actionUrl || '').trim();
    if (!normalized) return '/actividad';
    if (normalized.startsWith('/')) return normalized;
    return '/actividad';
  }

  private relativeFromNow(value?: Date | string | null): string {
    if (!value) return 'Reciente';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Reciente';
    const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.round(hours / 24)} d`;
  }

  private resolveUserRole(user: any): string {
    if (user?.role) {
      return user.role;
    }
    const firstRole = Array.isArray(user?.roles) ? user.roles[0]?.name : null;
    return firstRole || 'Usuario';
  }

  private resolveStoredDarkMode(): boolean {
    if (typeof window === 'undefined') return false;
    const raw = String(localStorage.getItem(this.darkModeStorageKey) || '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
  }

  private persistDarkMode(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.darkModeStorageKey, this.darkMode ? '1' : '0');
  }

  private applyDarkModeClass(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('my-app-dark', this.darkMode);
    document.documentElement.classList.toggle('dark', this.darkMode);
  }
}
