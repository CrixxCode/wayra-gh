import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PromotionI } from '../promotion-model';

@Component({
  selector: 'app-detail-promotion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-promotion.html',
  styleUrls: ['./detail-promotion.css']
})
export class DetailPromotion {
  @Input() promotionData: PromotionI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<PromotionI>();
  @Output() visibilityRequested = new EventEmitter<PromotionI>();
  @Output() deleteRequested = new EventEmitter<PromotionI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.promotionData) return;
    this.statusRequested.emit(this.promotionData);
  }

  requestVisibilityToggle(): void {
    if (!this.promotionData) return;
    this.visibilityRequested.emit(this.promotionData);
  }

  requestDelete(): void {
    if (!this.promotionData) return;
    this.deleteRequested.emit(this.promotionData);
  }

  getStatusLabel(): string {
    if (!this.promotionData) return 'Sin estado';
    return this.promotionData.is_active ? 'Activa' : 'Inactiva';
  }

  getVisibilityLabel(): string {
    if (!this.promotionData) return 'Sin visibilidad';
    return this.promotionData.is_public ? 'Publica' : 'Interna';
  }

  getDiscountTypeLabel(): string {
    if (!this.promotionData) return 'Sin tipo';
    return this.promotionData.discount_type_name || this.promotionData.discount_type_code || 'Sin tipo';
  }

  getDiscountValueLabel(): string {
    if (!this.promotionData) return '--';

    const value = this.toNumber(this.promotionData.discount_value);
    if (this.isPercentageDiscount()) {
      const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(2);
      return `${normalized}%`;
    }

    return this.formatCurrency(value);
  }

  getPromotionTargetLabel(): string {
    if (!this.promotionData) return 'No definido';

    if (this.promotionData.package_name) return `Paquete: ${this.promotionData.package_name}`;
    if (this.promotionData.service_name) return `Servicio: ${this.promotionData.service_name}`;

    if (this.promotionData.package) return `Paquete #${this.promotionData.package}`;
    if (this.promotionData.service) return `Servicio #${this.promotionData.service}`;

    return 'Promocion general';
  }

  getDateRangeLabel(): string {
    if (!this.promotionData) return 'Sin vigencia';

    const start = this.formatDate(this.promotionData.start_date);
    const end = this.formatDate(this.promotionData.end_date);
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

  private isPercentageDiscount(): boolean {
    const code = this.normalizeCode(this.promotionData?.discount_type_code || '');
    return code.includes('PERCENT') || code.includes('PORCEN') || code === 'PCT';
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

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }
}
