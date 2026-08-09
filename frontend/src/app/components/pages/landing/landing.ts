import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { DemoRequestPayload, DemoRequestService } from '../../../services/demo-request';
import { JobTitle, RolesService } from '../../../services/roles.service';
import {
  HotelLocationCountry,
  HotelLocationDepartment,
  loadCitiesForDepartment,
  loadDepartmentsForCountry,
  loadHotelCountries,
} from '../../../shared/hotel-location-options';

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

type DemoStep = 'hotel' | 'location' | 'operation' | 'requester';
type DemoFormSection = 'hotel' | 'location' | 'operation' | 'requester';

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
  private readonly rolesService = inject(RolesService);
  private previousBodyOverflow = '';

  readonly year = new Date().getFullYear();

  readonly hotelTypes = ['Hotel', 'Hostal', 'Apartahotel', 'Alojamiento turistico', 'Otro'];
  locationCountries: HotelLocationCountry[] = [];
  locationDepartments: HotelLocationDepartment[] = [];
  locationCities: string[] = [];

  readonly demoForm = this.formBuilder.group({
    hotel: this.formBuilder.group({
      hotelName: ['', [Validators.required, Validators.minLength(2)]],
      hotelType: ['', Validators.required],
      rooms: [null, [Validators.required, Validators.min(1)]],
      website: [''],
    }),
    location: this.formBuilder.group({
      country: ['', Validators.required],
      state: ['', Validators.required],
      city: ['', Validators.required],
      address: ['', Validators.required],
    }),
    operation: this.formBuilder.group({
      checkInTime: ['14:00', Validators.required],
      checkOutTime: ['12:00', Validators.required],
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
  jobTitles: JobTitle[] = [];
  jobTitlesLoading = false;
  jobTitlesLoadError = '';

  private readonly demoFieldLabels: Record<string, string> = {
    hotel_name: 'Nombre del hotel',
    hotel_type: 'Tipo de alojamiento',
    country: 'Pais',
    state: 'Departamento',
    city: 'Ciudad',
    address: 'Direccion del hotel',
    rooms: 'Numero de habitaciones',
    website: 'Sitio web',
    check_in_time: 'Horario de check-in',
    check_out_time: 'Horario de check-out',
    requester_first_name: 'Nombre',
    requester_last_name: 'Apellidos',
    requester_username: 'Usuario de acceso',
    requester_email: 'Correo de acceso',
    requester_job_title: 'Cargo',
    requester_phone: 'Telefono de contacto',
    message: 'Comentarios',
  };

  private readonly demoFieldSections: Record<string, DemoStep> = {
    hotel_name: 'hotel',
    hotel_type: 'hotel',
    rooms: 'hotel',
    website: 'hotel',
    country: 'location',
    state: 'location',
    city: 'location',
    address: 'location',
    check_in_time: 'operation',
    check_out_time: 'operation',
    requester_first_name: 'requester',
    requester_last_name: 'requester',
    requester_username: 'requester',
    requester_email: 'requester',
    requester_job_title: 'requester',
    requester_phone: 'requester',
    message: 'requester',
  };

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
    this.loadDemoCountries();
    this.loadDemoJobTitles();

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
    this.demoForm.controls.operation.patchValue({ checkInTime: '14:00', checkOutTime: '12:00' });
    this.unlockPageScroll();
  }

  goToHotelStep(): void {
    this.demoStep = 'hotel';

    window.setTimeout(() => {
      document.getElementById('demo-hotel-name')?.focus();
    });
  }

  goToRequesterStep(): void {
    if (!this.goToOperationStep()) return;

    const operationForm = this.demoForm.controls.operation;
    operationForm.markAllAsTouched();

    if (operationForm.invalid || this.hasSameDemoOperationTimes()) return;

    this.demoStep = 'requester';

    window.setTimeout(() => {
      document.getElementById('demo-first-name')?.focus();
    });
  }

  goToLocationStep(): boolean {
    const hotelForm = this.demoForm.controls.hotel;
    hotelForm.markAllAsTouched();

    if (hotelForm.invalid) return false;

    this.demoStep = 'location';

    window.setTimeout(() => {
      document.getElementById('demo-country')?.focus();
    });

    return true;
  }

  goToOperationStep(): boolean {
    if (!this.goToLocationStep()) return false;

    const locationForm = this.demoForm.controls.location;
    locationForm.markAllAsTouched();

    if (locationForm.invalid) return false;

    this.demoStep = 'operation';

    window.setTimeout(() => {
      document.getElementById('demo-check-in-time')?.focus();
    });

    return true;
  }

  async onDemoCountryChange(): Promise<void> {
    this.demoForm.controls.location.patchValue({ state: '', city: '' });
    this.locationCities = [];
    this.locationDepartments = await loadDepartmentsForCountry(
      this.demoForm.controls.location.controls.country.value
    );
  }

  async onDemoStateChange(): Promise<void> {
    this.demoForm.controls.location.patchValue({ city: '' });
    const location = this.demoForm.controls.location.controls;
    this.locationCities = await loadCitiesForDepartment(location.country.value, location.state.value);
  }

  hasSameDemoOperationTimes(): boolean {
    const operation = this.demoForm.controls.operation.getRawValue();
    return Boolean(operation.checkInTime && operation.checkOutTime && operation.checkInTime === operation.checkOutTime);
  }

  canOpenDemoStep(step: DemoStep): boolean {
    if (step === 'hotel') return true;
    if (step === 'location') return this.demoForm.controls.hotel.valid;
    if (step === 'operation') return this.demoForm.controls.hotel.valid && this.demoForm.controls.location.valid;
    return (
      this.demoForm.controls.hotel.valid &&
      this.demoForm.controls.location.valid &&
      this.demoForm.controls.operation.valid &&
      !this.hasSameDemoOperationTimes()
    );
  }

  submitDemoRequest(): void {
    if (this.demoSubmitting) return;

    this.demoForm.markAllAsTouched();
    this.demoSubmitError = '';

    if (this.demoForm.controls.hotel.invalid) {
      this.goToHotelStep();
      return;
    }

    if (this.demoForm.controls.location.invalid) {
      this.demoStep = 'location';
      return;
    }

    if (this.demoForm.controls.operation.invalid || this.hasSameDemoOperationTimes()) {
      this.demoStep = 'operation';
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
        error: (error) => {
          this.applyDemoSubmitError(error);
        },
      });
  }

  isInvalid(sectionName: DemoFormSection, controlName: string): boolean {
    const control =
      sectionName === 'hotel'
        ? this.demoForm.controls.hotel.get(controlName)
        : sectionName === 'location'
          ? this.demoForm.controls.location.get(controlName)
          : sectionName === 'operation'
            ? this.demoForm.controls.operation.get(controlName)
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

  private loadDemoCountries(): void {
    loadHotelCountries().then((countries) => {
      this.locationCountries = countries;
    });
  }

  private loadDemoJobTitles(): void {
    if (this.jobTitles.length > 0 || this.jobTitlesLoading) return;

    this.jobTitlesLoading = true;
    this.jobTitlesLoadError = '';
    this.rolesService
      .publicJobTitles()
      .pipe(
        catchError(() => {
          this.jobTitlesLoadError = 'No se pudieron cargar los cargos disponibles.';
          return of([] as JobTitle[]);
        }),
        finalize(() => {
          this.jobTitlesLoading = false;
        })
      )
      .subscribe((jobTitles) => {
        this.jobTitles = [...jobTitles]
          .filter((jobTitle) => jobTitle.is_active !== false)
          .sort((first, second) =>
            String(first.name || '').localeCompare(String(second.name || ''), 'es-CO')
          );
      });
  }

  private applyDemoSubmitError(error: unknown): void {
    const fieldErrors = this.extractDemoFieldErrors(error);
    const fieldNames = Object.keys(fieldErrors);

    if (fieldNames.length > 0) {
      this.demoSubmitError = fieldNames
        .map((fieldName) => this.formatDemoFieldError(fieldName, fieldErrors[fieldName]))
        .join(' ');
      this.focusDemoStepForField(fieldNames[0]);
      return;
    }

    this.demoSubmitError = this.extractDemoErrorMessage(
      error,
      'No se pudo guardar la solicitud. Intenta nuevamente.'
    );
  }

  private extractDemoFieldErrors(error: unknown): Record<string, string[]> {
    const payload = this.getErrorPayload(error);
    if (!payload || typeof payload !== 'object') return {};

    const errors = (payload as Record<string, unknown>)['errors'];
    if (errors && typeof errors === 'object') {
      return this.normalizeFieldErrors(errors as Record<string, unknown>);
    }

    return this.normalizeFieldErrors(payload as Record<string, unknown>);
  }

  private normalizeFieldErrors(payload: Record<string, unknown>): Record<string, string[]> {
    const normalized: Record<string, string[]> = {};

    Object.entries(payload).forEach(([fieldName, value]) => {
      if (['detail', 'code', 'non_field_errors'].includes(fieldName)) return;

      if (Array.isArray(value)) {
        const messages = value.map((item) => String(item || '').trim()).filter(Boolean);
        if (messages.length > 0) normalized[fieldName] = messages;
        return;
      }

      if (typeof value === 'string' && value.trim()) {
        normalized[fieldName] = [value.trim()];
      }
    });

    return normalized;
  }

  private extractDemoErrorMessage(error: unknown, fallback: string): string {
    const payload = this.getErrorPayload(error);

    if (typeof payload === 'string' && payload.trim()) return payload.trim();

    if (payload && typeof payload === 'object') {
      const detail = (payload as Record<string, unknown>)['detail'];
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
    }

    return fallback;
  }

  private getErrorPayload(error: unknown): unknown {
    return error && typeof error === 'object' ? (error as Record<string, unknown>)['error'] : null;
  }

  private formatDemoFieldError(fieldName: string, messages: string[]): string {
    const label = this.demoFieldLabels[fieldName] || fieldName;
    return `${label}: ${messages.join(' ')}`;
  }

  private focusDemoStepForField(fieldName: string): void {
    const section = this.demoFieldSections[fieldName];
    if (!section) return;
    this.demoStep = section;
  }

  private buildDemoRequestPayload(): DemoRequestPayload {
    const hotel = this.demoForm.controls.hotel.getRawValue();
    const location = this.demoForm.controls.location.getRawValue();
    const operation = this.demoForm.controls.operation.getRawValue();
    const requester = this.demoForm.controls.requester.getRawValue();

    return {
      hotel_name: String(hotel.hotelName || '').trim(),
      hotel_type: String(hotel.hotelType || '').trim(),
      country: String(location.country || '').trim(),
      state: String(location.state || '').trim(),
      city: String(location.city || '').trim(),
      address: String(location.address || '').trim(),
      rooms: Number(hotel.rooms || 0),
      website: String(hotel.website || '').trim(),
      check_in_time: String(operation.checkInTime || '').trim(),
      check_out_time: String(operation.checkOutTime || '').trim(),
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
