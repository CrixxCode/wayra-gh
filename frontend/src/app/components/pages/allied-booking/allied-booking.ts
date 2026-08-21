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
} from '@angular/router';
import { DatePickerModule } from 'primeng/datepicker';
import { catchError, of } from 'rxjs';

import { AlliedHotel } from '../../../shared/allied-hotels';
import { resolveCurrentLocationDestination } from '../../../shared/current-location-destination';
import { AlliedHotelService } from '../../../services/allied-hotels';
import {
  BookingCriteria,
  BookingDestinationOption,
  BookingSearchControlName,
  buildAvailabilityQueryParams,
  buildBookingCriteria,
  buildBookingQueryParams,
  filterDestinationOptions,
  formatBookingCurrency,
  getAvailableHotels,
  getAvailableRoomCount,
  getEstimatedTotal,
  getNights,
  getHotelTypeIcon,
  getRateFrom,
  getSelectedDateRange,
  getTodayDate,
  hasDateRangeError,
  hasDestinationMatches,
  hasIncompleteDateRange,
  isAvailableRoomCountEstimated,
  parseBookingCriteriaFromQuery,
} from './allied-booking-flow';
import { PublicHeaderComponent } from '../../shared/public-header/public-header';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer';

type BookingSortMode =
  | 'price-asc'
  | 'price-desc'
  | 'name-asc';

@Component({
  selector: 'app-allied-booking',
  standalone: true,
  imports: [
    CommonModule,
    DatePickerModule,
    ReactiveFormsModule,
    PublicHeaderComponent,
    PublicFooterComponent,
  ],
  templateUrl: './allied-booking.html',
  styleUrl: './allied-booking.css',
})
export class AlliedBookingPage implements OnInit {

  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alliedHotelService = inject(AlliedHotelService);
  private availabilityRequestId = 0;

  hotels: AlliedHotel[] = [];
  availabilityHotels: AlliedHotel[] = [];
  loadingHotels = true;
  searchingAvailability = false;
  hotelsLoadError = '';
  readonly minDate = getTodayDate();

