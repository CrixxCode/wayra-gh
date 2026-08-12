import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ShoppingList } from './shopping-list';
import { InventoryMovementsService } from '../../../services/inventory-movement';

const item = (id: number, name: string, stock: number, minimum: number, overrides: any = {}) =>
  ({
    id,
    name,
    stock,
    minimum_stock: minimum,
    maximum_stock: 0,
    cost_price: 1000,
    unit_measure_name: 'Unidad',
    is_active: true,
    ...overrides
  }) as any;

describe('ShoppingList', () => {
  let component: ShoppingList;
  let fixture: ComponentFixture<ShoppingList>;

  const registerPurchaseEntry = jasmine.createSpy('registerPurchaseEntry');

  const load = (items: any[]) => {
    component.items = items;
    component.ngOnChanges({ items: new SimpleChange(null, items, true) });
  };

  beforeEach(async () => {
    registerPurchaseEntry.calls.reset();
    registerPurchaseEntry.and.returnValue(
      of({ reference: 'COMPRA-1', entered_lines: 1, unknown_items: [], movement_ids: [3] })
    );

    await TestBed.configureTestingModule({
      imports: [ShoppingList],
      providers: [{ provide: InventoryMovementsService, useValue: { registerPurchaseEntry } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('que entra en la lista', () => {
    it('solo lo que esta en el minimo o por debajo', () => {
      load([item(1, 'Falta', 2, 5), item(2, 'Justo', 5, 5), item(3, 'Sobra', 40, 5)]);

      expect(component.lines.map((line) => line.item.id)).toEqual([1, 2]);
    });

    it('pone primero lo agotado', () => {
      load([item(1, 'Bajo', 2, 5), item(2, 'Agotado', 0, 5)]);

      expect(component.lines[0].item.id).toBe(2);
      expect(component.outOfStockCount).toBe(1);
    });

    it('ignora los items inactivos', () => {
      load([item(1, 'Falta', 0, 5, { is_active: false })]);

      expect(component.lines.length).toBe(0);
    });
  });

  describe('cuanto pedir', () => {
    // Si hay maximo, esa es la referencia natural: para eso existe el campo.
    it('llena hasta el maximo cuando lo hay', () => {
      load([item(1, 'A', 4, 10, { maximum_stock: 30 })]);

      expect(component.lines[0].quantity).toBe(26);
    });

    it('sin maximo, pide el doble del minimo menos lo que hay', () => {
      load([item(1, 'A', 4, 10)]);

      expect(component.lines[0].quantity).toBe(16);
    });

    it('nunca sugiere cero', () => {
      load([item(1, 'A', 0, 0)]);

      expect(component.lines[0].quantity).toBe(1);
    });

    it('vuelve a la sugerencia cuando se pide', () => {
      load([item(1, 'A', 4, 10)]);
      component.setQuantity(component.lines[0], 99);

      component.resetToSuggestion(component.lines[0]);

      expect(component.lines[0].quantity).toBe(16);
    });
  });

  describe('totales', () => {
    it('cuenta solo lo marcado y con cantidad', () => {
      load([item(1, 'A', 0, 5, { cost_price: 2000 }), item(2, 'B', 1, 5, { cost_price: 500 })]);
      component.toggle(component.lines[1]);

      expect(component.selectedLines.length).toBe(1);
      expect(component.totalUnits).toBe(component.lines[0].quantity);
      expect(component.totalCost).toBe(component.lines[0].quantity * 2000);
    });

    it('deja fuera una linea puesta en cero', () => {
      load([item(1, 'A', 0, 5)]);
      component.setQuantity(component.lines[0], 0);

      expect(component.selectedLines.length).toBe(0);
      expect(component.canSubmit).toBeFalse();
    });
  });

  // La lista se recalcula tras cada ingreso: perder lo tecleado seria exasperante.
  it('conserva las cantidades ajustadas al recargar los items', () => {
    const items = [item(1, 'A', 4, 10)];
    load(items);
    component.setQuantity(component.lines[0], 40);
    component.toggle(component.lines[0]);

    load([item(1, 'A', 4, 10)]);

    expect(component.lines[0].quantity).toBe(40);
    expect(component.lines[0].selected).toBeFalse();
  });

  describe('entrada de la compra', () => {
    it('envia una linea por item marcado con su referencia', () => {
      load([item(1, 'A', 0, 5)]);
      component.setQuantity(component.lines[0], 12);
      component.reference = ' FACT-99 ';

      component.registerEntry();

      const [payload] = registerPurchaseEntry.calls.mostRecent().args;
      expect(payload.lines).toEqual([{ item: 1, quantity: 12 }]);
      expect(payload.reference).toBe('FACT-99');
    });

    it('avisa al contenedor para que recargue', () => {
      load([item(1, 'A', 0, 5)]);
      let avisos = 0;
      component.changed.subscribe(() => (avisos += 1));

      component.registerEntry();

      expect(avisos).toBe(1);
      expect(component.successMessage).toContain('COMPRA-1');
    });

    it('deja claro que un fallo no guarda nada', () => {
      load([item(1, 'A', 0, 5)]);
      registerPurchaseEntry.and.returnValue(throwError(() => new Error('boom')));

      component.registerEntry();

      expect(component.errorMessage).toContain('No se guardo ninguna linea');
      expect(component.submitting).toBeFalse();
    });
  });

  describe('filtros', () => {
    it('separa agotados de bajo minimo', () => {
      load([item(1, 'Agotado', 0, 5), item(2, 'Bajo', 3, 5)]);

      component.urgency = 'OUT';
      expect(component.visibleLines.map((line) => line.item.id)).toEqual([1]);

      component.urgency = 'LOW';
      expect(component.visibleLines.map((line) => line.item.id)).toEqual([2]);
    });

    it('marca y desmarca todo lo visible', () => {
      load([item(1, 'A', 0, 5), item(2, 'B', 1, 5)]);

      component.selectAll(false);

      expect(component.selectedLines.length).toBe(0);
    });
  });

  describe('lectura de cada linea', () => {
    it('dice cuanto falta para el minimo, no lo que se va a pedir', () => {
      load([item(1, 'A', 3, 10)]);

      expect(component.shortfall(component.lines[0].item)).toBe(7);
    });

    // Sin barra, dos carencias muy distintas se ven iguales en la lista.
    it('mide la cobertura contra el minimo', () => {
      load([item(1, 'Casi', 8, 10), item(2, 'Agotado', 0, 10)]);
      const linea = (id: number) => component.lines.find((line) => line.item.id === id)!.item;

      expect(component.coveragePercent(linea(1))).toBe(80);
      expect(component.coveragePercent(linea(2))).toBe(0);
    });

    it('anticipa en cuanto queda el item con lo pedido', () => {
      load([item(1, 'A', 3, 10)]);
      component.setQuantity(component.lines[0], 12);

      expect(component.resultingStock(component.lines[0])).toBe(15);
    });

    // Un numero caido del cielo no se puede corregir con criterio.
    it('explica de donde sale la cantidad sugerida', () => {
      load([item(1, 'Con tope', 4, 10, { maximum_stock: 30 }), item(2, 'Sin tope', 4, 10)]);
      const linea = (id: number) => component.lines.find((line) => line.item.id === id)!.item;

      expect(component.suggestionReason(linea(1))).toContain('maximo (30)');
      expect(component.suggestionReason(linea(2))).toContain('doble del minimo (20)');
    });
  });

  describe('cobertura del pedido', () => {
    it('avisa cuando el pedido deja a todos sobre el minimo', () => {
      load([item(1, 'A', 4, 10)]);

      expect(component.coversAll).toBeTrue();
    });

    it('avisa cuando alguno se queda corto', () => {
      load([item(1, 'A', 4, 10)]);
      component.setQuantity(component.lines[0], 1);

      expect(component.coversAll).toBeFalse();
    });
  });
});
