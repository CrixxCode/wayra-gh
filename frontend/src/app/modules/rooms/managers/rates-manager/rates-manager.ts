import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../../services/room';
import { errorActionAlert, successActionAlert } from '../../../../services/action-alerts';
import { openActionConfirmation } from '../../../../services/action-confirmations';
import { RateFormPayload, RateI, RoomTypeI } from '../../room-model';
import { extractApiErrorMessage } from '../../api-error';

type FormMode = 'closed' | 'create' | 'edit';
type ValidityState = 'ACTIVE_NOW' | 'UPCOMING' | 'EXPIRED' | 'OPEN';

@Component({
  selector: 'app-rates-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rates-manager.html',
  styleUrls: ['./rates-manager.css']
})
export class RatesManager implements OnInit {
  /** Si viene, el gestor arranca filtrado por ese tipo de habitacion. */
  @Input() focusRoomTypeId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  loading = false;
  saving = false;
  feedback = '';
  feedbackKind: 'error' | 'info' = 'info';

  rates: RateI[] = [];
  deletedRates: RateI[] = [];
  filteredRates: RateI[] = [];
  roomTypes: RoomTypeI[] = [];

  search = '';
  roomTypeFilter: number | 'ALL' = 'ALL';
  showDeleted = false;

  formMode: FormMode = 'closed';
  editingId: number | null = null;
  form = this.emptyForm();

  private dirty = false;

  constructor(
    private roomService: RoomService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    if (typeof this.focusRoomTypeId === 'number' && this.focusRoomTypeId > 0) {
      this.roomTypeFilter = this.focusRoomTypeId;
    }
    this.loadData();
  }

  get activeCount(): number {
    return this.rates.filter((item) => item.is_active !== false).length;
  }

  get visibleRates(): RateI[] {
    return this.showDeleted ? this.deletedRates : this.filteredRates;
  }

  get hasRoomTypes(): boolean {
    return this.roomTypes.length > 0;
  }

  loadData(): void {
    this.loading = true;

    forkJoin({
      visible: this.roomService
        .listRates({ include_inactive: true })
        .pipe(catchError(() => of([] as RateI[]))),
      withDeleted: this.roomService
        .listRates({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as RateI[]))),
      roomTypes: this.roomService.listRoomTypes().pipe(catchError(() => of([] as RoomTypeI[])))
    }).subscribe({
      next: ({ visible, withDeleted, roomTypes }) => {
        this.loading = false;
        this.rates = visible;

        const visibleIds = new Set(this.rates.map((item) => item.id));
        this.deletedRates = withDeleted.filter((item) => !visibleIds.has(item.id));

        this.roomTypes = roomTypes;
        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.setFeedback('No se pudieron cargar las tarifas.', 'error');
      }
    });
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();

    this.filteredRates = this.rates.filter((rate) => {
      const matchesType =
        this.roomTypeFilter === 'ALL' ? true : rate.room_type === this.roomTypeFilter;

      if (!matchesType) return false;
      if (!query) return true;

      const pool = [rate.name, rate.room_type_name || this.getRoomTypeName(rate.room_type)]
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
    if (!this.hasRoomTypes) {
      this.setFeedback(
        'Primero crea al menos un tipo de habitacion activo para poder tarifarlo.',
        'error'
      );
      return;
    }

    this.formMode = 'create';
    this.editingId = null;
    this.form = this.emptyForm();

    const preselected =
      this.roomTypeFilter !== 'ALL' ? this.roomTypeFilter : this.roomTypes[0]?.id ?? null;
    this.form.room_type = preselected;
    this.feedback = '';
  }

  openEdit(rate: RateI): void {
    this.formMode = 'edit';
    this.editingId = rate.id;
    this.form = {
      room_type: rate.room_type,
      name: rate.name || '',
      price: Number(rate.price) || 0,
      start_date: rate.start_date || '',
      end_date: rate.end_date || '',
      is_active: rate.is_active !== false
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

    const name = this.form.name.trim();

    if (!this.form.room_type) {
      this.setFeedback('Selecciona el tipo de habitacion de la tarifa.', 'error');
      return;
    }

    if (!name) {
      this.setFeedback('El nombre de la tarifa es obligatorio.', 'error');
      return;
    }

    const price = Number(this.form.price);
    if (!Number.isFinite(price) || price < 0) {
      this.setFeedback('El precio debe ser un numero mayor o igual a cero.', 'error');
      return;
    }

    if (this.form.start_date && this.form.end_date && this.form.start_date > this.form.end_date) {
      this.setFeedback('La fecha final no puede ser menor que la fecha inicial.', 'error');
      return;
    }

    const payload: RateFormPayload = {
      room_type: Number(this.form.room_type),
      name,
      price,
      start_date: this.form.start_date || null,
      end_date: this.form.end_date || null,
      is_active: this.form.is_active
    };

    const isEdit = this.formMode === 'edit' && this.editingId !== null;
    const request$ = isEdit
      ? this.roomService.updateRate(this.editingId as number, payload)
      : this.roomService.createRate(payload);

    this.saving = true;
    request$.subscribe({
      next: () => {
        this.saving = false;
        this.formMode = 'closed';
        this.editingId = null;
        this.markDirty();
        this.setFeedback(successActionAlert(isEdit ? 'update' : 'create', 'tarifa'), 'info');
        this.loadData();
      },
      error: (error) => {
        this.saving = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert(isEdit ? 'update' : 'create', 'tarifa')),
          'error'
        );
      }
    });
  }

