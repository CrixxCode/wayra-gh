import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { RoomInventoryI } from '../room-inventory-model';

type RoomInventoryDetailGroup = {
  key: string;
  label: string;
  items: RoomInventoryI[];
};

/** Cobertura de una línea, de peor a mejor. Ordena la lista. */
type CoverageState = 'OUT' | 'LOW' | 'NORMAL';

const COVERAGE_ORDER: Record<CoverageState, number> = { OUT: 0, LOW: 1, NORMAL: 2 };

/**
 * Dotación de una habitación.
 *
 * Antes esto era una pantalla para **leer**: cuatro contadores arriba, un bloque
 * "Resumen" que repetía uno de ellos, y cada línea con tres recuadros rotulados
 * (Cantidad / Mínimo / Estado) que había que juntar mentalmente para saber si algo
 * faltaba. Las dos únicas acciones eran destructivas —inactivar y eliminar—, así que
 * el recorrido acababa sin poder hacer nada con lo que se acababa de descubrir.
 *
 * Ahora es una pantalla para **resolver**: una barra de cobertura arriba, la lista
 * **ordenada por urgencia** y la cantidad editable en cada línea, que es la acción
 * corriente cuando se descubre que a una habitación le falta algo.
 */
@Component({
  selector: 'app-detail-room-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './detail-room-inventory.html',
  styleUrls: ['./detail-room-inventory.css']
})
export class DetailRoomInventory {
  @Input() roomGroup: RoomInventoryDetailGroup | null = null;

  /** Línea que se está guardando, para bloquear su control sin congelar el resto. */
  @Input() savingRecordId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<RoomInventoryI>();
  @Output() deleteRequested = new EventEmitter<RoomInventoryI>();

  /** Nueva cantidad para una línea: es la acción que faltaba. */
  @Output() quantityRequested = new EventEmitter<{ record: RoomInventoryI; quantity: number }>();

  /** Cantidades en edición, por id de línea. Solo se envía lo que cambió. */
  drafts: Record<number, number> = {};

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(record: RoomInventoryI): void {
    this.statusRequested.emit(record);
  }

  requestDelete(record: RoomInventoryI): void {
    this.deleteRequested.emit(record);
  }

  // ------------------------------------------------------------ cantidad

  draftFor(record: RoomInventoryI): number {
    const draft = this.drafts[record.id];
    return typeof draft === 'number' ? draft : this.toNonNegativeInt(record.quantity);
  }

  setDraft(record: RoomInventoryI, value: unknown): void {
    this.drafts[record.id] = this.toNonNegativeInt(value);
  }

  stepDraft(record: RoomInventoryI, delta: number): void {
    this.drafts[record.id] = Math.max(this.draftFor(record) + delta, 0);
  }

  /** Atajo del caso corriente: dejar la línea justo en su mínimo. */
  fillToMinimum(record: RoomInventoryI): void {
    this.drafts[record.id] = this.toNonNegativeInt(record.minimum_quantity);
  }

  hasPendingChange(record: RoomInventoryI): boolean {
    return this.draftFor(record) !== this.toNonNegativeInt(record.quantity);
  }

  saveQuantity(record: RoomInventoryI): void {
    if (!this.hasPendingChange(record) || this.isSaving(record)) return;
    this.quantityRequested.emit({ record, quantity: this.draftFor(record) });
  }

  discardDraft(record: RoomInventoryI): void {
    delete this.drafts[record.id];
  }

  isSaving(record: RoomInventoryI): boolean {
    return this.savingRecordId === record.id;
  }

  // -------------------------------------------------------------- lectura

  get roomLabel(): string {
    return this.roomGroup?.label || 'Habitacion no definida';
  }

  /**
   * Ordenadas por urgencia, no por nombre.
   *
   * En una habitación con veinte líneas, el orden alfabético entierra justo lo que hay
   * que resolver.
   */
  get records(): RoomInventoryI[] {
    if (!this.roomGroup?.items?.length) return [];

    return [...this.roomGroup.items].sort((a, b) => {
      const byUrgency =
        COVERAGE_ORDER[this.resolveCoverageState(a)] - COVERAGE_ORDER[this.resolveCoverageState(b)];
      if (byUrgency !== 0) return byUrgency;
      return this.getItemLabel(a).localeCompare(this.getItemLabel(b), 'es');
    });
  }

