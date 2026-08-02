import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { HotelSettingsService } from './hotel-settings';

describe('HotelSettingsService', () => {
  let service: HotelSettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(HotelSettingsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
