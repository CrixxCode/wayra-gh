import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { AuthService, hasResourceScope } from '../../../services/auth/auth';
import { MotionService } from '../../../services/motion';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { ReservationService } from '../../../services/reservation';
import { RoomService } from '../../../services/room';
import { CleaningTaskI } from '../../cleaning-tasks/cleaning-task-model';
import {
  AmenityI,
  HotelFloorI,
  RateI,
  RoomI,
  RoomTypeI,
  RoomVisualStatus
} from '../room-model';
import { CreateRoom } from '../create-room/create-room';
import { RoomCheckModal, RoomCheckMode } from '../room-check-modal/room-check-modal';
import { RoomModal } from '../room-modal/room-modal';
import { RoomTypesManager } from '../managers/room-types-manager/room-types-manager';
import { RatesManager } from '../managers/rates-manager/rates-manager';

type ViewMode = 'cards' | 'table' | 'board';
type RoomQuickAction = 'confirm' | 'check-in' | 'check-out' | 'complete-cleaning' | 'manage';
type OperationalFilter =
  | 'ALL'
  | 'NEEDS_ACTION'
  | 'CHECKIN_READY'
  | 'CHECKOUT_SOON'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'PENDING_BALANCE'
  | 'UNCONFIGURED';

/**
 * Indicador compacto de la tarjeta: un hecho que la habitacion arrastra y que recepcion
 * debe ver sin abrirla. El *estado* no va aqui, lo dice el chip de la cabecera; estos
 * son solo los pendientes (saldo, consumos, limpieza, mantenimiento, inventario).
 */
export type RoomBadge = {
  key: string;
  icon: string;
  label: string;
  title: string;
  tone: 'danger' | 'warning' | 'info';
};

/**
 * Tarjeta del resumen del dia. No es un conteo por estado (para eso estan las
 * pestanas de estado): cada una responde "que toca hacer" y al pulsarla filtra el
 * tablero por ese trabajo.
 */
export type DaySummaryCard = {
  key: string;
  label: string;
  icon: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  count: number;
  note: string;
  filter: OperationalFilter;
};

type StatusStyle = {
  bg: string;
  color: string;
  dot: string;
  border: string;
  buttonBg: string;
  buttonColor: string;
};

export type FloorGroup = {
  key: string;
  floorId: number | null;
  name: string;
  floorNumber: number | null;
  rangeLabel: string;
  rooms: RoomI[];
};

/** Columna del tablero: un estado operativo y las habitaciones que estan en el. */
export type BoardColumn = {
  key: RoomVisualStatus;
  label: string;
  rooms: RoomI[];
};

@Component({
  selector: 'app-list-rooms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CreateRoom,
    RoomModal,
    RoomCheckModal,
    RoomTypesManager,
    RatesManager
  ],
  templateUrl: './list-rooms.html',
  styleUrls: ['./list-rooms.css']
})
export class ListRooms implements OnInit, OnDestroy {
  loading = false;
  errorMessage = '';
  quickActionError = '';
  /** `rooms.read_guest_data`: documento del huesped y saldo por cobrar. */
  canReadGuestData = false;

  rooms: RoomI[] = [];
  filteredRooms: RoomI[] = [];
  floorGroups: FloorGroup[] = [];
  boardColumns: BoardColumn[] = [];

  floors: HotelFloorI[] = [];
  roomTypes: RoomTypeI[] = [];
  amenities: AmenityI[] = [];
  rates: RateI[] = [];

  search = '';
  statusFilter: RoomVisualStatus | 'ALL' = 'ALL';
  operationalFilter: OperationalFilter = 'ALL';
  floorFilter: number | 'ALL' = 'ALL';
  viewMode: ViewMode = 'cards';

  // Modales
  showCreateDrawer = false;
  selectedRoom: RoomI | null = null;
  checkModalRoom: RoomI | null = null;
  checkModalMode: RoomCheckMode = 'check-in';
  showRoomTypesManager = false;
  showRatesManager = false;
  ratesManagerFocusTypeId: number | null = null;

  private roomTypeMap = new Map<number, RoomTypeI>();
  private rateMap = new Map<number, RateI>();
  private roomOverrides = new Map<number, RoomI>();
  private quickActionLoadingIds = new Set<string>();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private revealFrame: number | null = null;
  currentTime = new Date();

  readonly statusTabs: Array<{ key: RoomVisualStatus | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'Todas' },
    { key: 'DISPONIBLE', label: 'Disponible' },
    { key: 'RESERVADA', label: 'Reservada' },
    { key: 'OCUPADA', label: 'Ocupada' },
    { key: 'POR_SALIR_HOY', label: 'Por salir hoy' },
    { key: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { key: 'SIN_CONFIGURAR', label: 'Sin configurar' }
  ];

