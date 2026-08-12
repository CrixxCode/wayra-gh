import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { InventoryPage } from './inventory-page';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { ItemsService } from '../../../services/item';
import { RoomInventoryService } from '../../../services/room-inventory';

const item = (id: number, stock: number, minimum: number, overrides: any = {}) => ({
  id,
  name: `Item ${id}`,
  stock,
  minimum_stock: minimum,
  maximum_stock: minimum * 4,
  cost_price: 1000,
  is_active: true,
  ...overrides
});

const line = (id: number, room: number, quantity: number, minimum: number) => ({
  id,
  room,
  item: id,
  quantity,
  minimum_quantity: minimum,
  is_active: true
});

const movement = (id: number, itemId: number, dayOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return { id, item: itemId, quantity: 1, movement_date: date.toISOString(), is_active: true };
};

describe('InventoryPage', () => {
  let component: InventoryPage;
  let fixture: ComponentFixture<InventoryPage>;

  const listItems = jasmine.createSpy('listItems');
  const listRoomInventory = jasmine.createSpy('listRoomInventory');
  const listInventoryMovements = jasmine.createSpy('listInventoryMovements');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (
    data: { items?: any[]; rooms?: any[]; movements?: any[]; tab?: string } = {}
  ) => {
    listItems.calls.reset();
    listRoomInventory.calls.reset();
    listInventoryMovements.calls.reset();
    navigate.calls.reset();

    listItems.and.returnValue(of(data.items || []));
    listRoomInventory.and.returnValue(of(data.rooms || []));
    listInventoryMovements.and.returnValue(of(data.movements || []));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [InventoryPage],
        providers: [
          // Las listas hijas se montan al pintar la pestaña activa y traen sus
          // propias dependencias HTTP.
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          { provide: ItemsService, useValue: { listItems } },
          { provide: RoomInventoryService, useValue: { listRoomInventory } },
          { provide: InventoryMovementsService, useValue: { listInventoryMovements } },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => data.tab ?? null } } }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(InventoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const metric = (key: string) => component.metrics.find((entry) => entry.key === key)!;

  it('abre en items por defecto', async () => {
    await setup();

    expect(component.activeTab).toBe('items');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'movements' });

    expect(component.activeTab).toBe('movements');
  });

  it('ignora una pestaña desconocida', async () => {
    await setup({ tab: 'inventado' });

    expect(component.activeTab).toBe('items');
  });

  it('cuenta cada entidad en su pestaña', async () => {
    await setup({
      items: [item(1, 10, 2), item(2, 5, 1)],
      rooms: [line(10, 100, 2, 1)],
      movements: [movement(20, 1), movement(21, 2), movement(22, 1)]
    });

    expect(component.tabCount('items')).toBe(2);
    expect(component.tabCount('rooms')).toBe(1);
    expect(component.tabCount('movements')).toBe(3);
  });

  describe('metricas', () => {
    // El aviso de bajo minimo se calculaba en dos pantallas; aqui es uno solo.
    it('cuenta como bajo minimo el stock que ya lo alcanzo', async () => {
      await setup({ items: [item(1, 2, 2), item(2, 9, 3), item(3, 0, 1)] });

      expect(component.lowStockItems.map((entry) => entry.id)).toEqual([1, 3]);
      expect(component.outOfStockItems.map((entry) => entry.id)).toEqual([3]);
      expect(metric('low').tone).toBe('danger');
    });

    it('no alarma cuando todo esta por encima del minimo', async () => {
      await setup({ items: [item(1, 20, 3)] });

      expect(metric('low').tone).toBe('success');
      expect(metric('low').note).toContain('Ninguno agotado');
    });

    it('cuenta una sola vez la habitacion con varios faltantes', async () => {
      await setup({
        rooms: [line(1, 100, 0, 2), line(2, 100, 1, 3), line(3, 200, 5, 2)]
      });

      expect(component.roomsWithGaps).toBe(1);
      expect(metric('gaps').tone).toBe('warning');
    });

    it('valora el stock al costo', async () => {
      await setup({ items: [item(1, 3, 1, { cost_price: 2000 })] });

      expect(component.inventoryValue).toBe(6000);
    });

    it('separa los movimientos de hoy del historico', async () => {
      await setup({ movements: [movement(1, 1), movement(2, 1, -3)] });

      expect(component.movementsToday.map((entry) => entry.id)).toEqual([1]);
      expect(metric('today').note).toContain('2 en el historico');
    });
  });

  describe('seguimiento de un item', () => {
    // La interaccion que faltaba: "¿por que bajo este stock?" sin volver a buscarlo.
    it('lleva el item a la pestaña pedida', async () => {
      await setup();

      component.followItem({ id: 7, name: 'Toallas' }, 'movements');

      expect(component.activeTab).toBe('movements');
      expect(component.focus).toEqual({ id: 7, name: 'Toallas' });
    });

    it('mantiene el foco al saltar de nuevo a otra pestaña', async () => {
      await setup();
      component.followItem({ id: 7, name: 'Toallas' }, 'movements');

      component.followItem({ id: 7, name: 'Toallas' }, 'rooms');

      expect(component.activeTab).toBe('rooms');
      expect(component.focus?.id).toBe(7);
    });

    it('suelta el item cuando se deja de seguir', async () => {
      await setup();
      component.followItem({ id: 7, name: 'Toallas' }, 'movements');

      component.clearFocus();

      expect(component.focus).toBeNull();
    });
  });

  it('deja la pestaña elegida en la URL para poder compartirla', async () => {
    await setup();

    component.selectTab('rooms');

    const [, extras] = navigate.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ tab: 'rooms' });
  });

  // La escritura ya invalido el cache desde el servicio, asi que esto va al servidor
  // igual. Forzarlo ademas anularia la deduplicacion de peticiones en vuelo y la lista
  // de la pestaña pediria lo mismo por segunda vez (429 con unos pocos clics).
  it('recarga sin forzar el cache cuando cambia algo', async () => {
    await setup();
    listItems.calls.reset();

    component.onInventoryChanged();

    expect(listItems).toHaveBeenCalled();
    const [filters] = listItems.calls.mostRecent().args;
    expect(filters.forceRefresh).toBeFalse();
  });

  // `loading` desmonta el panel entero: si se activara al recargar, registrar un
  // movimiento se veria como si la pantalla se recargara.
  it('no vacia la pantalla al recargar tras un cambio', async () => {
    await setup();
    let loadingDuranteRecarga = false;
    listItems.and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      return of([]);
    });

    component.onInventoryChanged();

    expect(loadingDuranteRecarga).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
