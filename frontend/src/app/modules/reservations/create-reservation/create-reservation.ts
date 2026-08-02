import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, UntypedFormArray, UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ClientI } from '../../clients/client-model';
import { RateI, RoomI } from '../../rooms/room-model';
import { ReservationService } from '../../../services/reservation';
import { PackageI } from '../../packages/package-model';
import { CreateClient } from '../../clients/create-client/create-client';
import {
  ReservationDepositPayloadI,
  ReservationGuestPayloadI,
  ReservationPolicyI,
  ReservationRoomPayloadI,
  ReservationWritePayloadI
} from '../reservation-model';

@Component({
  selector: 'app-create-reservation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CreateClient],
  templateUrl: './create-reservation.html',
  styleUrls: ['./create-reservation.css']
})
export class CreateReservation implements OnChanges {
  @Input() clients: ClientI[] = [];
  @Input() origins: MasterDataI[] = [];
  @Input() documentTypes: MasterDataI[] = [];
  @Input() reservationPolicies: ReservationPolicyI[] = [];
  @Input() paymentMethods: MasterDataI[] = [];
  @Input() depositStatuses: MasterDataI[] = [];
  @Input() rooms: RoomI[] = [];
  @Input() rates: RateI[] = [];
  @Input() packages: PackageI[] = [];
  @Input() initialRoomId: number | null = null;
  @Input() initialCheckInMode = false;

  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  saving = false;
  errorMessage = '';
  warningMessage = '';
  submitted = false;
  showCreateClientModal = false;
  clientOptions: ClientI[] = [];

  reservationForm: UntypedFormGroup;

  constructor(
    private fb: UntypedFormBuilder,
    private reservationService: ReservationService
  ) {
    this.reservationForm = this.fb.group({
      client: [null, [Validators.required]],
      origin: [null, [Validators.required]],
      package: [null],
      expected_check_in: [this.formatDateForInput(new Date()), [Validators.required]],
      expected_check_out: [this.formatDateForInput(this.addDays(new Date(), 1)), [Validators.required]],
      promo_code: [''],
      total_discount: [0],
      notes: ['', [Validators.maxLength(1200)]],
      initial_deposit_amount: [0, [Validators.min(0)]],
      initial_deposit_payment_method: [null],
      initial_deposit_date: [this.formatDateForInput(new Date())],
      initial_deposit_reference: [''],
      initial_deposit_notes: [''],
      policy_lines: this.fb.array([]),
      room_lines: this.fb.array([]),
      guest_lines: this.fb.array([])
    });

    this.addPolicyLine();
    this.addRoomLine();
    this.addGuestLine();
    this.syncClientOptions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clients']) {
      this.syncClientOptions();
    }

    if (changes['origins']) {
      const originValue = this.reservationForm.get('origin')?.value;
      if (!originValue && this.origins.length) {
        this.reservationForm.patchValue({ origin: this.getDefaultOriginId() });
      }
    }

    if (changes['documentTypes']) {
      this.setDefaultDocumentTypeForGuests();
    }

    if (changes['paymentMethods']) {
      this.ensureDefaultInitialDepositPaymentMethod();
    }

