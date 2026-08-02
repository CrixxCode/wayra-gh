import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ListReservations } from './list-reservations';
import { ReservationService } from '../../../services/reservation';
import { MasterDataService } from '../../../services/master-data.service';
import { ClientsService } from '../../../services/client';
import { RoomService } from '../../../services/room';
import { PackagesService } from '../../../services/package';

describe('ListReservations', () => {
  let component: ListReservations;
  let fixture: ComponentFixture<ListReservations>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListReservations],
      providers: [
        provideRouter([]),
        {
          provide: ReservationService,
          useValue: {
            listReservationsPage: () =>
              of({
                count: 0,
                next: null,
                previous: null,
                results: []
              }),
            listReservationPolicies: () => of([]),
            getReservationById: () =>
              of({
                id: 1,
                client: 1,
                status: 1,
                origin: 1,
                expected_check_in: '2026-03-01',
                expected_check_out: '2026-03-03',
                total_discount: 0,
                rooms_detail: [],
                guests: [],
                deposits: []
              }),
            deleteReservation: () => of(null)
          }
        },
        {
          provide: MasterDataService,
          useValue: {
            listMasterData: () => of([])
          }
        },
        {
          provide: ClientsService,
          useValue: {
            listClients: () => of([])
          }
        },
        {
          provide: RoomService,
          useValue: {
            listRooms: () => of([]),
            listRates: () => of([])
          }
        },
        {
          provide: PackagesService,
          useValue: {
            listPackages: () => of([])
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListReservations);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
