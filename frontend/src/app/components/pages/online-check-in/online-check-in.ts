import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  OnlineCheckInExistingGuest,
  OnlineCheckInHolder,
  OnlineCheckInLookupResponse,
  OnlineCheckInResponse,
  OnlineCheckInService,
} from '../../../services/online-check-in';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer';
import { PublicHeaderComponent } from '../../shared/public-header/public-header';

type ReservationCodeControlName =
  | 'reservationCode'
  | 'documentType'
  | 'documentNumber';

type GuestCheckInControlName =
  | 'email'
  | 'phone'
  | 'arrivalTime'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'residenceAddress'
  | 'travelReason'
  | 'notes'
  | 'signature'
  | 'confirmsGuestData'
  | 'acceptsStayRules'
  | 'acceptsDataPolicy';

type GuestLineControlName =
  | 'firstName'
  | 'lastName'
  | 'documentType'
  | 'documentNumber'
  | 'birthDate'
  | 'nationality';

interface SelectOption {
  value: string;
  label: string;
}

interface GuestLinePrefill {
  firstName?: string;
  lastName?: string;
  documentType?: string;
  documentNumber?: string;
  birthDate?: string | null;
  nationality?: string | null;
}

type GuestLineGroup = FormGroup<{
  firstName: FormControl<string>;
  lastName: FormControl<string>;
  documentType: FormControl<string>;
  documentNumber: FormControl<string>;
  birthDate: FormControl<string>;
  nationality: FormControl<string>;
}>;

type CheckInStep = 2 | 3 | 4;

@Component({
  selector: 'app-online-check-in',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PublicHeaderComponent,
    PublicFooterComponent,
  ],
  templateUrl: './online-check-in.html',
  styleUrl: './online-check-in.css',
})
export class OnlineCheckInPage {

  private readonly formBuilder = inject(FormBuilder);
  private readonly onlineCheckInService = inject(OnlineCheckInService);

  readonly maxBirthDate = this.formatDateInput(new Date());

  readonly minBirthDate = this.formatDateInput(
    new Date(new Date().setFullYear(new Date().getFullYear() - 130))
  );

  readonly documentTypes: SelectOption[] = [
    {
      value: 'CC',
      label: 'Cédula de ciudadanía',
    },
    {
      value: 'CE',
      label: 'Cédula de extranjería',
    },
    {
      value: 'PASAPORTE',
      label: 'Pasaporte',
    },
    {
      value: 'DNI',
      label: 'DNI',
    },
  ];

  readonly arrivalWindows: SelectOption[] = [
    {
      value: '12:00-14:00',
      label: '12:00 p. m. - 2:00 p. m.',
    },
    {
      value: '14:00-16:00',
      label: '2:00 p. m. - 4:00 p. m.',
    },
    {
      value: '16:00-18:00',
      label: '4:00 p. m. - 6:00 p. m.',
    },
    {
      value: '18:00-21:00',
      label: '6:00 p. m. - 9:00 p. m.',
    },
    {
      value: '21:00+',
      label: 'Después de las 9:00 p. m.',
    },
  ];

