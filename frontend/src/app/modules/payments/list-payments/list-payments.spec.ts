import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ListPayments } from './list-payments';

describe('ListPayments', () => {
  let component: ListPayments;
  let fixture: ComponentFixture<ListPayments>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListPayments],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListPayments);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Consultar y devolver dinero son dos intenciones distintas, con un modal cada una.
  it('abre el reembolso en su propio modal', () => {
    const payment: any = { id: 7, invoice: 1, amount: 100, is_active: true };

    component.openRefund(payment);

    expect(component.refundingPayment).toBe(payment);
  });

  // Sin esto quedarian dos capas apiladas al pulsar "Reembolsar" desde el detalle.
  it('cierra el detalle al abrir el reembolso', () => {
    const payment: any = { id: 7, invoice: 1, amount: 100, is_active: true };
    component.openDetail(payment);

    component.openRefund(payment);

    expect(component.selectedPayment).toBeNull();
  });

  it('recarga al registrar un reembolso y cierra el modal', () => {
    const payment: any = { id: 7, invoice: 1, amount: 100, is_active: true };
    component.openRefund(payment);
    spyOn(component, 'refreshPaymentsData');

    component.onRefundRegistered();

    expect(component.refundingPayment).toBeNull();
    expect(component.refreshPaymentsData).toHaveBeenCalled();
  });

  it('no desmonta la tabla al recargar tras una accion', () => {
    let loadingDuranteRecarga = false;
    const original = component.applyFilters.bind(component);
    spyOn(component, 'applyFilters').and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      original();
    });

    component.refreshPaymentsData();

    expect(loadingDuranteRecarga).toBeFalse();
  });
});
