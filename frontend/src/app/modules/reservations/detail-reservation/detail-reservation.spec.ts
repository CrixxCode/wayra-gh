import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DetailReservation } from './detail-reservation';
import { ReservationService } from '../../../services/reservation';
import { BillingService } from '../../../services/billing';
import { RoomInventoryService } from '../../../services/room-inventory';

describe('DetailReservation', () => {
  let component: DetailReservation;
  let fixture: ComponentFixture<DetailReservation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailReservation],
      providers: [
        {
          provide: ReservationService,
          useValue: {
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
              })
          }
        },
        {
          provide: BillingService,
          useValue: {
            listInvoices: () => of([])
          }
        },
        {
          provide: RoomInventoryService,
          useValue: {
            listRoomInventory: () => of([])
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailReservation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the holder document as the header secondary label even when guests have nationality', () => {
    component.reservation = {
      id: 1,
      client: 1,
      client_full_name: 'Ana Perez',
      client_document_number: '123456789',
      status: 1,
      origin: 1,
      expected_check_in: '2026-03-01',
      expected_check_out: '2026-03-03',
      total_discount: 0,
      rooms_detail: [],
      guests: [
        {
          id: 10,
          reservation: 1,
          document_number: '987654321',
          first_name: 'Ana',
          last_name: 'Perez',
          nationality: 'Colombia'
        }
      ],
      deposits: []
    };

    expect(component.guestSecondaryLabel).toBe('123456789');
  });
});
