import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';

import {
  DemoRequestFloorPayload,
  DemoRequestPayload,
  DemoRequestRoomTypePayload,
  DemoRequestService,
} from '../../../services/demo-request';

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

import { PublicHeaderComponent } from '../../shared/public-header/public-header';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer';


interface TurnMoment {
  title: string;
  summary: string;
  icon: string;
}

interface ProofItem {
  label: string;
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
  | 'requester'
  | 'hotel'
  | 'structure'
  | 'operation'
  | 'agenda'
  | 'verification';

type DemoFormSection =
  | 'hotel'
  | 'location'
  | 'operation'
  | 'requester'
  | 'verification';

interface DemoStepItem {
  id: DemoStep;
  label: string;
}

const MAX_DEMO_ROOM_TYPES = 12;
const MAX_DEMO_FLOORS = 30;
const MAX_DEMO_ROOMS = 2000;


// La estructura se valida como un todo: un piso vacio, dos prefijos iguales o dos
// tipos con el mismo nombre solo se ven mirando el conjunto, no un control suelto.
// El backend repite estas mismas reglas (`DemoRequestCreateSerializer.validate_structure`);
// aqui estan para que el usuario las vea antes de enviar, no para reemplazarlas.
function demoStructureValidator(
  control: AbstractControl
): ValidationErrors | null {

  const group = control as FormGroup;

  const roomTypes =
    group.get('roomTypes') as FormArray | null;

  const floors =
    group.get('floors') as FormArray | null;

  if (!roomTypes || !floors) {
    return null;
  }

  const messages: string[] = [];

  if (roomTypes.length === 0) {
    messages.push('Agrega al menos un tipo de habitación.');
  }

  if (floors.length === 0) {
    messages.push('Agrega al menos un piso.');
  }

  const typeNames =
    roomTypes.controls.map(
      (roomType) =>
        String(
          roomType.get('name')?.value || ''
        )
          .trim()
          .toLowerCase()
    );

  if (
    new Set(
      typeNames.filter(Boolean)
    ).size !== typeNames.filter(Boolean).length
  ) {
    messages.push('Hay dos tipos de habitación con el mismo nombre.');
  }

  const prefixes: string[] = [];
  const floorNumbers: number[] = [];
  let totalRooms = 0;

  floors.controls.forEach((floor) => {

    const floorNumber =
      Number(
        floor.get('floorNumber')?.value || 0
      );

    const prefix =
      String(
        floor.get('prefix')?.value || ''
      ).trim();

    const distribution =
      floor.get('distribution') as FormArray | null;

    const floorTotal =
      (distribution?.controls || []).reduce(
        (total, quantity) =>
          total + Number(quantity.value || 0),
        0
      );

    totalRooms += floorTotal;

    if (floorTotal < 1) {
      messages.push(
        `El piso ${floorNumber || '?'} no tiene habitaciones.`
      );
    }

    if (prefix) {
      prefixes.push(prefix);
    }

    if (floorNumber) {
      floorNumbers.push(floorNumber);
    }
  });

  if (new Set(prefixes).size !== prefixes.length) {
    messages.push('Dos pisos tienen el mismo prefijo de numeración.');
  }

  if (new Set(floorNumbers).size !== floorNumbers.length) {
    messages.push('Dos pisos tienen el mismo número.');
  }

  if (totalRooms > MAX_DEMO_ROOMS) {
    messages.push(
      `La estructura no puede superar ${MAX_DEMO_ROOMS} habitaciones.`
    );
  }

  return messages.length > 0
    ? { demoStructure: messages }
    : null;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PublicHeaderComponent,
    PublicFooterComponent,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingPage implements AfterViewInit, OnDestroy {

  private readonly formBuilder = inject(FormBuilder);
  private readonly demoRequestService = inject(DemoRequestService);
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

  locationCountriesLoading = false;
  locationLoadError = '';


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

      website: [''],
    }),

    // La cantidad de habitaciones ya no se escribe: sale de la estructura declarada
    // aqui, que es la que el backend materializa al aprobar la solicitud.
    structure: this.formBuilder.group(
      {
        roomTypes: this.formBuilder.array(
          [] as FormGroup[]
        ),
        floors: this.formBuilder.array(
          [] as FormGroup[]
        ),
      },
      {
        validators: demoStructureValidator,
      }
    ),

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

