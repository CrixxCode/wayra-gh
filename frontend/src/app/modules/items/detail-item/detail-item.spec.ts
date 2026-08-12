import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';

import { DetailItem } from './detail-item';
import { InventoryMovementsService } from '../../../services/inventory-movement';

const item = (overrides: any = {}) =>
  ({
    id: 38,
    name: 'Sandwich empacado',
    stock: 18,
    minimum_stock: 6,
    maximum_stock: 35,
    cost_price: 5000,
    sale_price: 11000,
    unit_measure_name: 'Unidad',
    item_type_name: 'Alimento',
    item_purpose: 'RECEPTION',
    is_active: true,
    ...overrides
  }) as any;

describe('DetailItem', () => {
  let component: DetailItem;
  let fixture: ComponentFixture<DetailItem>;

  const listInventoryMovements = jasmine.createSpy('listInventoryMovements');

  /** Monta el item como lo hace la lista, para que corra la carga de la bitacora. */
  const open = (data: any, movements: any[] = []) => {
    listInventoryMovements.and.returnValue(of(movements));
    component.itemData = data;
    component.ngOnChanges({ itemData: new SimpleChange(null, data, true) });
  };

  beforeEach(async () => {
    listInventoryMovements.calls.reset();
    listInventoryMovements.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [DetailItem],
      providers: [
        { provide: InventoryMovementsService, useValue: { listInventoryMovements } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailItem);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('medidor', () => {
    it('mide el stock contra el maximo cuando existe', () => {
      component.itemData = item();

      expect(component.gaugeTarget).toBe(35);
      expect(Math.round(component.stockPercent)).toBe(51);
      expect(Math.round(component.minimumMarkPercent)).toBe(17);
    });

    // Sin tope, la marca del minimo quedaria pegada al borde y la barra no diria nada.
    it('inventa una escala razonable sin maximo', () => {
      component.itemData = item({ maximum_stock: 0, stock: 8, minimum_stock: 5 });

      expect(component.gaugeTarget).toBe(20);
      expect(component.minimumMarkPercent).toBe(25);
    });

    it('marca saludable lo que supera el minimo', () => {
      component.itemData = item();

      expect(component.getStockStateLabel()).toBe('Saludable');
      expect(component.stockHeadline).toContain('12 unidad por encima');
    });

    // El titular dice que hacer, no solo que pasa.
    it('dice cuanto falta cuando esta bajo minimo', () => {
      component.itemData = item({ stock: 2, minimum_stock: 6 });

      expect(component.getStockStateLabel()).toBe('Bajo minimo');
      expect(component.unitsBelowMinimum).toBe(4);
      expect(component.stockHeadline).toBe('Faltan 4 unidad para el minimo');
    });

    it('avisa de agotado y de exceso', () => {
      component.itemData = item({ stock: 0 });
      expect(component.getStockStateLabel()).toBe('Sin stock');
      expect(component.stockHeadline).toContain('reponer');

      component.itemData = item({ stock: 40 });
      expect(component.getStockStateLabel()).toBe('Exceso');
    });
  });

  describe('dinero', () => {
    it('valora la bodega al costo y la venta al precio', () => {
      component.itemData = item();

      expect(component.getStockValueLabel()).toContain('90.000');
      expect(component.getPotentialSaleLabel()).toContain('198.000');
    });

    // El valor absoluto solo no dice nada; el porcentaje es lo que se compara.
    it('expresa el margen tambien en porcentaje', () => {
      component.itemData = item();

      expect(component.marginAmount).toBe(6000);
      expect(component.getMarginPercentLabel()).toBe('120% sobre el costo');
    });

    it('no divide por cero si no hay costo', () => {
      component.itemData = item({ cost_price: 0 });

      expect(component.getMarginPercentLabel()).toBe('Sin costo registrado');
    });
  });

  describe('saltos', () => {
    it('pide ver los movimientos del item', () => {
      const data = item();
      component.itemData = data;
      const pedidos: any[] = [];
      component.movementsRequested.subscribe((value) => pedidos.push(value));

      component.requestMovements();

      expect(pedidos).toEqual([data]);
    });

    it('pide ver las habitaciones del item', () => {
      const data = item();
      component.itemData = data;
      const pedidos: any[] = [];
      component.roomsRequested.subscribe((value) => pedidos.push(value));

      component.requestRooms();

      expect(pedidos).toEqual([data]);
    });

    it('no emite nada sin item cargado', () => {
      const pedidos: any[] = [];
      component.movementsRequested.subscribe((value) => pedidos.push(value));

      component.requestMovements();

      expect(pedidos).toEqual([]);
    });
  });

  describe('bitacora', () => {
    const movement = (id: number, previous: number, next: number, overrides: any = {}) => ({
      id,
      item: 38,
      previous_stock: previous,
      new_stock: next,
      quantity: Math.abs(next - previous),
      movement_type_name: 'Entrada',
      movement_date: '2026-08-11T21:44:00Z',
      is_active: true,
      ...overrides
    });

    // Traer el historico entero del hotel para filtrarlo en el navegador no escala.
    it('pide solo los movimientos de este item', () => {
      open(item());

      const [filters] = listInventoryMovements.calls.mostRecent().args;
      expect(filters).toEqual({ item: 38, ordering: '-id' });
    });

    it('marca la direccion por el salto de stock, no por el tipo', () => {
      open(item(), [movement(1, 10, 14), movement(2, 14, 9), movement(3, 9, 9)]);

      expect(component.movementDirection(component.movements[0])).toBe('IN');
      expect(component.movementDirection(component.movements[1])).toBe('OUT');
      expect(component.movementDirection(component.movements[2])).toBe('NEUTRAL');
    });

    it('rotula el salto con signo', () => {
      open(item(), [movement(1, 10, 14), movement(2, 14, 9)]);

      expect(component.movementDeltaLabel(component.movements[0])).toBe('+4');
      expect(component.movementDeltaLabel(component.movements[1])).toBe('-5');
    });

    // El historico completo vive en su pestaña, con sus filtros.
    it('recorta a los ultimos y ofrece el resto', () => {
      const many = Array.from({ length: 9 }, (_, index) => movement(index + 1, 10, 11));
      open(item(), many);

      expect(component.recentMovements.length).toBe(6);
      expect(component.hasMoreMovements).toBeTrue();
      expect(component.hiddenMovementsCount).toBe(3);
    });

    it('no ofrece mas cuando caben todos', () => {
      open(item(), [movement(1, 10, 11)]);

      expect(component.hasMoreMovements).toBeFalse();
      expect(component.hiddenMovementsCount).toBe(0);
    });

    it('avisa si la bitacora no se pudo cargar', () => {
      listInventoryMovements.and.returnValue(throwError(() => new Error('boom')));
      const data = item();

      component.itemData = data;
      component.ngOnChanges({ itemData: new SimpleChange(null, data, true) });

      expect(component.movementsError).toBeTrue();
      expect(component.loadingMovements).toBeFalse();
    });

    it('limpia la bitacora al cerrarse', () => {
      open(item(), [movement(1, 10, 11)]);

      component.itemData = null;
      component.ngOnChanges({ itemData: new SimpleChange(item(), null, false) });

      expect(component.movements).toEqual([]);
    });
  });
});
