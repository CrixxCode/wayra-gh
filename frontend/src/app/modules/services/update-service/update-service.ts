import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ServiceFormPayload, ServiceI } from '../service-model';
import { ServicesService } from '../../../services/service';

@Component({
  selector: 'app-update-service',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-service.html',
  styleUrls: ['./update-service.css']
})
export class UpdateService implements OnChanges {
  @Input() service: ServiceI | null = null;
  @Input() serviceTypes: MasterDataI[] = [];
  @Input() hotelSettingsId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  serviceForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private servicesService: ServicesService
  ) {
    this.serviceForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      service_type: [null as number | null, [Validators.required]],
      base_price: [0, [Validators.required, Validators.min(0)]],
      description: ['', [Validators.maxLength(1500)]],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['service'] || !this.service) return;

    this.serviceForm.reset({
      name: this.service.name || '',
      service_type: this.service.service_type || null,
      base_price: this.toPriceNumber(this.service.base_price),
      description: this.service.description || '',
      is_active: !!this.service.is_active
    });

    this.errorMessage = '';
  }

  get name() {
    return this.serviceForm.get('name');
  }

  get service_type() {
    return this.serviceForm.get('service_type');
  }

  get base_price() {
    return this.serviceForm.get('base_price');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.service?.id) {
      this.errorMessage = 'No se encontro el servicio a actualizar.';
      return;
    }

    const hotelSettingsId = this.resolveHotelSettingsId();
    if (!hotelSettingsId) {
      this.errorMessage = 'No se encontro una configuracion de hotel valida para este servicio.';
      return;
    }

    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const raw = this.serviceForm.getRawValue();
    const payload: ServiceFormPayload = {
      hotel_settings: hotelSettingsId,
      service_type: Number(raw.service_type),
      name: raw.name?.trim() || '',
      description: raw.description?.trim() || '',
      base_price: this.toPriceNumber(raw.base_price),
      is_active: !!raw.is_active
    };

    this.saving = true;
    this.servicesService.updateService(this.service.id, payload).subscribe({
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

  private resolveHotelSettingsId(): number | null {
    const fromService = this.service?.hotel_settings;
    if (typeof fromService === 'number' && fromService > 0) return fromService;

    if (typeof this.hotelSettingsId === 'number' && this.hotelSettingsId > 0) {
      return this.hotelSettingsId;
    }

    return null;
  }

  private toPriceNumber(value: unknown): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber) || asNumber < 0) return 0;
    return asNumber;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo actualizar el servicio. Revisa los datos e intenta nuevamente.';

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
