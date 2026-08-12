import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailRoomInventory } from './detail-room-inventory';

const line = (id: number, name: string, quantity: number, minimum: number, overrides: any = {}) => ({
  id,
  room: 1,
  item: id,
  item_name: name,
  quantity,
  minimum_quantity: minimum,
  is_active: true,
  ...overrides
});

describe('DetailRoomInventory', () => {
  let component: DetailRoomInventory;
  let fixture: ComponentFixture<DetailRoomInventory>;

  const withLines = (items: any[]) => {
    component.roomGroup = { key: 'room-1', label: 'Habitacion 101', items };
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailRoomInventory] }).compileComponents();

    fixture = TestBed.createComponent(DetailRoomInventory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('lectura', () => {
    // En una habitacion con veinte lineas el orden alfabetico entierra lo urgente.
    it('ordena por urgencia y no por nombre', () => {
      withLines([
        line(1, 'Almohada', 9, 2),
        line(2, 'Zapatillas', 0, 2),
        line(3, 'Toalla', 2, 2)
      ]);

      expect(component.records.map((record) => record.id)).toEqual([2, 3, 1]);
    });

    it('resume la cobertura en un porcentaje', () => {
      withLines([line(1, 'A', 9, 2), line(2, 'B', 0, 2), line(3, 'C', 8, 1), line(4, 'D', 7, 1)]);

      expect(component.coveredItems).toBe(3);
      expect(component.coveragePercent).toBe(75);
    });

    it('titula con lo mas grave que haya', () => {
      withLines([line(1, 'A', 0, 2), line(2, 'B', 1, 3)]);

      expect(component.coverageHeadline).toBe('1 sin stock');
      expect(component.coverageTone.color).toContain('danger');
    });

    it('avisa cuando todo esta completo', () => {
      withLines([line(1, 'A', 9, 2)]);

      expect(component.coverageHeadline).toBe('Dotacion completa');
      expect(component.coveragePercent).toBe(100);
    });

    it('mide cada linea contra su propio minimo', () => {
      withLines([line(1, 'A', 1, 4)]);

      expect(component.getRecordFillPercent(component.records[0])).toBe(25);
    });

    // Sin minimo definido no hay nada contra que medir.
    it('llena la barra si hay existencias y no hay minimo', () => {
      withLines([line(1, 'A', 3, 0)]);

      expect(component.getRecordFillPercent(component.records[0])).toBe(100);
    });
  });

  describe('ajuste de cantidad', () => {
    it('parte del valor guardado y no pide guardar sin cambios', () => {
      withLines([line(1, 'A', 4, 2)]);
      const record = component.records[0];

      expect(component.draftFor(record)).toBe(4);
      expect(component.hasPendingChange(record)).toBeFalse();
    });

    it('suma y resta sin bajar de cero', () => {
      withLines([line(1, 'A', 1, 2)]);
      const record = component.records[0];

      component.stepDraft(record, -1);
      component.stepDraft(record, -1);

      expect(component.draftFor(record)).toBe(0);
    });

    it('completa al minimo de un golpe', () => {
      withLines([line(1, 'A', 1, 6)]);
      const record = component.records[0];

      component.fillToMinimum(record);

      expect(component.draftFor(record)).toBe(6);
      expect(component.hasPendingChange(record)).toBeTrue();
    });

    it('emite la nueva cantidad al guardar', () => {
      withLines([line(1, 'A', 1, 6)]);
      const record = component.records[0];
      const emitidos: any[] = [];
      component.quantityRequested.subscribe((value) => emitidos.push(value));

      component.fillToMinimum(record);
      component.saveQuantity(record);

      expect(emitidos).toEqual([{ record, quantity: 6 }]);
    });

    it('no emite nada si no hay cambio', () => {
      withLines([line(1, 'A', 4, 2)]);
      const record = component.records[0];
      const emitidos: any[] = [];
      component.quantityRequested.subscribe((value) => emitidos.push(value));

      component.saveQuantity(record);

      expect(emitidos).toEqual([]);
    });

    it('descarta el borrador y vuelve al valor guardado', () => {
      withLines([line(1, 'A', 4, 2)]);
      const record = component.records[0];
      component.stepDraft(record, 5);

      component.discardDraft(record);

      expect(component.draftFor(record)).toBe(4);
      expect(component.hasPendingChange(record)).toBeFalse();
    });

    it('bloquea solo la linea que se esta guardando', () => {
      withLines([line(1, 'A', 4, 2), line(2, 'B', 4, 2)]);
      component.savingRecordId = 1;

      expect(component.isSaving(component.records[0])).toBeTrue();
      expect(component.isSaving(component.records[1])).toBeFalse();
    });
  });
});
