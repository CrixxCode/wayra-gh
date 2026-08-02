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
});