  readonly reservationForm =
    this.formBuilder.nonNullable.group({
      reservationCode: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(30),
          Validators.pattern(/^[A-Za-z0-9-]+$/),
        ],
      ],
      documentType: [
        'CC',
        Validators.required,
      ],
      documentNumber: [
        '',
        [
          Validators.required,
          Validators.minLength(5),
          Validators.maxLength(40),
        ],
      ],
    });

  readonly guestLines: FormArray<GuestLineGroup> =
    this.formBuilder.array<GuestLineGroup>([]);

  readonly guestForm =
    this.formBuilder.nonNullable.group({
      email: [
        '',
        [
          Validators.required,
          Validators.email,
        ],
      ],
      phone: [
        '',
        [
          Validators.required,
          Validators.minLength(7),
        ],
      ],
      arrivalTime: [
        '',
        Validators.required,
      ],
      emergencyContactName: [
        '',
      ],
      emergencyContactPhone: [
        '',
      ],
      residenceAddress: [''],
      travelReason: [''],
      notes: [''],
      signature: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          this.signatureMatchesHolderValidator.bind(this),
        ],
      ],
      confirmsGuestData: [
        false,
        Validators.requiredTrue,
      ],
      acceptsStayRules: [
        false,
        Validators.requiredTrue,
      ],
      acceptsDataPolicy: [
        false,
        Validators.requiredTrue,
      ],
    });

  codeConfirmed = false;
  submitted = false;
  lookingUp = false;
  lookupError = '';
  submitting = false;
  submitError = '';
  reservationSummary: OnlineCheckInLookupResponse | null = null;
  confirmation: OnlineCheckInResponse | null = null;
  checkInStep: CheckInStep = 2;

  copyFeedback = '';
  holderLoadFeedback = '';

  private copyFeedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private holderLoadFeedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  get reservationCodeLabel(): string {

    return this.normalizeReservationCode(
      this.reservationForm.controls.reservationCode.value
    );
  }

  get clipboardSupported(): boolean {

    return Boolean(
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    );
  }

  get reservationHolder(): OnlineCheckInHolder | null {

    return this.reservationSummary?.holder ?? null;
  }

  get primaryGuestLine(): GuestLineGroup | null {

    return this.guestLines.at(0) ?? null;
  }

  get companionIndexes(): number[] {

    return Array.from(
      { length: Math.max(this.guestLines.length - 1, 0) },
      (_, index) => index + 1
    );
  }

  get completedGuestCount(): number {

    return this.guestLines.controls.filter((line) => line.valid).length;
  }

  get companionCount(): number {

    return Math.max(this.guestLines.length - 1, 0);
  }

  get remainingCompanionSlots(): number {

    return Math.max(this.guestLines.length - 1 - this.completedCompanionCount, 0);
  }

  get completedCompanionCount(): number {

    return this.guestLines.controls
      .slice(1)
      .filter((line) => line.valid)
      .length;
  }

  get reservationDateRange(): string {

    const checkIn =
      this.reservationSummary?.expected_check_in ||
      this.confirmation?.expected_check_in;

    const checkOut =
      this.reservationSummary?.expected_check_out ||
      this.confirmation?.expected_check_out;

    if (!checkIn || !checkOut) {
      return 'Fechas por confirmar';
    }

    return `${this.formatDisplayDate(checkIn, false)} - ${this.formatDisplayDate(checkOut, true)}`;
  }

  get reservationRoomLabel(): string {

    return this.reservationSummary?.room_summary || 'Habitacion asignada por el hotel';
  }

  get reservationStatusBadge(): string {

    const status =
      this.reservationSummary?.status_label?.trim() || 'Confirmada';

    const paymentLabel =
      this.reservationSummary?.payment_status_label?.trim();

    if (this.reservationSummary?.payment_status_code === 'PAGADO') {
      return `Reserva ${status.toLowerCase()} y pagada`;
    }

    if (paymentLabel && paymentLabel !== 'Sin cargos') {
      return `Reserva ${status.toLowerCase()} - ${paymentLabel.toLowerCase()}`;
    }

    return `Reserva ${status.toLowerCase()}`;
  }

  get arrivalTimeLabel(): string {

    const value =
      this.guestForm.controls.arrivalTime.value;

    return this.arrivalWindows.find((option) => option.value === value)?.label || 'Pendiente';
  }

  get holderFullName(): string {

    const holder =
      this.reservationHolder;

    if (!holder) {
      return '';
    }

    return `${holder.first_name || ''} ${holder.last_name || ''}`.trim();
  }

  get primaryGuestFullName(): string {

    return this.getGuestFullName(0) || 'Huesped principal';
  }

  get passCode(): string {

    const reservationId =
      this.confirmation?.reservation_id ||
      this.reservationSummary?.reservation_id;

    return reservationId ? `PASE-${reservationId}` : 'PASE';
  }

  continueWithCode(): void {

    if (this.lookingUp) {
      return;
    }

    this.reservationForm.markAllAsTouched();
    this.lookupError = '';

    if (this.reservationForm.invalid) {
      return;
    }

    const codeValues =
      this.reservationForm.getRawValue();

    this.lookingUp = true;

    this.onlineCheckInService
      .lookupOnlineCheckIn({
        reservationCode: this.reservationCodeLabel,
        documentType: codeValues.documentType,
        documentNumber: codeValues.documentNumber,
      })
      .subscribe({
        next: (response) => {
          this.lookingUp = false;

          if (!response.eligible) {
            this.lookupError =
              response.eligible_reason ||
              'Esta reserva no está disponible para check-in online.';
            return;
          }

          this.reservationSummary = response;
          this.confirmation = null;
          this.submitError = '';
          this.resetGuestFormFields();
          this.buildGuestLines(response, codeValues.documentNumber);
          this.checkInStep = 2;
          this.holderLoadFeedback = '';
          this.codeConfirmed = true;
          this.submitted = false;
          this.guestForm.controls.signature.updateValueAndValidity({
            emitEvent: false,
          });

          this.scrollToFlow();
        },
        error: (error) => {
          this.lookingUp = false;
          this.lookupError = this.extractErrorMessage(error);
        },
      });
  }

  submitCheckIn(): void {

    if (this.submitting) {
      return;
    }

    if (!this.codeConfirmed) {
      this.continueWithCode();
      return;
    }

    this.guestLines.markAllAsTouched();
    this.guestForm.markAllAsTouched();
    this.submitError = '';

    if (this.guestLines.invalid || this.guestForm.invalid) {
      this.checkInStep = this.getFirstInvalidStep();
      this.scrollToFlow();
      return;
    }

    const guestValues =
      this.guestForm.getRawValue();

    const guests =
      this.guestLines.controls.map((line) => line.getRawValue());

    const emergencyContactName =
      guestValues.emergencyContactName?.trim() || this.primaryGuestFullName;

    const emergencyContactPhone =
      guestValues.emergencyContactPhone?.trim() || guestValues.phone;

    this.submitting = true;

    this.onlineCheckInService
      .submitOnlineCheckIn({
        reservationCode: this.reservationCodeLabel,
        guests,
        email: guestValues.email,
        phone: guestValues.phone,
        arrivalTime: guestValues.arrivalTime,
        emergencyContactName,
        emergencyContactPhone,
        signature: guestValues.signature,
        notes: this.buildOnlineCheckInNotes(),
        acceptsDataPolicy: guestValues.acceptsDataPolicy,
      })
      .subscribe({
        next: (response) => {
          this.submitting = false;
          this.submitted = true;
          this.confirmation = response;

          const prefersReducedMotion =
            this.prefersReducedMotion();

          window.setTimeout(() => {
            document
              .getElementById('online-check-in-confirmation')
              ?.scrollIntoView({
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
                block: 'center',
              });
          });
        },
        error: (error) => {
          this.submitting = false;
          this.submitError = this.extractErrorMessage(error);

          const prefersReducedMotion =
            this.prefersReducedMotion();

          window.setTimeout(() => {
            document
              .getElementById('online-check-in-error')
              ?.scrollIntoView({
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
                block: 'center',
              });
          });
        },
      });
  }

  async copyReservationCode(): Promise<void> {

    const code =
      this.reservationCodeLabel;

    if (
      !code ||
      !this.clipboardSupported
    ) {
      return;
    }

    try {

      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard write can fail (permission denied, insecure context,
      // etc.). The code stays visible as plain text either way, so there is
      // nothing to recover from here — just skip the feedback.
      return;
    }

    this.copyFeedback = 'Código copiado.';

    if (this.copyFeedbackTimeoutId !== null) {
      clearTimeout(this.copyFeedbackTimeoutId);
    }

    this.copyFeedbackTimeoutId = setTimeout(() => {
      this.copyFeedback = '';
      this.copyFeedbackTimeoutId = null;
    }, 2500);
  }

  resetFlow(): void {

    const hasEnteredGuestData =
      this.guestForm.dirty || this.guestLines.dirty;

    if (
      hasEnteredGuestData &&
      !window.confirm('Vas a perder los datos que ya ingresaste. ¿Deseas continuar?')
    ) {
      return;
    }

    this.codeConfirmed = false;
    this.submitted = false;
    this.lookingUp = false;
    this.lookupError = '';
    this.submitting = false;
    this.submitError = '';
    this.reservationSummary = null;
    this.confirmation = null;
    this.checkInStep = 2;
    this.holderLoadFeedback = '';
    if (this.holderLoadFeedbackTimeoutId !== null) {
      clearTimeout(this.holderLoadFeedbackTimeoutId);
      this.holderLoadFeedbackTimeoutId = null;
    }
    this.guestLines.clear();
    this.reservationForm.reset({
      reservationCode: '',
      documentType: 'CC',
      documentNumber: '',
    });
    this.guestForm.reset({
      email: '',
      phone: '',
      arrivalTime: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      residenceAddress: '',
      travelReason: '',
      notes: '',
      signature: '',
      confirmsGuestData: false,
      acceptsStayRules: false,
      acceptsDataPolicy: false,
    });
  }

  isReservationInvalid(controlName: ReservationCodeControlName): boolean {

    const control =
      this.reservationForm.controls[controlName];

    return control.invalid && (control.dirty || control.touched);
  }

  isGuestInvalid(controlName: GuestCheckInControlName): boolean {

    const control =
      this.guestForm.controls[controlName];

    return control.invalid && (control.dirty || control.touched);
  }

  isGuestLineInvalid(index: number, controlName: GuestLineControlName): boolean {

    const control =
      this.guestLines.at(index)?.controls[controlName];

    return Boolean(
      control &&
      control.invalid &&
      (control.dirty || control.touched)
    );
  }

  getReservationError(controlName: ReservationCodeControlName): string {

    const control =
      this.reservationForm.controls[controlName];

    if (control.hasError('required')) {
      return this.getRequiredReservationMessage(controlName);
    }

    if (control.hasError('minlength')) {
      return controlName === 'reservationCode'
        ? 'El código debe tener al menos 4 caracteres.'
        : 'El documento debe tener al menos 5 caracteres.';
    }

    if (control.hasError('maxlength')) {
      return 'El dato ingresado es demasiado largo.';
    }

    if (control.hasError('pattern')) {
      return 'Usa solo letras, números o guiones.';
    }

    return '';
  }

  getGuestError(controlName: GuestCheckInControlName): string {

    const control =
      this.guestForm.controls[controlName];

    if (control.hasError('required') || control.hasError('requiredTrue')) {
      return this.getRequiredGuestMessage(controlName);
    }

    if (control.hasError('email')) {
      return 'Ingresa un correo válido.';
    }

    if (control.hasError('minlength')) {
      return this.getMinLengthGuestMessage(controlName);
    }

    if (control.hasError('signatureMismatch')) {
      return `La firma debe coincidir con el titular: ${this.holderFullName}.`;
    }

    if (control.hasError('maxlength')) {
      return 'El dato ingresado es demasiado largo.';
    }

    return '';
  }

  getGuestLineError(index: number, controlName: GuestLineControlName): string {

    const control =
      this.guestLines.at(index)?.controls[controlName];

    if (!control) {
      return '';
    }

    if (control.hasError('required')) {
      return this.getRequiredGuestLineMessage(controlName);
    }

    if (control.hasError('minlength')) {
      return this.getMinLengthGuestLineMessage(controlName);
    }

    if (control.hasError('maxlength')) {
      return 'El dato ingresado es demasiado largo.';
    }

    if (control.hasError('birthDateRange')) {
      return 'Ingresa una fecha de nacimiento válida.';
    }

    return '';
  }

  useTitularDocumentForFirstGuest(): void {

    const titularLine =
      this.guestLines.at(0);

    if (!titularLine) {
      return;
    }

    titularLine.patchValue({
      documentType: this.reservationForm.controls.documentType.value,
      documentNumber: this.reservationForm.controls.documentNumber.value,
    });
  }

  loadReservationHolderAsPrimaryGuest(): void {

    const holder =
      this.reservationHolder;

    const primaryLine =
      this.primaryGuestLine;

    if (!holder || !primaryLine) {
      return;
    }

    primaryLine.patchValue({
      firstName: holder.first_name || '',
      lastName: holder.last_name || '',
      documentType: holder.document_type || this.reservationForm.controls.documentType.value,
      documentNumber: holder.document_number || this.reservationForm.controls.documentNumber.value,
      nationality: holder.nationality || '',
    });

    this.guestForm.patchValue({
      email: holder.email || '',
      phone: holder.phone || '',
    });

    this.holderLoadFeedback = 'Datos del titular cargados.';

    if (this.holderLoadFeedbackTimeoutId !== null) {
      clearTimeout(this.holderLoadFeedbackTimeoutId);
    }

    this.holderLoadFeedbackTimeoutId = setTimeout(() => {
      this.holderLoadFeedback = '';
      this.holderLoadFeedbackTimeoutId = null;
    }, 2500);
  }

  setGuestDocumentType(index: number, documentType: string): void {

    const guestLine =
      this.guestLines.at(index);

    if (!guestLine) {
      return;
    }

    guestLine.controls.documentType.setValue(documentType);
    guestLine.controls.documentType.markAsDirty();
  }

  goToPrimaryGuest(): void {

    this.checkInStep = 2;
    this.scrollToFlow();
  }

  continueToCompanions(): void {

    this.markPrimaryGuestStepAsTouched();

    if (!this.isPrimaryGuestStepValid()) {
      return;
    }

    this.checkInStep = 3;
    this.scrollToFlow();
  }

  continueToReview(): void {

    this.markCompanionStepAsTouched();

    if (this.guestLines.invalid) {
      return;
    }

    this.checkInStep = 4;
    this.scrollToFlow();
  }

  isGuestLineComplete(index: number): boolean {

    return Boolean(this.guestLines.at(index)?.valid);
  }

  getGuestFullName(index: number): string {

    const guestLine =
      this.guestLines.at(index);

    if (!guestLine) {
      return '';
    }

    const value =
      guestLine.getRawValue();

    return `${value.firstName || ''} ${value.lastName || ''}`.trim();
  }

  getGuestDocumentLabel(index: number): string {

    const guestLine =
      this.guestLines.at(index);

    if (!guestLine) {
      return 'Documento pendiente';
    }

    const value =
      guestLine.getRawValue();

    if (!value.documentNumber) {
      return 'Documento pendiente';
    }

    return `${this.shortDocumentLabel(value.documentType)} ${value.documentNumber}`;
  }

  getGuestReviewMeta(index: number): string {

    const guestLine =
      this.guestLines.at(index);

    if (!guestLine) {
      return 'Datos pendientes';
    }

    const value =
      guestLine.getRawValue();

    const details = [
      value.documentNumber ? this.getGuestDocumentLabel(index) : 'Documento pendiente',
      value.nationality ? value.nationality : 'Nacionalidad pendiente',
      index === 0 ? 'Titular' : 'Acompanante',
    ];

    return details.join(' · ');
  }

  shortDocumentLabel(value: string): string {

    const normalized =
      (value || '').toUpperCase();

    const labels: Record<string, string> = {
      CC: 'CC',
      CE: 'CE',
      PASAPORTE: 'Pasaporte',
      DNI: 'DNI',
    };

    return labels[normalized] || normalized || 'Doc.';
  }

  downloadCheckInReceipt(): void {

    const receiptLines = [
      'Comprobante de check-in online',
      `Pase de llegada: ${this.passCode}`,
      `Reserva: ${this.reservationCodeLabel}`,
      `Hotel: ${this.confirmation?.hotel_name || this.reservationSummary?.hotel_name || ''}`,
      `Habitacion: ${this.reservationRoomLabel}`,
      `Fechas: ${this.reservationDateRange}`,
      `Huespedes registrados: ${this.confirmation?.guests?.length || this.completedGuestCount} de ${this.guestLines.length}`,
      `Llegada estimada: ${this.arrivalTimeLabel}`,
    ];

    const blob =
      new Blob([receiptLines.join('\n')], { type: 'text/plain;charset=utf-8' });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = url;
    link.download = `check-in-${this.reservationCodeLabel || 'reserva'}.txt`;
    link.click();

    URL.revokeObjectURL(url);
  }

  trackByValue(_: number, option: SelectOption): string {

    return option.value;
  }

  trackByIndex(index: number): number {

    return index;
  }

  trackByGuestLine(index: number): number {

    return index;
  }

  private buildGuestLines(
    response: OnlineCheckInLookupResponse,
    titularDocumentNumber: string
  ): void {

    this.guestLines.clear();

    const totalGuests =
      Math.max(response.total_guests, 1);

    const remainingExistingGuests =
      [...response.existing_guests];

    const titularIndex =
      remainingExistingGuests.findIndex(
        (guest) =>
          this.normalizeDocumentNumber(guest.document_number) ===
          this.normalizeDocumentNumber(titularDocumentNumber)
      );

    const titularGuest =
      titularIndex >= 0
        ? remainingExistingGuests.splice(titularIndex, 1)[0]
        : null;

    if (titularGuest) {
      this.patchSharedFieldsFromExistingGuest(titularGuest);
    }

    for (let index = 0; index < totalGuests; index++) {

      if (index === 0) {
        this.guestLines.push(
          this.buildGuestLine(
            titularGuest
              ? this.toGuestLinePrefill(titularGuest)
              : undefined
          )
        );
        continue;
      }

      const existing =
        remainingExistingGuests.shift();

      this.guestLines.push(
        this.buildGuestLine(
          existing ? this.toGuestLinePrefill(existing) : undefined
        )
      );
    }
  }

  private buildGuestLine(prefill?: GuestLinePrefill): GuestLineGroup {

    return this.formBuilder.nonNullable.group({
      firstName: [
        prefill?.firstName ?? '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      lastName: [
        prefill?.lastName ?? '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
        ],
      ],
      documentType: [
        prefill?.documentType ?? 'CC',
        Validators.required,
      ],
      documentNumber: [
        prefill?.documentNumber ?? '',
        [
          Validators.required,
          Validators.minLength(5),
          Validators.maxLength(40),
        ],
      ],
      birthDate: [
        prefill?.birthDate ?? '',
        [
          Validators.required,
          this.birthDateRangeValidator,
        ],
      ],
      nationality: [
        prefill?.nationality ?? '',
        [
          Validators.required,
          Validators.minLength(3),
        ],
      ],
    });
  }

  private toGuestLinePrefill(guest: OnlineCheckInExistingGuest): GuestLinePrefill {

    return {
      firstName: guest.first_name,
      lastName: guest.last_name,
      documentType: guest.document_type,
      documentNumber: guest.document_number,
      birthDate: guest.birth_date ?? '',
      nationality: guest.nationality ?? '',
    };
  }

  private resetGuestFormFields(): void {

    this.guestForm.reset({
      email: '',
      phone: '',
      arrivalTime: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      residenceAddress: '',
      travelReason: '',
      notes: '',
      signature: '',
      confirmsGuestData: false,
      acceptsStayRules: false,
      acceptsDataPolicy: false,
    });
  }

  private patchSharedFieldsFromExistingGuest(guest: OnlineCheckInExistingGuest): void {

    this.guestForm.patchValue({
      email: guest.email ?? '',
      phone: guest.phone ?? '',
      arrivalTime: guest.arrival_time_window ?? '',
      emergencyContactName: guest.emergency_contact_name ?? '',
      emergencyContactPhone: guest.emergency_contact_phone ?? '',
      notes: guest.notes ?? '',
      acceptsDataPolicy: guest.accepts_data_policy,
    });
  }

  private markPrimaryGuestStepAsTouched(): void {

    this.primaryGuestLine?.markAllAsTouched();
    this.guestForm.controls.email.markAsTouched();
    this.guestForm.controls.phone.markAsTouched();
    this.guestForm.controls.arrivalTime.markAsTouched();
  }

  private markCompanionStepAsTouched(): void {

    this.guestLines.controls.slice(1).forEach((guestLine) => {
      guestLine.markAllAsTouched();
    });
  }

  private isPrimaryGuestStepValid(): boolean {

    return Boolean(
      this.primaryGuestLine?.valid &&
      this.guestForm.controls.email.valid &&
      this.guestForm.controls.phone.valid &&
      this.guestForm.controls.arrivalTime.valid
    );
  }

  private getFirstInvalidStep(): CheckInStep {

    if (!this.isPrimaryGuestStepValid()) {
      return 2;
    }

    if (this.guestLines.controls.slice(1).some((guestLine) => guestLine.invalid)) {
      return 3;
    }

    return 4;
  }

  private buildOnlineCheckInNotes(): string | undefined {

    const values =
      this.guestForm.getRawValue();

    const lines = [
      values.notes?.trim() ? `Observaciones: ${values.notes.trim()}` : '',
      values.residenceAddress?.trim()
        ? `Direccion de residencia: ${values.residenceAddress.trim()}`
        : '',
      values.travelReason?.trim()
        ? `Motivo de viaje: ${values.travelReason.trim()}`
        : '',
      values.signature?.trim()
        ? `Firma electronica: ${values.signature.trim()}`
        : '',
    ].filter(Boolean);

    return lines.length ? lines.join('\n') : undefined;
  }

  private scrollToFlow(): void {

    const prefersReducedMotion =
      this.prefersReducedMotion();

    window.setTimeout(() => {
      const section =
        document.getElementById('online-check-in-flow');

      section?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });

      section?.focus({ preventScroll: true });
    });
  }

  private readonly birthDateRangeValidator = (control: AbstractControl): ValidationErrors | null => {

    const value = control.value as string;

    if (!value) {
      return null;
    }

    if (value < this.minBirthDate || value > this.maxBirthDate) {
      return { birthDateRange: true };
    }

    return null;
  };

  private signatureMatchesHolderValidator(control: AbstractControl): ValidationErrors | null {

    const holderName =
      this.normalizePersonName(this.holderFullName);

    const signature =
      this.normalizePersonName(control.value as string);

    if (!holderName || !signature) {
      return null;
    }

    return signature === holderName ? null : { signatureMismatch: true };
  }

  private normalizeDocumentNumber(value: string): string {

    return value
      .replace(/[\s.-]/g, '')
      .trim()
      .toUpperCase();
  }

  private normalizePersonName(value: string): string {

    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private getRequiredReservationMessage(controlName: ReservationCodeControlName): string {

    const messages: Record<ReservationCodeControlName, string> = {
      reservationCode: 'Ingresa el código de la reserva.',
      documentType: 'Selecciona el tipo de documento.',
      documentNumber: 'Ingresa el número de documento del titular.',
    };

    return messages[controlName];
  }

  private getRequiredGuestMessage(controlName: GuestCheckInControlName): string {

    const messages: Record<GuestCheckInControlName, string> = {
      email: 'Ingresa un correo de contacto.',
      phone: 'Ingresa un telefono de contacto.',
      arrivalTime: 'Selecciona una hora estimada de llegada.',
      emergencyContactName: 'Ingresa el nombre de contacto de emergencia.',
      emergencyContactPhone: 'Ingresa el telefono de emergencia.',
      residenceAddress: 'Ingresa la direccion de residencia.',
      travelReason: 'Ingresa el motivo del viaje.',
      notes: 'Ingresa una observacion.',
      signature: 'Escribe tu nombre completo como firma electronica.',
      confirmsGuestData: 'Confirma que los datos son correctos.',
      acceptsStayRules: 'Acepta las normas de convivencia para continuar.',
      acceptsDataPolicy: 'Debes aceptar el tratamiento de datos para continuar.',
    };

    return messages[controlName];
  }

  private getMinLengthGuestMessage(controlName: GuestCheckInControlName): string {

    const messages: Partial<Record<GuestCheckInControlName, string>> = {
      phone: 'El telefono debe tener al menos 7 caracteres.',
      emergencyContactName: 'El contacto debe tener al menos 3 caracteres.',
      emergencyContactPhone: 'El telefono debe tener al menos 7 caracteres.',
      signature: 'La firma debe tener al menos 3 caracteres.',
    };

    return messages[controlName] ?? 'El dato ingresado es demasiado corto.';
  }

  private getRequiredGuestLineMessage(controlName: GuestLineControlName): string {

    const messages: Record<GuestLineControlName, string> = {
      firstName: 'Ingresa los nombres del huésped.',
      lastName: 'Ingresa los apellidos del huésped.',
      documentType: 'Selecciona el tipo de documento.',
      documentNumber: 'Ingresa el número de documento.',
      birthDate: 'Ingresa la fecha de nacimiento.',
      nationality: 'Ingresa la nacionalidad.',
    };

    return messages[controlName];
  }

  private getMinLengthGuestLineMessage(controlName: GuestLineControlName): string {

    const messages: Partial<Record<GuestLineControlName, string>> = {
      firstName: 'Los nombres deben tener al menos 2 caracteres.',
      lastName: 'Los apellidos deben tener al menos 2 caracteres.',
      documentNumber: 'El documento debe tener al menos 5 caracteres.',
      nationality: 'La nacionalidad debe tener al menos 3 caracteres.',
    };

    return messages[controlName] ?? 'El dato ingresado es demasiado corto.';
  }

  private prefersReducedMotion(): boolean {

    return window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
  }

  private normalizeReservationCode(value: string): string {

    return value
      .trim()
      .toUpperCase();
  }

  private formatDisplayDate(value: string, includeYear: boolean): string {

    const [year, month, day] =
      value.split('-').map((part) => Number(part));

    if (!year || !month || !day) {
      return value;
    }

    const date =
      new Date(year, month - 1, day);

    return new Intl.DateTimeFormat(
      'es-PE',
      {
        day: 'numeric',
        month: 'short',
        year: includeYear ? 'numeric' : undefined,
      }
    )
      .format(date)
      .replace('.', '');
  }

  private extractErrorMessage(error: unknown): string {

    const fallback =
      'No fue posible completar el check-in. Verifica los datos e intenta nuevamente.';

    if (!error || typeof error !== 'object') {
      return fallback;
    }

    const response =
      (error as { error?: unknown }).error;

    if (!response || typeof response !== 'object') {
      return fallback;
    }

    const detail =
      (response as { detail?: unknown }).detail;

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    const errors =
      (response as { errors?: unknown }).errors ?? response;

    if (errors && typeof errors === 'object') {
      const firstValue =
        Object.values(errors as Record<string, unknown>)[0];

      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return String(firstValue[0]);
      }

      if (typeof firstValue === 'string' && firstValue.trim()) {
        return firstValue;
      }
    }

    return fallback;
  }

  private formatDateInput(date: Date): string {

    const year =
      date.getFullYear();

    const month =
      String(date.getMonth() + 1).padStart(2, '0');

    const day =
      String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
