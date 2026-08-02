import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { ItemI } from '../../items/item-model';
import { InventoryMovementFormPayload } from '../inventory-movement-model';

@Component({
  selector: 'app-create-inventory-movement',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-inventory-movement.html',
  styleUrls: ['./create-inventory-movement.css']
})
export class CreateInventoryMovement implements OnChanges {
  @Input() items: ItemI[] = [];
  @Input() movementTypes: MasterDataI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  movementForm: ReturnType<FormBuilder['group']>;
  private movementTypeMap = new Map<number, MasterDataI>();

  constructor(
    private fb: FormBuilder,
    private inventoryMovementsService: InventoryMovementsService
  ) {
    this.movementForm = this.fb.group({
      item: [null as number | null, [Validators.required]],
      movement_type: [null as number | null, [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      reference: ['', [Validators.maxLength(100)]],
      notes: ['', [Validators.maxLength(2000)]],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['movementTypes']) {
      this.movementTypeMap = new Map(this.movementTypes.map((movementType) => [movementType.id, movementType]));
    }
  }

  get item() {
    return this.movementForm.get('item');
  }

  get movement_type() {
    return this.movementForm.get('movement_type');
  }

  get quantity() {
    return this.movementForm.get('quantity');
  }

  get availableItems(): ItemI[] {
    return this.items
      .filter((item) => item.is_active)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  }

  get selectedItem(): ItemI | null {
    const itemId = Number(this.item?.value);
    if (!Number.isInteger(itemId) || itemId <= 0) return null;
    return this.items.find((item) => item.id === itemId) || null;
  }

  get selectedMovementTypeCode(): string {
    const movementTypeId = Number(this.movement_type?.value);
    if (!Number.isInteger(movementTypeId) || movementTypeId <= 0) return '';

    const movementType = this.movementTypeMap.get(movementTypeId);
    return this.normalizeCode(movementType?.code || '');
  }

  get isOutboundMovement(): boolean {
    const movementCode = this.selectedMovementTypeCode;
    return movementCode === 'OUT' || movementCode === 'LOSS';
  }

  get quantityHelperText(): string {
    const selectedItem = this.selectedItem;
    if (!selectedItem) return 'Selecciona un item para ver disponibilidad.';

    if (this.isOutboundMovement) {
      return `Disponible para salida: ${this.toNonNegativeInt(selectedItem.stock)} unidades.`;
    }

    return `Stock actual: ${this.toNonNegativeInt(selectedItem.stock)} unidades.`;
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.availableItems.length) {
      this.errorMessage = 'No hay items activos disponibles para registrar movimientos.';
      return;
    }

    if (!this.movementTypes.length) {
      this.errorMessage = 'No hay tipos de movimiento activos en master data.';
      return;
    }

    if (this.movementForm.invalid) {
      this.movementForm.markAllAsTouched();
      return;
    }

    const raw = this.movementForm.getRawValue();
    const payload: InventoryMovementFormPayload = {
      item: Number(raw.item),
      movement_type: Number(raw.movement_type),
      quantity: this.toPositiveInt(raw.quantity),
      reference: this.normalizeNullableString(raw.reference),
      notes: raw.notes?.trim() || '',
      is_active: !!raw.is_active
    };

    const selectedItem = this.selectedItem;
    if (this.isOutboundMovement && selectedItem && payload.quantity > this.toNonNegativeInt(selectedItem.stock)) {
      this.errorMessage = 'La cantidad no puede ser mayor al stock actual para salidas o perdidas.';
      return;
    }

    this.saving = true;
    this.inventoryMovementsService.createInventoryMovement(payload).subscribe({
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

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private toPositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo registrar el movimiento. Revisa los datos e intenta nuevamente.';

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
