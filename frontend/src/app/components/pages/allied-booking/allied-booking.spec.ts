import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AlliedBookingPage } from './allied-booking';
import { AlliedHotelService } from '../../../services/allied-hotels';
import { AlliedHotel } from '../../../shared/allied-hotels';

const hotel = (slug: string, name: string): AlliedHotel => ({
  slug,
  name,
  type: 'Hotel',
  city: 'Medellin',
  department: 'Antioquia',
  country: 'Colombia',
  description: '',
  highlights: [],
  rooms: 10,
  maxGuestsPerRoom: 2,
  nightlyRateFrom: 100000,
  roomRates: [],
  contact: ''
});

/**
 * Entrar desde un hotel aliado fija ese hotel: las fechas llevan a sus tarifas, no a todos los
 * hoteles de su ciudad (decision del 2026-10-10).
 */
describe('AlliedBookingPage con hotel fijado', () => {
  let queryParams: Record<string, string> = {};

  const build = () => {
    TestBed.configureTestingModule({
      imports: [AlliedBookingPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlliedHotelService, useValue: { listActiveAlliedHotels: () => of([]) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } }
      ]
    });
    const component = TestBed.createComponent(AlliedBookingPage).componentInstance;
    component.hotels = [hotel('wayra-demo', 'Hotel Wayra Demo'), hotel('otro', 'Otro Hotel')];
    return component;
  };

  it('fija el hotel y no salta solo a las tarifas aunque traiga fechas', () => {
    queryParams = { hotel: 'wayra-demo', checkIn: '2030-01-10', checkOut: '2030-01-12' };
    const component = build();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    (component as unknown as { applyInitialQueryParams: () => void }).applyInitialQueryParams();

    expect(component.lockedHotel?.slug).toBe('wayra-demo');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('al buscar va directo a las tarifas de ese hotel, conservandolo', () => {
    queryParams = { hotel: 'wayra-demo', checkIn: '2030-01-10', checkOut: '2030-01-12', guests: '2', rooms: '1' };
    const component = build();
    component.loadingHotels = false;
    (component as unknown as { applyInitialQueryParams: () => void }).applyInitialQueryParams();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    component.searchAvailability();

    expect(navigate).toHaveBeenCalled();
    const [commands, extras] = navigate.calls.mostRecent().args;
    expect(commands).toEqual(['/reservar/tarifas', 'wayra-demo']);
    expect(extras?.queryParams?.['hotel']).toBe('wayra-demo');
  });

  it('sin hotel en la URL no fija ninguno', () => {
    queryParams = { destination: 'Medellin, Colombia' };
    const component = build();
    (component as unknown as { applyInitialQueryParams: () => void }).applyInitialQueryParams();
    expect(component.lockedHotel).toBeNull();
  });
});
