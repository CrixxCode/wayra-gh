import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, UntypedFormArray, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ReservationService } from '../../../services/reservation';
import { ClientI } from '../../clients/client-model';
import { PackageI } from '../../packages/package-model';
import { RateI, RoomI } from '../../rooms/room-model';
import { ReservationDetailI, ReservationPolicyI, ReservationRoomPayloadI, ReservationWritePayloadI } from '../reservation-model';

@Component({
  selector: 'app-update-reservation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update-reservation.html',
  styleUrls: ['./update-reservation.css']
})
export class UpdateReservation implements OnChanges {
  @Input() reservation: ReservationDetailI | null = null;
  @Input() clients: ClientI[] = [];
  @Input() origins: MasterDataI[] = [];
  @Input() reservationPolicies: ReservationPolicyI[] = [];
  @Input() rooms: RoomI[] = [];
  @Input() rates: RateI[] = [];
  @Input() packages: PackageI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  saving = false;
  errorMessage = '';
  warningMessage = '';
  submitted = false;

  reservationForm: UntypedFormGroup;
  removedRoomIds: number[] = [];

  constructor(
    private fb: UntypedFormBuilder,
    private reservationService: ReservationService
  ) {
    this.reservationForm = this.fb.group({
      client: [null, [Validators.required]],
      origin: [null, [Validators.required]],
      package: [null],
      expected_check_in: ['', [Validators.required]],
      expected_check_out: ['', [Validators.required]],
      promo_code: [''],
      total_discount: [0],
      notes: ['', [Validators.maxLength(1200)]],
      policy_lines: this.fb.array([]),
      room_lines: this.fb.array([])
    });

    this.addPolicyLine();
    this.addRoomLine();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reservation'] || !this.reservation) return;

    this.removedRoomIds = [];

    this.reservationForm.reset({
      client: this.reservation.client ?? null,
      origin: this.reservation.origin ?? null,
      package: this.reservation.package ?? null,
      expected_check_in: this.normalizeDateInput(this.reservation.expected_check_in),
      expected_check_out: this.normalizeDateInput(this.reservation.expected_check_out),
      promo_code: this.reservation.promo_code || '',
      total_discount: this.reservation.total_discount ? Number(this.reservation.total_discount) : 0,
      notes: this.reservation.notes || ''
    });

    this.roomLines.clear();
    this.policyLines.clear();

    const reservationPolicies = this.reservation.policies || [];
    if (reservationPolicies.length === 0) {
      this.addPolicyLine();
    } else {
      for (const reservationPolicy of reservationPolicies) {
        this.policyLines.push(this.buildPolicyLine(reservationPolicy.id));
      }
    }

    const roomDetails = this.reservation.rooms_detail || [];
    if (roomDetails.length === 0) {
      this.addRoomLine();
    } else {
      for (const detail of roomDetails) {
        this.roomLines.push(
          this.buildRoomLine({
            id: detail.id,
            room: detail.room
          })
        );
      }
    }

    this.errorMessage = '';
    this.submitted = false;
  }

  get roomLines(): UntypedFormArray {
    return this.reservationForm.get('room_lines') as UntypedFormArray;
  }

  get policyLines(): UntypedFormArray {
    return this.reservationForm.get('policy_lines') as UntypedFormArray;
  }

  get availableRooms(): RoomI[] {
    return [...this.rooms].sort((a, b) => String(a.number).localeCompare(String(b.number), 'es-CO'));
  }

