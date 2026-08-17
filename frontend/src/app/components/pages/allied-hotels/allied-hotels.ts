import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  RouterLink,
} from '@angular/router';
import { catchError, of } from 'rxjs';

import { AlliedHotel } from '../../../shared/allied-hotels';
import { AlliedHotelService } from '../../../services/allied-hotels';
import {
  formatBookingCurrency,
  getHotelTypeIcon,
} from '../allied-booking/allied-booking-flow';

@Component({
  selector: 'app-allied-hotels',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './allied-hotels.html',
  styleUrl: './allied-hotels.css',
})
export class AlliedHotelsPage implements OnInit, AfterViewInit {

  hotels: AlliedHotel[] = [];
  loading = true;
  loadError = '';

  private readonly imageLoadErrors = new Set<string>();

  get totalRooms(): number {
    return this.hotels.reduce(
      (sum, hotel) => sum + hotel.rooms,
      0
    );
  }

  filteredHotels: AlliedHotel[] = [];

  private _search = '';
  private _typeFilter = 'Todos';

  get search(): string {
    return this._search;
  }

  set search(value: string) {
    this._search = value;
    this.recomputeFilteredHotels();
  }

  get typeFilter(): string {
    return this._typeFilter;
  }

  set typeFilter(value: string) {
    this._typeFilter = value;
    this.recomputeFilteredHotels();
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly alliedHotelService: AlliedHotelService
  ) {}

  ngOnInit(): void {
    this.loadHotels();
  }

  ngAfterViewInit(): void {
    this.scrollToFragment();
  }

  retryLoadHotels(): void {
    if (this.loading) {
      return;
    }

    this.loadHotels();
  }

  private loadHotels(): void {
    this.loading = true;
    this.loadError = '';

    this.alliedHotelService
      .listActiveAlliedHotels()
      .pipe(
        catchError(() => {
          this.loadError = 'No fue posible cargar los hoteles aliados activos.';
          return of([] as AlliedHotel[]);
        })
      )
      .subscribe((hotels) => {
        this.hotels = hotels;
        this.loading = false;
        this.recomputeFilteredHotels();
        this.scrollToFragment();
      });
  }

  private scrollToFragment(): void {

    const fragment =
      this.route.snapshot.fragment;

    if (!fragment) {
      return;
    }

    window.setTimeout(() => {
      document
        .getElementById(fragment)
        ?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
    });
  }

  get hotelTypeCount(): number {
    return this.hotelTypes.length - 1;
  }

  get hotelTypes(): string[] {

    return [
      'Todos',
      ...new Set(
        this.hotels.map(
          (hotel) => hotel.type
        )
      ),
    ];
  }

  private recomputeFilteredHotels(): void {

    const query =
      this.normalize(this._search);

    this.filteredHotels = this.hotels.filter((hotel) => {

      const matchesType =
        this._typeFilter === 'Todos' ||
        hotel.type === this._typeFilter;

      const searchableText =
        this.normalize(
          [
            hotel.name,
            hotel.type,
            hotel.city,
            hotel.department,
            hotel.country,
            hotel.highlights.join(' '),
          ].join(' ')
        );

      return (
        matchesType &&
        (
          !query ||
          searchableText.includes(query)
        )
      );
    });
  }

  clearFilters(): void {
    this._search = '';
    this._typeFilter = 'Todos';
    this.recomputeFilteredHotels();
  }

  locationLabel(hotel: AlliedHotel): string {

    const place =
      hotel.city ||
      hotel.department ||
      hotel.country ||
      '';

    return place
      ? `${place} · ${hotel.type}`
      : hotel.type;
  }

  hotelTypeIcon(hotel: AlliedHotel): string {
    return getHotelTypeIcon(hotel.type);
  }

  formatCurrency(value: number): string {
    return formatBookingCurrency(value);
  }

  hasImageError(hotel: AlliedHotel): boolean {
    return this.imageLoadErrors.has(hotel.slug);
  }

  onImageError(hotel: AlliedHotel): void {
    this.imageLoadErrors.add(hotel.slug);
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

  private normalize(value: string): string {

    return value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
