import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ItemI } from '../item-model';

@Component({
  selector: 'app-detail-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-item.html',
  styleUrls: ['./detail-item.css']
})
export class DetailItem {
  @Input() itemData: ItemI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<ItemI>();
  @Output() deleteRequested = new EventEmitter<ItemI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.itemData) return;
    this.statusRequested.emit(this.itemData);
  }

  requestDelete(): void {
    if (!this.itemData) return;
    this.deleteRequested.emit(this.itemData);
  }

  getStatusLabel(): string {
    if (!this.itemData) return 'Sin estado';
    return this.itemData.is_active ? 'Activo' : 'Inactivo';
  }

  getTypeLabel(): string {
    if (!this.itemData) return 'Sin tipo';
    return this.itemData.item_type_name || this.itemData.item_type_code || 'Sin tipo';
  }

  getUnitLabel(): string {
    if (!this.itemData) return 'Sin unidad';
    return this.itemData.unit_measure_name || this.itemData.unit_measure_code || 'unidad';
  }

  getStockStateLabel(): string {
    if (!this.itemData) return 'Sin stock';
    const stock = this.toNonNegativeInt(this.itemData.stock);
    const minimum = this.toNonNegativeInt(this.itemData.minimum_stock);
    const maximum = this.toNonNegativeInt(this.itemData.maximum_stock);

    if (stock <= 0) return 'Sin stock';
    if (stock <= minimum) return 'Bajo minimo';
    if (maximum > 0 && stock > maximum) return 'Exceso';
    return 'Stock saludable';
  }

  getStockStateTone(): { bg: string; color: string } {
    if (!this.itemData) {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)'
      };
    }

    const stock = this.toNonNegativeInt(this.itemData.stock);
    const minimum = this.toNonNegativeInt(this.itemData.minimum_stock);
    const maximum = this.toNonNegativeInt(this.itemData.maximum_stock);

    if (stock <= 0) {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)'
      };
    }
    if (stock <= minimum) {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)'
      };
    }
    if (maximum > 0 && stock > maximum) {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-strong-alt)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)'
    };
  }

  getMaximumStockLabel(): string {
    const maximum = this.toNonNegativeInt(this.itemData?.maximum_stock);
    if (maximum <= 0) return 'Sin tope';
    return String(maximum);
  }

  getCostPriceLabel(): string {
    return this.formatCurrency(this.toNumber(this.itemData?.cost_price));
  }

  getSalePriceLabel(): string {
    return this.formatCurrency(this.toNumber(this.itemData?.sale_price));
  }

  getMarginLabel(): string {
    const margin = this.toNumber(this.itemData?.sale_price) - this.toNumber(this.itemData?.cost_price);
    return this.formatCurrency(margin);
  }

  getStockLabel(): string {
    const stock = this.toNonNegativeInt(this.itemData?.stock);
    return `${stock} ${this.getUnitLabel()}`;
  }

  getStockValueLabel(): string {
    const stock = this.toNonNegativeInt(this.itemData?.stock);
    const cost = this.toNumber(this.itemData?.cost_price);
    return this.formatCurrency(stock * cost);
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

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private toNonNegativeInt(value: number | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
