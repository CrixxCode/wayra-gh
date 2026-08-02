import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RateI, RoomTypeI } from '../room-model';

@Component({
  selector: 'app-detail-room-type',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-room-type.html',
  styleUrls: ['./detail-room-type.css']
})
export class DetailRoomType {
  @Input() roomType: RoomTypeI | null = null;
  @Input() activeRate: RateI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<RoomTypeI>();
  @Output() statusRequested = new EventEmitter<RoomTypeI>();
  @Output() deleteRequested = new EventEmitter<RoomTypeI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.roomType) return;
    this.statusRequested.emit(this.roomType);
  }

  requestEdit(): void {
    if (!this.roomType) return;
    this.editRequested.emit(this.roomType);
  }

  requestDelete(): void {
    if (!this.roomType) return;
    this.deleteRequested.emit(this.roomType);
  }

  getStatusLabel(): string {
    if (!this.roomType) return 'Sin estado';
    return this.roomType.is_active === false ? 'Inactivo' : 'Activo';
  }

  getCapacityLabel(): string {
    const capacity = this.toPositiveNumber(this.roomType?.capacity);
    if (!capacity) return '--';
    return `${capacity} persona${capacity === 1 ? '' : 's'}`;
  }

  getBedCountLabel(): string {
    const beds = this.toPositiveNumber(this.roomType?.bed_count);
    if (!beds) return '--';
    return `${beds} cama${beds === 1 ? '' : 's'}`;
  }

  getBedTypeLabel(): string {
    const value = String(this.roomType?.bed_type || '').trim();
    return value || 'No definido';
  }

  getSortOrderLabel(): string {
    return `${Number(this.roomType?.sort_order || 0)}`;
  }

  getRateNameLabel(): string {
    if (!this.activeRate) return 'Sin tarifa activa';
    return this.activeRate.name || 'Tarifa activa';
  }

  getRatePriceLabel(): string {
    if (!this.activeRate) return 'Sin tarifa';
    return this.formatCurrency(this.toNumber(this.activeRate.price));
  }

  getRateRangeLabel(): string {
    if (!this.activeRate) return 'Sin periodo';
    const start = this.formatDate(this.activeRate.start_date);
    const end = this.formatDate(this.activeRate.end_date);

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

  private parseDate(value: string): Date | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      return this.startOfDay(new Date(year, month - 1, day));
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return this.startOfDay(parsed);
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

  private toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  }
}
