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

  describe('administrador de plataforma', () => {
    beforeEach(() => {
      // Superusuario sin hotel propio (AGENTS.md 5.4): gestiona hoteles ajenos.
      component.isSuperAdmin = true;
      component.canEdit = true;
      component.isCreatingHotel = false;
    });

    it('bloquea la edicion hasta elegir un hotel, y lo avisa', () => {
      component.selectedHotelSettingsId = null;

      expect(component.mustSelectHotel).toBeTrue();
      expect(component.canManageSelectedHotel).toBeFalse();
      expect(component.isActiveTabReadOnly).toBeTrue();
    });

    it('habilita la edicion al elegir un hotel', () => {
      component.selectedHotelSettingsId = 8;

      expect(component.mustSelectHotel).toBeFalse();
      expect(component.isActiveTabReadOnly).toBeFalse();
    });

    it('no pide elegir hotel mientras se esta creando uno', () => {
      component.selectedHotelSettingsId = null;
      component.isCreatingHotel = true;

      expect(component.mustSelectHotel).toBeFalse();
      expect(component.isActiveTabReadOnly).toBeFalse();
    });

    it('un administrador de hotel edita sin tener que elegir nada', () => {
      component.isSuperAdmin = false;
      component.selectedHotelSettingsId = null;

      expect(component.mustSelectHotel).toBeFalse();
      expect(component.isActiveTabReadOnly).toBeFalse();
    });

    it('sin permiso de escritura la vista queda en solo lectura', () => {
      component.selectedHotelSettingsId = 8;
      component.canEdit = false;

      expect(component.isActiveTabReadOnly).toBeTrue();
    });
  });
});
