import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

interface TourStep {
  id: string;
  route?: string;
  target?: string;
  targetRoute?: string;
  title: string;
  description: string;
  detail?: string;
}

@Component({
  selector: 'app-guided-tour',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guided-tour.html',
  styleUrl: './guided-tour.css',
})
export class GuidedTour implements OnDestroy {
  readonly steps: TourStep[] = [
    {
      id: 'dashboard',
      route: '/dashboard',
      target: 'content',
      targetRoute: '/dashboard',
      title: 'Inicio del flujo',
      description:
        'El dashboard resume ocupacion, reservas, ingresos y alertas. Es el punto de control para entender que esta pasando en el hotel antes de entrar al detalle.',
      detail:
        'La informacion que ves aqui nace de reservas, habitaciones, facturas, pagos e inventario.',
    },
    {
      id: 'navigation',
      target: 'navigation-menu',
      title: 'Modulos conectados',
      description:
        'El menu lateral agrupa las areas operativas. Cada modulo captura una parte del proceso y luego alimenta los reportes.',
      detail:
        'La ruta natural es: configuracion, habitaciones, clientes, reservas, facturacion, pagos, operacion y reportes.',
    },
    {
      id: 'hotel-settings',
      route: '/hotel-config',
      target: 'content',
      targetRoute: '/hotel-config',
      title: 'Configuracion del hotel',
      description:
        'Aqui se define la identidad del hotel, datos generales y parametros que condicionan el resto del sistema.',
      detail:
        'Antes de operar, esta informacion debe estar correcta porque aparece en facturas, reportes y contexto de trabajo.',
    },
    {
      id: 'rooms',
      route: '/habitaciones',
      target: 'content',
      targetRoute: '/habitaciones',
      title: 'Habitaciones y disponibilidad',
      description:
        'Las habitaciones son la base de la disponibilidad. Sus estados permiten saber que se puede reservar, ocupar, limpiar o mantener.',
      detail:
        'Tipos de habitacion, tarifas y amenidades complementan esta informacion para calcular opciones y precios.',
    },
    {
      id: 'clients',
      route: '/clientes',
      target: 'content',
      targetRoute: '/clientes',
      title: 'Clientes',
      description:
        'La vista de clientes centraliza datos de huespedes y empresas. Esa informacion se reutiliza cuando se crea una reserva o una factura.',
      detail:
        'Registrar bien al cliente evita duplicados y hace mas claro el historial comercial.',
    },
    {
      id: 'reservations',
      route: '/reservas',
      target: 'content',
      targetRoute: '/reservas',
      title: 'Reservas',
      description:
        'La reserva conecta cliente, fechas, habitaciones, tarifa, paquete o promocion. Desde aqui empieza el flujo operativo de la estadia.',
      detail:
        'Cuando la reserva cambia, tambien cambian disponibilidad, alertas, limpieza, facturacion y reportes.',
    },
    {
      id: 'billing',
      route: '/facturas',
      target: 'content',
      targetRoute: '/facturas',
      title: 'Facturacion',
      description:
        'Facturacion consolida cargos de alojamiento, servicios, paquetes y ajustes. Es el puente entre la operacion y el control financiero.',
      detail:
        'Una factura ordenada permite asociar pagos, notas credito y estados de cartera.',
    },
    {
      id: 'payments',
      route: '/pagos',
      target: 'content',
      targetRoute: '/pagos',
      title: 'Pagos',
      description:
        'Los pagos cierran parcial o totalmente las facturas. Esta informacion alimenta ingresos, conciliacion y reportes financieros.',
      detail:
        'Separar factura y pago ayuda a ver que se vendio, cuanto se cobro y que queda pendiente.',
    },
    {
      id: 'inventory',
      route: '/items',
      target: 'content',
      targetRoute: '/items',
      title: 'Inventario',
      description:
        'El inventario administra insumos, productos y movimientos. Sus datos explican consumos, reposiciones y costos asociados a la operacion.',
      detail:
        'Los movimientos de inventario y el inventario por habitacion muestran donde se usa cada recurso.',
    },
    {
      id: 'operations',
      route: '/tareas-limpieza',
      target: 'content',
      targetRoute: '/tareas-limpieza',
      title: 'Operacion diaria',
      description:
        'Limpieza y mantenimiento actualizan el estado real de las habitaciones. Esa informacion vuelve a disponibilidad y reservas.',
      detail:
        'Este modulo evita vender una habitacion que todavia no esta lista o que tiene una novedad pendiente.',
    },
    {
      id: 'reports',
      route: '/reportes',
      target: 'content',
      targetRoute: '/reportes',
      title: 'Reportes',
      description:
        'Los reportes consolidan lo capturado en todo el sistema: ocupacion, ingresos, egresos, actividad y rendimiento operativo.',
      detail:
        'Si un dato aparece incorrecto en un reporte, normalmente se corrige en el modulo donde se origino.',
    },
    {
      id: 'user-tools',
      target: 'user-menu',
      title: 'Herramientas de usuario',
      description:
        'Desde el menu de usuario se accede al perfil, configuracion general, tema visual y cierre de sesion.',
      detail:
        'El selector de hotel y las notificaciones del header ayudan a mantener el contexto correcto mientras se trabaja.',
    },
  ];

  active = false;
  currentIndex = 0;
  hasTarget = false;
  highlightStyle: Record<string, string> = {};
  panelStyle: Record<string, string> = {};

