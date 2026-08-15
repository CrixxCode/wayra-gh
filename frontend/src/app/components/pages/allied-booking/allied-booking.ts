import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  ViewChild,
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
import {
  DatePicker,
  DatePickerModule,
} from 'primeng/datepicker';
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
  getRateFrom,
  getSelectedDateRange,
  getTodayDate,
  hasDateRangeError,
  hasDestinationMatches,
  hasIncompleteDateRange,
  parseBookingCriteriaFromQuery,
} from './allied-booking-flow';

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
  private readonly router = inject(Router);
  private readonly alliedHotelService = inject(AlliedHotelService);
  @ViewChild('dateRangePicker') private dateRangePicker?: DatePicker;
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

  readonly datePickerControl =
    this.formBuilder.nonNullable.control([] as Date[]);

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

    const criteria =
      parseBookingCriteriaFromQuery(
        this.route.snapshot.queryParamMap,
        this.hotels
      );

    this.searchForm.patchValue(criteria);
    this.syncDatePickerDraft();

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

  get pendingDateRange(): Date[] {

    return getSelectedDateRange(
      this.datePickerControl.value
    );
  }

  get canConfirmDateRange(): boolean {

    const dateRange =
      this.pendingDateRange;

    return (
      dateRange.length === 2 &&
      !hasDateRangeError(dateRange)
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

  searchAvailability(): void {

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

  openDateRangePicker(): void {
    this.syncDatePickerDraft();
  }

  cancelDateRange(): void {
    this.syncDatePickerDraft();
    this.dateRangePicker?.hideOverlay();
  }

  closeDateRangePicker(): void {
    this.syncDatePickerDraft();
  }

  confirmDateRange(): void {

    const dateRange =
      this.pendingDateRange;

    this.searchForm.controls.dateRange.markAsTouched();
    this.datePickerControl.markAsTouched();

    if (
      dateRange.length !== 2 ||
      hasDateRangeError(dateRange)
    ) {
      return;
    }

    this.searchForm.controls.dateRange.setValue(
      this.cloneDateRange(dateRange)
    );
    this.searchForm.controls.dateRange.markAsDirty();
    this.searchSubmitted = false;
    this.dateRangePicker?.hideOverlay();
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

  formatCurrency(value: number): string {

    return formatBookingCurrency(value);
  }

  private extractLocationError(error: unknown): string {
    if (
      error instanceof Error &&
      error.message.trim()
    ) {
      return error.message;
    }

    return 'No pudimos usar tu ubicacion.';
  }

  private syncDatePickerDraft(): void {

    this.datePickerControl.setValue(
      this.cloneDateRange(this.selectedDateRange),
      {
        emitEvent: false,
      }
    );
  }

  private cloneDateRange(dateRange: Date[]): Date[] {

    return dateRange.map(
      (date) => new Date(date.getTime())
    );
  }
}
