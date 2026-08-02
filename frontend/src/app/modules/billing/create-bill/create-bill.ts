import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../services/billing';
import { PackageI } from '../../packages/package-model';
import { ServiceI } from '../../services/service-model';
import { ChargeCreatePayloadI, ChargeI } from '../billing-model';

type ChargeCategory = 'SERVICIO' | 'PAQUETE' | 'MANUAL';

@Component({
  selector: 'app-create-bill',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-bill.html',
  styleUrls: ['./create-bill.css']
})
export class CreateBill implements OnChanges {
  @Input() reservationId: number | null = null;
  @Input() chargeTypes: MasterDataI[] = [];
  @Input() services: ServiceI[] = [];
  @Input() packages: PackageI[] = [];

  @Output() created = new EventEmitter<ChargeI>();
  @Output() cancelled = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  chargeForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private billingService: BillingService
  ) {
    this.chargeForm = this.fb.group({
      charge_type: [null as number | null, [Validators.required]],
      service: [null as number | null],
      package: [null as number | null],
      quantity: [1, [Validators.required, Validators.min(1)]],
      description: [''],
      unit_price: [0, [Validators.min(0)]],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chargeTypes']) {
      this.ensureDefaultChargeType();
      this.syncCatalogSelectionByCategory();
    }

    if (changes['services'] || changes['packages']) {
      this.syncCatalogSelectionByCategory();
    }
  }

  get charge_type() {
    return this.chargeForm.get('charge_type');
  }

  get quantity() {
    return this.chargeForm.get('quantity');
  }

  get description() {
    return this.chargeForm.get('description');
  }

  get unit_price() {
    return this.chargeForm.get('unit_price');
  }

  get package() {
    return this.chargeForm.get('package');
  }

  get hasServicesCatalog(): boolean {
    return this.services.length > 0;
  }

  get hasPackagesCatalog(): boolean {
    return this.packages.length > 0;
  }

  get selectedCategory(): ChargeCategory {
    const selectedChargeTypeId = Number(this.chargeForm.getRawValue().charge_type || 0);
    return this.resolveCategoryByChargeTypeId(selectedChargeTypeId);
  }

  get isServiceCategory(): boolean {
    return this.selectedCategory === 'SERVICIO';
  }

  get isPackageCategory(): boolean {
    return this.selectedCategory === 'PAQUETE';
  }

  get manualMode(): boolean {
    return this.selectedCategory === 'MANUAL';
  }

  get selectedItemLabel(): string {
    if (this.isServiceCategory) {
      return this.filteredServices.length ? 'Seleccionar servicio...' : 'Sin servicios activos';
    }
    if (this.isPackageCategory) {
      return this.filteredPackages.length ? 'Seleccionar paquete...' : 'Sin paquetes activos';
    }
    return 'No aplica';
  }

  get filteredServices(): ServiceI[] {
    return (this.services || []).filter((service) => !!service.is_active);
  }

  get filteredPackages(): PackageI[] {
    return (this.packages || []).filter((pkg) => !!pkg.is_active);
  }

  get autoUnitPrice(): number {
    if (this.isServiceCategory) {
      const selectedService = this.findSelectedService();
      return this.toNumber(selectedService?.base_price);
    }

    if (this.isPackageCategory) {
      const selectedPackage = this.findSelectedPackage();
      return this.toNumber(selectedPackage?.base_price);
    }

    return this.toNumber(this.chargeForm.getRawValue().unit_price);
  }

  onChargeTypeChanged(): void {
    this.syncCatalogSelectionByCategory(true);
  }

  onServiceChanged(): void {
    if (!this.isServiceCategory) return;

    const selectedService = this.findSelectedService();
    this.chargeForm.patchValue(
      {
        package: null,
        unit_price: this.toNumber(selectedService?.base_price),
      },
      { emitEvent: false }
    );
  }

  onPackageChanged(): void {
    if (!this.isPackageCategory) return;

    const selectedPackage = this.findSelectedPackage();
    this.chargeForm.patchValue(
      {
        service: null,
        unit_price: this.toNumber(selectedPackage?.base_price),
      },
      { emitEvent: false }
    );
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.reservationId) {
      this.errorMessage = 'No se encontro una reserva asociada para registrar el cargo.';
      return;
    }

    if (this.chargeForm.invalid) {
      this.chargeForm.markAllAsTouched();
      return;
    }

    const raw = this.chargeForm.getRawValue();
    const quantity = this.normalizeQuantity(raw.quantity);
    if (quantity < 1) {
      this.errorMessage = 'La cantidad debe ser mayor o igual a 1.';
      return;
    }

    const payload: ChargeCreatePayloadI = {
      reservation: Number(this.reservationId),
      charge_type: Number(raw.charge_type || 0) || null,
      quantity,
      is_active: true,
    };

    if (this.isServiceCategory) {
      const selectedService = this.findSelectedService();
      if (!selectedService) {
        this.errorMessage = 'Debes seleccionar un servicio para la categoria Servicio.';
        return;
      }

      payload.service = selectedService.id;
      payload.description = `Servicio: ${selectedService.name}`;
      payload.unit_price = this.toNumber(selectedService.base_price);
    } else if (this.isPackageCategory) {
      const selectedPackage = this.findSelectedPackage();
      if (!selectedPackage) {
        this.errorMessage = 'Debes seleccionar un paquete para la categoria Paquete.';
        return;
      }

      payload.package = selectedPackage.id;
      payload.description = `Paquete: ${selectedPackage.name}`;
      payload.unit_price = this.toNumber(selectedPackage.base_price);
    } else {
      const description = String(raw.description || '').trim();
      if (!description) {
        this.errorMessage = 'Debes indicar una descripcion para el cargo manual.';
        return;
      }

      const unitPrice = this.normalizePrice(raw.unit_price);
      if (unitPrice < 0) {
        this.errorMessage = 'El valor unitario no puede ser negativo.';
        return;
      }

      payload.description = description;
      payload.unit_price = unitPrice;
    }

    this.saving = true;
    this.billingService.createCharge(payload).subscribe({
      next: (charge) => {
        this.saving = false;
        this.created.emit(charge);
        this.resetFormForNextEntry();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error);
      }
    });
  }

  close(): void {
    if (this.saving) return;
    this.cancelled.emit();
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private ensureDefaultChargeType(): void {
    const selected = Number(this.chargeForm.getRawValue().charge_type || 0);
    if (selected > 0) return;
    if (!this.chargeTypes.length) return;

    this.chargeForm.patchValue({
      charge_type: this.chargeTypes[0].id
    });
  }

  private resetFormForNextEntry(): void {
    this.chargeForm.patchValue({
      service: null,
      package: null,
      quantity: 1,
      description: '',
      unit_price: 0
    });
    this.chargeForm.markAsPristine();
    this.chargeForm.markAsUntouched();
    this.errorMessage = '';
  }

  private normalizeQuantity(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.round(parsed));
  }

  private normalizePrice(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private syncCatalogSelectionByCategory(resetSelection = false): void {
    const category = this.selectedCategory;
    const patch: {
      service?: number | null;
      package?: number | null;
      description?: string;
      unit_price?: number;
    } = {};

    if (category === 'SERVICIO') {
      if (resetSelection) {
        patch.service = null;
      }
      patch.package = null;
      patch.description = '';

      const selectedService = this.findSelectedService(resetSelection ? null : undefined);
      patch.unit_price = this.toNumber(selectedService?.base_price);
    } else if (category === 'PAQUETE') {
      if (resetSelection) {
        patch.package = null;
      }
      patch.service = null;
      patch.description = '';

      const selectedPackage = this.findSelectedPackage(resetSelection ? null : undefined);
      patch.unit_price = this.toNumber(selectedPackage?.base_price);
    } else {
      patch.service = null;
      patch.package = null;
      patch.description = '';
      patch.unit_price = 0;
    }

    this.chargeForm.patchValue(patch, { emitEvent: false });
  }

  private resolveCategoryByChargeTypeId(chargeTypeId: number): ChargeCategory {
    if (!chargeTypeId) return 'MANUAL';
    const chargeType = this.chargeTypes.find((item) => item.id === chargeTypeId);
    if (!chargeType) return 'MANUAL';

    const normalizedCode = this.normalizeCode(chargeType.code || chargeType.name || '');
    if (normalizedCode.includes('SERVICIO') || normalizedCode.includes('SERVICE')) return 'SERVICIO';
    if (normalizedCode.includes('PAQUETE') || normalizedCode.includes('PACKAGE')) return 'PAQUETE';
    return 'MANUAL';
  }

  private findSelectedService(forceId?: number | null): ServiceI | null {
    const selectedId = forceId === undefined ? Number(this.chargeForm.getRawValue().service || 0) : Number(forceId || 0);
    if (!Number.isFinite(selectedId) || selectedId <= 0) return null;
    return this.filteredServices.find((service) => service.id === selectedId) || null;
  }

  private findSelectedPackage(forceId?: number | null): PackageI | null {
    const selectedId = forceId === undefined ? Number(this.chargeForm.getRawValue().package || 0) : Number(forceId || 0);
    if (!Number.isFinite(selectedId) || selectedId <= 0) return null;
    return this.filteredPackages.find((pkg) => pkg.id === selectedId) || null;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No fue posible registrar el cargo manual.';

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
