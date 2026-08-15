import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { ListReports } from './list-reports';
import { ReportsService } from '../../../services/reports';
import { HotelSettingsService } from '../../../services/hotel-settings';

const executive = () => ({
  filters: {},
  income_vs_profit_chart: [
    { month: 'Ene', income: 1_000_000, profit: 300_000 },
    { month: 'Feb', income: 1_400_000, profit: 500_000 }
  ],
  payment_methods: [
    { method: 'Efectivo', amount: 900_000, pct: 60 },
    { method: 'Tarjeta', amount: 600_000, pct: 40 }
  ],
  weekly_occupancy: [
    { week: 'S1', occupied_rooms: 12, occupancy_rate_pct: 60 },
    { week: 'S2', occupied_rooms: 18, occupancy_rate_pct: 90 }
  ],
  top_guests: []
});

const revenue = () => ({
  filters: {},
  monthly_income_vs_expenses: [
    { month: 'Ene', income: 1_000_000, expenses: 400_000 },
    { month: 'Feb', income: 1_400_000, expenses: 500_000 }
  ],
  monthly_net_profit: [
    { month: 'Ene', value: 600_000 },
    { month: 'Feb', value: 900_000 }
  ],
  payment_breakdown: [],
  guest_origin: [
    { country: 'Colombia', pct: 70 },
    { country: 'Venezuela', pct: 30 }
  ]
});

const occupancy = () => ({
  filters: {},
  monthly_occupancy_rate: [
    { month: 'Ene', pct: 55 },
    { month: 'Feb', pct: 72 }
  ],
  occupied_rooms_by_month: [
    { month: 'Ene', rooms: 40 },
    { month: 'Feb', rooms: 61 }
  ],
  by_room_type: [],
  room_type_performance: []
});

const services = () => ({
  filters: {},
  income_by_category: [
    { category: 'Restaurante', amount: 500_000 },
    { category: 'Spa', amount: 200_000 }
  ],
  transactions_by_category: [
    { category: 'Restaurante', transactions: 30 },
    { category: 'Spa', transactions: 11 }
  ],
  category_detail: []
});

