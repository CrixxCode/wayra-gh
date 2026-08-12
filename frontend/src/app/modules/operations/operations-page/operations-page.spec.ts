import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { OperationsPage } from './operations-page';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';

const dayKey = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString();
};

const task = (id: number, room: number, overrides: any = {}) => ({
  id,
  room,
  room_number: `10${room}`,
  task_type: 'LIMPIEZA',
  status: 'PENDIENTE',
  ...overrides
});

const order = (id: number, room: number, overrides: any = {}) => ({
  id,
  room,
  room_number: `10${room}`,
  title: 'Averia',
  status: 'PENDIENTE',
  ...overrides
});

describe('OperationsPage', () => {
  let component: OperationsPage;
  let fixture: ComponentFixture<OperationsPage>;

  const listCleaningTasks = jasmine.createSpy('listCleaningTasks');
  const listMaintenanceOrders = jasmine.createSpy('listMaintenanceOrders');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (data: { tasks?: any[]; orders?: any[]; tab?: string } = {}) => {
    listCleaningTasks.calls.reset();
    listMaintenanceOrders.calls.reset();
    navigate.calls.reset();

    listCleaningTasks.and.returnValue(of(data.tasks || []));
    listMaintenanceOrders.and.returnValue(of(data.orders || []));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [OperationsPage],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          { provide: CleaningTasksService, useValue: { listCleaningTasks } },
          { provide: MaintenanceOrdersService, useValue: { listMaintenanceOrders } },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => data.tab ?? null } } }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(OperationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const metric = (key: string) => component.metrics.find((entry) => entry.key === key)!;

  // El tablero por habitacion es lo que ninguna de las dos listas contestaba.
  it('abre en el tablero por habitacion', async () => {
    await setup();

    expect(component.activeTab).toBe('rooms');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'maintenance' });

    expect(component.activeTab).toBe('maintenance');
  });

  describe('lo abierto', () => {
    it('deja fuera lo ya cerrado', async () => {
      await setup({
        tasks: [task(1, 1), task(2, 1, { status: 'COMPLETADA' })],
        orders: [order(3, 2, { status: 'Cerrada' })]
      });

      expect(component.openTasks.map((entry) => entry.id)).toEqual([1]);
      expect(component.openOrders).toEqual([]);
    });

    it('cuenta como atrasado lo que paso su fecha y sigue abierto', async () => {
      await setup({
        tasks: [task(1, 1, { scheduled_for: dayKey(-2) }), task(2, 1, { scheduled_for: dayKey(3) })],
        orders: [order(3, 2, { estimated_completed_at: dayKey(-1) })]
      });

      expect(component.overdueCount).toBe(2);
      expect(metric('overdue').tone).toBe('danger');
    });

    it('no cuenta como atrasado lo cerrado fuera de plazo', async () => {
      await setup({
        tasks: [task(1, 1, { scheduled_for: dayKey(-5), status: 'COMPLETADA' })]
      });

      expect(component.overdueCount).toBe(0);
      expect(metric('overdue').tone).toBe('success');
    });

    it('separa lo que ni siquiera ha empezado', async () => {
      await setup({
        tasks: [task(1, 1), task(2, 1, { status: 'EN PROCESO' })],
        orders: [order(3, 2)]
      });

      expect(component.untouchedCount).toBe(2);
    });

    it('cuenta lo cerrado hoy', async () => {
      await setup({
        tasks: [task(1, 1, { status: 'COMPLETADA', completed_at: dayKey(0) })],
        orders: [order(2, 2, { status: 'COMPLETADA', completed_at: dayKey(-3) })]
      });

      expect(component.doneTodayCount).toBe(1);
    });
  });

  describe('tablero por habitacion', () => {
    // Una habitacion con limpieza y averia abiertas no es lo mismo que una con solo una.
    it('junta los dos frentes de la misma habitacion', async () => {
      await setup({ tasks: [task(1, 5)], orders: [order(2, 5)] });

      expect(component.roomsWithWork.length).toBe(1);
      expect(component.roomsWithWork[0].tasks.length).toBe(1);
      expect(component.roomsWithWork[0].orders.length).toBe(1);
      expect(component.roomsBlockedByBoth).toBe(1);
    });

    it('pone primero lo atrasado', async () => {
      await setup({
        tasks: [task(1, 1), task(2, 2, { scheduled_for: dayKey(-4) })]
      });

      expect(component.roomsWithWork[0].id).toBe(2);
      expect(component.roomsWithWork[0].overdue).toBe(1);
    });

    it('ignora el trabajo sin habitacion', async () => {
      await setup({ tasks: [task(1, 0)] });

      expect(component.roomsWithWork).toEqual([]);
    });

    it('sigue una habitacion en la pestaña pedida', async () => {
      await setup();

      component.followRoom({ id: 7, label: '107' }, 'maintenance');

      expect(component.activeTab).toBe('maintenance');
      expect(component.focus).toEqual({ id: 7, label: '107' });
    });

    it('suelta la habitacion al dejar de seguirla', async () => {
      await setup();
      component.followRoom({ id: 7, label: '107' }, 'cleaning');

      component.clearFocus();

      expect(component.focus).toBeNull();
    });
  });

  // La escritura ya invalido el cache desde el servicio, asi que esto va al servidor
  // igual. Forzarlo ademas anularia la deduplicacion de peticiones en vuelo y la lista
  // de la pestaña pediria lo mismo por segunda vez (429 con unos pocos clics).
  it('recarga sin forzar el cache cuando cambia algo', async () => {
    await setup();
    listCleaningTasks.calls.reset();

    component.onWorkChanged();

    expect(listCleaningTasks).toHaveBeenCalled();
    const [filters] = listCleaningTasks.calls.mostRecent().args;
    expect(filters.forceRefresh).toBeFalse();
  });

  it('no vacia la pantalla al recargar tras un cambio', async () => {
    await setup();
    let loadingDuranteRecarga = false;
    listCleaningTasks.and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      return of([]);
    });

    component.onWorkChanged();

    expect(loadingDuranteRecarga).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
