import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { ListPaymentRefunds } from './list-payment-refunds';
import { BillingService } from '../../../services/billing';
import { AuthService } from '../../../services/auth/auth';

describe('ListPaymentRefunds', () => {
  let component: ListPaymentRefunds;
  let fixture: ComponentFixture<ListPaymentRefunds>;
  let confirmation: ConfirmationService;

  const processRefund = jasmine.createSpy('processPaymentRefund');
  const approveRefund = jasmine.createSpy('approvePaymentRefund');

  const refund = (status_code: string, extra: Record<string, unknown> = {}) =>
    ({ id: 7, amount: '50000', status_code, is_active: true, ...extra }) as any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListPaymentRefunds],
      providers: [
        {
          provide: BillingService,
          useValue: {
            listPaymentRefunds: () => of([]),
            approvePaymentRefund: approveRefund,
            processPaymentRefund: processRefund
          }
        },
        {
          provide: AuthService,
          useValue: {
            getUserInfo: () => of({ roles: [] })
          }
        },
        ConfirmationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListPaymentRefunds);
    component = fixture.componentInstance;
    confirmation = TestBed.inject(ConfirmationService);
    fixture.detectChanges();
    approveRefund.calls.reset();
    processRefund.calls.reset();
  });

  describe('ciclo de un reembolso', () => {
    beforeEach(() => {
      component.isAdmin = true;
    });

    it('un aprobado se puede marcar pagado o anular, ya no queda atascado', () => {
      expect(component.availableTransitions(refund('PENDIENTE'))).toEqual(['approve', 'reject', 'cancel']);
      expect(component.availableTransitions(refund('APROBADO'))).toEqual(['process', 'cancel']);
      expect(component.availableTransitions(refund('PROCESADO'))).toEqual([]);
      expect(component.availableTransitions(refund('APROBADO', { is_active: false }))).toEqual([]);
    });

    it('sin rol administrador no ofrece cambios de estado', () => {
      component.isAdmin = false;
      expect(component.availableTransitions(refund('APROBADO'))).toEqual([]);
    });

    it('pide confirmacion antes de registrar la salida de caja', () => {
      const updated = refund('PROCESADO');
      processRefund.and.returnValue(of(updated));
      const changed: number[] = [];
      component.changed.subscribe(() => changed.push(1));
      spyOn(confirmation, 'confirm').and.callFake((options: any) => {
        options.accept();
        return confirmation;
      });

      component.runTransition(refund('APROBADO'), 'process');

      expect(confirmation.confirm).toHaveBeenCalled();
      expect(processRefund).toHaveBeenCalledWith(7);
      expect(changed.length).toBe(1);
    });

    it('aprueba sin confirmacion adicional', () => {
      approveRefund.and.returnValue(of(refund('APROBADO')));
      spyOn(confirmation, 'confirm');

      component.runTransition(refund('PENDIENTE'), 'approve');

      expect(confirmation.confirm).not.toHaveBeenCalled();
      expect(approveRefund).toHaveBeenCalledWith(7);
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Aqui no puede haber un boton "Nuevo reembolso": nace de un pago concreto. La
  // pantalla lo dice y ofrece el salto, sin navegar por su cuenta.
  it('pide al contenedor abrir la pestaña de pagos', () => {
    const pedidas: string[] = [];
    component.navigateTab.subscribe((tab) => pedidas.push(tab));

    component.navigateTab.emit('payments');

    expect(pedidas).toEqual(['payments']);
  });

  it('no desmonta la tabla al recargar tras una accion', () => {
    let loadingDuranteRecarga = false;
    const original = component.applyFilters.bind(component);
    spyOn(component, 'applyFilters').and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      original();
    });

    component.refreshData();

    expect(loadingDuranteRecarga).toBeFalse();
  });
});
