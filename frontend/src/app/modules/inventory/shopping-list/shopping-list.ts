import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  InventoryMovementsService,
  PurchaseEntryResultI
} from '../../../services/inventory-movement';
import { ItemI } from '../../items/item-model';

/** Una línea de la compra: qué falta y cuánto se va a pedir. */
type PurchaseLine = {
  item: ItemI;
  /** Unidades a comprar. Arranca en la sugerencia y el usuario la ajusta. */
  quantity: number;
  /** Entra en el pedido. Se desmarca lo que no se va a comprar ahora. */
  selected: boolean;
};

type UrgencyFilter = 'ALL' | 'OUT' | 'LOW';

/**
 * Lista de compra.
 *
 * Sale de la misma pregunta que resuelve el conteo: *¿qué necesito comprar?* El conteo
 * dice cuánto hay de verdad; esta pantalla convierte ese "hay poco" en un pedido.
 *
 * No es un listado de solo lectura: desde aquí se registra la entrada de la compra
 * cuando llega, y esa entrada es un lote `IN` con una referencia —el número de la
 * factura del proveedor, si se tiene— para poder rastrearla después.
 */
@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shopping-list.html',
  styleUrls: ['./shopping-list.css']
})
export class ShoppingList implements OnChanges {
  @Input() items: ItemI[] = [];

  /** Un ingreso mueve las existencias que ven las otras pestañas. */
  @Output() changed = new EventEmitter<void>();

  lines: PurchaseLine[] = [];
  search = '';
  urgency: UrgencyFilter = 'ALL';
  reference = '';

  submitting = false;
  errorMessage = '';
  successMessage = '';

  readonly urgencyOptions: Array<{ value: UrgencyFilter; label: string }> = [
    { value: 'ALL', label: 'Todo lo que falta' },
    { value: 'OUT', label: 'Agotados' },
    { value: 'LOW', label: 'Bajo minimo' }
  ];

