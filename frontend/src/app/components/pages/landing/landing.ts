import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { DemoRequestPayload, DemoRequestService } from '../../../services/demo-request';

interface NavLink {
  label: string;
  sectionId: string;
}

interface HeroStat {
  value: string;
  label: string;
  detail: string;
  icon: string;
}

interface PainPoint {
  title: string;
  description: string;
  icon: string;
}

interface SolutionStep {
  title: string;
  description: string;
}

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

interface BenefitItem {
  title: string;
  description: string;
  icon: string;
}

interface AudienceItem {
  title: string;
  detail: string;
  icon: string;
}

type DemoStep = 'hotel' | 'requester';
type DemoFormSection = 'hotel' | 'requester';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingPage implements OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly demoRequestService = inject(DemoRequestService);
  private previousBodyOverflow = '';

  readonly year = new Date().getFullYear();

  readonly hotelTypes = ['Hotel', 'Hostal', 'Apartahotel', 'Alojamiento turistico', 'Otro'];

  readonly demoForm = this.formBuilder.group({
    hotel: this.formBuilder.group({
      hotelName: ['', [Validators.required, Validators.minLength(2)]],
      hotelType: ['', Validators.required],
      city: ['', Validators.required],
      rooms: [null, [Validators.required, Validators.min(1)]],
      website: [''],
    }),
    requester: this.formBuilder.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      jobTitle: ['', Validators.required],
      phone: ['', [Validators.required, Validators.minLength(7)]],
      message: [''],
    }),
  });

  readonly navLinks: NavLink[] = [
    { label: 'Problemas', sectionId: 'problemas' },
    { label: 'Solucion', sectionId: 'solucion' },
    { label: 'Funcionalidades', sectionId: 'funcionalidades' },
    { label: 'Beneficios', sectionId: 'beneficios' },
    { label: 'Para quien', sectionId: 'publico' },
  ];

  readonly heroStats: HeroStat[] = [
    {
      value: 'Todo en uno',
      label: 'Operacion centralizada',
      detail: 'Reservas, habitaciones, pagos, servicios e inventario conectados.',
      icon: 'pi pi-objects-column',
    },
    {
      value: 'Menos reprocesos',
      label: 'Flujos estandarizados',
      detail: 'Check-in, facturacion y reportes en un mismo ciclo operativo.',
      icon: 'pi pi-sync',
    },
    {
      value: 'Control diario',
      label: 'Datos para decidir',
      detail: 'Visualiza ocupacion, ingresos y rendimiento de forma clara.',
      icon: 'pi pi-chart-line',
    },
  ];

  readonly painPoints: PainPoint[] = [
    {
      title: 'Reservas desorganizadas',
      description:
        'Confirmaciones en varios canales y datos duplicados generan sobreventas o huecos de ocupacion.',
      icon: 'pi pi-calendar-times',
    },
    {
      title: 'Control manual de habitaciones',
      description:
        'Actualizar estados en hojas de calculo retrasa la operacion de recepcion y housekeeping.',
      icon: 'pi pi-building',
    },
    {
      title: 'Errores en pagos y facturacion',
      description:
        'Cobros incompletos, notas de ajuste dispersas y conciliacion lenta afectan el flujo de caja.',
      icon: 'pi pi-credit-card',
    },
    {
      title: 'Reportes poco accionables',
      description:
        'Sin indicadores confiables es dificil anticipar temporadas, costos y demanda real.',
      icon: 'pi pi-chart-bar',
    },
    {
      title: 'Inventario y servicios sin trazabilidad',
      description:
        'No saber consumos por habitacion o servicio impacta costos y calidad de atencion.',
      icon: 'pi pi-box',
    },
  ];

  readonly solutionSteps: SolutionStep[] = [
    {
      title: 'Centraliza la operacion de tu hotel en una sola plataforma',
      description:
        'Wayra concentra recepcion, caja, inventario y administracion para que tu equipo trabaje con el mismo dato.',
    },
    {
      title: 'Automatiza tareas clave sin perder control',
      description:
        'Disponibilidad, cargos, pagos y estados operativos se actualizan en tiempo real entre areas.',
    },
    {
      title: 'Toma decisiones con reportes claros',
      description:
        'Consulta indicadores de ocupacion, ingresos y servicios para ajustar estrategia comercial y operativa.',
    },
  ];

  readonly features: FeatureItem[] = [
    {
      title: 'Gestion de reservas',
      description: 'Registra, modifica y da seguimiento a reservas con estado y trazabilidad completa.',
      icon: 'pi pi-calendar',
    },
    {
      title: 'Habitaciones y disponibilidad',
      description: 'Controla tipos, tarifas, ocupacion y estados operativos por habitacion.',
      icon: 'pi pi-home',
    },
    {
      title: 'Clientes y huespedes',
      description: 'Consolida datos de clientes para check-in agil y mejor servicio.',
      icon: 'pi pi-id-card',
    },
    {
      title: 'Pagos, facturas y notas de credito',
      description: 'Administra cobros, saldos y documentos de forma ordenada y auditable.',
      icon: 'pi pi-wallet',
    },
    {
      title: 'Servicios, paquetes y promociones',
      description: 'Configura ofertas y servicios extra para aumentar el valor por reserva.',
      icon: 'pi pi-megaphone',
    },
    {
      title: 'Inventario y control financiero',
      description: 'Monitorea entradas, salidas y costos para evitar quiebres o sobrecostos.',
      icon: 'pi pi-box',
    },
    {
      title: 'Reportes administrativos',
      description: 'Analiza ocupacion, ingresos y actividad con informacion lista para gestion.',
      icon: 'pi pi-chart-line',
    },
    {
      title: 'Roles, usuarios y permisos',
      description: 'Protege la operacion con accesos por rol y control por area.',
      icon: 'pi pi-shield',
    },
  ];

  readonly benefits: BenefitItem[] = [
    {
      title: 'Ahorro de tiempo operativo',
      description: 'Tu equipo dedica menos tiempo a tareas manuales y mas tiempo al huesped.',
      icon: 'pi pi-clock',
    },
    {
      title: 'Menos errores diarios',
      description: 'Procesos estandarizados reducen errores en reservas, cobros y registros.',
      icon: 'pi pi-check-circle',
    },
    {
      title: 'Mejor control administrativo',
      description: 'Supervisa indicadores y operaciones sin depender de reportes aislados.',
      icon: 'pi pi-briefcase',
    },
    {
      title: 'Experiencia mas fluida para el huesped',
      description: 'Check-in agil, informacion clara y mejor coordinacion entre areas.',
      icon: 'pi pi-star',
    },
    {
      title: 'Informacion centralizada',
      description: 'Una sola fuente de datos para recepcion, caja, administracion y gerencia.',
      icon: 'pi pi-database',
    },
    {
      title: 'Decisiones basadas en reportes',
      description: 'Evalua resultados con datos actualizados y consistentes.',
      icon: 'pi pi-chart-scatter',
    },
  ];

  readonly audiences: AudienceItem[] = [
    {
      title: 'Hoteles pequenos y medianos',
      detail: 'Estandariza la gestion sin procesos complejos ni hojas dispersas.',
      icon: 'pi pi-building-columns',
    },
    {
      title: 'Hostales',
      detail: 'Controla alta rotacion de reservas y recepcion con mayor orden.',
      icon: 'pi pi-building',
    },
    {
      title: 'Apartahoteles',
      detail: 'Gestiona estancias, servicios y disponibilidad desde un mismo panel.',
      icon: 'pi pi-home',
    },
    {
      title: 'Alojamientos turisticos',
      detail: 'Centraliza operacion y control para crecer con procesos mas profesionales.',
      icon: 'pi pi-globe',
    },
    {
      title: 'Administradores hoteleros',
      detail: 'Visualiza indicadores clave y toma decisiones con respaldo operativo.',
      icon: 'pi pi-users',
    },
  ];

  mobileMenuOpen = false;
  demoModalOpen = false;
  demoStep: DemoStep = 'hotel';
  demoSubmitted = false;
  demoSubmitting = false;
  demoSubmitError = '';
  demoRequestSummary = '';

  ngOnDestroy(): void {
    this.unlockPageScroll();
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.demoModalOpen) {
      this.closeDemoModal();
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  scrollToSection(event: Event, sectionId: string): void {
    event.preventDefault();

    const section = document.getElementById(sectionId);
    if (!section) return;

    const header = document.querySelector('.wayra-header') as HTMLElement | null;
    const headerOffset = header?.offsetHeight ?? 0;
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const targetTop = Math.max(sectionTop - headerOffset - 12, 0);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.scrollTo({
      top: targetTop,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });

    window.history.replaceState(null, '', `#${sectionId}`);
    this.closeMobileMenu();
  }

  openDemoModal(event?: Event): void {
    event?.preventDefault();
    this.closeMobileMenu();
    this.demoModalOpen = true;
    this.demoSubmitted = false;
    this.demoSubmitError = '';
    this.demoStep = 'hotel';
    this.lockPageScroll();

    window.setTimeout(() => {
      document.getElementById('demo-hotel-name')?.focus();
    });
  }

  closeDemoModal(): void {
    this.demoModalOpen = false;
    this.demoStep = 'hotel';
    this.demoSubmitted = false;
    this.demoSubmitting = false;
    this.demoSubmitError = '';
    this.demoRequestSummary = '';
    this.demoForm.reset();
    this.unlockPageScroll();
  }

  goToHotelStep(): void {
    this.demoStep = 'hotel';

    window.setTimeout(() => {
      document.getElementById('demo-hotel-name')?.focus();
    });
  }

  goToRequesterStep(): void {
    const hotelForm = this.demoForm.controls.hotel;
    hotelForm.markAllAsTouched();

    if (hotelForm.invalid) return;

    this.demoStep = 'requester';

    window.setTimeout(() => {
      document.getElementById('demo-first-name')?.focus();
    });
  }

  submitDemoRequest(): void {
    if (this.demoSubmitting) return;

    this.demoForm.markAllAsTouched();
    this.demoSubmitError = '';

    if (this.demoForm.controls.hotel.invalid) {
      this.goToHotelStep();
      return;
    }

    if (this.demoForm.controls.requester.invalid) {
      this.demoStep = 'requester';
      return;
    }

    const hotelName = String(this.demoForm.controls.hotel.controls.hotelName.value || '').trim();
    this.demoRequestSummary = hotelName || 'tu hotel';
    this.demoSubmitting = true;

    this.demoRequestService
      .createDemoRequest(this.buildDemoRequestPayload())
      .pipe(finalize(() => (this.demoSubmitting = false)))
      .subscribe({
        next: () => {
          this.demoSubmitted = true;
        },
        error: () => {
          this.demoSubmitError = 'No se pudo guardar la solicitud. Intenta nuevamente.';
        },
      });
  }

  isInvalid(sectionName: DemoFormSection, controlName: string): boolean {
    const control =
      sectionName === 'hotel'
        ? this.demoForm.controls.hotel.get(controlName)
        : this.demoForm.controls.requester.get(controlName);

    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  trackByIndex(index: number): number {
    return index;
  }

  private lockPageScroll(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private unlockPageScroll(): void {
    document.body.style.overflow = this.previousBodyOverflow;
  }

  private buildDemoRequestPayload(): DemoRequestPayload {
    const hotel = this.demoForm.controls.hotel.getRawValue();
    const requester = this.demoForm.controls.requester.getRawValue();

    return {
      hotel_name: String(hotel.hotelName || '').trim(),
      hotel_type: String(hotel.hotelType || '').trim(),
      city: String(hotel.city || '').trim(),
      rooms: Number(hotel.rooms || 0),
      website: String(hotel.website || '').trim(),
      requester_first_name: String(requester.firstName || '').trim(),
      requester_last_name: String(requester.lastName || '').trim(),
      requester_username: String(requester.username || '').trim(),
      requester_email: String(requester.email || '').trim().toLowerCase(),
      requester_job_title: String(requester.jobTitle || '').trim(),
      requester_phone: String(requester.phone || '').trim(),
      message: String(requester.message || '').trim(),
    };
  }
}
