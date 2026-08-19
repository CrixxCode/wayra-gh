import { TestBed } from '@angular/core/testing';

import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, HotelThemeService } from './hotel-theme';

describe('HotelThemeService', () => {
  let service: HotelThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [HotelThemeService] });
    service = TestBed.inject(HotelThemeService);
  });

  afterEach(() => {
    const root = document.documentElement;
    ['--gh-brand', '--gh-brand-hover', '--gh-brand-secondary', '--gh-on-brand'].forEach((token) =>
      root.style.removeProperty(token)
    );
  });

  describe('normalizeColor', () => {
    it('acepta un hex valido y lo pasa a minusculas', () => {
      expect(service.normalizeColor('#ABC123', DEFAULT_PRIMARY_COLOR)).toBe('#abc123');
    });

    it('cae al valor por defecto si no es un hex de 6 digitos', () => {
      expect(service.normalizeColor('azul', DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
      expect(service.normalizeColor('#fff', DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
      expect(service.normalizeColor(null, DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
      expect(service.normalizeColor(undefined, DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
    });
  });

  describe('resolveOnBrandColor', () => {
    it('elige texto oscuro sobre un color de marca claro', () => {
      expect(service.resolveOnBrandColor('#ffffff')).toBe('#0f172a');
    });

    it('elige texto claro sobre un color de marca oscuro', () => {
      expect(service.resolveOnBrandColor('#000000')).toBe('#ffffff');
    });
  });

  describe('applyBrandColors', () => {
    it('pinta las variables CSS con los colores normalizados', () => {
      service.applyBrandColors('#AABBCC', '#112233');

      const root = document.documentElement.style;
      expect(root.getPropertyValue('--gh-brand')).toBe('#aabbcc');
      expect(root.getPropertyValue('--gh-brand-hover')).toBe('#112233');
      expect(root.getPropertyValue('--gh-brand-secondary')).toBe('#112233');
      expect(root.getPropertyValue('--gh-on-brand')).toBe(service.resolveOnBrandColor('#aabbcc'));
    });

    it('cae a los colores por defecto cuando recibe valores invalidos', () => {
      service.applyBrandColors('no-es-un-color', '');

      const root = document.documentElement.style;
      expect(root.getPropertyValue('--gh-brand')).toBe(DEFAULT_PRIMARY_COLOR);
      expect(root.getPropertyValue('--gh-brand-hover')).toBe(DEFAULT_SECONDARY_COLOR);
    });
  });
});
