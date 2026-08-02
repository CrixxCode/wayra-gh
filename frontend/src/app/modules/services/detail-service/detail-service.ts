import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ServiceI } from '../service-model';

@Component({
  selector: 'app-detail-service',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-service.html',
  styleUrls: ['./detail-service.css']
})
export class DetailService {
  @Input() service: ServiceI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<ServiceI>();
  @Output() statusRequested = new EventEmitter<ServiceI>();
  @Output() deleteRequested = new EventEmitter<ServiceI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestEdit(): void {
    if (!this.service) return;
    this.editRequested.emit(this.service);
  }

  requestStatusToggle(): void {
    if (!this.service) return;
    this.statusRequested.emit(this.service);
  }

  requestDelete(): void {
    if (!this.service) return;
    this.deleteRequested.emit(this.service);
  }

  getTypeLabel(service: ServiceI | null): string {
    if (!service) return 'Sin tipo';
    return service.service_type_name || service.service_type_code || 'Sin tipo';
  }

  getStatusLabel(service: ServiceI | null): string {
    if (!service) return 'Sin estado';
    return service.is_active ? 'Activo' : 'Inactivo';
  }

  getPriceLabel(service: ServiceI | null): string {
    if (!service) return this.formatCurrency(0);
    return this.formatCurrency(this.toPriceNumber(service.base_price));
  }

  formatDate(value: string | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

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

  private toPriceNumber(value: string | number): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber)) return 0;
    return asNumber;
  }
}
