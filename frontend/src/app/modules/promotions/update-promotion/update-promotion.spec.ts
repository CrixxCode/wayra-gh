import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdatePromotion } from './update-promotion';

describe('UpdatePromotion', () => {
  let component: UpdatePromotion;
  let fixture: ComponentFixture<UpdatePromotion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePromotion]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdatePromotion);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
