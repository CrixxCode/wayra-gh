import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CreatePromotion } from './create-promotion';
import { PromotionsService } from '../../../services/promotion';

describe('CreatePromotion', () => {
  let component: CreatePromotion;
  let fixture: ComponentFixture<CreatePromotion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePromotion],
      providers: [
        {
          provide: PromotionsService,
          useValue: {
            createPromotion: () => of({})
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreatePromotion);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
