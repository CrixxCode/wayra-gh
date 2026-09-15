import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap, timer } from 'rxjs';
import { HotelSetupService } from '../../../services/hotel-setup';
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
  readonly setup = inject(HotelSetupService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  asideOpen = true;
  isMobile = false;

  constructor() {
    effect(() => {
      const status = this.setup.status();
      const path = this.router.url.split(/[?#]/)[0];
      if (status && !status.is_complete && !['/', '/login', '/hotel-config', '/hotel-setup', '/mi-perfil'].includes(path)) {
        void this.router.navigateByUrl(status.must_change_password ? '/mi-perfil' :
          status.can_configure ? '/hotel-config' : '/hotel-setup');
      }
    });
  }

  ngOnInit(): void {
    this.checkScreen();
    timer(this.setup.status() ? 60000 : 0, 60000).pipe(
      switchMap(() => this.setup.refresh()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  get showHotelSetupAlert(): boolean {
    return this.setup.status()?.is_complete === false;
  }

  get mustChangePassword(): boolean {
    return Boolean(this.setup.status()?.must_change_password);
  }

  get hotelSetupAlertDetail(): string {
    const status = this.setup.status();
    if (status?.verification_failed) {
      return 'No se pudo verificar la configuración. Las operaciones permanecen bloqueadas. Vuelve a verificar para continuar.';
    }
    if (this.mustChangePassword) {
      return 'Primero cambia tu contraseña. Luego completa la información obligatoria del hotel para habilitar las operaciones.';
    }
    const missing = status?.missing_fields.map((item) => item.label).join(', ');
    return `Las operaciones están bloqueadas. Falta completar: ${missing}.`;
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

  @HostListener('window:focus')
  refreshSetup(): void {
    this.setup.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
