import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { catchError, of } from 'rxjs';

import { InventoryMovementsService } from '../../../services/inventory-movement';
import { InventoryMovementI } from '../../inventory-movements/inventory-movement-model';
import { ItemI } from '../item-model';

type StockState = 'OUT' | 'LOW' | 'EXCESS' | 'HEALTHY';

/**
 * Detalle de un item de inventario.
 *
 * Antes eran **seis paneles apilados** con el mismo dato repetido en varios: "stock
 * actual" salía en la cabecera y otra vez en "Stock y alertas"; "estado" en el chip del
 * título y otra vez en "Resumen"; el tipo en el sobretítulo y otra vez debajo. Y el dato
 * que de verdad importa —18 frente a un mínimo de 6 y un máximo de 35— eran tres cifras
 * sueltas que había que comparar mentalmente.
 *
 * Ahora el titular es el **medidor**, igual que en las tarjetas y en la dotación de
 * habitación, y lo demás se ordena por para qué sirve: cuánto vale, cuánto deja, qué es
 * y desde cuándo.
 */
@Component({
  selector: 'app-detail-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-item.html',
  styleUrls: ['./detail-item.css']
})
export class DetailItem implements OnChanges {
  @Input() itemData: ItemI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() statusRequested = new EventEmitter<ItemI>();
  @Output() deleteRequested = new EventEmitter<ItemI>();

  /** Ver por qué el stock es el que es: la pregunta que se hace mirando esta pantalla. */
  @Output() movementsRequested = new EventEmitter<ItemI>();

  /** Ver en qué habitaciones está repartido. */
  @Output() roomsRequested = new EventEmitter<ItemI>();

  /** Cuántos movimientos se enseñan aquí antes de mandar al histórico completo. */
  private static readonly RECENT_MOVEMENTS = 6;

  movements: InventoryMovementI[] = [];
  loadingMovements = false;
  movementsError = false;

  constructor(private movementsService: InventoryMovementsService) {}

  closeDrawer(): void {
    this.closed.emit();
  }

  requestStatusToggle(): void {
    if (!this.itemData) return;
    this.statusRequested.emit(this.itemData);
  }

  requestDelete(): void {
    if (!this.itemData) return;
    this.deleteRequested.emit(this.itemData);
  }

  requestMovements(): void {
    if (!this.itemData) return;
    this.movementsRequested.emit(this.itemData);
  }

  requestRooms(): void {
    if (!this.itemData) return;
    this.roomsRequested.emit(this.itemData);
  }

