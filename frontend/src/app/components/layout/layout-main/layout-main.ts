import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService, isEffectivePlatformAdmin, MeResponse } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelSettings } from '../../pages/hotel-settings/hotel-setting-model';
import { GuidedTour } from '../../tutorial/guided-tour/guided-tour';
import { Aside } from '../aside/aside';
import { Content } from '../content/content';
import { Header } from '../header/header';

@Component({
  selector: 'app-layout-main',
  imports: [Header, Aside, Content, CommonModule, GuidedTour, RouterLink],
  templateUrl: './layout-main.html',
  styleUrl: './layout-main.css',
})
export class LayoutMain implements OnInit {
  private readonly firstHotelSetupAlertKey = 'gh_first_hotel_setup_alert';

  asideOpen = true;
  isMobile = false;
  showHotelSetupAlert = false;
  hotelSetupAlertLoading = false;
  mustChangePassword = false;
  missingHotelSetupFields: string[] = [];

  constructor(
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService
  ) {}

  ngOnInit(): void {
    this.checkScreen();
    this.loadHotelSetupAlert();
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
    this.showHotelSetupAlert = false;
    sessionStorage.removeItem(this.firstHotelSetupAlertKey);
  }

  get hotelSetupAlertDetail(): string {
    if (this.mustChangePassword) {
      return 'Primero cambia tu contraseña. Luego completa la información operativa del hotel.';
    }

    if (this.missingHotelSetupFields.length > 0) {
      return `Falta revisar: ${this.missingHotelSetupFields.join(', ')}.`;
    }

    return 'Revisa que la información general, ubicación, contacto y horarios del hotel esté completa.';
  }

  private loadHotelSetupAlert(): void {
    if (sessionStorage.getItem(this.firstHotelSetupAlertKey) !== '1') return;

    this.hotelSetupAlertLoading = true;
    this.authService
      .getUserInfo()
      .pipe(
        switchMap((user) => {
          this.mustChangePassword = Boolean(user.must_change_password);

          if (this.shouldSkipHotelSetupAlert(user)) {
            sessionStorage.removeItem(this.firstHotelSetupAlertKey);
            return of(null);
          }

          this.showHotelSetupAlert = true;

          if (this.mustChangePassword) {
            return of(null);
          }

          return this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)));
        }),
        catchError(() => of(null))
      )
      .subscribe((settings) => {
        this.hotelSetupAlertLoading = false;

        if (settings) {
          this.missingHotelSetupFields = this.resolveMissingHotelSetupFields(settings);
        }
      });
  }

  private shouldSkipHotelSetupAlert(user: MeResponse): boolean {
    return isEffectivePlatformAdmin(user) || !user.hotel_settings;
  }

  private resolveMissingHotelSetupFields(settings: HotelSettings): string[] {
    const requiredFields: Array<[keyof HotelSettings, string]> = [
      ['hotel_name', 'nombre'],
      ['address', 'dirección'],
      ['country', 'país'],
      ['state', 'departamento'],
      ['city', 'ciudad'],
      ['primary_phone', 'teléfono'],
      ['general_email', 'correo'],
      ['check_in_time', 'check-in'],
      ['check_out_time', 'check-out'],
    ];

    return requiredFields
      .filter(([field]) => !String(settings[field] ?? '').trim())
      .map(([, label]) => label);
  }
}
