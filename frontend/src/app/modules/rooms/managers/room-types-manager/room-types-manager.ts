import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../../services/room';
import { errorActionAlert, successActionAlert } from '../../../../services/action-alerts';
import { openActionConfirmation } from '../../../../services/action-confirmations';
import { RateI, RoomI, RoomTypeFormPayload, RoomTypeI } from '../../room-model';
import { extractApiErrorMessage } from '../../api-error';

type FormMode = 'closed' | 'create' | 'edit';

@Component({
  selector: 'app-room-types-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-types-manager.html',
  styleUrls: ['./room-types-manager.css']
})
export class RoomTypesManager implements OnInit {
  /** Habitaciones ya cargadas por la vista padre, para calcular cuantas usan cada tipo. */
  @Input() rooms: RoomI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();
  /** Pide a la vista padre abrir el gestor de tarifas para este tipo. */
  @Output() manageRates = new EventEmitter<number>();

  loading = false;
  saving = false;
  feedback = '';
  feedbackKind: 'error' | 'info' = 'info';

  roomTypes: RoomTypeI[] = [];
  deletedRoomTypes: RoomTypeI[] = [];
  filteredRoomTypes: RoomTypeI[] = [];
  rates: RateI[] = [];

  search = '';
  showDeleted = false;

  formMode: FormMode = 'closed';
  editingId: number | null = null;
  form = this.emptyForm();

  private usageByType = new Map<number, number>();
  private activeRateByType = new Map<number, RateI>();
  private dirty = false;

  constructor(
    private roomService: RoomService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.usageByType = this.buildUsageMap(this.rooms);
    this.loadData();
  }

  get activeCount(): number {
    return this.roomTypes.filter((item) => item.is_active !== false).length;
  }

  get visibleRoomTypes(): RoomTypeI[] {
    return this.showDeleted ? this.deletedRoomTypes : this.filteredRoomTypes;
  }

  loadData(): void {
    this.loading = true;

    forkJoin({
      visible: this.roomService
        .listRoomTypes({ include_inactive: true })
        .pipe(catchError(() => of([] as RoomTypeI[]))),
      withDeleted: this.roomService
        .listRoomTypes({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as RoomTypeI[]))),
      rates: this.roomService.listRates().pipe(catchError(() => of([] as RateI[])))
    }).subscribe({
      next: ({ visible, withDeleted, rates }) => {
        this.loading = false;
        this.roomTypes = this.sortTypes(visible);

        const visibleIds = new Set(this.roomTypes.map((item) => item.id));
        this.deletedRoomTypes = this.sortTypes(withDeleted.filter((item) => !visibleIds.has(item.id)));

        this.rates = rates;
        this.activeRateByType = this.buildActiveRateMap(rates);
        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.setFeedback('No se pudieron cargar los tipos de habitacion.', 'error');
      }
    });
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();

