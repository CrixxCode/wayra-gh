import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ItemsService } from '../../../services/item';
import { ItemFormPayload } from '../item-model';

@Component({
  selector: 'app-create-item',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-item.html',
  styleUrls: ['./create-item.css']
})
export class CreateItem {
  @Input() itemTypes: MasterDataI[] = [];
  @Input() unitMeasures: MasterDataI[] = [];
  @Input() hotelSettingsId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  itemForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private itemsService: ItemsService
  ) {
    this.itemForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      sku: ['', [Validators.maxLength(80)]],
      item_type: [null as number | null, [Validators.required]],
      unit_measure: [null as number | null, [Validators.required]],
      stock: [0, [Validators.required, Validators.min(0)]],
      minimum_stock: [0, [Validators.required, Validators.min(0)]],
      maximum_stock: [0, [Validators.required, Validators.min(0)]],
      cost_price: [0, [Validators.required, Validators.min(0)]],
      sale_price: [0, [Validators.required, Validators.min(0)]],
      description: ['', [Validators.maxLength(2000)]],
      is_active: [true]
    });
  }

  get name() {
    return this.itemForm.get('name');
  }

  get sku() {
    return this.itemForm.get('sku');
  }

  get item_type() {
    return this.itemForm.get('item_type');
  }

  get unit_measure() {
    return this.itemForm.get('unit_measure');
  }

  get stock() {
    return this.itemForm.get('stock');
  }

  get minimum_stock() {
    return this.itemForm.get('minimum_stock');
  }

  get maximum_stock() {
    return this.itemForm.get('maximum_stock');
  }

  get cost_price() {
    return this.itemForm.get('cost_price');
  }

  get sale_price() {
    return this.itemForm.get('sale_price');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.hotelSettingsId) {
      this.errorMessage = 'No se encontro una configuracion de hotel activa para crear items.';
      return;
    }

    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }

    const raw = this.itemForm.getRawValue();
    const stock = this.toNonNegativeInt(raw.stock);
    const minimumStock = this.toNonNegativeInt(raw.minimum_stock);
    const maximumStock = this.toNonNegativeInt(raw.maximum_stock);

    if (maximumStock > 0 && minimumStock > maximumStock) {
      this.errorMessage = 'El stock minimo no puede ser mayor al stock maximo.';
      return;
    }

    if (maximumStock > 0 && stock > maximumStock) {
      this.errorMessage = 'El stock inicial no puede ser mayor al stock maximo.';
      return;
    }

    const payload: ItemFormPayload = {
      hotel_settings: Number(this.hotelSettingsId),
      item_type: Number(raw.item_type),
      unit_measure: Number(raw.unit_measure),
      name: raw.name?.trim() || '',
      sku: this.normalizeNullableString(raw.sku),
      description: raw.description?.trim() || '',
      stock,
      minimum_stock: minimumStock,
      maximum_stock: maximumStock,
      cost_price: this.toNonNegativePrice(raw.cost_price),
      sale_price: this.toNonNegativePrice(raw.sale_price),
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.itemsService.createItem(payload).subscribe({
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

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private toNonNegativePrice(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Number(parsed.toFixed(2));
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo crear el item. Revisa los datos e intenta nuevamente.';

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
