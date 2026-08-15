import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { DetailExpense } from './detail-expense';
import { ExpenseService } from '../../../services/expense';

const expense = (overrides: any = {}) => ({
  id: 4,
  concept: 'limpieza de aire',
  amount: 60000,
  expense_date: '2026-08-11',
  expense_category_name: 'Mantenimiento',
  payment_method_name: 'Efectivo',
  expense_type: 'OPERATING_COST',
  expense_type_label: 'Operating cost',
  cost_behavior: 'FIXED',
  cost_behavior_label: 'Fixed',
  hotel_name: 'Hotel de Kaneshi',
  created_at: '2026-08-12T15:35:00Z',
  updated_at: '2026-08-12T15:35:00Z',
  is_active: true,
  ...overrides
});

describe('DetailExpense', () => {
  let component: DetailExpense;
  let fixture: ComponentFixture<DetailExpense>;

  const getExpenseById = jasmine.createSpy('getExpenseById');
  const updateExpense = jasmine.createSpy('updateExpense');

  const setup = async (data: any = {}) => {
    getExpenseById.calls.reset();
    updateExpense.calls.reset();

    const record = data.expense ?? expense();
    getExpenseById.and.returnValue(of(record));
    updateExpense.and.returnValue(of(record));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [DetailExpense],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          { provide: ExpenseService, useValue: { getExpenseById, updateExpense } }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(DetailExpense);
    component = fixture.componentInstance;
    // El detalle carga desde `ngOnChanges`, que solo dispara por entrada enlazada:
    // asignar la propiedad a mano dejaria `activeExpense` en null.
    fixture.componentRef.setInput('expense', record);
    fixture.detectChanges();
  };

  // Las opciones del modelo estan rotuladas en ingles y el serializador las manda tal
  // cual: preferirlas dejaba "Operating cost" y "Fixed" en una interfaz en español.
  describe('las clasificaciones', () => {
    it('se dicen en español aunque el backend mande la etiqueta en ingles', async () => {
      await setup();

      expect(component.getExpenseTypeLabel(component.activeExpense)).toBe('Costo operativo');
      expect(component.getCostBehaviorLabel(component.activeExpense)).toBe('Fijo');
    });

    it('usa la etiqueta remota para un valor que aun no conoce', async () => {
      await setup({
        expense: expense({ expense_type: 'NUEVO_TIPO', expense_type_label: 'Tipo nuevo' })
      });

      expect(component.getExpenseTypeLabel(component.activeExpense)).toBe('Tipo nuevo');
    });

    it('no inventa nada si no hay ni valor ni etiqueta', async () => {
      await setup({
        expense: expense({ expense_type: null, expense_type_label: null })
      });

      expect(component.getExpenseTypeLabel(component.activeExpense)).toBe('Sin clasificacion');
    });
  });

  describe('el resumen', () => {
    it('deja fuera los campos vacios en vez de ensenar "Sin proveedor"', async () => {
      await setup({ expense: expense({ supplier_name: '', reference: '' }) });

      const labels = component.summaryRows.map((row) => row.label);

      expect(labels).not.toContain('Proveedor');
      expect(labels).not.toContain('Referencia');
      expect(labels).toContain('Categoria');
      expect(labels).toContain('Hotel');
    });

    it('los ensena cuando si tienen dato', async () => {
      await setup({ expense: expense({ supplier_name: 'Ferreteria Luz', reference: 'F-991' }) });

      const rows = component.summaryRows;

      expect(rows.find((row) => row.label === 'Proveedor')?.value).toBe('Ferreteria Luz');
      expect(rows.find((row) => row.label === 'Referencia')?.value).toBe('F-991');
    });
  });

  describe('lo que falta', () => {
    it('se resume en una linea, no en tres celdas', async () => {
      await setup({ expense: expense({ supplier_name: '', reference: '', description: '' }) });

      expect(component.missingLabel).toBe('Sin proveedor, referencia ni descripcion.');
    });

    it('concuerda en singular cuando falta uno solo', async () => {
      await setup({
        expense: expense({ supplier_name: 'Ferreteria Luz', reference: 'F-991', description: '' })
      });

      expect(component.missingLabel).toBe('Sin descripcion registrada.');
    });

    it('no dice nada cuando esta todo', async () => {
      await setup({
        expense: expense({ supplier_name: 'Luz', reference: 'F-1', description: 'Cambio de filtro' })
      });

      expect(component.missingLabel).toBe('');
      expect(component.hasDescription).toBeTrue();
    });
  });

  describe('la trazabilidad', () => {
    // Repetir la misma fecha dos veces hace pensar que hubo una edicion que no existio.
    it('no cuenta como edicion el alta', async () => {
      await setup();

      expect(component.wasEdited).toBeFalse();
    });

    it('avisa cuando si se edito despues', async () => {
      await setup({
        expense: expense({
          created_at: '2026-08-12T15:35:00Z',
          updated_at: '2026-08-13T09:00:00Z'
        })
      });

      expect(component.wasEdited).toBeTrue();
    });

    it('no se cae sin marcas de tiempo', async () => {
      await setup({ expense: expense({ created_at: null, updated_at: null }) });

      expect(component.wasEdited).toBeFalse();
    });
  });

  // El mismo criterio que el listado: abrir el detalle no cambia el color bajo los pies.
  it('el tono sale del nombre de la categoria', async () => {
    await setup();
    const first = component.categoryTone;

    await setup();

    expect(component.categoryTone).toBe(first);
  });
});
