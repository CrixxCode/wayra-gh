import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BillingService } from '../../../services/billing';
import { CreateBill } from './create-bill';

describe('CreateBill', () => {
  let component: CreateBill;
  let fixture: ComponentFixture<CreateBill>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateBill],
      providers: [
        {
          provide: BillingService,
          useValue: {
            createCharge: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateBill);
    component = fixture.componentInstance;
    component.reservationId = 1;
    component.chargeTypes = [{ id: 1, group: 'CHARGE_TYPE', code: 'OTRO', name: 'Otro', is_active: true, sort_order: 1 }];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

