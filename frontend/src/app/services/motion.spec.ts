import { TestBed } from '@angular/core/testing';

import { MotionService } from './motion';

describe('MotionService', () => {
  let motion: MotionService;
  let host: HTMLElement;

  const setReducedMotion = (reduce: boolean) => {
    spyOn(window, 'matchMedia').and.returnValue({
      matches: reduce,
      media: '(prefers-reduced-motion: reduce)'
    } as MediaQueryList);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MotionService] });
    motion = TestBed.inject(MotionService);

    host = document.createElement('div');
    host.innerHTML = '<span class="item"></span><span class="item"></span>';
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  const items = () => host.querySelectorAll('.item');

  it('anima un grupo de elementos', () => {
    setReducedMotion(false);

    expect(motion.reveal(items())).not.toBeNull();
  });

  it('no anima nada cuando el sistema pide menos movimiento', () => {
    setReducedMotion(true);

    expect(motion.prefersReducedMotion).toBeTrue();
    expect(motion.reveal(items())).toBeNull();
  });

  it('deja los elementos visibles al desactivar el movimiento', (done) => {
    setReducedMotion(true);
    motion.reveal(items());

    // El riesgo real de saltarse la animacion es dejar el contenido en opacity 0.
    requestAnimationFrame(() => {
      items().forEach((item) => {
        const opacity = getComputedStyle(item as HTMLElement).opacity;
        expect(opacity === '' || opacity === '1').toBeTrue();
      });
      done();
    });
  });

  it('tolera que no haya nada que animar', () => {
    setReducedMotion(false);

    expect(motion.reveal(null)).toBeNull();
    expect(motion.reveal(host.querySelectorAll('.no-existe'))).toBeNull();
    expect(motion.pulse(null)).toBeNull();
  });

  it('no resalta un elemento si el movimiento esta desactivado', () => {
    setReducedMotion(true);

    expect(motion.pulse(host.querySelector('.item'))).toBeNull();
  });
});
