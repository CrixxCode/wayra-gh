import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BillingService } from '../../../services/billing';
import { MasterDataService } from '../../../services/master-data.service';
import { ReservationService } from '../../../services/reservation';
import { ListBill } from './list-bill';

describe('ListBill', () => {
  let component: ListBill;
  let fixture: ComponentFixture<ListBill>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListBill],
      providers: [
        {
          provide: BillingService,
          useValue: {
            listInvoices: () => of([])
          }
        },
        {
          provide: ReservationService,
          useValue: {
            listReservationsPage: () =>
              of({
                count: 0,
                next: null,
                previous: null,
                results: []
              })
          }
        },
        {
          provide: MasterDataService,
          useValue: {
            listMasterData: () => of([])
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListBill);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
