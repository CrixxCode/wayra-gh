import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth/auth';
import { PromotionsService } from './promotion';

class AuthServiceMock {
  buildCsrfRequestOptions() {
    return { withCredentials: true };
  }
}

describe('PromotionsService', () => {
  let service: PromotionsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: AuthServiceMock }
      ]
    });
    service = TestBed.inject(PromotionsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
