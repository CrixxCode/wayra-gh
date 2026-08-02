import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { ListPackages } from './list-packages';
import { PackagesService } from '../../../services/package';
import { RoomService } from '../../../services/room';
import { ServicesService } from '../../../services/service';
import { HotelSettingsService } from '../../../services/hotel-settings';

describe('ListPackages', () => {
  let component: ListPackages;
  let fixture: ComponentFixture<ListPackages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListPackages],
      providers: [
        {
          provide: PackagesService,
          useValue: {
            listPackages: () => of([]),
            listPackageServices: () => of([]),
            updatePackage: () => of({}),
            deletePackage: () => of({})
          }
        },
        {
          provide: ServicesService,
          useValue: {
            listServices: () => of([])
          }
        },
        {
          provide: RoomService,
          useValue: {
            listRoomTypes: () => of([])
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

    fixture = TestBed.createComponent(ListPackages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
