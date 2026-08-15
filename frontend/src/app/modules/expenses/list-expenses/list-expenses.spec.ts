import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { ListExpenses } from './list-expenses';
import { ExpenseService } from '../../../services/expense';
import { MasterDataService } from '../../../services/master-data.service';
import { PaymentMethodService } from '../../../services/payment-method';
import { HotelSettingsService } from '../../../services/hotel-settings';

/** Fecha suelta `YYYY-MM-DD`, como la guarda el egreso: sin hora y sin huso. */
const plainDay = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const today = (): string => plainDay(new Date());

const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return plainDay(date);
};

/** El primer dia del mes en curso: el borde exacto del filtro por defecto. */
const firstOfThisMonth = (): string => {
  const now = new Date();
  return plainDay(new Date(now.getFullYear(), now.getMonth(), 1));
};

const lastOfLastMonth = (): string => {
  const now = new Date();
  return plainDay(new Date(now.getFullYear(), now.getMonth(), 0));
};

const expense = (id: number, amount: number, overrides: any = {}) => ({
  id,
  concept: `Gasto ${id}`,
  amount,
  expense_date: today(),
  expense_category_name: 'Servicios',
  payment_method_name: 'Efectivo',
  cost_behavior: 'FIXED',
  is_active: true,
  ...overrides
});

