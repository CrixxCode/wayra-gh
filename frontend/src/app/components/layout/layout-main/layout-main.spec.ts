import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { LayoutMain } from './layout-main';
import { HotelSetupService } from '../../../services/hotel-setup';

describe('LayoutMain', () => {
  let component: LayoutMain;
  let fixture: ComponentFixture<LayoutMain>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutMain],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LayoutMain);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps a non-dismissible alert until the saved setup is complete', () => {
    const setup = TestBed.inject(HotelSetupService);
    setup.status.set({
      is_complete: false,
      can_configure: true,
      must_change_password: false,
      missing_fields: [{ field: 'address', label: 'dirección' }],
    });
    fixture.detectChanges();
    const alert: HTMLElement = fixture.nativeElement.querySelector('.hotel-setup-alert');
    expect(alert.textContent).toContain('dirección');
    expect(alert.textContent).toContain('Las operaciones están bloqueadas');
    expect(alert.querySelector('button')).toBeNull();
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('/hotel-config');

    setup.status.update((status) => ({ ...status!, is_complete: true, missing_fields: [] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hotel-setup-alert')).toBeNull();
  });

  it('guides users without configuration access to the hotel administrator', () => {
    TestBed.inject(HotelSetupService).status.set({
      is_complete: false, can_configure: false, must_change_password: false,
      missing_fields: [{ field: 'address', label: 'dirección' }],
    });
    fixture.detectChanges();
    const alert: HTMLElement = fixture.nativeElement.querySelector('.hotel-setup-alert');
    expect(alert.textContent).toContain('Contacta al administrador del hotel');
    expect(alert.querySelector('a')).toBeNull();
  });
});
