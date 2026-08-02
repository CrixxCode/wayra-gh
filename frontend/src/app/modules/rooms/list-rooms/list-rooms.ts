import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../services/room';
import {
  AmenityI,
  HotelFloorI,
  RateI,
  RoomI,
  RoomPanelI,
  RoomStatus,
  RoomTypeI,
  RoomVisualStatus
} from '../room-model';
import { CreateRoom } from '../create-room/create-room';
import { UpdateRoom } from '../update-room/update-room';
import { RoomDetail } from '../room-detail/room-detail';

type ViewMode = 'cards' | 'table';

type StatusStyle = {
  bg: string;
  color: string;
  dot: string;
  border: string;
  buttonBg: string;
  buttonColor: string;
};

@Component({
  selector: 'app-list-rooms',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateRoom, UpdateRoom, RoomDetail],
  templateUrl: './list-rooms.html',
  styleUrls: ['./list-rooms.css']
})
export class ListRooms implements OnInit {
  loading = false;
  errorMessage = '';

  rooms: RoomI[] = [];
  filteredRooms: RoomI[] = [];

  floors: HotelFloorI[] = [];
  roomTypes: RoomTypeI[] = [];
  amenities: AmenityI[] = [];
  rates: RateI[] = [];

  search = '';
  statusFilter: RoomVisualStatus | 'ALL' = 'ALL';
  floorFilter: number | 'ALL' = 'ALL';
  viewMode: ViewMode = 'cards';

  showCreateDrawer = false;
  showUpdateDrawer = false;
  selectedRoom: RoomI | null = null;
  roomToEdit: RoomI | null = null;

  private roomTypeMap = new Map<number, RoomTypeI>();
  private activeRateMap = new Map<number, RateI>();

