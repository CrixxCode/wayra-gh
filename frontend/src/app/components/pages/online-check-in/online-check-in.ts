import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

type ReservationCodeControlName = 'reservationCode';

type GuestCheckInControlName =
  | 'firstName'
  | 'lastName'
  | 'documentType'
  | 'documentNumber'
  | 'birthDate'
  | 'nationality'
  | 'email'
  | 'phone'
  | 'arrivalTime'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'notes'
  | 'acceptsDataPolicy';

interface SelectOption {
  value: string;
  label: string;
}

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

  readonly maxBirthDate = this.formatDateInput(new Date());

  readonly documentTypes: SelectOption[] = [
    {
      value: 'CC',
      label: 'Cedula de ciudadania',
    },
    {
      value: 'CE',
      label: 'Cedula de extranjeria',
    },
    {
      value: 'PASSPORT',
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
      label: 'Despues de las 9:00 p. m.',
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
    });

  readonly guestForm =
    this.formBuilder.nonNullable.group({
      firstName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
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
      birthDate: [
        '',
        Validators.required,
      ],
      nationality: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
        ],
      ],
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

  get reservationCodeLabel(): string {

    return this.normalizeReservationCode(
      this.reservationForm.controls.reservationCode.value
    );
  }

  continueWithCode(): void {

    this.reservationForm.markAllAsTouched();

    if (this.reservationForm.invalid) {
      return;
    }

    this.codeConfirmed = true;
    this.submitted = false;

    window.setTimeout(() => {
      document
        .getElementById('guest-check-in-data')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    });
  }

  submitCheckIn(): void {

    if (!this.codeConfirmed) {
      this.continueWithCode();

      if (!this.codeConfirmed) {
        return;
      }
    }

    this.guestForm.markAllAsTouched();

    if (this.guestForm.invalid) {
      return;
    }

    this.submitted = true;

    window.setTimeout(() => {
      document
        .getElementById('online-check-in-confirmation')
        ?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
    });
  }

  resetFlow(): void {

    this.codeConfirmed = false;
    this.submitted = false;
    this.reservationForm.reset({
      reservationCode: '',
    });
    this.guestForm.reset({
      firstName: '',
      lastName: '',
      documentType: 'CC',
      documentNumber: '',
      birthDate: '',
      nationality: '',
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

  getReservationError(controlName: ReservationCodeControlName): string {

    const control =
      this.reservationForm.controls[controlName];

    if (control.hasError('required')) {
      return 'Ingresa el codigo de la reserva.';
    }

    if (control.hasError('minlength')) {
      return 'El codigo debe tener al menos 4 caracteres.';
    }

    if (control.hasError('maxlength')) {
      return 'El codigo no debe superar 30 caracteres.';
    }

    if (control.hasError('pattern')) {
      return 'Usa solo letras, numeros o guiones.';
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
      return 'Ingresa un correo valido.';
    }

    if (control.hasError('minlength')) {
      return this.getMinLengthGuestMessage(controlName);
    }

    if (control.hasError('maxlength')) {
      return 'El dato ingresado es demasiado largo.';
    }

    return '';
  }

  trackByValue(_: number, option: SelectOption): string {

    return option.value;
  }

  private getRequiredGuestMessage(controlName: GuestCheckInControlName): string {

    const messages: Record<GuestCheckInControlName, string> = {
      firstName: 'Ingresa los nombres del huesped principal.',
      lastName: 'Ingresa los apellidos del huesped principal.',
      documentType: 'Selecciona el tipo de documento.',
      documentNumber: 'Ingresa el numero de documento.',
      birthDate: 'Ingresa la fecha de nacimiento.',
      nationality: 'Ingresa la nacionalidad.',
      email: 'Ingresa un correo de contacto.',
      phone: 'Ingresa un telefono de contacto.',
      arrivalTime: 'Selecciona una hora estimada de llegada.',
      emergencyContactName: 'Ingresa el nombre de contacto de emergencia.',
      emergencyContactPhone: 'Ingresa el telefono de emergencia.',
      notes: 'Ingresa una observacion.',
      acceptsDataPolicy: 'Debes aceptar el tratamiento de datos para continuar.',
    };

    return messages[controlName];
  }

  private getMinLengthGuestMessage(controlName: GuestCheckInControlName): string {

    const messages: Partial<Record<GuestCheckInControlName, string>> = {
      firstName: 'Los nombres deben tener al menos 2 caracteres.',
      lastName: 'Los apellidos deben tener al menos 2 caracteres.',
      documentNumber: 'El documento debe tener al menos 5 caracteres.',
      nationality: 'La nacionalidad debe tener al menos 3 caracteres.',
      phone: 'El telefono debe tener al menos 7 caracteres.',
      emergencyContactName: 'El contacto debe tener al menos 3 caracteres.',
      emergencyContactPhone: 'El telefono debe tener al menos 7 caracteres.',
    };

    return messages[controlName] ?? 'El dato ingresado es demasiado corto.';
  }

  private normalizeReservationCode(value: string): string {

    return value
      .trim()
      .toUpperCase();
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
