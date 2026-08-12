import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { MotionService } from '../../../services/motion';
import { PackagesService } from '../../../services/package';
import { PromotionsService } from '../../../services/promotion';
import { ServicesService } from '../../../services/service';
import { ListPackages } from '../../packages/list-packages/list-packages';
import { PackageI } from '../../packages/package-model';
import { ListPromotions } from '../../promotions/list-promotions/list-promotions';
import { PromotionI } from '../../promotions/promotion-model';
import { ListServices } from '../../services/list-services/list-services';
import { ServiceI } from '../../services/service-model';

export type CatalogTab = 'services' | 'packages' | 'promotions';

type TabDefinition = {
  key: CatalogTab;
  label: string;
  icon: string;
  hint: string;
};

/** Tarjeta del resumen: un número y qué hacer con él. */
export type CatalogMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  /** Pestaña a la que lleva al pulsarla. */
  tab: CatalogTab;
};

/** Días de antelación con los que se avisa que una promoción va a vencer. */
const EXPIRING_SOON_DAYS = 7;

/**
 * Catálogo comercial: servicios, paquetes y promociones en una sola pantalla.
 *
 * Las tres eran rutas separadas, y la tarea corriente —crear un servicio, meterlo en un
 * paquete y ponerle una promoción— obligaba a navegar tres veces perdiendo el contexto.
 * Es la misma dependencia encadenada que motivó consolidar habitaciones (AGENTS.md 5.14):
 *
 *     Service ──< PackageService >── Package
 *        ▲                             ▲
 *        └────────  Promotion  ────────┘
 *
 * A diferencia de habitaciones, aquí las tres entidades tienen peso propio, así que no
 * se disuelven en modales: cada una conserva su lista completa dentro de una pestaña, y
 * el contenedor aporta el encabezado, las métricas que cruzan los tres catálogos y los
 * saltos entre ellos.
 */
@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [CommonModule, ListServices, ListPackages, ListPromotions],
  templateUrl: './catalog-page.html',
  styleUrls: ['./catalog-page.css']
})
export class CatalogPage implements OnInit, OnDestroy {
  activeTab: CatalogTab = 'services';

  /** Solo la primera carga del resumen. */
  loading = true;

  /** Recarga del resumen disparada por un cambio en una pestaña. */
  refreshing = false;

  services: ServiceI[] = [];
  packages: PackageI[] = [];
  promotions: PromotionI[] = [];

  readonly tabs: TabDefinition[] = [
    {
      key: 'services',
      label: 'Servicios',
      icon: 'fa-solid fa-bell-concierge',
      hint: 'Lo que el hotel vende suelto'
    },
    {
      key: 'packages',
      label: 'Paquetes',
      icon: 'fa-solid fa-box-open',
      hint: 'Combinaciones de servicios'
    },
    {
      key: 'promotions',
      label: 'Promociones',
      icon: 'fa-solid fa-tags',
      hint: 'Descuentos sobre servicios y paquetes'
    }
  ];

  private revealFrame: number | null = null;

  /** La entrada animada es de bienvenida: se ejecuta una vez, no en cada recarga. */
  private revealed = false;

  constructor(
    private servicesService: ServicesService,
    private packagesService: PackagesService,
    private promotionsService: PromotionsService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // La pestaña viaja en la URL para que un enlace compartido abra donde corresponde.
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // --------------------------------------------------------------------- datos

  /**
   * Resumen de los tres catálogos.
   *
   * Las tres peticiones se sirven del mismo cache-aside que usan las listas de las
   * pestañas, así que abrir la pantalla no duplica el tráfico: la primera pestaña
   * encuentra su respuesta ya cargada.
   */
  loadSummary(forceRefresh = false, silent = false): void {
    if (silent) this.refreshing = true;
    else this.loading = true;

    forkJoin({
      services: this.servicesService
        .listServices({ forceRefresh })
        .pipe(catchError(() => of([] as ServiceI[]))),
      packages: this.packagesService
        .listPackages({ forceRefresh })
        .pipe(catchError(() => of([] as PackageI[]))),
      promotions: this.promotionsService
        .listPromotions({ forceRefresh })
        .pipe(catchError(() => of([] as PromotionI[])))
    }).subscribe(({ services, packages, promotions }) => {
      this.loading = false;
      this.refreshing = false;
      this.services = services;
      this.packages = packages;
      this.promotions = promotions;

      // Solo la primera carga se anima. Reanimar en cada recarga hacia que activar o
      // eliminar un elemento se viera como si la pantalla se recargara entera.
      if (!this.revealed) {
        this.revealed = true;
        this.scheduleReveal();
      }
    });
  }

  // ------------------------------------------------------------------ pestañas

  selectTab(tab: CatalogTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true
    });

