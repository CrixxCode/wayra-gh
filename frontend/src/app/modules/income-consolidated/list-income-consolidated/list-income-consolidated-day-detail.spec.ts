import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { ListIncomeConsolidated } from './list-income-consolidated';
import { ReportsService } from '../../../services/reports';
import { AuthService } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelContextService } from '../../../services/hotel-context';
import { BillingService } from '../../../services/billing';

const dailyRow = (dateKey: string, amount: number) => ({
  date_key: dateKey,
  date_label: dateKey,
  transactions: 3,
  active_transactions: 3,
  inactive_transactions: 0,
  total_amount: amount,
  average_ticket: amount / 3,
  top_method: 'Efectivo',
  top_guest: 'Juan Moncholo'
});

const report = (dailyRows: unknown[] = []) => ({
  filters: {},
  summary: {
    total_transactions: 3,
    active_transactions: 3,
    total_collected: 200000,
    today_collected: 0,
    month_collected: 200000,
    average_ticket: 66666
  },
  daily_rows: dailyRows,
  method_rows: []
});

const payment = (id: number, amount: number, overrides: any = {}) => ({
  id,
  invoice: 1,
  invoice_number: `FAC-00${id}`,
  payment_method: 1,
  payment_method_name: 'Efectivo',
  amount,
  payment_date: '2026-08-12T15:30:00Z',
  is_active: true,
  ...overrides
});

const getIncomeConsolidatedReport = jasmine.createSpy('getIncomeConsolidatedReport');
const getUserInfo = jasmine.createSpy('getUserInfo');
const getCurrentSettings = jasmine.createSpy('getCurrentSettings');
const listPayments = jasmine.createSpy('listPayments');

const build = async (data: {
  rows?: unknown[];
  payments?: any[];
  paymentsFail?: boolean;
  embedded?: boolean;
  from?: string;
  to?: string;
} = {}) => {
  for (const spy of [getIncomeConsolidatedReport, getUserInfo, getCurrentSettings, listPayments]) {
    spy.calls.reset();
  }

  getIncomeConsolidatedReport.and.returnValue(
    of(report(data.rows ?? [dailyRow('2026-08-12', 200000)]))
  );
  getUserInfo.and.returnValue(of({ hotel_settings_id: 1, is_staff: false }));
  getCurrentSettings.and.returnValue(of({ id: 1, hotel_name: 'Hotel Wayra' }));
  listPayments.and.returnValue(
    data.paymentsFail ? throwError(() => new Error('boom')) : of(data.payments ?? [])
  );

  await TestBed.resetTestingModule()
    .configureTestingModule({
      imports: [ListIncomeConsolidated],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ReportsService, useValue: { getIncomeConsolidatedReport } },
        { provide: AuthService, useValue: { getUserInfo } },
        { provide: HotelSettingsService, useValue: { getCurrentSettings } },
        { provide: HotelContextService, useValue: { selectedHotelSettingsId: 1 } },
        { provide: BillingService, useValue: { listPayments } }
      ]
    })
    .compileComponents();

  const fixture = TestBed.createComponent(ListIncomeConsolidated);
  const component = fixture.componentInstance;
  component.embedded = data.embedded ?? false;
  component.rangeFrom = data.from ?? '';
  component.rangeTo = data.to ?? '';
  fixture.detectChanges();
  return component;
};

