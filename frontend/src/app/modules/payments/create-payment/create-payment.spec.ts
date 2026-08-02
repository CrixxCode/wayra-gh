import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CreatePayment } from './create-payment';

describe('CreatePayment', () => {
  let component: CreatePayment;
  let fixture: ComponentFixture<CreatePayment>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreatePayment],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreatePayment);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
