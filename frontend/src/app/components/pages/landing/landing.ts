import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';

import {
  DemoRequestPayload,
  DemoRequestService,
} from '../../../services/demo-request';
import {
  AuthService,
  MeResponse,
} from '../../../services/auth/auth';

import {
  JobTitle,
  RolesService,
} from '../../../services/roles.service';

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

interface TurnMoment {
  title: string;
  description: string;
  icon: string;
  evidence: string[];
  outcome: string;
}

interface ProofItem {
  label: string;
  description: string;
}

interface AudienceItem {
  title: string;
  detail: string;
  icon: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

type DemoStep =
  | 'hotel'
  | 'location'
  | 'operation'
  | 'requester';

type DemoFormSection =
  | 'hotel'
  | 'location'
  | 'operation'
  | 'requester';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingPage implements OnInit, AfterViewInit, OnDestroy {

  private readonly formBuilder = inject(FormBuilder);
  private readonly demoRequestService = inject(DemoRequestService);
  private readonly authService = inject(AuthService);
  private readonly rolesService = inject(RolesService);

  private previousBodyOverflow = '';
  private revealObserver: IntersectionObserver | null = null;

  readonly year = new Date().getFullYear();


  // =========================================================
  // OPCIONES
  // =========================================================

  readonly hotelTypes = [
    'Hotel',
    'Hostal',
    'Apartahotel',
    'Alojamiento turístico',
    'Otro',
  ];

  locationCountries: HotelLocationCountry[] = [];
  locationDepartments: HotelLocationDepartment[] = [];
  locationCities: string[] = [];


  // =========================================================
  // FORMULARIO DE DEMO
  // =========================================================

  readonly demoForm = this.formBuilder.group({

    hotel: this.formBuilder.group({
      hotelName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
        ],
      ],

      hotelType: [
        '',
        Validators.required,
      ],

      rooms: [
        null,
        [
          Validators.required,
          Validators.min(1),
        ],
      ],

      website: [''],
    }),

    location: this.formBuilder.group({
      country: [
        '',
        Validators.required,
      ],

      state: [
        '',
        Validators.required,
      ],

      city: [
        '',
        Validators.required,
      ],

      address: [
        '',
        Validators.required,
      ],
    }),

    operation: this.formBuilder.group({
      checkInTime: [
        '14:00',
        Validators.required,
      ],

      checkOutTime: [
        '12:00',
        Validators.required,
      ],
    }),

    requester: this.formBuilder.group({

      contactName: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
        ],
      ],

      firstName: [
        '',
      ],

      lastName: [
        '',
      ],

      username: [
        '',
        Validators.minLength(3),
      ],

      email: [
        '',
        [
          Validators.required,
          Validators.email,
        ],
      ],

      jobTitle: [
        '',
        Validators.required,
      ],

      phone: [
        '',
        [
          Validators.required,
          Validators.minLength(7),
        ],
      ],

      message: [''],
    }),
  });

  // =========================================================
  // NAVEGACIÓN
  // =========================================================

  readonly navLinks: NavLink[] = [
    {
      label: 'Producto',
      sectionId: 'producto',
    },
    {
      label: 'Cómo funciona',
      sectionId: 'operacion',
    },
    {
      label: 'Para quién',
      sectionId: 'publico',
    },
    {
      label: 'FAQ',
      sectionId: 'faq',
    },
  ];


  // =========================================================
  // TURNO OPERATIVO
  // =========================================================

  readonly turnMoments: TurnMoment[] = [
    {
      title: 'Antes del check-in',
      description:
        'Recepción confirma la reserva con habitación, huésped, abono y horario en el mismo registro.',
      icon: 'pi pi-calendar-clock',
      evidence: [
        'Reserva',
        'Huéspedes',
        'Abonos',
      ],
      outcome:
        'El turno sabe quién llega y qué falta revisar.',
    },
    {
      title: 'Durante la estadía',
      description:
        'Habitaciones, limpieza, servicios e inventario quedan conectados a la estadía correcta.',
      icon: 'pi pi-building',
      evidence: [
        'Habitación',
        'Limpieza',
        'Servicios',
      ],
      outcome:
        'El equipo ve qué está listo, ocupado o pendiente.',
    },
    {
      title: 'Al cierre de caja',
      description:
        'Pagos, cargos, reportes y actividad quedan disponibles para revisar el día sin cruzar hojas sueltas.',
      icon: 'pi pi-wallet',
      evidence: [
        'Pagos',
        'Reportes',
        'Actividad',
      ],
      outcome:
        'Gerencia revisa saldos y operación desde una sola fuente.',
    },
  ];


  // =========================================================
  // PRUEBA DE PRODUCTO
  // =========================================================

  readonly proofItems: ProofItem[] = [
    {
      label: 'Reserva',
      description:
        'Fechas, habitación, huéspedes, abonos y estado del check-in.',
    },
    {
      label: 'Habitación',
      description:
        'Disponibilidad, limpieza, mantenimiento e inventario asociado.',
    },
    {
      label: 'Caja',
      description:
        'Cargos, pagos, reembolsos, saldos y cierre de la estadía.',
    },
    {
      label: 'Gerencia',
      description:
        'Ocupación, ingresos, egresos, reportes y registro de actividad.',
    },
  ];

  readonly trustItems = [
    'Acceso por usuarios y roles',
    'Trazabilidad por reserva',
    'Registro de actividad',
    'Gestión desde navegador',
    'Configuración del hotel',
  ];

  landingSessionAuthenticated =
    this.authService.getCachedSessionState();

  get landingSessionActionRoute(): string {
    return this.landingSessionAuthenticated
      ? '/dashboard'
      : '/login';
  }

  get landingSessionActionLabel(): string {
    return this.landingSessionAuthenticated
      ? 'Ir al panel'
      : 'Iniciar sesión';
  }

  get landingSessionActionIcon(): string {
    return this.landingSessionAuthenticated
      ? 'pi pi-chart-line'
      : 'pi pi-sign-in';
  }

  // =========================================================
  // PÚBLICO
  // =========================================================

  readonly audiences: AudienceItem[] = [
    {
      title: 'Hoteles pequeños y medianos',
      detail:
        'Ordena recepción, habitaciones, cobros y reportes sin depender de hojas sueltas.',
      icon: 'pi pi-building-columns',
    },
    {
      title: 'Hostales',
      detail:
        'Mantiene reservas, huéspedes y habitaciones visibles para turnos de recepción.',
      icon: 'pi pi-building',
    },
    {
      title: 'Apartahoteles',
      detail:
        'Relaciona estadías, servicios, disponibilidad y saldos durante visitas más largas.',
      icon: 'pi pi-home',
    },
    {
      title: 'Alojamientos turísticos',
      detail:
        'Digitaliza la operación diaria sin mezclar reservas, pagos y tareas en canales distintos.',
      icon: 'pi pi-globe',
    },
  ];


  // =========================================================
  // FAQ
  // =========================================================

  readonly faqs: FaqItem[] = [
    {
      question: '¿Para qué tipo de hoteles es Wayra?',
      answer:
        'Wayra está pensado para hoteles pequeños y medianos, hostales, apartahoteles y alojamientos turísticos que necesitan ordenar recepción, habitaciones, cobros y reportes.',
    },
    {
      question: '¿Necesito instalar algo?',
      answer:
        'No. Wayra funciona desde el navegador, así que puedes acceder desde una computadora, tablet o teléfono con conexión a internet.',
    },
    {
      question: '¿Qué puedo gestionar desde Wayra?',
      answer:
        'Puedes gestionar reservas, habitaciones, huéspedes, clientes, servicios, pagos, facturas, inventario, limpieza, mantenimiento, egresos y reportes.',
    },
    {
      question: '¿Cómo funciona la solicitud de demo?',
      answer:
        'Solicitas una demo con tus datos de contacto y el contexto del hotel. El equipo de Wayra revisa la información y coordina el acceso.',
    },
    {
      question: '¿Qué es el check-in online?',
      answer:
        'Es una vista pública para que el huésped principal ingrese el código de su reserva y complete sus datos antes de llegar al hotel.',
    },
    {
      question: '¿Puedo usar Wayra desde diferentes dispositivos?',
      answer:
        'Sí. Wayra funciona desde el navegador, por lo que puede utilizarse desde equipos de escritorio, portátiles, tablets o teléfonos con conexión a internet.',
    },
  ];


  // =========================================================
  // ESTADO
  // =========================================================

  mobileMenuOpen = false;

  openFaqIndex: number | null = null;
  demoModalOpen = false;
  demoStep: DemoStep = 'requester';

  demoSubmitted = false;
  demoSubmitting = false;

  demoSubmitError = '';
  demoRequestSummary = '';

  jobTitles: JobTitle[] = [];
  jobTitlesLoading = false;
  jobTitlesLoadError = '';


  // =========================================================
  // ERRORES DE BACKEND
  // =========================================================

  private readonly demoFieldLabels: Record<string, string> = {
    hotel_name: 'Nombre del hotel',
    hotel_type: 'Tipo de alojamiento',
    country: 'País',
    state: 'Departamento',
    city: 'Ciudad',
    address: 'Dirección del hotel',
    rooms: 'Número de habitaciones',
    website: 'Sitio web',
    check_in_time: 'Horario de check-in',
    check_out_time: 'Horario de check-out',
    requester_first_name: 'Nombre de contacto',
    requester_last_name: 'Nombre de contacto',
    requester_username: 'Usuario sugerido para la demo',
    requester_email: 'Correo de contacto',
    requester_job_title: 'Cargo',
    requester_phone: 'Teléfono de contacto',
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

    requester_contact_name: 'requester',
    requester_first_name: 'requester',
    requester_last_name: 'requester',
    requester_username: 'operation',
    requester_email: 'requester',
    requester_job_title: 'requester',
    requester_phone: 'requester',
    message: 'operation',
  };


  // =========================================================
  // GETTERS DEL PROGRESO
  // =========================================================

  get demoStepNumber(): number {

    const steps: Record<DemoStep, number> = {
      requester: 1,
      hotel: 2,
      location: 3,
      operation: 4,
    };

    return steps[this.demoStep];
  }


  get demoStepLabel(): string {

    const labels: Record<DemoStep, string> = {
      requester: 'Contacto',
      hotel: 'Hotel',
      location: 'Ubicación',
      operation: 'Turno',
    };

    return labels[this.demoStep];
  }


  get demoStepProgress(): number {
    return this.demoStepNumber * 25;
  }


  // =========================================================
  // LIFECYCLE
  // =========================================================

  ngOnInit(): void {
    this.refreshLandingSessionState();
  }

  ngAfterViewInit(): void {

    window.setTimeout(() => {
      this.scrollToCurrentHash();
      this.setupLandingAnimations();
    });
  }


  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    this.revealObserver = null;
    this.unlockPageScroll();
  }


  // =========================================================
  // ESC
  // =========================================================

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {

    if (this.demoModalOpen) {
      this.closeDemoModal();
    }
  }


  @HostListener('window:hashchange')
  handleHashChange(): void {
    this.scrollToCurrentHash();
  }


  // =========================================================
  // MENÚ
  // =========================================================

  private refreshLandingSessionState(): void {

    this.authService
      .getUserInfo()
      .pipe(
        catchError(() => {
          this.authService.rememberSessionState(false);
          return of(null);
        })
      )
      .subscribe((user: MeResponse | null) => {
        const isAuthenticated =
          Boolean(user?.username);

        this.landingSessionAuthenticated =
          isAuthenticated;

        this.authService.rememberSessionState(isAuthenticated);
      });
  }


  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }


  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }


  // =========================================================
  // SCROLL
  // =========================================================

  scrollToSection(
    event: Event,
    sectionId: string
  ): void {

    event.preventDefault();

    const section = document.getElementById(sectionId);

    if (!section) {
      return;
    }

    const header =
      document.querySelector(
        '.wayra-header'
      ) as HTMLElement | null;

    const headerOffset =
      header?.offsetHeight ?? 0;

    const sectionTop =
      section.getBoundingClientRect().top +
      window.scrollY;

    const targetTop =
      Math.max(
        sectionTop - headerOffset - 12,
        0
      );

    const prefersReducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

    window.scrollTo({
      top: targetTop,
      behavior:
        prefersReducedMotion
          ? 'auto'
          : 'smooth',
    });

    window.history.replaceState(
      null,
      '',
      `#${sectionId}`
    );

    this.closeMobileMenu();
  }


  // =========================================================
  // FAQ
  // =========================================================

  onFaqToggle(
    event: Event,
    index: number
  ): void {

    const details =
      event.target as HTMLDetailsElement | null;

    if (!details?.open) {

      if (this.openFaqIndex === index) {
        this.openFaqIndex = null;
      }

      return;
    }

    this.openFaqIndex = index;
  }


  // =========================================================
  // MODAL
  // =========================================================

  openDemoModal(event?: Event): void {

    event?.preventDefault();

    this.closeMobileMenu();

    this.demoModalOpen = true;
    this.demoSubmitted = false;
    this.demoSubmitError = '';
    this.demoStep = 'requester';

    this.lockPageScroll();

    this.loadDemoCountries();
    this.loadDemoJobTitles();

    window.setTimeout(() => {
      document
        .getElementById('demo-contact-name')
        ?.focus();
    });
  }


  closeDemoModal(): void {

    this.demoModalOpen = false;
    this.demoStep = 'requester';

    this.demoSubmitted = false;
    this.demoSubmitting = false;

    this.demoSubmitError = '';
    this.demoRequestSummary = '';

    this.demoForm.reset();

    this.demoForm.controls.operation.patchValue({
      checkInTime: '14:00',
      checkOutTime: '12:00',
    });

    this.unlockPageScroll();
  }


  // =========================================================
  // PASOS
  // =========================================================

  goToHotelStep(): void {

    this.ensureDemoRequesterIdentity();

    const requesterForm =
      this.demoForm.controls.requester;

    requesterForm.markAllAsTouched();

    if (requesterForm.invalid) {
      return;
    }

    this.demoStep = 'hotel';

    window.setTimeout(() => {
      document
        .getElementById('demo-hotel-name')
        ?.focus();
    });
  }


  goToLocationStep(): boolean {

    this.ensureDemoRequesterIdentity();

    const requesterForm =
      this.demoForm.controls.requester;

    requesterForm.markAllAsTouched();

    if (requesterForm.invalid) {
      this.goToRequesterStep();
      return false;
    }

    const hotelForm =
      this.demoForm.controls.hotel;

    hotelForm.markAllAsTouched();

    if (hotelForm.invalid) {
      return false;
    }

    this.demoStep = 'location';

    window.setTimeout(() => {
      document
        .getElementById('demo-country')
        ?.focus();
    });

    return true;
  }


  goToOperationStep(): boolean {

    if (!this.goToLocationStep()) {
      return false;
    }

    const locationForm =
      this.demoForm.controls.location;

    locationForm.markAllAsTouched();

    if (locationForm.invalid) {
      return false;
    }

    this.demoStep = 'operation';

    window.setTimeout(() => {
      document
        .getElementById('demo-check-in-time')
        ?.focus();
    });

    return true;
  }


  goToRequesterStep(): void {
    this.demoStep = 'requester';

    window.setTimeout(() => {
      document
        .getElementById('demo-contact-name')
        ?.focus();
    });
  }


  canOpenDemoStep(step: DemoStep): boolean {

    if (step === 'requester') {
      return true;
    }

    if (step === 'hotel') {
      return this.demoForm.controls.requester.valid;
    }

    if (step === 'location') {
      return (
        this.demoForm.controls.requester.valid &&
        this.demoForm.controls.hotel.valid
      );
    }

    if (step === 'operation') {
      return (
        this.demoForm.controls.requester.valid &&
        this.demoForm.controls.hotel.valid &&
        this.demoForm.controls.location.valid
      );
    }

    return false;
  }


  // =========================================================
  // UBICACIÓN
  // =========================================================

  async onDemoCountryChange(): Promise<void> {

    this.demoForm.controls.location.patchValue({
      state: '',
      city: '',
    });

    this.locationCities = [];

    this.locationDepartments =
      await loadDepartmentsForCountry(
        this.demoForm.controls.location.controls.country.value
      );
  }


  async onDemoStateChange(): Promise<void> {

    this.demoForm.controls.location.patchValue({
      city: '',
    });

    const location =
      this.demoForm.controls.location.controls;

    this.locationCities =
      await loadCitiesForDepartment(
        location.country.value,
        location.state.value
      );
  }


  // =========================================================
  // HORARIOS
  // =========================================================

  hasSameDemoOperationTimes(): boolean {

    const operation =
      this.demoForm.controls.operation.getRawValue();

    return Boolean(
      operation.checkInTime &&
      operation.checkOutTime &&
      operation.checkInTime ===
        operation.checkOutTime
    );
  }


  // =========================================================
  // ENVÍO
  // =========================================================

  submitDemoRequest(): void {

    if (this.demoSubmitting) {
      return;
    }

    this.demoForm.markAllAsTouched();

    this.ensureDemoRequesterIdentity();

    this.demoSubmitError = '';

    if (this.demoForm.controls.requester.invalid) {
      this.demoStep = 'requester';
      return;
    }

    if (this.demoForm.controls.hotel.invalid) {
      this.demoStep = 'hotel';
      return;
    }

    if (this.demoForm.controls.location.invalid) {
      this.demoStep = 'location';
      return;
    }

    if (
      this.demoForm.controls.operation.invalid ||
      this.hasSameDemoOperationTimes()
    ) {
      this.demoStep = 'operation';
      return;
    }

    const hotelName =
      String(
        this.demoForm.controls.hotel.controls
          .hotelName.value || ''
      ).trim();

    this.demoRequestSummary =
      hotelName || 'tu hotel';

    this.demoSubmitting = true;

    this.demoRequestService
      .createDemoRequest(
        this.buildDemoRequestPayload()
      )
      .pipe(
        finalize(() => {
          this.demoSubmitting = false;
        })
      )
      .subscribe({

        next: () => {
          this.demoSubmitted = true;
        },

        error: (error) => {
          this.applyDemoSubmitError(error);
        },
      });
  }


  // =========================================================
  // VALIDACIONES VISUALES
  // =========================================================

  isInvalid(
    sectionName: DemoFormSection,
    controlName: string
  ): boolean {

    const control =
      sectionName === 'hotel'
        ? this.demoForm.controls.hotel.get(controlName)

        : sectionName === 'location'
          ? this.demoForm.controls.location.get(controlName)

          : sectionName === 'operation'
            ? this.demoForm.controls.operation.get(controlName)

            : this.demoForm.controls.requester.get(controlName);

    return Boolean(
      control &&
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }


  trackByIndex(index: number): number {
    return index;
  }


  // =========================================================
  // SCROLL BODY
  // =========================================================

  private lockPageScroll(): void {

    this.previousBodyOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';
  }


  private unlockPageScroll(): void {

    document.body.style.overflow =
      this.previousBodyOverflow;
  }


  private setupLandingAnimations(): void {

    const animatedElements =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '.wayra-reveal'
        )
      );

    if (animatedElements.length === 0) {
      return;
    }

    const prefersReducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

    if (
      prefersReducedMotion ||
      !('IntersectionObserver' in window)
    ) {
      animatedElements.forEach((element) => {
        element.classList.add('wayra-visible');
      });

      return;
    }

    this.revealObserver?.disconnect();

    this.revealObserver =
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            const element =
              entry.target as HTMLElement;

            element.classList.add('wayra-visible');
            this.revealObserver?.unobserve(element);
          });
        },
        {
          rootMargin: '0px 0px -12% 0px',
          threshold: 0.14,
        }
      );

    animatedElements.forEach((element) => {
      this.revealObserver?.observe(element);
    });
  }


  private scrollToCurrentHash(): void {

    const sectionId =
      window.location.hash.replace('#', '');

    if (!sectionId) {
      return;
    }

    const section =
      document.getElementById(sectionId);

    if (!section) {
      return;
    }

    const header =
      document.querySelector(
        '.wayra-header'
      ) as HTMLElement | null;

    const headerOffset =
      header?.offsetHeight ?? 0;

    const sectionTop =
      section.getBoundingClientRect().top +
      window.scrollY;

    window.scrollTo({
      top:
        Math.max(
          sectionTop - headerOffset - 12,
          0
        ),
      behavior: 'auto',
    });
  }


  // =========================================================
  // PAÍSES
  // =========================================================

  private loadDemoCountries(): void {

    loadHotelCountries()
      .then((countries) => {

        this.locationCountries =
          countries;
      });
  }


  // =========================================================
  // CARGOS
  // =========================================================

  private loadDemoJobTitles(): void {

    if (
      this.jobTitles.length > 0 ||
      this.jobTitlesLoading
    ) {
      return;
    }

    this.jobTitlesLoading = true;
    this.jobTitlesLoadError = '';

    this.rolesService
      .publicJobTitles()
      .pipe(

        catchError(() => {

          this.jobTitlesLoadError =
            'No se pudieron cargar los cargos disponibles.';

          return of(
            [] as JobTitle[]
          );
        }),

        finalize(() => {
          this.jobTitlesLoading = false;
        })
      )
      .subscribe((jobTitles) => {

        this.jobTitles = [
          ...jobTitles,
        ]
          .filter(
            (jobTitle) =>
              jobTitle.is_active !== false
          )
          .sort(
            (first, second) =>
              String(
                first.name || ''
              ).localeCompare(
                String(
                  second.name || ''
                ),
                'es-CO'
              )
          );
      });
  }


  // =========================================================
  // ERROR DE ENVÍO
  // =========================================================

  private applyDemoSubmitError(
    error: unknown
  ): void {

    const fieldErrors =
      this.extractDemoFieldErrors(error);

    const fieldNames =
      Object.keys(fieldErrors);

    if (fieldNames.length > 0) {

      this.demoSubmitError =
        fieldNames
          .map(
            (fieldName) =>
              this.formatDemoFieldError(
                fieldName,
                fieldErrors[fieldName]
              )
          )
          .join(' ');

      this.focusDemoStepForField(
        fieldNames[0]
      );

      return;
    }

    this.demoSubmitError =
      this.extractDemoErrorMessage(
        error,
        'No se pudo guardar la solicitud. Intenta nuevamente.'
      );
  }


  private extractDemoFieldErrors(
    error: unknown
  ): Record<string, string[]> {

    const payload =
      this.getErrorPayload(error);

    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      return {};
    }

    const errors =
      (
        payload as Record<string, unknown>
      )['errors'];

    if (
      errors &&
      typeof errors === 'object'
    ) {

      return this.normalizeFieldErrors(
        errors as Record<string, unknown>
      );
    }

    return this.normalizeFieldErrors(
      payload as Record<string, unknown>
    );
  }


  private normalizeFieldErrors(
    payload: Record<string, unknown>
  ): Record<string, string[]> {

    const normalized:
      Record<string, string[]> = {};

    Object.entries(payload)
      .forEach(
        ([fieldName, value]) => {

          if (
            [
              'detail',
              'code',
              'non_field_errors',
            ].includes(fieldName)
          ) {
            return;
          }

          if (Array.isArray(value)) {

            const messages =
              value
                .map(
                  (item) =>
                    String(
                      item || ''
                    ).trim()
                )
                .filter(Boolean);

            if (messages.length > 0) {

              normalized[fieldName] =
                messages;
            }

            return;
          }

          if (
            typeof value === 'string' &&
            value.trim()
          ) {

            normalized[fieldName] = [
              value.trim(),
            ];
          }
        }
      );

    return normalized;
  }


  private extractDemoErrorMessage(
    error: unknown,
    fallback: string
  ): string {

    const payload =
      this.getErrorPayload(error);

    if (
      typeof payload === 'string' &&
      payload.trim()
    ) {
      return payload.trim();
    }

    if (
      payload &&
      typeof payload === 'object'
    ) {

      const detail =
        (
          payload as Record<string, unknown>
        )['detail'];

      if (
        typeof detail === 'string' &&
        detail.trim()
      ) {
        return detail.trim();
      }
    }

    return fallback;
  }


  private getErrorPayload(
    error: unknown
  ): unknown {

    return (
      error &&
      typeof error === 'object'
    )
      ? (
          error as Record<string, unknown>
        )['error']
      : null;
  }


  private formatDemoFieldError(
    fieldName: string,
    messages: string[]
  ): string {

    const label =
      this.demoFieldLabels[fieldName] ||
      fieldName;

    return `${label}: ${messages.join(' ')}`;
  }


  private focusDemoStepForField(
    fieldName: string
  ): void {

    const section =
      this.demoFieldSections[fieldName];

    if (!section) {
      return;
    }

    this.demoStep = section;
  }


  // =========================================================
  // PAYLOAD
  // =========================================================

  private buildDemoRequestPayload():
    DemoRequestPayload {

    this.ensureDemoRequesterIdentity();

    const hotel =
      this.demoForm.controls.hotel
        .getRawValue();

    const location =
      this.demoForm.controls.location
        .getRawValue();

    const operation =
      this.demoForm.controls.operation
        .getRawValue();

    const requester =
      this.demoForm.controls.requester
        .getRawValue();

    return {

      hotel_name:
        String(
          hotel.hotelName || ''
        ).trim(),

      hotel_type:
        String(
          hotel.hotelType || ''
        ).trim(),

      country:
        String(
          location.country || ''
        ).trim(),

      state:
        String(
          location.state || ''
        ).trim(),

      city:
        String(
          location.city || ''
        ).trim(),

      address:
        String(
          location.address || ''
        ).trim(),

      rooms:
        Number(
          hotel.rooms || 0
        ),

      website:
        String(
          hotel.website || ''
        ).trim(),

      check_in_time:
        String(
          operation.checkInTime || ''
        ).trim(),

      check_out_time:
        String(
          operation.checkOutTime || ''
        ).trim(),

      requester_first_name:
        String(
          requester.firstName || ''
        ).trim(),

      requester_last_name:
        String(
          requester.lastName || ''
        ).trim(),

      requester_username:
        String(
          requester.username || ''
        ).trim(),

      requester_email:
        String(
          requester.email || ''
        )
          .trim()
          .toLowerCase(),

      requester_job_title:
        String(
          requester.jobTitle || ''
        ).trim(),

      requester_phone:
        String(
          requester.phone || ''
        ).trim(),

      message:
        String(
          requester.message || ''
        ).trim(),
    };
  }


  private ensureDemoRequesterIdentity(): void {

    const requesterForm =
      this.demoForm.controls.requester;

    const contactName =
      String(
        requesterForm.controls.contactName.value || ''
      ).trim();

    const nameParts =
      contactName
        .split(/\s+/)
        .filter(Boolean);

    const firstName =
      nameParts[0] || 'Contacto';

    const lastName =
      nameParts.length > 1
        ? nameParts.slice(1).join(' ')
        : firstName;

    const email =
      String(
        requesterForm.controls.email.value || ''
      )
        .trim()
        .toLowerCase();

    const hotelName =
      String(
        this.demoForm.controls.hotel.controls
          .hotelName.value || ''
      ).trim();

    const username =
      this.normalizeDemoUsername(
        String(
          requesterForm.controls.username.value || ''
        ).trim() ||
          email.split('@')[0] ||
          contactName ||
          hotelName ||
          'demo'
      );

    requesterForm.patchValue(
      {
        firstName,
        lastName,
        username,
      },
      {
        emitEvent: false,
      }
    );
  }


  private normalizeDemoUsername(
    value: string
  ): string {

    const normalized =
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')
        .slice(0, 30);

    if (normalized.length >= 3) {
      return normalized;
    }

    return `${normalized || 'demo'}_demo`
      .slice(0, 30);
  }
}