describe('ListReports', () => {
  let component: ListReports;
  let fixture: ComponentFixture<ListReports>;

  const getExecutiveReport = jasmine.createSpy('getExecutiveReport');
  const getRevenueReport = jasmine.createSpy('getRevenueReport');
  const getOccupancyReport = jasmine.createSpy('getOccupancyReport');
  const getServicesReport = jasmine.createSpy('getServicesReport');
  const getCurrentSettings = jasmine.createSpy('getCurrentSettings');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (data: { tab?: string } = {}) => {
    for (const spy of [
      getExecutiveReport,
      getRevenueReport,
      getOccupancyReport,
      getServicesReport,
      getCurrentSettings,
      navigate
    ]) {
      spy.calls.reset();
    }

    getExecutiveReport.and.returnValue(of(executive()));
    getRevenueReport.and.returnValue(of(revenue()));
    getOccupancyReport.and.returnValue(of(occupancy()));
    getServicesReport.and.returnValue(of(services()));
    getCurrentSettings.and.returnValue(of({ id: 1, hotel_name: 'Hotel Wayra' }));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [ListReports],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ReportsService,
            useValue: {
              getExecutiveReport,
              getRevenueReport,
              getOccupancyReport,
              getServicesReport
            }
          },
          { provide: HotelSettingsService, useValue: { getCurrentSettings } },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => data.tab ?? null } } }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(ListReports);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('abre en el resumen ejecutivo', async () => {
    await setup();

    expect(component.activeTab).toBe('executive');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'occupancy' });

    expect(component.activeTab).toBe('occupancy');
  });

  it('lleva la pestaña a la URL al cambiarla', async () => {
    await setup();

    component.selectTab('services');

    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({ queryParams: { tab: 'services' }, replaceUrl: true })
    );
  });

  describe('las series', () => {
    // Dos series comparten eje porque comparten unidad, y exigen leyenda: el verde queda
    // por debajo de 3:1 de contraste y la etiqueta es el alivio de esa regla.
    it('ingresos y utilidad van juntos y con leyenda', async () => {
      await setup();

      expect(component.incomeProfitData.datasets.length).toBe(2);
      expect(component.incomeProfitData.datasets[0].label).toBe('Ingresos');
      expect(component.incomeProfitData.datasets[1].label).toBe('Utilidad');
      expect(component.incomeProfitData.datasets[0].data).toEqual([1_000_000, 1_400_000]);
      expect(component.incomeProfitOptions.plugins?.legend?.display).toBeTrue();
    });

    it('los metodos de pago se comparan por monto', async () => {
      await setup();

      expect(component.paymentMethodsData.labels).toEqual(['Efectivo', 'Tarjeta']);
      expect(component.paymentMethodsData.datasets[0].data).toEqual([900_000, 600_000]);
    });

    it('ingresos y gastos comparten eje: misma unidad', async () => {
      await setup();

      expect(component.incomeVsExpensesData.datasets.length).toBe(2);
      expect(component.incomeVsExpensesData.datasets[1].data).toEqual([400_000, 500_000]);
    });

    // Con el eje al maximo de la serie, un mes flojo llenaria la grafica y pareceria
    // un lleno total.
    it('la ocupacion fija el eje de 0 a 100', async () => {
      await setup();

      const scale = component.occupancyRateOptions.scales?.['y'] as { min: number; max: number };
      expect(scale.min).toBe(0);
      expect(scale.max).toBe(100);
      expect(component.occupancyRateData.datasets[0].data).toEqual([55, 72]);
    });

    it('servicios arma sus dos series', async () => {
      await setup();

      expect(component.servicesIncomeData.labels).toEqual(['Restaurante', 'Spa']);
      expect(component.servicesTransactionsData.datasets[0].data).toEqual([30, 11]);
    });

    it('el origen de huespedes va en porcentaje', async () => {
      await setup();

      expect(component.guestOriginData.labels).toEqual(['Colombia', 'Venezuela']);
      expect(component.guestOriginData.datasets[0].data).toEqual([70, 30]);
    });
  });

  describe('los indicadores de contenido', () => {
    it('reconocen que hay algo que dibujar', async () => {
      await setup();

      expect(component.hasIncomeProfitChart).toBeTrue();
      expect(component.hasPaymentMethods).toBeTrue();
      expect(component.hasOccupancyRate).toBeTrue();
      expect(component.hasServicesIncome).toBeTrue();
    });

    // Sin datos hay que ensenar el vacio, no un grafico plano que parece un cero real.
    it('y que no lo hay cuando la respuesta viene vacia', async () => {
      getExecutiveReport.and.returnValue(of({ filters: {} }));
      getRevenueReport.and.returnValue(of({ filters: {} }));
      getOccupancyReport.and.returnValue(of({ filters: {} }));
      getServicesReport.and.returnValue(of({ filters: {} }));
      getCurrentSettings.and.returnValue(of({ id: 1 }));

      await TestBed.resetTestingModule()
        .configureTestingModule({
          imports: [ListReports],
          providers: [
            provideHttpClient(),
            provideHttpClientTesting(),
            {
              provide: ReportsService,
              useValue: {
                getExecutiveReport,
                getRevenueReport,
                getOccupancyReport,
                getServicesReport
              }
            },
            { provide: HotelSettingsService, useValue: { getCurrentSettings } },
            { provide: Router, useValue: { navigate } },
            {
              provide: ActivatedRoute,
              useValue: { snapshot: { queryParamMap: { get: () => null } } }
            }
          ]
        })
        .compileComponents();

      const empty = TestBed.createComponent(ListReports);
      empty.detectChanges();

      expect(empty.componentInstance.hasIncomeProfitChart).toBeFalse();
      expect(empty.componentInstance.hasOccupancyRate).toBeFalse();
      expect(empty.componentInstance.hasServicesTransactions).toBeFalse();
    });
  });
});