  /**
   * Columnas del tablero. Las seis primeras son el recorrido normal de una habitacion
   * y se muestran siempre, aunque esten vacias, para que recepcion lea el hotel en la
   * misma posicion todos los dias. Las dos ultimas solo aparecen si tienen algo.
   */
  readonly boardStatuses: Array<{ key: RoomVisualStatus; label: string; always: boolean }> = [
    { key: 'DISPONIBLE', label: 'Disponibles', always: true },
    { key: 'RESERVADA', label: 'Reservadas', always: true },
    { key: 'OCUPADA', label: 'Ocupadas', always: true },
    { key: 'POR_SALIR_HOY', label: 'Por salir', always: true },
    { key: 'LIMPIEZA', label: 'Limpieza', always: true },
    { key: 'MANTENIMIENTO', label: 'Mantenimiento', always: true },
    { key: 'SIN_CONFIGURAR', label: 'Sin configurar', always: false },
    { key: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio', always: false }
  ];

  readonly statusOptions: Array<{ value: RoomVisualStatus | 'ALL'; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'DISPONIBLE', label: 'Disponible' },
    { value: 'RESERVADA', label: 'Reservada' },
    { value: 'OCUPADA', label: 'Ocupada' },
    { value: 'POR_SALIR_HOY', label: 'Por salir hoy' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { value: 'LIMPIEZA', label: 'Limpieza' },
    { value: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio' },
    { value: 'SIN_CONFIGURAR', label: 'Sin configurar' }
  ];

  /** Filtros visibles: los de datos del huesped se caen sin `rooms.read_guest_data`. */
  get visibleOperationalFilters(): Array<{
    key: OperationalFilter;
    label: string;
    icon: string;
    hint: string;
  }> {
    if (this.canReadGuestData) return this.operationalFilters;
    return this.operationalFilters.filter((filter) => filter.key !== 'PENDING_BALANCE');
  }

  readonly operationalFilters: Array<{
    key: OperationalFilter;
    label: string;
    icon: string;
    hint: string;
  }> = [
    {
      key: 'ALL',
      label: 'Todas',
      icon: 'fa-solid fa-border-all',
      hint: 'Sin filtro operativo'
    },
    {
      key: 'NEEDS_ACTION',
      label: 'Requieren accion',
      icon: 'fa-solid fa-bolt',
      hint: 'Cualquier habitacion con algo pendiente ahora mismo'
    },
    {
      key: 'CHECKIN_READY',
      label: 'Check-in listo',
      icon: 'fa-solid fa-right-to-bracket',
      hint: 'Reservas confirmadas que ya pueden ingresar'
    },
    {
      key: 'CHECKOUT_SOON',
      label: 'Salida proxima',
      icon: 'fa-regular fa-clock',
      hint: 'Salidas dentro de las proximas 4 horas o ya vencidas'
    },
    {
      key: 'CLEANING',
      label: 'Limpieza pendiente',
      icon: 'fa-solid fa-broom',
      hint: 'En estado limpieza o con tareas de limpieza abiertas'
    },
    {
      key: 'MAINTENANCE',
      label: 'Mantenimiento abierto',
      icon: 'fa-solid fa-screwdriver-wrench',
      hint: 'En mantenimiento o con ordenes sin cerrar'
    },
    {
      key: 'PENDING_BALANCE',
      label: 'Por cobrar',
      icon: 'fa-solid fa-money-bill-wave',
      hint: 'Saldo de la reserva pendiente o consumos aun sin facturar'
    },
    {
      key: 'UNCONFIGURED',
      label: 'Sin configurar',
      icon: 'fa-solid fa-triangle-exclamation',
      hint: 'Sin tipo o sin tarifa: no se pueden reservar'
    }
  ];

  constructor(
    private roomService: RoomService,
    private reservationService: ReservationService,
    private cleaningTasksService: CleaningTasksService,
    private authService: AuthService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.loadGuestDataPermission();
    this.loadModuleData();
    this.countdownTimer = setInterval(() => {
      this.currentTime = new Date();
      // Los filtros y conteos de "salida proxima" dependen de la hora: sin recalcular,
      // una habitacion cuya salida vence deja de aparecer hasta el proximo refresco.
      this.applyFilters();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    if (this.revealFrame !== null) {
      cancelAnimationFrame(this.revealFrame);
    }
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // --------------------------------------------------------------- animacion

  /**
   * Entrada escalonada de la vista.
   *
   * Se dispara cuando **cambia el contenido** (carga inicial, cambio de vista, cambio
   * de filtro operativo o de estado), nunca en cada tecla del buscador: animar mientras
   * se escribe se siente como parpadeo, no como fluidez.
   *
   * Corre fuera de la zona de Angular porque GSAP anima con `requestAnimationFrame`;
   * dentro de la zona dispararia una deteccion de cambios por frame.
   */
  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      // Un frame de espera para que Angular ya haya pintado las tarjetas nuevas.
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.stat-card'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.floor-block, .board-column'), {
          stagger: 0.06,
          y: 16,
          delay: 0.05
        });
        this.motion.reveal(host.querySelectorAll('.room-card, .board-room'), {
          stagger: 0.015,
          y: 10,
          duration: 0.28,
          delay: 0.08
        });
        this.motion.reveal(host.querySelectorAll('.table-card tbody tr'), {
          stagger: 0.012,
          y: 8,
          duration: 0.24
        });
      });
    });
  }

  // ------------------------------------------------------------- indicadores

  get totalRooms(): number {
    return this.rooms.length;
  }

  get availableCount(): number {
    return this.rooms.filter((room) => this.getVisualStatus(room) === 'DISPONIBLE').length;
  }

  get occupiedCount(): number {
    return this.rooms.filter((room) => this.getVisualStatus(room) === 'OCUPADA').length;
  }

  get reservedCount(): number {
    return this.rooms.filter((room) => this.getVisualStatus(room) === 'RESERVADA').length;
  }

  get maintenanceCount(): number {
    return this.rooms.filter((room) => this.getVisualStatus(room) === 'MANTENIMIENTO').length;
  }

  get leavingTodayCount(): number {
    return this.rooms.filter((room) => this.isPorSalirHoy(room)).length;
  }

  get hasFloors(): boolean {
    return this.floors.length > 0;
  }

  get roomsWithoutType(): number {
    return this.rooms.filter((room) => !this.isRoomConfigured(room)).length;
  }

  get urgentMaintenanceCount(): number {
    return this.rooms.filter((room) => (room.operations?.urgent_maintenance || 0) > 0).length;
  }

  get pendingBalanceTotal(): number {
    return this.rooms.reduce((total, room) => total + this.getPendingTotal(room), 0);
  }

  get unbilledChargesTotal(): number {
    return this.rooms.reduce((total, room) => total + this.getUnbilledCharges(room), 0);
  }

  get occupancyLabel(): string {
    if (!this.totalRooms) return 'Sin habitaciones registradas';
    return `${this.availableCount} disponibles de ${this.totalRooms} · ${this.occupiedCount} ocupadas`;
  }

  /**
   * Resumen del dia: seis frentes de trabajo, cada uno con su atajo de filtro.
   * Reemplaza a los conteos por estado, que ya viven en las pestanas de abajo.
   */
  get daySummary(): DaySummaryCard[] {
    const urgent = this.urgentMaintenanceCount;
    const pendingBalance = this.getOperationalCount('PENDING_BALANCE');

    const cards: DaySummaryCard[] = [
      {
        key: 'check-in',
        label: 'Check-ins listos',
        icon: 'fa-solid fa-right-to-bracket',
        tone: 'success',
        count: this.getOperationalCount('CHECKIN_READY'),
        note: `${this.reservedCount} reservada(s) en total`,
        filter: 'CHECKIN_READY'
      },
      {
        key: 'check-out',
        label: 'Salidas proximas',
        icon: 'fa-regular fa-clock',
        tone: 'warning',
        count: this.getOperationalCount('CHECKOUT_SOON'),
        note: `${this.leavingTodayCount} salida(s) hoy`,
        filter: 'CHECKOUT_SOON'
      },
      {
        key: 'cleaning',
        label: 'Limpieza pendiente',
        icon: 'fa-solid fa-broom',
        tone: 'info',
        count: this.getOperationalCount('CLEANING'),
        note: 'Bloquea la proxima venta',
        filter: 'CLEANING'
      },
      {
        key: 'maintenance',
        label: 'Mantenimiento',
        icon: 'fa-solid fa-screwdriver-wrench',
        tone: 'danger',
        count: this.getOperationalCount('MAINTENANCE'),
        note: urgent ? `${urgent} urgente(s)` : 'Sin ordenes urgentes',
        filter: 'MAINTENANCE'
      },
      {
        key: 'balance',
        label: 'Por cobrar',
        icon: 'fa-solid fa-money-bill-wave',
        tone: 'danger',
        count: pendingBalance,
        note: pendingBalance
          ? `${this.formatMoney(this.pendingBalanceTotal)} de saldo · ${this.formatMoney(this.unbilledChargesTotal)} en consumos`
          : 'Todo cobrado',
        filter: 'PENDING_BALANCE'
      },
      {
        key: 'unconfigured',
        label: 'Sin configurar',
        icon: 'fa-solid fa-triangle-exclamation',
        tone: 'warning',
        count: this.getOperationalCount('UNCONFIGURED'),
        note: 'No se pueden reservar',
        filter: 'UNCONFIGURED'
      }
    ];

    if (this.canReadGuestData) return cards;
    return cards.filter((card) => card.key !== 'balance');
  }

  trackBySummary(_: number, card: DaySummaryCard): string {
    return card.key;
  }

  // ------------------------------------------------------------------ carga

  /**
   * El backend ya devuelve los montos en null sin `rooms.read_guest_data`; esto solo
   * evita pintar el filtro y la tarjeta de saldo, que sin permiso mostrarian un cero
   * enganoso.
   */
  private loadGuestDataPermission(): void {
    this.authService
      .getUserInfo()
      .pipe(catchError(() => of(null)))
      .subscribe((user) => {
        this.canReadGuestData = hasResourceScope(user, 'rooms.read_guest_data');
        if (!this.canReadGuestData && this.operationalFilter === 'PENDING_BALANCE') {
          this.selectOperationalFilter('ALL');
        }
      });
  }

  /**
   * `forceRefresh` es lo que usa el boton de actualizar: salta el cache-aside y lo
   * repuebla. La carga normal se sirve del cache, que es lo que evita repetir las
   * cinco peticiones cada vez que se entra a la vista.
   */
  loadModuleData(forceRefresh = false): void {
    this.loading = true;
    this.errorMessage = '';

    if (forceRefresh) {
      this.roomService.invalidateRoomModuleCache();
    }

    forkJoin({
      rooms: this.roomService.listRooms({ forceRefresh }).pipe(catchError(() => of([] as RoomI[]))),
      roomTypes: this.roomService.listRoomTypes().pipe(catchError(() => of([] as RoomTypeI[]))),
      amenities: this.roomService.listAmenities().pipe(catchError(() => of([] as AmenityI[]))),
      floors: this.roomService.listFloors().pipe(catchError(() => of([] as HotelFloorI[]))),
      rates: this.roomService.listRates().pipe(catchError(() => of([] as RateI[])))
    }).subscribe({
      next: ({ rooms, roomTypes, amenities, floors, rates }) => {
        this.loading = false;
        this.rooms = rooms;
        this.roomTypes = roomTypes;
        this.amenities = amenities;
        this.floors = floors;
        this.rates = rates;
        this.buildMaps();
        this.applyFilters();
        this.syncSelectedRoom();
        this.scheduleReveal();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se pudo cargar el modulo de habitaciones.';
      }
    });
  }

  refreshRooms(): void {
    // Siempre fresco: se llama despues de una accion, cuando el cache ya no vale.
    this.roomService.listRooms({ forceRefresh: true }).subscribe({
      next: (rooms) => {
        this.rooms = rooms.map((room) => {
          const override = this.roomOverrides.get(room.id);
          return override ? { ...room, ...override } : room;
        });
        this.applyFilters();
        this.syncSelectedRoom();
      },
      error: () => {
        this.errorMessage = 'No se pudieron actualizar las habitaciones.';
      }
    });
  }

  refreshRoomById(roomId: number): void {
    this.roomService.getRoomById(roomId).subscribe({
      next: (room) => {
        this.roomOverrides.delete(room.id);
        this.mergeRoom(room);
      },
      error: () => {
        this.refreshRooms();
      }
    });
  }

  // --------------------------------------------------------------- filtrado

  applyFilters(): void {
    // Cada palabra se exige por separado, asi "juan 101" encuentra al huesped Juan en
    // la 101 y no habitaciones que solo cumplen una de las dos condiciones.
    const searchTerms = this.normalizeText(this.search).split(/\s+/).filter(Boolean);

    this.filteredRooms = this.rooms.filter((room) => {
      const visualStatus = this.getVisualStatus(room);
      const statusMatch = this.statusFilter === 'ALL' ? true : visualStatus === this.statusFilter;
      const operationalMatch = this.matchesOperationalFilter(room, this.operationalFilter);
      const floorMatch = this.floorFilter === 'ALL' ? true : room.floor === this.floorFilter;

      const searchMatch =
        !searchTerms.length ||
        (() => {
          const pool = this.buildSearchPool(room);
          return searchTerms.every((term) => pool.includes(term));
        })();

      return statusMatch && operationalMatch && floorMatch && searchMatch;
    });

    this.floorGroups = this.buildFloorGroups(this.filteredRooms);
    this.boardColumns = this.buildBoardColumns(this.filteredRooms);
  }

  selectStatus(status: RoomVisualStatus | 'ALL'): void {
    this.statusFilter = status;
    this.applyFilters();
    this.scheduleReveal();
  }

  selectOperationalFilter(filter: OperationalFilter): void {
    this.operationalFilter = filter;
    this.applyFilters();
    this.scheduleReveal();
  }

  /** Desde el resumen del dia: volver a pulsar la misma tarjeta quita el filtro. */
  toggleOperationalFilter(filter: OperationalFilter): void {
    this.selectOperationalFilter(this.operationalFilter === filter ? 'ALL' : filter);
  }

  clearFilters(): void {
    this.search = '';
    this.statusFilter = 'ALL';
    this.operationalFilter = 'ALL';
    this.floorFilter = 'ALL';
    this.applyFilters();
  }

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.scheduleReveal();
  }

  // ---------------------------------------------------------------- modales

  openCreateDrawer(): void {
    if (!this.hasFloors) return;
    this.selectedRoom = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onRoomCreated(): void {
    this.showCreateDrawer = false;
    this.refreshRooms();
  }

  openRoom(room: RoomI): void {
    this.showCreateDrawer = false;
    this.selectedRoom = room;
  }

  closeRoomModal(): void {
    this.selectedRoom = null;
  }

  onRoomSaved(updatedRoom?: RoomI): void {
    if (updatedRoom?.id) {
      this.mergeRoom(updatedRoom);
      this.refreshRoomById(updatedRoom.id);
      return;
    }
    this.refreshRooms();
  }

  openRoomTypesManager(): void {
    this.showRoomTypesManager = true;
  }

  closeRoomTypesManager(): void {
    this.showRoomTypesManager = false;
  }

  openRatesManager(focusTypeId: number | null = null): void {
    this.ratesManagerFocusTypeId = focusTypeId;
    this.showRoomTypesManager = false;
    this.showRatesManager = true;
  }

  closeRatesManager(): void {
    this.showRatesManager = false;
    this.ratesManagerFocusTypeId = null;
  }

  /** Un gestor cambio el catalogo: recargamos todo para reflejarlo en tarjetas y modal. */
  onCatalogChanged(): void {
    this.loadModuleData();
  }

  // ------------------------------------------------------------- exportacion

  exportCsv(): void {
    if (!this.filteredRooms.length) return;

    const headers = ['habitacion', 'estado', 'piso', 'tipo', 'huesped', 'checkout', 'precio'];

    const rows = this.filteredRooms.map((room) => {
      const row = [
        room.number || `Hab-${room.id}`,
        this.getStatusLabel(room),
        room.floor_name || '',
        this.getRoomTypeName(room),
        this.getGuestLabel(room),
        this.getCheckoutLabel(room),
        this.getPriceLabel(room)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `habitaciones-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // --------------------------------------------------------------- etiquetas

  getStatusCount(status: RoomVisualStatus | 'ALL'): number {
    if (status === 'ALL') return this.rooms.length;
    return this.rooms.filter((room) => this.getVisualStatus(room) === status).length;
  }

  getOperationalCount(filter: OperationalFilter): number {
    return this.rooms.filter((room) => this.matchesOperationalFilter(room, filter)).length;
  }

  hasActiveFilters(): boolean {
    return (
      this.search.trim().length > 0 ||
      this.statusFilter !== 'ALL' ||
      this.operationalFilter !== 'ALL' ||
      this.floorFilter !== 'ALL'
    );
  }

  getRoomTypeName(room: RoomI): string {
    return this.getRoomType(room)?.name || room.room_type_name || 'Sin tipo';
  }

  getRoomTypeBeds(room: RoomI): string {
    const roomType = this.getRoomType(room);
    if (!roomType) return 'Sin configuracion';

    const bedCount = roomType.bed_count || 0;
    const bedType = roomType.bed_type || 'cama';
    const capacity = roomType.capacity || 1;
    return `${bedCount} ${bedType} - ${capacity} huesped(es)`;
  }

  getCardTypeSummary(room: RoomI): string {
    const roomTypeName = this.getRoomTypeName(room);
    const roomType = this.getRoomType(room);
    if (!roomType?.bed_count) return roomTypeName;

    const bedWord = roomType.bed_count === 1 ? 'Cama' : 'Camas';
    return `${roomTypeName} - ${roomType.bed_count} ${bedWord}`;
  }

  getPriceLabel(room: RoomI): string {
    const rateId = this.getRoomRateId(room);
    const rate = rateId ? this.rateMap.get(rateId) : null;
    const price = rate?.price ?? room.rate_price;
    if (price === null || price === undefined || price === '') return '--';
    const asNumber = Number(price);
    if (Number.isNaN(asNumber)) return `${price}`;

    return this.formatMoney(asNumber);
  }

  getStatusLabel(room: RoomI): string {
    switch (this.getVisualStatus(room)) {
      case 'DISPONIBLE':
        return 'Disponible';
      case 'OCUPADA':
        return 'Ocupada';
      case 'RESERVADA':
        return 'Reservada';
      case 'POR_SALIR_HOY':
        return 'Por salir hoy';
      case 'MANTENIMIENTO':
        return 'Mantenimiento';
      case 'SIN_CONFIGURAR':
        return 'Sin configurar';
      case 'LIMPIEZA':
        return 'Limpieza';
      case 'FUERA_DE_SERVICIO':
        return 'Fuera de servicio';
      default:
        return 'Sin estado';
    }
  }

  getQuickActionLabel(room: RoomI): string {
    switch (this.getQuickAction(room)) {
      case 'confirm':
        return 'Confirmar';
      case 'check-in':
        return 'Check-In';
      case 'check-out':
        return 'Check-Out';
      case 'complete-cleaning':
        return 'Completar';
      default:
        return 'Gestionar';
    }
  }

  getQuickActionIcon(room: RoomI): string {
    switch (this.getQuickAction(room)) {
      case 'confirm':
        return 'fa-solid fa-check';
      case 'check-in':
        return 'fa-solid fa-right-to-bracket';
      case 'check-out':
        return 'fa-solid fa-right-from-bracket';
      case 'complete-cleaning':
        return 'fa-solid fa-check-double';
      default:
        return 'fa-solid fa-sliders';
    }
  }

  getQuickActionClass(room: RoomI): string {
    return `quick-action-${this.getQuickAction(room)}`;
  }

  hasSecondaryManageAction(room: RoomI): boolean {
    return this.getQuickAction(room) !== 'manage';
  }

  isQuickActionLoading(room: RoomI): boolean {
    return this.quickActionLoadingIds.has(this.getQuickActionLoadingKey(room));
  }

  runQuickAction(room: RoomI): void {
    this.quickActionError = '';
    const action = this.getQuickAction(room);
    if (action === 'manage') {
      this.openRoom(room);
      return;
    }

    // El ingreso y la salida no se ejecutan de un clic: abren la verificacion.
    // Entrar sin contrastar documentos, o cerrar sin mirar saldo e inventario, son
    // los dos errores caros de recepcion.
    if ((action === 'check-in' || action === 'check-out') && room.active_reservation?.id) {
      this.openCheckModal(room, action);
      return;
    }

    const reservationId = room.active_reservation?.id;
    const loadingKey = this.getQuickActionLoadingKey(room, action);
    if (this.quickActionLoadingIds.has(loadingKey)) return;
    this.quickActionLoadingIds.add(loadingKey);

    if (action === 'confirm' && reservationId) {
      this.reservationService.confirmReservation(reservationId).subscribe({
        next: () => this.finishQuickAction(room.id, loadingKey),
        error: () => this.failQuickAction(loadingKey, 'No se pudo confirmar la reserva.')
      });
      return;
    }

    if (action === 'complete-cleaning') {
      this.completeFirstOpenCleaningTask(room, loadingKey);
      return;
    }

    this.quickActionLoadingIds.delete(loadingKey);
    this.openRoom(room);
  }

  // ------------------------------------------------- verificacion de ingreso/salida

  openCheckModal(room: RoomI, mode: RoomCheckMode): void {
    this.checkModalRoom = room;
    this.checkModalMode = mode;
  }

  closeCheckModal(): void {
    this.checkModalRoom = null;
  }

  onCheckConfirmed(): void {
    const roomId = this.checkModalRoom?.id;
    this.closeCheckModal();
    this.roomService.invalidateRoomsCache();
    if (roomId) this.refreshRoomById(roomId);
  }

  getStatusStyle(room: RoomI): StatusStyle {
    return this.getStatusStyleFor(this.getVisualStatus(room));
  }

  /** Mismo vocabulario de color para la tabla, el chip y las columnas del tablero. */
  getStatusStyleFor(status: RoomVisualStatus): StatusStyle {
    switch (status) {
      case 'DISPONIBLE':
        return {
          bg: 'var(--gh-status-success-bg)',
          color: 'var(--gh-status-success-text)',
          dot: 'var(--gh-status-success-strong)',
          border: 'var(--gh-status-success-border)',
          buttonBg: 'var(--gh-brand)',
          buttonColor: 'var(--gh-on-brand)'
        };
      case 'OCUPADA':
        return {
          bg: 'var(--gh-status-info-bg)',
          color: 'var(--gh-status-info-text)',
          dot: 'var(--gh-status-info-strong)',
          border: 'var(--gh-status-info-border)',
          buttonBg: 'var(--gh-surface-soft)',
          buttonColor: 'var(--gh-text)'
        };
      case 'RESERVADA':
        return {
          bg: 'var(--gh-status-info-bg)',
          color: 'var(--gh-status-info-text)',
          dot: 'var(--gh-status-info-strong)',
          border: 'var(--gh-status-info-border)',
          buttonBg: 'var(--gh-brand)',
          buttonColor: 'var(--gh-on-brand)'
        };
      case 'POR_SALIR_HOY':
        return {
          bg: 'var(--gh-status-warn-bg)',
          color: 'var(--gh-status-warn-text)',
          dot: 'var(--gh-status-warn-strong)',
          border: 'var(--gh-status-warn-border)',
          buttonBg: 'var(--gh-status-danger-strong)',
          buttonColor: 'var(--gh-on-brand)'
        };
      case 'MANTENIMIENTO':
        return {
          bg: 'var(--gh-status-danger-bg)',
          color: 'var(--gh-status-danger-text)',
          dot: 'var(--gh-status-danger-strong)',
          border: 'var(--gh-status-danger-border)',
          buttonBg: 'var(--gh-surface-soft)',
          buttonColor: 'var(--gh-text-soft)'
        };
      case 'SIN_CONFIGURAR':
        return {
          bg: 'var(--gh-status-warn-bg)',
          color: 'var(--gh-status-warn-text)',
          dot: 'var(--gh-status-warn-strong)',
          border: 'var(--gh-status-warn-border)',
          buttonBg: 'var(--gh-brand)',
          buttonColor: 'var(--gh-on-brand)'
        };
      case 'LIMPIEZA':
        return {
          bg: 'var(--gh-status-info-bg)',
          color: 'var(--gh-status-info-text)',
          dot: 'var(--gh-status-info-strong)',
          border: 'var(--gh-status-info-border)',
          buttonBg: 'var(--gh-surface-soft)',
          buttonColor: 'var(--gh-text-muted)'
        };
      default:
        return {
          bg: 'var(--gh-status-neutral-bg)',
          color: 'var(--gh-status-neutral-text)',
          dot: 'var(--gh-status-neutral-text)',
          border: 'var(--gh-status-neutral-border)',
          buttonBg: 'var(--gh-surface-soft)',
          buttonColor: 'var(--gh-text-soft)'
        };
    }
  }

  getCardStatusClass(room: RoomI): string {
    return this.getStatusClassFor(this.getVisualStatus(room));
  }

  getStatusClassFor(status: RoomVisualStatus): string {
    switch (status) {
      case 'DISPONIBLE':
        return 'is-available';
      case 'OCUPADA':
        return 'is-occupied';
      case 'POR_SALIR_HOY':
        return 'is-leaving-today';
      case 'MANTENIMIENTO':
        return 'is-maintenance';
      case 'SIN_CONFIGURAR':
        return 'is-unconfigured';
      case 'RESERVADA':
        return 'is-reserved';
      case 'LIMPIEZA':
        return 'is-cleaning';
      default:
        return 'is-out-of-service';
    }
  }

  getMaintenanceText(room: RoomI): string {
    if (room.status !== 'MANTENIMIENTO') return '';
    return room.notes?.trim() || 'Mantenimiento preventivo en proceso';
  }

  hasReservationInfo(room: RoomI): boolean {
    const visualStatus = this.getVisualStatus(room);
    if (!['RESERVADA', 'OCUPADA', 'POR_SALIR_HOY'].includes(visualStatus)) return false;
    return !!room.active_reservation;
  }

  getGuestLabel(room: RoomI): string {
    const name = room.active_reservation?.client_name?.trim();
    return name || 'Huesped no asignado';
  }

  getCheckoutLabel(room: RoomI): string {
    const checkOut = room.active_reservation?.expected_check_out;
    if (!checkOut) return '--';
    if (this.isToday(checkOut)) return 'Hoy';

    const parsed = this.parseDate(checkOut);
    if (!parsed) return '--';

    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
      .format(parsed)
      .replace('.', '');
  }

  getCheckoutCountdownLabel(room: RoomI): string {
    const target = this.getCheckoutTarget(room);
    if (!target) return '';

    const diffMs = target.getTime() - this.currentTime.getTime();
    if (diffMs <= 0) return 'Salida vencida';

    const totalMinutes = Math.ceil(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      const hourText = hours > 0 ? ` ${hours} h` : '';
      return `Quedan ${days} d${hourText}`;
    }

    if (hours > 0) {
      const minuteText = minutes > 0 ? ` ${minutes} min` : '';
      return `Quedan ${hours} h${minuteText}`;
    }

    return `Quedan ${minutes} min`;
  }

  getCheckoutCountdownClass(room: RoomI): string {
    const target = this.getCheckoutTarget(room);
    if (!target) return '';

    const diffMs = target.getTime() - this.currentTime.getTime();
    if (diffMs <= 0) return 'is-expired';
    if (diffMs <= 2 * 60 * 60 * 1000) return 'is-urgent';
    if (diffMs <= 6 * 60 * 60 * 1000) return 'is-soon';
    return '';
  }

  trackByRoom(_: number, room: RoomI): number {
    return room.id;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  trackByGroup(_: number, group: FloorGroup): string {
    return group.key;
  }

  trackByColumn(_: number, column: BoardColumn): string {
    return column.key;
  }

  // ---------------------------------------------------------------- privados

  private buildMaps(): void {
    this.roomTypeMap = new Map(this.roomTypes.map((roomType) => [roomType.id, roomType]));
    this.rateMap = new Map(this.rates.map((rate) => [rate.id, rate]));
  }

  private mergeRoom(updatedRoom: RoomI): void {
    this.roomOverrides.set(updatedRoom.id, updatedRoom);
    this.rooms = this.rooms.map((room) =>
      room.id === updatedRoom.id ? { ...room, ...updatedRoom } : room
    );
    if (this.selectedRoom?.id === updatedRoom.id) {
      this.selectedRoom = { ...this.selectedRoom, ...updatedRoom };
    }
    this.applyFilters();
  }

  /**
   * Agrupa por piso. El rango se calcula con las habitaciones reales, no con
   * HotelFloor.room_count, que se desincroniza al crear habitaciones a mano.
   */
  private buildFloorGroups(rooms: RoomI[]): FloorGroup[] {
    const groups = new Map<string, FloorGroup>();

    for (const room of rooms) {
      const floor = this.floors.find((item) => item.id === room.floor) || null;
      const key = floor ? `floor-${floor.id}` : 'sin-piso';

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          floorId: floor?.id ?? null,
          name: floor?.name || room.floor_name || 'Sin piso asignado',
          floorNumber: floor?.floor_number ?? null,
          rangeLabel: '',
          rooms: []
        });
      }

      groups.get(key)!.rooms.push(room);
    }

    const ordered = [...groups.values()].sort((a, b) => {
      if (a.floorNumber === null) return 1;
      if (b.floorNumber === null) return -1;
      return a.floorNumber - b.floorNumber;
    });

    for (const group of ordered) {
      group.rooms.sort((a, b) =>
        (a.number || '').localeCompare(b.number || '', 'es', { numeric: true })
      );
      group.rangeLabel = this.buildRangeLabel(group.rooms);
    }

    return ordered;
  }

  /**
   * Agrupa por estado operativo, no por piso: en el tablero el piso pasa a ser un dato
   * dentro de la tarjeta. Respeta los filtros activos, asi que el tablero muestra lo
   * mismo que las otras vistas, solo que ordenado por lo que hay que hacer.
   */
  private buildBoardColumns(rooms: RoomI[]): BoardColumn[] {
    const byStatus = new Map<RoomVisualStatus, RoomI[]>();

    for (const room of rooms) {
      const status = this.getVisualStatus(room);
      if (!byStatus.has(status)) byStatus.set(status, []);
      byStatus.get(status)!.push(room);
    }

    const columns: BoardColumn[] = [];
    for (const definition of this.boardStatuses) {
      const columnRooms = byStatus.get(definition.key) || [];
      if (!definition.always && !columnRooms.length) continue;

      columnRooms.sort((a, b) =>
        (a.number || '').localeCompare(b.number || '', 'es', { numeric: true })
      );
      columns.push({ key: definition.key, label: definition.label, rooms: columnRooms });
    }

    return columns;
  }

  private buildRangeLabel(rooms: RoomI[]): string {
    if (!rooms.length) return '';
    if (rooms.length === 1) return rooms[0].number || '';
    return `${rooms[0].number} - ${rooms[rooms.length - 1].number}`;
  }

  /** Tras recargar, reapunta el modal abierto a la version fresca de la habitacion. */
  private syncSelectedRoom(): void {
    if (!this.selectedRoom) return;
    const fresh = this.rooms.find((room) => room.id === this.selectedRoom?.id);
    this.selectedRoom = fresh || null;
  }

  private getRoomRateId(room: RoomI): number | null {
    const value = room.rate as unknown;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (value && typeof value === 'object' && 'id' in value) {
      const parsed = Number((value as { id?: unknown }).id);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private getRoomType(room: RoomI): RoomTypeI | null {
    if (!room.room_type) return null;
    return this.roomTypeMap.get(room.room_type) || null;
  }

  private getVisualStatus(room: RoomI): RoomVisualStatus {
    if (['MANTENIMIENTO', 'LIMPIEZA', 'FUERA_DE_SERVICIO'].includes(room.status)) {
      return room.status;
    }

    const reservationStatus = this.normalizeCode(room.active_reservation?.status);
    const hasActiveReservation = !!room.active_reservation;
    const hasCheckIn = !!room.active_reservation?.real_check_in;

    if (hasActiveReservation) {
      if (
        hasCheckIn ||
        ['EN_CURSO', 'CHECKED_IN', 'IN_PROGRESS', 'HOSPEDADO', 'OCUPADA'].includes(
          reservationStatus
        )
      ) {
        if (this.isPorSalirHoy(room)) return 'POR_SALIR_HOY';
        return 'OCUPADA';
      }

      if (
        ['PENDIENTE', 'CONFIRMADA', 'PENDING', 'CONFIRMADO', 'CONFIRMED'].includes(
          reservationStatus
        )
      ) {
        return 'RESERVADA';
      }
    }

    if (!this.isRoomConfigured(room)) return 'SIN_CONFIGURAR';
    if (this.isPorSalirHoy(room)) return 'POR_SALIR_HOY';
    return room.status;
  }

  private isRoomConfigured(room: RoomI): boolean {
    return !!room.room_type && !!this.getRoomRateId(room);
  }

  private matchesOperationalFilter(room: RoomI, filter: OperationalFilter): boolean {
    if (filter === 'ALL') return true;

    switch (filter) {
      case 'NEEDS_ACTION':
        return this.roomNeedsAction(room);
      case 'CHECKIN_READY':
        return this.isCheckInReady(room);
      case 'CHECKOUT_SOON':
        return this.isCheckoutSoon(room);
      case 'CLEANING':
        return this.hasPendingCleaning(room);
      case 'MAINTENANCE':
        return this.hasOpenMaintenance(room);
      case 'PENDING_BALANCE':
        return this.hasPendingBalance(room);
      case 'UNCONFIGURED':
        return !this.isRoomConfigured(room);
      default:
        return true;
    }
  }

  private roomNeedsAction(room: RoomI): boolean {
    const visualStatus = this.getVisualStatus(room);
    return (
      visualStatus === 'SIN_CONFIGURAR' ||
      visualStatus === 'POR_SALIR_HOY' ||
      this.hasPendingCleaning(room) ||
      this.hasOpenMaintenance(room) ||
      this.hasPendingBalance(room) ||
      this.isCheckInReady(room) ||
      this.getQuickAction(room) === 'confirm'
    );
  }

  /**
   * El estado `LIMPIEZA` de la habitacion y las tareas de limpieza son cosas
   * distintas: una habitacion puede quedar ocupada con una tarea abierta, o marcada
   * en limpieza sin tarea registrada. Para recepcion las dos cuentan como pendiente.
   */
  hasPendingCleaning(room: RoomI): boolean {
    if (this.getVisualStatus(room) === 'LIMPIEZA') return true;
    return (room.operations?.pending_cleaning || 0) > 0;
  }

  hasOpenMaintenance(room: RoomI): boolean {
    if (this.getVisualStatus(room) === 'MANTENIMIENTO') return true;
    return (room.operations?.open_maintenance || 0) > 0;
  }

  /** Hay algo por cobrar o, al menos, consumos que todavia no se han facturado. */
  hasPendingBalance(room: RoomI): boolean {
    return this.getPendingTotal(room) > 0 || this.getUnbilledCharges(room) > 0;
  }

  /**
   * Saldo de la reserva, no de facturacion. Se usa `reservation_pending` a proposito:
   * es el numero que muestra el modal, y antes la tarjeta mostraba el de facturacion,
   * que puede ser muy distinto (una reserva sin facturar da 0 en uno y el total en el
   * otro).
   */
  getPendingTotal(room: RoomI): number {
    return this.toAmount(room.operations?.reservation_pending);
  }

  getUnbilledCharges(room: RoomI): number {
    return this.toAmount(room.operations?.unbilled_charges);
  }

  getPendingTotalLabel(room: RoomI): string {
    return this.formatMoney(this.getPendingTotal(room));
  }

  getUnbilledChargesLabel(room: RoomI): string {
    return this.formatMoney(this.getUnbilledCharges(room));
  }

  hasLowInventory(room: RoomI): boolean {
    return (room.operations?.low_inventory || 0) > 0;
  }

  /** Salida vencida o dentro de las proximas 2 horas: la ventana en la que hay que actuar. */
  isCheckoutUrgent(room: RoomI): boolean {
    if (!['OCUPADA', 'POR_SALIR_HOY'].includes(this.getVisualStatus(room))) return false;

    const target = this.getCheckoutTarget(room);
    if (!target) return false;

    return target.getTime() - this.currentTime.getTime() <= 2 * 60 * 60 * 1000;
  }

  /**
   * Indicadores de la tarjeta, ordenados por urgencia: primero lo que cuesta dinero o
   * bloquea la salida, despues lo que bloquea la proxima venta.
   */
  getCardBadges(room: RoomI): RoomBadge[] {
    const badges: RoomBadge[] = [];

    if (this.isCheckoutUrgent(room)) {
      const expired = this.getCheckoutCountdownClass(room) === 'is-expired';
      badges.push({
        key: 'checkout',
        icon: 'fa-regular fa-clock',
        label: expired ? 'Salida vencida' : this.getCheckoutBadgeLabel(room),
        title: expired
          ? 'La salida ya paso de la hora acordada.'
          : `Salida prevista: ${this.getCheckoutCountdownLabel(room).toLowerCase()}.`,
        tone: expired ? 'danger' : 'warning'
      });
    }

    if (this.getPendingTotal(room) > 0) {
      badges.push({
        key: 'balance',
        icon: 'fa-solid fa-money-bill-wave',
        label: this.getPendingTotalLabel(room),
        title: `Saldo de la reserva: ${this.getPendingTotalLabel(room)} (estadia y cargos, menos abonos).`,
        tone: 'danger'
      });
    }

    // Los consumos sin facturar son la sorpresa clasica del check-out: el huesped no
    // los ha visto en ninguna factura y hay que cobrarlos en el mostrador.
    if (this.getUnbilledCharges(room) > 0) {
      badges.push({
        key: 'charges',
        icon: 'fa-solid fa-receipt',
        label: `Consumos ${this.getUnbilledChargesLabel(room)}`,
        title: `${this.getUnbilledChargesLabel(room)} en cargos que aun no entran en ninguna factura.`,
        tone: 'warning'
      });
    }

    const maintenance = room.operations?.open_maintenance || 0;
    if (this.hasOpenMaintenance(room)) {
      badges.push({
        key: 'maintenance',
        icon: 'fa-solid fa-screwdriver-wrench',
        label: this.withCount('Mantenimiento', maintenance),
        title: maintenance
          ? `${maintenance} orden(es) de mantenimiento sin cerrar.`
          : 'La habitacion esta marcada en mantenimiento.',
        tone: 'danger'
      });
    }

    const cleaning = room.operations?.pending_cleaning || 0;
    if (this.hasPendingCleaning(room)) {
      badges.push({
        key: 'cleaning',
        icon: 'fa-solid fa-broom',
        label: this.withCount('Limpieza', cleaning),
        title: cleaning
          ? `${cleaning} tarea(s) de limpieza abiertas.`
          : 'La habitacion esta marcada en limpieza.',
        tone: 'info'
      });
    }

    const lowInventory = room.operations?.low_inventory || 0;
    if (lowInventory > 0) {
      badges.push({
        key: 'inventory',
        icon: 'fa-solid fa-boxes-stacked',
        label: this.withCount('Inventario bajo', lowInventory),
        title: `${lowInventory} item(s) por debajo del minimo de la habitacion.`,
        tone: 'warning'
      });
    }

    return badges;
  }

  hasCardBadges(room: RoomI): boolean {
    return this.getCardBadges(room).length > 0;
  }

  trackByBadge(_: number, badge: RoomBadge): string {
    return badge.key;
  }

  private getCheckoutBadgeLabel(room: RoomI): string {
    const target = this.getCheckoutTarget(room);
    if (!target) return 'Salida hoy';

    const totalMinutes = Math.ceil((target.getTime() - this.currentTime.getTime()) / 60000);
    if (totalMinutes <= 60) return `Sale en ${Math.max(totalMinutes, 1)} min`;

    const hours = Math.floor(totalMinutes / 60);
    return `Sale en ${hours} h`;
  }

  private withCount(label: string, count: number): string {
    return count > 1 ? `${label} (${count})` : label;
  }

  private isCheckInReady(room: RoomI): boolean {
    if (this.getVisualStatus(room) !== 'RESERVADA') return false;
    const reservation = room.active_reservation;
    if (!reservation) return false;

    const status = this.normalizeCode(reservation.status);
    if (['PENDIENTE', 'PENDING'].includes(status)) return false;

    const checkIn = this.parseDate(reservation.expected_check_in);
    if (!checkIn) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkIn.setHours(0, 0, 0, 0);
    return checkIn.getTime() <= today.getTime();
  }

  private isCheckoutSoon(room: RoomI): boolean {
    if (!['OCUPADA', 'POR_SALIR_HOY'].includes(this.getVisualStatus(room))) return false;
    const target = this.getCheckoutTarget(room);
    if (!target) return false;

    const diffMs = target.getTime() - this.currentTime.getTime();
    return diffMs <= 4 * 60 * 60 * 1000;
  }

  private getQuickAction(room: RoomI): RoomQuickAction {
    const visualStatus = this.getVisualStatus(room);
    const reservationStatus = this.normalizeCode(room.active_reservation?.status);

    if (visualStatus === 'RESERVADA') {
      if (['PENDIENTE', 'PENDING'].includes(reservationStatus)) return 'confirm';
      return 'check-in';
    }

    if (visualStatus === 'OCUPADA' || visualStatus === 'POR_SALIR_HOY') {
      return 'check-out';
    }

    if (visualStatus === 'LIMPIEZA') {
      return 'complete-cleaning';
    }

    return 'manage';
  }

  private getQuickActionLoadingKey(room: RoomI, action = this.getQuickAction(room)): string {
    return `${room.id}:${action}`;
  }

  private finishQuickAction(roomId: number, loadingKey: string): void {
    this.quickActionLoadingIds.delete(loadingKey);
    // La accion la ejecuto otro servicio (reservas, limpieza), asi que el cache del
    // listado no se entero: hay que invalidarlo a mano.
    this.roomService.invalidateRoomsCache();
    this.refreshRoomById(roomId);
  }

  private failQuickAction(loadingKey: string, message: string): void {
    this.quickActionLoadingIds.delete(loadingKey);
    this.quickActionError = message;
  }

  private completeFirstOpenCleaningTask(room: RoomI, loadingKey: string): void {
    this.cleaningTasksService
      .listCleaningTasks({ include_inactive: true })
      .pipe(catchError(() => of([] as CleaningTaskI[])))
      .subscribe((tasks) => {
        const task = tasks.find((item) => {
          const sameRoom = Number(item.room) === room.id;
          const status = this.normalizeCode(String(item.status_label || item.status || ''));
          return sameRoom && ['PENDIENTE', 'EN_PROCESO', 'ENPROCESO'].includes(status);
        });

        if (!task) {
          this.quickActionLoadingIds.delete(loadingKey);
          this.openRoom(room);
          return;
        }

        this.cleaningTasksService
          .updateCleaningTask(task.id, { status: 'COMPLETADA', completed_at: this.toDateTimeLocal(new Date()) })
          .subscribe({
            next: () => this.finishQuickAction(room.id, loadingKey),
            error: () => this.failQuickAction(loadingKey, 'No se pudo completar la limpieza.')
          });
      });
  }

  private isPorSalirHoy(room: RoomI): boolean {
    const reservation = room.active_reservation;
    if (!reservation?.expected_check_out) return false;

    const statusCode = this.normalizeCode(reservation.status);
    if (
      ![
        'PENDIENTE',
        'CONFIRMADA',
        'CONFIRMADO',
        'CONFIRMED',
        'EN_CURSO',
        'CHECKED_IN',
        'IN_PROGRESS',
        'HOSPEDADO'
      ].includes(statusCode)
    ) {
      return false;
    }

    return this.isToday(reservation.expected_check_out);
  }

  private isToday(value: string | null | undefined): boolean {
    const date = this.parseDate(value);
    if (!date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date.getTime() === today.getTime();
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) return null;
    return asDate;
  }

  private getCheckoutTarget(room: RoomI): Date | null {
    const checkOut = room.active_reservation?.expected_check_out;
    if (!checkOut) return null;

    const date = this.parseDate(checkOut);
    if (!date) return null;

    const [hours, minutes] = this.parseTime(
      room.active_reservation?.expected_check_out_time || '12:00'
    );
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private parseTime(value: string): [number, number] {
    const [rawHours, rawMinutes] = String(value || '12:00').split(':');
    const hours = Number(rawHours);
    const minutes = Number(rawMinutes);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return [12, 0];
    return [Math.min(Math.max(hours, 0), 23), Math.min(Math.max(minutes, 0), 59)];
  }

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }

  /**
   * Texto contra el que se busca una habitacion. La operacion real no busca
   * "habitacion 101": busca "Juan", el documento que tiene en la mano, o el numero de
   * la reserva. Todo eso tiene que caer aqui.
   */
  private buildSearchPool(room: RoomI): string {
    const roomType = this.getRoomType(room);
    const reservation = room.active_reservation;
    const rateId = this.getRoomRateId(room);
    const rate = rateId ? this.rateMap.get(rateId) : null;

    return this.normalizeText(
      [
        room.number,
        room.notes,
        room.floor_name,
        room.room_type_name,
        roomType?.name,
        roomType?.code,
        roomType?.bed_type,
        rate?.name,
        this.getStatusLabel(room),
        reservation?.client_name,
        reservation?.client_document,
        reservation?.client?.full_name,
        reservation?.client?.document_number,
        reservation?.status_label,
        // La reserva se busca por numero, con o sin almohadilla.
        reservation?.id ? `#${reservation.id} ${reservation.id}` : '',
        room.amenities?.map((amenity) => amenity.name).join(' ')
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  /** Minusculas y sin tildes, para que "jose" encuentre a "José". */
  private normalizeText(value: string | null | undefined): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toLowerCase();
  }

  /** Los montos llegan como string decimal desde el backend. */
  private toAmount(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  }

  private toDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private formatFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private escapeCsvCell(value: unknown): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
