import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { RoomI } from '../../rooms/room-model';
import { MaintenanceOrderFormPayload } from '../maintenance-order-model';

@Component({
  selector: 'app-create-maintenance-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-maintenance-order.html',
  styleUrls: ['./create-maintenance-order.css']
})
export class CreateMaintenanceOrder implements OnChanges {
  @Input() rooms: RoomI[] = [];
  @Input() priorities: MasterDataI[] = [];
  @Input() statuses: MasterDataI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  maintenanceOrderForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private maintenanceOrdersService: MaintenanceOrdersService
  ) {
    this.maintenanceOrderForm = this.fb.group({
      room: [null as number | null, [Validators.required]],
      title: ['', [Validators.required, Validators.maxLength(150)]],
      description: ['', [Validators.maxLength(3000)]],
      priority: ['', [Validators.required]],
      status: ['', [Validators.required]],
      estimated_completed_at: [''],
      completed_at: ['']
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['statuses'] || changes['priorities']) {
      this.ensureDefaultValues();
    }
  }

  get room() {
    return this.maintenanceOrderForm.get('room');
  }

  get title() {
    return this.maintenanceOrderForm.get('title');
  }

  get priority() {
    return this.maintenanceOrderForm.get('priority');
  }

  get status() {
    return this.maintenanceOrderForm.get('status');
  }

  get shouldShowCompletedAt(): boolean {
    return this.normalizeCode(this.status?.value) === 'COMPLETADA';
  }

  get availableRooms(): RoomI[] {
    return this.rooms
      .filter((roomData) => !!roomData.number)
      .sort((a, b) => (a.number || '').localeCompare(b.number || '', 'es', { numeric: true }));
  }

  get availablePriorities(): MasterDataI[] {
    return [...this.priorities].sort((a, b) => {
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
      this.errorMessage = 'No hay habitaciones disponibles para crear ordenes de mantenimiento.';
      return;
    }

    if (!this.availablePriorities.length) {
      this.errorMessage = 'No hay prioridades de mantenimiento activas en master data.';
      return;
    }

    if (!this.availableStatuses.length) {
      this.errorMessage = 'No hay estados de mantenimiento activos en master data.';
      return;
    }

    if (this.maintenanceOrderForm.invalid) {
      this.maintenanceOrderForm.markAllAsTouched();
      return;
    }

    const raw = this.maintenanceOrderForm.getRawValue();
    const priorityCode = this.resolveCatalogCode(raw.priority, this.availablePriorities);
    const statusCode = this.resolveCatalogCode(raw.status, this.availableStatuses);
    const isCompleted = this.normalizeCode(statusCode) === 'COMPLETADA';

    const payload: MaintenanceOrderFormPayload = {
      room: Number(raw.room),
      title: String(raw.title || '').trim(),
      description: String(raw.description || '').trim(),
      priority: priorityCode,
      status: statusCode,
      estimated_completed_at: this.normalizeDateTime(raw.estimated_completed_at),
      completed_at: isCompleted ? this.normalizeDateTime(raw.completed_at) || this.toDateTimeLocal(new Date()) : null
    };

    this.saving = true;
    this.maintenanceOrdersService.createMaintenanceOrder(payload).subscribe({
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

  private ensureDefaultValues(): void {
    const currentStatus = this.resolveCatalogCode(this.status?.value, this.availableStatuses);
    const currentPriority = this.resolveCatalogCode(this.priority?.value, this.availablePriorities);

    const statusExists = this.availableStatuses.some(
      (statusItem) =>
        statusItem.code === currentStatus || this.normalizeCode(statusItem.code) === this.normalizeCode(currentStatus)
    );
    const priorityExists = this.availablePriorities.some(
      (priorityItem) =>
        priorityItem.code === currentPriority ||
        this.normalizeCode(priorityItem.code) === this.normalizeCode(currentPriority)
    );

    const defaultStatus =
      statusExists
        ? currentStatus
        : this.availableStatuses.find((statusItem) => this.normalizeCode(statusItem.code) === 'PENDIENTE')?.code ||
          this.availableStatuses[0]?.code ||
          '';

    const defaultPriority =
      priorityExists
        ? currentPriority
        : this.availablePriorities.find((priorityItem) => this.normalizeCode(priorityItem.code) === 'MEDIA')?.code ||
          this.availablePriorities[0]?.code ||
          '';

    this.maintenanceOrderForm.patchValue(
      {
        status: defaultStatus,
        priority: defaultPriority
      },
      { emitEvent: false }
    );
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
    const fallback = 'No se pudo crear la orden de mantenimiento. Revisa los datos e intenta nuevamente.';

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
