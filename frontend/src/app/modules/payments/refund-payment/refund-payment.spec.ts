import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';

import { RefundPayment } from './refund-payment';
import { BillingService } from '../../../services/billing';

const refund = (id: number, amount: number, statusCode: string) => ({
  id,
  payment: 1,
  amount,
  status_code: statusCode,
  is_active: true
});

describe('RefundPayment', () => {
  let component: RefundPayment;
  let fixture: ComponentFixture<RefundPayment>;

  const getPaymentById = jasmine.createSpy('getPaymentById');
  const listPaymentRefunds = jasmine.createSpy('listPaymentRefunds');
  const createPaymentRefund = jasmine.createSpy('createPaymentRefund');

  const payment = { id: 1, invoice: 9, amount: 100000, is_active: true } as any;

  /** Monta el modal con el pago y los reembolsos que ya tiene ese pago. */
  const open = (refunds: any[] = [], overrides: any = {}) => {
    const active = { ...payment, ...overrides };
    getPaymentById.and.returnValue(of(active));
    listPaymentRefunds.and.returnValue(of(refunds));
    createPaymentRefund.and.returnValue(of({ id: 50 }));

    component.payment = active;
    component.ngOnChanges({ payment: new SimpleChange(null, active, true) });
  };

  beforeEach(async () => {
    getPaymentById.calls.reset();
    listPaymentRefunds.calls.reset();
    createPaymentRefund.calls.reset();

    await TestBed.configureTestingModule({
      imports: [RefundPayment],
      providers: [
        {
          provide: BillingService,
          useValue: { getPaymentById, listPaymentRefunds, createPaymentRefund }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RefundPayment);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('propone devolver todo lo que queda', () => {
    open();

    expect(component.refundableAmount).toBe(100000);
    expect(component.form.value.amount).toBe(100000);
    expect(component.isFullRefund).toBeTrue();
  });

  // Un reembolso pendiente todavia no salio de caja, pero ya compromete el saldo: si no
  // se contara, se podria pedir dos veces el mismo dinero.
  it('descuenta tambien los reembolsos pendientes de aprobar', () => {
    open([refund(10, 30000, 'PROCESADO'), refund(11, 20000, 'PENDIENTE')]);

    expect(component.processedAmount).toBe(30000);
    expect(component.pendingRequests).toBe(1);
    expect(component.refundableAmount).toBe(50000);
  });

  it('no descuenta un reembolso rechazado', () => {
    open([refund(10, 40000, 'RECHAZADO')]);

    expect(component.refundableAmount).toBe(100000);
  });

  it('avisa cuando el monto supera el saldo reembolsable', () => {
    open([refund(10, 60000, 'PROCESADO')]);
    component.form.patchValue({ amount: 50000, reason: 'Cobro duplicado' });

    expect(component.exceedsRefundable).toBeTrue();
    expect(component.canSubmit).toBeFalse();
  });

  it('anticipa cuanto quedara tras un reembolso parcial', () => {
    open();
    component.form.patchValue({ amount: 40000 });

    expect(component.isFullRefund).toBeFalse();
    expect(component.remainingAfterRefund).toBe(60000);
  });

  it('bloquea el formulario si el pago esta anulado', () => {
    open([], { is_active: false });

    expect(component.blockedReason).toContain('anulado');
    expect(component.canSubmit).toBeFalse();
  });

  it('bloquea el formulario si ya no queda saldo', () => {
    open([refund(10, 100000, 'PROCESADO')]);

    expect(component.refundableAmount).toBe(0);
    expect(component.blockedReason).toContain('reembolsado');
  });

  it('exige motivo antes de registrar', () => {
    open();
    component.form.patchValue({ reason: '' });

    expect(component.canSubmit).toBeFalse();
  });

  it('registra el reembolso y avisa a quien lo abrio', () => {
    open();
    component.form.patchValue({ amount: 25000, reason: 'Cobro duplicado', reference: ' ABC ' });
    const registrados: any[] = [];
    component.registered.subscribe((value) => registrados.push(value));

    component.submit();

    const [payload] = createPaymentRefund.calls.mostRecent().args;
    expect(payload).toEqual({
      payment: 1,
      amount: 25000,
      reason: 'Cobro duplicado',
      reference: 'ABC',
      notes: null
    });
    expect(registrados.length).toBe(1);
  });

  it('muestra el error del backend sin cerrarse', () => {
    open();
    createPaymentRefund.and.returnValue(
      throwError(() => ({ error: { detail: 'El pago ya fue reembolsado.' } }))
    );
    component.form.patchValue({ amount: 1000, reason: 'Prueba' });

    component.submit();

    expect(component.errorMessage).toBe('El pago ya fue reembolsado.');
    expect(component.submitting).toBeFalse();
  });
});
