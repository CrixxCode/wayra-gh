import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { UpdateService } from './update-service';
import { ServicesService } from '../../../services/service';

describe('UpdateService', () => {
  let component: UpdateService;
  let fixture: ComponentFixture<UpdateService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateService],
      providers: [
        {
          provide: ServicesService,
          useValue: {
            updateService: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateService);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
