import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MaintenanceOrderI } from '../maintenance-order-model';

@Component({
  selector: 'app-detail-maintenance-order',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-maintenance-order.html',
  styleUrls: ['./detail-maintenance-order.css']
})
export class DetailMaintenanceOrder {
  @Input() maintenanceOrderData: MaintenanceOrderI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<MaintenanceOrderI>();
  @Output() deleteRequested = new EventEmitter<MaintenanceOrderI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusAdvance(): void {
    if (!this.maintenanceOrderData) return;
    this.statusRequested.emit(this.maintenanceOrderData);
  }

  requestDelete(): void {
    if (!this.maintenanceOrderData) return;
    this.deleteRequested.emit(this.maintenanceOrderData);
  }

  getRoomLabel(): string {
    if (!this.maintenanceOrderData) return 'Habitacion no definida';
    if (this.maintenanceOrderData.room_number?.trim()) {
      return `Habitacion ${this.maintenanceOrderData.room_number.trim()}`;
    }
    if (typeof this.maintenanceOrderData.room === 'number' && this.maintenanceOrderData.room > 0) {
      return `Habitacion #${this.maintenanceOrderData.room}`;
    }
    return 'Habitacion no definida';
  }

  getPriorityLabel(): string {
    if (!this.maintenanceOrderData) return 'Sin prioridad';
    return (
      this.maintenanceOrderData.priority_label ||
      this.readCodeLabel(this.maintenanceOrderData.priority) ||
      'Sin prioridad'
    );
  }

  getStatusLabel(): string {
    if (!this.maintenanceOrderData) return 'Sin estado';
    return (
      this.maintenanceOrderData.status_label ||
      this.readCodeLabel(this.maintenanceOrderData.status) ||
      'Sin estado'
    );
  }

  getStatusTone(): { bg: string; color: string } {
    const normalized = this.normalizeCode(this.maintenanceOrderData?.status);
    if (normalized === 'COMPLETADA') return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    if (normalized === 'ENPROCESO') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    if (normalized === 'CANCELADA') return { bg: 'var(--gh-status-neutral-bg)', color: 'var(--gh-status-neutral-text)' };
    return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
  }

  getPriorityTone(): { bg: string; color: string } {
    const normalized = this.normalizeCode(this.maintenanceOrderData?.priority);
    if (normalized === 'URGENTE') return { bg: 'var(--gh-status-danger-bg)', color: 'var(--gh-status-danger-text)' };
    if (normalized === 'ALTA') return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
    if (normalized === 'MEDIA') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
  }

  getProgressActionLabel(): string {
    const normalized = this.normalizeCode(this.maintenanceOrderData?.status);
    if (normalized === 'COMPLETADA' || normalized === 'CANCELADA') return 'Reabrir orden';
    if (normalized === 'ENPROCESO') return 'Marcar completada';
    return 'Iniciar orden';
  }

  getOrderCode(): string {
    if (!this.maintenanceOrderData?.id) return 'OM-0000';
    return `OM-${String(this.maintenanceOrderData.id).padStart(4, '0')}`;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = this.parseDate(value);
    if (!parsed) return value;

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private readCodeLabel(value: unknown): string {
    const cleaned = String(value || '').trim();
    if (!cleaned) return '';
    return cleaned
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private parseDate(value: string): Date | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }
}
