import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { InventoryMovementsService, StockCountResultI } from '../../../services/inventory-movement';
import { ItemsService } from '../../../services/item';
import { MotionService } from '../../../services/motion';
import { RoomInventoryService } from '../../../services/room-inventory';
import { ListInventoryMovements } from '../../inventory-movements/list-inventory-movements/list-inventory-movements';
import { InventoryMovementI } from '../../inventory-movements/inventory-movement-model';
import { ItemI } from '../../items/item-model';
import { ListItems } from '../../items/list-items/list-items';
import { ListRoomInventory } from '../../room-inventory/list-room-inventory/list-room-inventory';
import { RoomInventoryI } from '../../room-inventory/room-inventory-model';
import { ShoppingList } from '../shopping-list/shopping-list';
import { StockCount } from '../stock-count/stock-count';

export type InventoryTab = 'items' | 'rooms' | 'movements' | 'shopping';

type TabDefinition = {
  key: InventoryTab;
  label: string;
  icon: string;
  hint: string;
};

/** Tarjeta del resumen: un número y qué hacer con él. */
export type InventoryMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  /** Pestaña a la que lleva al pulsarla. */
  tab: InventoryTab;
};

/** Un item pedido desde otra pestaña, para seguirle la pista. */
export type InventoryFocus = {
  id: number;
  name: string;
};

/**
 * Inventario: items, dotación por habitación y movimientos en una sola pantalla.
 *
 * Las tres eran rutas separadas, pero `Item` es el centro de una estrella:
 *
 *              InventoryMovement
 *                     │ item
 *                     ▼
 *     RoomInventory ─► Item ◄─ InventoryRestockAlert
 *          item
 *
 * Y no es solo que compartan una FK: **`InventoryMovement` es la bitácora de
 * `Item.stock`** —guarda `previous_stock` y `new_stock`—, así que Items enseña el número
 * actual y Movimientos enseña cómo llegó a serlo. Eran dos vistas del mismo dato sin
 * forma de pasar de una a la otra.
 *
 * Lo que aporta el contenedor: la pregunta "¿de qué me estoy quedando sin?" se responde
 * en un sitio. Antes el aviso de bajo mínimo se calculaba dos veces —en bodega y en
 * habitación— y había que mirar dos pantallas para saberlo.
 */
@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, ListItems, ListRoomInventory, ListInventoryMovements, ShoppingList, StockCount],
  templateUrl: './inventory-page.html',
  styleUrls: ['./inventory-page.css']
})
export class InventoryPage implements OnInit, OnDestroy {
  activeTab: InventoryTab = 'items';

  /** Solo la primera carga del resumen. */
  loading = true;

  /** Recarga del resumen disparada por un cambio en una pestaña. */
  refreshing = false;

  items: ItemI[] = [];
  roomInventory: RoomInventoryI[] = [];
  movements: InventoryMovementI[] = [];

  /**
   * Item que se está siguiendo entre pestañas.
   *
   * Es la interacción que faltaba: desde un item con el stock raro se salta a sus
   * movimientos o a las habitaciones donde está, sin volver a buscarlo a mano.
   */
  focus: InventoryFocus | null = null;

  /** El conteo se hace en su propio modal: es una sesion de trabajo, no una vista. */
  showStockCount = false;

  /** Resultado del ultimo conteo, para no dejarlo sin confirmacion visible. */
  lastCountMessage = '';

  readonly tabs: TabDefinition[] = [
    {
      key: 'items',
      label: 'Items',
      icon: 'fa-solid fa-boxes-stacked',
      hint: 'Que hay en bodega y cuanto queda'
    },
    {
      key: 'rooms',
      label: 'Por habitacion',
      icon: 'fa-solid fa-bed',
      hint: 'Dotacion asignada a cada habitacion'
    },
    {
      key: 'movements',
      label: 'Movimientos',
      icon: 'fa-solid fa-right-left',
      hint: 'Como cambio el stock y por que'
    },
    {
      key: 'shopping',
      label: 'Lista de compra',
      icon: 'fa-solid fa-cart-shopping',
      hint: 'Lo que hay que reponer y su costo'
    }
  ];

  private revealFrame: number | null = null;

  /** La entrada animada es de bienvenida: se ejecuta una vez, no en cada recarga. */
  private revealed = false;

