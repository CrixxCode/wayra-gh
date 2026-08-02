import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { ListPromotions } from './list-promotions';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { PackagesService } from '../../../services/package';
import { PromotionsService } from '../../../services/promotion';
import { ServicesService } from '../../../services/service';

describe('ListPromotions', () => {
  let component: ListPromotions;
  let fixture: ComponentFixture<ListPromotions>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListPromotions],
      providers: [
        {
          provide: PromotionsService,
          useValue: {
            listPromotions: () => of([]),
            getTargetCatalog: () => of({ services: [], packages: [] }),
            updatePromotion: () => of({}),
            deletePromotion: () => of({})
          }
        },
        {
          provide: MasterDataService,
          useValue: {
            listMasterData: () => of([])
          }
        },
        {
          provide: ServicesService,
          useValue: {
            listServices: () => of([])
          }
        },
        {
          provide: PackagesService,
          useValue: {
            listPackages: () => of([])
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

    fixture = TestBed.createComponent(ListPromotions);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
