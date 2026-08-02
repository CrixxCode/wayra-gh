import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CreateService } from './create-service';
import { ServicesService } from '../../../services/service';

describe('CreateService', () => {
  let component: CreateService;
  let fixture: ComponentFixture<CreateService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateService],
      providers: [
        {
          provide: ServicesService,
          useValue: {
            createService: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateService);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
