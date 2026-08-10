import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../services/room';
import {
  AmenityI,
  HotelFloorI,
  RateI,
  RoomI,
  RoomTypeI,
  RoomVisualStatus
} from '../room-model';
import { CreateRoom } from '../create-room/create-room';
import { RoomModal } from '../room-modal/room-modal';
import { RoomTypesManager } from '../managers/room-types-manager/room-types-manager';
import { RatesManager } from '../managers/rates-manager/rates-manager';

type ViewMode = 'cards' | 'table';

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

@Component({
  selector: 'app-list-rooms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CreateRoom,
    RoomModal,
    RoomTypesManager,
    RatesManager
  ],
  templateUrl: './list-rooms.html',
  styleUrls: ['./list-rooms.css']
})
export class ListRooms implements OnInit, OnDestroy {
  loading = false;
  errorMessage = '';

  rooms: RoomI[] = [];
  filteredRooms: RoomI[] = [];
  floorGroups: FloorGroup[] = [];

  floors: HotelFloorI[] = [];
  roomTypes: RoomTypeI[] = [];
  amenities: AmenityI[] = [];
  rates: RateI[] = [];

  search = '';
  statusFilter: RoomVisualStatus | 'ALL' = 'ALL';
  floorFilter: number | 'ALL' = 'ALL';
  viewMode: ViewMode = 'cards';

  // Modales
  showCreateDrawer = false;
  selectedRoom: RoomI | null = null;
  showRoomTypesManager = false;
  showRatesManager = false;
  ratesManagerFocusTypeId: number | null = null;

  private roomTypeMap = new Map<number, RoomTypeI>();
  private rateMap = new Map<number, RateI>();
  private roomOverrides = new Map<number, RoomI>();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
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

  constructor(private roomService: RoomService) {}

  ngOnInit(): void {
    this.loadModuleData();
    this.countdownTimer = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
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

  // ------------------------------------------------------------------ carga

  loadModuleData(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
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
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se pudo cargar el modulo de habitaciones.';
      }
    });
  }

  refreshRooms(): void {
    this.roomService.listRooms().subscribe({
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
    const searchValue = this.search.toLowerCase().trim();

    this.filteredRooms = this.rooms.filter((room) => {
      const visualStatus = this.getVisualStatus(room);
      const statusMatch = this.statusFilter === 'ALL' ? true : visualStatus === this.statusFilter;
      const floorMatch = this.floorFilter === 'ALL' ? true : room.floor === this.floorFilter;

      const roomType = this.getRoomType(room);
      const searchPool = [
        room.number,
        room.notes || '',
        room.floor_name || '',
        room.room_type_name || '',
        roomType?.name || '',
        roomType?.bed_type || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && floorMatch && searchMatch;
    });

    this.floorGroups = this.buildFloorGroups(this.filteredRooms);
  }

  selectStatus(status: RoomVisualStatus | 'ALL'): void {
    this.statusFilter = status;
    this.applyFilters();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
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

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
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

  getStatusStyle(room: RoomI): StatusStyle {
    switch (this.getVisualStatus(room)) {
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
    switch (this.getVisualStatus(room)) {
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