    if (changes['rooms'] || changes['initialRoomId'] || changes['initialCheckInMode']) {
      this.applyInitialRoomSelection();
    }
  }

  get roomLines(): UntypedFormArray {
    return this.reservationForm.get('room_lines') as UntypedFormArray;
  }

  get policyLines(): UntypedFormArray {
    return this.reservationForm.get('policy_lines') as UntypedFormArray;
  }

  get guestLines(): UntypedFormArray {
    return this.reservationForm.get('guest_lines') as UntypedFormArray;
  }

  get availableRooms(): RoomI[] {
    return [...this.rooms].sort((a, b) => String(a.number).localeCompare(String(b.number), 'es-CO'));
  }

  get availableClients(): ClientI[] {
    return [...this.clientOptions].sort((a, b) =>
      this.buildClientSortLabel(a).localeCompare(this.buildClientSortLabel(b), 'es-CO')
    );
  }

  get availableDocumentTypes(): MasterDataI[] {
    return [...this.documentTypes].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
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

  get availablePaymentMethods(): MasterDataI[] {
    return [...this.paymentMethods]
      .filter((method) => method.is_active !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  get hasInitialDepositAmount(): boolean {
    return this.getInitialDepositAmount() > 0;
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
    this.roomLines.removeAt(index);

    if (this.roomLines.length === 0) {
      this.addRoomLine();
    }
  }

  addGuestLine(): void {
    this.guestLines.push(this.buildGuestLine());
  }

  removeGuestLine(index: number): void {
    if (index < 0 || index >= this.guestLines.length) return;
    this.guestLines.removeAt(index);

    if (this.guestLines.length === 0) {
      this.addGuestLine();
    }
  }

  submit(): void {
    this.submitted = true;
    this.errorMessage = '';
    this.warningMessage = '';

    if (this.reservationForm.invalid) {
      this.reservationForm.markAllAsTouched();
      this.policyLines.controls.forEach((control) => control.markAllAsTouched());
      this.roomLines.controls.forEach((control) => control.markAllAsTouched());
      this.guestLines.controls.forEach((control) => control.markAllAsTouched());
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

    const roomBuild = this.buildRoomPayloads();
    if (roomBuild.error) {
      this.errorMessage = roomBuild.error;
      return;
    }

    const guestBuild = this.buildGuestPayloads();
    if (guestBuild.error) {
      this.errorMessage = guestBuild.error;
      return;
    }

    const capacityWarning = this.validateRoomCapacityAgainstGuests(roomBuild.payloads, guestBuild.payloads.length);
    if (capacityWarning) {
      this.warningMessage = capacityWarning;
      return;
    }

    const initialDepositBuild = this.buildInitialDepositPayload();
    if (initialDepositBuild.error) {
      this.errorMessage = initialDepositBuild.error;
      return;
    }

    this.saving = true;

    const payload = this.buildReservationPayload(policyBuild.policyIds);

    this.reservationService.createReservation(payload).subscribe({
      next: (createdReservation) => {
        const roomRequests = roomBuild.payloads.map((roomPayload) =>
          this.reservationService.createReservationRoom({
            ...roomPayload,
            reservation: createdReservation.id
          })
        );

        const guestRequests = guestBuild.payloads.map((guestPayload) =>
          this.reservationService.createReservationGuest({
            ...guestPayload,
            reservation: createdReservation.id
          })
        );

        const createInitialDeposit = () => {
          if (!initialDepositBuild.payload) {
            this.saving = false;
            this.created.emit();
            this.closeDrawer();
            return;
          }

          this.reservationService
            .createReservationDeposit({
              ...initialDepositBuild.payload,
              reservation: createdReservation.id,
            })
            .subscribe({
              next: () => {
                this.saving = false;
                this.created.emit();
                this.closeDrawer();
              },
              error: (error) => {
                this.rollbackReservationCreation(createdReservation.id, error);
              },
            });
        };

        const createRooms = () => {
          if (!roomRequests.length) {
            createInitialDeposit();
            return;
          }

          forkJoin(roomRequests).subscribe({
            next: () => {
              createInitialDeposit();
            },
            error: (error) => {
              this.rollbackReservationCreation(createdReservation.id, error);
            }
          });
        };

        if (!guestRequests.length) {
          createRooms();
          return;
        }

        forkJoin(guestRequests).subscribe({
          next: () => {
            createRooms();
          },
          error: (error) => {
            this.rollbackReservationCreation(createdReservation.id, error);
          }
        });
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

  openCreateClientModal(): void {
    if (this.saving) return;
    this.showCreateClientModal = true;
  }

  closeCreateClientModal(): void {
    this.showCreateClientModal = false;
  }

  onClientCreated(client: ClientI): void {
    this.showCreateClientModal = false;

    const clientId = Number(client?.id || 0);
    if (!clientId || Number.isNaN(clientId)) return;

    this.upsertClientOption(client);
    this.reservationForm.patchValue({ client: clientId });
    this.reservationForm.get('client')?.markAsDirty();
    this.reservationForm.get('client')?.markAsTouched();
  }

  getClientOptionLabel(client: ClientI): string {
    const name = this.buildClientDisplayName(client);
    const documentNumber = this.toTrimmedString(client.document_number);
    if (documentNumber) {
      return `${name} - ${documentNumber}`;
    }
    return name;
  }

  trackByRoomLine(index: number): number {
    return index;
  }

  trackByPolicyLine(index: number): number {
    return index;
  }

  trackByGuestLine(index: number): number {
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

  isInitialDepositFieldInvalid(field: 'amount' | 'payment_method'): boolean {
    return this.getInitialDepositFieldError(field) !== '';
  }

  getInitialDepositFieldError(field: 'amount' | 'payment_method'): string {
    const amountControl = this.reservationForm.get('initial_deposit_amount');
    const paymentMethodControl = this.reservationForm.get('initial_deposit_payment_method');
    const amount = this.getInitialDepositAmount();

    if (field === 'amount') {
      if (
        amountControl &&
        this.shouldShowControlErrors(amountControl) &&
        amountControl.hasError('min')
      ) {
        return 'El abono inicial no puede ser negativo.';
      }
      return '';
    }

    if (field === 'payment_method') {
      if (!this.hasInitialDepositAmount) return '';
      if (
        paymentMethodControl &&
        this.shouldShowControlErrors(paymentMethodControl) &&
        !this.hasValue(paymentMethodControl.value)
      ) {
        return 'Selecciona el metodo de pago para registrar el abono.';
      }
      return '';
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

  isGuestFieldInvalid(index: number, field: 'document_type' | 'document_number' | 'first_name' | 'last_name'): boolean {
    return this.getGuestFieldError(index, field) !== '';
  }

  getGuestFieldError(index: number, field: 'document_type' | 'document_number' | 'first_name' | 'last_name'): string {
    const lineControl = this.guestLines.at(index);
    if (!lineControl || !this.shouldValidateGuestLine(lineControl)) return '';

    const documentTypeRaw = lineControl.get('document_type')?.value;
    const documentType = Number(documentTypeRaw || 0);
    const documentNumber = this.toTrimmedString(lineControl.get('document_number')?.value);
    const firstName = this.toTrimmedString(lineControl.get('first_name')?.value);
    const lastName = this.toTrimmedString(lineControl.get('last_name')?.value);

    if (field === 'document_type') {
      if (!documentType || Number.isNaN(documentType)) return 'Selecciona un tipo de documento valido.';
      return '';
    }

    if (field === 'document_number') {
      if (!documentNumber) return 'Ingresa el numero de documento.';
      if (documentType && !Number.isNaN(documentType)) {
        const documentKey = `${documentType}:${documentNumber.toUpperCase()}`;
        if (this.getDuplicateGuestDocumentKeys().has(documentKey)) {
          return 'Este documento ya esta cargado en otra fila.';
        }
      }
      return '';
    }

    if (field === 'first_name' && !firstName) {
      return 'Ingresa los nombres del huesped.';
    }

    if (field === 'last_name' && !lastName) {
      return 'Ingresa los apellidos del huesped.';
    }

    return '';
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

  private syncClientOptions(): void {
    const clientMap = new Map<number, ClientI>();

    for (const client of this.clients) {
      const clientId = Number(client.id || 0);
      if (!clientId || Number.isNaN(clientId)) continue;
      clientMap.set(clientId, client);
    }

    for (const client of this.clientOptions) {
      const clientId = Number(client.id || 0);
      if (!clientId || Number.isNaN(clientId) || clientMap.has(clientId)) continue;
      clientMap.set(clientId, client);
    }

    this.clientOptions = Array.from(clientMap.values());
  }

  private upsertClientOption(client: ClientI): void {
    const clientId = Number(client.id || 0);
    if (!clientId || Number.isNaN(clientId)) return;

    const clientIndex = this.clientOptions.findIndex((item) => Number(item.id || 0) === clientId);
    if (clientIndex >= 0) {
      this.clientOptions[clientIndex] = {
        ...this.clientOptions[clientIndex],
        ...client
      };
      return;
    }

    this.clientOptions = [...this.clientOptions, client];
  }

  private buildClientSortLabel(client: ClientI): string {
    return this.buildClientDisplayName(client).toUpperCase();
  }

  private buildClientDisplayName(client: ClientI): string {
    const fullName = this.toTrimmedString(client.full_name);
    if (fullName) return fullName;

    const firstName = this.toTrimmedString(client.first_name);
    const lastName = this.toTrimmedString(client.last_name);
    const composed = `${firstName} ${lastName}`.trim();
    if (composed) return composed;

    const clientId = Number(client.id || 0);
    if (clientId && !Number.isNaN(clientId)) {
      return `Cliente #${clientId}`;
    }

    return 'Cliente sin nombre';
  }

  private shouldShowControlErrors(control: AbstractControl): boolean {
    return control.touched || this.submitted;
  }

  private shouldValidateRoomLine(lineControl: AbstractControl): boolean {
    return this.hasRoomLineData(lineControl) && this.shouldShowControlErrors(lineControl);
  }

  private shouldValidateGuestLine(lineControl: AbstractControl): boolean {
    return this.hasGuestLineData(lineControl) && this.shouldShowControlErrors(lineControl);
  }

  private hasRoomLineData(lineControl: AbstractControl): boolean {
    const roomRaw = lineControl.get('room')?.value;
    return this.hasValue(roomRaw);
  }

  private hasGuestLineData(lineControl: AbstractControl): boolean {
    const documentNumber = this.toTrimmedString(lineControl.get('document_number')?.value);
    const firstName = this.toTrimmedString(lineControl.get('first_name')?.value);
    const lastName = this.toTrimmedString(lineControl.get('last_name')?.value);

    const hasCoreData = !!(documentNumber || firstName || lastName);
    const hasOptionalData = !!(
      lineControl.get('birth_date')?.value ||
      this.toTrimmedString(lineControl.get('nationality')?.value) ||
      this.toTrimmedString(lineControl.get('blood_type')?.value) ||
      this.toTrimmedString(lineControl.get('emergency_contact_name')?.value) ||
      this.toTrimmedString(lineControl.get('emergency_contact_phone')?.value)
    );

    return hasCoreData || hasOptionalData;
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

  private getDuplicateGuestDocumentKeys(): Set<string> {
    const documentUsage = new Map<string, number>();

    for (const lineControl of this.guestLines.controls) {
      if (!this.hasGuestLineData(lineControl)) continue;

      const documentType = Number(lineControl.get('document_type')?.value || 0);
      const documentNumber = this.toTrimmedString(lineControl.get('document_number')?.value).toUpperCase();

      if (!documentType || Number.isNaN(documentType) || !documentNumber) {
        continue;
      }

      const documentKey = `${documentType}:${documentNumber}`;
      documentUsage.set(documentKey, (documentUsage.get(documentKey) ?? 0) + 1);
    }

    const duplicates = new Set<string>();
    for (const [documentKey, count] of documentUsage) {
      if (count > 1) {
        duplicates.add(documentKey);
      }
    }

    return duplicates;
  }

  private hasValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  private toTrimmedString(value: unknown): string {
    return String(value || '').trim();
  }

  private buildRoomLine(): UntypedFormGroup {
    return this.fb.group({
      room: [null],
    });
  }

  private buildPolicyLine(initialPolicyId: number | null = null): UntypedFormGroup {
    return this.fb.group({
      policy: [initialPolicyId]
    });
  }

  private buildGuestLine(): UntypedFormGroup {
    return this.fb.group({
      document_type: [this.getDefaultDocumentTypeId()],
      document_number: [''],
      first_name: [''],
      last_name: [''],
      birth_date: [''],
      nationality: [''],
      blood_type: [''],
      emergency_contact_name: [''],
      emergency_contact_phone: ['']
    });
  }

  private buildReservationPayload(policyIds: number[]): ReservationWritePayloadI {
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

  private buildInitialDepositPayload(): {
    payload?: Omit<ReservationDepositPayloadI, 'reservation'>;
    error?: string;
  } {
    const raw = this.reservationForm.getRawValue();
    const amount = this.getInitialDepositAmount();

    if (amount < 0) {
      return { error: 'El abono inicial no puede ser negativo.' };
    }

    if (amount <= 0) {
      return {};
    }

    const paymentMethod = Number(raw.initial_deposit_payment_method || 0);
    if (!paymentMethod || Number.isNaN(paymentMethod)) {
      return { error: 'Debes seleccionar un metodo de pago para el abono inicial.' };
    }

    const depositDateValue = this.toTrimmedString(raw.initial_deposit_date);
    const depositDate = depositDateValue || this.formatDateForInput(new Date());
    if (!this.parseDate(depositDate)) {
      return { error: 'La fecha del abono inicial no es valida.' };
    }

    const defaultStatusId = this.getDefaultDepositStatusId();

    return {
      payload: {
        deposit_date: depositDate,
        amount,
        payment_method: paymentMethod,
        reference: this.toTrimmedString(raw.initial_deposit_reference) || null,
        status: defaultStatusId ?? undefined,
        notes: this.toTrimmedString(raw.initial_deposit_notes) || null,
      },
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

  private buildRoomPayloads(): { payloads: ReservationRoomPayloadI[]; error?: string } {
    const payloads: ReservationRoomPayloadI[] = [];
    const usedRooms = new Set<number>();
    const checkIn = this.parseDate(this.reservationForm.get('expected_check_in')?.value);
    const checkOut = this.parseDate(this.reservationForm.get('expected_check_out')?.value);
    const selectedPackage = this.getSelectedPackage();

    for (const lineControl of this.roomLines.controls) {
      const raw = lineControl.getRawValue();
      const roomRaw = raw['room'];

      const hasRoom = roomRaw !== null && roomRaw !== undefined && `${roomRaw}`.trim() !== '';
      const hasData = hasRoom;

      if (!hasData) {
        continue;
      }

      const room = Number(roomRaw);

      if (!room || Number.isNaN(room)) {
        return { payloads: [], error: 'Debes seleccionar una habitacion valida en cada fila cargada.' };
      }

      const selectedRoom = this.findRoomById(room);
      if (!selectedRoom) {
        return { payloads: [], error: 'La habitacion seleccionada ya no esta disponible.' };
      }

      if (usedRooms.has(room)) {
        return { payloads: [], error: 'No puedes repetir la misma habitacion en una misma reserva.' };
      }
      usedRooms.add(room);

      if (checkIn && checkOut && this.hasRoomActiveReservationOverlap(selectedRoom, checkIn, checkOut)) {
        const start = this.formatDateLabel(selectedRoom.active_reservation?.expected_check_in);
        const end = this.formatDateLabel(selectedRoom.active_reservation?.expected_check_out);
        return {
          payloads: [],
          error: `La habitacion ${selectedRoom.number} tiene una reserva activa que se cruza con las fechas seleccionadas (${start} a ${end}).`
        };
      }

      if (selectedPackage?.room_type) {
        const requiredRoomType = Number(selectedPackage.room_type);
        const roomType = Number(selectedRoom.room_type || 0);
        if (!roomType || roomType !== requiredRoomType) {
          return {
            payloads: [],
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
            payloads: [],
            error: (
              `No existe una tarifa activa para la habitacion ${selectedRoom.number} ` +
              'en el rango de fechas seleccionado.'
            )
          };
        }
      }

      payloads.push({
        reservation: 0,
        room,
      });
    }

    return { payloads };
  }

  private buildGuestPayloads(): { payloads: ReservationGuestPayloadI[]; error?: string } {
    const payloads: ReservationGuestPayloadI[] = [];
    const usedDocuments = new Set<string>();

    for (const lineControl of this.guestLines.controls) {
      const raw = lineControl.getRawValue();

      const documentTypeRaw = raw['document_type'];
      const documentNumberRaw = String(raw['document_number'] || '').trim();
      const firstNameRaw = String(raw['first_name'] || '').trim();
      const lastNameRaw = String(raw['last_name'] || '').trim();

      const hasCoreData = !!(documentNumberRaw || firstNameRaw || lastNameRaw);
      const hasOptionalData = !!(
        raw['birth_date'] ||
        String(raw['nationality'] || '').trim() ||
        String(raw['blood_type'] || '').trim() ||
        String(raw['emergency_contact_name'] || '').trim() ||
        String(raw['emergency_contact_phone'] || '').trim()
      );

      if (!hasCoreData && !hasOptionalData) {
        continue;
      }

      const documentType = Number(documentTypeRaw || 0);

      if (!documentType || Number.isNaN(documentType)) {
        return { payloads: [], error: 'Cada huesped debe tener un tipo de documento valido.' };
      }

      if (!documentNumberRaw) {
        return { payloads: [], error: 'Cada huesped debe tener numero de documento.' };
      }

      if (!firstNameRaw || !lastNameRaw) {
        return { payloads: [], error: 'Cada huesped debe tener nombre y apellido.' };
      }

      const documentKey = `${documentType}:${documentNumberRaw.toUpperCase()}`;
      if (usedDocuments.has(documentKey)) {
        return { payloads: [], error: 'No puedes repetir el mismo documento en los huespedes de una reserva.' };
      }
      usedDocuments.add(documentKey);

      payloads.push({
        reservation: 0,
        document_type: documentType,
        document_number: documentNumberRaw,
        first_name: firstNameRaw,
        last_name: lastNameRaw,
        birth_date: raw['birth_date'] ? String(raw['birth_date']) : null,
        nationality: String(raw['nationality'] || '').trim() || null,
        blood_type: String(raw['blood_type'] || '').trim() || null,
        emergency_contact_name: String(raw['emergency_contact_name'] || '').trim() || null,
        emergency_contact_phone: String(raw['emergency_contact_phone'] || '').trim() || null
      });
    }

    return { payloads };
  }

  private validateRoomCapacityAgainstGuests(roomPayloads: ReservationRoomPayloadI[], guestsCount: number): string {
    if (guestsCount <= 0 || !roomPayloads.length) return '';

    const totalCapacity = roomPayloads.reduce((sum, roomPayload) => {
      const room = this.findRoomById(roomPayload.room);
      const capacity = Number(room?.room_type_capacity || 0);
      if (!Number.isFinite(capacity) || capacity <= 0) return sum;
      return sum + capacity;
    }, 0);

    if (totalCapacity > 0 && guestsCount > totalCapacity) {
      return (
        `Advertencia: estas intentando alojar ${guestsCount} huesped(es), ` +
        `pero la capacidad total seleccionada es ${totalCapacity}. ` +
        'Agrega mas habitaciones o reduce la cantidad de huespedes.'
      );
    }

    return '';
  }

  private rollbackReservationCreation(reservationId: number, sourceError: unknown): void {
    this.reservationService.deleteReservation(reservationId).subscribe({
      next: () => {
        this.saving = false;
        this.errorMessage = `${this.extractErrorMessage(sourceError)} Se revirtio la reserva incompleta automaticamente.`;
      },
      error: () => {
        this.saving = false;
        this.errorMessage = `${this.extractErrorMessage(sourceError)} La reserva parcial no se pudo revertir automaticamente.`;
      }
    });
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

  private getInitialDepositAmount(): number {
    const raw = this.reservationForm.get('initial_deposit_amount')?.value;
    const parsed = Number(raw || 0);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDefaultOriginId(): number | null {
    const preferredCodes = ['WEB', 'RECEPCION'];
    for (const code of preferredCodes) {
      const match = this.origins.find((origin) => this.normalizeCode(origin.code) === code);
      if (match) return match.id;
    }
    return this.origins[0]?.id ?? null;
  }

  private getDefaultDepositStatusId(): number | null {
    const preferredCodes = ['VALIDADO', 'PENDIENTE'];
    for (const code of preferredCodes) {
      const match = this.depositStatuses.find((status) => this.normalizeCode(status.code) === code);
      if (match?.id) return Number(match.id);
    }
    const firstStatus = this.depositStatuses[0];
    if (!firstStatus?.id) return null;
    const fallbackId = Number(firstStatus.id);
    return Number.isNaN(fallbackId) ? null : fallbackId;
  }

  private getDefaultDocumentTypeId(): number | null {
    const preferredCodes = ['CC', 'CE', 'DNI', 'PASAPORTE'];
    for (const code of preferredCodes) {
      const match = this.documentTypes.find((doc) => this.normalizeCode(doc.code) === code);
      if (match) return match.id;
    }
    return this.documentTypes[0]?.id ?? null;
  }

  private setDefaultDocumentTypeForGuests(): void {
    const defaultDocumentTypeId = this.getDefaultDocumentTypeId();
    if (!defaultDocumentTypeId) return;

    for (const guestControl of this.guestLines.controls) {
      const currentValue = guestControl.get('document_type')?.value;
      if (!currentValue) {
        guestControl.get('document_type')?.setValue(defaultDocumentTypeId);
      }
    }
  }

  private ensureDefaultInitialDepositPaymentMethod(): void {
    const paymentMethodControl = this.reservationForm.get('initial_deposit_payment_method');
    if (!paymentMethodControl) return;

    const currentValue = Number(paymentMethodControl.value || 0);
    if (currentValue > 0) return;

    const firstMethod = this.availablePaymentMethods[0];
    if (!firstMethod?.id) return;

    paymentMethodControl.setValue(firstMethod.id);
  }

  private applyInitialRoomSelection(): void {
    const targetRoomId = Number(this.initialRoomId || 0);
    if (!targetRoomId || !this.rooms.some((room) => room.id === targetRoomId)) return;

    if (!this.roomLines.length) {
      this.addRoomLine();
    }

    const firstLine = this.roomLines.at(0) as UntypedFormGroup;
    if (firstLine?.get('room')) {
      firstLine.get('room')?.setValue(targetRoomId);
      firstLine.get('room')?.markAsDirty();
    }

    if (this.initialCheckInMode) {
      const today = new Date();
      this.reservationForm.patchValue({
        expected_check_in: this.formatDateForInput(today),
        expected_check_out: this.formatDateForInput(this.addDays(today, 1))
      });
    }
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

  private hasRoomActiveReservationOverlap(room: RoomI, checkIn: Date, checkOut: Date): boolean {
    const activeReservation = room.active_reservation;
    if (!activeReservation) return false;

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
    const fallback = 'No se pudo crear la reserva. Verifica los datos e intenta nuevamente.';

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