  // ------------------------------------------------------------- bitacora

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['itemData']) this.loadMovements();
  }

  /**
   * Los ultimos movimientos del item.
   *
   * Es la respuesta a la pregunta que trae aqui a cualquiera: *por que el stock esta
   * como esta*. Tenerla a un salto de pestaña era tenerla lejos; se pide acotada al
   * item y recortada a los ultimos, que es lo que explica el estado actual.
   */
  private loadMovements(): void {
    this.movements = [];
    this.movementsError = false;

    if (!this.itemData) return;

    this.loadingMovements = true;
    this.movementsService
      .listInventoryMovements({ item: this.itemData.id, ordering: '-id' })
      .pipe(catchError(() => of(null)))
      .subscribe((movements) => {
        this.loadingMovements = false;
        if (movements === null) {
          this.movementsError = true;
          return;
        }
        this.movements = movements;
      });
  }

  /** Solo los ultimos: el historico completo vive en su pestaña, con sus filtros. */
  get recentMovements(): InventoryMovementI[] {
    return this.movements.slice(0, DetailItem.RECENT_MOVEMENTS);
  }

  get hasMoreMovements(): boolean {
    return this.movements.length > DetailItem.RECENT_MOVEMENTS;
  }

  get hiddenMovementsCount(): number {
    return Math.max(this.movements.length - DetailItem.RECENT_MOVEMENTS, 0);
  }

  movementDirection(movement: InventoryMovementI): 'IN' | 'OUT' | 'NEUTRAL' {
    const delta = this.toNonNegativeInt(movement.new_stock) - this.toNonNegativeInt(movement.previous_stock);
    if (delta > 0) return 'IN';
    if (delta < 0) return 'OUT';
    return 'NEUTRAL';
  }

  /** El salto de stock con signo: es lo que un movimiento significa. */
  movementDeltaLabel(movement: InventoryMovementI): string {
    const delta = this.toNonNegativeInt(movement.new_stock) - this.toNonNegativeInt(movement.previous_stock);
    if (delta > 0) return `+${delta}`;
    return String(delta);
  }

  movementTypeLabel(movement: InventoryMovementI): string {
    return movement.movement_type_name || movement.movement_type_code || 'Movimiento';
  }

  movementAuthorLabel(movement: InventoryMovementI): string {
    return String(movement.created_by_username || '').trim();
  }

  formatDateTime(value: string | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackByMovement(_: number, movement: InventoryMovementI): number {
    return movement.id;
  }

  // -------------------------------------------------------------- medidor

  get stock(): number {
    return this.toNonNegativeInt(this.itemData?.stock);
  }

  get minimumStock(): number {
    return this.toNonNegativeInt(this.itemData?.minimum_stock);
  }

  get maximumStock(): number {
    return this.toNonNegativeInt(this.itemData?.maximum_stock);
  }

  /**
   * Escala de la barra.
   *
   * Si hay máximo, esa es la referencia natural. Si no, se toma cuatro veces el mínimo
   * para que la marca no quede pegada al borde y la barra siga significando algo.
   */
  get gaugeTarget(): number {
    if (this.maximumStock > 0) return this.maximumStock;
    if (this.minimumStock <= 0) return Math.max(this.stock, 1);
    return Math.max(this.minimumStock * 4, this.stock, 1);
  }

  get stockPercent(): number {
    return Math.max(0, Math.min(100, (this.stock / this.gaugeTarget) * 100));
  }

  /** Dónde cae el mínimo: sin la marca, la barra solo diría "hay algo". */
  get minimumMarkPercent(): number {
    if (this.minimumStock <= 0) return 0;
    return Math.max(0, Math.min(100, (this.minimumStock / this.gaugeTarget) * 100));
  }

  /** Cuánto falta para el mínimo, que es lo accionable cuando está por debajo. */
  get unitsBelowMinimum(): number {
    return Math.max(this.minimumStock - this.stock, 0);
  }

  get stockState(): StockState {
    if (this.stock <= 0) return 'OUT';
    if (this.stock <= this.minimumStock) return 'LOW';
    if (this.maximumStock > 0 && this.stock > this.maximumStock) return 'EXCESS';
    return 'HEALTHY';
  }

  /** Una frase con lo que hay que hacer, no solo con lo que pasa. */
  get stockHeadline(): string {
    const unit = this.getUnitLabel().toLowerCase();
    if (this.stockState === 'OUT') return 'Agotado: hay que reponer';
    if (this.stockState === 'LOW') {
      return `Faltan ${this.unitsBelowMinimum} ${unit} para el minimo`;
    }
    if (this.stockState === 'EXCESS') return `Por encima del maximo (${this.maximumStock})`;
    return `${this.stock - this.minimumStock} ${unit} por encima del minimo`;
  }

  getStockStateLabel(): string {
    if (!this.itemData) return 'Sin stock';
    if (this.stockState === 'OUT') return 'Sin stock';
    if (this.stockState === 'LOW') return 'Bajo minimo';
    if (this.stockState === 'EXCESS') return 'Exceso';
    return 'Saludable';
  }

  getStockStateTone(): { bg: string; color: string; bar: string } {
    if (!this.itemData || this.stockState === 'OUT') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        bar: 'var(--gh-status-danger-strong)'
      };
    }
    if (this.stockState === 'LOW') {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)',
        bar: 'var(--gh-status-warn-strong)'
      };
    }
    if (this.stockState === 'EXCESS') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-text)',
        bar: 'var(--gh-status-info-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      bar: 'var(--gh-status-success-strong)'
    };
  }

  // -------------------------------------------------------------- lectura

  getStatusLabel(): string {
    if (!this.itemData) return 'Sin estado';
    return this.itemData.is_active ? 'Activo' : 'Inactivo';
  }

  getTypeLabel(): string {
    if (!this.itemData) return 'Sin tipo';
    return this.itemData.item_type_name || this.itemData.item_type_code || 'Sin tipo';
  }

  getPurposeLabel(): string {
    if (!this.itemData) return 'Sin uso';
    return this.itemData.item_purpose === 'ROOM' ? 'Habitacion' : 'Recepcion';
  }

  getUnitLabel(): string {
    if (!this.itemData) return 'Sin unidad';
    return this.itemData.unit_measure_name || this.itemData.unit_measure_code || 'unidad';
  }

  getMaximumStockLabel(): string {
    if (this.maximumStock <= 0) return 'Sin tope';
    return String(this.maximumStock);
  }

  getCostPriceLabel(): string {
    return this.formatCurrency(this.toNumber(this.itemData?.cost_price));
  }

  getSalePriceLabel(): string {
    return this.formatCurrency(this.toNumber(this.itemData?.sale_price));
  }

  getMarginLabel(): string {
    return this.formatCurrency(this.marginAmount);
  }

  get marginAmount(): number {
    return this.toNumber(this.itemData?.sale_price) - this.toNumber(this.itemData?.cost_price);
  }

  /** El porcentaje es lo que se compara entre items; el valor absoluto solo no dice. */
  getMarginPercentLabel(): string {
    const cost = this.toNumber(this.itemData?.cost_price);
    if (cost <= 0) return 'Sin costo registrado';

    const percent = (this.marginAmount / cost) * 100;
    return `${percent.toFixed(0)}% sobre el costo`;
  }

  getStockValueLabel(): string {
    return this.formatCurrency(this.stock * this.toNumber(this.itemData?.cost_price));
  }

  /** Lo que dejaría vender todas las existencias, al precio de venta. */
  getPotentialSaleLabel(): string {
    return this.formatCurrency(this.stock * this.toNumber(this.itemData?.sale_price));
  }

  getDescription(): string {
    return String(this.itemData?.description || '').trim();
  }

  formatDate(value: string | undefined): string {
    if (!value) return 'Sin registro';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private toNonNegativeInt(value: number | null | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}