  get availableReservationPolicies(): ReservationPolicyI[] {
    return [...this.reservationPolicies]
      .filter((policy) => policy.is_active !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es-CO'));
  }

  get availablePackages(): PackageI[] {
    return [...this.packages]
      .filter((item) => item.is_active !== false)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es-CO'));
  }

  get selectedPoliciesCount(): number {
    return this.collectSelectedPolicyIds().length;
  }

  addPolicyLine(): void {
    this.policyLines.push(this.buildPolicyLine());
  }

  removePolicyLine(index: number): void {
    if (index < 0 || index >= this.policyLines.length) return;
    this.policyLines.removeAt(index);

    if (this.policyLines.length === 0) {
      this.addPolicyLine();
    }
  }

  addRoomLine(): void {
    this.roomLines.push(this.buildRoomLine());
  }

  removeRoomLine(index: number): void {
    if (index < 0 || index >= this.roomLines.length) return;

    const line = this.roomLines.at(index);
    const lineId = Number(line.get('id')?.value || 0);
    if (lineId > 0) {
      this.removedRoomIds.push(lineId);
    }

    this.roomLines.removeAt(index);

    if (this.roomLines.length === 0) {
      this.addRoomLine();
    }
  }

  submit(): void {
    this.submitted = true;
    this.errorMessage = '';
    this.warningMessage = '';

    if (!this.reservation?.id) {
      this.errorMessage = 'No se encontro la reserva a actualizar.';
      return;
    }

    if (this.reservationForm.invalid) {
      this.reservationForm.markAllAsTouched();
      this.policyLines.controls.forEach((control) => control.markAllAsTouched());
      this.roomLines.controls.forEach((control) => control.markAllAsTouched());
      return;
    }

    const dateError = this.validateDateRange();
    if (dateError) {
      this.errorMessage = dateError;
      return;
    }

    const packageError = this.validateSelectedPackage();
    if (packageError) {
      this.errorMessage = packageError;
      return;
    }

    const policyBuild = this.buildPolicySelection();
    if (policyBuild.error) {
      this.errorMessage = policyBuild.error;
      return;
    }

    const roomBuild = this.buildRoomOperations();
    if (roomBuild.error) {
      this.errorMessage = roomBuild.error;
      return;
    }

    const capacityWarning = this.validateRoomCapacityAgainstCurrentGuests();
    if (capacityWarning) {
      this.warningMessage = capacityWarning;
      return;
    }

    this.saving = true;

    const payload = this.buildReservationPayload(policyBuild.policyIds);

    this.reservationService
      .updateReservation(this.reservation.id, payload)
      .pipe(
        switchMap(() => {
          const requests = [...roomBuild.createRequests, ...roomBuild.updateRequests, ...roomBuild.deleteRequests];
          if (requests.length === 0) {
            return of(null);
          }
          return forkJoin(requests);
        })
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.updated.emit();
          this.closeDrawer();
        },
        error: (error) => {
          this.saving = false;
          this.warningMessage = '';
          this.errorMessage = this.extractErrorMessage(error);
        }
      });
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.submitted = false;
    this.warningMessage = '';
    this.closed.emit();
  }

  trackByRoomLine(index: number): number {
    return index;
  }

  trackByPolicyLine(index: number): number {
    return index;
  }

  trackById(index: number, item: { id?: number }): number {
    return item.id ?? index;
  }

  isControlInvalid(controlName: string): boolean {
    const control = this.reservationForm.get(controlName);
    if (!control) return false;
    return control.invalid && this.shouldShowControlErrors(control);
  }

  getControlError(controlName: string): string {
    const control = this.reservationForm.get(controlName);
    if (!control || !this.shouldShowControlErrors(control)) return '';

    if (control.hasError('required')) {
      if (controlName === 'client') return 'Debes seleccionar un cliente.';
      if (controlName === 'origin') return 'Debes seleccionar el origen de la reserva.';
      if (controlName === 'expected_check_in') return 'Debes indicar la fecha de check-in.';
      if (controlName === 'expected_check_out') return 'Debes indicar la fecha de check-out.';
      return 'Este campo es obligatorio.';
    }

    if (controlName === 'expected_check_out') {
      const checkIn = this.parseDate(this.reservationForm.get('expected_check_in')?.value);
      const checkOut = this.parseDate(control.value);
      if (checkIn && checkOut && checkOut <= checkIn) {
        return 'La fecha de check-out debe ser posterior al check-in.';
      }
    }

    if (control.hasError('maxlength') && controlName === 'notes') {
      return 'Las notas no pueden superar 1200 caracteres.';
    }

    return '';
  }

  isRoomFieldInvalid(index: number, field: 'room'): boolean {
    return this.getRoomFieldError(index, field) !== '';
  }

  getRoomFieldError(index: number, field: 'room'): string {
    const lineControl = this.roomLines.at(index);
    if (!lineControl || !this.shouldValidateRoomLine(lineControl)) return '';

    const roomRaw = lineControl.get('room')?.value;

    if (field === 'room') {
      if (!this.hasValue(roomRaw)) return 'Selecciona una habitacion.';
      const roomId = Number(roomRaw);
      if (!roomId || Number.isNaN(roomId)) return 'Selecciona una habitacion valida.';
      if (this.getDuplicateRoomIds().has(roomId)) return 'Esta habitacion ya esta cargada en otra fila.';
      return '';
    }
    return '';
  }

  getRoomCapacityLabel(index: number): string {
    const lineControl = this.roomLines.at(index);
    if (!lineControl) return 'Sin seleccionar';

    const roomRaw = lineControl.get('room')?.value;
    const roomId = Number(roomRaw || 0);
    if (!roomId || Number.isNaN(roomId)) return 'Sin seleccionar';

    const room = this.findRoomById(roomId);
    const capacity = Number(room?.room_type_capacity || 0);
    if (!Number.isFinite(capacity) || capacity <= 0) return 'Sin dato';

    return `${capacity} persona${capacity === 1 ? '' : 's'}`;
  }

  getAvailablePackagesForDates(): PackageI[] {
    const checkIn = this.parseDate(this.reservationForm.get('expected_check_in')?.value);
    const checkOut = this.parseDate(this.reservationForm.get('expected_check_out')?.value);

    return this.availablePackages.filter((item) => {
      if (!checkIn || !checkOut) {
        return true;
      }

      return this.isPackageWithinDateRange(item, checkIn, checkOut);
    });
  }

  getPackageOptionLabel(item: PackageI): string {
    const price = Number(item.base_price || 0);
    const formattedPrice = Number.isNaN(price)
      ? String(item.base_price || 0)
      : price.toLocaleString('es-CO');
    return `${item.name} - ${formattedPrice}`;
  }

  private shouldShowControlErrors(control: AbstractControl): boolean {
    return control.touched || this.submitted;
  }

  private shouldValidateRoomLine(lineControl: AbstractControl): boolean {
    return this.hasRoomLineData(lineControl) && this.shouldShowControlErrors(lineControl);
  }

  private hasRoomLineData(lineControl: AbstractControl): boolean {
    const roomRaw = lineControl.get('room')?.value;
    return this.hasValue(roomRaw);
  }

  private getDuplicateRoomIds(): Set<number> {
    const roomUsage = new Map<number, number>();

    for (const lineControl of this.roomLines.controls) {
      const roomRaw = lineControl.get('room')?.value;
      if (!this.hasValue(roomRaw)) continue;

      const roomId = Number(roomRaw);
      if (!roomId || Number.isNaN(roomId)) continue;
      roomUsage.set(roomId, (roomUsage.get(roomId) ?? 0) + 1);
    }

    const duplicates = new Set<number>();
    for (const [roomId, count] of roomUsage) {
      if (count > 1) {
        duplicates.add(roomId);
      }
    }

    return duplicates;
  }

  private hasValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  private buildPolicyLine(initialPolicyId: number | null = null): UntypedFormGroup {
    return this.fb.group({
      policy: [initialPolicyId]
    });
  }

  private buildRoomLine(
    initial?: Partial<{ id: number; room: number }>
  ): UntypedFormGroup {
    return this.fb.group({
      id: [initial?.id ?? null],
      room: [initial?.room ?? null],
    });
  }

  private buildReservationPayload(policyIds: number[]): Partial<ReservationWritePayloadI> {
    const raw = this.reservationForm.getRawValue();

    return {
      client: Number(raw.client),
      origin: Number(raw.origin),
      package: raw.package ? Number(raw.package) : null,
      expected_check_in: String(raw.expected_check_in || ''),
      expected_check_out: String(raw.expected_check_out || ''),
      promo_code: raw.promo_code ? String(raw.promo_code).trim() : null,
      total_discount: raw.total_discount ? Number(raw.total_discount) : 0,
      policies: policyIds,
      notes: raw.notes ? String(raw.notes).trim() : null
    };
  }

  private buildPolicySelection(): { policyIds: number[]; error?: string } {
    const selectedIds: number[] = [];
    const usedIds = new Set<number>();
    const availablePolicyIds = new Set(this.availableReservationPolicies.map((policy) => policy.id));

    for (const policyControl of this.policyLines.controls) {
      const raw = policyControl.getRawValue();
      const policyRaw = raw['policy'];
      const hasSelection = policyRaw !== null && policyRaw !== undefined && `${policyRaw}`.trim() !== '';

      if (!hasSelection) {
        continue;
      }

      const policyId = Number(policyRaw);
      if (!policyId || Number.isNaN(policyId)) {
        return { policyIds: [], error: 'Debes seleccionar una politica valida en cada fila cargada.' };
      }

      if (!availablePolicyIds.has(policyId)) {
        return { policyIds: [], error: 'Una de las politicas seleccionadas ya no esta disponible.' };
      }

      if (usedIds.has(policyId)) {
        return { policyIds: [], error: 'No puedes repetir la misma politica en la reserva.' };
      }

      usedIds.add(policyId);
      selectedIds.push(policyId);
    }

    return { policyIds: selectedIds };
  }

  private buildRoomOperations(): {
    createRequests: Array<ReturnType<ReservationService['createReservationRoom']>>;
    updateRequests: Array<ReturnType<ReservationService['updateReservationRoom']>>;
    deleteRequests: Array<ReturnType<ReservationService['deleteReservationRoom']>>;
    error?: string;
  } {
    const createRequests: Array<ReturnType<ReservationService['createReservationRoom']>> = [];
    const updateRequests: Array<ReturnType<ReservationService['updateReservationRoom']>> = [];
    const deleteRequests: Array<ReturnType<ReservationService['deleteReservationRoom']>> = [];
    const usedRooms = new Set<number>();
    const checkIn = this.parseDate(this.reservationForm.get('expected_check_in')?.value);
    const checkOut = this.parseDate(this.reservationForm.get('expected_check_out')?.value);
    const selectedPackage = this.getSelectedPackage();

    for (const lineControl of this.roomLines.controls) {
      const raw = lineControl.getRawValue();

      const lineId = Number(raw['id'] || 0);
      const roomRaw = raw['room'];

      const hasRoom = roomRaw !== null && roomRaw !== undefined && `${roomRaw}`.trim() !== '';
      const hasPayload = hasRoom;

      if (!hasPayload) {
        if (lineId > 0) {
          deleteRequests.push(this.reservationService.deleteReservationRoom(lineId));
        }
        continue;
      }

      const room = Number(roomRaw);

      if (!room || Number.isNaN(room)) {
        return { createRequests: [], updateRequests: [], deleteRequests: [], error: 'Debes seleccionar una habitacion valida en cada fila cargada.' };
      }

      const selectedRoom = this.findRoomById(room);
      if (!selectedRoom) {
        return { createRequests: [], updateRequests: [], deleteRequests: [], error: 'La habitacion seleccionada ya no esta disponible.' };
      }

      if (usedRooms.has(room)) {
        return { createRequests: [], updateRequests: [], deleteRequests: [], error: 'No puedes repetir la misma habitacion en una misma reserva.' };
      }
      usedRooms.add(room);

      if (checkIn && checkOut && this.hasRoomActiveReservationOverlap(selectedRoom, checkIn, checkOut, lineId)) {
        const start = this.formatDateLabel(selectedRoom.active_reservation?.expected_check_in);
        const end = this.formatDateLabel(selectedRoom.active_reservation?.expected_check_out);
        return {
          createRequests: [],
          updateRequests: [],
          deleteRequests: [],
          error: `La habitacion ${selectedRoom.number} tiene una reserva activa que se cruza con las fechas seleccionadas (${start} a ${end}).`
        };
      }

      if (selectedPackage?.room_type) {
        const requiredRoomType = Number(selectedPackage.room_type);
        const roomType = Number(selectedRoom.room_type || 0);
        if (!roomType || roomType !== requiredRoomType) {
          return {
            createRequests: [],
            updateRequests: [],
            deleteRequests: [],
            error: `La habitacion ${selectedRoom.number} no coincide con el tipo requerido por el paquete.`
          };
        }
      }

      const roomTypeId = Number(selectedRoom.room_type || 0);
      if (roomTypeId > 0) {
        const hasActiveRates = this.hasActiveRatesForRoomType(roomTypeId);
        const applicableRate = this.findApplicableRateForRoomType(roomTypeId, checkIn, checkOut);

        if (hasActiveRates && !applicableRate) {
          return {
            createRequests: [],
            updateRequests: [],
            deleteRequests: [],
            error: (
              `No existe una tarifa activa para la habitacion ${selectedRoom.number} ` +
              'en el rango de fechas seleccionado.'
            )
          };
        }
      }

      const roomPayload: ReservationRoomPayloadI = {
        reservation: this.reservation?.id || 0,
        room,
      };

      if (lineId > 0) {
        updateRequests.push(this.reservationService.updateReservationRoom(lineId, roomPayload));
      } else {
        createRequests.push(this.reservationService.createReservationRoom(roomPayload));
      }
    }

    for (const removedId of this.removedRoomIds) {
      deleteRequests.push(this.reservationService.deleteReservationRoom(removedId));
    }

    return { createRequests, updateRequests, deleteRequests };
  }

  private validateRoomCapacityAgainstCurrentGuests(): string {
    const roomIds = this.roomLines.controls
      .map((lineControl) => Number(lineControl.get('room')?.value || 0))
      .filter((roomId) => roomId > 0 && !Number.isNaN(roomId));

    if (!roomIds.length) return '';

    const totalCapacity = roomIds.reduce((sum, roomId) => {
      const room = this.findRoomById(roomId);
      const capacity = Number(room?.room_type_capacity || 0);
      if (!Number.isFinite(capacity) || capacity <= 0) return sum;
      return sum + capacity;
    }, 0);

    const guestsFromList = this.reservation?.guests?.length || 0;
    const guestsFromTotal = Number(this.reservation?.total_guests || 0);
    const guestsCount = guestsFromList > 0 ? guestsFromList : (Number.isNaN(guestsFromTotal) ? 0 : guestsFromTotal);

    if (guestsCount > 0 && totalCapacity > 0 && guestsCount > totalCapacity) {
      return (
        `Advertencia: la reserva tiene ${guestsCount} huesped(es), ` +
        `pero la capacidad total seleccionada es ${totalCapacity}. ` +
        'Agrega mas habitaciones o ajusta los huespedes asociados.'
      );
    }

    return '';
  }

  private validateDateRange(): string {
    const checkInValue = this.reservationForm.get('expected_check_in')?.value;
    const checkOutValue = this.reservationForm.get('expected_check_out')?.value;

    const checkIn = this.parseDate(checkInValue);
    const checkOut = this.parseDate(checkOutValue);

    if (!checkIn || !checkOut) {
      return 'Las fechas de check-in y check-out son obligatorias.';
    }

    if (checkOut <= checkIn) {
      return 'La fecha de check-out debe ser posterior al check-in.';
    }

    return '';
  }

  private validateSelectedPackage(): string {
    const packageRaw = this.reservationForm.get('package')?.value;
    const hasPackage = packageRaw !== null && packageRaw !== undefined && `${packageRaw}`.trim() !== '';
    if (!hasPackage) return '';

    const packageId = Number(packageRaw);
    if (!packageId || Number.isNaN(packageId)) {
      return 'Debes seleccionar un paquete valido.';
    }

    const selectedPackage = this.findPackageById(packageId);
    if (!selectedPackage || selectedPackage.is_active === false) {
      return 'El paquete seleccionado ya no esta disponible.';
    }

    const checkIn = this.parseDate(this.reservationForm.get('expected_check_in')?.value);
    const checkOut = this.parseDate(this.reservationForm.get('expected_check_out')?.value);
    if (checkIn && checkOut && !this.isPackageWithinDateRange(selectedPackage, checkIn, checkOut)) {
      return 'El paquete seleccionado no esta vigente para las fechas de la reserva.';
    }

    return '';
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    const parts = String(value).split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;

    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setHours(0, 0, 0, 0);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalizeDateInput(value: string | null | undefined): string {
    if (!value) return '';
    const text = String(value);
    return text.includes('T') ? text.split('T')[0] : text;
  }

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }

  private getSelectedPackage(): PackageI | null {
    const packageRaw = this.reservationForm.get('package')?.value;
    const packageId = Number(packageRaw || 0);
    if (!packageId || Number.isNaN(packageId)) return null;
    return this.findPackageById(packageId) || null;
  }

  private findRoomById(roomId: unknown): RoomI | undefined {
    const id = Number(roomId || 0);
    if (!id || Number.isNaN(id)) return undefined;
    return this.availableRooms.find((room) => room.id === id);
  }

  private hasRoomActiveReservationOverlap(
    room: RoomI,
    checkIn: Date,
    checkOut: Date,
    currentReservationRoomId: number
  ): boolean {
    const activeReservation = room.active_reservation;
    if (!activeReservation) return false;
    if (Number(activeReservation.id || 0) === Number(this.reservation?.id || 0)) {
      return false;
    }
    if (currentReservationRoomId > 0 && Number(activeReservation.reservation_room_id || 0) === currentReservationRoomId) {
      return false;
    }

    const activeCheckIn = this.parseDate(activeReservation.expected_check_in || null);
    const activeCheckOut = this.parseDate(activeReservation.expected_check_out || null);
    if (!activeCheckIn || !activeCheckOut) return true;

    return checkIn < activeCheckOut && checkOut > activeCheckIn;
  }

  private hasActiveRatesForRoomType(roomTypeId: number): boolean {
    if (!roomTypeId || !Number.isFinite(roomTypeId)) return false;
    return this.rates.some((rate) => Number(rate.room_type) === roomTypeId && rate.is_active !== false);
  }

  private findApplicableRateForRoomType(roomTypeId: number, checkIn: Date | null, checkOut: Date | null): RateI | null {
    if (!roomTypeId || !Number.isFinite(roomTypeId)) return null;

    const candidates = this.rates
      .filter((rate) => Number(rate.room_type) === roomTypeId && rate.is_active !== false)
      .filter((rate) => this.isRateApplicableToRange(rate, checkIn, checkOut))
      .sort((a, b) => {
        const aStart = this.parseDate(a.start_date || null)?.getTime() || 0;
        const bStart = this.parseDate(b.start_date || null)?.getTime() || 0;
        if (aStart !== bStart) return bStart - aStart;

        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aCreated !== bCreated) return bCreated - aCreated;

        return Number(b.id || 0) - Number(a.id || 0);
      });

    return candidates[0] || null;
  }

  private isRateApplicableToRange(rate: RateI, checkIn: Date | null, checkOut: Date | null): boolean {
    const startDate = this.parseDate(rate.start_date || null);
    const endDate = this.parseDate(rate.end_date || null);

    if (checkIn && startDate && checkIn < startDate) {
      return false;
    }

    if (checkOut && endDate && checkOut > endDate) {
      return false;
    }

    return true;
  }

  private formatDateLabel(value: string | null | undefined): string {
    if (!value) return 'fecha no disponible';
    return value;
  }

  private extractFirstMessage(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value;

    if (Array.isArray(value)) {
      for (const item of value) {
        const message = this.extractFirstMessage(item);
        if (message) return message;
      }
      return null;
    }

    if (value && typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const message = this.extractFirstMessage((value as Record<string, unknown>)[key]);
        if (message) return message;
      }
    }

    return null;
  }

  private findPackageById(packageId: unknown): PackageI | undefined {
    const id = Number(packageId || 0);
    if (!id || Number.isNaN(id)) return undefined;
    return this.availablePackages.find((item) => item.id === id);
  }

  private isPackageWithinDateRange(item: PackageI, checkIn: Date, checkOut: Date): boolean {
    const startDate = this.parseDate(item.start_date || null);
    const endDate = this.parseDate(item.end_date || null);

    if (startDate && checkIn < startDate) {
      return false;
    }

    if (endDate && checkOut > endDate) {
      return false;
    }

    return true;
  }

  private findPolicyById(policyId: unknown): ReservationPolicyI | undefined {
    const id = Number(policyId || 0);
    if (!id || Number.isNaN(id)) return undefined;
    return this.availableReservationPolicies.find((policy) => policy.id === id);
  }

  getPolicyTypeLabel(policyId: unknown): string {
    const policy = this.findPolicyById(policyId);
    if (!policy) return 'Sin tipo';
    return policy.policy_type_name || policy.policy_type_code || 'Sin tipo';
  }

  getPolicyPenaltyLabel(policyId: unknown): string {
    const policy = this.findPolicyById(policyId);
    if (!policy) return 'Sin penalidad';

    const penaltyType = policy.penalty_type_name || policy.penalty_type_code || 'Penalidad';
    const rawValue = policy.penalty_value;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return penaltyType;
    }

    const value = Number(rawValue);
    if (Number.isNaN(value)) return penaltyType;

    const isPercentage = this.normalizeCode(policy.penalty_type_code) === 'PERCENTAGE';
    const formattedValue = isPercentage ? `${value}%` : value.toLocaleString('es-CO');
    return `${penaltyType}: ${formattedValue}`;
  }

  getPolicyHoursLabel(policyId: unknown): string {
    const policy = this.findPolicyById(policyId);
    const hours = Number(policy?.hours_before_checkin);
    if (Number.isNaN(hours) || hours < 0) return 'Sin limite';
    return `${hours} hora(s)`;
  }

  private collectSelectedPolicyIds(): number[] {
    const selectedIds: number[] = [];
    const usedIds = new Set<number>();

    for (const control of this.policyLines.controls) {
      const raw = control.getRawValue();
      const policyId = Number(raw['policy'] || 0);
      if (!policyId || Number.isNaN(policyId) || usedIds.has(policyId)) {
        continue;
      }
      usedIds.add(policyId);
      selectedIds.push(policyId);
    }

    return selectedIds;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo actualizar la reserva. Verifica los datos e intenta nuevamente.';

    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload) return fallback;

    const detail = this.extractFirstMessage((payload as Record<string, unknown>)['detail']);
    if (detail) return detail;
    const message = this.extractFirstMessage(payload);
    if (message) return message;

    return fallback;
  }
}