  private readonly completedStorageKey = 'gh_guided_tour_completed_at';
  private readonly routeEventsSubscription: Subscription;
  private measureTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {
    this.routeEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.active) {
          this.scheduleMeasure(120);
        }
      });
  }

  get currentStep(): TourStep {
    return this.steps[this.currentIndex] || this.steps[0];
  }

  get isLastStep(): boolean {
    return this.currentIndex >= this.steps.length - 1;
  }

  startFlow(): void {
    this.active = true;
    this.goToStep(0);
  }

  next(): void {
    if (this.isLastStep) {
      this.finish();
      return;
    }

    this.goToStep(this.currentIndex + 1);
  }

  previous(): void {
    if (this.currentIndex <= 0) {
      return;
    }

    this.goToStep(this.currentIndex - 1);
  }

  goToStep(index: number): void {
    this.currentIndex = this.clamp(index, 0, this.steps.length - 1);
    const route = this.currentStep.route;

    if (route && this.currentPath() !== route) {
      this.router
        .navigateByUrl(route)
        .then(() => this.scheduleMeasure(160))
        .catch(() => this.scheduleMeasure(80));
      return;
    }

    this.scheduleMeasure(80);
  }

  finish(): void {
    this.persistCompletion();
    this.close();
  }

  close(): void {
    this.active = false;
    this.hasTarget = false;
    this.highlightStyle = {};
    this.panelStyle = {};
    if (this.measureTimer) {
      clearTimeout(this.measureTimer);
      this.measureTimer = null;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.active) {
      this.scheduleMeasure(80);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.active) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
  }

  ngOnDestroy(): void {
    this.routeEventsSubscription.unsubscribe();
    if (this.measureTimer) {
      clearTimeout(this.measureTimer);
    }
  }

  private scheduleMeasure(delay: number): void {
    if (this.measureTimer) {
      clearTimeout(this.measureTimer);
    }

    this.measureTimer = setTimeout(() => {
      this.measureTimer = null;
      this.syncTargetPosition();
    }, delay);
  }

  private syncTargetPosition(): void {
    const target = this.resolveTargetElement(this.currentStep);

    if (!target) {
      this.hasTarget = false;
      this.highlightStyle = {};
      this.panelStyle = this.centerPanelStyle();
      return;
    }

    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    const rect = target.getBoundingClientRect();

    if (!this.rectCanBeHighlighted(rect)) {
      this.hasTarget = false;
      this.highlightStyle = {};
      this.panelStyle = this.centerPanelStyle();
      return;
    }

    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = this.clamp(rect.left - margin, 8, viewportWidth - 24);
    const top = this.clamp(rect.top - margin, 8, viewportHeight - 24);
    const width = this.clamp(rect.width + margin * 2, 20, viewportWidth - left - 8);
    const height = this.clamp(rect.height + margin * 2, 20, viewportHeight - top - 8);

    this.hasTarget = true;
    this.highlightStyle = {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
    };
    this.panelStyle = this.positionPanel(rect);
  }

  private resolveTargetElement(step: TourStep): HTMLElement | null {
    const candidates: Array<HTMLElement | null> = [
      step.targetRoute ? this.findTourRouteElement(step.targetRoute) : null,
      step.target ? this.findTourElement(step.target) : null,
      this.findTourElement('content'),
    ];

    for (const candidate of candidates) {
      if (candidate && this.elementCanBeUsed(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private findTourElement(value: string): HTMLElement | null {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-tour]'));
    return elements.find((element) => element.getAttribute('data-tour') === value) || null;
  }

  private findTourRouteElement(route: string): HTMLElement | null {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-route]'));
    return elements.find((element) => element.getAttribute('data-tour-route') === route) || null;
  }

  private elementCanBeUsed(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  private rectCanBeHighlighted(rect: DOMRect): boolean {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    return (
      rect.width > 8 &&
      rect.height > 8 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < viewportWidth &&
      rect.top < viewportHeight
    );
  }

  private positionPanel(rect: DOMRect): Record<string, string> {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = Math.min(420, viewportWidth - 32);
    const estimatedPanelHeight = 280;
    const verticalGap = 16;

    let top = rect.bottom + verticalGap;
    if (top + estimatedPanelHeight > viewportHeight - 16) {
      top = rect.top - estimatedPanelHeight - verticalGap;
    }
    if (top < 16) {
      top = Math.max(16, (viewportHeight - estimatedPanelHeight) / 2);
    }

    const left = this.clamp(
      rect.left + rect.width / 2 - panelWidth / 2,
      16,
      viewportWidth - panelWidth - 16
    );

    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(panelWidth)}px`,
      transform: 'none',
    };
  }

  private centerPanelStyle(): Record<string, string> {
    const panelWidth = Math.min(420, window.innerWidth - 32);
    return {
      left: '50%',
      top: '50%',
      width: `${Math.round(panelWidth)}px`,
      transform: 'translate(-50%, -50%)',
    };
  }

  private currentPath(): string {
    return this.router.url.split('?')[0].split('#')[0] || '/';
  }

  private persistCompletion(): void {
    try {
      localStorage.setItem(this.completedStorageKey, new Date().toISOString());
    } catch {
      return;
    }
  }

  private clamp(value: number, min: number, max: number): number {
    const safeMax = Math.max(min, max);
    return Math.min(Math.max(value, min), safeMax);
  }
}
