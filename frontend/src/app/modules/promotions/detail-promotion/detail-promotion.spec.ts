import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailPromotion } from './detail-promotion';

describe('DetailPromotion', () => {
  let component: DetailPromotion;
  let fixture: ComponentFixture<DetailPromotion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailPromotion]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailPromotion);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
