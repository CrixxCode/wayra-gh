import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { InventoryMovementI } from '../inventory-movement-model';

/**
 * Detalle de un movimiento de inventario.
 *
 * Antes repetia el mismo dato hasta tres veces: la direccion salia en el sobretitulo,
 * en "Tipo" y en "Direccion"; la cantidad salia como "Cantidad" y otra vez como
 * "Variacion stock"; el estado, en el chip del titulo y en "Resumen". Y las tres
 * fechas de "Trazabilidad" eran el mismo instante, porque un movimiento no se edita.
 *
 * Un movimiento **es** un antes y un despues, asi que ese salto es ahora el titular y
 * lo demas contesta una sola pregunta: por que ocurrio.
 */
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

  get itemLabel(): string {
    return String(this.movementData?.item_name || '').trim() || 'Item no definido';
  }

  get previousStock(): number {
    return this.toNonNegativeInt(this.movementData?.previous_stock);
  }

  get newStock(): number {
    return this.toNonNegativeInt(this.movementData?.new_stock);
  }

  /**
   * De donde vino el movimiento, cuando la referencia lo dice.
   *
   * Los movimientos automaticos traen una referencia generada como
   * `ROOM-<habitacion>-<reserva>-<marca de tiempo>`, que en crudo es ilegible. Si
   * encaja con ese patron se traduce; si no, se muestra tal cual, que para un
   * movimiento manual es justo lo que el usuario escribio.
   */
  get originLabel(): string {
    const reference = String(this.movementData?.reference || '').trim();
    if (!reference) return '';

    const match = /^ROOM-([^-]+)-(\d+)/i.exec(reference);
    if (!match) return reference;

    return `Habitacion ${match[1]} - reserva #${match[2]}`;
  }

  get rawReference(): string {
    return String(this.movementData?.reference || '').trim();
  }

  get notes(): string {
    return String(this.movementData?.notes || '').trim();
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
