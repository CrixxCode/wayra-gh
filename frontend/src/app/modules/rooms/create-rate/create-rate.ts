import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomService } from '../../../services/room';
import { RateFormPayload, RoomTypeI } from '../room-model';

@Component({
  selector: 'app-create-rate',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-rate.html',
  styleUrls: ['./create-rate.css']
})
export class CreateRate {
  @Input() roomTypes: RoomTypeI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

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

    const payload: RateFormPayload = {
      room_type: Number(raw.room_type),
      name: String(raw.name || '').trim(),
      price: this.toPriceNumber(raw.price),
      start_date: startDate,
      end_date: endDate,
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.roomService.createRate(payload).subscribe({
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
    const fallback = 'No se pudo crear la tarifa. Revisa los datos e intenta nuevamente.';

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
