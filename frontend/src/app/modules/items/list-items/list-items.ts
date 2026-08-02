import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { ItemsService } from '../../../services/item';
import { MasterDataService } from '../../../services/master-data.service';
import { CreateItem } from '../create-item/create-item';
import { DetailItem } from '../detail-item/detail-item';
import { ItemI } from '../item-model';

type ItemStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ItemStockFilter = 'ALL' | 'LOW' | 'HEALTHY';
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
  imports: [CommonModule, FormsModule, CreateItem, DetailItem],
  templateUrl: './list-items.html',
  styleUrls: ['./list-items.css']
})
export class ListItems implements OnInit {
  loading = false;
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

  private itemTypeMap = new Map<number, MasterDataI>();
  private typeOrderMap = new Map<string, number>();
  private featuredByGroup = new Map<string, Set<number>>();

  constructor(
    private itemsService: ItemsService,
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

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedItemId = this.selectedItem?.id ?? null;

    forkJoin({
      items: this.itemsService.listItems({ include_inactive: true }).pipe(catchError(() => of([] as ItemI[]))),
      allItems: this.itemsService
        .listItems({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as ItemI[]))),
      itemTypes: this.masterDataService
        .listMasterData({ group: 'ITEM_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      unitMeasures: this.masterDataService
        .listMasterData({ group: 'UNIT_MEASURE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ items, allItems, itemTypes, unitMeasures, settings }) => {
        this.loading = false;
        this.items = items;
        const visibleIds = new Set(items.map((item) => item.id));
        this.deletedItems = allItems.filter((item) => !visibleIds.has(item.id));
        this.itemTypes = itemTypes;
        this.unitMeasures = unitMeasures;

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
        this.errorMessage = 'No fue posible cargar el catalogo de items.';
      }
    });
  }

  refreshItems(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredItems.length) return;

    const headers = [
      'nombre',
      'sku',
      'tipo',
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
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && item.is_active) ||
        (this.statusFilter === 'INACTIVE' && !item.is_active);

      const typeMatch = this.selectedTypeFilter === 'ALL' || this.getItemTypeKey(item) === this.selectedTypeFilter;

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
      return statusMatch && typeMatch && stockMatch && searchMatch;
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
