import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { ItemsService } from '../../../services/item';
import { MasterDataService } from '../../../services/master-data.service';
import { CreateInventoryMovement } from '../create-inventory-movement/create-inventory-movement';
import { DetailInventoryMovement } from '../detail-inventory-movement/detail-inventory-movement';
import { InventoryMovementI } from '../inventory-movement-model';
import { ItemI } from '../../items/item-model';

type MovementStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type MovementDirectionFilter = 'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER' | 'OTHER';
type MovementViewMode = 'cards' | 'table';

type MovementTypeTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type MovementGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: MovementTypeTone;
  items: InventoryMovementI[];
};

type MovementTypeTab = {
  key: string;
  label: string;
  count: number;
  tone: MovementTypeTone;
};

const MOVEMENT_TONES: Record<string, MovementTypeTone> = {
  IN: {
    icon: 'fa-solid fa-arrow-trend-up',
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    cover: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    accent: '#22c55e'
  },
  OUT: {
    icon: 'fa-solid fa-arrow-trend-down',
    iconBg: '#fef2f2',
    iconColor: '#b42318',
    cover: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
    badgeBg: '#fee2e2',
    badgeColor: '#b42318',
    accent: '#ef4444'
  },
  LOSS: {
    icon: 'fa-solid fa-triangle-exclamation',
    iconBg: '#fff7ed',
    iconColor: '#c2410c',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: '#ffedd5',
    badgeColor: '#c2410c',
    accent: '#f97316'
  },
  ADJUSTMENT: {
    icon: 'fa-solid fa-sliders',
    iconBg: '#e0f2fe',
    iconColor: '#0369a1',
    cover: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    accent: '#0ea5e9'
  },
  TRANSFER: {
    icon: 'fa-solid fa-right-left',
    iconBg: '#f3e8ff',
    iconColor: '#7e22ce',
    cover: 'linear-gradient(135deg, #4c1d95 0%, #a855f7 100%)',
    badgeBg: '#f3e8ff',
    badgeColor: '#7e22ce',
    accent: '#a855f7'
  },
  DEFAULT: {
    icon: 'fa-solid fa-boxes-stacked',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: '#e6edf7',
    badgeColor: '#1f3f73',
    accent: '#335f9d'
  }
};

