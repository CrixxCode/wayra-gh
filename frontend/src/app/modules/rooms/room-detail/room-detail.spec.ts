import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { RoomDetail } from './room-detail';
import { RoomService } from '../../../services/room';
import { ReservationService } from '../../../services/reservation';

describe('RoomDetail', () => {
  let component: RoomDetail;
  let fixture: ComponentFixture<RoomDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomDetail],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: RoomService,
          useValue: {
            getRoomPanel: () =>
              of({
                id: 1,
                number: '101',
                status: 'DISPONIBLE',
                room_type: null,
                rate: null,
                amenities: [],
                current_guest: null,
                active_reservation: null,
                active_maintenance: null
              }),
            updateRoom: () => of({})
          }
        },
        {
          provide: ReservationService,
          useValue: {
            getReservationById: () => of(null),
            confirmReservation: () => of({}),
            checkInReservation: () => of({}),
            checkOutReservation: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
