import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { HotelSetupService, HotelSetupStatus } from '../services/hotel-setup';
import { hotelSetupChildGuard } from './hotel-setup.guard';

describe('hotelSetupChildGuard', () => {
  let status: HotelSetupStatus;

  beforeEach(() => {
    status = { is_complete: false, can_configure: true, missing_fields: [], must_change_password: false };
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: HotelSetupService, useValue: { refresh: () => of(status) } },
    ] });
  });

  async function navigate(path: string) {
    const result = TestBed.runInInjectionContext(() => hotelSetupChildGuard(
      { routeConfig: { path } } as ActivatedRouteSnapshot,
      { url: `/${path}` } as RouterStateSnapshot
    )) as Observable<boolean | UrlTree>;
    const value = await firstValueFrom(result);
    return value instanceof UrlTree ? TestBed.inject(Router).serializeUrl(value) : value;
  }

  it('blocks direct operational navigation and sends editors to configuration', async () => {
    expect(await navigate('reservas')).toBe('/hotel-config');
  });

  it('gives users without configuration permissions an accessible recovery page', async () => {
    status.can_configure = false;
    expect(await navigate('dashboard')).toBe('/hotel-setup');
    expect(await navigate('hotel-setup')).toBeTrue();
  });

  it('keeps configuration and password changes available', async () => {
    expect(await navigate('hotel-config')).toBeTrue();
    expect(await navigate('mi-perfil')).toBeTrue();
  });

  it('unlocks navigation after completion is verified', async () => {
    expect(await navigate('reservas')).toBe('/hotel-config');
    status.is_complete = true;
    expect(await navigate('reservas')).toBeTrue();
  });

  it('keeps operations blocked when verification fails', async () => {
    status.can_configure = false;
    status.verification_failed = true;
    expect(await navigate('pagos')).toBe('/hotel-setup');
  });
});
