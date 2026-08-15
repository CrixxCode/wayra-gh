import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { HotelSetupStatus, HotelSetupStatusService } from '../../../services/hotel-setup-status';
import { GuidedTour } from '../../tutorial/guided-tour/guided-tour';
import { Aside } from '../aside/aside';
import { Content } from '../content/content';
import { Header } from '../header/header';

@Component({
  selector: 'app-layout-main',
  imports: [Header, Aside, Content, CommonModule, GuidedTour],
  templateUrl: './layout-main.html',
  styleUrl: './layout-main.css',
})
export class LayoutMain implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  asideOpen = true;
  isMobile = false;
  showHotelSetupAlert = false;
  missingHotelSetupFields: string[] = [];
  canManageHotelSetup = false;

  private hotelSetupStatus: HotelSetupStatus | null = null;
  private hotelSetupAlertDismissed = false;

  constructor(
    private router: Router,
    private hotelSetupStatusService: HotelSetupStatusService,
  ) {}

  ngOnInit(): void {
    this.checkScreen();
    this.watchRouteChanges();
    this.loadHotelSetupAlert();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleAside(): void {
    this.asideOpen = !this.asideOpen;
  }

  isAsideOpen(): boolean {
    return this.asideOpen;
  }

  @HostListener('window:resize')
  checkScreen(): void {
    this.isMobile = window.innerWidth < 768;
    if (this.isMobile) this.asideOpen = false;
  }

  dismissHotelSetupAlert(): void {
    this.hotelSetupAlertDismissed = true;
    this.showHotelSetupAlert = false;
  }

  goToHotelSettings(): void {
    this.showHotelSetupAlert = false;
    void this.router.navigate(['/hotel-config']);
  }

  get hotelSetupAlertDetail(): string {
    if (!this.hotelSetupStatus?.settingsFound) {
      return 'Aun no se ha creado la configuracion inicial del hotel.';
    }

    if (this.missingHotelSetupFields.length > 0) {
      return `Falta completar: ${this.missingHotelSetupFields.join(', ')}.`;
    }

    return 'Revisa la informacion general, ubicacion, contacto, horarios y estructura del hotel.';
  }

  private watchRouteChanges(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        if (this.isHotelSettingsRoute()) {
          this.hotelSetupAlertDismissed = false;
          this.showHotelSetupAlert = false;
          return;
        }

        this.loadHotelSetupAlert();
      });
  }

  private loadHotelSetupAlert(): void {
    if (this.isHotelSettingsRoute()) {
      this.showHotelSetupAlert = false;
      return;
    }

    this.hotelSetupStatusService
      .getCurrentStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe((status) => {
        this.hotelSetupStatus = status;
        this.canManageHotelSetup = status.canManageSettings;
        this.missingHotelSetupFields = status.missingFields;
        this.syncHotelSetupAlertVisibility();
      });
  }

  private syncHotelSetupAlertVisibility(): void {
    this.showHotelSetupAlert = Boolean(
      this.hotelSetupStatus?.shouldPrompt &&
      !this.hotelSetupAlertDismissed &&
      !this.isHotelSettingsRoute(),
    );
  }

  private isHotelSettingsRoute(): boolean {
    const [path] = String(this.router.url || '').split('?');
    return path.replace(/\/+$/, '') === '/hotel-config';
  }
}
