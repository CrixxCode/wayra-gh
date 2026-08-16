import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  DatePicker,
  DatePickerModule,
} from 'primeng/datepicker';
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

import { AlliedHotel } from '../../../shared/allied-hotels';
import { resolveCurrentLocationDestination } from '../../../shared/current-location-destination';
import { AlliedHotelService } from '../../../services/allied-hotels';


interface NavLink {
  label: string;
  sectionId: string;
}

interface OperationStep {
  number: string;
  title: string;
  description: string;
}

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

interface FeatureGroup {
  title: string;
  description: string;
  icon: string;
  capabilities: string[];
}

interface BenefitItem {
  title: string;
  description: string;
  icon: string;
}

interface ResultItem {
  title: string;
  description: string;
  icon: string;
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

type LandingBookingControlName =
  | 'destination'
  | 'dateRange'
  | 'rooms'
  | 'guests';

interface BookingDestinationMatch {
  country: string;
  city: string;
}

interface BookingDestinationOption {
  city: string;
  country: string;
}


@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    DatePickerModule,
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
  private readonly router = inject(Router);
  private readonly alliedHotelService = inject(AlliedHotelService);
  @ViewChild('bookingDateRangePicker') private bookingDateRangePicker?: DatePicker;

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
    'Alojamiento turistico',
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

      firstName: [
        '',
        Validators.required,
      ],

