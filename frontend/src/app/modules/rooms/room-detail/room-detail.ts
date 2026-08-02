import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AmenityI, RoomActiveReservationI, RoomI, RoomPanelI, RoomStatus } from '../room-model';
import { RoomService } from '../../../services/room';
import { ReservationService } from '../../../services/reservation';
import { ReservationDetailI, ReservationRoomI } from '../../reservations/reservation-model';

type StatusTone = {
  bg: string;
  color: string;
  dot: string;
};

@Component({
  selector: 'app-room-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './room-detail.html',
  styleUrls: ['./room-detail.css']
})
export class RoomDetail implements OnChanges {
  @Input() room: RoomI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<RoomI>();
  @Output() refreshed = new EventEmitter<void>();

  panel: RoomPanelI | null = null;
  loading = false;
  errorMessage = '';
  actionLoading = false;

  reservationDetail: ReservationDetailI | null = null;
  reservationDetailLoading = false;
  reservationDetailError = '';

  private reservationDetailRequestId = 0;

  constructor(
    private roomService: RoomService,
    private reservationService: ReservationService,
    private router: Router
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['room'] || !this.room?.id) return;
    this.loadPanel(this.room.id);
  }

  get roomNumber(): string {
    return this.panel?.number || this.room?.number || '---';
  }

  get roomTypeLabel(): string {
    return this.panel?.room_type?.name || this.room?.room_type_name || 'Sin tipo';
  }

  get floorLabel(): string {
    const floorName = this.panel?.floor_name || this.room?.floor_name;
    const floorNumber = this.panel?.floor_number || this.room?.florr_number;
    if (floorName && floorNumber) return `${floorName} · Piso ${floorNumber}`;
    if (floorName) return floorName;
    if (floorNumber) return `Piso ${floorNumber}`;
    return 'Piso no asignado';
  }

  get statusLabel(): string {
    if (this.panel?.status_label) return this.panel.status_label;
    return this.getStatusLabel((this.panel?.status || this.room?.status || 'DISPONIBLE') as RoomStatus);
  }

  get statusTone(): StatusTone {
    return this.getStatusTone((this.panel?.status || this.room?.status || 'DISPONIBLE') as RoomStatus);
  }

  get priceLabel(): string {
    const rateValue = this.panel?.rate?.price;
    if (rateValue === null || rateValue === undefined || rateValue === '') return 'Tarifa pendiente';
    const asNumber = Number(rateValue);
    if (Number.isNaN(asNumber)) return `${rateValue}`;

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  get bedLabel(): string {
    const roomType = this.panel?.room_type;
    if (!roomType) return 'Sin configuracion de camas';
    const bedCount = roomType.bed_count ? `${roomType.bed_count}` : '?';
    const bedType = roomType.bed_type || 'cama';
    return `${bedCount} ${bedType}`;
  }

  get amenities(): Array<Pick<AmenityI, 'name' | 'icon'>> {
    if (this.panel?.amenities?.length) {
      return this.panel.amenities.map((amenity) => ({
        name: amenity.name,
        icon: amenity.icon
      }));
    }

    if (this.room?.amenities?.length) {
      return this.room.amenities.map((amenity) => ({
        name: amenity.name,
        icon: amenity.icon
      }));
    }

    return [];
  }

  get hasMaintenance(): boolean {
    return !!this.panel?.active_maintenance;
  }

  get activeReservation(): RoomActiveReservationI | null {
    return this.panel?.active_reservation || this.room?.active_reservation || null;
  }

  get canConfirmReservation(): boolean {
    const statusCode = this.normalizeCode(this.activeReservation?.status);
    return statusCode === 'PENDIENTE' && !this.activeReservation?.real_check_in && !this.activeReservation?.real_check_out;
  }

  get canCheckInReservation(): boolean {
    const statusCode = this.normalizeCode(this.activeReservation?.status);
    return statusCode === 'CONFIRMADA' && !this.activeReservation?.real_check_in && !this.activeReservation?.real_check_out;
  }

  get canCheckOutReservation(): boolean {
    const statusCode = this.normalizeCode(this.activeReservation?.status);
    if (!this.activeReservation) return false;
    return (
      (statusCode === 'EN_CURSO' || !!this.activeReservation.real_check_in) &&
      !this.activeReservation.real_check_out
    );
  }

  get canMarkAsAvailable(): boolean {
    const status = (this.panel?.status || this.room?.status) as RoomStatus | undefined;
    return status === 'MANTENIMIENTO' || status === 'FUERA_DE_SERVICIO' || status === 'LIMPIEZA';
  }

  get canEditRoom(): boolean {
    const statusCode = this.normalizeCode(this.panel?.status || this.room?.status);
    return statusCode === 'DISPONIBLE';
  }

  get showAvailableActions(): boolean {
    return this.canEditRoom;
  }

  get showCurrentGuestCard(): boolean {
    const statusCode = this.normalizeCode(this.panel?.status || this.room?.status);
    return statusCode === 'OCUPADA' && !!this.activeReservation?.id;
  }

  get reservationCardReady(): boolean {
    return this.showCurrentGuestCard && !this.reservationDetailLoading && !!this.reservationDetail;
  }

  get isLeavingToday(): boolean {
    return this.isToday(this.activeReservation?.expected_check_out);
  }

  get currentGuestName(): string {
    const clientName = this.reservationDetail?.client_full_name?.trim();
    if (clientName) return clientName;

    const panelName = this.activeReservation?.client?.full_name?.trim();
    if (panelName) return panelName;

    const legacyName = this.activeReservation?.client_name?.trim();
    return legacyName || 'Huesped sin nombre';
  }

  get currentGuestAdultsLabel(): string {
    const activeLine = this.getActiveReservationRoomLine();
    if (activeLine) {
      const adults = Number(activeLine.adults || 0);
      if (adults > 0) return `${adults} ${adults === 1 ? 'adulto' : 'adultos'}`;
    }

    const totalGuests = Number(this.reservationDetail?.total_guests || 0);
    if (totalGuests > 0) return `${totalGuests} ${totalGuests === 1 ? 'huesped' : 'huespedes'}`;

    return 'Sin registro';
  }

  get currentGuestPhone(): string {
    return this.reservationDetail?.client_phone || 'No registra';
  }

  get currentGuestEmail(): string {
    return this.reservationDetail?.client_email || 'No registra';
  }

  get currentGuestCheckIn(): string {
    return this.formatDate(this.reservationDetail?.expected_check_in);
  }

  get currentGuestCheckOut(): string {
    return this.formatDate(this.reservationDetail?.expected_check_out);
  }

  get currentGuestNights(): number {
    if (typeof this.reservationDetail?.total_nights === 'number') {
      return Math.max(0, this.reservationDetail.total_nights);
    }

    const checkIn = this.parseDate(this.reservationDetail?.expected_check_in);
    const checkOut = this.parseDate(this.reservationDetail?.expected_check_out);
    if (!checkIn || !checkOut) return 0;

    const diff = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  get currentGuestNightsLabel(): string {
    const nights = this.currentGuestNights;
    return `${nights} ${nights === 1 ? 'noche' : 'noches'}`;
  }

  get currentGuestTotalLabel(): string {
    if (!this.reservationDetail) return this.formatCurrency(0);

    const roomsSubtotal = (this.reservationDetail.rooms_detail || []).reduce((sum, room) => {
      const subtotal = Number(room.subtotal ?? room.night_rate ?? 0);
      return sum + (Number.isNaN(subtotal) ? 0 : subtotal);
    }, 0);

    const discount = Number(this.reservationDetail.total_discount || 0);
    const netTotal = Math.max(0, roomsSubtotal - (Number.isNaN(discount) ? 0 : discount));
    return this.formatCurrency(netTotal);
  }

  closeDrawer(): void {
    if (this.actionLoading) return;
    this.closed.emit();
  }

  requestEdit(): void {
    if (!this.room) return;
    this.editRequested.emit(this.room);
  }

  markAsAvailable(): void {
    if (!this.room || this.actionLoading || !this.canMarkAsAvailable) return;

    this.actionLoading = true;
    const amenityIds = this.room.amenities?.map((amenity) => amenity.id) || [];

    this.roomService
      .updateRoom(this.room.id, {
        number: this.room.number,
        floor: this.room.floor,
        room_type: this.room.room_type,
        status: 'DISPONIBLE',
        notes: this.room.notes || '',
        amenity_ids: amenityIds
      })
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.loadPanel(this.room!.id);
          this.refreshed.emit();
        },
        error: () => {
          this.actionLoading = false;
          this.errorMessage = 'No fue posible cambiar el estado de la habitacion.';
        }
      });
  }

  confirmReservation(): void {
    if (!this.activeReservation?.id || this.actionLoading || !this.canConfirmReservation) return;
    this.runReservationAction(this.reservationService.confirmReservation(this.activeReservation.id));
  }

  checkInReservation(): void {
    if (!this.activeReservation?.id || this.actionLoading || !this.canCheckInReservation) return;
    this.runReservationAction(this.reservationService.checkInReservation(this.activeReservation.id));
  }

  checkOutReservation(): void {
    if (!this.activeReservation?.id || this.actionLoading || !this.canCheckOutReservation) return;
    this.runReservationAction(this.reservationService.checkOutReservation(this.activeReservation.id));
  }

  openFullReservation(): void {
    const reservationId = this.activeReservation?.id;
    if (!reservationId) return;

    this.closed.emit();
    void this.router.navigate(['/reservas'], {
      queryParams: { reservationId, action: 'detail' }
    });
  }

  requestRoomChange(): void {
    const reservationId = this.activeReservation?.id;
    if (!reservationId) return;

    this.closed.emit();
    void this.router.navigate(['/reservas'], {
      queryParams: { reservationId, action: 'edit' }
    });
  }

  openNewReservationFromRoom(): void {
    const roomId = this.room?.id;
    if (!roomId) return;

    this.closed.emit();
    void this.router.navigate(['/reservas'], {
      queryParams: { action: 'create', roomId }
    });
  }

  openCheckInFromRoom(): void {
    const roomId = this.room?.id;
    if (!roomId) return;

    this.closed.emit();
    void this.router.navigate(['/reservas'], {
      queryParams: { action: 'checkin', roomId }
    });
  }

  private loadPanel(roomId: number): void {
    this.loading = true;
    this.errorMessage = '';
    this.panel = null;
    this.reservationDetail = null;
    this.reservationDetailError = '';
    this.reservationDetailLoading = false;

    this.roomService.getRoomPanel(roomId).subscribe({
      next: (data) => {
        this.loading = false;
        this.panel = data;
        this.loadReservationDetail();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se pudo cargar el detalle de la habitacion.';
      }
    });
  }

  private runReservationAction(action$: Observable<unknown>): void {
    if (!this.room?.id) return;

    this.actionLoading = true;
    this.errorMessage = '';

    action$.subscribe({
      next: () => {
        this.actionLoading = false;
        this.loadPanel(this.room!.id);
        this.refreshed.emit();
      },
      error: () => {
        this.actionLoading = false;
        this.errorMessage = 'No fue posible ejecutar la accion sobre la reserva activa.';
      }
    });
  }

  private loadReservationDetail(): void {
    const reservationId = this.activeReservation?.id;
    if (!reservationId) {
      this.reservationDetail = null;
      this.reservationDetailError = '';
      this.reservationDetailLoading = false;
      return;
    }

    const requestId = ++this.reservationDetailRequestId;
    this.reservationDetail = null;
    this.reservationDetailError = '';
    this.reservationDetailLoading = true;

    this.reservationService.getReservationById(reservationId).subscribe({
      next: (detail) => {
        if (requestId !== this.reservationDetailRequestId) return;
        this.reservationDetailLoading = false;
        this.reservationDetail = detail;
      },
      error: () => {
        if (requestId !== this.reservationDetailRequestId) return;
        this.reservationDetailLoading = false;
        this.reservationDetailError = 'No se pudo cargar el resumen de la reserva activa.';
      }
    });
  }

  private getActiveReservationRoomLine(): ReservationRoomI | null {
    if (!this.reservationDetail?.rooms_detail?.length) return null;

    const activeReservationRoomId = Number(this.activeReservation?.reservation_room_id || 0);
    if (activeReservationRoomId > 0) {
      const byReservationRoomId = this.reservationDetail.rooms_detail.find((roomLine) => roomLine.id === activeReservationRoomId);
      if (byReservationRoomId) return byReservationRoomId;
    }

    if (this.room?.id) {
      const byRoomId = this.reservationDetail.rooms_detail.find((roomLine) => Number(roomLine.room) === Number(this.room?.id));
      if (byRoomId) return byRoomId;
    }

    return this.reservationDetail.rooms_detail[0] || null;
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

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isToday(value: string | null | undefined): boolean {
    const parsed = this.parseDate(value);
    if (!parsed) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return parsed.getTime() === today.getTime();
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = this.parseDate(value);
    if (!parsed) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private getStatusLabel(status: RoomStatus): string {
    switch (status) {
      case 'DISPONIBLE':
        return 'Disponible';
      case 'RESERVADA':
        return 'Reservada';
      case 'OCUPADA':
        return 'Ocupada';
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

  private getStatusTone(status: RoomStatus): StatusTone {
    switch (status) {
      case 'DISPONIBLE':
        return { bg: '#e9f9ef', color: '#0f9f56', dot: '#21c06a' };
      case 'RESERVADA':
        return { bg: '#eff6ff', color: '#1d4ed8', dot: '#2563eb' };
      case 'OCUPADA':
        return { bg: '#eaf1ff', color: '#2f69e2', dot: '#3979ff' };
      case 'MANTENIMIENTO':
        return { bg: '#ffeceb', color: '#c8372e', dot: '#ef4444' };
      case 'LIMPIEZA':
        return { bg: '#ecfeff', color: '#0e7490', dot: '#06b6d4' };
      case 'FUERA_DE_SERVICIO':
        return { bg: '#f2f4f8', color: '#4b5563', dot: '#9ca3af' };
      default:
        return { bg: '#f2f4f8', color: '#4b5563', dot: '#9ca3af' };
    }
  }

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }
}
