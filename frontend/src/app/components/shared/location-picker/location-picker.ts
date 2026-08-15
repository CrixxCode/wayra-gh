import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import type * as LeafletNamespace from 'leaflet';

export type LocationValue = {
  latitude: number | null;
  longitude: number | null;
};

/**
 * La direccion deducida de un punto del mapa.
 *
 * Los campos que el geocodificador inverso no sepa vienen vacios: el componente **no
 * inventa** lo que no le dijeron, y el formulario decide si pisa o no lo que ya habia.
 */
export type ResolvedAddress = {
  address: string;
  city: string;
  state: string;
  country: string;
};

/**
 * Minimapa para fijar el punto exacto del hotel.
 *
 * La direccion escrita no basta: "carrera 14a # 27b 28" se geocodifica a media cuadra de
 * distancia, y en un pueblo pequeño a varias. Por eso el mapa **propone** un punto a
 * partir de la direccion y despues deja moverlo; lo que se guarda es lo ultimo que el
 * usuario dejo puesto, no lo que dijo el geocodificador.
 *
 * Leaflet se carga con `import()` dinamico y no en el `import` de arriba: esta pantalla
 * no es de ruta perezosa, asi que un import estatico meteria la libreria y su CSS en el
 * paquete inicial de toda la aplicacion para una sola pestaña de una sola vista.
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location-picker.html',
  styleUrls: ['./location-picker.css']
})
export class LocationPicker implements OnChanges, OnDestroy {
  /** Punto guardado. Si viene vacio, el mapa espera a la busqueda por direccion. */
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;

  /** Partes de la direccion con las que se arma la busqueda. */
  @Input() address = '';
  @Input() city = '';
  @Input() state = '';
  @Input() country = '';

  @Input() disabled = false;

  @Output() locationChange = new EventEmitter<LocationValue>();

  /** La direccion deducida al usar la ubicacion del dispositivo. */
  @Output() addressResolved = new EventEmitter<ResolvedAddress>();

  @ViewChild('mapHost', { static: true }) mapHost!: ElementRef<HTMLDivElement>;

  loadingMap = true;
  searching = false;
  locating = false;
  message = '';
  messageTone: 'info' | 'error' = 'info';

  private leaflet: typeof LeafletNamespace | null = null;
  private map: LeafletNamespace.Map | null = null;
  private marker: LeafletNamespace.Marker | null = null;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private mapReady: Promise<void> | null = null;

  /** Riohacha: un centro razonable mientras no hay nada que enseñar. */
  private readonly fallbackCenter: [number, number] = [11.5444, -72.9072];

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.map) {
      // `initMap` espera a que llegue Leaflet, y durante esa espera `this.map` sigue en
      // null. Angular dispara `ngOnChanges` una vez por entrada que cambie --y aqui son
      // seis--, asi que sin este candado se montaban varios mapas sobre el mismo
      // contenedor: Leaflet protesta y el que queda se pinta roto.
      await this.ensureMap();
      return;
    }

    // Si el punto cambia desde fuera --al cargar la configuracion guardada-- el mapa
    // tiene que seguirlo.
    if (changes['latitude'] || changes['longitude']) {
      this.applyIncomingPoint();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
  }

  get hasPoint(): boolean {
    return this.latitude !== null && this.longitude !== null;
  }

  get coordsLabel(): string {
    if (!this.hasPoint) return 'Sin ubicacion fijada';
    return `${Number(this.latitude).toFixed(6)}, ${Number(this.longitude).toFixed(6)}`;
  }

  // ------------------------------------------------------------------- el mapa

  /** Monta el mapa una sola vez, aunque se lo pidan varias veces seguidas. */
  private ensureMap(): Promise<void> {
    if (!this.mapReady) this.mapReady = this.initMap();
    return this.mapReady;
  }

  private async initMap(): Promise<void> {
    try {
      // Leaflet es CommonJS: segun como lo empaquete el bundler, `import()` entrega el
      // modulo directamente o envuelto en `.default`. Aceptar las dos formas evita que
      // el mapa dependa de un detalle de la configuracion de compilacion.
      const imported = (await import('leaflet')) as unknown as {
        default?: typeof LeafletNamespace;
      } & typeof LeafletNamespace;
      if (this.destroyed) return;

      const leaflet = imported.default ?? imported;
      this.leaflet = leaflet;

      const start: [number, number] = this.hasPoint
        ? [Number(this.latitude), Number(this.longitude)]
        : this.fallbackCenter;

      this.map = leaflet.map(this.mapHost.nativeElement, {
        center: start,
        zoom: this.hasPoint ? 17 : 12,
        // El scroll del raton mueve la pagina, no el mapa: si no, bajar por el
        // formulario acaba haciendo zoom sin querer.
        scrollWheelZoom: false
      });

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        })
        .addTo(this.map);

      // Un clic en cualquier punto lo fija: es la forma mas directa de corregir.
      this.map.on('click', (event: LeafletNamespace.LeafletMouseEvent) => {
        if (this.disabled) return;
        this.setPoint(event.latlng.lat, event.latlng.lng);
      });

      if (this.hasPoint) this.placeMarker(Number(this.latitude), Number(this.longitude));

      this.loadingMap = false;
      this.watchContainerSize();
    } catch {
      this.loadingMap = false;
      this.messageTone = 'error';
      this.message = 'No fue posible cargar el mapa.';
    }
  }

  /**
   * El marcador, dibujado por nosotros.
   *
   * El icono por defecto de Leaflet son tres PNG que la libreria resuelve por la URL de
   * su CSS. Con el empaquetador de Angular esa ruta no existe, asi que el marcador se
   * pintaba **sin imagen**: el punto quedaba fijado pero no se veia donde. Un `divIcon`
   * no depende de ningun archivo, y ademas se puede pintar con los tonos del sistema.
   */
  private buildIcon(): LeafletNamespace.DivIcon | undefined {
    if (!this.leaflet) return undefined;

    return this.leaflet.divIcon({
      className: 'hotel-pin-wrapper',
      html: '<span class="hotel-pin"><i class="fa-solid fa-hotel"></i></span>',
      // El ancla en la punta inferior: es la parte del pin que señala el punto.
      iconSize: [34, 44],
      iconAnchor: [17, 44]
    });
  }

  /**
   * Vuelve a medir el mapa cuando su contenedor cambia de tamaño.
   *
   * Leaflet calcula cuantas teselas pedir al montarse. Aqui nace dentro de una pestaña y
   * de una tarjeta que todavia se esta maquetando, asi que se medi­a mas pequeño de lo
   * que acaba siendo: pedia pocas teselas y las colocaba con el desplazamiento de
   * entonces --el mosaico partido y descuadrado que se veia--. `invalidateSize` lo
   * recalcula, y con un `ResizeObserver` tambien se arregla solo al cambiar de pestaña o
   * al redimensionar la ventana.
   */
  private watchContainerSize(): void {
    if (!this.map) return;

    // Una primera pasada en el siguiente cuadro: para entonces el navegador ya aplico
    // el layout de la tarjeta.
    requestAnimationFrame(() => this.map?.invalidateSize());

    if (typeof ResizeObserver === 'undefined') return;

    this.resizeObserver = new ResizeObserver(() => {
      // Fuera de Angular: esto se dispara en cada arrastre de la ventana y no cambia
      // nada del estado que la vista tenga que releer.
      this.zone.runOutsideAngular(() => this.map?.invalidateSize());
    });
    this.resizeObserver.observe(this.mapHost.nativeElement);
  }

  private placeMarker(lat: number, lng: number): void {
    if (!this.leaflet || !this.map) return;

    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
      return;
    }

    this.marker = this.leaflet
      .marker([lat, lng], { draggable: !this.disabled, icon: this.buildIcon() })
      .addTo(this.map);

    // Arrastrar es lo natural para un ajuste fino, y el clic para un salto grande.
    this.marker.on('dragend', () => {
      const position = this.marker?.getLatLng();
      if (position) this.setPoint(position.lat, position.lng);
    });
  }

  private applyIncomingPoint(): void {
    if (!this.hasPoint || !this.map) return;

    const lat = Number(this.latitude);
    const lng = Number(this.longitude);
    this.placeMarker(lat, lng);
    this.map.setView([lat, lng], Math.max(this.map.getZoom(), 16));
  }

  private setPoint(lat: number, lng: number): void {
    // Seis decimales: ~11 cm. Guardar los quince que da el navegador solo añade ruido.
    const latitude = Number(lat.toFixed(6));
    const longitude = Number(lng.toFixed(6));

    this.latitude = latitude;
    this.longitude = longitude;
    this.placeMarker(latitude, longitude);

    this.message = 'Ubicacion fijada. Recuerda guardar la configuracion.';
    this.messageTone = 'info';

    // El clic de Leaflet ocurre fuera de Angular: sin esto, la vista no se entera.
    this.zone.run(() => this.locationChange.emit({ latitude, longitude }));
  }

  constructor(private zone: NgZone) {}

  // -------------------------------------------------------------- geocodificar

  get canSearch(): boolean {
    return !this.disabled && !this.searching && !!this.searchQuery;
  }

  private get searchQuery(): string {
    return [this.address, this.city, this.state, this.country]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Busca la direccion escrita y propone un punto.
   *
   * Es explicito y no automatico al teclear: Nominatim es un servicio gratuito con
   * limite de una peticion por segundo, y geocodificar en cada pulsacion seria abusar de
   * el ademas de mover el mapa bajo los dedos del usuario.
   */
  async searchAddress(): Promise<void> {
    if (!this.canSearch) return;

    this.searching = true;
    this.message = '';

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
        encodeURIComponent(this.searchQuery);

      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('geocode');

      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (this.destroyed) return;

      if (!results.length) {
        this.messageTone = 'error';
        this.message = 'No se encontro esa direccion. Marca el punto en el mapa a mano.';
        return;
      }

      const lat = Number(results[0].lat);
      const lng = Number(results[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('geocode');

      this.map?.setView([lat, lng], 17);
      this.setPoint(lat, lng);
      this.message = 'Punto aproximado por la direccion. Arrastra el marcador para afinarlo.';
      this.messageTone = 'info';
    } catch {
      if (this.destroyed) return;
      this.messageTone = 'error';
      this.message = 'No fue posible buscar la direccion. Marca el punto en el mapa a mano.';
    } finally {
      this.searching = false;
    }
  }

  // ------------------------------------------------------- usar mi ubicacion

  get canLocate(): boolean {
    return !this.disabled && !this.locating && typeof navigator !== 'undefined' && !!navigator.geolocation;
  }

  /**
   * Toma la ubicacion del dispositivo y **rellena la direccion** a partir de ella.
   *
   * Es el camino inverso al de buscar por direccion, y para el hotel es el mas comodo:
   * estando en el sitio, no hay que escribir nada --solo revisar y corregir--. El punto
   * del GPS manda sobre la direccion deducida: el aparato sabe donde esta mejor de lo
   * que el geocodificador sabe redactar la calle.
   */
  async useMyLocation(): Promise<void> {
    if (!this.canLocate) {
      this.messageTone = 'error';
      this.message = 'Este navegador no puede darnos la ubicacion.';
      return;
    }

    this.locating = true;
    this.message = '';

    try {
      const position = await this.readDevicePosition();
      if (this.destroyed) return;

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      this.map?.setView([lat, lng], 17);
      this.setPoint(lat, lng);

      const resolved = await this.reverseGeocode(lat, lng);
      if (this.destroyed) return;

      if (resolved) {
        this.zone.run(() => this.addressResolved.emit(resolved));
        this.message = 'Direccion completada desde tu ubicacion. Revisa y corrige lo que haga falta.';
        this.messageTone = 'info';
      } else {
        this.message = 'Punto fijado, pero no pudimos deducir la direccion. Escribela a mano.';
        this.messageTone = 'info';
      }
    } catch (error) {
      if (this.destroyed) return;
      this.messageTone = 'error';
      this.message =
        (error as GeolocationPositionError)?.code === 1
          ? 'Nos negaste el permiso de ubicacion. Puedes marcar el punto en el mapa.'
          : 'No fue posible obtener tu ubicacion. Puedes marcar el punto en el mapa.';
    } finally {
      this.locating = false;
    }
  }

  /** La API de geolocalizacion es de callbacks; aqui se usa como promesa. */
  private readDevicePosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        // Diez segundos: mas alla, el usuario ya penso que no funciona.
        timeout: 10000,
        maximumAge: 0
      });
    });
  }

  /** Del punto a la direccion, con lo que Nominatim sepa de esa esquina. */
  private async reverseGeocode(lat: number, lng: number): Promise<ResolvedAddress | null> {
    try {
      const url =
        'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1' +
        `&lat=${lat}&lon=${lng}`;

      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        address?: Record<string, string>;
      };
      const parts = payload.address || {};

      // La calle puede venir en varios campos segun el pais, y la ciudad tambien: se
      // toma el primero que exista en vez de dar por hecho una sola forma.
      const street = [parts['road'], parts['house_number']].filter(Boolean).join(' ');
      const city =
        parts['city'] || parts['town'] || parts['village'] || parts['municipality'] || '';
      const state = parts['state'] || parts['region'] || '';

      const resolved: ResolvedAddress = {
        address: street,
        city,
        state,
        country: parts['country'] || ''
      };

      // Si no vino nada util, es mejor decirlo que devolver cuatro cadenas vacias.
      return Object.values(resolved).some(Boolean) ? resolved : null;
    } catch {
      return null;
    }
  }

  clearPoint(): void {
    if (this.disabled) return;

    this.latitude = null;
    this.longitude = null;

    if (this.marker && this.map) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }

    this.message = 'Ubicacion borrada.';
    this.messageTone = 'info';
    this.locationChange.emit({ latitude: null, longitude: null });
  }
}