@Component({
  selector: 'app-list-inventory-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateInventoryMovement, DetailInventoryMovement],
  templateUrl: './list-inventory-movements.html',
  styleUrls: ['./list-inventory-movements.css']
})
export class ListInventoryMovements implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  viewMode: MovementViewMode = 'cards';
  showDeletedMovements = false;

  movements: InventoryMovementI[] = [];
  deletedMovements: InventoryMovementI[] = [];
  filteredMovements: InventoryMovementI[] = [];
  groupedMovements: MovementGroup[] = [];
  movementTypes: MasterDataI[] = [];
  items: ItemI[] = [];
  typeTabs: MovementTypeTab[] = [];

  search = '';
  statusFilter: MovementStatusFilter = 'ALL';
  directionFilter: MovementDirectionFilter = 'ALL';
  selectedTypeFilter = 'ALL';

  showCreateDrawer = false;
  selectedMovement: InventoryMovementI | null = null;

  readonly statusOptions: Array<{ value: MovementStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'Solo activos' },
    { value: 'INACTIVE', label: 'Solo inactivos' }
  ];

  readonly directionOptions: Array<{ value: MovementDirectionFilter; label: string }> = [
    { value: 'ALL', label: 'Todas las direcciones' },
    { value: 'IN', label: 'Entradas' },
    { value: 'OUT', label: 'Salidas / Perdidas' },
    { value: 'ADJUSTMENT', label: 'Ajustes' },
    { value: 'TRANSFER', label: 'Transferencias' },
    { value: 'OTHER', label: 'Otros' }
  ];

  private movementTypeMap = new Map<number, MasterDataI>();
  private typeOrderMap = new Map<string, number>();
  private highlightedByGroup = new Map<string, Set<number>>();

  constructor(
    private inventoryMovementsService: InventoryMovementsService,
    private masterDataService: MasterDataService,
    private itemsService: ItemsService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalMovements(): number {
    return this.movements.length;
  }

  get deletedMovementsCount(): number {
    return this.deletedMovements.length;
  }

  get incomingMovements(): number {
    return this.movements.filter((movement) => this.resolveDirection(movement) === 'IN').length;
  }

  get outgoingMovements(): number {
    return this.movements.filter((movement) => this.resolveDirection(movement) === 'OUT').length;
  }

  get adjustmentMovements(): number {
    return this.movements.filter((movement) => {
      const direction = this.resolveDirection(movement);
      return direction === 'ADJUSTMENT' || direction === 'TRANSFER';
    }).length;
  }

  get movedUnits(): number {
    return this.movements.reduce((sum, movement) => sum + this.toPositiveInt(movement.quantity), 0);
  }

  get netVariationLabel(): string {
    const total = this.movements.reduce(
      (sum, movement) => sum + (this.toNonNegativeInt(movement.new_stock) - this.toNonNegativeInt(movement.previous_stock)),
      0
    );

    if (total > 0) return `+${total} unid`;
    return `${total} unid`;
  }

  get canCreateMovement(): boolean {
    return this.items.some((item) => item.is_active) && this.movementTypes.length > 0;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedMovementId = this.selectedMovement?.id ?? null;

    forkJoin({
      movements: this.inventoryMovementsService
        .listInventoryMovements({ include_inactive: true })
        .pipe(catchError(() => of([] as InventoryMovementI[]))),
      allMovements: this.inventoryMovementsService
        .listInventoryMovements({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as InventoryMovementI[]))),
      movementTypes: this.masterDataService
        .listMasterData({ group: 'INVENTORY_MOVEMENT_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      items: this.itemsService.listItems().pipe(catchError(() => of([] as ItemI[])))
    }).subscribe({
      next: ({ movements, allMovements, movementTypes, items }) => {
        this.loading = false;
        this.movements = movements;
        const visibleIds = new Set(movements.map((movement) => movement.id));
        this.deletedMovements = allMovements.filter((movement) => !visibleIds.has(movement.id));
        this.movementTypes = movementTypes;
        this.items = items;

        if (selectedMovementId) {
          this.selectedMovement = movements.find((movement) => movement.id === selectedMovementId) || null;
        }

        this.buildTypeMaps();
        this.typeTabs = this.buildTypeTabs(this.movements);
        this.applyFilters();

        if (!this.items.some((item) => item.is_active)) {
          this.infoMessage = 'No hay items activos para registrar movimientos.';
        } else if (!this.movementTypes.length) {
          this.infoMessage = 'No hay tipos de movimiento activos en master data.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar los movimientos de inventario.';
      }
    });
  }

  refreshMovements(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredMovements.length) return;

    const headers = [
      'codigo',
      'item',
      'tipo_movimiento',
      'direccion',
      'cantidad',
      'stock_previo',
      'stock_nuevo',
      'variacion',
      'referencia',
      'fecha_movimiento',
      'estado'
    ];

    const rows = this.filteredMovements.map((movement) => {
      const row = [
        this.getMovementCode(movement),
        this.getItemLabel(movement),
        this.getMovementTypeLabel(movement),
        this.getMovementDirectionLabel(movement),
        this.toPositiveInt(movement.quantity),
        this.toNonNegativeInt(movement.previous_stock),
        this.toNonNegativeInt(movement.new_stock),
        this.getStockDeltaLabel(movement),
        this.getReferenceLabel(movement),
        this.getMovementDateTimeLabel(movement),
        movement.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimientos-inventario-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredMovements = this.movements.filter((movement) => {
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && movement.is_active) ||
        (this.statusFilter === 'INACTIVE' && !movement.is_active);

      const directionMatch =
        this.directionFilter === 'ALL' || this.resolveDirection(movement) === this.directionFilter;

      const typeMatch =
        this.selectedTypeFilter === 'ALL' || this.getMovementTypeKey(movement) === this.selectedTypeFilter;

      const searchPool = [
        this.getMovementCode(movement),
        this.getItemLabel(movement),
        this.getMovementTypeLabel(movement),
        movement.movement_type_code || '',
        this.getReferenceLabel(movement),
        movement.notes || '',
        this.toPositiveInt(movement.quantity)
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && directionMatch && typeMatch && searchMatch;
    });

    this.groupedMovements = this.buildGroups(this.filteredMovements);
  }

  selectTypeFilter(tabKey: string): void {
    this.selectedTypeFilter = tabKey;
    this.applyFilters();
  }

  setViewMode(mode: MovementViewMode): void {
    this.viewMode = mode;
  }

  openCreateDrawer(): void {
    this.selectedMovement = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onMovementCreated(): void {
    this.showCreateDrawer = false;
    this.refreshMovements();
  }

  openDetail(movement: InventoryMovementI): void {
    this.showCreateDrawer = false;
    this.selectedMovement = movement;
  }

  closeDetail(): void {
    this.selectedMovement = null;
  }

  toggleMovementStatus(movement: InventoryMovementI): void {
    this.errorMessage = '';
    this.inventoryMovementsService
      .updateInventoryMovement(movement.id, { is_active: !movement.is_active })
      .subscribe({
        next: () => {
          this.refreshMovements();
        },
        error: () => {
          this.errorMessage = 'No fue posible actualizar el estado del movimiento.';
        }
      });
  }

  confirmDelete(movement: InventoryMovementI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: this.getMovementCode(movement),
      onAccept: () => {
        this.errorMessage = '';
        this.inventoryMovementsService.deleteInventoryMovement(movement.id).subscribe({
          next: () => {
            if (this.selectedMovement?.id === movement.id) {
              this.closeDetail();
            }
            this.refreshMovements();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar el movimiento seleccionado.';
          }
        });
      }
    });
  }

  restoreMovement(movement: InventoryMovementI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: this.getMovementCode(movement),
      onAccept: () => {
        this.errorMessage = '';
        this.inventoryMovementsService.restoreInventoryMovement(movement.id).subscribe({
          next: () => {
            this.refreshMovements();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el movimiento seleccionado.';
          }
        });
      }
    });
  }

  getMovementTypeLabel(movement: InventoryMovementI): string {
    const movementType = this.getTypeByMovement(movement);
    if (movementType?.name) return movementType.name;
    if (movement.movement_type_name) return movement.movement_type_name;
    if (movement.movement_type_code) return movement.movement_type_code;
    return 'Sin tipo';
  }

  getItemLabel(movement: InventoryMovementI): string {
    if (movement.item_name?.trim()) return movement.item_name.trim();
    if (typeof movement.item === 'number' && movement.item > 0) return `Item #${movement.item}`;
    return 'Item no definido';
  }

  getReferenceLabel(movement: InventoryMovementI): string {
    const reference = movement.reference?.trim();
    if (reference) return reference;
    return 'Sin referencia';
  }

  getNotesLabel(movement: InventoryMovementI): string {
    const notes = movement.notes?.trim();
    if (notes) return notes;
    return 'Movimiento sin notas operativas.';
  }

  getMovementCode(movement: InventoryMovementI): string {
    return `MOV-${String(movement.id).padStart(4, '0')}`;
  }

  getMovementDirectionLabel(movement: InventoryMovementI): string {
    const direction = this.resolveDirection(movement);
    if (direction === 'IN') return 'Entrada';
    if (direction === 'OUT') return 'Salida';
    if (direction === 'ADJUSTMENT') return 'Ajuste';
    if (direction === 'TRANSFER') return 'Transferencia';
    return 'Otro';
  }

  getMovementDirectionTone(movement: InventoryMovementI): { bg: string; color: string; dot: string } {
    const direction = this.resolveDirection(movement);

    if (direction === 'IN') {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }
    if (direction === 'OUT') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        dot: 'var(--gh-status-danger-strong)'
      };
    }
    if (direction === 'ADJUSTMENT') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-strong-alt)',
        dot: 'var(--gh-status-info-strong)'
      };
    }
    if (direction === 'TRANSFER') {
      return {
        bg: 'var(--gh-status-violet-bg)',
        color: 'var(--gh-status-violet-text)',
        dot: 'var(--gh-status-violet-text)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  getQuantitySignedLabel(movement: InventoryMovementI): string {
    const quantity = this.toPositiveInt(movement.quantity);
    const direction = this.resolveDirection(movement);

    if (direction === 'IN') return `+${quantity}`;
    if (direction === 'OUT') return `-${quantity}`;
    return `${quantity}`;
  }

  getStockFlowLabel(movement: InventoryMovementI): string {
    return `${this.toNonNegativeInt(movement.previous_stock)} -> ${this.toNonNegativeInt(movement.new_stock)}`;
  }

  getStockDeltaLabel(movement: InventoryMovementI): string {
    const delta = this.toNonNegativeInt(movement.new_stock) - this.toNonNegativeInt(movement.previous_stock);
    if (delta > 0) return `+${delta}`;
    return `${delta}`;
  }

  getMovementDateLabel(movement: InventoryMovementI): string {
    return this.formatDate(movement.movement_date);
  }

  getMovementDateTimeLabel(movement: InventoryMovementI): string {
    return this.formatDateTime(movement.movement_date);
  }

  getStatusTone(movement: InventoryMovementI): { bg: string; color: string; dot: string } {
    if (movement.is_active) {
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

  getTypeBadgeTone(movement: InventoryMovementI): { bg: string; color: string; dot: string } {
    const tone = this.resolveTone(this.getMovementTypeCode(movement));
    return {
      bg: tone.badgeBg,
      color: tone.badgeColor,
      dot: tone.accent
    };
  }

  getGroupTone(group: MovementGroup): MovementTypeTone {
    return group.tone;
  }

  isHighlighted(groupKey: string, movementId: number): boolean {
    return this.highlightedByGroup.get(groupKey)?.has(movementId) || false;
  }

  trackByMovement(_: number, movement: InventoryMovementI): number {
    return movement.id;
  }

  trackByGroup(_: number, group: MovementGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: MovementTypeTab): string {
    return tab.key;
  }

  private buildTypeMaps(): void {
    this.movementTypeMap = new Map(this.movementTypes.map((movementType) => [movementType.id, movementType]));

    this.typeOrderMap.clear();
    for (const movementType of this.movementTypes) {
      const key = this.getTypeKeyFromType(movementType);
      this.typeOrderMap.set(key, Number(movementType.sort_order || 0));
    }
  }

  private buildTypeTabs(movements: InventoryMovementI[]): MovementTypeTab[] {
    const groups = this.buildGroups(movements, false);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: movements.length,
        tone: MOVEMENT_TONES['DEFAULT']
      },
      ...groups.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.items.length,
        tone: group.tone
      }))
    ];
  }

  private buildGroups(movements: InventoryMovementI[], updateHighlights = true): MovementGroup[] {
    const groupsMap = new Map<string, MovementGroup>();

    for (const movement of movements) {
      const key = this.getMovementTypeKey(movement);
      const label = this.getMovementTypeLabel(movement);
      const code = this.getMovementTypeCode(movement);
      const tone = this.resolveTone(code);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          code,
          tone,
          order: this.resolveTypeOrder(movement, key),
          items: []
        });
      }

      groupsMap.get(key)?.items.push(movement);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    if (updateHighlights) {
      this.highlightedByGroup.clear();
      for (const group of groups) {
        const sortedByImpact = [...group.items].sort(
          (a, b) => this.toPositiveInt(b.quantity) - this.toPositiveInt(a.quantity)
        );
        const featuredCount = sortedByImpact.length >= 4 ? 2 : sortedByImpact.length ? 1 : 0;
        this.highlightedByGroup.set(
          group.key,
          new Set(sortedByImpact.slice(0, featuredCount).map((movement) => movement.id))
        );
      }
    }

    return groups;
  }

  private resolveTypeOrder(movement: InventoryMovementI, typeKey: string): number {
    const fromMap = this.typeOrderMap.get(typeKey);
    if (typeof fromMap === 'number') return fromMap;

    const fallbackType = this.getTypeByMovement(movement);
    if (fallbackType && typeof fallbackType.sort_order === 'number') {
      return fallbackType.sort_order;
    }

    return 999;
  }

  private getTypeByMovement(movement: InventoryMovementI): MasterDataI | null {
    if (typeof movement.movement_type !== 'number') return null;
    return this.movementTypeMap.get(movement.movement_type) || null;
  }

  private getTypeKeyFromType(movementType: MasterDataI): string {
    return `id:${movementType.id}`;
  }

  private getMovementTypeKey(movement: InventoryMovementI): string {
    if (typeof movement.movement_type === 'number') return `id:${movement.movement_type}`;

    const code = this.getMovementTypeCode(movement);
    if (code) return `code:${code}`;

    return 'untyped';
  }

  private getMovementTypeCode(movement: InventoryMovementI): string {
    const movementType = this.getTypeByMovement(movement);
    const rawCode = movementType?.code || movement.movement_type_code || this.getMovementTypeLabel(movement);
    return this.normalizeCode(rawCode);
  }

  private resolveDirection(movement: InventoryMovementI): MovementDirectionFilter {
    const code = this.getMovementTypeCode(movement);
    if (code === 'IN') return 'IN';
    if (code === 'OUT' || code === 'LOSS') return 'OUT';
    if (code === 'ADJUSTMENT') return 'ADJUSTMENT';
    if (code === 'TRANSFER') return 'TRANSFER';
    return 'OTHER';
  }

  private resolveTone(code: string): MovementTypeTone {
    if (code === 'IN') return MOVEMENT_TONES['IN'];
    if (code === 'OUT') return MOVEMENT_TONES['OUT'];
    if (code === 'LOSS') return MOVEMENT_TONES['LOSS'];
    if (code === 'ADJUSTMENT') return MOVEMENT_TONES['ADJUSTMENT'];
    if (code === 'TRANSFER') return MOVEMENT_TONES['TRANSFER'];
    return MOVEMENT_TONES['DEFAULT'];
  }

  private formatDate(value: string | undefined): string {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatDateTime(value: string | undefined): string {
    if (!value) return 'Sin fecha';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private toPositiveInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
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
