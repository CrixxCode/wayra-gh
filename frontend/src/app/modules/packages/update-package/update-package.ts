import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { ServiceI } from '../../services/service-model';
import { PackageFormPayload, PackageI } from '../package-model';
import { PackagesService } from '../../../services/package';
import { RoomTypeI } from '../../rooms/room-model';

@Component({
  selector: 'app-update-package',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './update-package.html',
  styleUrls: ['./update-package.css']
})
export class UpdatePackage implements OnChanges {
  @Input() packageData: PackageI | null = null;
  @Input() roomTypes: RoomTypeI[] = [];
  @Input() services: ServiceI[] = [];
  @Input() hotelSettingsId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  saving = false;
  errorMessage = '';
  serviceSearch = '';

  selectedServiceIds: number[] = [];

  packageForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private packagesService: PackagesService
  ) {
    this.packageForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(150)]],
      room_type: [null as number | null],
      base_price: [0, [Validators.required, Validators.min(0)]],
      description: ['', [Validators.maxLength(2000)]],
      start_date: [''],
      end_date: [''],
      is_active: [true]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['packageData'] || !this.packageData) return;

    this.packageForm.reset({
      name: this.packageData.name || '',
      room_type: this.packageData.room_type || null,
      base_price: this.toPriceNumber(this.packageData.base_price),
      description: this.packageData.description || '',
      start_date: this.packageData.start_date || '',
      end_date: this.packageData.end_date || '',
      is_active: !!this.packageData.is_active
    });

    this.selectedServiceIds = (this.packageData.package_services || [])
      .map((packageService) => packageService.service)
      .filter((serviceId): serviceId is number => typeof serviceId === 'number');

    this.errorMessage = '';
  }

  get name() {
    return this.packageForm.get('name');
  }

  get base_price() {
    return this.packageForm.get('base_price');
  }

  get room_type() {
    return this.packageForm.get('room_type');
  }

  get availableServices(): ServiceI[] {
    const searchValue = this.normalizeSearch(this.serviceSearch);
    return (this.services || []).filter((service) => {
      if (!service.is_active) return false;
      if (!searchValue) return true;

      const searchPool = [
        service.name,
        service.description || '',
        service.service_type_name || '',
        service.service_type_code || ''
      ]
        .join(' ')
        .toLowerCase();

      return searchPool.includes(searchValue);
    });
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.packageData?.id) {
      this.errorMessage = 'No se encontro el paquete a actualizar.';
      return;
    }

    const resolvedHotelSettingsId = this.resolveHotelSettingsId();
    if (!resolvedHotelSettingsId) {
      this.errorMessage = 'No se encontro una configuracion de hotel valida para este paquete.';
      return;
    }

    if (this.packageForm.invalid) {
      this.packageForm.markAllAsTouched();
      return;
    }

    const raw = this.packageForm.getRawValue();
    const payload: PackageFormPayload = {
      hotel_settings: resolvedHotelSettingsId,
      room_type: typeof raw.room_type === 'number' ? raw.room_type : null,
      name: raw.name?.trim() || '',
      description: raw.description?.trim() || '',
      base_price: this.toPriceNumber(raw.base_price),
      is_active: !!raw.is_active,
      start_date: this.normalizeDate(raw.start_date),
      end_date: this.normalizeDate(raw.end_date)
    };

    if (this.hasInvalidDateRange(payload.start_date, payload.end_date)) {
      this.errorMessage = 'La fecha final no puede ser menor que la fecha inicial.';
      return;
    }

    this.saving = true;
    this.packagesService
      .updatePackage(this.packageData.id, payload)
      .pipe(
        switchMap(() => this.syncPackageServices(this.packageData!.id))
      )
      .subscribe({
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

  selectRoomType(roomTypeId: number): void {
    const current = this.room_type?.value;
    this.room_type?.setValue(current === roomTypeId ? null : roomTypeId);
    this.room_type?.markAsDirty();
  }

  isRoomTypeSelected(roomTypeId: number): boolean {
    return this.room_type?.value === roomTypeId;
  }

  toggleService(serviceId: number): void {
    const current = new Set(this.selectedServiceIds);
    if (current.has(serviceId)) {
      current.delete(serviceId);
    } else {
      current.add(serviceId);
    }

    this.selectedServiceIds = Array.from(current.values());
  }

  isServiceSelected(serviceId: number): boolean {
    return this.selectedServiceIds.includes(serviceId);
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private syncPackageServices(packageId: number): Observable<void> {
    const selectedSet = new Set(this.selectedServiceIds);
    const currentLinks = (this.packageData?.package_services || []).filter(
      (link) => Number(link.package) === Number(packageId)
    );
    const currentServiceIds = new Set(currentLinks.map((link) => link.service));

    const toCreate = Array.from(selectedSet).filter((serviceId) => !currentServiceIds.has(serviceId));
    const toDelete = currentLinks.filter((link) => !selectedSet.has(link.service));

    const createRequests = toCreate.map((serviceId) =>
      this.packagesService
        .createPackageService({
          package: packageId,
          service: serviceId,
          quantity: 1,
          is_included: true
        })
        .pipe(map(() => void 0))
    );

    const deleteRequests = toDelete.map((link) =>
      this.packagesService.deletePackageService(link.id).pipe(map(() => void 0))
    );

    const tasks = [...createRequests, ...deleteRequests];
    if (!tasks.length) return of(void 0);

    return forkJoin(tasks).pipe(map(() => void 0));
  }

  private resolveHotelSettingsId(): number | null {
    const fromPackage = this.packageData?.hotel_settings;
    if (typeof fromPackage === 'number' && fromPackage > 0) return fromPackage;

    if (typeof this.hotelSettingsId === 'number' && this.hotelSettingsId > 0) {
      return this.hotelSettingsId;
    }

    return null;
  }

  private normalizeDate(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  private hasInvalidDateRange(startDate: string | null | undefined, endDate: string | null | undefined): boolean {
    if (!startDate || !endDate) return false;
    return endDate < startDate;
  }

  private toPriceNumber(value: unknown): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber) || asNumber < 0) return 0;
    return asNumber;
  }

  private normalizeSearch(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo actualizar el paquete. Revisa los datos e intenta nuevamente.';

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
