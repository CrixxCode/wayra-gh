import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CreatePackage } from './create-package';
import { PackagesService } from '../../../services/package';

describe('CreatePackage', () => {
  let component: CreatePackage;
  let fixture: ComponentFixture<CreatePackage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePackage],
      providers: [
        {
          provide: PackagesService,
          useValue: {
            createPackage: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreatePackage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
