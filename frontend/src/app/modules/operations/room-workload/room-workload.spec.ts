import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomWorkload, RoomWork } from './room-workload';

const room = (id: number, overrides: Partial<RoomWork> = {}): RoomWork => ({
  id,
  label: `10${id}`,
  tasks: [],
  orders: [],
  overdue: 0,
  ...overrides
});

const task = (id: number) => ({ id, room: 1, task_type_label: 'Salida', status: 'PENDIENTE' }) as any;
const order = (id: number, title = 'Aire acondicionado') =>
  ({ id, room: 1, title, status: 'PENDIENTE' }) as any;

describe('RoomWorkload', () => {
  let component: RoomWorkload;
  let fixture: ComponentFixture<RoomWorkload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RoomWorkload] }).compileComponents();

    fixture = TestBed.createComponent(RoomWorkload);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('titular de la habitacion', () => {
    // Lo mas grave manda: el atraso pesa mas que tener dos frentes abiertos.
    it('avisa del atraso antes que nada', () => {
      const entry = room(1, { tasks: [task(1)], orders: [order(2)], overdue: 2 });

      expect(component.headline(entry)).toBe('2 fuera de plazo');
      expect(component.tone(entry).color).toContain('danger');
    });

    it('avisa cuando hacen falta dos equipos', () => {
      const entry = room(1, { tasks: [task(1)], orders: [order(2)] });

      expect(component.needsBoth(entry)).toBeTrue();
      expect(component.headline(entry)).toBe('Limpieza y reparacion');
    });

    it('distingue un solo frente', () => {
      expect(component.headline(room(1, { tasks: [task(1)] }))).toBe('Solo limpieza');
      expect(component.headline(room(2, { orders: [order(1)] }))).toBe('Solo mantenimiento');
    });
  });

  describe('vista previa', () => {
    // Se ensena la cola sin obligar a abrir la habitacion.
    it('mezcla limpieza y averias, y recorta', () => {
      const entry = room(1, {
        tasks: [task(1), task(2)],
        orders: [order(3, 'Ducha'), order(4, 'Puerta')]
      });

      expect(component.previewLines(entry).length).toBe(3);
      expect(component.previewLines(entry)[0]).toContain('Limpieza:');
      expect(component.hiddenLines(entry)).toBe(1);
    });

    it('no anuncia mas cuando caben todas', () => {
      expect(component.hiddenLines(room(1, { tasks: [task(1)] }))).toBe(0);
    });
  });

  describe('filtros', () => {
    beforeEach(() => {
      component.rooms = [
        room(1, { tasks: [task(1)] }),
        room(2, { tasks: [task(2)], orders: [order(3)] }),
        room(3, { orders: [order(4)], overdue: 1 })
      ];
    });

    it('deja solo las atrasadas', () => {
      component.filter = 'OVERDUE';

      expect(component.visibleRooms.map((entry) => entry.id)).toEqual([3]);
    });

    it('deja solo las de doble frente', () => {
      component.filter = 'BOTH';

      expect(component.visibleRooms.map((entry) => entry.id)).toEqual([2]);
    });

    it('busca por numero de habitacion', () => {
      component.search = '102';

      expect(component.visibleRooms.map((entry) => entry.id)).toEqual([2]);
    });
  });

  describe('saltos', () => {
    it('pide abrir la limpieza de la habitacion', () => {
      const entry = room(4, { tasks: [task(1)] });
      const pedidos: any[] = [];
      component.openWork.subscribe((value) => pedidos.push(value));

      component.goToCleaning(entry);

      expect(pedidos).toEqual([{ room: { id: 4, label: '104' }, tab: 'cleaning' }]);
    });

    it('pide abrir el mantenimiento de la habitacion', () => {
      const entry = room(4, { orders: [order(1)] });
      const pedidos: any[] = [];
      component.openWork.subscribe((value) => pedidos.push(value));

      component.goToMaintenance(entry);

      expect(pedidos[0].tab).toBe('maintenance');
    });
  });
});
