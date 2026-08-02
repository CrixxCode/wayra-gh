import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoomService } from '../../../services/room';
import { RoomTypeFormPayload, RoomTypeI } from '../room-model';

@Component({
  selector: 'app-update-room-type',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-room-type.html',
  styleUrls: ['./update-room-type.css']
})
export class UpdateRoomType implements OnChanges {
  @Input() roomType: RoomTypeI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  roomTypeForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private roomService: RoomService
  ) {
    this.roomTypeForm = this.fb.group({
      code: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
      name: ['', [Validators.required, Validators.maxLength(120)]],
      description: ['', [Validators.maxLength(2000)]],
      capacity: [1, [Validators.required, Validators.min(1)]],
      bed_count: [1, [Validators.required, Validators.min(1)]],
      bed_type: ['', [Validators.maxLength(50)]],
      sort_order: [0, [Validators.required, Validators.min(0)]],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['roomType'] && this.roomType) {
      this.roomTypeForm.patchValue({
        code: this.roomType.code || '',
        name: this.roomType.name || '',
        description: this.roomType.description || '',
        capacity: this.toPositiveInt(this.roomType.capacity, 1),
        bed_count: this.toPositiveInt(this.roomType.bed_count, 1),
        bed_type: this.roomType.bed_type || '',
        sort_order: Number(this.roomType.sort_order || 0),
        is_active: this.roomType.is_active !== false
      });
      this.roomTypeForm.markAsPristine();
      this.roomTypeForm.markAsUntouched();
      this.errorMessage = '';
    }
  }

  get code() {
    return this.roomTypeForm.get('code');
  }

  get name() {
    return this.roomTypeForm.get('name');
  }

  get description() {
    return this.roomTypeForm.get('description');
  }

  get capacity() {
    return this.roomTypeForm.get('capacity');
  }

  get bed_count() {
    return this.roomTypeForm.get('bed_count');
  }

  get bed_type() {
    return this.roomTypeForm.get('bed_type');
  }

  get sort_order() {
    return this.roomTypeForm.get('sort_order');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.roomType) {
      this.errorMessage = 'No se encontro el tipo de habitacion a editar.';
      return;
    }

    if (this.roomTypeForm.invalid) {
      this.roomTypeForm.markAllAsTouched();
      return;
    }

    const raw = this.roomTypeForm.getRawValue();

    const payload: Partial<RoomTypeFormPayload> = {
      code: this.normalizeCode(raw.code),
      name: String(raw.name || '').trim(),
      description: this.normalizeNullableString(raw.description),
      capacity: this.toPositiveInt(raw.capacity, 1),
      bed_count: this.toPositiveInt(raw.bed_count, 1),
      bed_type: this.normalizeNullableString(raw.bed_type),
      sort_order: this.toNonNegativeInt(raw.sort_order),
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.roomService.updateRoomType(this.roomType.id, payload).subscribe({
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

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase();
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo actualizar el tipo de habitacion. Revisa los datos e intenta nuevamente.';

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