    this.filteredRoomTypes = this.roomTypes.filter((item) => {
      if (!query) return true;
      const pool = [item.code, item.name, item.description || '', item.bed_type || '']
        .join(' ')
        .toLowerCase();
      return pool.includes(query);
    });
  }

  toggleDeletedView(): void {
    this.showDeleted = !this.showDeleted;
    this.closeForm();
  }

  openCreate(): void {
    this.formMode = 'create';
    this.editingId = null;
    this.form = this.emptyForm();
    this.feedback = '';
  }

  openEdit(item: RoomTypeI): void {
    this.formMode = 'edit';
    this.editingId = item.id;
    this.form = {
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
      capacity: item.capacity ?? 1,
      bed_count: item.bed_count ?? 1,
      bed_type: item.bed_type || '',
      is_active: item.is_active !== false,
      sort_order: item.sort_order ?? 0
    };
    this.feedback = '';
  }

  closeForm(): void {
    if (this.saving) return;
    this.formMode = 'closed';
    this.editingId = null;
  }

  save(): void {
    if (this.saving) return;

    const code = this.form.code.trim().toUpperCase();
    const name = this.form.name.trim();

    if (!code) {
      this.setFeedback('El codigo del tipo de habitacion es obligatorio.', 'error');
      return;
    }

    if (!name) {
      this.setFeedback('El nombre del tipo de habitacion es obligatorio.', 'error');
      return;
    }

    if (this.form.capacity < 1 || this.form.bed_count < 1) {
      this.setFeedback('La capacidad y el numero de camas deben ser al menos 1.', 'error');
      return;
    }

    const payload: RoomTypeFormPayload = {
      code,
      name,
      description: this.form.description.trim() || null,
      capacity: Number(this.form.capacity),
      bed_count: Number(this.form.bed_count),
      bed_type: this.form.bed_type.trim() || null,
      is_active: this.form.is_active,
      sort_order: Number(this.form.sort_order) || 0
    };

    const isEdit = this.formMode === 'edit' && this.editingId !== null;
    const request$ = isEdit
      ? this.roomService.updateRoomType(this.editingId as number, payload)
      : this.roomService.createRoomType(payload);

    this.saving = true;
    request$.subscribe({
      next: () => {
        this.saving = false;
        this.formMode = 'closed';
        this.editingId = null;
        this.markDirty();
        this.setFeedback(
          successActionAlert(isEdit ? 'update' : 'create', 'tipo de habitacion'),
          'info'
        );
        this.loadData();
      },
      error: (error) => {
        this.saving = false;
        this.setFeedback(
          extractApiErrorMessage(
            error,
            errorActionAlert(isEdit ? 'update' : 'create', 'tipo de habitacion')
          ),
          'error'
        );
      }
    });
  }

  toggleActive(item: RoomTypeI): void {
    this.roomService.updateRoomType(item.id, { is_active: item.is_active === false }).subscribe({
      next: () => {
        this.markDirty();
        this.loadData();
      },
      error: (error) => {
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'tipo de habitacion')),
          'error'
        );
      }
    });
  }

  askDelete(item: RoomTypeI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: item.name || 'tipo de habitacion',
      onAccept: () => {
        this.roomService.deleteRoomType(item.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('delete', 'tipo de habitacion'), 'info');
            this.loadData();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('delete', 'tipo de habitacion')),
              'error'
            );
          }
        });
      }
    });
  }

  askRestore(item: RoomTypeI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: item.name || 'tipo de habitacion',
      onAccept: () => {
        this.roomService.restoreRoomType(item.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('restore', 'tipo de habitacion'), 'info');
            this.loadData();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('restore', 'tipo de habitacion')),
              'error'
            );
          }
        });
      }
    });
  }

  openRates(item: RoomTypeI): void {
    if (this.dirty) this.changed.emit();
    this.manageRates.emit(item.id);
  }

  close(): void {
    if (this.saving) return;
    if (this.dirty) this.changed.emit();
    this.closed.emit();
  }

  getUsageCount(id: number): number {
    return this.usageByType.get(id) || 0;
  }

  getRateLabel(id: number): string {
    const rate = this.activeRateByType.get(id);
    if (!rate) return 'Sin tarifa';

    const asNumber = Number(rate.price);
    if (Number.isNaN(asNumber)) return String(rate.price);

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  hasRate(id: number): boolean {
    return this.activeRateByType.has(id);
  }

  getBedSummary(item: RoomTypeI): string {
    const bedCount = item.bed_count ?? 0;
    const bedType = item.bed_type || 'cama';
    return `${bedCount} ${bedType}`;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private emptyForm() {
    return {
      code: '',
      name: '',
      description: '',
      capacity: 2,
      bed_count: 1,
      bed_type: '',
      is_active: true,
      sort_order: 0
    };
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private setFeedback(message: string, kind: 'error' | 'info'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }

  private sortTypes(items: RoomTypeI[]): RoomTypeI[] {
    return [...items].sort((a, b) => {
      const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (order !== 0) return order;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });
  }

  private buildUsageMap(rooms: RoomI[]): Map<number, number> {
    const usage = new Map<number, number>();
    for (const room of rooms) {
      if (typeof room.room_type !== 'number') continue;
      usage.set(room.room_type, (usage.get(room.room_type) || 0) + 1);
    }
    return usage;
  }

  private buildActiveRateMap(rates: RateI[]): Map<number, RateI> {
    const map = new Map<number, RateI>();
    for (const rate of rates) {
      if (!rate?.room_type || rate.is_active === false) continue;

      const existing = map.get(rate.room_type);
      if (!existing) {
        map.set(rate.room_type, rate);
        continue;
      }

      const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const currentTime = rate.created_at ? new Date(rate.created_at).getTime() : 0;
      if (currentTime >= existingTime) map.set(rate.room_type, rate);
    }
    return map;
  }
}
