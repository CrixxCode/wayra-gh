import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { RoomInventoryService } from '../../../services/room-inventory';
import { RoomService } from '../../../services/room';
import { ItemsService } from '../../../services/item';
import { CreateRoomInventory } from '../create-room-inventory/create-room-inventory';
import { DetailRoomInventory } from '../detail-room-inventory/detail-room-inventory';
import { RoomInventoryI } from '../room-inventory-model';
import { RoomI } from '../../rooms/room-model';
import { ItemI } from '../../items/item-model';

type RoomInventoryStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type CoverageFilter = 'ALL' | 'NORMAL' | 'LOW' | 'OUT';
type RoomInventoryViewMode = 'cards' | 'table';

type RoomInventoryTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type RoomInventoryGroup = {
  key: string;
  label: string;
  tone: RoomInventoryTone;
  items: RoomInventoryI[];
};

type RoomTab = {
  key: string;
  label: string;
  count: number;
};

const ROOM_TONES: RoomInventoryTone[] = [
  {
    icon: 'fa-solid fa-door-open',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  {
    icon: 'fa-solid fa-bed',
    iconBg: 'var(--gh-status-success-bg)',
    iconColor: 'var(--gh-status-success-text)',
    cover: 'linear-gradient(135deg, #115e59 0%, #10b981 100%)',
    badgeBg: 'var(--gh-status-success-bg)',
    badgeColor: 'var(--gh-status-success-text)',
    accent: 'var(--gh-status-success-strong)'
  },
  {
    icon: 'fa-solid fa-key',
    iconBg: 'var(--gh-status-violet-bg)',
    iconColor: 'var(--gh-status-violet-text)',
    cover: 'linear-gradient(135deg, #4c1d95 0%, #a855f7 100%)',
    badgeBg: 'var(--gh-status-violet-bg)',
    badgeColor: 'var(--gh-status-violet-text)',
    accent: 'var(--gh-status-violet-text)'
  },
  {
    icon: 'fa-solid fa-house',
    iconBg: 'var(--gh-status-orange-bg)',
    iconColor: 'var(--gh-status-orange-text)',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: 'var(--gh-status-orange-bg)',
    badgeColor: 'var(--gh-status-orange-text)',
    accent: 'var(--gh-status-orange-strong)'
  }
];

@Component({
  selector: 'app-list-room-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateRoomInventory, DetailRoomInventory],
  templateUrl: './list-room-inventory.html',
  styleUrls: ['./list-room-inventory.css']
})
export class ListRoomInventory implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  viewMode: RoomInventoryViewMode = 'cards';
  showDeletedRoomInventory = false;

  roomInventory: RoomInventoryI[] = [];
  deletedRoomInventory: RoomInventoryI[] = [];
  filteredRoomInventory: RoomInventoryI[] = [];
  groupedRoomInventory: RoomInventoryGroup[] = [];
  rooms: RoomI[] = [];
  items: ItemI[] = [];
  roomTabs: RoomTab[] = [];

  search = '';
  statusFilter: RoomInventoryStatusFilter = 'ALL';
  coverageFilter: CoverageFilter = 'ALL';
  selectedRoomFilter = 'ALL';

  showCreateDrawer = false;
  selectedRoomGroup: RoomInventoryGroup | null = null;

  readonly statusOptions: Array<{ value: RoomInventoryStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'Solo activos' },
    { value: 'INACTIVE', label: 'Solo inactivos' }
  ];

  readonly coverageOptions: Array<{ value: CoverageFilter; label: string }> = [
    { value: 'ALL', label: 'Toda cobertura' },
    { value: 'NORMAL', label: 'Cobertura normal' },
    { value: 'LOW', label: 'Bajo minimo' },
    { value: 'OUT', label: 'Sin stock' }
  ];

  private roomMap = new Map<number, RoomI>();
  private itemMap = new Map<number, ItemI>();
  constructor(
    private roomInventoryService: RoomInventoryService,
    private roomService: RoomService,
    private itemsService: ItemsService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalAssignments(): number {
    return this.roomInventory.length;
  }

  get deletedRoomInventoryCount(): number {
    return this.deletedRoomInventory.length;
  }

  get activeAssignments(): number {
    return this.roomInventory.filter((record) => record.is_active).length;
  }

  get lowCoverageAssignments(): number {
    return this.roomInventory.filter((record) => this.resolveCoverageState(record) === 'LOW').length;
  }

  get outOfStockAssignments(): number {
    return this.roomInventory.filter((record) => this.resolveCoverageState(record) === 'OUT').length;
  }

  get totalAssignedUnits(): number {
    return this.roomInventory.reduce((sum, record) => sum + this.toNonNegativeInt(record.quantity), 0);
  }

  get roomsWithInventoryCount(): number {
    const keys = new Set(this.roomInventory.map((record) => this.getRoomKey(record)));
    return keys.size;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedRoomKey = this.selectedRoomGroup?.key ?? null;

    forkJoin({
      roomInventory: this.roomInventoryService
        .listRoomInventory({ include_inactive: true })
        .pipe(catchError(() => of([] as RoomInventoryI[]))),
      allRoomInventory: this.roomInventoryService
        .listRoomInventory({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as RoomInventoryI[]))),
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      items: this.itemsService.listItems().pipe(catchError(() => of([] as ItemI[])))
    }).subscribe({
      next: ({ roomInventory, allRoomInventory, rooms, items }) => {
        this.loading = false;
        this.roomInventory = roomInventory;
        const visibleIds = new Set(roomInventory.map((record) => record.id));
        this.deletedRoomInventory = allRoomInventory.filter((record) => !visibleIds.has(record.id));
        this.rooms = rooms;
        this.items = items;

        this.roomMap = new Map(rooms.map((room) => [room.id, room]));
        this.itemMap = new Map(items.map((item) => [item.id, item]));
        this.roomTabs = this.buildRoomTabs(roomInventory);
        this.applyFilters();
        this.selectedRoomGroup = selectedRoomKey ? this.buildRoomGroupByKey(selectedRoomKey) : null;

        if (!rooms.length) {
          this.infoMessage = 'No hay habitaciones registradas para asignar inventario.';
        } else if (!items.some((item) => item.is_active)) {
          this.infoMessage = 'No hay items activos para asignar a habitaciones.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el inventario de habitaciones.';
      }
    });
  }

  refreshRoomInventory(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredRoomInventory.length) return;

    const headers = ['habitacion', 'item', 'sku', 'cantidad', 'cantidad_minima', 'cobertura', 'estado', 'notas'];
    const rows = this.filteredRoomInventory.map((record) => {
      const row = [
        this.getRoomLabel(record),
        this.getItemLabel(record),
        this.getItemSkuLabel(record),
        this.toNonNegativeInt(record.quantity),
        this.toNonNegativeInt(record.minimum_quantity),
        this.getCoverageLabel(record),
        record.is_active ? 'Activo' : 'Inactivo',
        this.getNotesLabel(record)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario-habitaciones-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredRoomInventory = this.roomInventory.filter((record) => {
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && record.is_active) ||
        (this.statusFilter === 'INACTIVE' && !record.is_active);

      const coverageMatch = this.coverageFilter === 'ALL' || this.resolveCoverageState(record) === this.coverageFilter;

      const roomMatch = this.selectedRoomFilter === 'ALL' || this.getRoomKey(record) === this.selectedRoomFilter;

      const searchPool = [
        this.getRoomLabel(record),
        this.getItemLabel(record),
        this.getItemSkuLabel(record),
        this.getItemTypeLabel(record),
        this.getNotesLabel(record),
        this.toNonNegativeInt(record.quantity),
        this.toNonNegativeInt(record.minimum_quantity)
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && coverageMatch && roomMatch && searchMatch;
    });

    this.groupedRoomInventory = this.buildGroups(this.filteredRoomInventory);
  }

  selectRoomFilter(tabKey: string): void {
    this.selectedRoomFilter = tabKey;
    this.applyFilters();
  }

  setViewMode(mode: RoomInventoryViewMode): void {
    this.viewMode = mode;
  }

  openCreateDrawer(): void {
    this.selectedRoomGroup = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onRoomInventoryCreated(): void {
    this.showCreateDrawer = false;
    this.refreshRoomInventory();
  }

  openDetail(record: RoomInventoryI): void {
    this.openRoomDetailByKey(this.getRoomKey(record));
  }

  openRoomDetail(group: RoomInventoryGroup): void {
    this.openRoomDetailByKey(group.key);
  }

  private openRoomDetailByKey(roomKey: string): void {
    this.showCreateDrawer = false;
    this.selectedRoomGroup = this.buildRoomGroupByKey(roomKey);
  }

  closeDetail(): void {
    this.selectedRoomGroup = null;
  }

  toggleRoomInventoryStatus(record: RoomInventoryI): void {
    this.errorMessage = '';
    this.roomInventoryService.updateRoomInventory(record.id, { is_active: !record.is_active }).subscribe({
      next: () => {
        this.refreshRoomInventory();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar el estado del registro.';
      }
    });
  }

  confirmDelete(record: RoomInventoryI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: this.getItemLabel(record),
      onAccept: () => {
        this.errorMessage = '';
        this.roomInventoryService.deleteRoomInventory(record.id).subscribe({
          next: () => {
            if (this.selectedRoomGroup && this.selectedRoomGroup.key === this.getRoomKey(record)) {
              this.closeDetail();
            }
            this.refreshRoomInventory();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar el registro seleccionado.';
          }
        });
      }
    });
  }

  restoreRoomInventoryRecord(record: RoomInventoryI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: this.getItemLabel(record),
      onAccept: () => {
        this.errorMessage = '';
        this.roomInventoryService.restoreRoomInventory(record.id).subscribe({
          next: () => {
            this.refreshRoomInventory();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el registro seleccionado.';
          }
        });
      }
    });
  }

  getRoomLabel(record: RoomInventoryI): string {
    if (record.room_number?.trim()) return `Habitacion ${record.room_number.trim()}`;

    if (typeof record.room === 'number' && record.room > 0) {
      const room = this.roomMap.get(record.room);
      if (room?.number?.trim()) return `Habitacion ${room.number.trim()}`;
      return `Habitacion #${record.room}`;
    }

    return 'Habitacion no definida';
  }

  getItemLabel(record: RoomInventoryI): string {
    if (record.item_name?.trim()) return record.item_name.trim();

    if (typeof record.item === 'number' && record.item > 0) {
      const item = this.itemMap.get(record.item);
      if (item?.name?.trim()) return item.name.trim();
      return `Item #${record.item}`;
    }

    return 'Item no definido';
  }

  getItemSkuLabel(record: RoomInventoryI): string {
    const fromRecord = record.item_sku?.trim();
    if (fromRecord) return fromRecord;

    if (typeof record.item === 'number') {
      const sku = this.itemMap.get(record.item)?.sku?.trim();
      if (sku) return sku;
    }

    return 'Sin SKU';
  }

  getItemTypeLabel(record: RoomInventoryI): string {
    if (typeof record.item === 'number') {
      const item = this.itemMap.get(record.item);
      if (item?.item_type_name?.trim()) return item.item_type_name.trim();
      if (item?.item_type_code?.trim()) return item.item_type_code.trim();
    }
    return 'Sin tipo';
  }

  getNotesLabel(record: RoomInventoryI): string {
    const notes = record.notes?.trim();
    if (notes) return notes;
    return 'Sin notas operativas.';
  }

  getRecordCode(record: RoomInventoryI): string {
    return `RM-${String(record.id).padStart(4, '0')}`;
  }

  getCoverageLabel(record: RoomInventoryI): string {
    const coverage = this.resolveCoverageState(record);
    if (coverage === 'OUT') return 'Sin stock';
    if (coverage === 'LOW') return 'Bajo minimo';
    return 'Cobertura normal';
  }

  getCoverageTone(record: RoomInventoryI): { bg: string; color: string; dot: string } {
    const coverage = this.resolveCoverageState(record);
    if (coverage === 'OUT') {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        dot: 'var(--gh-status-danger-strong)'
      };
    }
    if (coverage === 'LOW') {
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

  getStatusTone(record: RoomInventoryI): { bg: string; color: string; dot: string } {
    if (record.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-muted)'
    };
  }

  getStockLabel(record: RoomInventoryI): string {
    return `${this.toNonNegativeInt(record.quantity)} unid`;
  }

  getMinimumLabel(record: RoomInventoryI): string {
    return `${this.toNonNegativeInt(record.minimum_quantity)} unid`;
  }

  getStockProgressPercent(record: RoomInventoryI): number {
    const quantity = this.toNonNegativeInt(record.quantity);
    const minimum = this.toNonNegativeInt(record.minimum_quantity);
    const target = minimum > 0 ? minimum * 3 : Math.max(quantity, 1);
    const progress = (quantity / Math.max(target, 1)) * 100;
    return Math.max(0, Math.min(100, progress));
  }

  getStockBarColor(record: RoomInventoryI): string {
    const coverage = this.resolveCoverageState(record);
    if (coverage === 'OUT') return 'var(--gh-status-danger-strong)';
    if (coverage === 'LOW') return 'var(--gh-status-orange-strong)';
    return 'var(--gh-status-success-strong)';
  }

  getTypeBadgeTone(record: RoomInventoryI): { bg: string; color: string; dot: string } {
    const tone = this.resolveTypeTone(record);
    return {
      bg: tone.badgeBg,
      color: tone.badgeColor,
      dot: tone.accent
    };
  }

  getGroupTone(group: RoomInventoryGroup): RoomInventoryTone {
    return group.tone;
  }

  getRoomTotalItems(group: RoomInventoryGroup): number {
    return group.items.length;
  }

  getRoomActiveItems(group: RoomInventoryGroup): number {
    return group.items.filter((item) => item.is_active).length;
  }

  getRoomLowCoverageItems(group: RoomInventoryGroup): number {
    return group.items.filter((item) => this.resolveCoverageState(item) === 'LOW').length;
  }

  getRoomOutCoverageItems(group: RoomInventoryGroup): number {
    return group.items.filter((item) => this.resolveCoverageState(item) === 'OUT').length;
  }

  getRoomTotalUnits(group: RoomInventoryGroup): number {
    return group.items.reduce((sum, item) => sum + this.toNonNegativeInt(item.quantity), 0);
  }

  getRoomCoverageLabel(group: RoomInventoryGroup): string {
    const outCount = this.getRoomOutCoverageItems(group);
    const lowCount = this.getRoomLowCoverageItems(group);

    if (outCount > 0) return `${outCount} sin stock`;
    if (lowCount > 0) return `${lowCount} bajo minimo`;
    return 'Cobertura normal';
  }

  getRoomCoverageTone(group: RoomInventoryGroup): { bg: string; color: string } {
    const outCount = this.getRoomOutCoverageItems(group);
    const lowCount = this.getRoomLowCoverageItems(group);

    if (outCount > 0) return { bg: 'var(--gh-status-danger-bg)', color: 'var(--gh-status-danger-text)' };
    if (lowCount > 0) return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
    return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
  }

  getRoomItemsPreview(group: RoomInventoryGroup): string {
    const itemLabels = group.items
      .map((record) => this.getItemLabel(record))
      .filter((label) => !!label)
      .slice(0, 3);
    const extra = group.items.length - itemLabels.length;

    if (!itemLabels.length) return 'Sin items asignados.';
    if (extra > 0) return `${itemLabels.join(', ')} y ${extra} mas.`;
    return itemLabels.join(', ');
  }

  trackByRecord(_: number, record: RoomInventoryI): number {
    return record.id;
  }

  trackByGroup(_: number, group: RoomInventoryGroup): string {
    return group.key;
  }

  trackByRoomTab(_: number, tab: RoomTab): string {
    return tab.key;
  }

  private buildRoomTabs(records: RoomInventoryI[]): RoomTab[] {
    const counts = new Map<string, { label: string; count: number }>();

    for (const record of records) {
      const key = this.getRoomKey(record);
      const label = this.getRoomLabel(record);
      const current = counts.get(key) || { label, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }

    const tabs = Array.from(counts.entries())
      .map(([key, data]) => ({
        key,
        label: data.label,
        count: data.count
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));

    return [{ key: 'ALL', label: 'Todas las habitaciones', count: records.length }, ...tabs];
  }

  private buildGroups(records: RoomInventoryI[]): RoomInventoryGroup[] {
    const groupsMap = new Map<string, RoomInventoryGroup>();

    for (const record of records) {
      const key = this.getRoomKey(record);
      const label = this.getRoomLabel(record);
      const tone = this.resolveRoomTone(key);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          tone,
          items: []
        });
      }

      groupsMap.get(key)?.items.push(record);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'es', { numeric: true })
    );

    return groups;
  }

  private buildRoomGroupByKey(roomKey: string): RoomInventoryGroup | null {
    const roomRecords = this.roomInventory
      .filter((record) => this.getRoomKey(record) === roomKey)
      .sort((a, b) => this.getItemLabel(a).localeCompare(this.getItemLabel(b), 'es', { sensitivity: 'base' }));

    if (!roomRecords.length) return null;

    return {
      key: roomKey,
      label: this.getRoomLabel(roomRecords[0]),
      tone: this.resolveRoomTone(roomKey),
      items: roomRecords
    };
  }

  private getRoomKey(record: RoomInventoryI): string {
    if (typeof record.room === 'number' && record.room > 0) return `room:${record.room}`;
    if (record.room_number?.trim()) return `room-number:${record.room_number.trim()}`;
    return 'room:unknown';
  }

  private resolveCoverageState(record: RoomInventoryI): Exclude<CoverageFilter, 'ALL'> {
    const quantity = this.toNonNegativeInt(record.quantity);
    const minimum = this.toNonNegativeInt(record.minimum_quantity);
    if (quantity <= 0) return 'OUT';
    if (quantity <= minimum) return 'LOW';
    return 'NORMAL';
  }

  private resolveTypeTone(record: RoomInventoryI): RoomInventoryTone {
    if (typeof record.item === 'number') {
      const item = this.itemMap.get(record.item);
      const code = this.normalizeCode(item?.item_type_code || item?.item_type_name || '');
      if (code.includes('MINIBAR')) return ROOM_TONES[3];
      if (code.includes('LIMPIEZA') || code.includes('ASEO')) return ROOM_TONES[1];
      if (code.includes('AMENIT') || code.includes('HIGIENE')) return ROOM_TONES[2];
    }
    return ROOM_TONES[0];
  }

  private resolveRoomTone(roomKey: string): RoomInventoryTone {
    const hash = this.hashString(roomKey);
    const index = Math.abs(hash) % ROOM_TONES.length;
    return ROOM_TONES[index];
  }

  private hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private toNonNegativeInt(value: unknown): number {
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
