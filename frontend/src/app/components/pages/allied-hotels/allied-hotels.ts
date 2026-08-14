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

  get totalRooms(): number {
    return this.hotels.reduce(
      (sum, hotel) => sum + hotel.rooms,
      0
    );
  }

  search = '';
  typeFilter = 'Todos';

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

  get filteredHotels(): AlliedHotel[] {

    const query =
      this.normalize(this.search);

    return this.hotels.filter((hotel) => {

      const matchesType =
        this.typeFilter === 'Todos' ||
        hotel.type === this.typeFilter;

      const searchableText =
        this.normalize(
          [
            hotel.name,
            hotel.type,
            hotel.city,
            hotel.department,
            hotel.country,
            hotel.description,
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
    this.search = '';
    this.typeFilter = 'Todos';
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
