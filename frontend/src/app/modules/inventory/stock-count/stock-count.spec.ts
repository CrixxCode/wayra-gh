import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { StockCount } from './stock-count';
import { InventoryMovementsService } from '../../../services/inventory-movement';

const item = (id: number, name: string, stock: number, overrides: any = {}) =>
  ({
    id,
    name,
    stock,
    minimum_stock: 2,
    maximum_stock: 0,
    cost_price: 1000,
    unit_measure_name: 'Unidad',
    is_active: true,
    ...overrides
  }) as any;

describe('StockCount', () => {
  let component: StockCount;
  let fixture: ComponentFixture<StockCount>;

  const registerStockCount = jasmine.createSpy('registerStockCount');

  const start = (items: any[]) => {
    component.items = items;
    component.ngOnInit();
  };

  beforeEach(async () => {
    registerStockCount.calls.reset();
    registerStockCount.and.returnValue(
      of({
        reference: 'CONTEO-20260812-101500',
        counted_lines: 2,
        adjusted_lines: 1,
        unchanged_lines: 1,
        unknown_items: [],
        movement_ids: [9]
      })
    );

    await TestBed.configureTestingModule({
      imports: [StockCount],
      providers: [{ provide: InventoryMovementsService, useValue: { registerStockCount } }]
    }).compileComponents();

    fixture = TestBed.createComponent(StockCount);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('arranca con lo que dice el sistema: contar es confirmar, no teclear todo', () => {
    start([item(1, 'Toallas', 20)]);

    expect(component.lines[0].counted).toBe(20);
    expect(component.lines[0].reviewed).toBeFalse();
    expect(component.difference(component.lines[0])).toBe(0);
  });

  it('deja fuera los items inactivos', () => {
    start([item(1, 'Toallas', 20), item(2, 'Viejo', 5, { is_active: false })]);

    expect(component.lines.length).toBe(1);
  });

  it('calcula la diferencia en las dos direcciones', () => {
    // Las lineas van ordenadas por nombre, asi que se buscan por item y no por indice.
    start([item(1, 'Toallas', 20), item(2, 'Jabon', 5)]);
    const linea = (id: number) => component.lines.find((line) => line.item.id === id)!;

    component.setCounted(linea(1), 17);
    component.setCounted(linea(2), 8);

    expect(component.missingUnits).toBe(3);
    expect(component.surplusUnits).toBe(3);
    expect(component.differenceLines.length).toBe(2);
  });

  // Un faltante de cinco toallas no es lo mismo que uno de cinco botellas de vino.
  it('valora el descuadre al costo', () => {
    start([item(1, 'Vino', 10, { cost_price: 30000 })]);

    component.setCounted(component.lines[0], 8);

    expect(component.differenceValue).toBe(-60000);
  });

  it('lleva el avance de lo revisado', () => {
    start([item(1, 'A', 1), item(2, 'B', 2), item(3, 'C', 3), item(4, 'D', 4)]);

    component.confirmLine(component.lines[0]);

    expect(component.reviewedCount).toBe(1);
    expect(component.pendingCount).toBe(3);
    expect(component.progressPercent).toBe(25);
  });

  // El caso corriente: se revisan unos pocos y el resto esta bien.
  it('da por bueno el resto sin tocar lo ya contado', () => {
    start([item(1, 'A', 10), item(2, 'B', 20)]);
    component.setCounted(component.lines[0], 7);

    component.confirmRemaining();

    expect(component.lines[0].counted).toBe(7);
    expect(component.lines[1].counted).toBe(20);
    expect(component.pendingCount).toBe(0);
  });

  it('deshace una linea y la deja sin revisar', () => {
    start([item(1, 'A', 10)]);
    component.setCounted(component.lines[0], 3);

    component.resetLine(component.lines[0]);

    expect(component.lines[0].counted).toBe(10);
    expect(component.lines[0].reviewed).toBeFalse();
  });

  describe('filtros', () => {
    it('muestra solo lo que falta por revisar', () => {
      start([item(1, 'A', 10), item(2, 'B', 20)]);
      component.confirmLine(component.lines[0]);

      component.filter = 'PENDING';

      expect(component.visibleLines.map((line) => line.item.id)).toEqual([2]);
    });

    it('muestra solo lo que descuadra', () => {
      start([item(1, 'A', 10), item(2, 'B', 20)]);
      component.setCounted(component.lines[1], 18);

      component.filter = 'DIFF';

      expect(component.visibleLines.map((line) => line.item.id)).toEqual([2]);
    });

    it('busca por nombre sin importar tildes', () => {
      start([item(1, 'Jabón de tocador', 10), item(2, 'Toallas', 20)]);

      component.search = 'jabon';

      expect(component.visibleLines.map((line) => line.item.id)).toEqual([1]);
    });
  });

  describe('cierre', () => {
    // Se manda el conteo entero: que criterio decide "esto difiere" vive en el backend.
    it('envia todas las lineas contadas', () => {
      start([item(1, 'A', 10), item(2, 'B', 20)]);
      component.setCounted(component.lines[0], 7);
      component.notes = 'Conteo mensual';

      component.submit();

      const [payload] = registerStockCount.calls.mostRecent().args;
      expect(payload.lines).toEqual([
        { item: 1, counted: 7 },
        { item: 2, counted: 20 }
      ]);
      expect(payload.notes).toBe('Conteo mensual');
    });

    it('avisa a quien lo abrio con el resultado', () => {
      start([item(1, 'A', 10)]);
      const resultados: any[] = [];
      component.registered.subscribe((value) => resultados.push(value));

      component.submit();

      expect(resultados.length).toBe(1);
      expect(resultados[0].adjusted_lines).toBe(1);
    });

    // Un conteo a medias es peor que ninguno: el mensaje debe decir que no quedo nada.
    it('deja claro que un fallo no guarda nada', () => {
      start([item(1, 'A', 10)]);
      registerStockCount.and.returnValue(throwError(() => new Error('boom')));

      component.submit();

      expect(component.errorMessage).toContain('No se guardo ninguna linea');
      expect(component.submitting).toBeFalse();
    });
  });
});
