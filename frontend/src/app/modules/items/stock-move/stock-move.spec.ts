import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { StockMove } from './stock-move';
import { InventoryMovementsService } from '../../../services/inventory-movement';

const item = (overrides: any = {}) =>
  ({
    id: 5,
    name: 'Sandwich empacado',
    stock: 18,
    minimum_stock: 6,
    unit_measure_name: 'Unidad',
    is_active: true,
    ...overrides
  }) as any;

describe('StockMove', () => {
  let component: StockMove;
  let fixture: ComponentFixture<StockMove>;

  const createInventoryMovement = jasmine.createSpy('createInventoryMovement');

  const open = (direction: 'IN' | 'OUT', data: any = {}) => {
    component.item = item(data);
    component.direction = direction;
    component.movementTypeId = direction === 'IN' ? 1 : 2;
    component.ngOnInit();
  };

  beforeEach(async () => {
    createInventoryMovement.calls.reset();
    createInventoryMovement.and.returnValue(of({ id: 90, new_stock: 21 }));

    await TestBed.configureTestingModule({
      imports: [StockMove],
      providers: [
        { provide: InventoryMovementsService, useValue: { createInventoryMovement } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StockMove);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('prevision', () => {
    // La resta no deberia hacerla el usuario.
    it('anticipa en cuanto queda tras una entrada', () => {
      open('IN');
      component.setQuantity(7);

      expect(component.resultingStock).toBe(25);
      expect(component.isEntry).toBeTrue();
    });

    it('anticipa en cuanto queda tras una salida', () => {
      open('OUT');
      component.setQuantity(7);

      expect(component.resultingStock).toBe(11);
    });

    it('no deja el resultado en negativo', () => {
      open('OUT');
      component.setQuantity(50);

      expect(component.resultingStock).toBe(0);
    });
  });

  describe('limites', () => {
    it('una salida no puede llevarse mas de lo que hay', () => {
      open('OUT');
      component.setQuantity(19);

      expect(component.exceedsStock).toBeTrue();
      expect(component.canSubmit).toBeFalse();
    });

    it('una entrada no tiene tope', () => {
      open('IN');
      component.setQuantity(9999);

      expect(component.exceedsStock).toBeFalse();
      expect(component.canSubmit).toBeTrue();
    });

    it('no registra una cantidad de cero', () => {
      open('IN');
      component.setQuantity(0);

      expect(component.canSubmit).toBeFalse();
    });

    // Aviso, no bloqueo: dejar el stock bajo minimo puede ser legitimo.
    it('avisa si la salida deja el stock bajo minimo pero deja continuar', () => {
      open('OUT');
      component.setQuantity(13);

      expect(component.willDropBelowMinimum).toBeTrue();
      expect(component.canSubmit).toBeTrue();
    });

    it('no avisa de minimo en una entrada', () => {
      open('IN');
      component.setQuantity(1);

      expect(component.willDropBelowMinimum).toBeFalse();
    });
  });

  describe('atajos', () => {
    it('usa una cantidad predefinida', () => {
      open('IN');

      component.useQuickAmount(25);

      expect(component.quantity).toBe(25);
    });

    it('vacia el item de un golpe', () => {
      open('OUT');

      component.useAllStock();

      expect(component.quantity).toBe(18);
      expect(component.resultingStock).toBe(0);
      expect(component.exceedsStock).toBeFalse();
    });

    it('el paso no baja de cero', () => {
      open('IN');
      component.setQuantity(1);

      component.step(-1);
      component.step(-1);

      expect(component.quantity).toBe(0);
    });
  });

  describe('registro', () => {
    it('manda el tipo de movimiento de la direccion abierta', () => {
      open('OUT');
      component.setQuantity(3);
      component.reference = ' VALE-9 ';
      component.notes = ' Consumo de evento ';

      component.submit();

      const [payload] = createInventoryMovement.calls.mostRecent().args;
      expect(payload).toEqual({
        item: 5,
        movement_type: 2,
        quantity: 3,
        reference: 'VALE-9',
        notes: 'Consumo de evento',
        is_active: true
      });
    });

    it('pone un motivo por defecto si no se escribe ninguno', () => {
      open('IN');
      component.setQuantity(2);

      component.submit();

      const [payload] = createInventoryMovement.calls.mostRecent().args;
      expect(payload.notes).toBe('Entrada de stock');
      expect(payload.reference).toBeNull();
    });

    it('avisa a quien lo abrio con el movimiento asentado', () => {
      open('IN');
      const registrados: any[] = [];
      component.registered.subscribe((value) => registrados.push(value));

      component.submit();

      expect(registrados.length).toBe(1);
      expect(registrados[0].new_stock).toBe(21);
    });

    it('muestra el error sin cerrarse', () => {
      open('IN');
      createInventoryMovement.and.returnValue(throwError(() => new Error('boom')));

      component.submit();

      expect(component.errorMessage).toContain('entrada');
      expect(component.submitting).toBeFalse();
    });

    it('no registra nada sin tipo de movimiento resuelto', () => {
      open('IN');
      component.movementTypeId = null;

      component.submit();

      expect(createInventoryMovement).not.toHaveBeenCalled();
    });
  });
});
