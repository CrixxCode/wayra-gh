import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { DemoRequestService } from '../../../services/demo-request';
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
  tone: 'blue' | 'green' | 'gold' | 'purple';
};

type SaasQuickAction = {
  label: string;
  description: string;
  routerLink: string;
  icon: string;
  metric: string;
  tone: 'blue' | 'green' | 'gold' | 'purple' | 'neutral';
};

type SaasPriorityItem = {
  title: string;
  detail: string;
  routerLink: string;
  icon: string;
  tone: 'info' | 'success' | 'warn' | 'danger';
  actionLabel: string;
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
  quickActions: SaasQuickAction[] = [];
  priorityItems: SaasPriorityItem[] = [];
  lastUpdatedLabel = '';
  newDemoRequests = 0;

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  constructor(
    private authService: AuthService,
    private demoRequestService: DemoRequestService,
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
          return forkJoin({
            snapshot: this.saasDashboardService.getSnapshot(),
            demoRequests: this.demoRequestService
              .listDemoRequests({ page: 1, page_size: 1, status: 'NEW', ordering: '-created_at' })
              .pipe(
                catchError(() =>
                  of({ count: 0, next: null, previous: null, results: [] })
                )
              ),
          });
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar el panel SaaS.';
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.bindSnapshot(response.snapshot, response.demoRequests.count || 0);
        }
        this.loading = false;
      });
  }

  get healthSummary(): string {
    if (!this.hotels.length) return 'Sin hoteles con alertas criticas';
    const risk = this.hotels.filter((hotel) => hotel.health === 'risk').length;
    const warning = this.hotels.filter((hotel) => hotel.health === 'warning').length;
    return `${this.hotels.length} visibles: ${warning} en observacion, ${risk} en riesgo`;
  }

  getHealthLabel(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'Saludable';
    if (value === 'warning') return 'Observacion';
    return 'Riesgo';
  }

  getAttentionReason(hotel: SaasHotelSnapshot): string {
    return hotel.attentionReason;
  }

  getPriorityClass(tone: SaasPriorityItem['tone']): string {
    return `is-${tone}`;
  }

  private bindSnapshot(snapshot: SaasDashboardSnapshot, newDemoRequests: number): void {
    this.newDemoRequests = newDemoRequests;
    const riskHotels = snapshot.hotels.filter((hotel) => hotel.health === 'risk').length;
    const warningHotels = snapshot.hotels.filter((hotel) => hotel.health === 'warning').length;
    const incompleteContact = snapshot.hotels.filter(
      (hotel) => hotel.contactCompleteness !== 'full'
    ).length;
    const attentionHotels = snapshot.hotels
      .filter((hotel) => hotel.health !== 'healthy' || hotel.contactCompleteness !== 'full')
      .sort((a, b) => {
        const order: Record<SaasHotelSnapshot['health'], number> = {
          risk: 0,
          warning: 1,
          healthy: 2,
        };
        if (a.health !== b.health) return order[a.health] - order[b.health];
        return a.name.localeCompare(b.name, 'es');
      });

    this.kpis = [
      {
        label: 'Solicitudes nuevas',
        value: this.formatInteger(newDemoRequests),
        note: 'Pendientes por revisar',
        icon: 'fa-solid fa-inbox',
        tone: 'gold',
      },
      {
        label: 'Hoteles registrados',
        value: this.formatInteger(snapshot.totals.hotels),
        note: `${riskHotels} en riesgo, ${warningHotels} en observacion`,
        icon: 'fa-solid fa-hotel',
        tone: 'blue',
      },
      {
        label: 'Usuarios activos',
        value: this.formatInteger(snapshot.totals.activeUsers),
        note: `${this.formatInteger(snapshot.totals.users)} usuarios totales`,
        icon: 'fa-solid fa-users',
        tone: 'green',
      },
      {
        label: 'Ingresos del mes',
        value: this.currencyFormatter.format(snapshot.totals.monthRevenue),
        note: `${snapshot.totals.openInvoices} facturas pendientes`,
        icon: 'fa-solid fa-sack-dollar',
        tone: 'purple',
      },
    ];

    this.hotels = attentionHotels.slice(0, 6);
    this.countries = snapshot.countries;
    this.quickActions = this.buildQuickActions(snapshot, newDemoRequests);
    this.priorityItems = this.buildPriorityItems(
      newDemoRequests,
      riskHotels,
      warningHotels,
      incompleteContact,
      snapshot
    );
    this.lastUpdatedLabel = this.formatUpdatedAt(new Date());
  }

  private buildQuickActions(
    snapshot: SaasDashboardSnapshot,
    newDemoRequests: number
  ): SaasQuickAction[] {
    return [
      {
        label: 'Solicitudes de demo',
        description: 'Revisar interesados y convertir hoteles.',
        routerLink: '/saas-solicitudes-demo',
        icon: 'fa-solid fa-inbox',
        metric: `${this.formatInteger(newDemoRequests)} nuevas`,
        tone: 'gold',
      },
      {
        label: 'Hoteles',
        description: 'Consultar cuentas y estado de configuracion.',
        routerLink: '/saas-hoteles',
        icon: 'fa-solid fa-hotel',
        metric: `${this.formatInteger(snapshot.totals.hotels)} registrados`,
        tone: 'blue',
      },
      {
        label: 'Usuarios plataforma',
        description: 'Administrar usuarios del contexto global.',
        routerLink: '/usuarios',
        icon: 'pi pi-users',
        metric: `${this.formatInteger(snapshot.totals.activeUsers)} activos`,
        tone: 'green',
      },
      {
        label: 'Amenidades globales',
        description: 'Mantener el catalogo compartido.',
        routerLink: '/saas-amenidades',
        icon: 'fa-solid fa-star',
        metric: 'Catalogo global',
        tone: 'purple',
      },
      {
        label: 'Roles',
        description: 'Gestionar perfiles de acceso.',
        routerLink: '/roles',
        icon: 'pi pi-shield',
        metric: 'RBAC',
        tone: 'neutral',
      },
      {
        label: 'Recursos',
        description: 'Revisar permisos, menu y rutas.',
        routerLink: '/recursos',
        icon: 'pi pi-list',
        metric: 'Permisos',
        tone: 'neutral',
      },
      {
        label: 'Master Data',
        description: 'Catalogos y enums del sistema.',
        routerLink: '/master-data',
        icon: 'pi pi-database',
        metric: 'Sistema',
        tone: 'neutral',
      },
    ];
  }

  private buildPriorityItems(
    newDemoRequests: number,
    riskHotels: number,
    warningHotels: number,
    incompleteContact: number,
    snapshot: SaasDashboardSnapshot
  ): SaasPriorityItem[] {
    const items: SaasPriorityItem[] = [];

    if (newDemoRequests > 0) {
      items.push({
        title: 'Solicitudes nuevas',
        detail: `${this.formatInteger(newDemoRequests)} solicitudes esperan revision comercial.`,
        routerLink: '/saas-solicitudes-demo',
        icon: 'fa-solid fa-inbox',
        tone: 'warn',
        actionLabel: 'Revisar',
      });
    }

    if (riskHotels > 0) {
      items.push({
        title: 'Hoteles en riesgo',
        detail: `${this.formatInteger(riskHotels)} hoteles no tienen contacto operativo suficiente.`,
        routerLink: '/saas-hoteles',
        icon: 'fa-solid fa-triangle-exclamation',
        tone: 'danger',
        actionLabel: 'Ver hoteles',
      });
    }

    if (warningHotels > 0 || incompleteContact > 0) {
      items.push({
        title: 'Configuracion por completar',
        detail: `${this.formatInteger(incompleteContact)} hoteles tienen datos de contacto incompletos.`,
        routerLink: '/saas-hoteles',
        icon: 'fa-solid fa-clipboard-check',
        tone: 'info',
        actionLabel: 'Depurar',
      });
    }

    if (!items.length) {
      items.push({
        title: 'Sin pendientes criticos',
        detail: `${this.formatInteger(snapshot.quality.recentlyUpdatedHotels)} hoteles actualizados en los ultimos 30 dias.`,
        routerLink: '/saas-hoteles',
        icon: 'fa-solid fa-circle-check',
        tone: 'success',
        actionLabel: 'Ver estado',
      });
    }

    return items.slice(0, 3);
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
  }

  private formatUpdatedAt(date: Date): string {
    return date.toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  }
}
