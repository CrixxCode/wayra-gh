import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocationPicker } from './location-picker';

describe('LocationPicker', () => {
  let component: LocationPicker;
  let fixture: ComponentFixture<LocationPicker>;

  const setup = async () => {
    await TestBed.resetTestingModule()
      .configureTestingModule({ imports: [LocationPicker] })
      .compileComponents();

    fixture = TestBed.createComponent(LocationPicker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await setup();
  });

  describe('la busqueda por direccion', () => {
    // Buscar "Colombia" a secas devolveria el centro del pais: la consulta se arma con
    // todas las partes que el usuario ya lleno.
    it('junta direccion, ciudad, departamento y pais', async () => {
      component.address = 'carrera 14a # 27b 28';
      component.city = 'Riohacha';
      component.state = 'La Guajira';
      component.country = 'Colombia';

      const fetchSpy = spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify([{ lat: '11.54', lon: '-72.90' }])))
      );

      await component.searchAddress();

      const url = String(fetchSpy.calls.mostRecent().args[0]);
      expect(decodeURIComponent(url)).toContain('carrera 14a # 27b 28');
      expect(decodeURIComponent(url)).toContain('Riohacha');
      expect(decodeURIComponent(url)).toContain('La Guajira');
      expect(decodeURIComponent(url)).toContain('Colombia');
    });

    it('no busca cuando no hay nada que buscar', async () => {
      const fetchSpy = spyOn(window, 'fetch');

      expect(component.canSearch).toBeFalse();

      await component.searchAddress();

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('emite el punto encontrado', async () => {
      component.address = 'Riohacha';
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify([{ lat: '11.544400', lon: '-72.907200' }])))
      );

      const emitted: Array<number | null> = [];
      component.locationChange.subscribe((value) => emitted.push(value.latitude));

      await component.searchAddress();

      expect(emitted).toEqual([11.5444]);
      expect(component.latitude).toBe(11.5444);
      expect(component.longitude).toBe(-72.9072);
    });

    // Sin resultado hay que decirlo y dejar marcar a mano, no dejar el mapa mudo.
    it('avisa cuando la direccion no existe, sin mover el punto', async () => {
      component.address = 'direccion inventada';
      spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('[]')));

      await component.searchAddress();

      expect(component.messageTone).toBe('error');
      expect(component.message).toContain('a mano');
      expect(component.hasPoint).toBeFalse();
    });

    it('sobrevive a que el servicio falle', async () => {
      component.address = 'Riohacha';
      spyOn(window, 'fetch').and.returnValue(Promise.reject(new Error('sin red')));

      await component.searchAddress();

      expect(component.messageTone).toBe('error');
      expect(component.searching).toBeFalse();
    });
  });

  describe('el punto', () => {
    it('empieza vacio y lo dice', async () => {
      expect(component.hasPoint).toBeFalse();
      expect(component.coordsLabel).toBe('Sin ubicacion fijada');
    });

    // Seis decimales son ~11 cm: de sobra para señalar una puerta, y sin el ruido de
    // los quince que arrastra el navegador.
    it('se guarda con seis decimales', async () => {
      component.address = 'Riohacha';
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify([{ lat: '11.5444001234', lon: '-72.9072005678' }])))
      );

      await component.searchAddress();

      expect(component.latitude).toBe(11.5444);
      expect(component.coordsLabel).toBe('11.544400, -72.907201');
    });

    it('borrarlo avisa al formulario', async () => {
      component.latitude = 11.5444;
      component.longitude = -72.9072;

      const emitted: Array<{ latitude: number | null; longitude: number | null }> = [];
      component.locationChange.subscribe((value) => emitted.push(value));

      component.clearPoint();

      expect(component.hasPoint).toBeFalse();
      expect(emitted).toEqual([{ latitude: null, longitude: null }]);
    });

    // En solo lectura el mapa se ve pero no se toca.
    it('deshabilitado no deja buscar ni borrar', async () => {
      component.disabled = true;
      component.address = 'Riohacha';
      component.latitude = 11.5444;
      component.longitude = -72.9072;

      expect(component.canSearch).toBeFalse();

      component.clearPoint();

      expect(component.hasPoint).toBeTrue();
    });
  });

  // Estando en el hotel es el camino mas corto: no hay que escribir nada.
  describe('usar mi ubicacion', () => {
    const withPosition = (coords: { latitude: number; longitude: number }) => {
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((onSuccess: any) => {
        onSuccess({ coords });
      });
    };

    it('fija el punto del dispositivo y deduce la direccion', async () => {
      withPosition({ latitude: 11.5444, longitude: -72.9072 });
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(
            JSON.stringify({
              address: {
                road: 'Carrera 14A',
                house_number: '27B-28',
                city: 'Riohacha',
                state: 'La Guajira',
                country: 'Colombia'
              }
            })
          )
        )
      );

      const resolved: unknown[] = [];
      component.addressResolved.subscribe((value) => resolved.push(value));

      await component.useMyLocation();

      expect(component.latitude).toBe(11.5444);
      expect(resolved).toEqual([
        {
          address: 'Carrera 14A 27B-28',
          city: 'Riohacha',
          state: 'La Guajira',
          country: 'Colombia'
        }
      ]);
    });

    // La ciudad viene en campos distintos segun el pais: no se da por hecho uno solo.
    it('acepta el nombre de la ciudad venga en el campo que venga', async () => {
      withPosition({ latitude: 11.5, longitude: -72.9 });
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(JSON.stringify({ address: { village: 'Dibulla', country: 'Colombia' } }))
        )
      );

      const resolved: any[] = [];
      component.addressResolved.subscribe((value) => resolved.push(value));

      await component.useMyLocation();

      expect(resolved[0].city).toBe('Dibulla');
    });

    // El punto vale aunque no se pueda redactar la calle: el GPS ya acerto.
    it('conserva el punto aunque no logre deducir la direccion', async () => {
      withPosition({ latitude: 11.5, longitude: -72.9 });
      spyOn(window, 'fetch').and.returnValue(Promise.reject(new Error('sin red')));

      const resolved: unknown[] = [];
      component.addressResolved.subscribe((value) => resolved.push(value));

      await component.useMyLocation();

      expect(component.latitude).toBe(11.5);
      expect(resolved).toEqual([]);
      expect(component.message).toContain('no pudimos deducir');
    });

    it('explica el permiso negado sin sonar a error del sistema', async () => {
      spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake(
        (_ok: any, onError: any) => onError({ code: 1 })
      );

      await component.useMyLocation();

      expect(component.messageTone).toBe('error');
      expect(component.message).toContain('permiso');
      expect(component.locating).toBeFalse();
    });
  });

  // Los tres fallos que dejaban el mapa roto en pantalla.
  describe('el montaje del mapa', () => {
    it('monta un solo mapa aunque cambien varias entradas a la vez', async () => {
      const fixture2 = TestBed.createComponent(LocationPicker);
      const picker = fixture2.componentInstance;
      fixture2.detectChanges();

      // Angular dispara `ngOnChanges` una vez por entrada que cambia --aqui son seis--.
      await Promise.all([
        picker.ngOnChanges({} as never),
        picker.ngOnChanges({} as never),
        picker.ngOnChanges({} as never)
      ]);

      const containers = fixture2.nativeElement.querySelectorAll('.leaflet-container');
      expect(containers.length).toBeLessThanOrEqual(1);

      fixture2.destroy();
    });

    // El icono por defecto de Leaflet son PNG que el empaquetador no resuelve: el punto
    // quedaba fijado pero no se veia donde.
    it('el marcador se dibuja sin depender de imagenes de la libreria', async () => {
      const fixture2 = TestBed.createComponent(LocationPicker);
      const picker = fixture2.componentInstance;

      // `detectChanges` primero: crea la vista, y sin vista no hay contenedor donde
      // montar el mapa. Despues se espera al montaje, que es asincrono.
      fixture2.detectChanges();
      await picker.ngOnChanges({} as never);

      picker.latitude = 11.5444;
      picker.longitude = -72.9072;
      await picker.ngOnChanges({ latitude: {} } as never);
      fixture2.detectChanges();

      const pin = fixture2.nativeElement.querySelector('.hotel-pin');
      const brokenDefault = fixture2.nativeElement.querySelector('img.leaflet-marker-icon');

      expect(pin).not.toBeNull();
      expect(brokenDefault).toBeNull();

      fixture2.destroy();
    });

    it('se limpia al destruirse', async () => {
      const fixture2 = TestBed.createComponent(LocationPicker);
      fixture2.detectChanges();
      await fixture2.componentInstance.ngOnChanges({} as never);

      expect(() => fixture2.destroy()).not.toThrow();
    });
  });

  /**
   * La prueba que faltaba: que el CSS de Leaflet **llegue** a lo que Leaflet dibuja.
   *
   * Angular encapsula los estilos de componente con un atributo de ambito que solo
   * llevan los elementos del template. Los paneles y teselas los crea Leaflet en tiempo
   * de ejecucion, sin ese atributo, asi que con el CSS importado dentro del componente
   * las reglas no los alcanzaban: los paneles se quedaban en `position: static` y las
   * teselas fluian por el documento formando un mosaico partido. Se veia en pantalla y
   * no en el codigo, y ninguna prueba de logica lo habria detectado.
   */
  describe('los estilos de leaflet', () => {
    it('alcanzan a los elementos que la libreria crea sola', async () => {
      const fixture2 = TestBed.createComponent(LocationPicker);
      // Hay que colgarlo del documento: `getComputedStyle` sobre un arbol suelto no
      // resuelve las hojas globales.
      document.body.appendChild(fixture2.nativeElement);
      fixture2.detectChanges();
      await fixture2.componentInstance.ngOnChanges({} as never);
      fixture2.detectChanges();

      const pane = fixture2.nativeElement.querySelector('.leaflet-pane') as HTMLElement;
      expect(pane)
        .withContext('Leaflet no llego a montar sus paneles')
        .not.toBeNull();

      // `static` significa que la regla no le llego, y con ella se rompe el mapa entero.
      expect(getComputedStyle(pane).position).toBe('absolute');

      fixture2.nativeElement.remove();
      fixture2.destroy();
    });

    it('el pin queda posicionado por el mapa, no suelto en el flujo', async () => {
      const fixture2 = TestBed.createComponent(LocationPicker);
      document.body.appendChild(fixture2.nativeElement);
      fixture2.detectChanges();
      await fixture2.componentInstance.ngOnChanges({} as never);

      fixture2.componentInstance.latitude = 11.5444;
      fixture2.componentInstance.longitude = -72.9072;
      await fixture2.componentInstance.ngOnChanges({ latitude: {} } as never);
      fixture2.detectChanges();

      const marker = fixture2.nativeElement.querySelector('.leaflet-marker-icon') as HTMLElement;
      expect(marker).not.toBeNull();
      expect(getComputedStyle(marker).position).toBe('absolute');

      fixture2.nativeElement.remove();
      fixture2.destroy();
    });
  });
});
