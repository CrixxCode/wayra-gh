import { Injectable } from '@angular/core';
import { Observable, defer, of, shareReplay, tap } from 'rxjs';

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

/** Vidas utiles por tipo de dato, en milisegundos. */
export const CACHE_TTL = {
  /** Catalogos: cambian cuando alguien los edita, no solos. */
  CATALOG: 5 * 60 * 1000,
  /**
   * Datos operativos (habitaciones, reservas). Corto a proposito: recepcion no puede
   * ver un estado viejo. El TTL solo evita la ráfaga de peticiones al navegar de ida
   * y vuelta; cualquier accion invalida la entrada de inmediato.
   */
  OPERATIONAL: 20 * 1000
} as const;

/**
 * Cache-aside para las lecturas de la API.
 *
 * El patron es el de siempre: quien pide un recurso consulta primero el cache; si no
 * esta o vencio, va al servidor y **el que pide** rellena el cache. La clave aqui es
 * que el cache no sabe cargar nada por su cuenta: recibe el `loader` del llamador.
 *
 * Dos cosas que resuelve y que un `Map` suelto no:
 *
 * 1. **Peticiones en vuelo.** Si tres componentes piden lo mismo antes de que llegue
 *    la respuesta, se hace **una** peticion y los tres reciben el resultado. Sin esto,
 *    abrir la vista de habitaciones disparaba la misma consulta de catalogos desde el
 *    listado y desde el modal.
 * 2. **Invalidacion por prefijo.** Tras editar una tarifa hay que tirar todas las
 *    variantes cacheadas de `rates:*`, no solo la que se leyo por ultima vez.
 */
@Injectable({ providedIn: 'root' })
export class ResourceCache {
  private entries = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Observable<unknown>>();

  /**
   * Devuelve el valor cacheado o ejecuta `loader` y lo guarda.
   *
   * `forceRefresh` salta el cache pero **sigue actualizandolo**: es lo que usa el
   * boton de refrescar, que debe traer datos frescos sin dejar el cache desincronizado.
   */
  get<T>(
    key: string,
    loader: () => Observable<T>,
    ttlMs: number = CACHE_TTL.OPERATIONAL,
    forceRefresh = false
  ): Observable<T> {
    if (!forceRefresh) {
      const cached = this.read<T>(key);
      if (cached !== undefined) return of(cached);

      const pending = this.inFlight.get(key) as Observable<T> | undefined;
      if (pending) return pending;
    }

    // `defer` para que la peticion no arranque hasta que alguien se suscriba.
    const request = defer(loader).pipe(
      tap({
        next: (value) => {
          this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
          this.inFlight.delete(key);
        },
        error: () => this.inFlight.delete(key)
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.inFlight.set(key, request);
    return request;
  }

  /** Borra una clave exacta y cualquier clave que empiece por `${key}:`. */
  invalidate(key: string): void {
    const prefix = `${key}:`;
    for (const stored of [...this.entries.keys()]) {
      if (stored === key || stored.startsWith(prefix)) this.entries.delete(stored);
    }
    for (const stored of [...this.inFlight.keys()]) {
      if (stored === key || stored.startsWith(prefix)) this.inFlight.delete(stored);
    }
  }

  invalidateAll(keys: string[]): void {
    for (const key of keys) this.invalidate(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /** Solo para pruebas y diagnostico. */
  has(key: string): boolean {
    return this.read(key) !== undefined;
  }

  private read<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }
}