  get totalItems(): number {
    return this.records.length;
  }

  get lowItems(): number {
    return this.records.filter((record) => this.resolveCoverageState(record) === 'LOW').length;
  }

  get outItems(): number {
    return this.records.filter((record) => this.resolveCoverageState(record) === 'OUT').length;
  }

  get coveredItems(): number {
    return this.totalItems - this.lowItems - this.outItems;
  }

  get totalUnits(): number {
    return this.records.reduce((sum, record) => sum + this.toNonNegativeInt(record.quantity), 0);
  }

  /** Cuánta de la dotación está completa: el titular de la pantalla. */
  get coveragePercent(): number {
    if (!this.totalItems) return 0;
    return Math.round((this.coveredItems / this.totalItems) * 100);
  }

  get coverageTone(): { bg: string; color: string; bar: string } {
    if (this.outItems > 0) {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        bar: 'var(--gh-status-danger-strong)'
      };
    }
    if (this.lowItems > 0) {
      return {
        bg: 'var(--gh-status-warn-bg)',
        color: 'var(--gh-status-warn-text)',
        bar: 'var(--gh-status-warn-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      bar: 'var(--gh-status-success-strong)'
    };
  }

  /** Titular en una frase: lo que antes había que deducir de cuatro contadores. */
  get coverageHeadline(): string {
    if (!this.totalItems) return 'Sin items asignados';
    if (this.outItems > 0) return `${this.outItems} sin stock`;
    if (this.lowItems > 0) return `${this.lowItems} bajo minimo`;
    return 'Dotacion completa';
  }

  get latestUpdateLabel(): string {
    const timestamps = this.records
      .map((record) => this.toTimestamp(record.updated_at || record.created_at))
      .filter((timestamp) => Number.isFinite(timestamp)) as number[];

    if (!timestamps.length) return 'Sin registro';
    return this.formatDate(new Date(Math.max(...timestamps)).toISOString());
  }

  // ------------------------------------------------------------ por linea

  /** Relleno de la barra de una línea: cantidad frente a su mínimo. */
  getRecordFillPercent(record: RoomInventoryI): number {
    const quantity = this.toNonNegativeInt(record.quantity);
    const minimum = this.toNonNegativeInt(record.minimum_quantity);

    // Sin mínimo definido no hay nada contra que medir: la barra se llena si hay algo.
    if (minimum <= 0) return quantity > 0 ? 100 : 0;

    return Math.max(0, Math.min(100, (quantity / minimum) * 100));
  }

  getCoverageLabel(record: RoomInventoryI): string {
    const state = this.resolveCoverageState(record);
    if (state === 'OUT') return 'Sin stock';
    if (state === 'LOW') return 'Bajo minimo';
    return 'Completo';
  }

  getCoverageTone(record: RoomInventoryI): { bg: string; color: string; bar: string } {
    const state = this.resolveCoverageState(record);
    if (state === 'OUT') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        bar: 'var(--gh-status-danger-strong)'
      };
    }
    if (state === 'LOW') {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)',
        bar: 'var(--gh-status-warn-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      bar: 'var(--gh-status-success-strong)'
    };
  }

  getItemLabel(record: RoomInventoryI): string {
    return String(record.item_name || '').trim() || 'Item sin nombre';
  }

  getItemSku(record: RoomInventoryI): string {
    return String(record.item_sku || '').trim();
  }

  getMinimumLabel(record: RoomInventoryI): string {
    const minimum = this.toNonNegativeInt(record.minimum_quantity);
    return minimum > 0 ? `minimo ${minimum}` : 'sin minimo';
  }

  getNotes(record: RoomInventoryI): string {
    return String(record.notes || '').trim();
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

  trackByRecord(_: number, record: RoomInventoryI): number {
    return record.id;
  }

  private resolveCoverageState(record: RoomInventoryI): CoverageState {
    const quantity = this.toNonNegativeInt(record.quantity);
    const minimum = this.toNonNegativeInt(record.minimum_quantity);
    if (quantity <= 0) return 'OUT';
    if (quantity <= minimum) return 'LOW';
    return 'NORMAL';
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private toTimestamp(value: string | undefined): number {
    if (!value) return Number.NaN;
    const parsed = new Date(value);
    return parsed.getTime();
  }
}
