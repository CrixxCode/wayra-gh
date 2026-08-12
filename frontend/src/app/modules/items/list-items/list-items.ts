import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { ItemsService } from '../../../services/item';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { InventoryMovementI } from '../../inventory-movements/inventory-movement-model';
import { MasterDataService } from '../../../services/master-data.service';
import { CreateItem } from '../create-item/create-item';
import { DetailItem } from '../detail-item/detail-item';
import { ItemI } from '../item-model';
import { StockMove, StockMoveDirection } from '../stock-move/stock-move';

type ItemStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ItemStockFilter = 'ALL' | 'LOW' | 'HEALTHY';
type ItemPurposeFilter = 'ALL' | 'ROOM' | 'RECEPTION';
type ItemViewMode = 'cards' | 'table';

type ItemCategoryTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type ItemCatalogGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: ItemCategoryTone;
  items: ItemI[];
};

type ItemTypeTab = {
  key: string;
  label: string;
  count: number;
  tone: ItemCategoryTone;
};

const CATEGORY_TONES: Record<string, ItemCategoryTone> = {
  MINIBAR: {
    icon: 'fa-solid fa-bottle-water',
    iconBg: '#dcfdf2',
    iconColor: '#0f766e',
    cover: 'linear-gradient(135deg, #115e59 0%, #10b981 100%)',
    badgeBg: '#dcfdf2',
    badgeColor: '#0f766e',
    accent: '#10b981'
  },
  CLEANING: {
    icon: 'fa-solid fa-spray-can-sparkles',
    iconBg: '#e0ecff',
    iconColor: '#1d4ed8',
    cover: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    badgeBg: '#e7eeff',
    badgeColor: '#1d4ed8',
    accent: '#3b82f6'
  },
  LINEN: {
    icon: 'fa-solid fa-sheet-plastic',
    iconBg: '#f3e8ff',
    iconColor: '#7e22ce',
    cover: 'linear-gradient(135deg, #4c1d95 0%, #a855f7 100%)',
    badgeBg: '#f4e9ff',
    badgeColor: '#7e22ce',
    accent: '#a855f7'
  },
  AMENITY: {
    icon: 'fa-solid fa-soap',
    iconBg: '#ffe4ef',
    iconColor: '#be185d',
    cover: 'linear-gradient(135deg, #831843 0%, #ec4899 100%)',
    badgeBg: '#ffe4ef',
    badgeColor: '#be185d',
    accent: '#ec4899'
  },
  FOOD: {
    icon: 'fa-solid fa-bowl-food',
    iconBg: '#fff4dc',
    iconColor: '#b45309',
    cover: 'linear-gradient(135deg, #6b4112 0%, #d28d3c 100%)',
    badgeBg: '#fff4dc',
    badgeColor: '#b45309',
    accent: '#f59e0b'
  },
  BEVERAGE: {
    icon: 'fa-solid fa-wine-glass',
    iconBg: '#efe9ff',
    iconColor: '#6d28d9',
    cover: 'linear-gradient(135deg, #2a2463 0%, #7c3aed 100%)',
    badgeBg: '#f3ecff',
    badgeColor: '#6d28d9',
    accent: '#8b5cf6'
  },
  DEFAULT: {
    icon: 'fa-solid fa-box-open',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: '#e6edf7',
    badgeColor: '#1f3f73',
    accent: '#335f9d'
  }
};

@Component({
  selector: 'app-list-items',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateItem, DetailItem, StockMove],
  templateUrl: './list-items.html',
  styleUrls: ['./list-items.css']
})
export class ListItems implements OnInit, OnDestroy {
  /** Dentro del contenedor de inventario: sin encabezado ni metricas propias. */
  @Input() embedded = false;

  /** Un cambio aqui mueve las existencias que ven las otras dos pestañas. */
  @Output() changed = new EventEmitter<void>();

  /**
   * Pide seguir un item en otra pestaña.
   *
   * "¿Por que bajo este stock?" y "¿donde esta repartido?" son las dos preguntas que
   * se hacen mirando un item, y hasta ahora obligaban a cambiar de pantalla y buscarlo
   * otra vez a mano. La lista no navega por su cuenta: se lo pide al contenedor.
   */
  @Output() followItem = new EventEmitter<{
    item: { id: number; name: string };
    tab: 'items' | 'rooms' | 'movements';
  }>();

