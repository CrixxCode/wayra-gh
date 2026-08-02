import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoomInventoryI } from '../room-inventory-model';

type RoomInventoryDetailGroup = {
  key: string;
  label: string;
  items: RoomInventoryI[];
};

@Component({
  selector: 'app-detail-room-inventory',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-room-inventory.html',
  styleUrls: ['./detail-room-inventory.css']
})
export class DetailRoomInventory {
  @Input() roomGroup: RoomInventoryDetailGroup | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<RoomInventoryI>();
  @Output() deleteRequested = new EventEmitter<RoomInventoryI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(record: RoomInventoryI): void {
    this.statusRequested.emit(record);
  }

  requestDelete(record: RoomInventoryI): void {
    this.deleteRequested.emit(record);
  }

  get roomLabel(): string {
    return this.roomGroup?.label || 'Habitacion no definida';
  }

  get records(): RoomInventoryI[] {
    if (!this.roomGroup?.items?.length) return [];
    return [...this.roomGroup.items].sort((a, b) => this.getItemLabel(a).localeCompare(this.getItemLabel(b), 'es'));
  }

  get totalItems(): number {
    return this.records.length;
  }

  get activeItems(): number {
    return this.records.filter((record) => record.is_active).length;
  }

  get lowItems(): number {
    return this.records.filter((record) => this.resolveCoverageState(record) === 'LOW').length;
  }

  get outItems(): number {
    return this.records.filter((record) => this.resolveCoverageState(record) === 'OUT').length;
  }

  get totalUnits(): number {
    return this.records.reduce((sum, record) => sum + this.toNonNegativeInt(record.quantity), 0);
  }

  get latestUpdateLabel(): string {
    const timestamps = this.records
      .map((record) => this.toTimestamp(record.updated_at || record.created_at))
      .filter((timestamp) => Number.isFinite(timestamp)) as number[];

    if (!timestamps.length) return 'Sin registro';
    return this.formatDate(new Date(Math.max(...timestamps)).toISOString());
  }

  getCoverageLabel(record: RoomInventoryI): string {
    const state = this.resolveCoverageState(record);
    if (state === 'OUT') return 'Sin stock';
    if (state === 'LOW') return 'Bajo minimo';
    return 'Cobertura normal';
  }

  getCoverageTone(record: RoomInventoryI): { bg: string; color: string } {
    const state = this.resolveCoverageState(record);
    if (state === 'OUT') return { bg: 'var(--gh-status-danger-bg)', color: 'var(--gh-status-danger-text)' };
    if (state === 'LOW') return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
    return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
  }

  getStatusLabel(record: RoomInventoryI): string {
    return record.is_active ? 'Activo' : 'Inactivo';
  }

  getStatusTone(record: RoomInventoryI): { bg: string; color: string } {
    if (record.is_active) return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    return { bg: 'var(--gh-status-neutral-bg)', color: 'var(--gh-status-neutral-text)' };
  }

  getItemLabel(record: RoomInventoryI): string {
    return String(record.item_name || '').trim() || `Item #${record.item || '--'}`;
  }

  getItemSku(record: RoomInventoryI): string {
    const sku = String(record.item_sku || '').trim();
    return sku || 'Sin SKU';
  }

  getQuantityLabel(record: RoomInventoryI): string {
    return `${this.toNonNegativeInt(record.quantity)} unid`;
  }

  getMinimumLabel(record: RoomInventoryI): string {
    return `${this.toNonNegativeInt(record.minimum_quantity)} unid`;
  }

  getNotesLabel(record: RoomInventoryI): string {
    const notes = String(record.notes || '').trim();
    return notes || 'Sin notas';
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

  private resolveCoverageState(record: RoomInventoryI): 'NORMAL' | 'LOW' | 'OUT' {
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