describe('ListExpenses', () => {
  let component: ListExpenses;
  let fixture: ComponentFixture<ListExpenses>;

  const listExpenses = jasmine.createSpy('listExpenses');
  const listMasterData = jasmine.createSpy('listMasterData');
  const listPaymentMethods = jasmine.createSpy('listPaymentMethods');
  const getCurrentSettings = jasmine.createSpy('getCurrentSettings');

  const setup = async (data: { expenses?: any[] } = {}) => {
    listExpenses.calls.reset();
    listMasterData.calls.reset();
    listPaymentMethods.calls.reset();
    getCurrentSettings.calls.reset();

    listExpenses.and.returnValue(of(data.expenses || []));
    listMasterData.and.returnValue(of([{ id: 1, code: 'SERVICIOS', name: 'Servicios' }]));
    listPaymentMethods.and.returnValue(of([{ id: 1, code: 'EFECTIVO', name: 'Efectivo' }]));
    getCurrentSettings.and.returnValue(of({ id: 1, hotel_name: 'Hotel Wayra' }));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [ListExpenses],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ExpenseService, useValue: { listExpenses } },
          { provide: MasterDataService, useValue: { listMasterData } },
          { provide: PaymentMethodService, useValue: { listPaymentMethods } },
          { provide: HotelSettingsService, useValue: { getCurrentSettings } }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(ListExpenses);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('abre en la lista de egresos', async () => {
    await setup();

    expect(component.viewMode).toBe('list');
  });

  describe('el total', () => {
    it('sigue a los filtros, no al historico', async () => {
      await setup({ expenses: [expense(1, 100), expense(2, 300)] });

      expect(component.filteredTotal).toBe(400);

      component.search = 'Gasto 1';
      component.applyFilters();

      expect(component.filteredTotal).toBe(100);
    });

    // Un egreso dado de baja no gasto nada.
    it('deja fuera lo inactivo', async () => {
      await setup({
        expenses: [expense(1, 100), expense(2, 900, { is_active: false })]
      });

      component.activityFilter = 'ALL';
      component.applyFilters();

      expect(component.filteredExpenses.length).toBe(2);
      expect(component.filteredTotal).toBe(100);
    });
  });

  describe('las barras', () => {
    // La lista se ordena por registro mas reciente, no por el orden en que llegan aqui.
    const byId = (id: number) => component.filteredExpenses.find((item) => item.id === id)!;

    it('el gasto mas grande marca el 100%', async () => {
      await setup({ expenses: [expense(1, 400), expense(2, 100)] });

      expect(component.amountShare(byId(1))).toBe(100);
      expect(component.amountShare(byId(2))).toBe(25);
    });

    it('deja un minimo visible a los importes muy pequenos', async () => {
      await setup({ expenses: [expense(1, 1_000_000), expense(2, 1)] });

      expect(component.amountShare(byId(2))).toBe(2);
    });

    it('senala el mayor del periodo', async () => {
      await setup({ expenses: [expense(1, 400), expense(2, 100)] });

      expect(component.isBiggest(byId(1))).toBeTrue();
      expect(component.isBiggest(byId(2))).toBeFalse();
    });

    it('no senala nada cuando todo esta en cero', async () => {
      await setup({ expenses: [expense(1, 0)] });

      expect(component.isBiggest(component.filteredExpenses[0])).toBeFalse();
      expect(component.amountShare(component.filteredExpenses[0])).toBe(0);
    });
  });

  describe('en que se va', () => {
    it('agrupa por categoria y ordena por peso', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_category_name: 'Aseo' }),
          expense(2, 300, { expense_category_name: 'Nomina' }),
          expense(3, 50, { expense_category_name: 'Aseo' })
        ]
      });

      const breakdown = component.categoryBreakdown;

      expect(breakdown.map((row) => row.label)).toEqual(['Nomina', 'Aseo']);
      expect(breakdown[0].amount).toBe(300);
      expect(breakdown[0].count).toBe(1);
      expect(breakdown[1].amount).toBe(150);
      expect(breakdown[1].count).toBe(2);
      expect(component.topCategory?.label).toBe('Nomina');
    });

    it('los porcentajes suman el total', async () => {
      await setup({
        expenses: [
          expense(1, 250, { expense_category_name: 'Aseo' }),
          expense(2, 750, { expense_category_name: 'Nomina' })
        ]
      });

      const shares = component.categoryBreakdown.map((row) => row.share);

      expect(shares).toEqual([75, 25]);
    });

    it('no inventa una categoria dominante sin gastos', async () => {
      await setup();

      expect(component.topCategory).toBeNull();
    });
  });

  // El filtro que no existia: "cuanto llevo gastado este mes" no tenia respuesta.
  describe('el periodo', () => {
    it('arranca en el mes en curso', async () => {
      await setup();

      expect(component.periodFilter).toBe('THIS_MONTH');
      expect(component.periodLabel).toBe('Este mes');
    });

    it('deja fuera lo de meses anteriores', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: lastOfLastMonth() })
        ]
      });

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([1]);
      expect(component.filteredTotal).toBe(100);
    });

    // El dia 1 esta dentro del mes: comparar como fecha lo correria un dia por el huso.
    it('incluye el primer dia del mes', async () => {
      await setup({ expenses: [expense(1, 100, { expense_date: firstOfThisMonth() })] });

      expect(component.filteredExpenses.length).toBe(1);
    });

    it('el mes pasado termina el ultimo dia de ese mes', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: lastOfLastMonth() })
        ]
      });

      component.periodFilter = 'LAST_MONTH';
      component.applyFilters();

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([2]);
    });

    it('todo el historico no filtra nada', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: '2019-03-04' })
        ]
      });

      component.periodFilter = 'ALL';
      component.applyFilters();

      expect(component.filteredExpenses.length).toBe(2);
    });

    // Una lista vacia con "este mes" puede ser que no haya gastos o que el filtro los tape.
    it('ofrece salir del periodo cuando no encuentra nada', async () => {
      await setup({ expenses: [expense(1, 100, { expense_date: '2019-03-04' })] });

      expect(component.filteredExpenses.length).toBe(0);

      component.showAllPeriods();

      expect(component.periodFilter).toBe('ALL');
      expect(component.filteredExpenses.length).toBe(1);
    });

    it('descarta el egreso sin fecha en vez de colarlo en cualquier periodo', async () => {
      await setup({ expenses: [expense(1, 100, { expense_date: '' })] });

      expect(component.filteredExpenses.length).toBe(0);
    });
  });

  describe('el orden', () => {
    it('por defecto ensena lo mas reciente primero', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: daysAgo(3) }),
          expense(2, 900, { expense_date: today() })
        ]
      });

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([2, 1]);
    });

    it('por monto encuentra el gasto gordo', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: daysAgo(2) }),
          expense(3, 500, { expense_date: daysAgo(1) })
        ]
      });

      component.sortBy = 'AMOUNT_DESC';
      component.applyFilters();

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([2, 3, 1]);

      component.sortBy = 'AMOUNT_ASC';
      component.applyFilters();

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([1, 3, 2]);
    });

    it('por fecha ascendente lee el diario desde el principio', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: daysAgo(5) })
        ]
      });

      component.sortBy = 'DATE_ASC';
      component.applyFilters();

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([2, 1]);
    });
  });

  // Empotrado en finanzas, el periodo lo manda el contenedor: dos selectores para lo
  // mismo es como se acaba mirando dos cifras que no cuadran.
  describe('el rango del contenedor', () => {
    const embed = async (expenses: any[], from: string, to: string) => {
      await setup({ expenses });
      component.embedded = true;
      component.rangeFrom = from;
      component.rangeTo = to;
      component.applyFilters();
    };

    it('manda sobre el periodo propio', async () => {
      await embed(
        [
          expense(1, 100, { expense_date: '2026-01-15' }),
          expense(2, 900, { expense_date: today() })
        ],
        '2026-01-01',
        '2026-01-31'
      );

      expect(component.filteredExpenses.map((item) => item.id)).toEqual([1]);
    });

    it('empotrado sin rango ensena todo, no vuelve a su mes', async () => {
      await setup({ expenses: [expense(1, 100, { expense_date: '2019-03-04' })] });
      component.embedded = true;
      component.rangeFrom = '';
      component.rangeTo = '';
      component.applyFilters();

      expect(component.filteredExpenses.length).toBe(1);
    });

    it('lo dice en el rotulo del periodo', async () => {
      await embed([expense(1, 100, { expense_date: '2026-01-15' })], '2026-01-01', '2026-01-31');

      expect(component.periodLabel).toBe('2026-01-01 a 2026-01-31');
    });
  });

  // Si el tono dependiera del orden, cambiar un filtro repintaria la vista entera.
  it('el color de la categoria no depende del orden de la lista', async () => {
    await setup();

    const first = component.categoryTone('Nomina');
    const second = component.categoryTone('Nomina');

    expect(first).toBe(second);
    expect(first).not.toBe(component.categoryTone('Aseo'));
  });
});
