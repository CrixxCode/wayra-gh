import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AuthService, MeResponse } from '../../../services/auth/auth';

interface PublicHeaderNavItem {
  label: string;
  route: string;
}

/**
 * Header publico canonico: logo, navegacion, sesion y menu movil compartidos por
 * todas las rutas publicas de Wayra (landing, hoteles aliados, reserva y check-in
 * online). Altura, ancho del contenedor, z-index, blur, sombra y breakpoint viven
 * unicamente aqui para que ninguna pagina vuelva a duplicarlos con valores propios.
 *
 * El estado activo de cada enlace se deriva de RouterLinkActive (no de un input
 * calculado por cada pagina), y el estado de sesion reutiliza AuthService con el
 * mismo patron cache-then-verify que ya usaba landing.ts, para no crear una
 * segunda fuente de verdad de autenticacion.
 */
@Component({
  selector: 'app-public-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './public-header.html',
  styleUrl: './public-header.css',
})
export class PublicHeaderComponent implements OnInit {

  private readonly authService = inject(AuthService);

  // La unica llamada a la accion final del header (demo, etc.) que varia por
  // pagina; cuando no se provee, el boton simplemente no se renderiza.
  @Input() ctaLabel: string | null = null;
  @Output() ctaTriggered = new EventEmitter<void>();

  readonly navItems: PublicHeaderNavItem[] = [
    { label: 'Hoteles aliados', route: '/hoteles-aliados' },
    { label: 'Reservar', route: '/reservar' },
    { label: 'Check-in online', route: '/check-in-online' },
  ];

  mobileMenuOpen = false;

  sessionAuthenticated = this.authService.getCachedSessionState();

  get sessionActionRoute(): string {
    return this.sessionAuthenticated ? '/dashboard' : '/login';
  }

  get sessionActionLabel(): string {
    return this.sessionAuthenticated ? 'Ir al panel' : 'Iniciar sesión';
  }

  get sessionActionIcon(): string {
    return this.sessionAuthenticated ? 'pi pi-chart-line' : 'pi pi-sign-in';
  }

  ngOnInit(): void {
    this.authService
      .getUserInfo()
      .pipe(
        catchError(() => {
          this.authService.rememberSessionState(false);
          return of(null);
        })
      )
      .subscribe((user: MeResponse | null) => {
        this.sessionAuthenticated = Boolean(user?.username);
        this.authService.rememberSessionState(this.sessionAuthenticated);
      });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  onCtaClick(event: Event): void {
    event.preventDefault();
    this.closeMobileMenu();
    this.ctaTriggered.emit();
  }

  trackByRoute(_index: number, item: PublicHeaderNavItem): string {
    return item.route;
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
  }
}