  readonly statusTabs: Array<{ key: RoomVisualStatus | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'Todas' },
    { key: 'DISPONIBLE', label: 'Disponible' },
    { key: 'RESERVADA', label: 'Reservada' },
    { key: 'OCUPADA', label: 'Ocupada' },
    { key: 'POR_SALIR_HOY', label: 'Por salir hoy' },
    { key: 'MANTENIMIENTO', label: 'Mantenimiento' }
  ];

  readonly statusOptions: Array<{ value: RoomVisualStatus | 'ALL'; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'DISPONIBLE', label: 'Disponible' },
    { value: 'RESERVADA', label: 'Reservada' },
    { value: 'OCUPADA', label: 'Ocupada' },
    { value: 'POR_SALIR_HOY', label: 'Por salir hoy' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { value: 'LIMPIEZA', label: 'Limpieza' },
    { value: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio' }
  ];

  constructor(
    private roomService: RoomService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadModuleData();
  }

  get totalRooms(): number {
    return this.rooms.length;
  }

  get availableCount(): number {
    return this.rooms.filter((room) => room.status === 'DISPONIBLE').length;
  }

  get occupiedCount(): number {
    return this.rooms.filter((room) => room.status === 'OCUPADA').length;
  }

  get reservedCount(): number {
    return this.rooms.filter((room) => room.status === 'RESERVADA').length;
  }

  get maintenanceCount(): number {
    return this.rooms.filter((room) => room.status === 'MANTENIMIENTO').length;
  }

  get leavingTodayCount(): number {
    return this.rooms.filter((room) => this.isPorSalirHoy(room)).length;
  }

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
        this.rooms = rooms;
        this.applyFilters();
      },
      error: () => {
        this.errorMessage = 'No se pudieron actualizar las habitaciones.';
      }
    });
  }

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
  }

  selectStatus(status: RoomVisualStatus | 'ALL'): void {
    this.statusFilter = status;
    this.applyFilters();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  goToAmenities(): void {
    void this.router.navigate(['/amenidades']);
  }

  goToRoomTypes(): void {
    void this.router.navigate(['/tipos-habitacion']);
  }

  goToRates(): void {
    void this.router.navigate(['/tarifas-habitacion']);
  }

  openCreateDrawer(): void {
    this.selectedRoom = null;
    this.roomToEdit = null;
    this.showUpdateDrawer = false;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onRoomCreated(): void {
    this.showCreateDrawer = false;
    this.refreshRooms();
  }

  openDetail(room: RoomI): void {
    this.showCreateDrawer = false;
    this.showUpdateDrawer = false;
    this.roomToEdit = null;
    this.selectedRoom = room;
  }

  closeDetail(): void {
    this.selectedRoom = null;
  }

  openUpdateDrawer(room: RoomI): void {
    this.selectedRoom = null;
    this.showCreateDrawer = false;
    this.roomToEdit = room;
    this.showUpdateDrawer = true;
  }

  openUpdateFromDetail(room: RoomI): void {
    this.closeDetail();
    this.openUpdateDrawer(room);
  }

  closeUpdateDrawer(): void {
    this.showUpdateDrawer = false;
    this.roomToEdit = null;
  }

  onRoomUpdated(): void {
    this.showUpdateDrawer = false;
    this.roomToEdit = null;
    this.refreshRooms();
  }

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
    if (!room.room_type) return '--';
    const rate = this.activeRateMap.get(room.room_type);
    if (!rate?.price) return '--';
    const asNumber = Number(rate.price);
    if (Number.isNaN(asNumber)) return `${rate.price}`;

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  getStatusLabel(room: RoomI): string {
    const visualStatus = this.getVisualStatus(room);
    switch (visualStatus) {
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
      case 'LIMPIEZA':
        return 'Limpieza';
      case 'FUERA_DE_SERVICIO':
        return 'Fuera de servicio';
      default:
        return 'Sin estado';
    }
  }

  getStatusStyle(room: RoomI): StatusStyle {
    const visualStatus = this.getVisualStatus(room);

    switch (visualStatus) {
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

  canPrimaryAction(room: RoomI): boolean {
    const visualStatus = this.getVisualStatus(room);
    return visualStatus !== 'MANTENIMIENTO' && visualStatus !== 'LIMPIEZA' && visualStatus !== 'FUERA_DE_SERVICIO';
  }

  getCardStatusClass(room: RoomI): string {
    const visualStatus = this.getVisualStatus(room);
    switch (visualStatus) {
      case 'DISPONIBLE':
        return 'is-available';
      case 'OCUPADA':
        return 'is-occupied';
      case 'POR_SALIR_HOY':
        return 'is-leaving-today';
      case 'MANTENIMIENTO':
        return 'is-maintenance';
      case 'RESERVADA':
        return 'is-reserved';
      case 'LIMPIEZA':
        return 'is-cleaning';
      default:
        return 'is-out-of-service';
    }
  }

  getPrimaryActionClass(room: RoomI): string {
    if (!this.canPrimaryAction(room)) return 'is-disabled';

    const visualStatus = this.getVisualStatus(room);
    if (visualStatus === 'POR_SALIR_HOY') return 'is-checkout';
    if (visualStatus === 'OCUPADA') return 'is-detail';
    return 'is-checkin';
  }

  getPrimaryActionIcon(room: RoomI): string {
    if (!this.canPrimaryAction(room)) return 'fa-solid fa-ban';

    const visualStatus = this.getVisualStatus(room);
    if (visualStatus === 'POR_SALIR_HOY') return 'fa-solid fa-right-from-bracket';
    if (visualStatus === 'OCUPADA') return 'fa-regular fa-eye';
    return 'fa-solid fa-right-to-bracket';
  }

  getPrimaryActionLabel(room: RoomI): string {
    const visualStatus = this.getVisualStatus(room);
    if (visualStatus === 'DISPONIBLE') return 'Check-In';
    if (visualStatus === 'RESERVADA') return 'Check-In';
    if (visualStatus === 'POR_SALIR_HOY') return 'Check-Out';
    if (visualStatus === 'OCUPADA') return 'Ver detalles';
    return 'No disponible';
  }

  onPrimaryAction(room: RoomI): void {
    if (!this.canPrimaryAction(room)) return;
    this.openDetail(room);
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

    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short'
    })
      .format(parsed)
      .replace('.', '');
  }

  trackByRoom(_: number, room: RoomI): number {
    return room.id;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private buildMaps(): void {
    this.roomTypeMap = new Map(this.roomTypes.map((roomType) => [roomType.id, roomType]));

    this.activeRateMap.clear();
    for (const rate of this.rates) {
      if (!rate?.room_type || !rate.is_active) continue;

      const existing = this.activeRateMap.get(rate.room_type);
      if (!existing) {
        this.activeRateMap.set(rate.room_type, rate);
        continue;
      }

      const existingDate = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const currentDate = rate.created_at ? new Date(rate.created_at).getTime() : 0;

      if (currentDate >= existingDate) {
        this.activeRateMap.set(rate.room_type, rate);
      }
    }
  }

  private getRoomType(room: RoomI): RoomTypeI | null {
    if (!room.room_type) return null;
    return this.roomTypeMap.get(room.room_type) || null;
  }

  private getVisualStatus(room: RoomI): RoomVisualStatus {
    if (this.isPorSalirHoy(room)) return 'POR_SALIR_HOY';
    return room.status;
  }

  private isPorSalirHoy(room: RoomI): boolean {
    if (room.status !== 'OCUPADA' && room.status !== 'RESERVADA') return false;

    const reservation = room.active_reservation;
    if (!reservation?.expected_check_out) return false;

    const statusCode = this.normalizeCode(reservation.status);
    if (!['PENDIENTE', 'CONFIRMADA', 'EN_CURSO'].includes(statusCode)) return false;

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