  constructor(private movementsService: InventoryMovementsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['items']) this.rebuild();
  }

  /**
   * Reconstruye la lista conservando lo que el usuario ya ajustó.
   *
   * La lista se recalcula cada vez que llegan items nuevos —tras un ingreso, por
   * ejemplo—, y perder las cantidades tecleadas en ese momento sería exasperante.
   */
  private rebuild(): void {
    const previous = new Map(this.lines.map((line) => [line.item.id, line]));

    this.lines = this.items
      .filter((item) => item.is_active !== false && this.isShort(item))
      .map((item) => {
        const kept = previous.get(item.id);
        return {
          item,
          quantity: kept ? kept.quantity : this.suggestedQuantity(item),
          selected: kept ? kept.selected : true
        };
      })
      .sort((a, b) => {
        // Lo agotado primero: es lo que detiene la operación.
        const byUrgency = this.urgencyRank(a.item) - this.urgencyRank(b.item);
        if (byUrgency !== 0) return byUrgency;
        return a.item.name.localeCompare(b.item.name, 'es');
      });
  }

  // ------------------------------------------------------------- criterio

  /** Falta: sin existencias o en el mínimo o por debajo. */
  private isShort(item: ItemI): boolean {
    return this.stock(item) <= this.minimum(item) || this.stock(item) <= 0;
  }

  private urgencyRank(item: ItemI): number {
    return this.stock(item) <= 0 ? 0 : 1;
  }

  /**
   * Cuánto pedir.
   *
   * Si el item tiene máximo, se pide hasta llenarlo, que es para lo que existe ese
   * campo. Si no, se pide el doble del mínimo menos lo que hay: deja margen sin
   * inventar una cifra grande.
   */
  suggestedQuantity(item: ItemI): number {
    const stock = this.stock(item);
    const maximum = this.toCount(item.maximum_stock);
    if (maximum > 0) return Math.max(maximum - stock, 1);

    const minimum = this.minimum(item);
    if (minimum > 0) return Math.max(minimum * 2 - stock, 1);

    return 1;
  }

  /** Cuánto falta para llegar al mínimo: la carencia real, no lo que se va a pedir. */
  shortfall(item: ItemI): number {
    return Math.max(this.minimum(item) - this.stock(item), 0);
  }

  /**
   * Qué tan cubierto está el item, de 0 a 100.
   *
   * Es la misma barra de las tarjetas: sin ella, dos líneas con carencias muy distintas
   * se ven idénticas en la lista.
   */
  coveragePercent(item: ItemI): number {
    const minimum = this.minimum(item);
    if (minimum <= 0) return this.stock(item) > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, (this.stock(item) / minimum) * 100));
  }

  /** En cuánto queda el item si se compra lo pedido. */
  resultingStock(line: PurchaseLine): number {
    return this.stock(line.item) + line.quantity;
  }

  /** Por qué se sugiere esa cantidad: el criterio, no un número caído del cielo. */
  suggestionReason(item: ItemI): string {
    const maximum = this.toCount(item.maximum_stock);
    if (maximum > 0) return `llena hasta el maximo (${maximum})`;
    if (this.minimum(item) > 0) return `deja el doble del minimo (${this.minimum(item) * 2})`;
    return 'cantidad minima';
  }

  /** El pedido cubre a todos, o solo a algunos: se dice cuál de las dos. */
  get coversAll(): boolean {
    return this.selectedLines.every((line) => this.resultingStock(line) >= this.minimum(line.item));
  }

  // -------------------------------------------------------------- filtros

  get visibleLines(): PurchaseLine[] {
    const search = this.normalize(this.search);

    return this.lines.filter((line) => {
      if (this.urgency === 'OUT' && this.stock(line.item) > 0) return false;
      if (this.urgency === 'LOW' && this.stock(line.item) <= 0) return false;

      if (!search) return true;
      return this.normalize(`${line.item.name} ${line.item.sku || ''}`).includes(search);
    });
  }

  // -------------------------------------------------------------- edicion

  setQuantity(line: PurchaseLine, value: unknown): void {
    line.quantity = Math.max(this.toCount(value), 0);
  }

  step(line: PurchaseLine, delta: number): void {
    line.quantity = Math.max(line.quantity + delta, 0);
  }

  resetToSuggestion(line: PurchaseLine): void {
    line.quantity = this.suggestedQuantity(line.item);
  }

  toggle(line: PurchaseLine): void {
    line.selected = !line.selected;
  }

  selectAll(value: boolean): void {
    for (const line of this.visibleLines) line.selected = value;
  }

  /** Devuelve todas las cantidades a lo sugerido: deshace un pedido mal tecleado. */
  resetAll(): void {
    for (const line of this.lines) {
      line.quantity = this.suggestedQuantity(line.item);
      line.selected = true;
    }
  }

  // -------------------------------------------------------------- totales

  get selectedLines(): PurchaseLine[] {
    return this.lines.filter((line) => line.selected && line.quantity > 0);
  }

  get totalUnits(): number {
    return this.selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  }

  /** Lo que va a costar el pedido: el dato que decide si se compra todo o parte. */
  get totalCost(): number {
    return this.selectedLines.reduce(
      (sum, line) => sum + line.quantity * this.toNumber(line.item.cost_price),
      0
    );
  }

  get outOfStockCount(): number {
    return this.lines.filter((line) => this.stock(line.item) <= 0).length;
  }

  lineCost(line: PurchaseLine): number {
    return line.quantity * this.toNumber(line.item.cost_price);
  }

  get canSubmit(): boolean {
    return !this.submitting && this.selectedLines.length > 0;
  }

  // -------------------------------------------------------------- acciones

  /** Registra la entrada de lo que llegó: una línea `IN` por item. */
  registerEntry(): void {
    if (!this.canSubmit) return;

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.movementsService
      .registerPurchaseEntry({
        lines: this.selectedLines.map((line) => ({ item: line.item.id, quantity: line.quantity })),
        reference: this.reference.trim(),
        notes: 'Ingreso desde la lista de compra.'
      })
      .subscribe({
        next: (result: PurchaseEntryResultI) => {
          this.submitting = false;
          this.reference = '';
          this.successMessage =
            `Se registro la entrada de ${result.entered_lines} item(s) ` +
            `con la referencia ${result.reference}.`;
          // El contenedor recarga: los items que ya no faltan salen solos de la lista.
          this.changed.emit();
        },
        error: () => {
          this.submitting = false;
          this.errorMessage = 'No fue posible registrar la entrada. No se guardo ninguna linea.';
        }
      });
  }

  /** Exporta el pedido para mandarlo al proveedor o imprimirlo. */
  exportCsv(): void {
    const rows = this.selectedLines.length ? this.selectedLines : this.lines;
    if (!rows.length) return;

    const headers = ['item', 'sku', 'unidad', 'stock_actual', 'minimo', 'a_comprar', 'costo_unitario', 'costo_linea'];
    const body = rows.map((line) =>
      [
        line.item.name,
        line.item.sku || '',
        this.unitLabel(line),
        this.stock(line.item),
        this.minimum(line.item),
        line.quantity,
        this.toNumber(line.item.cost_price),
        this.lineCost(line)
      ]
        .map((cell) => this.escapeCsvCell(cell))
        .join(',')
    );

    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lista-compra-${this.fileDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------- helpers

  stock(item: ItemI): number {
    return this.toCount(item.stock);
  }

  minimum(item: ItemI): number {
    return this.toCount(item.minimum_stock);
  }

  unitLabel(line: PurchaseLine): string {
    return line.item.unit_measure_name || line.item.unit_measure_code || 'unidad';
  }

  isOutOfStock(line: PurchaseLine): boolean {
    return this.stock(line.item) <= 0;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  trackByLine(_: number, line: PurchaseLine): number {
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
      .replace(/[̀-ͯ]/g, '');
  }

  private escapeCsvCell(value: string | number): string {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  private fileDate(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}${month}${day}`;
  }
}
