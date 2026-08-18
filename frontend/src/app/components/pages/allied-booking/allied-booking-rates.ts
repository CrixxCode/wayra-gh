import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
} from '@angular/core';
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
import {
  BookingCriteria,
  buildAvailabilityQueryParams,
  buildBookingQueryParams,
  findHotelBySlug,
  formatBookingCurrency,
  getAvailableRoomRateCount,
  getAvailableRoomRates,
  getNights,
  getRateEstimatedTotal,
  getRoomTypeIcon,
  isAvailableRoomRateCountEstimated,
  isBookingCriteriaComplete,
  parseBookingCriteriaFromQuery,
} from './allied-booking-flow';
import { PublicHeaderComponent } from '../../shared/public-header/public-header';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer';

@Component({
  selector: 'app-allied-booking-rates',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PublicHeaderComponent,
    PublicFooterComponent,
  ],
  templateUrl: './allied-booking-rates.html',
  styleUrl: './allied-booking.css',
})
export class AlliedBookingRatesPage implements OnInit {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alliedHotelService = inject(AlliedHotelService);

  hotels: AlliedHotel[] = [];
  selectedHotel: AlliedHotel | null = null;
  criteria: BookingCriteria = {
    destination: '',
    dateRange: [],
    rooms: 1,
    guests: 1,
  };

  loadingHotels = true;
  hotelsLoadError = '';
  hotelsLoadErrorContext: 'initial' | 'availability' = 'initial';
  selectingRateId: string | null = null;

  private hotelSlug = '';
  private requestId = 0;

  ngOnInit(): void {
    this.loadHotels();
  }

  private loadHotels(): void {

    const requestId =
      this.requestId + 1;

    this.requestId = requestId;
    this.loadingHotels = true;
    this.hotelsLoadError = '';

    this.alliedHotelService
      .listActiveAlliedHotels()
      .pipe(
        catchError(() => {
          if (requestId === this.requestId) {
            this.hotelsLoadErrorContext = 'initial';
            this.hotelsLoadError = 'No fue posible cargar los hoteles aliados activos.';
          }
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        if (requestId !== this.requestId) {
          return;
        }

        const hotelSlug =
          this.route.snapshot.paramMap.get('hotelSlug') ?? '';

        this.hotelSlug = hotelSlug;
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

        if (!this.criteriaReady) {
          this.loadingHotels = false;
          return;
        }

        this.loadAvailableRates(hotelSlug, requestId);
      });
  }

  private loadAvailableRates(
    hotelSlug: string,
    requestId: number
  ): void {

    this.alliedHotelService
      .listActiveAlliedHotels(
        buildAvailabilityQueryParams(this.criteria)
      )
      .pipe(
        catchError(() => {
          if (requestId === this.requestId) {
            this.hotelsLoadErrorContext = 'availability';
            this.hotelsLoadError = 'No fue posible consultar disponibilidad.';
          }
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        if (requestId !== this.requestId) {
          return;
        }

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

        this.loadingHotels = false;
      });
  }

  retryLoadHotels(): void {

    if (this.loadingHotels) {
      return;
    }

    this.loadHotels();
  }

  retrySearchAvailability(): void {

    if (this.loadingHotels) {
      return;
    }

    const requestId =
      this.requestId + 1;

    this.requestId = requestId;
    this.loadingHotels = true;
    this.hotelsLoadError = '';
    this.loadAvailableRates(this.hotelSlug, requestId);
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

  get nights(): number {

    return getNights(
      this.criteria.dateRange
    );
  }

  get availableRoomRates(): AlliedRoomRate[] {

    if (!this.selectedHotel || !this.criteriaReady) {
      return [];
    }

    return getAvailableRoomRates(
      this.selectedHotel,
      this.criteria
    );
  }

  selectRoomRate(rate: AlliedRoomRate): void {

    if (
      !this.selectedHotel ||
      !this.criteriaReady ||
      this.selectingRateId !== null
    ) {
      return;
    }

    this.selectingRateId = rate.id;

    this.router
      .navigate(
        [
          '/reservar/solicitud',
          this.selectedHotel.slug,
          rate.id,
        ],
        {
          queryParams: this.queryParams,
        }
      )
      // A rejected navigation (e.g. the lazy chunk for the next step fails
      // to load over a bad connection) must not leave selectingRateId stuck
      // forever, which would leave every "Elegir tarifa" button disabled
      // with no way to retry short of a full reload. Converting the
      // rejection to `false` here keeps it from surfacing as an unhandled
      // promise rejection while still logging it for diagnostics.
      .catch((error: unknown) => {
        console.error(
          'No fue posible abrir la solicitud de reserva.',
          error
        );

        return false;
      })
      // finally() runs on every outcome (navigated, blocked by a guard, or
      // the caught failure above), so the button state always recovers. On
      // a successful navigation this component is already being destroyed
      // by the router by the time the promise settles, so clearing the flag
      // here is a harmless no-op rather than a visible flicker.
      .finally(() => {
        this.selectingRateId = null;
      });
  }

  getAvailableRoomRateCount(rate: AlliedRoomRate): number {

    if (!this.selectedHotel) {
      return 0;
    }

    return getAvailableRoomRateCount(
      this.selectedHotel,
      rate,
      this.criteria
    );
  }

  getRateEstimatedTotal(rate: AlliedRoomRate): number {

    return getRateEstimatedTotal(
      rate,
      this.criteria
    );
  }

  isAvailableRoomRateCountEstimated(rate: AlliedRoomRate): boolean {

    return isAvailableRoomRateCountEstimated(rate);
  }

  getRoomTypeIcon(roomType: string): string {

    return getRoomTypeIcon(roomType);
  }

  formatCurrency(value: number): string {

    return formatBookingCurrency(value);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
