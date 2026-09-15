import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { hotelSetupInterceptor } from '../interceptors/hotel-setup.interceptor';
import { HotelSettingsService } from './hotel-settings';
import { HotelSetupService, HotelSetupStatus } from './hotel-setup';

describe('HotelSetupService', () => {
  let setup: HotelSetupService;
  let http: HttpTestingController;
  const complete: HotelSetupStatus = {
    is_complete: true, missing_fields: [], can_configure: true, must_change_password: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([hotelSetupInterceptor])), provideHttpClientTesting(),
    ] });
    setup = TestBed.inject(HotelSetupService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('checks persisted status without a first-login storage flag', () => {
    setup.refresh().subscribe();
    const request = http.expectOne((req) => req.url.endsWith('/api/auth/hotel-setup/'));
    expect(request.request.withCredentials).toBeTrue();
    request.flush(complete);
    expect(setup.status()?.is_complete).toBeTrue();
  });

  it('fails closed after a network error, even if previously complete', () => {
    setup.status.set(complete);
    setup.refresh().subscribe();
    http.expectOne((req) => req.url.endsWith('/api/auth/hotel-setup/')).error(new ProgressEvent('error'));
    expect(setup.status()?.is_complete).toBeFalse();
    expect(setup.status()?.verification_failed).toBeTrue();
  });

  it('refreshes the alert after saving hotel settings', () => {
    setup.status.set({ ...complete, is_complete: false });
    let saved = false;
    TestBed.inject(HotelSettingsService).updateSettings(7, { city: 'Medellín' }).subscribe(() => saved = true);
    http.expectOne((req) => req.url.endsWith('/api/hotel-settings/7/')).flush({ id: 7 });
    http.expectOne((req) => req.url.endsWith('/api/auth/hotel-setup/')).flush(complete);
    expect(saved).toBeTrue();
    expect(setup.status()?.is_complete).toBeTrue();
  });

  it('restores the blocking alert when the API rejects an operation', () => {
    setup.status.set(complete);
    TestBed.inject(HttpClient).post('/api/clients/', {}).subscribe({ error: () => {} });
    http.expectOne('/api/clients/').flush({
      ...complete, is_complete: false, code: 'hotel_setup_required',
      missing_fields: [{ field: 'address', label: 'dirección' }],
    }, { status: 403, statusText: 'Forbidden' });
    expect(setup.status()?.is_complete).toBeFalse();
    expect(setup.status()?.missing_fields[0].field).toBe('address');
  });
});
