import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { UpdatePackage } from './update-package';
import { PackagesService } from '../../../services/package';

describe('UpdatePackage', () => {
  let component: UpdatePackage;
  let fixture: ComponentFixture<UpdatePackage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePackage],
      providers: [
        {
          provide: PackagesService,
          useValue: {
            updatePackage: () => of({}),
            listPackageServices: () => of([]),
            createPackageService: () => of({}),
            deletePackageService: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdatePackage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
