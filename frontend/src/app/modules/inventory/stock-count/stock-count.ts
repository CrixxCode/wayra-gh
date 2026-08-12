import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InventoryMovementsService, StockCountResultI } from '../../../services/inventory-movement';
import { ItemI } from '../../items/item-model';

/** Una línea del conteo: lo que dice el sistema frente a lo que se contó. */
type CountLine = {
  item: ItemI;
  /** Lo que hay de verdad, según quien cuenta. */
  counted: number;
  /** Se marca al tocarla, para saber qué se revisó y qué queda pendiente. */
  reviewed: boolean;
};

type CountFilter = 'ALL' | 'PENDING' | 'DIFF';

/**
 * Conteo físico de inventario.
 *
 * Un hotel cuadra su bodega cada semana o cada mes: recorre los estantes, anota lo que
 * hay de verdad y corrige el sistema. Hasta ahora eso obligaba a registrar un ajuste por
 * item, uno a uno, sin forma de saber después qué formó parte del mismo conteo.
 *
 * Aquí se cuenta todo de una vez y el backend lo asienta en una sola transacción con
 * referencia compartida y autor, que es lo que lo hace auditable. Solo se registran las
 * líneas que descuadran: contar ochenta items y hallar tres diferencias debe dejar tres
 * movimientos, no ochenta asientos idénticos.
 */
@Component({
  selector: 'app-stock-count',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-count.html',
  styleUrls: ['./stock-count.css']
})
export class StockCount implements OnInit {
  @Input() items: ItemI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() registered = new EventEmitter<StockCountResultI>();

  lines: CountLine[] = [];
  search = '';
  filter: CountFilter = 'ALL';
  notes = '';

  submitting = false;
  errorMessage = '';

  readonly filterOptions: Array<{ value: CountFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PENDING', label: 'Sin revisar' },
    { value: 'DIFF', label: 'Con diferencia' }
  ];

  constructor(private movementsService: InventoryMovementsService) {}

  ngOnInit(): void {
    // Se parte de lo que dice el sistema: contar es confirmar o corregir, no teclear
    // ochenta cifras desde cero.
    this.lines = this.items
      .filter((item) => item.is_active !== false)
      .map((item) => ({ item, counted: this.toCount(item.stock), reviewed: false }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'es'));
  }

  // -------------------------------------------------------------- filtros

  get visibleLines(): CountLine[] {
    const search = this.normalize(this.search);

    return this.lines.filter((line) => {
      if (this.filter === 'PENDING' && line.reviewed) return false;
      if (this.filter === 'DIFF' && this.difference(line) === 0) return false;

      if (!search) return true;
      const pool = `${line.item.name} ${line.item.sku || ''}`;
      return this.normalize(pool).includes(search);
    });
  }

  // -------------------------------------------------------------- edicion

  difference(line: CountLine): number {
    return line.counted - this.toCount(line.item.stock);
  }

  setCounted(line: CountLine, value: unknown): void {
    line.counted = this.toCount(value);
    line.reviewed = true;
  }

  step(line: CountLine, delta: number): void {
    line.counted = Math.max(line.counted + delta, 0);
    line.reviewed = true;
  }

  /** Confirma que lo contado coincide con el sistema, sin teclear nada. */
  confirmLine(line: CountLine): void {
    line.counted = this.toCount(line.item.stock);
    line.reviewed = true;
  }

  /** Da por bueno todo lo que queda sin revisar: el caso de "lo demás está bien". */
  confirmRemaining(): void {
    for (const line of this.lines) {
      if (line.reviewed) continue;
      line.counted = this.toCount(line.item.stock);
      line.reviewed = true;
    }
  }

  resetLine(line: CountLine): void {
    line.counted = this.toCount(line.item.stock);
    line.reviewed = false;
  }

  // --------------------------------------------------------------- avance

  get reviewedCount(): number {
    return this.lines.filter((line) => line.reviewed).length;
  }

  get pendingCount(): number {
    return this.lines.length - this.reviewedCount;
  }

  get progressPercent(): number {
    if (!this.lines.length) return 0;
    return Math.round((this.reviewedCount / this.lines.length) * 100);
  }

  get differenceLines(): CountLine[] {
    return this.lines.filter((line) => this.difference(line) !== 0);
  }

  get surplusUnits(): number {
    return this.differenceLines
      .filter((line) => this.difference(line) > 0)
      .reduce((sum, line) => sum + this.difference(line), 0);
  }

  get missingUnits(): number {
    return this.differenceLines
      .filter((line) => this.difference(line) < 0)
      .reduce((sum, line) => sum + Math.abs(this.difference(line)), 0);
  }

  /**
   * Lo que cuesta el descuadre.
   *
   * Es el número que interesa a quien firma el conteo: un faltante de cinco toallas no
   * es lo mismo que uno de cinco botellas de vino.
   */
  get differenceValue(): number {
    return this.differenceLines.reduce(
      (sum, line) => sum + this.difference(line) * this.toNumber(line.item.cost_price),
      0
    );
  }

  get canSubmit(): boolean {
    return !this.submitting && this.lines.length > 0;
  }

  // -------------------------------------------------------------- acciones

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (!this.canSubmit) return;

    this.submitting = true;
    this.errorMessage = '';

    this.movementsService
      .registerStockCount({
        // Se manda el conteo entero: el backend decide qué difiere y qué no, para que
        // ese criterio viva en un solo sitio.
        lines: this.lines.map((line) => ({ item: line.item.id, counted: line.counted })),
        notes: this.notes.trim()
      })
      .subscribe({
        next: (result) => {
          this.submitting = false;
          this.registered.emit(result);
        },
        error: () => {
          this.submitting = false;
          this.errorMessage = 'No fue posible registrar el conteo. No se guardo ninguna linea.';
        }
      });
  }

  // -------------------------------------------------------------- helpers

  systemStock(line: CountLine): number {
    return this.toCount(line.item.stock);
  }

  unitLabel(line: CountLine): string {
    return line.item.unit_measure_name || line.item.unit_measure_code || 'unidad';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  trackByLine(_: number, line: CountLine): number {
    return line.item.id;
  }

  private toCount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalize(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
