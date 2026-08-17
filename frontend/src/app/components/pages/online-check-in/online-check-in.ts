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
  OnlineCheckInLookupResponse,
  OnlineCheckInResponse,
  OnlineCheckInService,
} from '../../../services/online-check-in';

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
  | 'notes'
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

@Component({
  selector: 'app-online-check-in',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
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
        [
          Validators.required,
          Validators.minLength(3),
        ],
      ],
      emergencyContactPhone: [
        '',
        [
          Validators.required,
          Validators.minLength(7),
        ],
      ],
      notes: [''],
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

  get reservationCodeLabel(): string {

    return this.normalizeReservationCode(
      this.reservationForm.controls.reservationCode.value
    );
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
          this.buildGuestLines(
            response,
            codeValues.documentType,
            codeValues.documentNumber
          );
          this.codeConfirmed = true;
          this.submitted = false;

          window.setTimeout(() => {
            const guestSection =
              document.getElementById('guest-check-in-data');

            guestSection?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });

            guestSection?.focus({ preventScroll: true });
          });
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
      return;
    }

    const guestValues =
      this.guestForm.getRawValue();

    const guests =
      this.guestLines.controls.map((line) => line.getRawValue());

    this.submitting = true;

    this.onlineCheckInService
      .submitOnlineCheckIn({
        reservationCode: this.reservationCodeLabel,
        guests,
        email: guestValues.email,
        phone: guestValues.phone,
        arrivalTime: guestValues.arrivalTime,
        emergencyContactName: guestValues.emergencyContactName,
        emergencyContactPhone: guestValues.emergencyContactPhone,
        notes: guestValues.notes,
        acceptsDataPolicy: guestValues.acceptsDataPolicy,
      })
      .subscribe({
        next: (response) => {
          this.submitting = false;
          this.submitted = true;
          this.confirmation = response;

          window.setTimeout(() => {
            document
              .getElementById('online-check-in-confirmation')
              ?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
          });
        },
        error: (error) => {
          this.submitting = false;
          this.submitError = this.extractErrorMessage(error);

          window.setTimeout(() => {
            document
              .getElementById('online-check-in-error')
              ?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
          });
        },
      });
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
      notes: '',
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

  trackByValue(_: number, option: SelectOption): string {

    return option.value;
  }

  trackByGuestLine(index: number): number {

    return index;
  }

  private buildGuestLines(
    response: OnlineCheckInLookupResponse,
    titularDocumentType: string,
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

    for (let index = 0; index < totalGuests; index++) {

      if (index === 0) {
        this.guestLines.push(
          this.buildGuestLine(
            titularGuest
              ? this.toGuestLinePrefill(titularGuest)
              : {
                  documentType: titularDocumentType,
                  documentNumber: titularDocumentNumber,
                }
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

  private normalizeDocumentNumber(value: string): string {

    return value
      .replace(/[\s.-]/g, '')
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
      phone: 'Ingresa un teléfono de contacto.',
      arrivalTime: 'Selecciona una hora estimada de llegada.',
      emergencyContactName: 'Ingresa el nombre de contacto de emergencia.',
      emergencyContactPhone: 'Ingresa el teléfono de emergencia.',
      notes: 'Ingresa una observación.',
      acceptsDataPolicy: 'Debes aceptar el tratamiento de datos para continuar.',
    };

    return messages[controlName];
  }

  private getMinLengthGuestMessage(controlName: GuestCheckInControlName): string {

    const messages: Partial<Record<GuestCheckInControlName, string>> = {
      phone: 'El teléfono debe tener al menos 7 caracteres.',
      emergencyContactName: 'El contacto debe tener al menos 3 caracteres.',
      emergencyContactPhone: 'El teléfono debe tener al menos 7 caracteres.',
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

  private normalizeReservationCode(value: string): string {

    return value
      .trim()
      .toUpperCase();
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
