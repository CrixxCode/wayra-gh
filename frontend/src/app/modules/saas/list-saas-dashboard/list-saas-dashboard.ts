import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { SaasDashboardService } from '../../../services/saas-dashboard';
import {
  SaasCountrySummary,
  SaasDashboardSnapshot,
  SaasHotelSnapshot,
} from '../saas-dashboard-model';

type SaasKpiCard = {
  label: string;
  value: string;
  note: string;
  icon: string;
};

@Component({
  selector: 'app-list-saas-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './list-saas-dashboard.html',
  styleUrls: ['./list-saas-dashboard.css'],
})
export class ListSaasDashboard implements OnInit {
  loading = true;
  loadError = '';
  isPlatformAdmin = false;

  kpis: SaasKpiCard[] = [];
  hotels: SaasHotelSnapshot[] = [];
  countries: SaasCountrySummary[] = [];

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  constructor(
    private authService: AuthService,
    private saasDashboardService: SaasDashboardService
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.loadError = '';

    this.authService
      .getUserInfo()
      .pipe(
        switchMap((user) => {
          this.isPlatformAdmin = isEffectivePlatformAdmin(user);
          if (!this.isPlatformAdmin) {
            return of(null);
          }
          return this.saasDashboardService.getSnapshot();
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar el panel SaaS.';
          return of(null);
        })
      )
      .subscribe((snapshot) => {
        if (snapshot) {
          this.bindSnapshot(snapshot);
        }
        this.loading = false;
      });
  }

  get healthSummary(): string {
    if (!this.hotels.length) return 'Sin hoteles para evaluar';
    const risk = this.hotels.filter((hotel) => hotel.health === 'risk').length;
    const warning = this.hotels.filter((hotel) => hotel.health === 'warning').length;
    const healthy = this.hotels.filter((hotel) => hotel.health === 'healthy').length;
    return `${healthy} saludables, ${warning} en observacion, ${risk} en riesgo`;
  }

  getHealthLabel(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'Saludable';
    if (value === 'warning') return 'Observacion';
    return 'Riesgo';
  }

  private bindSnapshot(snapshot: SaasDashboardSnapshot): void {
    this.kpis = [
      {
        label: 'Hoteles registrados',
        value: this.formatInteger(snapshot.totals.hotels),
        note: `${snapshot.quality.recentlyUpdatedHotels} actualizados en 30 dias`,
        icon: 'fa-solid fa-hotel',
      },
      {
        label: 'Usuarios activos',
        value: this.formatInteger(snapshot.totals.activeUsers),
        note: `${this.formatInteger(snapshot.totals.users)} usuarios totales`,
        icon: 'fa-solid fa-users',
      },
      {
        label: 'Reservas activas',
        value: this.formatInteger(snapshot.totals.activeReservations),
        note: `${snapshot.totals.openInvoices} facturas pendientes`,
        icon: 'fa-regular fa-calendar-check',
      },
      {
        label: 'Ingresos del mes',
        value: this.currencyFormatter.format(snapshot.totals.monthRevenue),
        note: `${snapshot.quality.hotelsWithContact} hoteles con contacto completo`,
        icon: 'fa-solid fa-sack-dollar',
      },
    ];

    this.hotels = snapshot.hotels.slice(0, 12);
    this.countries = snapshot.countries;
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
  }
}
