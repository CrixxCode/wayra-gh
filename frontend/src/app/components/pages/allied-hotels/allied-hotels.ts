import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  RouterLink,
} from '@angular/router';

import {
  ALLIED_HOTELS,
  AlliedHotel,
} from '../../../shared/allied-hotels';

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
export class AlliedHotelsPage implements AfterViewInit {

  readonly hotels = ALLIED_HOTELS;
  readonly totalRooms =
    this.hotels.reduce(
      (sum, hotel) => sum + hotel.rooms,
      0
    );

  search = '';
  typeFilter = 'Todos';

  constructor(
    private readonly route: ActivatedRoute
  ) {}

  ngAfterViewInit(): void {

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