    verification: this.formBuilder.group({
      code: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(6),
          Validators.pattern(/^[0-9]{6}$/),
        ],
      ],
    }),
  });

  // =========================================================
  // TURNO OPERATIVO
  // =========================================================

  readonly turnMoments: TurnMoment[] = [
    {
      title: 'Antes del check-in',
      summary:
        'Cotiza, reserva y confirma con disponibilidad real. El huésped queda cargado una sola vez, con sus datos y su historial.',
      icon: 'pi pi-calendar',
    },
    {
      title: 'Durante la estadía',
      summary:
        'Estado de habitaciones, limpieza, cambios y consumos cargados a la cuenta. Recepción y housekeeping ven lo mismo.',
      icon: 'pi pi-building',
    },
    {
      title: 'Cierre de caja',
      summary:
        'Cobros, medios de pago y saldos del turno en un solo arqueo. La gerencia recibe el reporte sin pedirlo.',
      icon: 'pi pi-wallet',
    },
  ];


  // =========================================================
  // PRUEBA DE PRODUCTO
  // =========================================================

  readonly proofItems: ProofItem[] = [
    {
      label: 'Reservas',
      description:
        'Calendario, tarifas y confirmaciones con disponibilidad real.',
      icon: 'pi pi-calendar-plus',
    },
    {
      label: 'Habitaciones',
      description:
        'Estados, limpieza y bloqueos por mantenimiento al día.',
      icon: 'pi pi-home',
    },
    {
      label: 'Caja',
      description:
        'Cobros, consumos y arqueo por turno con respaldo.',
      icon: 'pi pi-wallet',
    },
    {
      label: 'Gerencia',
      description:
        'Ocupación, ingresos y reportes listos para revisar.',
      icon: 'pi pi-chart-line',
    },
  ];

  readonly trustItems = [
    'Acceso por usuarios y roles',
    'Trazabilidad por reserva',
    'Registro de actividad',
    'Acceso desde el navegador',
    'Historial completo por huésped',
    'Soporte en español',
  ];

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
        'Reservas, habitaciones y huéspedes; servicios, pagos y facturas; inventario, limpieza y mantenimiento; y reportes con los egresos del hotel.',
    },
    {
      question: '¿Cómo funciona la solicitud de demo?',
      answer:
        'Solicitas una demo con tus datos de contacto y la estructura de tu hotel: tipos de habitación con su tarifa base, pisos y cuántas habitaciones hay en cada uno. El equipo de Wayra revisa la información y se comunica contigo; al aprobarla, tu hotel queda creado con esa misma estructura, sin activar cobros ni publicar tus datos.',
    },
    {
      question: '¿Puedo empezar con pocas habitaciones?',
      answer:
        'Sí. Wayra se adapta al tamaño real del hotel, desde alojamientos pequeños hasta operaciones con varias habitaciones y equipos, sin exigir una escala mínima.',
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

  openFaqIndex: number | null = null;
  demoModalOpen = false;
  demoStep: DemoStep = 'requester';

  demoSubmitted = false;
  demoSubmitting = false;

  demoSubmitError = '';
  demoRequestSummary = '';
  demoVerificationToken = '';
  demoVerificationEmail = '';
  demoVerificationMessage = '';
  demoResendingCode = false;

  readonly demoStepItems: DemoStepItem[] = [
    {
      id: 'requester',
      label: 'Contacto',
    },
    {
      id: 'hotel',
      label: 'Alojamiento',
    },
    {
      id: 'structure',
      label: 'Estructura',
    },
    {
      id: 'operation',
      label: 'Operación',
    },
    {
      id: 'agenda',
      label: 'Agenda',
    },
    {
      id: 'verification',
      label: 'Correo',
    },
  ];

  jobTitles: JobTitle[] = [];
  jobTitlesLoading = false;
  jobTitlesLoadError = '';

  get jobTitlesIncludeOtro(): boolean {
    return this.jobTitles.some(
      (jobTitle) =>
        String(jobTitle.name || '')
          .trim()
          .toLowerCase() === 'otro'
    );
  }


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
    room_types: 'Tipos de habitación',
    floors: 'Pisos',
    website: 'Sitio web',
    check_in_time: 'Horario de check-in',
    check_out_time: 'Horario de check-out',
    requester_first_name: 'Nombre de contacto',
    requester_last_name: 'Nombre de contacto',
    requester_username: 'Nombre de usuario',
    requester_email: 'Correo de contacto',
    requester_job_title: 'Cargo',
    requester_phone: 'Teléfono de contacto',
    message: 'Comentarios',
    email_verification_code: 'Código de verificación',
    email_verification_token: 'Código de verificación',
  };

  private readonly demoFieldSections: Record<string, DemoStep> = {
    hotel_name: 'hotel',
    hotel_type: 'hotel',
    rooms: 'structure',
    room_types: 'structure',
    floors: 'structure',
    website: 'hotel',

    country: 'hotel',
    state: 'hotel',
    city: 'hotel',
    address: 'hotel',

    check_in_time: 'operation',
    check_out_time: 'operation',

    requester_contact_name: 'requester',
    requester_first_name: 'requester',
    requester_last_name: 'requester',
    requester_username: 'requester',
    requester_email: 'requester',
    requester_job_title: 'requester',
    requester_phone: 'requester',
    message: 'agenda',
    email_verification_code: 'verification',
    email_verification_token: 'verification',
  };


  // =========================================================
  // GETTERS DEL PROGRESO
  // =========================================================

  get demoStepNumber(): number {
    return this.currentDemoStepIndex + 1;
  }


  get demoStepLabel(): string {
    return (
      this.demoStepItems[this.currentDemoStepIndex]?.label ||
      'Contacto'
    );
  }


  get demoStepProgress(): number {
    return (
      this.demoStepNumber /
      this.demoStepItems.length
    ) * 100;
  }


  // =========================================================
  // ESTRUCTURA DEL HOTEL
  // =========================================================

  get demoRoomTypes(): FormArray {
    return this.demoForm.controls.structure
      .controls.roomTypes as FormArray;
  }


  get demoFloors(): FormArray {
    return this.demoForm.controls.structure
      .controls.floors as FormArray;
  }


  get demoStructureMessages(): string[] {

    const errors =
      this.demoForm.controls.structure.errors;

    return (
      errors?.['demoStructure'] as string[] | undefined
    ) || [];
  }


  get demoTotalRooms(): number {

    return this.demoFloors.controls.reduce(
      (total, floor) =>
        total + this.demoFloorTotalRooms(floor),
      0
    );
  }


  get canAddDemoRoomType(): boolean {
    return this.demoRoomTypes.length < MAX_DEMO_ROOM_TYPES;
  }


  get canAddDemoFloor(): boolean {
    return this.demoFloors.length < MAX_DEMO_FLOORS;
  }


  demoFloorTotalRooms(floor: AbstractControl): number {

    const distribution =
      floor.get('distribution') as FormArray | null;

    return (distribution?.controls || []).reduce(
      (total, quantity) =>
        total + Number(quantity.value || 0),
      0
    );
  }


  demoFloorDistribution(floor: AbstractControl): FormArray {
    return floor.get('distribution') as FormArray;
  }


  demoRoomTypeName(index: number): string {

    return String(
      this.demoRoomTypes.at(index)?.get('name')?.value || ''
    ).trim() || `Tipo ${index + 1}`;
  }


  private buildDemoRoomTypeGroup(
    name = ''
  ): FormGroup {

    return this.formBuilder.group({
      name: [
        name,
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(120),
        ],
      ],
      capacity: [
        2,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(20),
        ],
      ],
      bedCount: [
        1,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(20),
        ],
      ],
      bedType: [''],
      billingMode: [
        'ROOM',
        Validators.required,
      ],
      basePrice: [
        null,
        [
          Validators.required,
          Validators.min(0),
        ],
      ],
    });
  }


  private buildDemoFloorGroup(
    floorNumber: number
  ): FormGroup {

    return this.formBuilder.group({
      floorNumber: [
        floorNumber,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(200),
        ],
      ],
      name: [
        `Piso ${floorNumber}`,
        [
          Validators.required,
          Validators.maxLength(80),
        ],
      ],
      prefix: [
        String(floorNumber),
        [
          Validators.required,
          Validators.maxLength(10),
        ],
      ],
      // Una casilla por tipo de habitación, en el mismo orden que `roomTypes`:
      // la posición es la que le dice al backend a qué tipo pertenece la cantidad.
      distribution: this.formBuilder.array(
        this.demoRoomTypes.controls.map(
          () => this.buildDemoQuantityControl()
        )
      ),
    });
  }


  private buildDemoQuantityControl() {

    return this.formBuilder.control(
      0,
      [
        Validators.required,
        Validators.min(0),
        Validators.max(MAX_DEMO_ROOMS),
      ]
    );
  }


  addDemoRoomType(): void {

    if (!this.canAddDemoRoomType) {
      return;
    }

    this.demoRoomTypes.push(
      this.buildDemoRoomTypeGroup()
    );

    // Cada piso necesita una casilla más para el tipo recién agregado.
    this.demoFloors.controls.forEach((floor) => {
      this.demoFloorDistribution(floor).push(
        this.buildDemoQuantityControl()
      );
    });

    this.demoForm.controls.structure.markAsDirty();

    window.setTimeout(() => {
      document
        .getElementById(
          `demo-room-type-name-${this.demoRoomTypes.length - 1}`
        )
        ?.focus();
    });
  }


  removeDemoRoomType(index: number): void {

    if (this.demoRoomTypes.length <= 1) {
      return;
    }

    this.demoRoomTypes.removeAt(index);

    this.demoFloors.controls.forEach((floor) => {
      this.demoFloorDistribution(floor).removeAt(index);
    });

    this.demoForm.controls.structure.markAsDirty();
  }


  addDemoFloor(): void {

    if (!this.canAddDemoFloor) {
      return;
    }

    const nextFloorNumber =
      this.demoFloors.controls.reduce(
        (highest, floor) =>
          Math.max(
            highest,
            Number(
              floor.get('floorNumber')?.value || 0
            )
          ),
        0
      ) + 1;

    this.demoFloors.push(
      this.buildDemoFloorGroup(nextFloorNumber)
    );

    this.demoForm.controls.structure.markAsDirty();

    window.setTimeout(() => {
      document
        .getElementById(
          `demo-floor-name-${this.demoFloors.length - 1}`
        )
        ?.focus();
    });
  }


  removeDemoFloor(index: number): void {

    if (this.demoFloors.length <= 1) {
      return;
    }

    this.demoFloors.removeAt(index);
    this.demoForm.controls.structure.markAsDirty();
  }


  isDemoRoomTypeInvalid(
    index: number,
    controlName: string
  ): boolean {

    const control =
      this.demoRoomTypes.at(index)?.get(controlName);

    return Boolean(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }


  isDemoFloorInvalid(
    index: number,
    controlName: string
  ): boolean {

    const control =
      this.demoFloors.at(index)?.get(controlName);

    return Boolean(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }


  private resetDemoStructure(): void {

    this.demoRoomTypes.clear();
    this.demoFloors.clear();

    this.demoRoomTypes.push(
      this.buildDemoRoomTypeGroup('Estándar')
    );
    this.demoFloors.push(
      this.buildDemoFloorGroup(1)
    );

    this.demoForm.controls.structure.updateValueAndValidity();
  }


  get currentDemoStepIndex(): number {
    return Math.max(
      this.demoStepItems.findIndex(
        (step) => step.id === this.demoStep
      ),
      0
    );
  }


  get demoPrimaryActionLabel(): string {

    if (this.demoSubmitting) {
      return this.demoStep === 'verification'
        ? 'Confirmando...'
        : this.demoStep === 'agenda'
          ? 'Enviando código...'
          : 'Guardando...';
    }

    if (this.demoStep === 'agenda') {
      return this.demoVerificationToken
        ? 'Continuar con código'
        : 'Enviar código';
    }

    if (this.demoStep === 'verification') {
      return 'Confirmar solicitud';
    }

    return 'Continuar';
  }


  // =========================================================
  // LIFECYCLE
  // =========================================================

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
      this.closeDemoModalWithConfirm();
    }
  }


  @HostListener('window:hashchange')
  handleHashChange(): void {
    this.scrollToCurrentHash();
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
        '.public-header'
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
  }


  // =========================================================
  // FAQ
  // =========================================================

  onFaqSummaryClick(
    event: Event,
    index: number
  ): void {

    event.preventDefault();

    const summary =
      event.currentTarget as HTMLElement;

    const details =
      summary.closest('details') as HTMLDetailsElement | null;

    if (!details) {
      return;
    }

    const container = details.parentElement;
    const previousIndex = this.openFaqIndex;
    const opening = previousIndex !== index;

    const previousDetails =
      previousIndex !== null && container
        ? (
            Array.from(container.children)[previousIndex] as
              HTMLDetailsElement
          )
        : null;

    this.openFaqIndex = opening
      ? index
      : null;

    const prefersReducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

    if (prefersReducedMotion) {

      if (previousDetails && previousDetails !== details) {
        previousDetails.open = false;
      }

      details.open = opening;
      return;
    }

    if (previousDetails && previousDetails !== details) {
      this.collapseFaqItem(previousDetails);
    }

    if (opening) {
      this.expandFaqItem(details);
    } else {
      this.collapseFaqItem(details);
    }
  }


  private expandFaqItem(
    details: HTMLDetailsElement
  ): void {

    const startHeight =
      `${details.offsetHeight}px`;

    details.style.overflow = 'hidden';
    details.style.willChange = 'height';
    details.open = true;

    window.requestAnimationFrame(() => {

      const endHeight =
        `${details.scrollHeight}px`;

      const animation =
        details.animate(
          {
            height: [
              startHeight,
              endHeight,
            ],
          },
          {
            duration: 260,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }
        );

      animation.onfinish = () =>
        this.finishFaqAnimation(details);

      animation.oncancel = () =>
        this.finishFaqAnimation(details);
    });
  }


  private collapseFaqItem(
    details: HTMLDetailsElement
  ): void {

    if (!details.open) {
      return;
    }

    const startHeight =
      `${details.offsetHeight}px`;

    const summaryHeight =
      details.querySelector('summary')?.offsetHeight ?? 0;

    details.style.overflow = 'hidden';
    details.style.willChange = 'height';

    const animation =
      details.animate(
        {
          height: [
            startHeight,
            `${summaryHeight}px`,
          ],
        },
        {
          duration: 220,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }
      );

    animation.onfinish = () => {
      details.open = false;
      this.finishFaqAnimation(details);
    };

    animation.oncancel = () =>
      this.finishFaqAnimation(details);
  }


  private finishFaqAnimation(
    details: HTMLDetailsElement
  ): void {

    details.style.overflow = '';
    details.style.willChange = '';
  }


  revealDelay(index: number): number {
    return Math.min(index, 3) * 50;
  }


  // =========================================================
  // MODAL
  // =========================================================

  openDemoModal(event?: Event): void {

    event?.preventDefault();

    this.demoModalOpen = true;
    this.demoSubmitted = false;
    this.demoSubmitError = '';
    this.demoVerificationMessage = '';
    this.demoStep = 'requester';

    if (this.demoRoomTypes.length === 0) {
      this.resetDemoStructure();
    }

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
    this.demoResendingCode = false;

    this.demoSubmitError = '';
    this.demoRequestSummary = '';
    this.demoVerificationToken = '';
    this.demoVerificationEmail = '';
    this.demoVerificationMessage = '';

    this.demoForm.reset();

    this.demoForm.controls.operation.patchValue({
      checkInTime: '14:00',
      checkOutTime: '12:00',
    });

    // `reset()` vacía los valores pero deja los FormArray con sus controles: hay que
    // rearmar la estructura para que el siguiente intento empiece con un tipo y un piso.
    this.resetDemoStructure();

    this.unlockPageScroll();
  }


  // Backdrop/Escape/X are accidental dismissals, unlike the explicit "Cancelar" button, so confirm before discarding a dirty form.
  closeDemoModalWithConfirm(): void {

    if (
      !this.demoSubmitted &&
      this.demoForm.dirty &&
      !window.confirm(
        '¿Descartar los datos que ya ingresaste en la solicitud de demo?'
      )
    ) {
      return;
    }

    this.closeDemoModal();
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
    return this.goToStructureStep();
  }


  goToStructureStep(): boolean {

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

    const locationForm =
      this.demoForm.controls.location;

    hotelForm.markAllAsTouched();
    locationForm.markAllAsTouched();

    if (
      hotelForm.invalid ||
      locationForm.invalid
    ) {
      this.demoStep = 'hotel';
      return false;
    }

    this.demoStep = 'structure';

    window.setTimeout(() => {
      document
        .getElementById('demo-room-type-name-0')
        ?.focus();
    });

    return true;
  }


  goToOperationStep(): boolean {

    if (!this.goToStructureStep()) {
      return false;
    }

    const structureForm =
      this.demoForm.controls.structure;

    structureForm.markAllAsTouched();

    if (structureForm.invalid) {
      this.demoStep = 'structure';
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


  goToAgendaStep(): boolean {

    if (!this.goToOperationStep()) {
      return false;
    }

    const operationForm =
      this.demoForm.controls.operation;

    operationForm.markAllAsTouched();

    if (
      operationForm.invalid ||
      this.hasSameDemoOperationTimes()
    ) {
      this.demoStep = 'operation';
      return false;
    }

    this.demoStep = 'agenda';

    window.setTimeout(() => {
      document
        .getElementById('demo-submit-request')
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


  goToPreviousDemoStep(): void {

    const previousStep =
      this.demoStepItems[
        Math.max(
          this.currentDemoStepIndex - 1,
          0
        )
      ];

    if (!previousStep) {
      return;
    }

    this.demoStep = previousStep.id;
    this.focusCurrentDemoStep();
  }


  goToNextDemoStep(): void {

    if (this.demoStep === 'requester') {
      this.goToHotelStep();
      return;
    }

    if (this.demoStep === 'hotel') {
      this.goToStructureStep();
      return;
    }

    if (this.demoStep === 'structure') {
      this.goToOperationStep();
      return;
    }

    if (this.demoStep === 'operation') {
      this.goToAgendaStep();
      return;
    }

    if (this.demoStep === 'agenda') {
      this.requestDemoVerificationCode();
    }
  }


  goToDemoStep(step: DemoStep): void {

    if (
      step === this.demoStep ||
      !this.canOpenDemoStep(step)
    ) {
      return;
    }

    this.demoStep = step;
    this.focusCurrentDemoStep();
  }


  canOpenDemoStep(step: DemoStep): boolean {

    if (step === 'requester') {
      return true;
    }

    if (step === 'hotel') {
      return this.demoForm.controls.requester.valid;
    }

    if (step === 'structure') {
      return (
        this.demoForm.controls.requester.valid &&
        this.demoForm.controls.hotel.valid &&
        this.demoForm.controls.location.valid
      );
    }

    if (step === 'operation') {
      return (
        this.canOpenDemoStep('structure') &&
        this.demoForm.controls.structure.valid
      );
    }

    if (step === 'agenda') {
      return (
        this.canOpenDemoStep('operation') &&
        this.demoForm.controls.operation.valid &&
        !this.hasSameDemoOperationTimes()
      );
    }

    if (step === 'verification') {
      return (
        this.canOpenDemoStep('agenda') &&
        Boolean(this.demoVerificationToken)
      );
    }

    return false;
  }


  isDemoStepComplete(step: DemoStep): boolean {

    if (step === 'requester') {
      return this.demoForm.controls.requester.valid;
    }

    if (step === 'hotel') {
      return (
        this.demoForm.controls.hotel.valid &&
        this.demoForm.controls.location.valid
      );
    }

    if (step === 'structure') {
      return this.demoForm.controls.structure.valid;
    }

    if (step === 'operation') {
      return (
        this.demoForm.controls.operation.valid &&
        !this.hasSameDemoOperationTimes()
      );
    }

    if (step === 'agenda') {
      return Boolean(this.demoVerificationToken);
    }

    return this.demoSubmitted;
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
    this.locationLoadError = '';

    try {

      this.locationDepartments =
        await loadDepartmentsForCountry(
          this.demoForm.controls.location.controls.country.value
        );
    } catch {

      this.locationDepartments = [];

      this.locationLoadError =
        'No se pudieron cargar los departamentos disponibles.';
    }
  }


  async onDemoStateChange(): Promise<void> {

    this.demoForm.controls.location.patchValue({
      city: '',
    });

    const location =
      this.demoForm.controls.location.controls;

    this.locationLoadError = '';

    try {

      this.locationCities =
        await loadCitiesForDepartment(
          location.country.value,
          location.state.value
        );
    } catch {

      this.locationCities = [];

      this.locationLoadError =
        'No se pudieron cargar las ciudades disponibles.';
    }
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

  handleDemoFormSubmit(): void {

    if (this.demoStep === 'agenda') {
      this.requestDemoVerificationCode();
      return;
    }

    if (this.demoStep === 'verification') {
      this.submitDemoRequest();
      return;
    }

    this.goToNextDemoStep();
  }


  requestDemoVerificationCode(isResend = false): void {

    if (this.demoSubmitting) {
      return;
    }

    this.demoSubmitError = '';
    this.demoVerificationMessage = '';

    if (!this.validateDemoRequestFormBeforeSubmit()) {
      return;
    }

    this.updateDemoRequestSummary();

    const requesterEmail =
      this.currentDemoRequesterEmail();

    this.demoSubmitting = !isResend;
    this.demoResendingCode = isResend;

    this.demoRequestService
      .requestEmailVerification({
        requester_email: requesterEmail,
      })
      .pipe(
        finalize(() => {
          this.demoSubmitting = false;
          this.demoResendingCode = false;
        })
      )
      .subscribe({

        next: (response) => {
          this.demoVerificationToken =
            response.email_verification_token;
          this.demoVerificationEmail =
            requesterEmail;
          this.demoVerificationMessage =
            response.detail ||
            'Enviamos un código de verificación a tu correo.';
          this.demoForm.controls.verification.reset();
          this.demoStep = 'verification';
          this.focusCurrentDemoStep();
        },

        error: (error) => {
          this.applyDemoSubmitError(error);
        },
      });
  }


  submitDemoRequest(): void {

    if (this.demoSubmitting) {
      return;
    }

    this.demoSubmitError = '';

    if (!this.validateDemoRequestFormBeforeSubmit()) {
      return;
    }

    const verificationForm =
      this.demoForm.controls.verification;

    verificationForm.markAllAsTouched();

    if (verificationForm.invalid) {
      this.demoStep = 'verification';
      this.focusCurrentDemoStep();
      return;
    }

    if (!this.demoVerificationToken) {
      this.demoStep = 'agenda';
      this.demoSubmitError =
        'Primero solicita el código de verificación enviado a tu correo.';
      this.focusCurrentDemoStep();
      return;
    }

    const requesterEmail =
      this.currentDemoRequesterEmail();

    if (
      this.demoVerificationEmail &&
      this.demoVerificationEmail !== requesterEmail
    ) {
      this.demoStep = 'requester';
      this.demoSubmitError =
        'El correo cambió después de enviar el código. Solicita un código nuevo para este correo.';
      this.demoVerificationToken = '';
      this.demoVerificationEmail = '';
      this.demoVerificationMessage = '';
      this.demoForm.controls.verification.reset();
      this.focusCurrentDemoStep();
      return;
    }

    this.updateDemoRequestSummary();
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
          this.demoVerificationMessage = '';
        },

        error: (error) => {
          this.applyDemoSubmitError(error);
        },
      });
  }


  resendDemoVerificationCode(): void {

    if (
      this.demoSubmitting ||
      this.demoResendingCode
    ) {
      return;
    }

    this.requestDemoVerificationCode(true);
  }


  private validateDemoRequestFormBeforeSubmit(): boolean {

    this.demoForm.markAllAsTouched();
    this.ensureDemoRequesterIdentity();

    if (this.demoForm.controls.requester.invalid) {
      this.demoStep = 'requester';
      this.focusCurrentDemoStep();
      return false;
    }

    if (this.demoForm.controls.hotel.invalid) {
      this.demoStep = 'hotel';
      this.focusCurrentDemoStep();
      return false;
    }

    if (this.demoForm.controls.location.invalid) {
      this.demoStep = 'hotel';
      this.focusCurrentDemoStep();
      return false;
    }

    if (this.demoForm.controls.structure.invalid) {
      this.demoStep = 'structure';
      this.focusCurrentDemoStep();
      return false;
    }

    if (
      this.demoForm.controls.operation.invalid ||
      this.hasSameDemoOperationTimes()
    ) {
      this.demoStep = 'operation';
      this.focusCurrentDemoStep();
      return false;
    }

    return true;
  }


  private updateDemoRequestSummary(): void {

    const hotelName =
      String(
        this.demoForm.controls.hotel.controls
          .hotelName.value || ''
      ).trim();

    this.demoRequestSummary =
      hotelName || 'tu hotel';
  }


  private currentDemoRequesterEmail(): string {

    return String(
      this.demoForm.controls.requester.controls.email.value || ''
    )
      .trim()
      .toLowerCase();
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

            : sectionName === 'verification'
              ? this.demoForm.controls.verification.get(controlName)

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
        '.public-header'
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

  loadDemoCountries(): void {

    if (
      this.locationCountries.length > 0 ||
      this.locationCountriesLoading
    ) {
      return;
    }

    this.locationCountriesLoading = true;
    this.locationLoadError = '';

    loadHotelCountries()
      .then((countries) => {

        this.locationCountries =
          countries;
      })
      .catch(() => {

        this.locationLoadError =
          'No se pudieron cargar los países disponibles.';
      })
      .finally(() => {

        this.locationCountriesLoading = false;
      });
  }


  // =========================================================
  // CARGOS
  // =========================================================

  loadDemoJobTitles(): void {

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
    this.focusCurrentDemoStep();
  }


  private focusCurrentDemoStep(): void {

    const focusTargets: Record<DemoStep, string> = {
      requester: 'demo-contact-name',
      hotel: 'demo-hotel-name',
      structure: 'demo-room-type-name-0',
      operation: 'demo-check-in-time',
      agenda: 'demo-submit-request',
      verification: 'demo-email-code',
    };

    window.setTimeout(() => {
      document
        .getElementById(focusTargets[this.demoStep])
        ?.focus();
    });
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

    const verification =
      this.demoForm.controls.verification
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

      room_types:
        this.buildDemoRoomTypesPayload(),

      floors:
        this.buildDemoFloorsPayload(),

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

      email_verification_token:
        this.demoVerificationToken,

      email_verification_code:
        String(
          verification.code || ''
        ).trim(),
    };
  }


  private buildDemoRoomTypesPayload():
    DemoRequestRoomTypePayload[] {

    return this.demoRoomTypes.controls.map(
      (roomType, index) => ({

        name:
          String(
            roomType.get('name')?.value || ''
          ).trim(),

        capacity:
          Number(
            roomType.get('capacity')?.value || 1
          ),

        bed_count:
          Number(
            roomType.get('bedCount')?.value || 1
          ),

        bed_type:
          String(
            roomType.get('bedType')?.value || ''
          ).trim(),

        billing_mode:
          roomType.get('billingMode')?.value === 'PERSON'
            ? 'PERSON'
            : 'ROOM',

        base_price:
          Number(
            roomType.get('basePrice')?.value || 0
          ),

        sort_order: index,
      })
    );
  }


  private buildDemoFloorsPayload():
    DemoRequestFloorPayload[] {

    return this.demoFloors.controls.map(
      (floor, floorIndex) => {

        const floorNumber =
          Number(
            floor.get('floorNumber')?.value ||
            floorIndex + 1
          );

        return {

          floor_number: floorNumber,

          name:
            String(
              floor.get('name')?.value || ''
            ).trim() || `Piso ${floorNumber}`,

          prefix:
            String(
              floor.get('prefix')?.value || ''
            ).trim() || String(floorNumber),

          room_groups:
            this.demoFloorDistribution(floor)
              .controls
              .map(
                (quantity, roomTypeIndex) => ({
                  room_type_index: roomTypeIndex,
                  quantity: Number(quantity.value || 0),
                })
              )
              .filter(
                (group) => group.quantity > 0
              ),
        };
      }
    );
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

    const requestedUsername =
      String(
        requesterForm.controls.username.value || ''
      ).trim();

    const username =
      requestedUsername
        ? this.normalizeDemoUsername(requestedUsername)
        : '';

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
