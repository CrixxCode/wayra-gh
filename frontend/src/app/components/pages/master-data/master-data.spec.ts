import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

import { MasterDataComponent } from './master-data';
import { MasterDataService } from '../../../services/master-data.service';

describe('MasterDataComponent', () => {
  let component: MasterDataComponent;
  let fixture: ComponentFixture<MasterDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MasterDataComponent],
      providers: [
        {
          provide: MasterDataService,
          useValue: {
            listGroups: () => of([]),
            listMasterDataAll: () => of([]),
            createMasterData: () => of({}),
            updateMasterData: () => of({}),
            deleteMasterData: () => of({})
          }
        },
        ConfirmationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MasterDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
