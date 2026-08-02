import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AmenityI,
  HotelFloorI,
  RoomFormPayload,
  RoomStatus,
  RoomTypeI
} from '../room-model';
import { RoomService } from '../../../services/room';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-room.html',
  styleUrls: ['./create-room.css']
})
export class CreateRoom {
  @Input() floors: HotelFloorI[] = [];
  @Input() roomTypes: RoomTypeI[] = [];
  @Input() amenities: AmenityI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  private fb = inject(FormBuilder);
  private roomService = inject(RoomService);

  readonly statusOptions: Array<{ value: RoomStatus; label: string }> = [
    { value: 'DISPONIBLE', label: 'Disponible' },
    { value: 'RESERVADA', label: 'Reservada' },
    { value: 'OCUPADA', label: 'Ocupada' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { value: 'LIMPIEZA', label: 'Limpieza' },
    { value: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio' }
  ];

  roomForm = this.fb.group({
    number: ['', [Validators.required, Validators.maxLength(20)]],
    floor: [null as number | null, [Validators.required]],
    room_type: [null as number | null],
    status: ['DISPONIBLE' as RoomStatus, [Validators.required]],
    notes: ['', [Validators.maxLength(800)]],
    amenity_ids: [[] as number[]]
  });

  get number() {
    return this.roomForm.get('number');
  }

  get floor() {
    return this.roomForm.get('floor');
  }

  submit(): void {
    this.errorMessage = '';
    if (this.roomForm.invalid) {
      this.roomForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    const raw = this.roomForm.getRawValue();
    const payload: RoomFormPayload = {
      number: raw.number?.trim() || '',
      floor: Number(raw.floor),
      room_type: raw.room_type ? Number(raw.room_type) : null,
      status: raw.status as RoomStatus,
      notes: raw.notes?.trim() || '',
      amenity_ids: raw.amenity_ids || []
    };

    this.roomService.createRoom(payload).subscribe({
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

  toggleAmenity(amenityId: number, checked: boolean): void {
    const current = [...(this.roomForm.get('amenity_ids')?.value || [])];
    const next = checked
      ? Array.from(new Set([...current, amenityId]))
      : current.filter((id) => id !== amenityId);

    this.roomForm.get('amenity_ids')?.setValue(next);
    this.roomForm.get('amenity_ids')?.markAsDirty();
  }

  isAmenitySelected(amenityId: number): boolean {
    return (this.roomForm.get('amenity_ids')?.value || []).includes(amenityId);
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo crear la habitación. Verifica los datos e intenta nuevamente.';

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