  /**
   * Item que se viene siguiendo desde otra pestaña.
   *
   * Llega del contenedor y acota la lista sin tocar los filtros propios, que el
   * usuario puede seguir moviendo por encima.
   */
  @Input() set focusItemId(value: number | null) {
    this.trackedItemId = typeof value === 'number' && value > 0 ? value : null;
    this.applyFilters();
  }

  trackedItemId: number | null = null;

  /** Item cuyo ajuste rapido esta en vuelo, para bloquear solo esa tarjeta. */
  quickAdjustingId: number | null = null;

  /** Recarga agrupada de una racha de ajustes rapidos. */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** Item cuyo movimiento se esta registrando en el modal, y en que direccion. */
  movingItem: ItemI | null = null;
  movingDirection: StockMoveDirection = 'IN';

  /** Tipos de movimiento del ajuste rapido, resueltos al cargar. */
  inMovementTypeId: number | null = null;
  outMovementTypeId: number | null = null;

  /** Solo la primera carga: es la unica que puede dejar la pantalla vacia. */
  loading = false;

  /** Recarga posterior a una accion: la cuadricula sigue en pantalla. */
  refreshing = false;
  errorMessage = '';
  infoMessage = '';
  viewMode: ItemViewMode = 'cards';
  showDeletedItems = false;

  items: ItemI[] = [];
  deletedItems: ItemI[] = [];
  filteredItems: ItemI[] = [];
  groupedItems: ItemCatalogGroup[] = [];

  itemTypes: MasterDataI[] = [];
  unitMeasures: MasterDataI[] = [];
  typeTabs: ItemTypeTab[] = [];

  search = '';
  statusFilter: ItemStatusFilter = 'ALL';
  stockFilter: ItemStockFilter = 'ALL';
  purposeFilter: ItemPurposeFilter = 'ALL';
  selectedTypeFilter = 'ALL';

  showCreateDrawer = false;
  selectedItem: ItemI | null = null;

  hotelSettingsId: number | null = null;