// La fila dice cuanto entro ese dia; el modal dice de donde salio cada peso.
describe('ListIncomeConsolidated: detalle de un dia', () => {
  // El backend filtra por fecha local, con las dos puntas en el mismo dia.
  it('pide solo los cobros de ese dia', async () => {
    const component = await build();

    component.openDayDetail(component.dailyRows[0]);

    expect(listPayments).toHaveBeenCalledWith(
      jasmine.objectContaining({
        payment_date_after: '2026-08-12',
        payment_date_before: '2026-08-12'
      })
    );
  });

  // Los anulados tienen que verse: explican por que el dia cuadra o no.
  it('trae tambien los anulados', async () => {
    const component = await build();

    component.openDayDetail(component.dailyRows[0]);

    expect(listPayments).toHaveBeenCalledWith(jasmine.objectContaining({ include_inactive: true }));
  });

  it('suma solo lo vigente y cuenta lo anulado aparte', async () => {
    const component = await build({
      payments: [payment(1, 150000), payment(2, 50000), payment(3, 999999, { is_active: false })]
    });

    component.openDayDetail(component.dailyRows[0]);

    expect(component.dayDetailTotal).toBe(200000);
    expect(component.dayDetailVoided).toBe(1);
    expect(component.dayPayments.length).toBe(3);
  });

  // Con la lista filtrada por metodo el detalle trae mas: dos cifras distintas sin
  // explicacion es peor que una nota diciendo por que.
  it('avisa cuando el detalle no cuadra con la fila', async () => {
    const component = await build({ payments: [payment(1, 200000)] });

    component.openDayDetail(component.dailyRows[0]);
    expect(component.dayDetailMatchesRow).toBeTrue();

    component.dayPayments = [payment(1, 120000)] as never;
    expect(component.dayDetailMatchesRow).toBeFalse();
  });

  it('el dia sin fecha no abre nada: no hay dia que detallar', async () => {
    const component = await build({ rows: [dailyRow('SIN_FECHA', 5000)] });

    component.openDayDetail(component.dailyRows[0]);

    expect(component.dayDetail).toBeNull();
    expect(listPayments).not.toHaveBeenCalled();
  });

  it('avisa si el detalle falla, sin cerrar el modal', async () => {
    const component = await build({ paymentsFail: true });

    component.openDayDetail(component.dailyRows[0]);

    expect(component.dayDetail).not.toBeNull();
    expect(component.loadingDayDetail).toBeFalse();
    expect(component.dayDetailError).toContain('No fue posible');
  });

  // Sin cobros el aviso de descuadre seria ruido encima del "no hay cobros".
  it('no avisa de descuadre cuando no hay nada que comparar', async () => {
    const component = await build({ payments: [] });

    component.openDayDetail(component.dailyRows[0]);

    expect(component.dayPayments.length).toBe(0);
    expect(component.dayDetailMatchesRow).toBeTrue();
  });

  it('escape cierra el modal', async () => {
    const component = await build({ payments: [payment(1, 200000)] });

    component.openDayDetail(component.dailyRows[0]);
    component.onEscape();

    expect(component.dayDetail).toBeNull();
  });

  it('cerrar limpia lo cargado', async () => {
    const component = await build({ payments: [payment(1, 150000)] });

    component.openDayDetail(component.dailyRows[0]);
    component.closeDayDetail();

    expect(component.dayDetail).toBeNull();
    expect(component.dayPayments).toEqual([]);
  });
});

describe('ListIncomeConsolidated: rango del contenedor', () => {
  it('el rango del contenedor manda sobre el periodo propio', async () => {
    await build({ embedded: true, from: '2026-01-01', to: '2026-01-31' });

    expect(getIncomeConsolidatedReport).toHaveBeenCalledWith(
      jasmine.objectContaining({ start_date: '2026-01-01', end_date: '2026-01-31' })
    );
  });

  // Empotrado sin rango es "todo", no "vuelve a tu mes por defecto".
  it('empotrado sin rango pide todo el historico', async () => {
    await build({ embedded: true });

    expect(getIncomeConsolidatedReport).toHaveBeenCalledWith(
      jasmine.objectContaining({ period: 'ALL' })
    );
  });

  it('suelto conserva su propio periodo', async () => {
    await build();

    expect(getIncomeConsolidatedReport).toHaveBeenCalledWith(
      jasmine.objectContaining({ period: 'THIS_MONTH' })
    );
  });
});