  constructor(
    private itemsService: ItemsService,
    private roomInventoryService: RoomInventoryService,
    private movementsService: InventoryMovementsService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // --------------------------------------------------------------------- datos

  loadSummary(forceRefresh = false, silent = false): void {
    if (silent) this.refreshing = true;
    else this.loading = true;

    forkJoin({
      items: this.itemsService
        .listItems({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as ItemI[]))),
      roomInventory: this.roomInventoryService
        .listRoomInventory({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as RoomInventoryI[]))),
      movements: this.movementsService
        .listInventoryMovements({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as InventoryMovementI[])))
    }).subscribe(({ items, roomInventory, movements }) => {
      this.loading = false;
      this.refreshing = false;
      this.items = items;
      this.roomInventory = roomInventory;
      this.movements = movements;

      if (!this.revealed) {
        this.revealed = true;
        this.scheduleReveal();
      }
    });
  }

  // ------------------------------------------------------------------ pestañas

  selectTab(tab: InventoryTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true
    });

    this.scheduleReveal();
  }

  tabCount(tab: InventoryTab): number {
    if (tab === 'items') return this.items.length;
    if (tab === 'rooms') return this.roomInventory.length;
    if (tab === 'shopping') return this.lowStockItems.length;
    return this.movements.length;
  }

  /** Sigue un item en otra pestaña: la lista destino se abre ya filtrada por él. */
  followItem(item: InventoryFocus, tab: InventoryTab): void {
    this.focus = item;
    this.selectTab(tab);
  }

  clearFocus(): void {
    this.focus = null;
  }

  // ------------------------------------------------------------------ métricas

  /** Bodega: lo que hay que reponer antes de que falte. */
  get lowStockItems(): ItemI[] {
    return this.items.filter(
      (item) => item.is_active !== false && Number(item.stock) <= Number(item.minimum_stock)
    );
  }

  get outOfStockItems(): ItemI[] {
    return this.items.filter((item) => item.is_active !== false && Number(item.stock) <= 0);
  }

  /** Dotación: habitaciones a las que les falta algo de lo que deberían tener. */
  get roomsWithGaps(): number {
    const rooms = new Set<number>();
    for (const line of this.roomInventory) {
      if (line.is_active === false) continue;
      if (Number(line.quantity) >= Number(line.minimum_quantity)) continue;
      if (typeof line.room === 'number') rooms.add(line.room);
    }
    return rooms.size;
  }

  get inventoryValue(): number {
    return this.items
      .filter((item) => item.is_active !== false)
      .reduce((sum, item) => sum + Number(item.stock || 0) * this.toNumber(item.cost_price), 0);
  }

  /** Movimientos de hoy: el pulso de la operación. */
  get movementsToday(): InventoryMovementI[] {
    const today = this.dateKey(new Date());
    return this.movements.filter((movement) => {
      const raw = movement.movement_date || movement.created_at;
      if (!raw) return false;
      const date = new Date(raw);
      return !Number.isNaN(date.getTime()) && this.dateKey(date) === today;
    });
  }

  get metrics(): InventoryMetric[] {
    const low = this.lowStockItems.length;
    const out = this.outOfStockItems.length;
    const gaps = this.roomsWithGaps;
    const today = this.movementsToday.length;

    return [
      {
        key: 'items',
        label: 'Items en catalogo',
        value: String(this.items.filter((item) => item.is_active !== false).length),
        note: `${this.formatCurrency(this.inventoryValue)} en stock`,
        icon: 'fa-solid fa-boxes-stacked',
        tone: 'brand',
        tab: 'items'
      },
      {
        key: 'low',
        label: 'Bajo minimo',
        value: String(low),
        note: out ? `${out} sin existencias` : 'Ninguno agotado',
        icon: 'fa-solid fa-triangle-exclamation',
        tone: out ? 'danger' : low ? 'warning' : 'success',
        tab: 'items'
      },
      {
        key: 'gaps',
        label: 'Habitaciones incompletas',
        value: String(gaps),
        note: gaps ? 'Les falta parte de su dotacion' : 'Dotacion al dia',
        icon: 'fa-solid fa-bed',
        tone: gaps ? 'warning' : 'success',
        tab: 'rooms'
      },
      {
        key: 'today',
        label: 'Movimientos de hoy',
        value: String(today),
        note: today ? `${this.movements.length} en el historico` : 'Sin movimiento hoy',
        icon: 'fa-solid fa-right-left',
        tone: 'brand',
        tab: 'movements'
      }
    ];
  }

  trackByTab(_: number, tab: TabDefinition): string {
    return tab.key;
  }

  trackByMetric(_: number, metric: InventoryMetric): string {
    return metric.key;
  }

  /** Un cambio en una pestaña mueve las existencias que ven las otras dos. */
  onInventoryChanged(): void {
        // Sin forzar: la escritura ya invalido el cache desde el servicio, asi que esto
    // va al servidor igual. Forzarlo ademas anularia la deduplicacion de peticiones
    // en vuelo y la lista de la pestaña pediria lo mismo por segunda vez.
    this.loadSummary(false, true);
  }

  // -------------------------------------------------------------------- conteo

  openStockCount(): void {
    this.showStockCount = true;
  }

  closeStockCount(): void {
    this.showStockCount = false;
  }

  /**
   * El conteo quedo asentado.
   *
   * Se resume en una frase --cuantas lineas descuadraron-- porque es lo que el
   * usuario quiere saber al cerrar: si el inventario estaba bien o no.
   */
  onStockCountRegistered(result: StockCountResultI): void {
    this.showStockCount = false;
    this.lastCountMessage = result.adjusted_lines
      ? `Conteo ${result.reference}: se ajustaron ${result.adjusted_lines} de ` +
        `${result.counted_lines} items.`
      : `Conteo ${result.reference}: el inventario cuadro, no hubo ajustes.`;
    this.loadSummary(true, true);
  }

  dismissCountMessage(): void {
    this.lastCountMessage = '';
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.inv-metric'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.inv-tab'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26
        });
        this.motion.reveal(host.querySelectorAll('.inv-panel'), {
          stagger: 0,
          y: 12,
          delay: 0.06
        });
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private isTab(value: string): value is InventoryTab {
    return (
      value === 'items' || value === 'rooms' || value === 'movements' || value === 'shopping'
    );
  }

  private dateKey(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  }
}
