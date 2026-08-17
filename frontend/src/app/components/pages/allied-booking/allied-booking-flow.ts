import {
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ParamMap, Params } from '@angular/router';

import {
  AlliedHotel,
  AlliedRoomRate,
} from '../../../shared/allied-hotels';

export type BookingSearchControlName =
  | 'destination'
  | 'dateRange'
  | 'rooms'
  | 'guests';

export interface BookingCriteria {
  destination: string;
  dateRange: Date[];
  rooms: number;
  guests: number;
}

export interface BookingDestinationOption {
  city: string;
  country: string;
}

export function buildBookingCriteria(raw: {
  destination: string;
  dateRange: unknown;
  rooms: number;
  guests: number;
}): BookingCriteria {

  return {
    destination: raw.destination || '',
    dateRange: getSelectedDateRange(raw.dateRange),
    rooms: normalizeNumber(raw.rooms, 1, 1, 4),
    guests: normalizeNumber(raw.guests, 1, 1, 8),
  };
}

export function parseBookingCriteriaFromQuery(
  queryParams: ParamMap,
  hotels: AlliedHotel[],
  fallbackHotelSlug = ''
): BookingCriteria {

  const requestedHotel =
    fallbackHotelSlug ||
    queryParams.get('hotel') ||
    '';

  const requestedHotelOption =
    hotels.find(
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
      parseDate(checkIn),
      parseDate(checkOut),
    ].filter(
      (date): date is Date =>
        date instanceof Date
    );

  return {
    destination,
    dateRange,
    rooms: normalizeNumberParam(queryParams.get('rooms'), 1, 1, 4),
    guests: normalizeNumberParam(queryParams.get('guests'), 1, 1, 8),
  };
}

export function buildBookingQueryParams(criteria: BookingCriteria): Params {

  const [
    checkIn,
    checkOut,
  ] = getSelectedDateRange(criteria.dateRange);

  const queryParams: Params = {
    destination: criteria.destination,
    rooms: criteria.rooms,
    guests: criteria.guests,
  };

  if (checkIn) {
    queryParams['checkIn'] = toDateInputValue(checkIn);
  }

  if (checkOut) {
    queryParams['checkOut'] = toDateInputValue(checkOut);
  }

  return queryParams;
}

export function buildAvailabilityQueryParams(criteria: BookingCriteria): {
  checkIn?: string;
  checkOut?: string;
  rooms: number;
  guests: number;
} {

  const [
    checkIn,
    checkOut,
  ] = getSelectedDateRange(criteria.dateRange);

  const queryParams = {
    rooms: criteria.rooms,
    guests: criteria.guests,
  };

  if (!checkIn || !checkOut) {
    return queryParams;
  }

  return {
    ...queryParams,
    checkIn: toDateInputValue(checkIn),
    checkOut: toDateInputValue(checkOut),
  };
}