  readonly statusOptions: Array<{ value: ItemStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'Solo activos' },
    { value: 'INACTIVE', label: 'Solo inactivos' }
  ];

  readonly stockOptions: Array<{ value: ItemStockFilter; label: string }> = [
    { value: 'ALL', label: 'Todo el stock' },
    { value: 'LOW', label: 'Bajo minimo' },
    { value: 'HEALTHY', label: 'Saludable' }
  ];

  readonly purposeOptions: Array<{ value: ItemPurposeFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ROOM', label: 'Habitacion' },
    { value: 'RECEPTION', label: 'Recepcion' }
  ];

  private itemTypeMap = new Map<number, MasterDataI>();
  private typeOrderMap = new Map<string, number>();
  private featuredByGroup = new Map<string, Set<number>>();

  constructor(
    private itemsService: ItemsService,
    private movementsService: InventoryMovementsService,
    private masterDataService: MasterDataService,
    private hotelSettingsService: HotelSettingsService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalItems(): number {
    return this.items.length;
  }

  get deletedItemsCount(): number {
    return this.deletedItems.length;
  }

  get activeItems(): number {
    return this.items.filter((item) => item.is_active).length;
  }

  get lowStockItems(): number {
    return this.items.filter((item) => this.isLowStock(item)).length;
  }

  get outOfStockItems(): number {
    return this.items.filter((item) => this.toNonNegativeInt(item.stock) <= 0).length;
  }

  get totalStockUnits(): number {
    return this.items.reduce((sum, item) => sum + this.toNonNegativeInt(item.stock), 0);
  }

  get inventoryCostValueLabel(): string {
    const total = this.items.reduce(
      (sum, item) => sum + this.toNonNegativeInt(item.stock) * this.toNumber(item.cost_price),
      0
    );
    return this.formatCurrency(total);
  }

  get canCreateItem(): boolean {
    return !!this.hotelSettingsId && this.itemTypes.length > 0 && this.unitMeasures.length > 0;
  }

  loadCatalogData(options: { silent?: boolean; force?: boolean } = {}): void {
    // Una recarga silenciosa no toca `loading`, asi que la cuadricula no se desmonta
    // y la pantalla no parpadea con cada accion.
    if (options.silent) this.refreshing = true;
    else this.loading = true;
    this.errorMessage = '';
    const selectedItemId = this.selectedItem?.id ?? null;

    forkJoin({
      // `null` marca el fallo. Devolver `[]` fabricaria un exito vacio, y la vista
      // sacaria conclusiones de una lista que nunca llego: con la respuesta caida por un
      // 429 pasaba a decir que los 37 items estaban eliminados.
      items: this.itemsService
        .listItems({ include_inactive: true, forceRefresh: options.force })
        .pipe(catchError(() => of(null))),
      // La papelera solo cambia al eliminar o restaurar: en una recarga silenciosa no
      // hace falta volver a pedirla.
      allItems: options.silent
        ? of(null)
        : this.itemsService
            .listItems({ include_inactive: true, include_deleted: true })
            .pipe(catchError(() => of(null))),
      itemTypes: this.masterDataService
        .listMasterData({ group: 'ITEM_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      unitMeasures: this.masterDataService
        .listMasterData({ group: 'UNIT_MEASURE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      // Los tipos de movimiento son lo que permite el ajuste rapido desde la tarjeta.
      movementTypes: this.masterDataService
        .listMasterData({
          group: 'INVENTORY_MOVEMENT_TYPE',
          is_active: 'true',
          ordering: 'sort_order,name'
        })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ items, allItems, itemTypes, unitMeasures, movementTypes, settings }) => {
        this.loading = false;
        this.refreshing = false;

        // Si el listado no llego, se conserva el que ya estaba: mejor un dato de hace
        // unos segundos que una pantalla vacia que parece perdida de informacion.
        if (items === null) {
          this.errorMessage = 'No fue posible actualizar los items. Se muestra la ultima version cargada.';
          return;
        }

        this.errorMessage = '';
        this.items = items;

        if (allItems !== null) {
          const visibleIds = new Set(items.map((item) => item.id));
          this.deletedItems = allItems.filter((item) => !visibleIds.has(item.id));
        }

        this.itemTypes = itemTypes;
        this.unitMeasures = unitMeasures;
        this.inMovementTypeId = this.findMovementTypeId(movementTypes, 'IN');
        this.outMovementTypeId = this.findMovementTypeId(movementTypes, 'OUT');

        if (selectedItemId) {
          this.selectedItem = items.find((item) => item.id === selectedItemId) || null;
        }

        this.buildTypeMaps();
        this.hotelSettingsId = this.resolveHotelSettingsId(settings, this.items, this.hotelSettingsId);
        this.typeTabs = this.buildTypeTabs(this.items);
        this.applyFilters();

        if (!this.hotelSettingsId) {
          this.infoMessage = 'No se encontro una configuracion activa de hotel. Podras ver items, pero no crear nuevos.';
        } else if (!this.itemTypes.length) {
          this.infoMessage = 'No hay tipos de item activos en master data.';
        } else if (!this.unitMeasures.length) {
          this.infoMessage = 'No hay unidades de medida activas en master data.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.refreshing = false;
        this.errorMessage = 'No fue posible cargar el catalogo de items.';
      }
    });
  }

  /**
   * Recarga tras una accion, o a peticion del boton "Actualizar".
   *
   * `force` **solo** para el boton: una escritura ya invalido el cache desde el servicio,
   * asi que la recarga posterior va al servidor igual. Forzarla ademas anula la
   * deduplicacion de peticiones en vuelo del `ResourceCache`, y entonces esta lista y su
   * contenedor piden lo mismo dos veces. Con unos pocos clics seguidos eso agotaba el
   * limite de peticiones por minuto y la API respondia 429.
   */
  refreshItems(force = false): void {
    this.changed.emit();
    this.loadCatalogData({ silent: true, force });
  }

  exportCsv(): void {
    if (!this.filteredItems.length) return;

    const headers = [
      'nombre',
      'sku',
      'tipo',
      'uso',
      'unidad',
      'stock',
      'stock_minimo',
      'stock_maximo',
      'costo_unitario',
      'precio_venta',
      'estado'
    ];

    const rows = this.filteredItems.map((item) => {
      const row = [
        item.name || '',
        item.sku || '',
        this.getItemTypeLabel(item),
        this.getItemPurposeLabel(item),
        this.getUnitLabel(item),
        this.toNonNegativeInt(item.stock),
        this.toNonNegativeInt(item.minimum_stock),
        this.toNonNegativeInt(item.maximum_stock),
        this.toNumber(item.cost_price),
        this.toNumber(item.sale_price),
        item.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `items-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredItems = this.items.filter((item) => {
      // Seguimiento desde otra pestaña: acota sin tocar los filtros del usuario.
      if (this.trackedItemId !== null && item.id !== this.trackedItemId) return false;

      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && item.is_active) ||
        (this.statusFilter === 'INACTIVE' && !item.is_active);

      const typeMatch = this.selectedTypeFilter === 'ALL' || this.getItemTypeKey(item) === this.selectedTypeFilter;
      const purposeMatch = this.purposeFilter === 'ALL' || item.item_purpose === this.purposeFilter;

      const stockMatch =
        this.stockFilter === 'ALL' ||
        (this.stockFilter === 'LOW' && this.isLowStock(item)) ||
        (this.stockFilter === 'HEALTHY' && !this.isLowStock(item));

      const searchPool = [
        item.name,
        item.sku || '',
        item.description || '',
        this.getItemTypeLabel(item),
        item.item_type_code || '',
        this.getUnitLabel(item),
        item.unit_measure_code || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && typeMatch && purposeMatch && stockMatch && searchMatch;
    });

    this.groupedItems = this.buildGroups(this.filteredItems);
  }

  selectTypeFilter(tabKey: string): void {
    this.selectedTypeFilter = tabKey;
    this.applyFilters();
  }

  setViewMode(mode: ItemViewMode): void {
    this.viewMode = mode;
  }

  openCreateDrawer(): void {
    this.selectedItem = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onItemCreated(): void {
    this.showCreateDrawer = false;
    this.refreshItems();
  }

  openDetail(item: ItemI): void {
    this.showCreateDrawer = false;
    this.selectedItem = item;
  }

  /**
   * Ajuste rapido desde la tarjeta.
   *
   * Recibir tres unidades o dar una de baja no merece abrir el formulario de
   * movimiento: es lo que mas se hace en el dia y debe costar un clic. El asiento se
   * registra igual --entrada o salida, con su rastro-- porque atajo no significa
   * saltarse la bitacora.
   */
  quickAdjust(item: ItemI, delta: number): void {
    if (!delta || this.quickAdjustingId !== null) return;

    const quantity = Math.abs(delta);
    // Una salida no puede llevarse mas de lo que hay: el backend tambien lo valida,
    // pero avisar aqui evita el viaje y el mensaje generico.
    if (delta < 0 && quantity > this.getStockCount(item)) {
      this.errorMessage = `No hay suficientes existencias de ${item.name} para descontar ${quantity}.`;
      return;
    }

    const movementType = delta > 0 ? this.inMovementTypeId : this.outMovementTypeId;
    if (!movementType) {
      this.errorMessage = 'No hay tipos de movimiento configurados para ajustar el stock.';
      return;
    }

    this.errorMessage = '';
    this.quickAdjustingId = item.id;

    this.movementsService
      .createInventoryMovement({
        item: item.id,
        movement_type: movementType,
        quantity,
        notes: delta > 0 ? 'Ajuste rapido: entrada' : 'Ajuste rapido: salida',
        is_active: true
      })
      .subscribe({
        next: (movement) => {
          this.quickAdjustingId = null;
          // Se pinta al instante con el stock que devolvio el asiento.
          item.stock = movement?.new_stock ?? this.getStockCount(item) + delta;
          this.applyFilters();
          this.scheduleRefresh();
        },
        error: () => {
          this.quickAdjustingId = null;
          this.errorMessage = `No fue posible ajustar el stock de ${item.name}.`;
        }
      });
  }

  private findMovementTypeId(types: MasterDataI[], code: string): number | null {
    const match = types.find((type) => this.normalizeCode(type.code || '') === code);
    return match ? Number(match.id) : null;
  }

  /** Sin tipos de movimiento no hay ajuste rapido: se esconden los botones. */
  get canQuickAdjust(): boolean {
    return this.inMovementTypeId !== null && this.outMovementTypeId !== null;
  }

  /**
   * Agrupa las recargas de una racha de ajustes rapidos.
   *
   * La tarjeta ya se pinto con el stock que devolvio el asiento, asi que la recarga
   * solo sirve para poner al dia las metricas del contenedor. Lanzarla en cada clic
   * multiplicaba las peticiones sin que el usuario viera nada nuevo: veinte clics
   * seguidos agotaban el limite por minuto y la API respondia 429.
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshItems();
    }, 700);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
  }

  isQuickAdjusting(item: ItemI): boolean {
    return this.quickAdjustingId === item.id;
  }

  /**
   * Entrada o salida de una cantidad cualquiera.
   *
   * Los botones fijos resuelven la unidad suelta; para el resto se abre un modal con
   * una sola cifra y la consecuencia a la vista, que es mas seguro que pulsar `+5`
   * cuatro veces y esperar haber contado bien.
   */
  openStockMove(item: ItemI, direction: StockMoveDirection): void {
    this.movingDirection = direction;
    this.movingItem = item;
  }

  closeStockMove(): void {
    this.movingItem = null;
  }

  onStockMoveRegistered(movement: InventoryMovementI): void {
    const item = this.movingItem;
    this.movingItem = null;
    if (item && typeof movement?.new_stock === 'number') {
      // Se pinta al instante con el stock que devolvio el asiento.
      item.stock = movement.new_stock;
      this.applyFilters();
    }
    this.refreshItems();
  }

  get movingMovementTypeId(): number | null {
    return this.movingDirection === 'IN' ? this.inMovementTypeId : this.outMovementTypeId;
  }

  /** Salta a los movimientos de este item: la bitacora de por que su stock es el que es. */
  showItemMovements(item: ItemI): void {
    this.followItem.emit({ item: { id: item.id, name: item.name }, tab: 'movements' });
  }

  /** Salta a las habitaciones que tienen asignado este item. */
  showItemRooms(item: ItemI): void {
    this.followItem.emit({ item: { id: item.id, name: item.name }, tab: 'rooms' });
  }

  closeDetail(): void {
    this.selectedItem = null;
  }

  toggleItemStatus(item: ItemI): void {
    this.errorMessage = '';
    this.itemsService.updateItem(item.id, { is_active: !item.is_active }).subscribe({
      next: () => {
        this.refreshItems();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar el estado del item.';
      }
    });
  }

  confirmDelete(item: ItemI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: item.name || 'item',
      onAccept: () => {
        this.errorMessage = '';
        this.itemsService.deleteItem(item.id).subscribe({
          next: () => {
            if (this.selectedItem?.id === item.id) {
              this.closeDetail();
            }
            this.refreshItems();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar el item seleccionado.';
          }
        });
      }
    });
  }

  restoreItem(item: ItemI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: item.name || 'item',
      onAccept: () => {
        this.errorMessage = '';
        this.itemsService.restoreItem(item.id).subscribe({
          next: () => {
            this.refreshItems();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el item seleccionado.';
          }
        });
      }
    });
  }

  getItemTypeLabel(item: ItemI): string {
    const itemType = this.getTypeByItem(item);
    if (itemType?.name) return itemType.name;
    if (item.item_type_name) return item.item_type_name;
    if (item.item_type_code) return item.item_type_code;
    return 'Sin tipo';
  }

  getItemPurposeLabel(item: ItemI): string {
    return item.item_purpose === 'ROOM' ? 'Habitacion' : 'Recepcion';
  }

  getItemPurposeIcon(item: ItemI): string {
    return item.item_purpose === 'ROOM' ? 'fa-solid fa-bed' : 'fa-solid fa-bell-concierge';
  }

  getItemPurposeTone(item: ItemI): { bg: string; color: string; dot: string } {
    if (item.item_purpose === 'ROOM') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-strong-alt)',
        dot: 'var(--gh-status-info-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-orange-bg)',
      color: 'var(--gh-status-orange-text)',
      dot: 'var(--gh-status-orange-strong)'
    };
  }

  getUnitLabel(item: ItemI): string {
    if (item.unit_measure_name) return item.unit_measure_name;
    if (item.unit_measure_code) return item.unit_measure_code;
    return 'unidad';
  }

  getItemDescription(item: ItemI): string {
    const description = item.description?.trim();
    if (description) return description;
    return 'Item sin descripcion operativa.';
  }

  getItemCode(item: ItemI): string {
    const sku = item.sku?.trim();
    if (sku) return sku.toUpperCase();
    return `ITM-${String(item.id).padStart(3, '0')}`;
  }

  getItemLocationLabel(item: ItemI): string {
    return item.hotel_name || 'Almacen principal';
  }

  getUnitShortLabel(item: ItemI): string {
    const code = item.unit_measure_code?.trim();
    if (code) return code;

    const name = item.unit_measure_name?.trim();
    if (!name) return 'Und';

    return name.length > 4 ? name.slice(0, 4) : name;
  }

  getSkuLabel(item: ItemI): string {
    const sku = item.sku?.trim();
    return sku || 'Sin SKU';
  }

  getCostPriceLabel(item: ItemI): string {
    return this.formatCurrency(this.toNumber(item.cost_price));
  }

  getSalePriceLabel(item: ItemI): string {
    return this.formatCurrency(this.toNumber(item.sale_price));
  }

  getMarginLabel(item: ItemI): string {
    const margin = this.toNumber(item.sale_price) - this.toNumber(item.cost_price);
    return this.formatCurrency(margin);
  }

  getStockLabel(item: ItemI): string {
    return `${this.toNonNegativeInt(item.stock)} ${this.getUnitLabel(item)}`;
  }

  getMinimumStockLabel(item: ItemI): string {
    return `${this.toNonNegativeInt(item.minimum_stock)} ${this.getUnitLabel(item)}`;
  }

  getMaximumStockLabel(item: ItemI): string {
    const maximum = this.toNonNegativeInt(item.maximum_stock);
    if (maximum <= 0) return 'Sin tope';
    return `${maximum} ${this.getUnitLabel(item)}`;
  }

  getStockStateLabel(item: ItemI): string {
    if (this.toNonNegativeInt(item.stock) <= 0) return 'Sin stock';
    if (this.isLowStock(item)) return 'Bajo minimo';
    return 'Saludable';
  }

  getStockStateTone(item: ItemI): { bg: string; color: string; dot: string } {
    if (this.toNonNegativeInt(item.stock) <= 0) {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        dot: 'var(--gh-status-danger-strong)'
      };
    }
    if (this.isLowStock(item)) {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)',
        dot: 'var(--gh-status-orange-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      dot: 'var(--gh-status-success-strong)'
    };
  }

  getStockCount(item: ItemI): number {
    return this.toNonNegativeInt(item.stock);
  }

  getTargetStock(item: ItemI): number {
    const maximum = this.toNonNegativeInt(item.maximum_stock);
    if (maximum > 0) return maximum;

    const stock = this.toNonNegativeInt(item.stock);
    const minimum = this.toNonNegativeInt(item.minimum_stock);

    if (minimum <= 0) return Math.max(stock, 1);
    return Math.max(minimum * 4, stock, 1);
  }

  getMinMaxLabel(item: ItemI): string {
    const minimum = this.toNonNegativeInt(item.minimum_stock);
    const maximum = this.toNonNegativeInt(item.maximum_stock);
    return `${minimum} / ${maximum > 0 ? maximum : 'Sin tope'}`;
  }

  getStockProgressPercent(item: ItemI): number {
    const stock = this.toNonNegativeInt(item.stock);
    const target = this.getTargetStock(item);
    const progress = (stock / target) * 100;
    return Math.max(0, Math.min(100, progress));
  }

  /**
   * Donde cae el minimo en la barra.
   *
   * Es la referencia contra la que se compara el relleno: sin la marca, la barra solo
   * diria "hay algo", no "hay poco".
   */
  getMinimumMarkPercent(item: ItemI): number {
    const minimum = this.toNonNegativeInt(item.minimum_stock);
    if (minimum <= 0) return 0;

    const percent = (minimum / this.getTargetStock(item)) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  getStockBarColor(item: ItemI): string {
    const state = this.resolveInventoryState(item);
    if (state === 'OUT') return 'var(--gh-status-danger-strong)';
    if (state === 'LOW') return 'var(--gh-status-warn-strong)';
    if (state === 'EXCESS') return 'var(--gh-status-info-strong)';
    if (state === 'INACTIVE') return 'var(--gh-text-soft)';
    return 'var(--gh-status-success-strong)';
  }

  getTableStatusLabel(item: ItemI): string {
    const state = this.resolveInventoryState(item);
    if (state === 'OUT') return 'Sin stock';
    if (state === 'LOW') return 'Bajo stock';
    if (state === 'EXCESS') return 'Exceso';
    if (state === 'INACTIVE') return 'Inactivo';
    return 'Normal';
  }

  getTableStatusTone(item: ItemI): { bg: string; color: string; icon: string } {
    const state = this.resolveInventoryState(item);

    if (state === 'OUT') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        icon: 'fa-regular fa-circle-xmark'
      };
    }

    if (state === 'LOW') {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)',
        icon: 'fa-solid fa-triangle-exclamation'
      };
    }

    if (state === 'EXCESS') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-strong-alt)',
        icon: 'fa-solid fa-chart-line'
      };
    }

    if (state === 'INACTIVE') {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        icon: 'fa-regular fa-circle-pause'
      };
    }

    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      icon: 'fa-regular fa-circle-check'
    };
  }

  getTotalStockValueLabel(item: ItemI): string {
    const stock = this.toNonNegativeInt(item.stock);
    const cost = this.toNumber(item.cost_price);
    return this.formatCurrency(stock * cost);
  }

  getTypeBadgeTone(item: ItemI): { bg: string; color: string; dot: string } {
    const tone = this.resolveTone(this.getItemTypeCode(item));
    return {
      bg: tone.badgeBg,
      color: tone.badgeColor,
      dot: tone.accent
    };
  }

  getStatusTone(item: ItemI): { bg: string; color: string; dot: string } {
    if (item.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  getGroupTone(group: ItemCatalogGroup): ItemCategoryTone {
    return group.tone;
  }

  isHighlighted(groupKey: string, itemId: number): boolean {
    return this.featuredByGroup.get(groupKey)?.has(itemId) || false;
  }

  trackByItem(_: number, item: ItemI): number {
    return item.id;
  }

  trackByGroup(_: number, group: ItemCatalogGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: ItemTypeTab): string {
    return tab.key;
  }

  private buildTypeMaps(): void {
    this.itemTypeMap = new Map(this.itemTypes.map((itemType) => [itemType.id, itemType]));

    this.typeOrderMap.clear();
    for (const itemType of this.itemTypes) {
      const key = this.getTypeKeyFromType(itemType);
      this.typeOrderMap.set(key, Number(itemType.sort_order || 0));
    }
  }

  private buildTypeTabs(items: ItemI[]): ItemTypeTab[] {
    const groups = this.buildGroups(items, false);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: items.length,
        tone: CATEGORY_TONES['DEFAULT']
      },
      ...groups.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.items.length,
        tone: group.tone
      }))
    ];
  }

  private buildGroups(items: ItemI[], updateHighlights = true): ItemCatalogGroup[] {
    const mapGroups = new Map<string, ItemCatalogGroup>();

    for (const item of items) {
      const key = this.getItemTypeKey(item);
      const label = this.getItemTypeLabel(item);
      const code = this.getItemTypeCode(item);
      const tone = this.resolveTone(code);

      if (!mapGroups.has(key)) {
        mapGroups.set(key, {
          key,
          label,
          code,
          tone,
          order: this.resolveTypeOrder(item, key),
          items: []
        });
      }

      mapGroups.get(key)?.items.push(item);
    }

    const groups = Array.from(mapGroups.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    if (updateHighlights) {
      this.featuredByGroup.clear();
      for (const group of groups) {
        const sortedByStock = [...group.items].sort((a, b) => this.toNonNegativeInt(b.stock) - this.toNonNegativeInt(a.stock));
        const featuredCount = sortedByStock.length >= 4 ? 2 : sortedByStock.length ? 1 : 0;
        this.featuredByGroup.set(group.key, new Set(sortedByStock.slice(0, featuredCount).map((item) => item.id)));
      }
    }

    return groups;
  }

  private resolveTypeOrder(item: ItemI, typeKey: string): number {
    const fromMap = this.typeOrderMap.get(typeKey);
    if (typeof fromMap === 'number') return fromMap;

    const fallbackType = this.getTypeByItem(item);
    if (fallbackType && typeof fallbackType.sort_order === 'number') {
      return fallbackType.sort_order;
    }

    return 999;
  }

  private getTypeByItem(item: ItemI): MasterDataI | null {
    if (typeof item.item_type !== 'number') return null;
    return this.itemTypeMap.get(item.item_type) || null;
  }

  private getTypeKeyFromType(itemType: MasterDataI): string {
    return `id:${itemType.id}`;
  }

  private getItemTypeKey(item: ItemI): string {
    if (typeof item.item_type === 'number') return `id:${item.item_type}`;

    const code = this.getItemTypeCode(item);
    if (code) return `code:${code}`;

    return 'untyped';
  }

  private getItemTypeCode(item: ItemI): string {
    const itemType = this.getTypeByItem(item);
    const rawCode = itemType?.code || item.item_type_code || this.getItemTypeLabel(item);
    return this.normalizeCode(rawCode);
  }

  private resolveTone(code: string): ItemCategoryTone {
    if (code.includes('MINIBAR')) return CATEGORY_TONES['MINIBAR'];

    if (code.includes('LIMPIEZA') || code.includes('ASEO') || code.includes('CLEAN') || code.includes('LAVAND')) {
      return CATEGORY_TONES['CLEANING'];
    }

    if (code.includes('AMENIT') || code.includes('AMENI') || code.includes('HIGIENE')) {
      return CATEGORY_TONES['AMENITY'];
    }

    if (code.includes('LINEN') || code.includes('ROPA') || code.includes('TOALLA')) {
      return CATEGORY_TONES['LINEN'];
    }

    if (code.includes('ALIMENT') || code.includes('COMIDA') || code.includes('FOOD') || code.includes('SNACK')) {
      return CATEGORY_TONES['FOOD'];
    }

    if (code.includes('BEBIDA') || code.includes('DRINK') || code.includes('BAR') || code.includes('LICOR')) {
      return CATEGORY_TONES['BEVERAGE'];
    }

    return CATEGORY_TONES['DEFAULT'];
  }

  private resolveHotelSettingsId(
    settings: { id?: number } | null,
    items: ItemI[],
    current: number | null
  ): number | null {
    const fromSettings = Number(settings?.id || 0);
    if (fromSettings > 0) return fromSettings;

    if (typeof current === 'number' && current > 0) return current;

    const fromItems = items.find((item) => Number(item.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromItems === 'number' && fromItems > 0) return fromItems;

    return null;
  }

  private isLowStock(item: ItemI): boolean {
    const stock = this.toNonNegativeInt(item.stock);
    const minimum = this.toNonNegativeInt(item.minimum_stock);
    return stock <= minimum;
  }

  private resolveInventoryState(item: ItemI): 'INACTIVE' | 'OUT' | 'LOW' | 'EXCESS' | 'NORMAL' {
    if (!item.is_active) return 'INACTIVE';

    const stock = this.toNonNegativeInt(item.stock);
    const minimum = this.toNonNegativeInt(item.minimum_stock);
    const maximum = this.toNonNegativeInt(item.maximum_stock);
    const target = this.getTargetStock(item);

    if (stock <= 0) return 'OUT';
    if (stock <= minimum) return 'LOW';
    if (maximum > 0 && stock > maximum) return 'EXCESS';
    if (maximum <= 0 && stock >= target) return 'EXCESS';
    return 'NORMAL';
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private toNumber(value: string | number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private toNonNegativeInt(value: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizeSearch(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private formatFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private escapeCsvCell(value: unknown): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
