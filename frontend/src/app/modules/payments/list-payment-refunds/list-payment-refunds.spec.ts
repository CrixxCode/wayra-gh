import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ListPaymentRefunds } from './list-payment-refunds';
import { BillingService } from '../../../services/billing';
import { AuthService } from '../../../services/auth/auth';

describe('ListPaymentRefunds', () => {
  let component: ListPaymentRefunds;
  let fixture: ComponentFixture<ListPaymentRefunds>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListPaymentRefunds],
      providers: [
        {
          provide: BillingService,
          useValue: {
            listPaymentRefunds: () => of([])
          }
        },
        {
          provide: AuthService,
          useValue: {
            getUserInfo: () => of({ roles: [] })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListPaymentRefunds);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
