import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HotelSetupService } from '../../../services/hotel-setup';

@Component({
  selector: 'app-hotel-setup',
  template: `
    <section class="rounded-2xl border border-amber-200 bg-white p-6 mt-6">
      <h1 class="text-xl font-semibold">Operaciones bloqueadas</h1>
      <p class="mt-3">La información obligatoria del hotel debe estar completa para continuar.</p>
      <p class="mt-2">Si no puedes editar la configuración, solicita al administrador del hotel que complete los datos pendientes.</p>
      <button type="button" class="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
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
