import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RateI, RoomTypeI } from '../room-model';

@Component({
  selector: 'app-detail-rate',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-rate.html',
  styleUrls: ['./detail-rate.css']
})
export class DetailRate {
  @Input() rate: RateI | null = null;
  @Input() roomTypes: RoomTypeI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<RateI>();
  @Output() statusRequested = new EventEmitter<RateI>();
  @Output() deleteRequested = new EventEmitter<RateI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.rate) return;
    this.statusRequested.emit(this.rate);
  }

  requestEdit(): void {
    if (!this.rate) return;
    this.editRequested.emit(this.rate);
  }

  requestDelete(): void {
    if (!this.rate) return;
    this.deleteRequested.emit(this.rate);
  }

  getRoomTypeLabel(rate: RateI | null): string {
    if (!rate) return 'Sin tipo';

    const roomType = this.getRoomType(rate);
    if (roomType?.name) return roomType.name;
    if (rate.room_type_name) return rate.room_type_name;
    return `Tipo #${rate.room_type}`;
  }

  getCapacityLabel(rate: RateI | null): string {
    const roomType = this.getRoomType(rate);
    const capacity = Number(roomType?.capacity || 0);
    if (!capacity) return '--';
    return `${capacity} persona${capacity === 1 ? '' : 's'}`;
  }

  getBedCountLabel(rate: RateI | null): string {
    const roomType = this.getRoomType(rate);
    const beds = Number(roomType?.bed_count || 0);
    if (!beds) return '--';
    return `${beds} cama${beds === 1 ? '' : 's'}`;
  }

  getBedTypeLabel(rate: RateI | null): string {
    const roomType = this.getRoomType(rate);
    const bedType = String(roomType?.bed_type || '').trim();
    if (!bedType) return 'No definido';
    return bedType;
  }

  getStatusLabel(rate: RateI | null): string {
    if (!rate) return 'Sin estado';
    return rate.is_active === false ? 'Inactiva' : 'Activa';
  }

  getPriceLabel(rate: RateI | null): string {
    if (!rate) return this.formatCurrency(0);
    return this.formatCurrency(this.toNumber(rate.price));
  }

  getValidityLabel(rate: RateI | null): string {
    const state = this.getValidityState(rate);
    if (state === 'ACTIVE_NOW') return 'Vigente';
    if (state === 'UPCOMING') return 'Proxima';
    if (state === 'EXPIRED') return 'Vencida';
    return 'Sin limite';
  }

  getRangeLabel(rate: RateI | null): string {
    if (!rate) return 'Sin periodo';

    const start = this.formatDate(rate.start_date);
    const end = this.formatDate(rate.end_date);

    if (start === 'Sin fecha' && end === 'Sin fecha') return 'Sin restriccion de fechas';
    if (start !== 'Sin fecha' && end === 'Sin fecha') return `Desde ${start}`;
    if (start === 'Sin fecha' && end !== 'Sin fecha') return `Hasta ${end}`;
    return `${start} - ${end}`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';

    const parsed = this.parseDate(value);
    if (!parsed) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private getValidityState(rate: RateI | null): 'ACTIVE_NOW' | 'UPCOMING' | 'EXPIRED' | 'OPEN' {
    if (!rate) return 'OPEN';

    const start = this.parseDate(rate.start_date || null);
    const end = this.parseDate(rate.end_date || null);
    const today = this.startOfDay(new Date());

    if (!start && !end) return 'OPEN';
    if (start && start > today) return 'UPCOMING';
    if (end && end < today) return 'EXPIRED';
    return 'ACTIVE_NOW';
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      return this.startOfDay(new Date(year, month - 1, day));
    }

    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) return null;
    return this.startOfDay(asDate);
  }

  private startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private toNumber(value: string | number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private getRoomType(rate: RateI | null): RoomTypeI | null {
    if (!rate) return null;
    return this.roomTypes.find((item) => item.id === Number(rate.room_type)) || null;
  }
}
