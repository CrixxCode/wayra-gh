import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { InventoryMovementsService } from '../../../services/inventory-movement';
import { InventoryMovementI } from '../../inventory-movements/inventory-movement-model';
import { ItemI } from '../item-model';

export type StockMoveDirection = 'IN' | 'OUT';

/** Atajos de cantidad: cubren lo que se mueve normalmente sin teclear. */
const QUICK_AMOUNTS = [1, 5, 10, 25];

/**
 * Entrada o salida de stock de un item.
 *
 * Los botones fijos de la tarjeta (`−1`, `+1`) resuelven el caso de una unidad, pero
 * cualquier cantidad distinta obligaba a pulsar varias veces o a irse al formulario
 * completo de movimiento. Este modal es el punto medio: una sola cifra, con atajos, y
 * **la consecuencia a la vista** —en cuánto queda el stock— antes de confirmar.
 *
 * Registra un movimiento normal, con su tipo y su rastro: que sea rápido no lo saca de
 * la bitácora.
 */
@Component({
  selector: 'app-stock-move',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-move.html',
  styleUrls: ['./stock-move.css']
})
export class StockMove implements OnInit {
  @Input() item: ItemI | null = null;
  @Input() direction: StockMoveDirection = 'IN';

  /** Id del tipo de movimiento que corresponde a la dirección, resuelto por la lista. */
  @Input() movementTypeId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() registered = new EventEmitter<InventoryMovementI>();

  quantity = 1;
  reference = '';
  notes = '';

  submitting = false;
  errorMessage = '';

  readonly quickAmounts = QUICK_AMOUNTS;

  constructor(
    private movementsService: InventoryMovementsService,
    private hostRef: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    // El foco va al campo: quien abre esto viene a teclear una cifra.
    requestAnimationFrame(() => {
      this.hostRef.nativeElement.querySelector<HTMLInputElement>('.move-input input')?.select();
    });
  }

  // -------------------------------------------------------------- lectura

  get isEntry(): boolean {
    return this.direction === 'IN';
  }

  get title(): string {
    return this.isEntry ? 'Registrar entrada' : 'Registrar salida';
  }

  get currentStock(): number {
    return this.toCount(this.item?.stock);
  }

  get unitLabel(): string {
    return this.item?.unit_measure_name || this.item?.unit_measure_code || 'unidad';
  }

  /** En cuánto queda el stock si se confirma: la resta no debería hacerla el usuario. */
  get resultingStock(): number {
    const delta = this.isEntry ? this.quantity : -this.quantity;
    return Math.max(this.currentStock + delta, 0);
  }

  /** Una salida no puede llevarse más de lo que hay. */
  get exceedsStock(): boolean {
    return !this.isEntry && this.quantity > this.currentStock;
  }

  get minimumStock(): number {
    return this.toCount(this.item?.minimum_stock);
  }

  /** Aviso, no bloqueo: dejar el stock bajo mínimo puede ser legítimo. */
  get willDropBelowMinimum(): boolean {
    if (this.isEntry || this.exceedsStock) return false;
    return this.minimumStock > 0 && this.resultingStock <= this.minimumStock;
  }

  get canSubmit(): boolean {
    if (this.submitting || !this.item || !this.movementTypeId) return false;
    return this.quantity > 0 && !this.exceedsStock;
  }

  // -------------------------------------------------------------- edicion

  setQuantity(value: unknown): void {
    this.quantity = Math.max(this.toCount(value), 0);
  }

  step(delta: number): void {
    this.quantity = Math.max(this.quantity + delta, 0);
  }

  useQuickAmount(amount: number): void {
    this.quantity = amount;
  }

  /** Atajo de la salida completa: vaciar el item. */
  useAllStock(): void {
    this.quantity = this.currentStock;
  }

  // -------------------------------------------------------------- acciones

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (!this.canSubmit || !this.item || !this.movementTypeId) return;

    this.submitting = true;
    this.errorMessage = '';

    this.movementsService
      .createInventoryMovement({
        item: this.item.id,
        movement_type: this.movementTypeId,
        quantity: this.quantity,
        reference: this.reference.trim() || null,
        notes: this.notes.trim() || (this.isEntry ? 'Entrada de stock' : 'Salida de stock'),
        is_active: true
      })
      .subscribe({
        next: (movement) => {
          this.submitting = false;
          this.registered.emit(movement);
        },
        error: () => {
          this.submitting = false;
          this.errorMessage = this.isEntry
            ? 'No fue posible registrar la entrada.'
            : 'No fue posible registrar la salida.';
        }
      });
  }

  private toCount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
