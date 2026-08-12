import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { ListServices } from './list-services';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { ServicesService } from '../../../services/service';

describe('ListServices', () => {
  let component: ListServices;
  let fixture: ComponentFixture<ListServices>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListServices],
      providers: [
        {
          provide: ServicesService,
          useValue: {
            listServices: () => of([]),
            updateService: () => of({}),
            deleteService: () => of({})
          }
        },
        {
          provide: MasterDataService,
          useValue: {
            listMasterData: () => of([])
          }
        },
        {
          provide: HotelSettingsService,
          useValue: {
            getCurrentSettings: () => of(null)
          }
        },
        ConfirmationService
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListServices);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // `loading` desmonta la cuadricula entera (`*ngIf="!loading"`). Si se activara al
  // recargar, activar o eliminar un servicio se veria como si la pagina se recargara.
  it('no desmonta la cuadricula al recargar tras una accion', () => {
    let loadingDuranteRecarga = false;
    const original = component.applyFilters.bind(component);
    spyOn(component, 'applyFilters').and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      original();
    });

    component.refreshServices();

    expect(loadingDuranteRecarga).toBeFalse();
    expect(component.loading).toBeFalse();
  });

  it('pinta el estado nuevo sin esperar la recarga', () => {
    const service: any = { id: 1, name: 'Spa', is_active: true };
    component.services = [service];

    component.toggleServiceStatus(service);

    expect(service.is_active).toBeFalse();
  });
});
