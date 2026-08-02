import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { MasterDataService } from '../../../services/master-data.service';
import { PackagesService } from '../../../services/package';
import { ReservationService } from '../../../services/reservation';
import { ServicesService } from '../../../services/service';
import { BillingService } from '../../../services/billing';
import { DetailBill } from './detail-bill';

describe('DetailBill', () => {
  let component: DetailBill;
  let fixture: ComponentFixture<DetailBill>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailBill],
      providers: [
        {
          provide: BillingService,
          useValue: {
            getInvoiceById: () => of({}),
            downloadInvoicePdf: () => of(new Blob()),
            listCharges: () => of([]),
            listPayments: () => of([]),
            listCreditNotes: () => of([]),
            updateCharge: () => of({}),
            updateInvoice: () => of({}),
            updateCreditNote: () => of({})
          }
        },
        {
          provide: ReservationService,
          useValue: {
            getReservationById: () => of(null)
          }
        },
        {
          provide: MasterDataService,
          useValue: {
            listMasterData: () => of([])
          }
        },
        {
          provide: ServicesService,
          useValue: {
            listServices: () => of([])
          }
        },
        {
          provide: PackagesService,
          useValue: {
            listPackages: () => of([])
          }
        },
        ConfirmationService
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailBill);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
