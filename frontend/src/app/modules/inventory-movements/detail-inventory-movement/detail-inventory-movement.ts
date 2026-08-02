import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InventoryMovementI } from '../inventory-movement-model';

@Component({
  selector: 'app-detail-inventory-movement',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-inventory-movement.html',
  styleUrls: ['./detail-inventory-movement.css']
})
export class DetailInventoryMovement {
  @Input() movementData: InventoryMovementI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<InventoryMovementI>();
  @Output() deleteRequested = new EventEmitter<InventoryMovementI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.movementData) return;
    this.statusRequested.emit(this.movementData);
  }

  requestDelete(): void {
    if (!this.movementData) return;
    this.deleteRequested.emit(this.movementData);
  }

  getMovementTypeLabel(): string {
    if (!this.movementData) return 'Sin tipo';
    return this.movementData.movement_type_name || this.movementData.movement_type_code || 'Sin tipo';
  }

  getStatusLabel(): string {
    if (!this.movementData) return 'Sin estado';
    return this.movementData.is_active ? 'Activo' : 'Inactivo';
  }

  getDirectionLabel(): string {
    const code = this.getMovementCode();
    if (code === 'IN') return 'Entrada';
    if (code === 'OUT') return 'Salida';
    if (code === 'LOSS') return 'Perdida';
    if (code === 'ADJUSTMENT') return 'Ajuste';
    if (code === 'TRANSFER') return 'Transferencia';
    return 'Movimiento';
  }

  getDirectionTone(): { bg: string; color: string } {
    const code = this.getMovementCode();
    if (code === 'IN') {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)'
      };
    }
    if (code === 'OUT' || code === 'LOSS') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)'
      };
    }
    if (code === 'ADJUSTMENT') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-strong-alt)'
      };
    }
    if (code === 'TRANSFER') {
      return {
        bg: 'var(--gh-status-violet-bg)',
        color: 'var(--gh-status-violet-text)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)'
    };
  }

  getQuantityLabel(): string {
    const quantity = this.toNonNegativeInt(this.movementData?.quantity);
    const code = this.getMovementCode();

    if (code === 'IN') return `+${quantity}`;
    if (code === 'OUT' || code === 'LOSS') return `-${quantity}`;
    return `${quantity}`;
  }

  getStockDeltaLabel(): string {
    if (!this.movementData) return '0';

    const previous = this.toNonNegativeInt(this.movementData.previous_stock);
    const current = this.toNonNegativeInt(this.movementData.new_stock);
    const delta = current - previous;

    if (delta > 0) return `+${delta}`;
    return `${delta}`;
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

  formatDateTime(value: string | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private getMovementCode(): string {
    return this.normalizeCode(this.movementData?.movement_type_code || '');
  }

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