export function getDestinationOptions(
  hotels: AlliedHotel[]
): BookingDestinationOption[] {

  const optionsByKey =
    new Map<string, BookingDestinationOption>();

  hotels.forEach((hotel) => {
    const key =
      normalizeText(
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

export function filterDestinationOptions(
  hotels: AlliedHotel[],
  query: string
): BookingDestinationOption[] {

  const normalizedQuery =
    normalizeText(query);

  const options =
    normalizedQuery
      ? getDestinationOptions(hotels).filter(
          (option) =>
            matchesDestination(
              option.country,
              option.city,
              query
            )
        )
      : getDestinationOptions(hotels);

  return options.slice(0, 6);
}

export function getSelectedDateRange(value: unknown): Date[] {

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (date): date is Date =>
      date instanceof Date &&
      !Number.isNaN(date.getTime())
  );
}

export function hasIncompleteDateRange(dateRange: Date[]): boolean {

  return (
    dateRange.length > 0 &&
    dateRange.length < 2
  );
}

export function getNights(dateRange: Date[]): number {

  const [
    checkIn,
    checkOut,
  ] = dateRange;

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

export function hasDateRangeError(dateRange: Date[]): boolean {

  return (
    dateRange.length === 2 &&
    getNights(dateRange) <= 0
  );
}

export function hasDestinationMatches(
  hotels: AlliedHotel[],
  destination: string
): boolean {

  return hotels.some(
    (hotel) =>
      matchesDestination(
        hotel.country,
        hotel.city,
        destination
      )
  );
}

export function isBookingCriteriaComplete(
  hotels: AlliedHotel[],
  criteria: BookingCriteria
): boolean {

  const dateRange =
    getSelectedDateRange(criteria.dateRange);

  return (
    Boolean(criteria.destination.trim()) &&
    dateRange.length === 2 &&
    criteria.rooms >= 1 &&
    criteria.guests >= 1 &&
    !hasIncompleteDateRange(dateRange) &&
    !hasDateRangeError(dateRange) &&
    hasDestinationMatches(hotels, criteria.destination)
  );
}

export function getAvailableHotels(
  hotels: AlliedHotel[],
  criteria: BookingCriteria
): AlliedHotel[] {

  if (!isBookingCriteriaComplete(hotels, criteria)) {
    return [];
  }

  return hotels
    .filter((hotel) => {

      const matchesSearchDestination =
        matchesDestination(
          hotel.country,
          hotel.city,
          criteria.destination
        );

      const hasAvailableRates =
        getAvailableRoomRates(hotel, criteria).length > 0;

      return (
        matchesSearchDestination &&
        hasAvailableRates
      );
    })
    .sort(
      (first, second) =>
        getRateFrom(first, criteria) -
        getRateFrom(second, criteria)
    );
}

export function getAvailableRoomRates(
  hotel: AlliedHotel,
  criteria: BookingCriteria
): AlliedRoomRate[] {

  return hotel.roomRates
    .filter((rate) => {

      const availableRooms =
        getAvailableRoomRateCount(
          hotel,
          rate,
          criteria
        );

      const hasEnoughRooms =
        availableRooms >= criteria.rooms;

      const hasEnoughGuestCapacity =
        criteria.guests <=
        criteria.rooms * rate.maxGuests;

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

export function getAvailableRoomCount(
  hotel: AlliedHotel,
  criteria: BookingCriteria
): number {

  if (typeof hotel.availableRooms === 'number') {
    return hotel.availableRooms;
  }

  const [
    checkIn,
  ] = getSelectedDateRange(criteria.dateRange);

  const nights =
    getNights(criteria.dateRange);

  if (!checkIn || nights <= 0) {
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
    nights * 3;

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

const HOTEL_TYPE_ICONS: Record<string, string> = {
  'Hotel': 'pi pi-building',
  'Hostal': 'pi pi-home',
  'Apartahotel': 'pi pi-building',
  'Alojamiento turístico': 'pi pi-compass',
};

export function getHotelTypeIcon(type: string): string {

  return HOTEL_TYPE_ICONS[type] ?? 'pi pi-building';
}

const ROOM_TYPE_ICON_RULES: {
  keyword: string;
  icon: string;
}[] = [
  {
    keyword: 'suite',
    icon: 'pi pi-star',
  },
  {
    keyword: 'cabana',
    icon: 'pi pi-home',
  },
  {
    keyword: 'compartid',
    icon: 'pi pi-users',
  },
  {
    keyword: 'apartamento',
    icon: 'pi pi-building',
  },
];

export function getRoomTypeIcon(roomType: string): string {

  const normalized =
    normalizeText(roomType);

  const rule =
    ROOM_TYPE_ICON_RULES.find(
      (candidate) =>
        normalized.includes(candidate.keyword)
    );

  return rule?.icon ?? 'pi pi-building';
}

export function isAvailableRoomCountEstimated(
  hotel: AlliedHotel
): boolean {

  return typeof hotel.availableRooms !== 'number';
}

export function isAvailableRoomRateCountEstimated(
  rate: AlliedRoomRate
): boolean {

  return typeof rate.availableRooms !== 'number';
}

export function getAvailableRoomRateCount(
  hotel: AlliedHotel,
  rate: AlliedRoomRate,
  criteria: BookingCriteria
): number {

  if (typeof rate.availableRooms === 'number') {
    return rate.availableRooms;
  }

  const [
    checkIn,
  ] = getSelectedDateRange(criteria.dateRange);

  const nights =
    getNights(criteria.dateRange);

  if (!checkIn || nights <= 0) {
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
    nights * 5;

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

export function getEstimatedTotal(
  hotel: AlliedHotel,
  criteria: BookingCriteria
): number {

  return getRateFrom(hotel, criteria) * criteria.rooms * getNights(criteria.dateRange);
}

export function getRateEstimatedTotal(
  rate: AlliedRoomRate,
  criteria: BookingCriteria
): number {

  return rate.nightlyRate * criteria.rooms * getNights(criteria.dateRange);
}

export function getRateFrom(
  hotel: AlliedHotel,
  criteria: BookingCriteria
): number {

  const rates =
    getAvailableRoomRates(hotel, criteria);

  return (
    rates[0]?.nightlyRate ??
    hotel.nightlyRateFrom
  );
}

export function formatBookingCurrency(value: number): string {

  return new Intl.NumberFormat(
    'es-CO',
    {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }
  ).format(value || 0);
}

export function findHotelBySlug(
  hotels: AlliedHotel[],
  slug: string
): AlliedHotel | null {

  return (
    hotels.find(
      (hotel) => hotel.slug === slug
    ) ?? null
  );
}

export function findRoomRateById(
  hotel: AlliedHotel | null,
  rateId: string
): AlliedRoomRate | null {

  if (!hotel) {
    return null;
  }

  return (
    hotel.roomRates.find(
      (rate) => rate.id === rateId
    ) ?? null
  );
}

export function getTodayDate(): Date {

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

export function matchesDestination(
  country: string,
  city: string,
  destination: string
): boolean {

  const normalizedDestination =
    normalizeText(destination);

  if (!normalizedDestination) {
    return false;
  }

  return [
    country,
    city,
    `${city}, ${country}`,
  ].some(
    (option) =>
      normalizeText(option)
        .includes(normalizedDestination)
  );
}

export function toDateInputValue(date: Date): string {

  const year =
    date.getFullYear();

  const month =
    `${date.getMonth() + 1}`.padStart(2, '0');

  const day =
    `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function phoneFormatValidator(
  control: AbstractControl
): ValidationErrors | null {

  const value =
    (control.value ?? '').toString().trim();

  if (!value) {
    return null;
  }

  if (!/^\+?[0-9\s\-()]+$/.test(value)) {
    return { phoneFormat: true };
  }

  const digitCount =
    value.replace(/[^0-9]/g, '').length;

  return digitCount >= 7 && digitCount <= 15
    ? null
    : { phoneFormat: true };
}

const DOCUMENT_NUMBER_PATTERNS: Record<string, RegExp> = {
  CC: /^[0-9]{5,15}$/,
  CE: /^[0-9]{5,15}$/,
  DNI: /^[0-9]{5,15}$/,
  PASAPORTE: /^[A-Za-z0-9]{5,15}$/,
};

export function documentNumberFormatValidator(
  control: AbstractControl
): ValidationErrors | null {

  const value =
    (control.value ?? '').toString().trim();

  if (!value) {
    return null;
  }

  const documentType =
    control.parent?.get('guestDocumentType')?.value ?? 'CC';

  const pattern =
    DOCUMENT_NUMBER_PATTERNS[documentType] ?? DOCUMENT_NUMBER_PATTERNS['CC'];

  return pattern.test(value)
    ? null
    : { documentNumberFormat: true };
}

function normalizeNumber(
  value: number,
  fallback: number,
  min: number,
  max: number
): number {

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(value),
      min
    ),
    max
  );
}

function normalizeNumberParam(
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

function parseDate(value: string): Date | null {

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

function normalizeText(value: string): string {

  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
