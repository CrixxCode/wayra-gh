import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomService } from '../../../services/room';
import { RateFormPayload, RateI, RoomTypeI } from '../room-model';

@Component({
  selector: 'app-update-rate',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-rate.html',
  styleUrls: ['./update-rate.css']
})
export class UpdateRate implements OnChanges {
  @Input() rate: RateI | null = null;
  @Input() roomTypes: RoomTypeI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  rateForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private roomService: RoomService
  ) {
    this.rateForm = this.fb.group({
      room_type: [null as number | null, [Validators.required]],
      name: ['', [Validators.required, Validators.maxLength(100)]],
      price: [0, [Validators.required, Validators.min(0)]],
      start_date: [''],
      end_date: [''],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rate'] && this.rate) {
      this.rateForm.patchValue({
        room_type: Number(this.rate.room_type || null),
        name: this.rate.name || '',
        price: this.toPriceNumber(this.rate.price),
        start_date: this.normalizeDateString(this.rate.start_date) || '',
        end_date: this.normalizeDateString(this.rate.end_date) || '',
        is_active: this.rate.is_active !== false
      });
      this.rateForm.markAsPristine();
      this.rateForm.markAsUntouched();
      this.errorMessage = '';
    }
  }

  get room_type() {
    return this.rateForm.get('room_type');
  }

  get name() {
    return this.rateForm.get('name');
  }

  get price() {
    return this.rateForm.get('price');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.rate) {
      this.errorMessage = 'No se encontro la tarifa a editar.';
      return;
    }

    if (!this.roomTypes.length) {
      this.errorMessage = 'No hay tipos de habitacion activos para asociar la tarifa.';
      return;
    }

    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }

    const raw = this.rateForm.getRawValue();
    const startDate = this.normalizeDateString(raw.start_date);
    const endDate = this.normalizeDateString(raw.end_date);

    if (startDate && endDate && endDate < startDate) {
      this.errorMessage = 'La fecha final no puede ser menor que la fecha inicial.';
      return;
    }

    const payload: Partial<RateFormPayload> = {
      room_type: Number(raw.room_type),
      name: String(raw.name || '').trim(),
      price: this.toPriceNumber(raw.price),
      start_date: startDate,
      end_date: endDate,
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.roomService.updateRate(this.rate.id, payload).subscribe({
      next: () => {
        this.saving = false;
        this.updated.emit();
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

  private normalizeDateString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toPriceNumber(value: unknown): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber) || asNumber < 0) return 0;
    return Number(asNumber.toFixed(2));
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo actualizar la tarifa. Revisa los datos e intenta nuevamente.';

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
