import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AuthService, MeResponse } from '../../../services/auth/auth';

interface PublicFooterNavLink {
  label: string;
  sectionId: string;
}

/**
 * Footer publico canonico. Dos variantes de contenido, no dos componentes:
 * `full` (unicamente en landing, "/") preserva el bloque de marca, la
 * navegacion por anclas de la propia landing y el enlace de sesion que ya
 * existian; `compact` (las otras 6 rutas publicas) es solo la linea de
 * copyright, sin marca (el header ya la muestra en las 7 rutas) ni CTA.
 *
 * No hay enlaces legales todavia porque no existe ese contenido/ruta en el
 * producto (ver AGENTS.md, registro de esta migracion) — se agregan en una
 * tarea aparte cuando exista contenido real que enlazar.
 */
@Component({
  selector: 'app-public-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './public-footer.html',
  styleUrl: './public-footer.css',
})
export class PublicFooterComponent implements OnInit {

  private readonly authService = inject(AuthService);

  @Input() variant: 'full' | 'compact' = 'compact';

  readonly year = new Date().getFullYear();

  readonly navLinks: PublicFooterNavLink[] = [
    { label: 'Producto', sectionId: 'producto' },
    { label: 'Cómo funciona', sectionId: 'operacion' },
    { label: 'Para quién', sectionId: 'publico' },
    { label: 'FAQ', sectionId: 'faq' },
  ];

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
    // La variante compacta no muestra el enlace de sesion, asi que no hay
    // razon para pedir /api/auth/me/ en las 6 rutas que la usan.
    if (this.variant !== 'full') {
      return;
    }

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

  scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();

    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    const header = document.querySelector('.public-header') as HTMLElement | null;
    const headerOffset = header?.offsetHeight ?? 0;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const targetTop = Math.max(sectionTop - headerOffset - 12, 0);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({
      top: targetTop,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });

    window.history.replaceState(null, '', `#${sectionId}`);
  }

  trackBySection(_index: number, item: PublicFooterNavLink): string {
    return item.sectionId;
  }
}