    this.scheduleReveal();
  }

  tabCount(tab: CatalogTab): number {
    if (tab === 'services') return this.services.length;
    if (tab === 'packages') return this.packages.length;
    return this.promotions.length;
  }

  // ------------------------------------------------------------------ métricas

  get activeServices(): number {
    return this.services.filter((service) => service.is_active !== false).length;
  }

  get activePackages(): number {
    return this.packages.filter((item) => item.is_active !== false).length;
  }

  /** Vigente: activa y dentro de su rango de fechas. */
  get livePromotions(): PromotionI[] {
    const today = this.todayKey();
    return this.promotions.filter((promotion) => {
      if (promotion.is_active === false) return false;
      if (promotion.start_date && promotion.start_date > today) return false;
      if (promotion.end_date && promotion.end_date < today) return false;
      return true;
    });
  }

  /** Vigentes que se acaban esta semana: es lo único accionable del resumen. */
  get expiringPromotions(): PromotionI[] {
    const today = this.todayKey();
    const limit = this.dateKey(this.addDays(new Date(), EXPIRING_SOON_DAYS));

    return this.livePromotions.filter(
      (promotion) => !!promotion.end_date && promotion.end_date >= today && promotion.end_date <= limit
    );
  }

  /** Servicios que no están en ningún paquete: catálogo que no se está aprovechando. */
  get orphanServices(): number {
    const used = new Set<number>();
    for (const item of this.packages) {
      for (const line of item.package_services || []) {
        if (typeof line.service === 'number') used.add(line.service);
      }
    }

    return this.services.filter(
      (service) => service.is_active !== false && !used.has(service.id)
    ).length;
  }

  get metrics(): CatalogMetric[] {
    const expiring = this.expiringPromotions.length;
    const orphans = this.orphanServices;

    return [
      {
        key: 'services',
        label: 'Servicios activos',
        value: String(this.activeServices),
        note: `de ${this.services.length} en catalogo`,
        icon: 'fa-solid fa-bell-concierge',
        tone: 'brand',
        tab: 'services'
      },
      {
        key: 'packages',
        label: 'Paquetes activos',
        value: String(this.activePackages),
        note: `de ${this.packages.length} armados`,
        icon: 'fa-solid fa-box-open',
        tone: 'success',
        tab: 'packages'
      },
      {
        key: 'live',
        label: 'Promociones vigentes',
        value: String(this.livePromotions.length),
        note: expiring ? `${expiring} vence(n) esta semana` : 'Ninguna vence esta semana',
        icon: 'fa-solid fa-tags',
        tone: expiring ? 'warning' : 'success',
        tab: 'promotions'
      },
      {
        key: 'orphans',
        label: 'Servicios sin paquete',
        value: String(orphans),
        note: orphans ? 'Se venden solo sueltos' : 'Todos estan en algun paquete',
        icon: 'fa-solid fa-link-slash',
        tone: orphans ? 'warning' : 'success',
        tab: 'services'
      }
    ];
  }

  trackByTab(_: number, tab: TabDefinition): string {
    return tab.key;
  }

  trackByMetric(_: number, metric: CatalogMetric): string {
    return metric.key;
  }

  /**
   * Un cambio en una pestaña afecta a las métricas y a las otras dos.
   *
   * Va en silencio: la lista que disparó el cambio ya muestra su propio indicador, y
   * las métricas se actualizan en su sitio cuando llegan los datos.
   */
  onCatalogChanged(): void {
        // Sin forzar: la escritura ya invalido el cache desde el servicio, asi que esto
    // va al servidor igual. Forzarlo ademas anularia la deduplicacion de peticiones
    // en vuelo y la lista de la pestaña pediria lo mismo por segunda vez.
    this.loadSummary(false, true);
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    // Fuera de la zona de Angular: GSAP anima con requestAnimationFrame y dentro
    // dispararia una deteccion de cambios por frame.
    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.catalog-metric'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.catalog-tab'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26
        });
        this.motion.reveal(host.querySelectorAll('.catalog-panel'), {
          stagger: 0,
          y: 12,
          delay: 0.06
        });
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private isTab(value: string): value is CatalogTab {
    return value === 'services' || value === 'packages' || value === 'promotions';
  }

  private todayKey(): string {
    return this.dateKey(new Date());
  }

  private dateKey(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }
}
