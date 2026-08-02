import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { RoomI } from '../../rooms/room-model';
import { CleaningTaskFormPayload } from '../cleaning-task-model';

@Component({
  selector: 'app-create-cleaning-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-cleaning-task.html',
  styleUrls: ['./create-cleaning-task.css']
})
export class CreateCleaningTask implements OnChanges {
  @Input() rooms: RoomI[] = [];
  @Input() taskTypes: MasterDataI[] = [];
  @Input() statuses: MasterDataI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  cleaningTaskForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private cleaningTasksService: CleaningTasksService
  ) {
    this.cleaningTaskForm = this.fb.group({
      room: [null as number | null, [Validators.required]],
      task_type: ['', [Validators.required]],
      status: ['', [Validators.required]],
      scheduled_for: [''],
      completed_at: [''],
      notes: ['', [Validators.maxLength(2000)]]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['statuses']) {
      this.ensureDefaultStatus();
    }
  }

  get room() {
    return this.cleaningTaskForm.get('room');
  }

  get task_type() {
    return this.cleaningTaskForm.get('task_type');
  }

  get status() {
    return this.cleaningTaskForm.get('status');
  }

  get shouldShowCompletedAt(): boolean {
    return this.normalizeCode(this.status?.value) === 'COMPLETADA';
  }

  get availableRooms(): RoomI[] {
    return this.rooms
      .filter((room) => !!room.number)
      .sort((a, b) => (a.number || '').localeCompare(b.number || '', 'es', { numeric: true }));
  }

  get availableTaskTypes(): MasterDataI[] {
    return [...this.taskTypes].sort((a, b) => {
      const byOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (byOrder !== 0) return byOrder;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });
  }

  get availableStatuses(): MasterDataI[] {
    return [...this.statuses].sort((a, b) => {
      const byOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (byOrder !== 0) return byOrder;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.availableRooms.length) {
      this.errorMessage = 'No hay habitaciones disponibles para crear tareas de limpieza.';
      return;
    }

    if (!this.availableTaskTypes.length) {
      this.errorMessage = 'No hay tipos de tarea activos en master data.';
      return;
    }

    if (!this.availableStatuses.length) {
      this.errorMessage = 'No hay estados de limpieza activos en master data.';
      return;
    }

    if (this.cleaningTaskForm.invalid) {
      this.cleaningTaskForm.markAllAsTouched();
      return;
    }

    const raw = this.cleaningTaskForm.getRawValue();
    const statusCode = this.resolveCatalogCode(raw.status, this.availableStatuses);
    const taskTypeCode = this.resolveCatalogCode(raw.task_type, this.availableTaskTypes);

    const isCompleted = this.normalizeCode(statusCode) === 'COMPLETADA';
    const completedAt = isCompleted
      ? this.normalizeDateTime(raw.completed_at) || this.toDateTimeLocal(new Date())
      : null;

    const payload: CleaningTaskFormPayload = {
      room: Number(raw.room),
      task_type: taskTypeCode,
      status: statusCode,
      scheduled_for: this.normalizeDate(raw.scheduled_for),
      completed_at: completedAt,
      notes: raw.notes?.trim() || ''
    };

    this.saving = true;
    this.cleaningTasksService.createCleaningTask(payload).subscribe({
      next: () => {
        this.saving = false;
        this.created.emit();
        this.closeDrawer();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error);
      }
    });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.closed.emit();
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  getRoomLabel(roomData: RoomI): string {
    const floor = roomData.floor_name ? ` - ${roomData.floor_name}` : '';
    return `Habitacion ${roomData.number}${floor}`;
  }

  private ensureDefaultStatus(): void {
    const current = this.resolveCatalogCode(this.status?.value, this.availableStatuses);
    const hasCurrent = this.availableStatuses.some(
      (statusItem) => statusItem.code === current || this.normalizeCode(statusItem.code) === this.normalizeCode(current)
    );

    if (hasCurrent) {
      this.cleaningTaskForm.patchValue({ status: current }, { emitEvent: false });
      return;
    }

    const pending = this.availableStatuses.find((statusItem) => this.normalizeCode(statusItem.code) === 'PENDIENTE');
    const fallback = pending?.code || this.availableStatuses[0]?.code || '';

    this.cleaningTaskForm.patchValue({ status: fallback }, { emitEvent: false });
  }

  private resolveCatalogCode(value: unknown, catalog: MasterDataI[]): string {
    if (typeof value === 'number') {
      const fromId = catalog.find((item) => item.id === value);
      if (fromId?.code) return fromId.code;
      return String(value);
    }

    const raw = String(value || '').trim();
    if (!raw) return '';

    const exactCode = catalog.find((item) => item.code === raw);
    if (exactCode?.code) return exactCode.code;

    const normalized = this.normalizeCode(raw);
    const normalizedMatch = catalog.find((item) => this.normalizeCode(item.code) === normalized);
    if (normalizedMatch?.code) return normalizedMatch.code;

    return raw.toUpperCase();
  }

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizeDate(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeDateTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo crear la tarea de limpieza. Revisa los datos e intenta nuevamente.';

    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = (payload as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
    }

    return fallback;
  }
}
