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

  describe('personalizacion de colores', () => {
    // Antes vivian en localStorage (por navegador); ahora son parte de `form` y viajan
    // con el resto de la configuracion general al guardar (ver AGENTS.md 5.4).
    it('restablecer vuelve a los colores por defecto de Wayra', () => {
      component.form.primary_color = '#ff0000';
      component.form.secondary_color = '#00ff00';

      component.resetThemeColors();

      expect(component.form.primary_color).toBe('#0f1f41');
      expect(component.form.secondary_color).toBe('#112853');
    });

    it('normaliza un hex invalido al color por defecto', () => {
      component.form.primary_color = 'no-es-un-color';
      component.form.secondary_color = '#ABCDEF';

      component.onThemeColorsChanged();

      expect(component.form.primary_color).toBe('#0f1f41');
      expect(component.form.secondary_color).toBe('#abcdef');
    });

    it('el color de texto sobre la marca cambia segun que tan claro es el color principal', () => {
      component.form.primary_color = '#ffffff';
      expect(component.themeOnPrimaryColor).toBe('#0f172a');

      component.form.primary_color = '#000000';
      expect(component.themeOnPrimaryColor).toBe('#ffffff');
    });
  });

  describe('la ubicacion del hotel', () => {
    it('sabe cuando falta el punto exacto', () => {
      component.form.latitude = null;
      component.form.longitude = null;

      expect(component.hasHotelCoordinates).toBeFalse();
      expect(component.hotelCoordinatesLabel).toBe('');
    });

    it('lo resume con seis decimales cuando esta puesto', () => {
      component.form.latitude = 11.5444;
      component.form.longitude = -72.9072;

      expect(component.hasHotelCoordinates).toBeTrue();
      expect(component.hotelCoordinatesLabel).toBe('11.544400, -72.907200');
    });

    it('el mapa guarda el punto en el formulario', () => {
      component.onLocationChange({ latitude: 11.5, longitude: -72.9 });

      expect(component.form.latitude).toBe(11.5);
      expect(component.form.longitude).toBe(-72.9);
    });

    it('borrar el punto lo deja vacio, no en cero', () => {
      component.form.latitude = 11.5;
      component.form.longitude = -72.9;

      component.onLocationChange({ latitude: null, longitude: null });

      expect(component.form.latitude).toBeNull();
      expect(component.hasHotelCoordinates).toBeFalse();
    });
  });

  // Pisar un desplegable con un valor que no esta en su catalogo lo dejaria en blanco,
  // que es peor que dejarlo como estaba.
  describe('la direccion deducida desde el GPS', () => {
    it('rellena la calle siempre', async () => {
      await component.onAddressResolved({
        address: 'Carrera 14A 27B-28',
        city: '',
        state: '',
        country: ''
      });

      expect(component.form.address).toBe('Carrera 14A 27B-28');
    });

    it('no pisa el pais con algo que el catalogo no reconoce', async () => {
      component.form.country = 'Colombia';

      await component.onAddressResolved({
        address: 'Calle 1',
        city: '',
        state: '',
        country: 'Republica de Colombia'
      });

      expect(component.form.country).toBe('Colombia');
    });

    it('ignora acentos y mayusculas al reconocer el catalogo', async () => {
      component.locationCountries = [{ code: 'CO', name: 'Colombia' }] as never;

      await component.onAddressResolved({
        address: '',
        city: '',
        state: '',
        country: 'COLÓMBIA'.normalize('NFC').replace('Ó', 'O')
      });

      expect(component.form.country).toBe('Colombia');
    });
  });
});
