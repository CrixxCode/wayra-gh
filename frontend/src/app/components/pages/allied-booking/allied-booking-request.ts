import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';
import { catchError, of } from 'rxjs';

import {
  AlliedHotel,
  AlliedRoomRate,
} from '../../../shared/allied-hotels';
import { AlliedHotelService } from '../../../services/allied-hotels';
import { WebReservationService } from '../../../services/web-reservation';
import {
  BookingCriteria,
  buildAvailabilityQueryParams,
  buildBookingQueryParams,
  findHotelBySlug,
  findRoomRateById,
  formatBookingCurrency,
  getAvailableRoomRates,
  getNights,
  getRateEstimatedTotal,
  isBookingCriteriaComplete,
  parseBookingCriteriaFromQuery,
  toDateInputValue,
} from './allied-booking-flow';

type BookingControlName =
  | 'guestName'
  | 'guestEmail'
  | 'guestPhone'
  | 'guestDocumentType'
  | 'guestDocumentNumber'
  | 'notes';

@Component({
  selector: 'app-allied-booking-request',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './allied-booking-request.html',
  styleUrl: './allied-booking.css',
})
export class AlliedBookingRequestPage implements OnInit {

  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alliedHotelService = inject(AlliedHotelService);
  private readonly webReservationService = inject(WebReservationService);

  hotels: AlliedHotel[] = [];
  selectedHotel: AlliedHotel | null = null;
  selectedRoomRate: AlliedRoomRate | null = null;
  criteria: BookingCriteria = {
    destination: '',
    dateRange: [],
    rooms: 1,
    guests: 1,
  };

  loadingHotels = true;
  hotelsLoadError = '';
  saving = false;
  submitError = '';

