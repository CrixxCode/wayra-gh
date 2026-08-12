import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { ListItems } from './list-items';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { ItemsService } from '../../../services/item';
import { MasterDataService } from '../../../services/master-data.service';

describe('ListItems', () => {
  let component: ListItems;
  let fixture: ComponentFixture<ListItems>;

  const listItems = jasmine.createSpy('listItems');
  const createInventoryMovement = jasmine.createSpy('createInventoryMovement');

  beforeEach(async () => {
    listItems.calls.reset();
    listItems.and.returnValue(of([]));
    createInventoryMovement.calls.reset();
    createInventoryMovement.and.returnValue(of({ id: 1, new_stock: 4 }));

    await TestBed.configureTestingModule({
      imports: [ListItems],
      providers: [
        {
          provide: ItemsService,
          useValue: {
            listItems,
            updateItem: () => of({}),
            deleteItem: () => of({}),
            restoreItem: () => of({})
          }
        },
        { provide: InventoryMovementsService, useValue: { createInventoryMovement } },
        { provide: MasterDataService, useValue: { listMasterData: () => of([]) } },
        { provide: HotelSettingsService, useValue: { getCurrentSettings: () => of(null) } },
        ConfirmationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListItems);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('cuando una peticion falla', () => {
    // Un 429 hacia que `items` llegara vacio mientras `allItems` traia los 37, y la
    // vista concluia que los 37 estaban eliminados: parecia perdida de informacion.
    it('conserva el listado anterior y no inventa una papelera', () => {
      const items: any[] = [{ id: 1, name: 'Toallas', stock: 5, is_active: true }];
      component.items = items;
      component.deletedItems = [];
      listItems.and.returnValue(throwError(() => new Error('429')));

      component.loadCatalogData({ silent: true });

      expect(component.items).toBe(items);
      expect(component.deletedItems).toEqual([]);
      expect(component.errorMessage).toContain('ultima version cargada');
    });
  });

  describe('volumen de peticiones', () => {
    // El boton "Actualizar" si pide datos frescos; la recarga posterior a una accion no,
    // porque la escritura ya invalido el cache y forzarla duplicaba las peticiones.
    it('solo fuerza el cache cuando lo pide el usuario', () => {
      component.refreshItems();
      const [afterAction] = listItems.calls.mostRecent().args;
      expect(afterAction.forceRefresh).toBeFalse();

      component.refreshItems(true);
      const [manual] = listItems.calls.mostRecent().args;
      expect(manual.forceRefresh).toBeTrue();
    });

    // La papelera solo cambia al eliminar o restaurar.
    it('no vuelve a pedir los eliminados en una recarga silenciosa', () => {
      listItems.calls.reset();

      component.loadCatalogData({ silent: true });

      const deletedCalls = listItems.calls
        .allArgs()
        .filter(([filters]: any[]) => filters?.include_deleted);
      expect(deletedCalls.length).toBe(0);
    });

    it('si los pide en la primera carga', () => {
      listItems.calls.reset();

      component.loadCatalogData();

      const deletedCalls = listItems.calls
        .allArgs()
        .filter(([filters]: any[]) => filters?.include_deleted);
      expect(deletedCalls.length).toBe(1);
    });
  });
});
