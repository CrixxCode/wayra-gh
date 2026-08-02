import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { concatMap, from, toArray } from 'rxjs';
import { RoomI } from '../../rooms/room-model';
import { ItemI } from '../../items/item-model';
import { RoomInventoryService } from '../../../services/room-inventory';
import { RoomInventoryFormPayload, RoomInventoryI } from '../room-inventory-model';

@Component({
  selector: 'app-create-room-inventory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-room-inventory.html',
  styleUrls: ['./create-room-inventory.css']
})
export class CreateRoomInventory {
  @Input() rooms: RoomI[] = [];
  @Input() items: ItemI[] = [];
  @Input() existingAssignments: RoomInventoryI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  roomInventoryForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private roomInventoryService: RoomInventoryService
  ) {
    this.roomInventoryForm = this.fb.group({
      room: [null as number | null, [Validators.required]],
      is_active: [true],
      assignments: this.fb.array([this.buildAssignmentGroup()])
    });
  }

  get room() {
    return this.roomInventoryForm.get('room');
  }

  get is_active() {
    return this.roomInventoryForm.get('is_active');
  }

  get assignments(): FormArray {
    return this.roomInventoryForm.get('assignments') as FormArray;
  }

  get assignmentControls(): ReturnType<FormBuilder['group']>[] {
    return this.assignments.controls as ReturnType<FormBuilder['group']>[];
  }

  get availableRooms(): RoomI[] {
    return this.rooms
      .filter((room) => !!room.number)
      .sort((a, b) => (a.number || '').localeCompare(b.number || '', 'es', { numeric: true }));
  }

  get availableItems(): ItemI[] {
    return this.items
      .filter((item) => item.is_active)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  }

  selectedItemLabel(index: number): string {
    const selectedId = Number(this.getAssignmentControl(index, 'item')?.value);
    if (!Number.isInteger(selectedId) || selectedId <= 0) return 'Selecciona un item para ver stock disponible.';

    const selectedItem = this.items.find((item) => item.id === selectedId);
    if (!selectedItem) return 'Item no encontrado.';

    return `Stock general del item: ${this.toNonNegativeInt(selectedItem.stock)} unidades.`;
  }

  availableItemsForRow(index: number): ItemI[] {
    const currentId = Number(this.getAssignmentControl(index, 'item')?.value);
    const selectedRoomId = Number(this.room?.value);
    const alreadyAssigned = new Set<number>();
    const selectedByOthers = new Set<number>();

    this.existingAssignments.forEach((record) => {
      const roomId = Number(record.room);
      const itemId = Number(record.item);
      if (roomId === selectedRoomId && Number.isInteger(itemId) && itemId > 0) {
        alreadyAssigned.add(itemId);
      }
    });

    this.assignmentControls.forEach((control, rowIndex) => {
      if (rowIndex === index) return;
      const selectedId = Number(control.get('item')?.value);
      if (Number.isInteger(selectedId) && selectedId > 0) selectedByOthers.add(selectedId);
    });

    return this.availableItems.filter(
      (item) => item.id === currentId || (!selectedByOthers.has(item.id) && !alreadyAssigned.has(item.id))
    );
  }

  addAssignment(): void {
    if (this.saving) return;
    this.assignments.push(this.buildAssignmentGroup());
  }

  removeAssignment(index: number): void {
    if (this.saving || this.assignments.length <= 1) return;
    this.assignments.removeAt(index);
  }

  trackByIndex(index: number): number {
    return index;
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.availableRooms.length) {
      this.errorMessage = 'No hay habitaciones disponibles para asignar inventario.';
      return;
    }

    if (!this.availableItems.length) {
      this.errorMessage = 'No hay items activos para asignar en habitaciones.';
      return;
    }

    if (this.roomInventoryForm.invalid || !this.assignmentControls.length) {
      this.roomInventoryForm.markAllAsTouched();
      return;
    }

    const roomId = Number(this.room?.value);
    const isActive = !!this.is_active?.value;
    const payloads: RoomInventoryFormPayload[] = this.assignmentControls.map((control) => {
      const raw = control.getRawValue();
      return {
        room: roomId,
        item: Number(raw.item),
        quantity: this.toNonNegativeInt(raw.quantity),
        minimum_quantity: this.toNonNegativeInt(raw.minimum_quantity),
        notes: raw.notes?.trim() || '',
        is_active: isActive
      };
    });

    const duplicatedItems = this.findDuplicatedItems(payloads);
    if (duplicatedItems.length) {
      this.errorMessage = `No puedes repetir items en una misma asignacion: ${duplicatedItems.join(', ')}.`;
      return;
    }

    const selectedRoomId = Number(this.room?.value);
    const alreadyAssignedItems = this.findAlreadyAssignedItems(selectedRoomId, payloads);
    if (alreadyAssignedItems.length) {
      this.errorMessage = `Estos items ya existen en la habitacion seleccionada: ${alreadyAssignedItems.join(', ')}.`;
      return;
    }

    this.saving = true;
    from(payloads)
      .pipe(
        concatMap((payload) => this.roomInventoryService.createRoomInventory(payload)),
        toArray()
      )
      .subscribe({
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

  getRoomLabel(room: RoomI): string {
    const floor = room.floor_name ? ` - ${room.floor_name}` : '';
    return `Habitacion ${room.number}${floor}`;
  }

  getItemLabel(item: ItemI): string {
    const sku = item.sku?.trim();
    if (sku) return `${item.name} (${sku})`;
    return item.name;
  }

  getAssignmentItemControl(index: number) {
    return this.getAssignmentControl(index, 'item');
  }

  getAssignmentQuantityControl(index: number) {
    return this.getAssignmentControl(index, 'quantity');
  }

  getAssignmentMinimumControl(index: number) {
    return this.getAssignmentControl(index, 'minimum_quantity');
  }

  getAssignmentNotesControl(index: number) {
    return this.getAssignmentControl(index, 'notes');
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private buildAssignmentGroup() {
    return this.fb.group({
      item: [null as number | null, [Validators.required]],
      quantity: [0, [Validators.required, Validators.min(0)]],
      minimum_quantity: [0, [Validators.required, Validators.min(0)]],
      notes: ['', [Validators.maxLength(2000)]]
    });
  }

  private getAssignmentControl(index: number, key: string) {
    return this.assignmentControls[index]?.get(key) ?? null;
  }

  private findDuplicatedItems(payloads: RoomInventoryFormPayload[]): string[] {
    const seen = new Set<number>();
    const duplicated = new Set<number>();

    for (const payload of payloads) {
      if (seen.has(payload.item)) duplicated.add(payload.item);
      seen.add(payload.item);
    }

    return Array.from(duplicated).map((itemId) => this.getItemNameById(itemId));
  }

  private findAlreadyAssignedItems(roomId: number, payloads: RoomInventoryFormPayload[]): string[] {
    const assignedItemIds = new Set<number>();
    this.existingAssignments.forEach((record) => {
      const recordRoomId = Number(record.room);
      const recordItemId = Number(record.item);
      if (recordRoomId === roomId && Number.isInteger(recordItemId) && recordItemId > 0) {
        assignedItemIds.add(recordItemId);
      }
    });

    const alreadyAssigned = new Set<number>();
    payloads.forEach((payload) => {
      if (assignedItemIds.has(payload.item)) {
        alreadyAssigned.add(payload.item);
      }
    });

    return Array.from(alreadyAssigned).map((itemId) => this.getItemNameById(itemId));
  }

  private getItemNameById(itemId: number): string {
    const item = this.items.find((entry) => entry.id === itemId);
    return item?.name?.trim() || `Item #${itemId}`;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo crear el inventario de habitacion. Revisa los datos e intenta nuevamente.';

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
