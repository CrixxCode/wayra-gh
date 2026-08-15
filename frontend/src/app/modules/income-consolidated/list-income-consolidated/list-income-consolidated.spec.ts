import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { ListIncomeConsolidated } from './list-income-consolidated';
import { ReportsService } from '../../../services/reports';
import { AuthService } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelContextService } from '../../../services/hotel-context';

const dailyRow = (dateKey: string, amount: number, overrides: any = {}) => ({
  date_key: dateKey,
  date_label: dateKey,
  transactions: 3,
  active_transactions: 3,
  inactive_transactions: 0,
  total_amount: amount,
  average_ticket: amount / 3,
  top_method: 'Efectivo',
  top_guest: 'Juan Moncholo',
  ...overrides
});

const methodRow = (label: string, amount: number, share: number) => ({
  method_key: label.toUpperCase(),
  method_label: label,
  transactions: 2,
  active_transactions: 2,
  inactive_transactions: 0,
  total_amount: amount,
  average_ticket: amount / 2,
  share_percent: share
});

const report = (overrides: any = {}) => ({
  filters: {},
  summary: {
    total_transactions: 8,
    active_transactions: 8,
    total_collected: 292000,
    today_collected: 192000,
    month_collected: 292000,
    average_ticket: 36500
  },
  daily_rows: overrides.daily_rows || [],
  method_rows: overrides.method_rows || []
});

describe('ListIncomeConsolidated', () => {
  let component: ListIncomeConsolidated;
  let fixture: ComponentFixture<ListIncomeConsolidated>;

  const getIncomeConsolidatedReport = jasmine.createSpy('getIncomeConsolidatedReport');
  const getUserInfo = jasmine.createSpy('getUserInfo');
  const getCurrentSettings = jasmine.createSpy('getCurrentSettings');

  const setup = async (data: any = {}) => {
    getIncomeConsolidatedReport.calls.reset();
    getUserInfo.calls.reset();
    getCurrentSettings.calls.reset();

    getIncomeConsolidatedReport.and.returnValue(of(data.report ?? report()));
    getUserInfo.and.returnValue(of({ hotel_settings_id: 1, is_staff: false }));
    getCurrentSettings.and.returnValue(of({ id: 1, hotel_name: 'Hotel Wayra' }));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [ListIncomeConsolidated],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ReportsService, useValue: { getIncomeConsolidatedReport } },
          { provide: AuthService, useValue: { getUserInfo } },
          { provide: HotelSettingsService, useValue: { getCurrentSettings } },
          { provide: HotelContextService, useValue: { selectedHotelSettingsId: 1 } }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(ListIncomeConsolidated);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  // Era la causa de la lentitud: cada tecla lanzaba una agregacion sobre todos los pagos.
  describe('el buscador', () => {
    it('no consulta una vez por tecla', fakeAsync(async () => {
      await setup();
      getIncomeConsolidatedReport.calls.reset();

      component.search = 'J';
      component.onSearchInput();
      component.search = 'Ju';
      component.onSearchInput();
      component.search = 'Jua';
      component.onSearchInput();
      component.search = 'Juan';
      component.onSearchInput();

      expect(getIncomeConsolidatedReport).not.toHaveBeenCalled();

      tick(350);

      expect(getIncomeConsolidatedReport).toHaveBeenCalledTimes(1);
    }));

    it('los selectores si consultan de inmediato: son un clic, no una racha', async () => {
      await setup();
      getIncomeConsolidatedReport.calls.reset();

      component.applyFilters();

      expect(getIncomeConsolidatedReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('la lectura del periodo', () => {
    it('suma lo que entro y cuenta los dias con movimiento', async () => {
      await setup({
        report: report({
          daily_rows: [dailyRow('2026-08-12', 200000), dailyRow('2026-08-11', 100000)]
        })
      });

      expect(component.periodTotal).toBe(300000);
      expect(component.dailyAverage).toBe(150000);
    });

    // Un dia sin movimiento no baja la media: no hubo dia, no hubo cobro.
    it('no cuenta los dias en cero para la media', async () => {
      await setup({
        report: report({
          daily_rows: [dailyRow('2026-08-12', 200000), dailyRow('2026-08-11', 0)]
        })
      });

      expect(component.dailyAverage).toBe(200000);
    });

    it('senala el mejor dia', async () => {
      await setup({
        report: report({
          daily_rows: [dailyRow('2026-08-12', 100000), dailyRow('2026-08-11', 250000)]
        })
      });

      expect(component.bestDay?.dateKey).toBe('2026-08-11');
      expect(component.isBestDay(component.dailyRows[1])).toBeTrue();
      expect(component.isBestDay(component.dailyRows[0])).toBeFalse();
    });

    it('no senala un mejor dia cuando no entro nada', async () => {
      await setup({ report: report({ daily_rows: [dailyRow('2026-08-12', 0)] }) });

      expect(component.isBestDay(component.dailyRows[0])).toBeFalse();
    });
  });

  describe('las barras diarias', () => {
    it('el dia mas alto marca el 100%', async () => {
      await setup({
        report: report({
          daily_rows: [dailyRow('2026-08-12', 200000), dailyRow('2026-08-11', 50000)]
        })
      });

      expect(component.dailyShare(component.dailyRows[0])).toBe(100);
      expect(component.dailyShare(component.dailyRows[1])).toBe(25);
    });

    // Una barra invisible parece un fallo de carga; deja un minimo visible.
    it('deja un minimo visible a los importes muy pequenos', async () => {
      await setup({
        report: report({
          daily_rows: [dailyRow('2026-08-12', 1000000), dailyRow('2026-08-11', 1)]
        })
      });

      expect(component.dailyShare(component.dailyRows[1])).toBe(2);
    });

    it('no divide por cero cuando no hay importes', async () => {
      await setup({ report: report({ daily_rows: [dailyRow('2026-08-12', 0)] }) });

      expect(component.dailyShare(component.dailyRows[0])).toBe(0);
    });
  });

  it('resume por donde entra la plata', async () => {
    await setup({
      report: report({
        method_rows: [methodRow('Efectivo', 200000, 68.5), methodRow('Tarjeta', 92000, 31.5)]
      })
    });

    expect(component.topMethodRow?.methodLabel).toBe('Efectivo');
    expect(component.formatShare(component.topMethodRow!.sharePercent)).toBe('68.5%');
  });

  // El pipe de Angular lanzaba NG0701 con es-CO y dejaba las celdas de dinero en blanco.
  it('formatea el dinero sin depender del pipe de Angular', async () => {
    await setup();

    const label = component.formatMoney(292000);

    expect(label).toContain('292');
    expect(label.length).toBeGreaterThan(3);
  });

  describe('el refresco', () => {
    it('la primera carga si blanquea la vista', async () => {
      await setup();

      expect(component.renderReady).toBeTrue();
      expect(component.loading).toBeFalse();
      expect(component.refreshing).toBeFalse();
    });

    // Antes toda consulta reconstruia la vista entera y la hacia parpadear.
    it('las siguientes solo atenuan', async () => {
      await setup({ report: report({ daily_rows: [dailyRow('2026-08-12', 100000)] }) });

      let observed = false;
      getIncomeConsolidatedReport.and.callFake(() => {
        observed = component.refreshing && !component.loading;
        return of(report({ daily_rows: [dailyRow('2026-08-12', 100000)] }));
      });

      component.applyFilters();

      expect(observed).toBeTrue();
    });
  });
});
