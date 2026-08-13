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
  RouterLink,
} from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';

import {
  ALLIED_HOTELS,
  AlliedHotel,
  AlliedRoomRate,
} from '../../../shared/allied-hotels';

type BookingControlName =
  | 'hotelSlug'
  | 'roomRateId'
  | 'guestName'
  | 'guestEmail'
  | 'guestPhone'
  | 'notes';

type BookingSearchControlName =
  | 'destination'
  | 'dateRange'
  | 'rooms'
  | 'guests';

interface BookingDestinationOption {
  city: string;
  country: string;
}

@Component({
  selector: 'app-allied-booking',
  standalone: true,
  imports: [
    CommonModule,
    DatePickerModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './allied-booking.html',
  styleUrl: './allied-booking.css',
})
export class AlliedBookingPage implements OnInit {

  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly hotels = ALLIED_HOTELS;
  readonly minDate = this.getTodayDate();

  searchSubmitted = false;
  submitted = false;
  destinationPanelOpen = false;

  readonly searchForm =
    this.formBuilder.nonNullable.group({
      destination: [
        '',
        Validators.required,
      ],
      dateRange: [
        [] as Date[],
        Validators.required,
      ],
      rooms: [
        1,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(4),
        ],
      ],
      guests: [
        1,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(8),
        ],
      ],
    });

  readonly bookingForm =
    this.formBuilder.nonNullable.group({
      hotelSlug: [
        '',
        Validators.required,
      ],
      roomRateId: [
        '',
        Validators.required,
      ],
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
      notes: [''],
    });

  ngOnInit(): void {

    const queryParams =
      this.route.snapshot.queryParamMap;

    const requestedHotel =
      queryParams.get('hotel');

    const requestedHotelOption =
      this.hotels.find(
        (hotel) => hotel.slug === requestedHotel
      );

    const requestedDestination =
      queryParams.get('destination') ?? '';

    const requestedCountry =
      queryParams.get('country') ?? '';

    const requestedCity =
      queryParams.get('city') ?? '';

    let destination =
      requestedDestination.trim();

    if (
      !destination &&
      requestedCity &&
      requestedCountry
    ) {
      destination =
        `${requestedCity}, ${requestedCountry}`;
    }

    if (
      !destination &&
      requestedCountry
    ) {
      destination = requestedCountry;
    }

    if (!destination && requestedHotelOption) {
      destination =
        `${requestedHotelOption.city}, ${requestedHotelOption.country}`;
    }

    const checkIn =
      queryParams.get('checkIn') ?? '';

    const checkOut =
      queryParams.get('checkOut') ?? '';

    const dateRange =
      [
        this.parseDate(checkIn),
        this.parseDate(checkOut),
      ].filter(
        (date): date is Date =>
          date instanceof Date
      );

    const rooms =
      this.normalizeNumberParam(
        queryParams.get('rooms'),
        1,
        1,
        4
      );

    const guests =
      this.normalizeNumberParam(
        queryParams.get('guests'),
        1,
        1,
        8
      );

    this.searchForm.patchValue({
      destination,
      dateRange,
      rooms,
      guests,
    });

    if (
      destination &&
      dateRange.length === 2
    ) {
      window.setTimeout(() => {
        this.searchAvailability();
      });
    }
  }

  get destinationOptions(): BookingDestinationOption[] {

    const optionsByKey =
      new Map<string, BookingDestinationOption>();

    this.hotels.forEach((hotel) => {
      const key =
        this.normalizeText(
          `${hotel.city}-${hotel.country}`
        );

      optionsByKey.set(
        key,
        {
          city: hotel.city,
          country: hotel.country,
        }
      );
    });


    return [
      ...optionsByKey.values(),
    ].sort(
      (first, second) =>
        first.city.localeCompare(second.city, 'es-CO')
    );
  }

  get filteredDestinationOptions(): BookingDestinationOption[] {

    const query =
      this.searchForm.controls.destination.value;

    const normalizedQuery =
      this.normalizeText(query);

    const options =
      normalizedQuery
        ? this.destinationOptions.filter(
            (option) =>
              this.matchesDestination(
                option.country,
                option.city,
                query
              )
          )
        : this.destinationOptions;

    return options.slice(0, 6);
  }

  get selectedHotel(): AlliedHotel {
    return this.hotels.find(
      (hotel) =>
        hotel.slug ===
        this.bookingForm.controls.hotelSlug.value
    ) as AlliedHotel;
  }

  get hasSelectedHotel(): boolean {

    return this.hotels.some(
      (hotel) =>
        hotel.slug ===
        this.bookingForm.controls.hotelSlug.value
    );
  }

  get selectedRoomRate(): AlliedRoomRate | null {

    if (!this.hasSelectedHotel) {
      return null;
    }

    return (
      this.selectedHotel.roomRates.find(
        (rate) =>
          rate.id ===
          this.bookingForm.controls.roomRateId.value
      ) ?? null
    );
  }

  get canShowRoomRates(): boolean {

    return (
      this.searchSubmitted &&
      this.hasSelectedHotel &&
      this.selectedOptionAvailable
    );
  }

  get canShowGuestForm(): boolean {

    return (
      this.canShowRoomRates &&
      Boolean(this.selectedRoomRate)
    );
  }

  get selectedDateRange(): Date[] {

    const dateRange =
      this.searchForm.controls.dateRange.value;

    if (!Array.isArray(dateRange)) {
      return [];
    }

    return dateRange
      .filter(
        (date): date is Date =>
          date instanceof Date &&
          !Number.isNaN(date.getTime())
      );
  }

  get hasIncompleteDateRange(): boolean {

    const selectedDates =
      this.selectedDateRange;

    return (
      selectedDates.length > 0 &&
      selectedDates.length < 2
    );
  }

  get nights(): number {

    const [
      checkIn,
      checkOut,
    ] = this.selectedDateRange;

    if (!checkIn || !checkOut) {
      return 0;
    }

    const diff =
      checkOut.getTime() - checkIn.getTime();

    return Math.max(
      Math.ceil(diff / 86400000),
      0
    );
  }

  get hasDateRangeError(): boolean {

    return (
      this.selectedDateRange.length === 2 &&
      this.nights <= 0
    );
  }

  get availableHotels(): AlliedHotel[] {

    if (
      this.searchForm.invalid ||
      !this.hasDestinationMatches() ||
      this.hasIncompleteDateRange ||
      this.hasDateRangeError
    ) {
      return [];
    }

    const search =
      this.searchForm.getRawValue();

    return this.hotels
      .filter((hotel) => {

        const matchesSearchDestination =
          this.matchesDestination(
            hotel.country,
            hotel.city,
            search.destination
          );

        const hasAvailableRates =
          this.getAvailableRoomRates(hotel).length > 0;

        return (
          matchesSearchDestination &&
          hasAvailableRates
        );
      })
      .sort(
        (first, second) =>
          this.getRateFrom(first) -
          this.getRateFrom(second)
      );
  }

  get selectedOptionAvailable(): boolean {

    return this.availableHotels.some(
      (hotel) =>
        hotel.slug ===
        this.bookingForm.controls.hotelSlug.value
    );
  }

  get bookingMailto(): string {

    const bookingValues =
      this.bookingForm.getRawValue();

    const searchValues =
      this.searchForm.getRawValue();

    const [
      checkIn,
      checkOut,
    ] = this.selectedDateRange;

    const subject =
      encodeURIComponent(
        `Solicitud de reserva - ${this.selectedHotel.name}`
      );

    const body =
      encodeURIComponent(
        [
          `Hotel: ${this.selectedHotel.name}`,
          `Ubicacion: ${this.selectedHotel.city}, ${this.selectedHotel.department}`,
          `Habitacion: ${this.selectedRoomRate?.roomType ?? ''}`,
          `Tarifa: ${this.selectedRoomRate?.rateName ?? ''}`,
          `Check-in: ${checkIn ? this.toDateInputValue(checkIn) : ''}`,
          `Check-out: ${checkOut ? this.toDateInputValue(checkOut) : ''}`,
          `Noches: ${this.nights}`,
          `Habitaciones: ${searchValues.rooms}`,
          `Huespedes: ${searchValues.guests}`,
          `Nombre: ${bookingValues.guestName}`,
          `Correo: ${bookingValues.guestEmail}`,
          `Telefono: ${bookingValues.guestPhone}`,
          `Comentarios: ${bookingValues.notes || 'Ninguno'}`,
        ].join('\n')
      );

    return `mailto:${this.selectedHotel.contact}?subject=${subject}&body=${body}`;
  }

  searchAvailability(): void {

    this.searchForm.markAllAsTouched();
    this.submitted = false;

    if (
      this.searchForm.invalid ||
      !this.hasDestinationMatches() ||
      this.hasIncompleteDateRange ||
      this.hasDateRangeError
    ) {
      this.searchSubmitted = false;
      return;
    }

    this.searchSubmitted = true;
    this.bookingForm.patchValue({
      hotelSlug: '',
      roomRateId: '',
    });

    const availableHotels =
      this.availableHotels;

    if (availableHotels.length === 0) {
      return;
    }
  }

  openDestinationPanel(): void {
    this.destinationPanelOpen = true;
  }


  closeDestinationPanel(): void {
    window.setTimeout(() => {
      this.destinationPanelOpen = false;
    }, 120);
  }


  selectDestination(
    destination: BookingDestinationOption
  ): void {

    this.searchForm.controls.destination.setValue(
      destination.city
    );

    this.destinationPanelOpen = false;
    this.searchSubmitted = false;
    this.submitted = false;

    this.bookingForm.patchValue({
      hotelSlug: '',
      roomRateId: '',
    });
  }


  selectHotel(hotel: AlliedHotel): void {

    this.bookingForm.controls.hotelSlug.setValue(
      hotel.slug
    );
    this.bookingForm.controls.roomRateId.setValue('');

    this.submitted = false;

    window.setTimeout(() => {
      document
        .getElementById('booking-rates')
        ?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
    });
  }

  selectRoomRate(rate: AlliedRoomRate): void {

    this.bookingForm.controls.roomRateId.setValue(
      rate.id
    );

    this.submitted = false;

    window.setTimeout(() => {
      document
        .getElementById('booking-request')
        ?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
    });
  }

  submitBooking(): void {

    this.searchForm.markAllAsTouched();
    this.bookingForm.markAllAsTouched();
    this.submitted = false;

    if (
      this.searchForm.invalid ||
      this.bookingForm.invalid ||
      !this.hasDestinationMatches() ||
      this.hasIncompleteDateRange ||
      this.hasDateRangeError ||
      !this.selectedOptionAvailable ||
      !this.selectedRoomRate
    ) {
      return;
    }

    this.submitted = true;

    window.setTimeout(() => {
      document
        .getElementById('booking-confirmation')
        ?.focus();
    });
  }

  resetRequest(): void {

    const selectedSlug =
      this.bookingForm.controls.hotelSlug.value;

    this.bookingForm.reset({
      hotelSlug: selectedSlug,
      roomRateId:
        this.bookingForm.controls.roomRateId.value,
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      notes: '',
    });

    this.submitted = false;
  }

  isSearchInvalid(controlName: BookingSearchControlName): boolean {

    const control =
      this.searchForm.controls[controlName];

    if (
      controlName === 'destination' &&
      (
        control.dirty ||
        control.touched
      )
    ) {
      return (
        control.invalid ||
        !this.hasDestinationMatches()
      );
    }

    if (
      controlName === 'dateRange' &&
      (
        control.dirty ||
        control.touched
      )
    ) {
      return (
        this.selectedDateRange.length < 2 ||
        this.hasDateRangeError
      );
    }

    return Boolean(
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }

  isInvalid(controlName: BookingControlName): boolean {

    const control =
      this.bookingForm.controls[controlName];

    return Boolean(
      control.invalid &&
      (
        control.dirty ||
        control.touched
      )
    );
  }

  trackByHotel(
    index: number,
    hotel: AlliedHotel
  ): string {

    return hotel.slug;
  }

  trackByIndex(index: number): number {
    return index;
  }


  trackByDestination(
    index: number,
    destination: BookingDestinationOption
  ): string {

    return `${destination.city}-${destination.country}-${index}`;
  }

  getAvailableRoomCount(hotel: AlliedHotel): number {

    const [
      checkIn,
    ] = this.selectedDateRange;

    if (!checkIn || this.nights <= 0) {
      return 0;
    }

    const seed =
      Array.from(hotel.slug)
        .reduce(
          (sum, character) =>
            sum + character.charCodeAt(0),
          0
        ) +
      checkIn.getDate() +
      this.nights * 3;

    const baseAvailability =
      Math.max(
        Math.floor(hotel.rooms * 0.14),
        2
      );

    const dateVariation =
      seed % 6;

    return Math.min(
      hotel.rooms,
      baseAvailability + dateVariation
    );
  }

  getEstimatedTotal(hotel: AlliedHotel): number {

    const rooms =
      this.searchForm.controls.rooms.value;

    return this.getRateFrom(hotel) * rooms * this.nights;
  }

  getAvailableRoomRateCount(
    hotel: AlliedHotel,
    rate: AlliedRoomRate
  ): number {

    const [
      checkIn,
    ] = this.selectedDateRange;

    if (!checkIn || this.nights <= 0) {
      return 0;
    }

    const seed =
      Array.from(`${hotel.slug}-${rate.id}`)
        .reduce(
          (sum, character) =>
            sum + character.charCodeAt(0),
          0
        ) +
      checkIn.getDate() +
      this.nights * 5;

    const baseAvailability =
      Math.max(
        Math.floor(hotel.rooms * 0.06),
        1
      );

    return Math.min(
      hotel.rooms,
      baseAvailability + (seed % 4)
    );
  }

  getAvailableRoomRates(hotel: AlliedHotel): AlliedRoomRate[] {

    const search =
      this.searchForm.getRawValue();

    return hotel.roomRates
      .filter((rate) => {

        const availableRooms =
          this.getAvailableRoomRateCount(
            hotel,
            rate
          );

        const hasEnoughRooms =
          availableRooms >= search.rooms;

        const hasEnoughGuestCapacity =
          search.guests <=
          search.rooms * rate.maxGuests;

        return (
          hasEnoughRooms &&
          hasEnoughGuestCapacity
        );
      })
      .sort(
        (first, second) =>
          first.nightlyRate -
          second.nightlyRate
      );
  }

  getRateEstimatedTotal(rate: AlliedRoomRate): number {

    const rooms =
      this.searchForm.controls.rooms.value;

    return rate.nightlyRate * rooms * this.nights;
  }

  getRateFrom(hotel: AlliedHotel): number {

    const rates =
      this.getAvailableRoomRates(hotel);

    return (
      rates[0]?.nightlyRate ??
      hotel.nightlyRateFrom
    );
  }

  formatCurrency(value: number): string {

    return new Intl.NumberFormat(
      'es-CO',
      {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }
    ).format(value || 0);
  }

  private normalizeNumberParam(
    value: string | null,
    fallback: number,
    min: number,
    max: number
  ): number {

    const numericValue =
      Number(value);

    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.min(
      Math.max(
        Math.floor(numericValue),
        min
      ),
      max
    );
  }


  private parseDate(value: string): Date | null {

    if (!value) {
      return null;
    }

    const parts =
      value.split('-').map(Number);

    if (parts.length !== 3) {
      return null;
    }

    const [
      year,
      month,
      day,
    ] = parts;

    if (!year || !month || !day) {
      return null;
    }

    return new Date(
      year,
      month - 1,
      day
    );
  }


  private hasDestinationMatches(): boolean {

    const destination =
      this.searchForm.controls.destination.value;

    return this.hotels.some(
      (hotel) =>
        this.matchesDestination(
          hotel.country,
          hotel.city,
          destination
        )
    );
  }


  private matchesDestination(
    country: string,
    city: string,
    destination: string
  ): boolean {

    const normalizedDestination =
      this.normalizeText(destination);

    if (!normalizedDestination) {
      return false;
    }

    return [
      country,
      city,
      `${city}, ${country}`,
    ].some(
      (option) =>
        this.normalizeText(option)
          .includes(normalizedDestination)
    );
  }


  private normalizeText(value: string): string {

    return value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }


  private getTodayDate(): Date {

    const today =
      new Date();

    today.setHours(0, 0, 0, 0);

    return today;
  }

  private toDateInputValue(date: Date): string {

    const year =
      date.getFullYear();

    const month =
      `${date.getMonth() + 1}`.padStart(2, '0');

    const day =
      `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
