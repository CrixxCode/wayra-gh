import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SitePreview } from './site-preview';

describe('SitePreview', () => {
  let component: SitePreview;
  let fixture: ComponentFixture<SitePreview>;

  beforeEach(async () => {
    await TestBed.resetTestingModule()
      .configureTestingModule({ imports: [SitePreview] })
      .compileComponents();

    fixture = TestBed.createComponent(SitePreview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('la direccion', () => {
    it('completa el https cuando falta', () => {
      component.url = 'hotelwayra.com';

      expect(component.isValid).toBeTrue();
      expect(component.resolvedUrl).toBe('https://hotelwayra.com/');
      expect(component.host).toBe('hotelwayra.com');
    });

    it('respeta el esquema que ya venga escrito', () => {
      component.url = 'http://hotelwayra.com/inicio';

      expect(component.resolvedUrl).toBe('http://hotelwayra.com/inicio');
    });

    it('rechaza lo que no llega a ser un dominio', () => {
      component.url = 'hotel';

      expect(component.isValid).toBeFalse();
      expect(component.host).toBe('');
    });

    it('no acepta esquemas que no sean web', () => {
      for (const value of ['javascript:alert(1)', 'data:text/html,<h1>x', 'file:///etc/passwd']) {
        component.url = value;
        expect(component.isValid)
          .withContext(value)
          .toBeFalse();
      }
    });

    it('quita el www para mostrar el dominio', () => {
      component.url = 'https://www.facebook.com';

      expect(component.host).toBe('facebook.com');
    });

    it('vacio no muestra nada', () => {
      component.url = '   ';

      expect(component.isEmpty).toBeTrue();
      expect(component.isValid).toBeFalse();
    });

    it('arma el favicon desde el dominio real', () => {
      component.url = 'https://www.facebook.com';

      expect(component.faviconUrl).toBe(
        'https://www.google.com/s2/favicons?domain=www.facebook.com&sz=64'
      );
    });
  });

  describe('la normalizacion hacia el formulario', () => {
    it('devuelve la direccion completa al confirmarla', () => {
      const emitted: string[] = [];
      component.normalized.subscribe((value) => emitted.push(value));

      component.url = 'hotelwayra.com';
      component.applyNormalized();

      expect(emitted).toEqual(['https://hotelwayra.com/']);
    });

    it('no repite lo que ya estaba bien escrito', () => {
      const emitted: string[] = [];
      component.url = 'https://hotelwayra.com/';
      component.normalized.subscribe((value) => emitted.push(value));

      component.applyNormalized();

      expect(emitted).toEqual([]);
    });

    it('no emite nada si la direccion no es valida', () => {
      const emitted: string[] = [];
      component.url = 'hotel';
      component.normalized.subscribe((value) => emitted.push(value));

      component.applyNormalized();

      expect(emitted).toEqual([]);
    });
  });

  describe('abrir en pestaña nueva', () => {
    it('va sin opener: la pestaña abierta no debe poder tocar la nuestra', () => {
      const openSpy = spyOn(window, 'open');
      component.url = 'hotelwayra.com';

      component.openInNewTab();

      expect(openSpy).toHaveBeenCalledWith(
        'https://hotelwayra.com/',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('normaliza antes de abrir', () => {
      const emitted: string[] = [];
      spyOn(window, 'open');
      component.url = 'hotelwayra.com';
      component.normalized.subscribe((value) => emitted.push(value));

      component.openInNewTab();

      expect(emitted).toEqual(['https://hotelwayra.com/']);
    });

    it('no abre nada si la direccion no sirve', () => {
      const openSpy = spyOn(window, 'open');
      component.url = 'hotel';

      component.openInNewTab();

      expect(openSpy).not.toHaveBeenCalled();
    });
  });
});
