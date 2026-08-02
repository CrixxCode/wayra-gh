import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { DetailPayment } from './detail-payment';
import { BillingService } from '../../../services/billing';
import { AuthService } from '../../../services/auth/auth';

describe('DetailPayment', () => {
  let component: DetailPayment;
  let fixture: ComponentFixture<DetailPayment>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailPayment],
      providers: [
        {
          provide: BillingService,
          useValue: {
            getPaymentById: () => of(null),
            getInvoiceById: () => of(null),
            listPayments: () => of([]),
            listPaymentRefunds: () => of([]),
            updatePayment: () => of({}),
            createPaymentRefund: () => of({ id: 1 }),
            processPaymentRefund: () => of({})
          }
        },
        {
          provide: ConfirmationService,
          useValue: { confirm: () => {} }
        },
        {
          provide: AuthService,
          useValue: {
            getUserInfo: () => of({ roles: [{ slug: 'admin' }] })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailPayment);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