      lastName: [
        '',
        Validators.required,
      ],

      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
        ],
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

  readonly bookingMinDate =
    this.getTodayDate();

  readonly bookingSearchForm =
    this.formBuilder.nonNullable.group({
      destination: [
        '',
        Validators.required,
      ],

      dateRange: [
        [] as Date[],
        Validators.required,
      ],

      rooms: [
        1,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(4),
        ],
      ],

      guests: [
        1,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(8),
        ],
      ],
    });

  readonly bookingDatePickerControl =
    this.formBuilder.nonNullable.control([] as Date[]);


  // =========================================================
  // NAVEGACIÓN
  // =========================================================

  readonly navLinks: NavLink[] = [
    {
      label: 'Buscar alojamiento',
      sectionId: 'buscar-alojamiento',
    },
    {
      label: 'Hoteles aliados',
      sectionId: 'hoteles-aliados',
    },
    {
      label: 'Producto',
      sectionId: 'producto',
    },
    {
      label: 'Funcionalidades',
      sectionId: 'funcionalidades',
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
  // FLUJO OPERATIVO
  // =========================================================

  readonly operationSteps: OperationStep[] = [
    {
      number: '01',
      title: 'Configura tu hotel',
      description:
        'Define habitaciones, tarifas, horarios y datos base para operar con orden.',
    },
    {
      number: '02',
      title: 'Centraliza tu gestión',
      description:
        'Reúne reservas, huéspedes, pagos, servicios y tareas en un mismo entorno.',
    },
    {
      number: '03',
      title: 'Controla tu operación',
      description:
        'Consulta actividad, reportes y alertas para detectar lo que necesita atención.',
    },
  ];


  // =========================================================
  // FUNCIONALIDADES
  // =========================================================

  readonly features: FeatureItem[] = [
    {
      title: 'Gestión de reservas',
      description:
        'Registra, modifica y da seguimiento a reservas con estado y trazabilidad.',
      icon: 'pi pi-calendar',
    },
    {
      title: 'Clientes y huéspedes',
      description:
        'Centraliza los datos de clientes y huéspedes para facilitar la gestión de cada estadía.',
      icon: 'pi pi-id-card',
    },
    {
      title: 'Pagos y facturación',
      description:
        'Administra pagos, saldos, facturas y notas de crédito de forma organizada.',
      icon: 'pi pi-wallet',
    },
    {
      title: 'Servicios y promociones',
      description:
        'Gestiona servicios adicionales, paquetes y promociones asociados a la operación.',
      icon: 'pi pi-megaphone',
    },
    {
      title: 'Inventario',
      description:
        'Controla entradas, salidas y movimientos de los artículos utilizados por el alojamiento.',
      icon: 'pi pi-box',
    },
    {
      title: 'Control financiero',
      description:
        'Mantén organizada la información relacionada con ingresos, egresos y actividad financiera.',
      icon: 'pi pi-chart-bar',
    },
    {
      title: 'Reportes administrativos',
      description:
        'Consulta información consolidada sobre ocupación, ingresos y actividad del hotel.',
      icon: 'pi pi-chart-line',
    },
    {
      title: 'Roles y permisos',
      description:
        'Controla el acceso a la plataforma según las responsabilidades de cada usuario.',
      icon: 'pi pi-shield',
    },
  ];

  readonly featuredFeature = this.features[0];
  readonly secondaryFeatures = this.features.slice(1);

  readonly featureGroups: FeatureGroup[] = [
    {
      title: 'Reservas',
      description:
        'Organiza fechas, habitaciones, huéspedes, abonos y estados de cada reserva desde un flujo operativo claro.',
      icon: 'pi pi-calendar',
      capabilities: [
        'Reservas por habitación',
        'Check-in y check-out',
        'Abonos y depósitos',
        'Historial de actividad',
      ],
    },
    {
      title: 'Habitaciones',
      description:
        'Administra habitaciones, tipos, tarifas, amenidades, limpieza y mantenimiento sin salir del contexto operativo.',
      icon: 'pi pi-building',
      capabilities: [
        'Tipos de habitación',
        'Tarifas por hotel',
        'Limpieza y mantenimiento',
        'Inventario por habitación',
      ],
    },
    {
      title: 'Huéspedes',
      description:
        'Centraliza datos de clientes y huéspedes para que recepción y administración trabajen con la misma información.',
      icon: 'pi pi-users',
      capabilities: [
        'Clientes',
        'Huéspedes por reserva',
        'Datos de contacto',
        'Trazabilidad del registro',
      ],
    },
    {
      title: 'Operación',
      description:
        'Conecta servicios, paquetes, promociones, inventario, limpieza y mantenimiento con la gestión diaria del alojamiento.',
      icon: 'pi pi-sitemap',
      capabilities: [
        'Servicios y consumos',
        'Paquetes y promociones',
        'Inventario',
        'Tareas operativas',
      ],
    },
    {
      title: 'Finanzas',
      description:
        'Mantén pagos, facturas, reembolsos, notas crédito, egresos y consolidado financiero en un entorno ordenado.',
      icon: 'pi pi-wallet',
      capabilities: [
        'Facturación',
        'Pagos y reembolsos',
        'Egresos',
        'Control financiero',
      ],
    },
    {
      title: 'Reportes',
      description:
        'Consulta información operativa y financiera para entender el estado del hotel y revisar la actividad del sistema.',
      icon: 'pi pi-chart-line',
      capabilities: [
        'Reportes operativos',
        'Reportes financieros',
        'Registro de actividad',
        'Alertas internas',
      ],
    },
  ];

  readonly productModules = [
    'Reservas',
    'Habitaciones',
    'Huéspedes',
    'Servicios',
    'Pagos',
    'Operación diaria',
  ];

  readonly trustItems = [
    'Acceso por usuarios y roles',
    'Centralización de información',
    'Registro de actividad',
    'Gestión desde navegador',
    'Configuración del hotel',
  ];

  alliedHotels: AlliedHotel[] = [];
  alliedHotelsTotal = 0;
  alliedHotelsLoading = true;

  bookingDestinationPanelOpen = false;
  bookingLocatingDestination = false;
  bookingLocationError = '';
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

  get featuredAlliedHotels(): AlliedHotel[] {
    return this.alliedHotels.slice(0, 6);
  }

  get bookingDestinationOptions(): BookingDestinationOption[] {

    const optionsByKey =
      new Map<string, BookingDestinationOption>();

    this.alliedHotels.forEach((hotel) => {
      const key =
        this.normalizeBookingText(
          `${hotel.city}-${hotel.country}`
        );

      optionsByKey.set(
        key,
        {
          city: hotel.city,
          country: hotel.country,
        }
      );
    });

    return [
      ...optionsByKey.values(),
    ].sort(
      (first, second) =>
        first.city.localeCompare(second.city, 'es-CO')
    );
  }

  get filteredBookingDestinationOptions(): BookingDestinationOption[] {

    const query =
      this.bookingSearchForm.controls.destination.value;

    const normalizedQuery =
      this.normalizeBookingText(query);

    const options =
      normalizedQuery
        ? this.bookingDestinationOptions.filter(
            (option) =>
              this.matchesBookingDestination(
                option.country,
                option.city,
                query
              )
          )
        : this.bookingDestinationOptions;

    return options.slice(0, 6);
  }

  get bookingSelectedDateRange(): Date[] {

    const dateRange =
      this.bookingSearchForm.controls.dateRange.value;

    if (!Array.isArray(dateRange)) {
      return [];
    }

    return dateRange
      .filter(
        (date): date is Date =>
          date instanceof Date &&
          !Number.isNaN(date.getTime())
      );
  }

  get bookingPendingDateRange(): Date[] {

    const dateRange =
      this.bookingDatePickerControl.value;

    if (!Array.isArray(dateRange)) {
      return [];
    }

    return dateRange
      .filter(
        (date): date is Date =>
          date instanceof Date &&
          !Number.isNaN(date.getTime())
      );
  }

  get canConfirmBookingDateRange(): boolean {

    const dateRange =
      this.bookingPendingDateRange;

    return (
      dateRange.length === 2 &&
      this.getBookingNights(dateRange) > 0
    );
  }

  get hasIncompleteBookingDateRange(): boolean {

    const selectedDates =
      this.bookingSelectedDateRange;

    return (
      selectedDates.length > 0 &&
      selectedDates.length < 2
    );
  }

  get bookingNights(): number {

    const [
      checkIn,
      checkOut,
    ] = this.bookingSelectedDateRange;

    return this.getBookingNights([
      checkIn,
      checkOut,
    ].filter((date): date is Date => Boolean(date)));
  }

  get hasBookingDateRangeError(): boolean {

    return (
      this.bookingSelectedDateRange.length === 2 &&
      this.bookingNights <= 0
    );
  }


  // =========================================================
  // BENEFICIOS
  // =========================================================

  readonly benefits: BenefitItem[] = [
    {
      title: 'Centraliza tu información',
      description:
        'Reservas, habitaciones y huéspedes en un mismo lugar, accesible para todo el equipo.',
      icon: 'pi pi-database',
    },
    {
      title: 'Reduce tareas manuales',
      description:
        'Menos duplicidad de registros y menos pasos para completar la operación del día.',
      icon: 'pi pi-check-circle',
    },
    {
      title: 'Mantén el control',
      description:
        'Visibilidad del estado de la operación y de los movimientos registrados.',
      icon: 'pi pi-eye',
    },
    {
      title: 'Trabaja más organizado',
      description:
        'Procesos claros y consistentes para recepción, administración y dirección.',
      icon: 'pi pi-sitemap',
    },
  ];


  // =========================================================
  // RESULTADOS
  // =========================================================

  readonly resultItems: ResultItem[] = [
    {
      title: 'Seguimiento operativo',
      description:
        'Revisa el estado general de la operación y detecta pendientes relevantes.',
      icon: 'pi pi-eye',
    },
    {
      title: 'Ocupación',
      description:
        'Consulta información de habitaciones ocupadas, libres, reservadas o en mantenimiento.',
      icon: 'pi pi-building',
    },
    {
      title: 'Pagos',
      description:
        'Mantén saldos, pagos, facturas y movimientos financieros relacionados.',
      icon: 'pi pi-wallet',
    },
    {
      title: 'Servicios',
      description:
        'Relaciona servicios, consumos, paquetes y promociones con la operación del hotel.',
      icon: 'pi pi-shopping-bag',
    },
    {
      title: 'Reportes',
      description:
        'Consulta información consolidada y registro de actividad para seguimiento administrativo.',
      icon: 'pi pi-chart-line',
    },
  ];


  // =========================================================
  // PÚBLICO
  // =========================================================

  readonly audiences: AudienceItem[] = [
    {
      title: 'Hoteles pequeños y medianos',
      detail:
        'Centraliza la gestión del alojamiento sin depender de múltiples herramientas.',
      icon: 'pi pi-building-columns',
    },
    {
      title: 'Hostales',
      detail:
        'Organiza reservas, habitaciones y huéspedes dentro de un mismo flujo de trabajo.',
      icon: 'pi pi-building',
    },
    {
      title: 'Apartahoteles',
      detail:
        'Gestiona estadías, servicios y disponibilidad desde una plataforma centralizada.',
      icon: 'pi pi-home',
    },
    {
      title: 'Alojamientos turísticos',
      detail:
        'Digitaliza procesos administrativos y operativos con una herramienta orientada a la gestión hotelera.',
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
        'Wayra está pensado para hoteles pequeños y medianos, hostales, apartahoteles y alojamientos turísticos que necesitan centralizar su gestión diaria.',
    },
    {
      question: '¿Necesito instalar algo?',
      answer:
        'No. Wayra funciona desde el navegador, así que puedes acceder desde una computadora, tablet o teléfono con conexión a internet.',
    },
    {
      question: '¿Qué puedo gestionar desde Wayra?',
      answer:
        'Puedes gestionar reservas, habitaciones, huéspedes, clientes, servicios, pagos, facturas, inventario, tareas operativas y reportes.',
    },
    {
      question: '¿Cómo funciona la solicitud de demo?',
      answer:
        'Solicitas una demo con los datos de tu hotel y del primer usuario. El equipo de Wayra revisa la información y coordina el acceso.',
    },
    {
      question: '¿Qué es el check-in online?',
      answer:
        'Es una vista publica para que el huesped principal ingrese el codigo de su reserva y complete sus datos antes de llegar al hotel.',
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
  activeFeatureIndex = 0;

  demoModalOpen = false;
  demoStep: DemoStep = 'hotel';

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
    requester_first_name: 'Nombre',
    requester_last_name: 'Apellidos',
    requester_username: 'Usuario de acceso',
    requester_email: 'Correo de acceso',
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

    requester_first_name: 'requester',
    requester_last_name: 'requester',
    requester_username: 'requester',
    requester_email: 'requester',
    requester_job_title: 'requester',
    requester_phone: 'requester',
    message: 'requester',
  };


  // =========================================================
  // GETTERS DEL PROGRESO
  // =========================================================

  get demoStepNumber(): number {

    const steps: Record<DemoStep, number> = {
      hotel: 1,
      location: 2,
      operation: 3,
      requester: 4,
    };

    return steps[this.demoStep];
  }


  get demoStepLabel(): string {

    const labels: Record<DemoStep, string> = {
      hotel: 'Hotel',
      location: 'Ubicación',
      operation: 'Horarios',
      requester: 'Primer usuario',
    };

    return labels[this.demoStep];
  }


  get demoStepProgress(): number {
    return this.demoStepNumber * 25;
  }


  get activeFeatureGroup(): FeatureGroup {
    return (
      this.featureGroups[this.activeFeatureIndex] ??
      this.featureGroups[0]
    );
  }


  // =========================================================
  // LIFECYCLE
  // =========================================================

  ngOnInit(): void {
    this.refreshLandingSessionState();
    this.loadAlliedHotels();
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


  selectFeatureGroup(index: number): void {
    this.activeFeatureIndex = index;
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
    this.demoStep = 'hotel';

    this.lockPageScroll();

    this.loadDemoCountries();
    this.loadDemoJobTitles();

    window.setTimeout(() => {
      document
        .getElementById('demo-hotel-name')
        ?.focus();
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

    this.demoStep = 'hotel';

    window.setTimeout(() => {
      document
        .getElementById('demo-hotel-name')
        ?.focus();
    });
  }


  goToLocationStep(): boolean {

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

    if (!this.goToOperationStep()) {
      return;
    }

    const operationForm =
      this.demoForm.controls.operation;

    operationForm.markAllAsTouched();

    if (
      operationForm.invalid ||
      this.hasSameDemoOperationTimes()
    ) {
      return;
    }

    this.demoStep = 'requester';

    window.setTimeout(() => {
      document
        .getElementById('demo-first-name')
        ?.focus();
    });
  }


  canOpenDemoStep(step: DemoStep): boolean {

    if (step === 'hotel') {
      return true;
    }

    if (step === 'location') {
      return this.demoForm.controls.hotel.valid;
    }

    if (step === 'operation') {
      return (
        this.demoForm.controls.hotel.valid &&
        this.demoForm.controls.location.valid
      );
    }

    return (
      this.demoForm.controls.hotel.valid &&
      this.demoForm.controls.location.valid &&
      this.demoForm.controls.operation.valid &&
      !this.hasSameDemoOperationTimes()
    );
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
  // BUSQUEDA DE ALOJAMIENTO
  // =========================================================

  openBookingDestinationPanel(): void {
    this.bookingDestinationPanelOpen = true;
  }


  closeBookingDestinationPanel(): void {
    window.setTimeout(() => {
      this.bookingDestinationPanelOpen = false;
    }, 120);
  }


  selectBookingDestination(
    destination: BookingDestinationOption
  ): void {

    this.bookingLocationError = '';
    this.bookingSearchForm.controls.destination.setValue(
      destination.city
    );

    this.bookingDestinationPanelOpen = false;
  }

  useCurrentBookingLocation(): void {
    if (
      this.bookingLocatingDestination ||
      this.alliedHotelsLoading
    ) {
      return;
    }

    this.bookingLocatingDestination = true;
    this.bookingLocationError = '';

    resolveCurrentLocationDestination(this.alliedHotels)
      .then((result) => {
        this.bookingSearchForm.controls.destination.setValue(
          result.destination
        );
        this.bookingSearchForm.controls.destination.markAsDirty();
        this.bookingSearchForm.controls.destination.markAsTouched();
        this.bookingDestinationPanelOpen = false;
      })
      .catch((error: unknown) => {
        this.bookingLocationError =
          this.extractBookingLocationError(error);
      })
      .finally(() => {
        this.bookingLocatingDestination = false;
      });
  }

  openBookingDateRangePicker(): void {
    this.syncBookingDatePickerDraft();
  }


  cancelBookingDateRange(): void {
    this.syncBookingDatePickerDraft();
    this.bookingDateRangePicker?.hideOverlay();
  }

  closeBookingDateRangePicker(): void {
    this.syncBookingDatePickerDraft();
  }


  confirmBookingDateRange(): void {

    const dateRange =
      this.bookingPendingDateRange;

    this.bookingSearchForm.controls.dateRange.markAsTouched();
    this.bookingDatePickerControl.markAsTouched();

    if (
      dateRange.length !== 2 ||
      this.getBookingNights(dateRange) <= 0
    ) {
      return;
    }

    this.bookingSearchForm.controls.dateRange.setValue(
      this.cloneBookingDateRange(dateRange)
    );
    this.bookingSearchForm.controls.dateRange.markAsDirty();
    this.bookingDateRangePicker?.hideOverlay();
  }


  submitBookingSearch(): void {

    this.bookingSearchForm.markAllAsTouched();

    if (
      this.bookingSearchForm.invalid ||
      !this.hasBookingDestinationMatches() ||
      this.hasIncompleteBookingDateRange ||
      this.hasBookingDateRangeError
    ) {
      return;
    }

    const search =
      this.bookingSearchForm.getRawValue();

    const [
      checkIn,
      checkOut,
    ] = this.bookingSelectedDateRange;

    const destination =
      search.destination.trim();

    const destinationMatch =
      this.resolveBookingDestination(destination);

    this.router.navigate(
      [
        '/reservar',
      ],
      {
        queryParams: {
          destination,
          country: destinationMatch?.country,
          city: destinationMatch?.city,
          checkIn:
            checkIn
              ? this.toBookingDateInputValue(checkIn)
              : '',
          checkOut:
            checkOut
              ? this.toBookingDateInputValue(checkOut)
              : '',
          rooms: search.rooms,
          guests: search.guests,
        },
      }
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

    this.demoSubmitError = '';

    if (this.demoForm.controls.hotel.invalid) {
      this.goToHotelStep();
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

    if (this.demoForm.controls.requester.invalid) {
      this.demoStep = 'requester';
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


  isBookingSearchInvalid(
    controlName: LandingBookingControlName
  ): boolean {

    const control =
      this.bookingSearchForm.controls[controlName];

    if (
      controlName === 'destination' &&
      (
        control.dirty ||
        control.touched
      )
    ) {
      return (
        control.invalid ||
        !this.hasBookingDestinationMatches()
      );
    }

    if (
      controlName === 'dateRange' &&
      (
        control.dirty ||
        control.touched
      )
    ) {
      return (
        this.bookingSelectedDateRange.length < 2 ||
        this.hasBookingDateRangeError
      );
    }

    return Boolean(
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


  trackByBookingDestination(
    index: number,
    destination: BookingDestinationOption
  ): string {

    return `${destination.city}-${destination.country}-${index}`;
  }

  private extractBookingLocationError(error: unknown): string {
    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message;
    }

    return 'No pudimos usar tu ubicacion.';
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


  private toBookingDateInputValue(date: Date): string {

    const year =
      date.getFullYear();

    const month =
      `${date.getMonth() + 1}`.padStart(2, '0');

    const day =
      `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getBookingNights(dateRange: Date[]): number {

    const [
      checkIn,
      checkOut,
    ] = dateRange;

    if (!checkIn || !checkOut) {
      return 0;
    }

    const diff =
      checkOut.getTime() - checkIn.getTime();

    return Math.max(
      Math.ceil(diff / 86400000),
      0
    );
  }


  private syncBookingDatePickerDraft(): void {

    this.bookingDatePickerControl.setValue(
      this.cloneBookingDateRange(
        this.bookingSelectedDateRange
      ),
      {
        emitEvent: false,
      }
    );
  }


  private cloneBookingDateRange(dateRange: Date[]): Date[] {

    return dateRange.map(
      (date) => new Date(date.getTime())
    );
  }


  private hasBookingDestinationMatches(): boolean {

    const destination =
      this.bookingSearchForm.controls.destination.value;

    return this.alliedHotels.some(
      (hotel) =>
        this.matchesBookingDestination(
          hotel.country,
          hotel.city,
          destination
        )
    );
  }


  private resolveBookingDestination(
    destination: string
  ): BookingDestinationMatch | null {

    const normalizedDestination =
      this.normalizeBookingText(destination);

    if (!normalizedDestination) {
      return null;
    }

    const exactCity =
      this.alliedHotels.find(
        (hotel) =>
          this.normalizeBookingText(
            `${hotel.city}, ${hotel.country}`
          ) === normalizedDestination ||
          this.normalizeBookingText(hotel.city) ===
            normalizedDestination
      );

    if (exactCity) {
      return {
        country: exactCity.country,
        city: exactCity.city,
      };
    }

    const exactCountry =
      this.alliedHotels.find(
        (hotel) =>
          this.normalizeBookingText(hotel.country) ===
          normalizedDestination
      );

    if (exactCountry) {
      return {
        country: exactCountry.country,
        city: '',
      };
    }

    const partialMatch =
      this.alliedHotels.find(
        (hotel) =>
          this.matchesBookingDestination(
            hotel.country,
            hotel.city,
            destination
          )
      );

    if (!partialMatch) {
      return null;
    }

    return {
      country: partialMatch.country,
      city:
        this.normalizeBookingText(partialMatch.city)
          .includes(normalizedDestination)
          ? partialMatch.city
          : '',
    };
  }


  private matchesBookingDestination(
    country: string,
    city: string,
    destination: string
  ): boolean {

    const normalizedDestination =
      this.normalizeBookingText(destination);

    if (!normalizedDestination) {
      return false;
    }

    return [
      country,
      city,
      `${city}, ${country}`,
    ].some(
      (option) =>
        this.normalizeBookingText(option)
          .includes(normalizedDestination)
    );
  }


  private normalizeBookingText(value: string): string {

    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }


  private getTodayDate(): Date {

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);

    return today;
  }


  private loadAlliedHotels(): void {
    this.alliedHotelsLoading = true;

    this.alliedHotelService
      .listActiveAlliedHotels()
      .pipe(
        catchError(() => of([] as AlliedHotel[])),
        finalize(() => {
          this.alliedHotelsLoading = false;
        })
      )
      .subscribe((hotels) => {
        this.alliedHotels = hotels;
        this.alliedHotelsTotal = hotels.length;

        window.setTimeout(() => {
          this.setupLandingAnimations();
        });
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
}
