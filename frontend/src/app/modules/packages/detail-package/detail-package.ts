import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PackageI } from '../package-model';

@Component({
  selector: 'app-detail-package',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-package.html',
  styleUrls: ['./detail-package.css']
})
export class DetailPackage {
  @Input() packageData: PackageI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<PackageI>();
  @Output() statusRequested = new EventEmitter<PackageI>();
  @Output() deleteRequested = new EventEmitter<PackageI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestEdit(): void {
    if (!this.packageData) return;
    this.editRequested.emit(this.packageData);
  }

  requestStatusToggle(): void {
    if (!this.packageData) return;
    this.statusRequested.emit(this.packageData);
  }

  requestDelete(): void {
    if (!this.packageData) return;
    this.deleteRequested.emit(this.packageData);
  }

  getStatusLabel(): string {
    if (!this.packageData) return 'Sin estado';
    return this.packageData.is_active ? 'Activo' : 'Inactivo';
  }

  getValidityLabel(): string {
    if (!this.packageData) return 'Sin vigencia';

    const start = this.parseDate(this.packageData.start_date);
    const end = this.parseDate(this.packageData.end_date);
    const today = this.startOfDay(new Date());

    if (!start && !end) return 'Sin vigencia';
    if (start && start > today) return 'Proximo';
    if (end && end < today) return 'Fuera de fecha';
    return 'Vigente';
  }

  getPriceLabel(): string {
    const raw = this.packageData?.base_price;
    const value = Number(raw || 0);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(Number.isNaN(value) ? 0 : value);
  }

  getDateRangeLabel(): string {
    if (!this.packageData) return 'Sin fechas';
    const startLabel = this.formatDate(this.packageData.start_date);
    const endLabel = this.formatDate(this.packageData.end_date);

    if (!this.packageData.start_date && !this.packageData.end_date) {
      return 'Sin fechas de vigencia';
    }

    return `${startLabel} - ${endLabel}`;
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
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }
}
