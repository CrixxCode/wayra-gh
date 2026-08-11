import { Injectable } from '@angular/core';
import { gsap } from 'gsap';

export type RevealOptions = {
  /** Retardo entre elementos consecutivos, en segundos. */
  stagger?: number;
  /** Desplazamiento vertical inicial, en pixeles. */
  y?: number;
  duration?: number;
  delay?: number;
};

/**
 * Animaciones de entrada con GSAP.
 *
 * Centralizado en un servicio por dos razones: no repetir los mismos valores en cada
 * componente, y tener **un solo lugar** donde se respeta `prefers-reduced-motion`. Si
 * el sistema operativo pide menos movimiento, aqui no se anima nada: los elementos
 * aparecen ya en su posicion final, sin quedar invisibles.
 *
 * La regla de la casa: la animacion acompaña a la carga, no la retrasa. Duraciones
 * cortas y `clearProps` al terminar, para no dejar transformaciones pegadas que luego
 * peleen con el CSS del componente.
 */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly defaults: Required<Omit<RevealOptions, 'delay'>> = {
    stagger: 0.035,
    y: 12,
    duration: 0.32
  };

  /** true si el usuario pidio menos movimiento en su sistema. */
  get prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Entrada escalonada de un grupo de elementos.
   *
   * Devuelve la animacion para poder encadenar o cancelar; `null` cuando no habia nada
   * que animar o cuando el movimiento esta desactivado.
   */
  reveal(targets: Element[] | NodeListOf<Element> | null, options: RevealOptions = {}) {
    const elements = this.toArray(targets);
    if (!elements.length) return null;

    if (this.prefersReducedMotion) {
      // Sin animacion, pero garantizando que nada quede con estilos a medias.
      gsap.set(elements, { clearProps: 'all' });
      return null;
    }

    const config = { ...this.defaults, ...options };

    return gsap.fromTo(
      elements,
      { opacity: 0, y: config.y },
      {
        opacity: 1,
        y: 0,
        duration: config.duration,
        delay: options.delay ?? 0,
        stagger: config.stagger,
        ease: 'power2.out',
        overwrite: 'auto',
        clearProps: 'opacity,transform'
      }
    );
  }

  /** Resalta un elemento que acaba de cambiar de valor, sin moverlo de sitio. */
  pulse(target: Element | null) {
    if (!target || this.prefersReducedMotion) return null;

    return gsap.fromTo(
      target,
      { scale: 0.96 },
      {
        scale: 1,
        duration: 0.28,
        ease: 'back.out(2)',
        overwrite: 'auto',
        clearProps: 'transform'
      }
    );
  }

  /** Detiene y limpia lo que quede animando dentro de un contenedor. */
  killWithin(root: Element | null): void {
    if (!root) return;
    gsap.killTweensOf(root.querySelectorAll('*'));
  }

  private toArray(targets: Element[] | NodeListOf<Element> | null): Element[] {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : Array.from(targets);
  }
}
