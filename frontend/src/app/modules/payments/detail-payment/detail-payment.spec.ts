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
            updatePayment: () => of({})
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

  // El detalle informa; la decision de devolver dinero se toma en su propio modal.
  it('pide abrir el modal de reembolso en vez de registrarlo', () => {
    const payment: any = { id: 4, invoice: 1, amount: 5000, is_active: true };
    component.activePayment = payment;
    const pedidos: any[] = [];
    component.refundRequested.subscribe((value) => pedidos.push(value));

    component.requestRefund();

    expect(pedidos).toEqual([payment]);
  });

  it('no ofrece reembolsar un pago anulado', () => {
    component.activePayment = { id: 4, invoice: 1, amount: 5000, is_active: false } as any;
    const pedidos: any[] = [];
    component.refundRequested.subscribe((value) => pedidos.push(value));

    component.requestRefund();

    expect(pedidos).toEqual([]);
  });
});