  toggleActive(rate: RateI): void {
    this.roomService.updateRate(rate.id, { is_active: rate.is_active === false }).subscribe({
      next: () => {
        this.markDirty();
        this.loadData();
      },
      error: (error) => {
        this.setFeedback(extractApiErrorMessage(error, errorActionAlert('update', 'tarifa')), 'error');
      }
    });
  }

  askDelete(rate: RateI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: rate.name || 'tarifa',
      onAccept: () => {
        this.roomService.deleteRate(rate.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('delete', 'tarifa'), 'info');
            this.loadData();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('delete', 'tarifa')),
              'error'
            );
          }
        });
      }
    });
  }

  askRestore(rate: RateI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: rate.name || 'tarifa',
      onAccept: () => {
        this.roomService.restoreRate(rate.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('restore', 'tarifa'), 'info');
            this.loadData();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('restore', 'tarifa')),
              'error'
            );
          }
        });
      }
    });
  }

  close(): void {
    if (this.saving) return;
    if (this.dirty) this.changed.emit();
    this.closed.emit();
  }

  getRoomTypeName(id: number | null | undefined): string {
    if (typeof id !== 'number') return 'Sin tipo';
    return this.roomTypes.find((item) => item.id === id)?.name || 'Sin tipo';
  }

  getPriceLabel(rate: RateI): string {
    const asNumber = Number(rate.price);
    if (Number.isNaN(asNumber)) return String(rate.price);

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  getValidityState(rate: RateI): ValidityState {
    if (!rate.start_date && !rate.end_date) return 'OPEN';

    const today = this.todayIso();
    if (rate.start_date && rate.start_date > today) return 'UPCOMING';
    if (rate.end_date && rate.end_date < today) return 'EXPIRED';
    return 'ACTIVE_NOW';
  }

  getValidityLabel(rate: RateI): string {
    switch (this.getValidityState(rate)) {
      case 'OPEN':
        return 'Sin vigencia';
      case 'UPCOMING':
        return 'Proxima';
      case 'EXPIRED':
        return 'Vencida';
      default:
        return 'Vigente';
    }
  }

  getValidityChipClass(rate: RateI): string {
    switch (this.getValidityState(rate)) {
      case 'UPCOMING':
        return 'is-info';
      case 'EXPIRED':
        return 'is-danger';
      case 'ACTIVE_NOW':
        return 'is-success';
      default:
        return '';
    }
  }

  getRangeLabel(rate: RateI): string {
    if (!rate.start_date && !rate.end_date) return 'Permanente';
    const start = rate.start_date || 'Sin inicio';
    const end = rate.end_date || 'Sin fin';
    return `${start} - ${end}`;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private emptyForm() {
    return {
      room_type: null as number | null,
      name: '',
      price: 0,
      start_date: '',
      end_date: '',
      is_active: true
    };
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private setFeedback(message: string, kind: 'error' | 'info'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }

  private todayIso(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }
}
