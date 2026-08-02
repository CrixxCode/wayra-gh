import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { PromotionsService } from '../../../services/promotion';
import { PackageI } from '../../packages/package-model';
import { ServiceI } from '../../services/service-model';
import { PromotionFormPayload } from '../promotion-model';

type PromotionTargetScope = 'GENERAL' | 'SERVICE' | 'PACKAGE';

@Component({
  selector: 'app-create-promotion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-promotion.html',
  styleUrls: ['./create-promotion.css']
})
export class CreatePromotion implements OnInit, OnChanges {
  @Input() discountTypes: MasterDataI[] = [];
  @Input() services: ServiceI[] = [];
  @Input() packages: PackageI[] = [];
  @Input() hotelSettingsId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  promotionForm: ReturnType<FormBuilder['group']>;

  private discountTypeMap = new Map<number, MasterDataI>();

  constructor(
    private fb: FormBuilder,
    private promotionsService: PromotionsService
  ) {
    this.promotionForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      code: ['', [Validators.maxLength(50)]],
      discount_type: [null as number | null, [Validators.required]],
      discount_value: [0, [Validators.required, Validators.min(0.01)]],
      target_scope: ['GENERAL' as PromotionTargetScope, [Validators.required]],
      service: [null as number | null],
      package: [null as number | null],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]],
      description: ['', [Validators.maxLength(2000)]],
      is_active: [true],
      is_public: [true]
    });
  }

  ngOnInit(): void {
    this.buildDiscountMap();

    this.target_scope?.valueChanges.subscribe((scope) => {
      const nextScope = (scope || 'GENERAL') as PromotionTargetScope;
      this.applyTargetValidators(nextScope);
    });

    this.applyTargetValidators((this.target_scope?.value || 'GENERAL') as PromotionTargetScope);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['discountTypes']) {
      this.buildDiscountMap();
    }
  }

  get name() {
    return this.promotionForm.get('name');
  }

  get code() {
    return this.promotionForm.get('code');
  }

  get discount_type() {
    return this.promotionForm.get('discount_type');
  }

  get discount_value() {
    return this.promotionForm.get('discount_value');
  }

  get target_scope() {
    return this.promotionForm.get('target_scope');
  }

  get service() {
    return this.promotionForm.get('service');
  }

  get package() {
    return this.promotionForm.get('package');
  }

  get start_date() {
    return this.promotionForm.get('start_date');
  }

  get end_date() {
    return this.promotionForm.get('end_date');
  }

  get isServiceScope(): boolean {
    return this.target_scope?.value === 'SERVICE';
  }

  get isPackageScope(): boolean {
    return this.target_scope?.value === 'PACKAGE';
  }

  get availableServices(): ServiceI[] {
    const hotelId = this.resolveHotelSettingsId();
    const normalizedHotelId = Number(hotelId);

    return (this.services || []).filter((service) => {
      if (service.is_active === false) return false;
      if (!normalizedHotelId || Number.isNaN(normalizedHotelId)) return true;

      // Algunos serializadores no exponen `hotel_settings` en lectura.
      // En ese caso dejamos pasar el registro y confiamos en el scope del backend.
      const serviceHotelId = Number((service as { hotel_settings?: unknown }).hotel_settings);
      if (!serviceHotelId || Number.isNaN(serviceHotelId)) return true;

      return serviceHotelId === normalizedHotelId;
    });
  }

  get availablePackages(): PackageI[] {
    const hotelId = this.resolveHotelSettingsId();
    const normalizedHotelId = Number(hotelId);

    return (this.packages || []).filter((pkg) => {
      if (pkg.is_active === false) return false;
      if (!normalizedHotelId || Number.isNaN(normalizedHotelId)) return true;

      // Algunos serializadores no exponen `hotel_settings` en lectura.
      // En ese caso dejamos pasar el registro y confiamos en el scope del backend.
      const packageHotelId = Number((pkg as { hotel_settings?: unknown }).hotel_settings);
      if (!packageHotelId || Number.isNaN(packageHotelId)) return true;

      return packageHotelId === normalizedHotelId;
    });
  }

  submit(): void {
    this.errorMessage = '';

    const hotelSettingsId = this.resolveHotelSettingsId();
    if (!hotelSettingsId) {
      this.errorMessage = 'No se encontro una configuracion de hotel activa para crear promociones.';
      return;
    }

    if (!this.discountTypes.length) {
      this.errorMessage =
        'No hay tipos de descuento activos. Registra PROMOTION_DISCOUNT_TYPE en master data antes de crear promociones.';
      return;
    }

    if (this.promotionForm.invalid) {
      this.promotionForm.markAllAsTouched();
      return;
    }

    const raw = this.promotionForm.getRawValue();
    const targetScope = (raw.target_scope || 'GENERAL') as PromotionTargetScope;

    const selectedService = typeof raw.service === 'number' ? Number(raw.service) : null;
    const selectedPackage = typeof raw.package === 'number' ? Number(raw.package) : null;

    if (targetScope === 'SERVICE' && !selectedService) {
      this.errorMessage = 'Selecciona un servicio para continuar.';
      return;
    }

    if (targetScope === 'PACKAGE' && !selectedPackage) {
      this.errorMessage = 'Selecciona un paquete para continuar.';
      return;
    }

    const payload: PromotionFormPayload = {
      hotel_settings: hotelSettingsId,
      discount_type: Number(raw.discount_type),
      service: targetScope === 'SERVICE' ? selectedService : null,
      package: targetScope === 'PACKAGE' ? selectedPackage : null,
      name: raw.name?.trim() || '',
      code: this.normalizeNullableString(raw.code),
      description: raw.description?.trim() || '',
      discount_value: this.toDiscountNumber(raw.discount_value),
      start_date: this.normalizeDate(raw.start_date),
      end_date: this.normalizeDate(raw.end_date),
      is_active: !!raw.is_active,
      is_public: !!raw.is_public
    };

    if (payload.discount_value <= 0) {
      this.errorMessage = 'El valor del descuento debe ser mayor que 0.';
      return;
    }

    if (this.hasInvalidDateRange(payload.start_date, payload.end_date)) {
      this.errorMessage = 'La fecha final no puede ser menor que la fecha inicial.';
      return;
    }

    if (this.isPercentageDiscount(payload.discount_type) && payload.discount_value > 100) {
      this.errorMessage = 'El descuento porcentual no puede ser mayor a 100%.';
      return;
    }

    this.saving = true;
    this.promotionsService.createPromotion(payload).subscribe({
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

  private applyTargetValidators(scope: PromotionTargetScope): void {
    if (scope === 'SERVICE') {
      this.service?.setValidators([Validators.required]);
      this.package?.clearValidators();
      this.package?.setValue(null, { emitEvent: false });
    } else if (scope === 'PACKAGE') {
      this.package?.setValidators([Validators.required]);
      this.service?.clearValidators();
      this.service?.setValue(null, { emitEvent: false });
    } else {
      this.service?.clearValidators();
      this.package?.clearValidators();
      this.service?.setValue(null, { emitEvent: false });
      this.package?.setValue(null, { emitEvent: false });
    }

    this.service?.updateValueAndValidity({ emitEvent: false });
    this.package?.updateValueAndValidity({ emitEvent: false });
  }

  private buildDiscountMap(): void {
    this.discountTypeMap = new Map(this.discountTypes.map((discountType) => [discountType.id, discountType]));
  }

  private resolveHotelSettingsId(): number | null {
    if (typeof this.hotelSettingsId === 'number' && this.hotelSettingsId > 0) {
      return this.hotelSettingsId;
    }

    const fromService = this.services.find((service) => Number(service.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromService === 'number' && fromService > 0) return fromService;

    const fromPackage = this.packages.find((pkg) => Number(pkg.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromPackage === 'number' && fromPackage > 0) return fromPackage;

    return null;
  }

  private isPercentageDiscount(discountTypeId: number): boolean {
    const discountType = this.discountTypeMap.get(discountTypeId);
    const code = this.normalizeCode(discountType?.code || '');
    return code.includes('PERCENT') || code.includes('PORCEN') || code === 'PCT';
  }

  private toDiscountNumber(value: unknown): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return Number(parsed.toFixed(2));
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  private hasInvalidDateRange(startDate: string, endDate: string): boolean {
    if (!startDate || !endDate) return false;
    return endDate < startDate;
  }

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo crear la promocion. Revisa los datos e intenta nuevamente.';

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
