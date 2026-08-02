import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConfirmationService } from 'primeng/api';

import { HotelSettings } from './hotel-settings';

describe('HotelSettings', () => {
  let component: HotelSettings;
  let fixture: ComponentFixture<HotelSettings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HotelSettings],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ConfirmationService
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HotelSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