  searchSubmitted = false;
  destinationPanelOpen = false;
  locatingDestination = false;
  destinationLocationError = '';
  hotelsLoadErrorContext: 'initial' | 'availability' = 'initial';
  sortMode: BookingSortMode = 'price-asc';

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
        2,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(8),
        ],
      ],
    });

  ngOnInit(): void {
    this.searchForm.valueChanges.subscribe(() => {
      if (
        this.searchSubmitted ||
        this.searchingAvailability
      ) {
        this.availabilityRequestId += 1;
        this.searchSubmitted = false;
        this.searchingAvailability = false;
        this.availabilityHotels = [];
      }
    });
    this.loadHotels();
  }

  private loadHotels(): void {
    this.loadingHotels = true;
    this.hotelsLoadError = '';

    this.alliedHotelService
      .listActiveAlliedHotels()
      .pipe(
        catchError(() => {
          this.hotelsLoadErrorContext = 'initial';
          this.hotelsLoadError = 'No fue posible cargar los hoteles aliados activos.';
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        this.hotels = hotels;
        this.loadingHotels = false;
        this.applyInitialQueryParams();
      });
  }

  private applyInitialQueryParams(): void {

    const queryParams =
      this.route.snapshot.queryParamMap;

    const hasInitialCriteria =
      [
        'destination',
        'country',
        'city',
        'hotel',
        'checkIn',
        'checkOut',
        'rooms',
        'guests',
      ].some((key) => queryParams.has(key));

    if (!hasInitialCriteria) {
      return;
    }

    const criteria =
      parseBookingCriteriaFromQuery(
        queryParams,
        this.hotels
      );

    this.searchForm.patchValue(criteria);

    if (
      criteria.destination &&
      criteria.dateRange.length === 2
    ) {
      window.setTimeout(() => {
        this.searchAvailability();
      });
    }
  }

  get criteria(): BookingCriteria {

    return buildBookingCriteria(
      this.searchForm.getRawValue()
    );
  }

  get filteredDestinationOptions(): BookingDestinationOption[] {

    return filterDestinationOptions(
      this.hotels,
      this.searchForm.controls.destination.value
    );
  }

  get selectedDateRange(): Date[] {

    return getSelectedDateRange(
      this.searchForm.controls.dateRange.value
    );
  }

  get hasIncompleteDateRange(): boolean {

    return hasIncompleteDateRange(
      this.selectedDateRange
    );
  }

  get nights(): number {

    return getNights(
      this.selectedDateRange
    );
  }

  get hasDateRangeError(): boolean {

    return hasDateRangeError(
      this.selectedDateRange
    );
  }

  get guestSummary(): string {

    const {
      guests,
      rooms,
    } = this.criteria;

    const guestLabel =
      guests === 1
        ? 'adulto'
        : 'adultos';

    if (rooms === 1) {
      return `${guests} ${guestLabel}`;
    }

    return `${guests} ${guestLabel} · ${rooms} habs.`;
  }


  get resultsTitle(): string {

    if (this.searchSubmitted && !this.searchingAvailability) {
      return `${this.availableHotels.length} ${
        this.availableHotels.length === 1
          ? 'alojamiento disponible'
          : 'alojamientos disponibles'
      }`;
    }

    return 'Alojamientos disponibles';
  }

  get availableHotels(): AlliedHotel[] {

    if (
      this.searchForm.invalid ||
      !this.searchSubmitted
    ) {
      return [];
    }

    return getAvailableHotels(
      this.availabilityHotels,
      this.criteria
    );
  }


  get sortedAvailableHotels(): AlliedHotel[] {

    return [
      ...this.availableHotels,
    ].sort((first, second) => {
      if (this.sortMode === 'name-asc') {
        return first.name.localeCompare(
          second.name,
          'es',
          {
            sensitivity: 'base',
          }
        );
      }

      const priceDiff =
        this.getEstimatedTotal(first) - this.getEstimatedTotal(second);

      if (priceDiff === 0) {
        return first.name.localeCompare(
          second.name,
          'es',
          {
            sensitivity: 'base',
          }
        );
      }

      return this.sortMode === 'price-desc'
        ? -priceDiff
        : priceDiff;
    });
  }

  searchAvailability(): void {

    if (this.searchingAvailability) {
      return;
    }

    this.searchForm.markAllAsTouched();

    if (this.loadingHotels) {
      this.searchSubmitted = false;
      this.availabilityHotels = [];
      return;
    }

    if (
      this.searchForm.invalid ||
      !hasDestinationMatches(this.hotels, this.criteria.destination) ||
      this.hasIncompleteDateRange ||
      this.hasDateRangeError
    ) {
      this.searchSubmitted = false;
      this.availabilityHotels = [];
      return;
    }

    const requestId =
      this.availabilityRequestId + 1;

    this.availabilityRequestId = requestId;
    this.searchingAvailability = true;
    this.searchSubmitted = false;
    this.availabilityHotels = [];
    this.hotelsLoadError = '';

    this.alliedHotelService
      .listActiveAlliedHotels(
        buildAvailabilityQueryParams(this.criteria)
      )
      .pipe(
        catchError(() => {
          if (requestId === this.availabilityRequestId) {
            this.hotelsLoadErrorContext = 'availability';
            this.hotelsLoadError = 'No fue posible consultar disponibilidad.';
          }
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        if (requestId !== this.availabilityRequestId) {
          return;
        }

        this.availabilityHotels = hotels;
        this.searchingAvailability = false;
        this.searchSubmitted = !this.hotelsLoadError;
      });
  }

  retryLoadHotels(): void {
    this.loadHotels();
  }

  retrySearchAvailability(): void {
    this.searchAvailability();
  }

  openDestinationPanel(): void {
    this.destinationPanelOpen = true;
  }

  closeDestinationPanel(): void {
    this.destinationPanelOpen = false;
  }

  onDestinationFocusOut(event: FocusEvent): void {

    const container =
      event.currentTarget as HTMLElement;

    const nextFocusTarget =
      event.relatedTarget as Node | null;

    if (
      nextFocusTarget &&
      container.contains(nextFocusTarget)
    ) {
      return;
    }

    this.closeDestinationPanel();
  }

  selectDestination(
    destination: BookingDestinationOption
  ): void {

    this.destinationLocationError = '';
    this.searchForm.controls.destination.setValue(
      destination.city
    );

    this.destinationPanelOpen = false;
    this.searchSubmitted = false;
  }

  useCurrentLocation(): void {
    if (
      this.locatingDestination ||
      this.loadingHotels
    ) {
      return;
    }

    this.locatingDestination = true;
    this.destinationLocationError = '';

    resolveCurrentLocationDestination(this.hotels)
      .then((result) => {
        this.searchForm.controls.destination.setValue(
          result.destination
        );
        this.searchForm.controls.destination.markAsDirty();
        this.searchForm.controls.destination.markAsTouched();
        this.destinationPanelOpen = false;
        this.searchSubmitted = false;
      })
      .catch((error: unknown) => {
        this.destinationLocationError =
          this.extractLocationError(error);
      })
      .finally(() => {
        this.locatingDestination = false;
      });
  }

  onDateRangeSelect(): void {

    this.searchForm.controls.dateRange.markAsDirty();
    this.searchForm.controls.dateRange.markAsTouched();
    this.searchSubmitted = false;
  }

  setSortMode(event: Event): void {

    const select =
      event.target as HTMLSelectElement | null;

    const nextMode =
      select?.value as BookingSortMode | undefined;

    if (
      nextMode === 'price-asc' ||
      nextMode === 'price-desc' ||
      nextMode === 'name-asc'
    ) {
      this.sortMode = nextMode;
    }
  }

  selectHotel(hotel: AlliedHotel): void {

    if (
      !this.searchSubmitted ||
      !this.availableHotels.some((option) => option.slug === hotel.slug)
    ) {
      return;
    }

    this.router.navigate(
      [
        '/reservar/tarifas',
        hotel.slug,
      ],
      {
        queryParams: buildBookingQueryParams(this.criteria),
      }
    );
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
        !hasDestinationMatches(this.hotels, this.criteria.destination)
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

  trackByHotel(
    index: number,
    hotel: AlliedHotel
  ): string {

    return hotel.slug;
  }

  trackByDestination(
    index: number,
    destination: BookingDestinationOption
  ): string {

    return `${destination.city}-${destination.country}-${index}`;
  }


  trackByIndex(index: number): number {

    return index;
  }

  getAvailableRoomCount(hotel: AlliedHotel): number {

    return getAvailableRoomCount(
      hotel,
      this.criteria
    );
  }

  getEstimatedTotal(hotel: AlliedHotel): number {

    return getEstimatedTotal(
      hotel,
      this.criteria
    );
  }

  getRateFrom(hotel: AlliedHotel): number {

    return getRateFrom(
      hotel,
      this.criteria
    );
  }

  isAvailableRoomCountEstimated(hotel: AlliedHotel): boolean {

    return isAvailableRoomCountEstimated(hotel);
  }

  getHotelTypeIcon(type: string): string {

    return getHotelTypeIcon(type);
  }

  formatCurrency(value: number): string {

    return formatBookingCurrency(value);
  }


  getHotelResultSummary(hotel: AlliedHotel): string {

    const rate =
      this.getPrimaryRate(hotel);

    const roomType =
      rate?.roomType || hotel.type;

    return `${roomType} · ${hotel.city}, ${hotel.country}`;
  }


  getHotelResultTags(hotel: AlliedHotel): string[] {

    const tags =
      hotel.highlights.length > 0
        ? hotel.highlights
        : [
            'Cancelación flexible',
            'Reserva directa',
          ];

    return tags.slice(0, 2);
  }


  getNightsLabel(): string {

    const nights =
      this.nights || 1;

    return `${nights} ${nights === 1 ? 'NOCHE' : 'NOCHES'}`;
  }

  private extractLocationError(error: unknown): string {
    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message;
    }

    return 'No pudimos usar tu ubicación. Escribe tu destino manualmente.';
  }

  private getPrimaryRate(hotel: AlliedHotel) {

    return [
      ...hotel.roomRates,
    ].sort(
      (first, second) =>
        first.nightlyRate - second.nightlyRate
    )[0] ?? null;
  }


}
