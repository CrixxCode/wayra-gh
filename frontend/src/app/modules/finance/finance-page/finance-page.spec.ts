import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { FinancePage } from './finance-page';
import { ExpenseService } from '../../../services/expense';
import { ReportsService } from '../../../services/reports';

/** Dia local, como lo guarda el egreso: `toISOString()` daria el dia en UTC. */
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

/** Dentro del mes en curso pase lo que pase: el filtro por defecto es "este mes". */
const someDayThisMonth = (): string => {
  const now = new Date();
  return plainDay(new Date(now.getFullYear(), now.getMonth(), 1));
};

const expense = (id: number, amount: number, overrides: any = {}) => ({
  id,
  amount,
  expense_date: someDayThisMonth(),
  expense_category_name: 'Servicios',
  is_active: true,
  ...overrides
});

const incomeReport = (overrides: any = {}) => ({
  summary: {
    total_collected: 1000,
    today_collected: 0,
    total_transactions: 4,
    ...(overrides.summary || {})
  },
  method_rows: overrides.method_rows || []
});

describe('FinancePage', () => {
  let component: FinancePage;
  let fixture: ComponentFixture<FinancePage>;

  const getIncomeConsolidatedReport = jasmine.createSpy('getIncomeConsolidatedReport');
  const listExpenses = jasmine.createSpy('listExpenses');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (
    data: { income?: any; expenses?: any[]; tab?: string; incomeFails?: boolean } = {}
  ) => {
    getIncomeConsolidatedReport.calls.reset();
    listExpenses.calls.reset();
    navigate.calls.reset();

    getIncomeConsolidatedReport.and.returnValue(
      data.incomeFails ? throwError(() => new Error('boom')) : of(data.income ?? incomeReport())
    );
    listExpenses.and.returnValue(of(data.expenses || []));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [FinancePage],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          { provide: ReportsService, useValue: { getIncomeConsolidatedReport } },
          { provide: ExpenseService, useValue: { listExpenses } },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => data.tab ?? null } } }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(FinancePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('abre en el resultado: es la pregunta que ninguna de las dos vistas contestaba', async () => {
    await setup();

    expect(component.activeTab).toBe('result');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'expenses' });

    expect(component.activeTab).toBe('expenses');
  });

  describe('el resultado', () => {
    it('es lo que entra menos lo que sale', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 1000 } }),
        expenses: [expense(1, 300), expense(2, 200)]
      });

      expect(component.totalIncome).toBe(1000);
      expect(component.totalExpenses).toBe(500);
      expect(component.result).toBe(500);
      expect(component.isProfitable).toBeTrue();
    });

    it('avisa cuando se gasta mas de lo que entra', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 400 } }),
        expenses: [expense(1, 900)]
      });

      expect(component.result).toBe(-500);
      expect(component.isProfitable).toBeFalse();
    });

    // Un egreso dado de baja no gasto nada: no puede seguir restando.
    it('ignora los egresos inactivos', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 1000 } }),
        expenses: [expense(1, 300), expense(2, 999, { is_active: false })]
      });

      expect(component.totalExpenses).toBe(300);
    });
  });

  describe('la proporcion gastada', () => {
    it('es la parte de lo que entra que se va en gastos', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 1000 } }),
        expenses: [expense(1, 250)]
      });

      expect(component.expenseRatio).toBe(25);
    });

    // Sin ingresos la division no existe; la barra tiene que decir algo igual.
    it('se topa en 100 cuando hay gasto y no hay ingreso', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 0 } }),
        expenses: [expense(1, 250)]
      });

      expect(component.expenseRatio).toBe(100);
    });

    it('es cero cuando no hay ni ingreso ni gasto', async () => {
      await setup({ income: incomeReport({ summary: { total_collected: 0 } }) });

      expect(component.expenseRatio).toBe(0);
    });

    it('no pasa de 100 aunque se gaste el doble de lo que entra', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 100 } }),
        expenses: [expense(1, 400)]
      });

      expect(component.expenseRatio).toBe(100);
    });
  });

  describe('el desglose de gasto', () => {
    it('agrupa por categoria y ordena por peso', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_category_name: 'Aseo' }),
          expense(2, 300, { expense_category_name: 'Nomina' }),
          expense(3, 50, { expense_category_name: 'Aseo' })
        ]
      });

      expect(component.expenseBreakdown.map((row) => row.label)).toEqual(['Nomina', 'Aseo']);
      expect(component.expenseBreakdown[0].amount).toBe(300);
      expect(component.expenseBreakdown[1].amount).toBe(150);
      expect(component.topExpenseCategory?.label).toBe('Nomina');
    });

    it('no se cae cuando el egreso no trae categoria', async () => {
      await setup({ expenses: [expense(1, 100, { expense_category_name: null })] });

      expect(component.expenseBreakdown[0].label).toBe('Sin categoria');
    });

    it('no inventa una categoria dominante si no hay gastos', async () => {
      await setup();

      expect(component.topExpenseCategory).toBeNull();
    });
  });

  describe('el origen del ingreso', () => {
    // El campo del consolidado es `total_amount`; leer otro nombre dejaba el panel vacio.
    it('reparte por metodo y descarta los que no cobraron nada', async () => {
      await setup({
        income: incomeReport({
          summary: { total_collected: 1000 },
          method_rows: [
            { method_label: 'Efectivo', total_amount: 600, share_percent: 60 },
            { method_label: 'Tarjeta', total_amount: 400, share_percent: 40 },
            { method_label: 'Transferencia', total_amount: 0, share_percent: 0 }
          ]
        })
      });

      expect(component.incomeByMethod.map((row) => row.label)).toEqual(['Efectivo', 'Tarjeta']);
      expect(component.incomeByMethod[0].amount).toBe(600);
      expect(component.incomeByMethod[0].share).toBe(60);
    });

    // Si el consolidado no manda la participacion, se calcula sobre el total.
    it('calcula la participacion cuando el backend no la manda', async () => {
      await setup({
        income: incomeReport({
          summary: { total_collected: 1000 },
          method_rows: [{ method_label: 'Efectivo', total_amount: 250 }]
        })
      });

      expect(component.incomeByMethod[0].share).toBe(25);
    });
  });

  describe('el movimiento de hoy', () => {
    it('resta solo los egresos con fecha de hoy', async () => {
      await setup({
        income: incomeReport({ summary: { total_collected: 1000, today_collected: 400 } }),
        expenses: [
          expense(1, 100, { expense_date: today() }),
          expense(2, 900, { expense_date: someDayThisMonth() })
        ]
      });

      expect(component.expensesToday).toBe(100);
      expect(component.incomeToday).toBe(400);
    });
  });

  // El informe puede fallar sin que los egresos fallen: la pantalla no puede quedar
  // afirmando que no entro nada.
  it('sigue en pie si el informe de ingresos falla', async () => {
    await setup({ incomeFails: true, expenses: [expense(1, 200)] });

    expect(component.loading).toBeFalse();
    expect(component.totalExpenses).toBe(200);
    expect(component.income).toBeNull();
  });

  describe('el refresco tras un cambio', () => {
    // La escritura ya invalido el cache; forzar aqui saltaria la deduplicacion de
    // peticiones en vuelo y dispararia consultas de mas.
    it('no fuerza el cache: la escritura ya lo invalido', async () => {
      await setup();
      listExpenses.calls.reset();

      component.onFinanceChanged();

      expect(listExpenses).toHaveBeenCalledWith(
        jasmine.objectContaining({ forceRefresh: false })
      );
    });

    it('el boton de actualizar si lo fuerza', async () => {
      await setup();
      listExpenses.calls.reset();

      component.loadSummary(true, true);

      expect(listExpenses).toHaveBeenCalledWith(
        jasmine.objectContaining({ forceRefresh: true })
      );
    });
  });

  // El periodo lo manda el contenedor: antes el encabezado sumaba todo el historico y
  // las listas arrancaban en el mes, y las cifras no cuadraban sin explicacion.
  describe('el periodo compartido', () => {
    it('arranca en el mes en curso y lo dice', async () => {
      await setup();

      expect(component.period).toBe('THIS_MONTH');
      expect(component.periodLabel).toBe('Este mes');
      expect(component.range.from.slice(8)).toBe('01');
    });

    it('recorta los egresos al periodo', async () => {
      await setup({
        expenses: [
          expense(1, 100, { expense_date: someDayThisMonth() }),
          expense(2, 900, { expense_date: '2019-03-04' })
        ]
      });

      expect(component.totalExpenses).toBe(100);

      component.period = 'ALL';

      expect(component.totalExpenses).toBe(1000);
    });

    it('todo el historico no impone rango', async () => {
      await setup();

      component.period = 'ALL';

      expect(component.range).toEqual({ from: '', to: '' });
    });

    it('pide el consolidado con las dos puntas del rango', async () => {
      await setup();
      getIncomeConsolidatedReport.calls.reset();

      component.period = 'LAST_MONTH';
      component.onPeriodChange();

      const { from, to } = component.range;
      expect(getIncomeConsolidatedReport).toHaveBeenCalledWith({
        start_date: from,
        end_date: to
      });
    });

    it('sin rango pide todo el historico, no el mes del backend', async () => {
      await setup();
      getIncomeConsolidatedReport.calls.reset();

      component.period = 'ALL';
      component.onPeriodChange();

      expect(getIncomeConsolidatedReport).toHaveBeenCalledWith({ period: 'ALL' });
    });

    describe('entre dos fechas', () => {
      // Con una sola punta el rango no dice nada: filtrar a medias seria peor que no filtrar.
      it('no consulta hasta tener las dos', async () => {
        await setup();
        getIncomeConsolidatedReport.calls.reset();

        component.period = 'CUSTOM';
        component.customFrom = '2026-01-01';
        component.onPeriodChange();

        expect(getIncomeConsolidatedReport).not.toHaveBeenCalled();

        component.customTo = '2026-01-31';
        component.onPeriodChange();

        expect(getIncomeConsolidatedReport).toHaveBeenCalledTimes(1);
      });

      // Al reves es un error de tecleo, no una orden de no ensenar nada.
      it('endereza el rango si viene invertido', async () => {
        await setup();

        component.period = 'CUSTOM';
        component.customFrom = '2026-01-31';
        component.customTo = '2026-01-01';

        expect(component.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
      });
    });
  });

  it('lleva la pestaña a la URL para que recargar caiga donde estabas', async () => {
    await setup();

    component.selectTab('expenses');

    expect(navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({ queryParams: { tab: 'expenses' }, replaceUrl: true })
    );
  });
});