  readonly requestForm =
    this.formBuilder.nonNullable.group({
      guestName: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
        ],
      ],
      guestEmail: [
        '',
        [
          Validators.required,
          Validators.email,
        ],
      ],
      guestPhone: [
        '',
        [
          Validators.required,
          Validators.minLength(7),
        ],
      ],
      guestDocumentType: [
        'CC',
        Validators.required,
      ],
      guestDocumentNumber: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
        ],
      ],
      notes: [''],
    });

  ngOnInit(): void {
    this.loadHotels();
  }

  private loadHotels(): void {
    this.loadingHotels = true;
    this.hotelsLoadError = '';

    this.alliedHotelService
      .listActiveAlliedHotels()
      .pipe(
        catchError(() => {
          this.hotelsLoadError = 'No fue posible cargar los hoteles aliados activos.';
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        const hotelSlug =
          this.route.snapshot.paramMap.get('hotelSlug') ?? '';

        const rateId =
          this.route.snapshot.paramMap.get('rateId') ?? '';

        this.hotels = hotels;
        this.criteria =
          parseBookingCriteriaFromQuery(
            this.route.snapshot.queryParamMap,
            hotels,
            hotelSlug
          );
        this.selectedHotel =
          findHotelBySlug(
            hotels,
            hotelSlug
          );
        this.selectedRoomRate =
          findRoomRateById(
            this.selectedHotel,
            rateId
          );

        if (!this.criteriaReady) {
          this.loadingHotels = false;
          return;
        }

        this.loadAvailableSelection(hotelSlug, rateId);
      });
  }

  private loadAvailableSelection(
    hotelSlug: string,
    rateId: string
  ): void {
    this.alliedHotelService
      .listActiveAlliedHotels(
        buildAvailabilityQueryParams(this.criteria)
      )
      .pipe(
        catchError(() => {
          this.hotelsLoadError = 'No fue posible consultar disponibilidad.';
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        const availableHotel =
          findHotelBySlug(
            hotels,
            hotelSlug
          );

        if (availableHotel) {
          this.selectedHotel = availableHotel;
        } else if (this.selectedHotel) {
          this.selectedHotel = {
            ...this.selectedHotel,
            availableRooms: 0,
            roomRates: [],
          };
        }

        this.selectedRoomRate =
          findRoomRateById(
            this.selectedHotel,
            rateId
          );
        this.loadingHotels = false;
      });
  }

  get queryParams() {

    return buildBookingQueryParams(
      this.criteria
    );
  }

  get criteriaReady(): boolean {

    return isBookingCriteriaComplete(
      this.hotels,
      this.criteria
    );
  }

  get selectedRateAvailable(): boolean {

    if (
      !this.selectedHotel ||
      !this.selectedRoomRate ||
      !this.criteriaReady
    ) {
      return false;
    }

    return getAvailableRoomRates(
      this.selectedHotel,
      this.criteria
    ).some(
      (rate) => rate.id === this.selectedRoomRate?.id
    );
  }

  get canShowRequestForm(): boolean {

    return Boolean(
      this.selectedHotel &&
      this.selectedRoomRate &&
      this.criteriaReady &&
      this.selectedRateAvailable
    );
  }

  get nights(): number {

    return getNights(
      this.criteria.dateRange
    );
  }

  submitBooking(): void {

    if (this.saving) {
      return;
    }

    this.requestForm.markAllAsTouched();
    this.submitError = '';

    if (
      this.requestForm.invalid ||
      !this.canShowRequestForm ||
      !this.selectedHotel ||
      !this.selectedRoomRate
    ) {
      return;
    }

    const [
      checkIn,
      checkOut,
    ] = this.criteria.dateRange;

    if (!checkIn || !checkOut) {
      this.submitError = 'Selecciona fechas validas para la reserva.';
      return;
    }

    const formValues =
      this.requestForm.getRawValue();

    this.saving = true;
    this.webReservationService
      .createWebReservation({
        hotelSlug: this.selectedHotel.slug,
        roomRateId: this.selectedRoomRate.id,
        checkIn: toDateInputValue(checkIn),
        checkOut: toDateInputValue(checkOut),
        rooms: this.criteria.rooms,
        guests: this.criteria.guests,
        guestName: formValues.guestName,
        guestEmail: formValues.guestEmail,
        guestPhone: formValues.guestPhone,
        guestDocumentType: formValues.guestDocumentType,
        guestDocumentNumber: formValues.guestDocumentNumber,
        notes: formValues.notes,
        sourceDetail: 'Formulario publico de reserva',
        sourceUrl: window.location.href,
        sourceReferrer: document.referrer || '',
        sourceMetadata: {
          hotelName: this.selectedHotel.name,
          roomType: this.selectedRoomRate.roomType,
          rateName: this.selectedRoomRate.rateName,
        },
      })
      .subscribe({
        next: (reservation) => {
          this.saving = false;
          this.router.navigate(
            [
              '/reservar/confirmacion',
              reservation.id,
            ],
            {
              queryParams: {
                hotel: reservation.hotel_name,
                checkIn: reservation.expected_check_in,
                checkOut: reservation.expected_check_out,
              },
            }
          );
        },
        error: (error) => {
          this.saving = false;
          this.submitError = this.extractErrorMessage(error);
        },
      });
  }

  resetRequest(): void {

    this.requestForm.reset({
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      guestDocumentType: 'CC',
      guestDocumentNumber: '',
      notes: '',
    });

    this.submitError = '';
  }

  isInvalid(controlName: BookingControlName): boolean {

    const control =
      this.requestForm.controls[controlName];

    return Boolean(
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }

  getRateEstimatedTotal(): number {

    if (!this.selectedRoomRate) {
      return 0;
    }

    return getRateEstimatedTotal(
      this.selectedRoomRate,
      this.criteria
    );
  }

  formatCurrency(value: number): string {

    return formatBookingCurrency(value);
  }

  trackByIndex(index: number): number {
    return index;
  }

  private extractErrorMessage(error: unknown): string {

    const fallback =
      'No fue posible registrar la reserva. Verifica los datos e intenta nuevamente.';

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
}
