import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CleaningTaskI } from '../cleaning-task-model';

@Component({
  selector: 'app-detail-cleaning-task',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-cleaning-task.html',
  styleUrls: ['./detail-cleaning-task.css']
})
export class DetailCleaningTask {
  @Input() cleaningTaskData: CleaningTaskI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<CleaningTaskI>();
  @Output() deleteRequested = new EventEmitter<CleaningTaskI>();

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusAdvance(): void {
    if (!this.cleaningTaskData) return;
    this.statusRequested.emit(this.cleaningTaskData);
  }

  requestDelete(): void {
    if (!this.cleaningTaskData) return;
    this.deleteRequested.emit(this.cleaningTaskData);
  }

  getRoomLabel(): string {
    if (!this.cleaningTaskData) return 'Habitacion no definida';
    if (this.cleaningTaskData.room_number?.trim()) {
      return `Habitacion ${this.cleaningTaskData.room_number.trim()}`;
    }
    if (typeof this.cleaningTaskData.room === 'number' && this.cleaningTaskData.room > 0) {
      return `Habitacion #${this.cleaningTaskData.room}`;
    }
    return 'Habitacion no definida';
  }

  getTaskTypeLabel(): string {
    if (!this.cleaningTaskData) return 'Sin tipo';
    return (
      this.cleaningTaskData.task_type_label ||
      this.readCodeLabel(this.cleaningTaskData.task_type) ||
      'Sin tipo'
    );
  }

  getStatusLabel(): string {
    if (!this.cleaningTaskData) return 'Sin estado';
    return (
      this.cleaningTaskData.status_label ||
      this.readCodeLabel(this.cleaningTaskData.status) ||
      'Sin estado'
    );
  }

  getStatusTone(): { bg: string; color: string } {
    const normalized = this.normalizeCode(this.cleaningTaskData?.status);
    if (normalized === 'COMPLETADA') return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    if (normalized === 'ENPROCESO') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    if (normalized === 'CANCELADA') return { bg: 'var(--gh-status-neutral-bg)', color: 'var(--gh-status-neutral-text)' };
    return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
  }

  getProgressActionLabel(): string {
    const normalized = this.normalizeCode(this.cleaningTaskData?.status);
    if (normalized === 'COMPLETADA' || normalized === 'CANCELADA') return 'Reabrir tarea';
    if (normalized === 'ENPROCESO') return 'Marcar completada';
    return 'Iniciar tarea';
  }

  getTaskCode(): string {
    if (!this.cleaningTaskData?.id) return 'TL-0000';
    return `TL-${String(this.cleaningTaskData.id).padStart(4, '0')}`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = this.parseDate(value);
    if (!parsed) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
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
