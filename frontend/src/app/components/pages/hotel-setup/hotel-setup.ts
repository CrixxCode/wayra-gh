import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HotelSetupService } from '../../../services/hotel-setup';

@Component({
  selector: 'app-hotel-setup',
  template: `
    <section class="gh-panel p-6 mt-6">
      <h1 class="text-xl font-semibold">Operaciones bloqueadas</h1>
      <p class="mt-3">La información obligatoria del hotel debe estar completa para continuar.</p>
      <p class="mt-2">Si no puedes editar la configuración, solicita al administrador del hotel que complete los datos pendientes.</p>
      <button type="button" class="gh-mbtn gh-mbtn-dark mt-4 disabled:opacity-50"
        [disabled]="checking" (click)="retry()">{{ checking ? 'Verificando…' : 'Volver a verificar' }}</button>
    </section>
  `,
})
export class HotelSetupPage {
  private setup = inject(HotelSetupService);
  private router = inject(Router);
  checking = false;

  retry(): void {
    this.checking = true;
    this.setup.refresh().subscribe((status) => {
      this.checking = false;
      if (status.is_complete) void this.router.navigateByUrl('/dashboard');
      else if (status.can_configure) void this.router.navigateByUrl('/hotel-config');
    });
  }
}
