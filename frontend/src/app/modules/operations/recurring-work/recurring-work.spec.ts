import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { RecurringWork } from './recurring-work';
import { MasterDataService } from '../../../services/master-data.service';
import { RecurringWorkService } from '../../../services/recurring-work';
import { RoomService } from '../../../services/room';

const dayKey = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const rule = (id: number, overrides: any = {}) =>
  ({
    id,
    room: null,
    kind: 'CLEANING',
    name: `Regla ${id}`,
    frequency: 'WEEKLY',
    interval: 1,
    weekday: 0,
    starts_on: dayKey(-7),
    next_run_on: dayKey(3),
    generated_count: 4,
    is_active: true,
    ...overrides
  }) as any;

describe('RecurringWork', () => {
  let component: RecurringWork;
  let fixture: ComponentFixture<RecurringWork>;

  const listRecurringWork = jasmine.createSpy('listRecurringWork');
  const createRecurringWork = jasmine.createSpy('createRecurringWork');
  const updateRecurringWork = jasmine.createSpy('updateRecurringWork');

  beforeEach(async () => {
    listRecurringWork.calls.reset();
    createRecurringWork.calls.reset();
    updateRecurringWork.calls.reset();

    listRecurringWork.and.returnValue(of([]));
    createRecurringWork.and.returnValue(of(rule(1)));
    updateRecurringWork.and.returnValue(of(rule(1)));

    await TestBed.configureTestingModule({
      imports: [RecurringWork],
      providers: [
        {
          provide: RecurringWorkService,
          useValue: {
            listRecurringWork,
            createRecurringWork,
            updateRecurringWork,
            deleteRecurringWork: () => of(void 0)
          }
        },
        { provide: RoomService, useValue: { listRooms: () => of([]) } },
        { provide: MasterDataService, useValue: { listMasterData: () => of([]) } },
        ConfirmationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RecurringWork);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('la regla en castellano', () => {
    // Comprobar "cada 2 semanas los lunes" leyendo tres selectores sueltos es justo lo
    // que hace que se programe mal.
    it('describe la frecuencia diaria', () => {
      expect(component.describe({ frequency: 'DAILY', interval: 1 })).toBe('Todos los dias');
      expect(component.describe({ frequency: 'DAILY', interval: 3 })).toBe('Cada 3 dias');
    });

    it('describe la semanal con su dia', () => {
      expect(component.describe({ frequency: 'WEEKLY', interval: 1, weekday: 0 })).toBe(
        'Todos los lunes'
      );
      expect(component.describe({ frequency: 'WEEKLY', interval: 2, weekday: 4 })).toContain(
        'cada 2 semanas, los viernes'
      );
    });

    it('describe la mensual con su dia', () => {
      expect(component.describe({ frequency: 'MONTHLY', interval: 1, day_of_month: 15 })).toBe(
        'El dia 15 de cada mes'
      );
    });
  });

  describe('proxima generacion', () => {
    it('dice cuanto falta, no la fecha suelta', () => {
      expect(component.nextRunLabel(rule(1, { next_run_on: dayKey(0) }))).toBe('Genera hoy');
      expect(component.nextRunLabel(rule(2, { next_run_on: dayKey(1) }))).toBe('Genera maniana');
      expect(component.nextRunLabel(rule(3, { next_run_on: dayKey(5) }))).toBe('Genera en 5 dias');
    });

    it('una regla pausada no anuncia nada', () => {
      expect(component.nextRunLabel(rule(1, { is_active: false }))).toBe('Pausada');
      expect(component.isImminent(rule(1, { is_active: false, next_run_on: dayKey(0) }))).toBeFalse();
    });

    it('marca como inminente lo que genera hoy o maniana', () => {
      expect(component.isImminent(rule(1, { next_run_on: dayKey(1) }))).toBeTrue();
      expect(component.isImminent(rule(2, { next_run_on: dayKey(4) }))).toBeFalse();
    });
  });

  describe('alcance', () => {
    it('sin habitacion, la regla es de todo el hotel', () => {
      expect(component.scopeLabel(rule(1, { room: null }))).toBe('Todas las habitaciones');
      expect(component.scopeLabel(rule(2, { room: 5, room_number: '101' }))).toBe(
        'Habitacion 101'
      );
    });
  });

  describe('formulario', () => {
    it('exige nombre y, en limpieza, tipo de tarea', () => {
      component.openCreate('CLEANING');
      component.form.name = '';
      expect(component.canSave).toBeFalse();

      component.form.name = 'Limpieza semanal';
      expect(component.canSave).toBeFalse();

      component.form.task_type = 'PROFUNDA';
      expect(component.canSave).toBeTrue();
    });

    it('una orden de mantenimiento no necesita tipo de tarea', () => {
      component.openCreate('MAINTENANCE');
      component.form.name = 'Revision de aires';

      expect(component.canSave).toBeTrue();
    });

    // Mandar un dia del mes en una regla semanal deja un dato que nadie lee.
    it('solo envia lo que la frecuencia usa', () => {
      component.openCreate('MAINTENANCE');
      component.form.name = 'Revision';
      component.form.frequency = 'WEEKLY';
      component.form.weekday = 2;
      component.form.day_of_month = 15;

      component.save();

      const [payload] = createRecurringWork.calls.mostRecent().args;
      expect(payload.weekday).toBe(2);
      expect(payload.day_of_month).toBeNull();
    });

    it('el intervalo nunca baja de uno', () => {
      component.openCreate('MAINTENANCE');
      component.form.name = 'Revision';
      component.form.interval = 0 as any;

      expect(component.canSave).toBeFalse();
    });

    it('avisa si el guardado falla y no cierra el formulario', () => {
      createRecurringWork.and.returnValue(throwError(() => new Error('boom')));
      component.openCreate('MAINTENANCE');
      component.form.name = 'Revision';

      component.save();

      expect(component.showForm).toBeTrue();
      expect(component.errorMessage).toContain('No fue posible guardar');
    });
  });

  it('separa las reglas por tipo de trabajo', () => {
    component.rules = [rule(1, { kind: 'CLEANING' }), rule(2, { kind: 'MAINTENANCE' })];

    expect(component.cleaningRules.map((entry) => entry.id)).toEqual([1]);
    expect(component.maintenanceRules.map((entry) => entry.id)).toEqual([2]);
  });
});
