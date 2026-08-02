import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth/auth';
import { PackagesService } from './package';

class AuthServiceMock {
  buildCsrfRequestOptions() {
    return { withCredentials: true };
  }
}

describe('PackagesService', () => {
  let service: PackagesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: AuthServiceMock }
      ]
    });
    service = TestBed.inject(PackagesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
