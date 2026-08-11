import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { CACHE_TTL, ResourceCache } from './resource-cache';

describe('ResourceCache', () => {
  let cache: ResourceCache;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ResourceCache] });
    cache = TestBed.inject(ResourceCache);
  });

  /** Contador de llamadas reales al "servidor". */
  const loader = (value: unknown) => {
    const spy = jasmine.createSpy('loader').and.callFake(() => of(value));
    return spy as unknown as (() => Observable<unknown>) & jasmine.Spy;
  };

  it('va al servidor la primera vez y despues sirve del cache', () => {
    const load = loader(['a']);

    cache.get('rooms', load, CACHE_TTL.OPERATIONAL).subscribe();
    cache.get('rooms', load, CACHE_TTL.OPERATIONAL).subscribe();
    cache.get('rooms', load, CACHE_TTL.OPERATIONAL).subscribe();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('entrega el valor guardado, no solo evita la peticion', () => {
    let received: unknown;
    cache.get('rooms', loader(['a']), CACHE_TTL.OPERATIONAL).subscribe();
    cache.get('rooms', loader(['ignorado']), CACHE_TTL.OPERATIONAL).subscribe((value) => {
      received = value;
    });

    expect(received).toEqual(['a']);
  });

  it('agrupa las peticiones en vuelo en una sola', () => {
    // Un loader que nunca emite: simula la peticion todavia viajando.
    const pending = jasmine.createSpy('pending').and.returnValue(new Observable(() => {}));

    cache.get('rooms', pending as any).subscribe();
    cache.get('rooms', pending as any).subscribe();

    expect(pending).toHaveBeenCalledTimes(1);
  });

  it('vuelve a pedir cuando la entrada vencio', () => {
    const load = loader(['a']);
    const base = Date.now();
    spyOn(Date, 'now').and.returnValue(base);

    cache.get('rooms', load, 1000).subscribe();
    expect(load).toHaveBeenCalledTimes(1);

    (Date.now as jasmine.Spy).and.returnValue(base + 1001);
    cache.get('rooms', load, 1000).subscribe();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh salta el cache pero lo deja actualizado', () => {
    const load = loader(['a']);

    cache.get('rooms', load).subscribe();
    cache.get('rooms', load, CACHE_TTL.OPERATIONAL, true).subscribe();
    expect(load).toHaveBeenCalledTimes(2);

    // La lectura siguiente vuelve a servirse del cache repoblado.
    cache.get('rooms', load).subscribe();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('invalida tambien las variantes con filtros', () => {
    const all = loader(['todas']);
    const filtered = loader(['piso 1']);

    cache.get('rooms', all).subscribe();
    cache.get('rooms:floor=1', filtered).subscribe();

    cache.invalidate('rooms');

    expect(cache.has('rooms')).toBeFalse();
    expect(cache.has('rooms:floor=1')).toBeFalse();
  });

  it('no invalida claves de otro recurso con el mismo prefijo textual', () => {
    cache.get('rooms', loader(['a'])).subscribe();
    cache.get('room-types', loader(['b'])).subscribe();

    cache.invalidate('rooms');

    expect(cache.has('rooms')).toBeFalse();
    expect(cache.has('room-types')).toBeTrue();
  });

  it('no guarda nada si la peticion falla', () => {
    const failing = jasmine
      .createSpy('failing')
      .and.returnValue(throwError(() => new Error('boom')));

    cache.get('rooms', failing as any).subscribe({ error: () => undefined });

    expect(cache.has('rooms')).toBeFalse();

    // Y el siguiente intento vuelve a pedir, en vez de quedarse pegado al fallo.
    const ok = loader(['a']);
    cache.get('rooms', ok).subscribe();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
