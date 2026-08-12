import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { BillingPage } from './billing-page';
import { AuthService } from '../../../services/auth/auth';
import { BillingService } from '../../../services/billing';

const invoice = (id: number, total: number, statusCode = 'EMITIDA', isActive = true) => ({
  id,
  invoice_number: `F-${id}`,
  total_amount: total,
  status_code: statusCode,
  is_active: isActive
});

const payment = (id: number, invoiceId: number, amount: number, isActive = true) => ({
  id,
  invoice: invoiceId,
  amount,
  is_active: isActive
});

const refund = (id: number, amount: number, statusCode = 'PROCESADO') => ({
  id,
  payment: 1,
  amount,
  status_code: statusCode,
  is_active: true
});

describe('BillingPage', () => {
  let component: BillingPage;
  let fixture: ComponentFixture<BillingPage>;

  const listInvoices = jasmine.createSpy('listInvoices');
  const listPayments = jasmine.createSpy('listPayments');
  const listPaymentRefunds = jasmine.createSpy('listPaymentRefunds');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (
    data: {
      invoices?: any[];
      payments?: any[];
      refunds?: any[];
      tab?: string;
      scopes?: string[];
    } = {}
  ) => {
    listInvoices.calls.reset();
    listPayments.calls.reset();
    listPaymentRefunds.calls.reset();
    navigate.calls.reset();

    listInvoices.and.returnValue(of(data.invoices || []));
    listPayments.and.returnValue(of(data.payments || []));
    listPaymentRefunds.and.returnValue(of(data.refunds || []));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [BillingPage],
        providers: [
          // Las listas hijas se montan al pintar la pestaña activa y traen sus
          // propias dependencias HTTP.
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          {
            provide: BillingService,
            useValue: { listInvoices, listPayments, listPaymentRefunds }
          },
          {
            provide: AuthService,
            useValue: {
              getUserInfo: () =>
                of({ resource_keys: data.scopes ?? ['payment-refunds.read'] })
            }
          },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { queryParamMap: { get: () => data.tab ?? null } }
            }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(BillingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const metric = (key: string) => component.metrics.find((item) => item.key === key)!;
  const money = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);

  it('abre en facturas por defecto', async () => {
    await setup();

    expect(component.activeTab).toBe('invoices');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'refunds' });

    expect(component.activeTab).toBe('refunds');
  });

  it('ignora una pestaña desconocida', async () => {
    await setup({ tab: 'inventado' });

    expect(component.activeTab).toBe('invoices');
  });

  it('cuenta cada entidad en su pestaña', async () => {
    await setup({
      invoices: [invoice(1, 100), invoice(2, 200)],
      payments: [payment(10, 1, 50)],
      refunds: [refund(20, 10), refund(21, 5)]
    });

    expect(component.tabCount('invoices')).toBe(2);
    expect(component.tabCount('payments')).toBe(1);
    expect(component.tabCount('refunds')).toBe(2);
  });

  it('deja la pestaña elegida en la URL para poder compartirla', async () => {
    await setup();

    component.selectTab('payments');

    expect(component.activeTab).toBe('payments');
    const [, extras] = navigate.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ tab: 'payments' });
  });

  describe('metricas', () => {
    it('no cuenta como facturada una factura anulada del histórico', async () => {
      await setup({ invoices: [invoice(1, 100), invoice(2, 500, 'EMITIDA', false)] });

      expect(component.billedTotal).toBe(100);
    });

    it('descuenta del cobrado solo el reembolso ya procesado', async () => {
      await setup({
        payments: [payment(1, 1, 300)],
        refunds: [refund(10, 100, 'PROCESADO'), refund(11, 50, 'PENDIENTE')]
      });

      expect(component.refundedTotal).toBe(100);
      expect(component.collectedTotal).toBe(200);
    });

    // El saldo por cobrar es el numero que no tenia ninguna de las tres vistas.
    it('calcula el pendiente solo sobre facturas que siguen esperando cobro', async () => {
      await setup({
        invoices: [
          invoice(1, 1000, 'EMITIDA'),
          invoice(2, 400, 'PAGADA'),
          invoice(3, 900, 'ANULADA')
        ],
        payments: [payment(10, 1, 250), payment(11, 2, 400)]
      });

      expect(component.pendingTotal).toBe(750);
      expect(metric('pending').value).toBe(money(750));
      expect(metric('pending').tone).toBe('warning');
    });

    it('no deja el pendiente en negativo si se cobro de mas', async () => {
      await setup({
        invoices: [invoice(1, 100, 'EMITIDA')],
        payments: [payment(10, 1, 150)]
      });

      expect(component.pendingTotal).toBe(0);
      expect(metric('pending').tone).toBe('success');
    });

    it('avisa de las facturas cobradas a medias', async () => {
      await setup({
        invoices: [invoice(1, 1000, 'EMITIDA'), invoice(2, 500, 'EMITIDA')],
        payments: [payment(10, 1, 200)]
      });

      expect(component.partiallyPaidCount).toBe(1);
      expect(metric('pending').note).toContain('1 factura');
    });

    it('marca en rojo los reembolsos que esperan aprobacion', async () => {
      await setup({ refunds: [refund(1, 80, 'PENDIENTE'), refund(2, 20, 'PROCESADO')] });

      expect(component.pendingRefunds.length).toBe(1);
      expect(metric('refunds').tone).toBe('danger');
      expect(metric('refunds').note).toContain(money(80));
    });
  });

  describe('alcance por rol', () => {
    // Reembolsos era la unica de las tres que recepcion no tenia en su menu: unir las
    // vistas no debe regalarle el acceso.
    it('esconde la pestaña de reembolsos sin el permiso', async () => {
      await setup({ scopes: ['invoices.read', 'payments.read'] });

      expect(component.canSeeRefunds).toBeFalse();
      expect(component.visibleTabs.map((tab) => tab.key)).toEqual(['invoices', 'payments']);
      expect(component.metrics.some((item) => item.tab === 'refunds')).toBeFalse();
    });

    it('devuelve a facturas si la URL pedia reembolsos sin permiso', async () => {
      await setup({ tab: 'refunds', scopes: ['invoices.read'] });

      expect(component.activeTab).toBe('invoices');
    });

    it('muestra las tres con el permiso', async () => {
      await setup({ scopes: ['payment-refunds.read'] });

      expect(component.visibleTabs.length).toBe(3);
    });
  });

  // La escritura ya invalido el cache desde el servicio, asi que esto va al servidor
  // igual. Forzarlo ademas anularia la deduplicacion de peticiones en vuelo y la lista
  // de la pestaña pediria lo mismo por segunda vez (429 con unos pocos clics).
  it('recarga sin forzar el cache cuando cambia algo', async () => {
    await setup();
    listInvoices.calls.reset();

    component.onBillingChanged();

    expect(listInvoices).toHaveBeenCalled();
    const [filters] = listInvoices.calls.mostRecent().args;
    expect(filters.forceRefresh).toBeFalse();
  });

  // `loading` desmonta el panel entero: si se activara al recargar, registrar un pago
  // se veria como si la pantalla se recargara.
  it('no vacia la pantalla al recargar tras un cambio', async () => {
    await setup();
    let loadingDuranteRecarga = false;
    listInvoices.and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      return of([]);
    });

    component.onBillingChanged();

    expect(loadingDuranteRecarga).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
