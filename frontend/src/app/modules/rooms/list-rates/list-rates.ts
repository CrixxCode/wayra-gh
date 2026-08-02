import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { RoomService } from '../../../services/room';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { CreateRate } from '../create-rate/create-rate';
import { DetailRate } from '../detail-rate/detail-rate';
import { UpdateRate } from '../update-rate/update-rate';
import { RateI, RoomTypeI } from '../room-model';

type RateStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type RateValidityState = 'ACTIVE_NOW' | 'UPCOMING' | 'EXPIRED' | 'OPEN';
type RateValidityFilter = 'ALL' | RateValidityState;

type RoomTypeTab = {
  key: string;
  label: string;
  count: number;
};

type RateGroup = {
  key: string;
  label: string;
  order: number;
  items: RateI[];
  averagePrice: number;
};

@Component({
  selector: 'app-list-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateRate, UpdateRate, DetailRate],
  templateUrl: './list-rates.html',
  styleUrls: ['./list-rates.css']
})
export class ListRates implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  showDeletedRates = false;

  rates: RateI[] = [];
  deletedRates: RateI[] = [];
  filteredRates: RateI[] = [];
  groupedRates: RateGroup[] = [];

  roomTypes: RoomTypeI[] = [];
  typeTabs: RoomTypeTab[] = [];

  search = '';
  statusFilter: RateStatusFilter = 'ALL';
  validityFilter: RateValidityFilter = 'ALL';
  selectedTypeFilter = 'ALL';

  showCreateDrawer = false;
  showUpdateDrawer = false;
  selectedRate: RateI | null = null;
  rateToEdit: RateI | null = null;

  readonly statusOptions: Array<{ value: RateStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'ACTIVE', label: 'Solo activas' },
    { value: 'INACTIVE', label: 'Solo inactivas' }
  ];

  readonly validityOptions: Array<{ value: RateValidityFilter; label: string }> = [
    { value: 'ALL', label: 'Toda vigencia' },
    { value: 'ACTIVE_NOW', label: 'Vigentes hoy' },
    { value: 'UPCOMING', label: 'Proximas' },
    { value: 'EXPIRED', label: 'Vencidas' },
    { value: 'OPEN', label: 'Sin fecha' }
  ];

  private roomTypeMap = new Map<number, RoomTypeI>();
  private typeOrderMap = new Map<string, number>();

  constructor(
    private roomService: RoomService,
    private router: Router,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalRates(): number {
    return this.rates.length;
  }

  get deletedRatesCount(): number {
    return this.deletedRates.length;
  }

  get activeRates(): number {
    return this.rates.filter((rate) => rate.is_active !== false).length;
  }

  get activeTodayRates(): number {
    return this.rates.filter((rate) => this.getValidityState(rate) === 'ACTIVE_NOW').length;
  }

  get upcomingRates(): number {
    return this.rates.filter((rate) => this.getValidityState(rate) === 'UPCOMING').length;
  }

  get coveredRoomTypes(): number {
    return new Set(this.rates.map((rate) => Number(rate.room_type)).filter((id) => id > 0)).size;
  }

  get averageRateLabel(): string {
    if (!this.rates.length) return this.formatCurrency(0);
    const total = this.rates.reduce((sum, rate) => sum + this.toNumber(rate.price), 0);
    return this.formatCurrency(total / this.rates.length);
  }

  get canCreateRate(): boolean {
    return this.roomTypes.length > 0;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedRateId = this.selectedRate?.id ?? null;

    forkJoin({
      rates: this.roomService
        .listRates({ ordering: '-created_at', include_inactive: true })
        .pipe(catchError(() => of([] as RateI[]))),
      allRates: this.roomService
        .listRates({ ordering: '-created_at', include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as RateI[]))),
      roomTypes: this.roomService.listRoomTypes().pipe(catchError(() => of([] as RoomTypeI[])))
    }).subscribe({
      next: ({ rates, allRates, roomTypes }) => {
        this.loading = false;
        this.rates = rates;
        const visibleIds = new Set(rates.map((rate) => rate.id));
        this.deletedRates = allRates.filter((rate) => !visibleIds.has(rate.id));
        this.roomTypes = roomTypes;

        if (selectedRateId) {
          this.selectedRate = rates.find((rate) => rate.id === selectedRateId) || null;
        }

        this.buildRoomTypeMaps();
        this.typeTabs = this.buildTypeTabs(this.rates);

        if (this.selectedTypeFilter !== 'ALL' && !this.typeTabs.some((tab) => tab.key === this.selectedTypeFilter)) {
          this.selectedTypeFilter = 'ALL';
        }

        this.infoMessage = this.roomTypes.length
          ? ''
          : 'No hay tipos de habitacion activos. Registra tipos de habitacion para crear tarifas.';

        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el modulo de tarifas.';
      }
    });
  }

  refreshRates(): void {
    this.loadCatalogData();
  }

  goToRooms(): void {
    void this.router.navigate(['/habitaciones']);
  }

  goToRoomTypes(): void {
    void this.router.navigate(['/tipos-habitacion']);
  }

  exportCsv(): void {
    if (!this.filteredRates.length) return;

    const headers = ['nombre', 'tipo_habitacion', 'precio', 'vigencia', 'estado', 'inicio', 'fin'];

    const rows = this.filteredRates.map((rate) => {
      const row = [
        rate.name || '',
        this.getRoomTypeLabel(rate),
        this.toNumber(rate.price),
        this.getValidityLabel(rate),
        rate.is_active === false ? 'Inactiva' : 'Activa',
        rate.start_date || '',
        rate.end_date || ''
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tarifas-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredRates = this.rates.filter((rate) => {
      const isActive = rate.is_active !== false;
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && isActive) ||
        (this.statusFilter === 'INACTIVE' && !isActive);

      const typeMatch = this.selectedTypeFilter === 'ALL' || this.getRateTypeKey(rate) === this.selectedTypeFilter;

      const validity = this.getValidityState(rate);
      const validityMatch = this.validityFilter === 'ALL' || validity === this.validityFilter;

      const searchPool = [
        rate.name,
        this.getRoomTypeLabel(rate),
        this.getRangeLabel(rate),
        this.getValidityLabel(rate),
        String(rate.price)
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);

      return statusMatch && typeMatch && validityMatch && searchMatch;
    });

    this.groupedRates = this.buildGroups(this.filteredRates);
  }

  selectTypeFilter(tabKey: string): void {
    this.selectedTypeFilter = tabKey;
    this.applyFilters();
  }

  openCreateDrawer(): void {
    this.selectedRate = null;
    this.rateToEdit = null;
    this.showUpdateDrawer = false;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onRateCreated(): void {
    this.showCreateDrawer = false;
    this.refreshRates();
  }

  openDetail(rate: RateI): void {
    this.showCreateDrawer = false;
    this.showUpdateDrawer = false;
    this.rateToEdit = null;
    this.selectedRate = rate;
  }

  closeDetail(): void {
    this.selectedRate = null;
  }

  openUpdateDrawer(rate: RateI): void {
    this.selectedRate = null;
    this.showCreateDrawer = false;
    this.rateToEdit = rate;
    this.showUpdateDrawer = true;
  }

  openUpdateFromDetail(rate: RateI): void {
    this.closeDetail();
    this.openUpdateDrawer(rate);
  }

  closeUpdateDrawer(): void {
    this.showUpdateDrawer = false;
    this.rateToEdit = null;
  }

  onRateUpdated(): void {
    this.showUpdateDrawer = false;
    this.rateToEdit = null;
    this.refreshRates();
  }

  toggleRateStatus(rate: RateI): void {
    this.errorMessage = '';
    const nextStatus = rate.is_active === false;

    this.roomService.updateRate(rate.id, { is_active: nextStatus }).subscribe({
      next: () => {
        this.refreshRates();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar el estado de la tarifa.';
      }
    });
  }

  confirmDelete(rate: RateI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: rate.name || 'tarifa',
      onAccept: () => {
        this.errorMessage = '';
        this.roomService.deleteRate(rate.id).subscribe({
          next: () => {
            if (this.selectedRate?.id === rate.id) {
              this.closeDetail();
            }
            if (this.rateToEdit?.id === rate.id) {
              this.closeUpdateDrawer();
            }
            this.refreshRates();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar la tarifa seleccionada.';
          }
        });
      }
    });
  }

  restoreRate(rate: RateI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: rate.name || 'tarifa',
      onAccept: () => {
        this.errorMessage = '';
        this.roomService.restoreRate(rate.id).subscribe({
          next: () => {
            this.refreshRates();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar la tarifa seleccionada.';
          }
        });
      }
    });
  }

  getRoomTypeLabel(rate: RateI): string {
    const roomType = this.roomTypeMap.get(Number(rate.room_type));
    if (roomType?.name) return roomType.name;
    if (rate.room_type_name) return rate.room_type_name;
    return `Tipo #${rate.room_type}`;
  }

  getPriceLabel(rate: RateI): string {
    return this.formatCurrency(this.toNumber(rate.price));
  }

  getRangeLabel(rate: RateI): string {
    const start = this.formatDate(rate.start_date || null);
    const end = this.formatDate(rate.end_date || null);

    if (start === 'Sin fecha' && end === 'Sin fecha') return 'Sin restriccion de fechas';
    if (start !== 'Sin fecha' && end === 'Sin fecha') return `Desde ${start}`;
    if (start === 'Sin fecha' && end !== 'Sin fecha') return `Hasta ${end}`;
    return `${start} - ${end}`;
  }

  getStatusTone(rate: RateI): { bg: string; color: string; dot: string } {
    if (rate.is_active === false) {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        dot: 'var(--gh-text-soft)'
      };
    }

    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      dot: 'var(--gh-status-success-strong)'
    };
  }

  getValidityLabel(rate: RateI): string {
    const validity = this.getValidityState(rate);
    if (validity === 'ACTIVE_NOW') return 'Vigente';
    if (validity === 'UPCOMING') return 'Proxima';
    if (validity === 'EXPIRED') return 'Vencida';
    return 'Sin limite';
  }

  getValidityTone(rate: RateI): { bg: string; color: string } {
    const validity = this.getValidityState(rate);
    if (validity === 'ACTIVE_NOW') return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    if (validity === 'UPCOMING') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    if (validity === 'EXPIRED') return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
    return { bg: 'var(--gh-status-violet-bg)', color: 'var(--gh-status-violet-text)' };
  }

  getGroupAverageLabel(group: RateGroup): string {
    return this.formatCurrency(group.averagePrice);
  }

  trackByRate(_: number, rate: RateI): number {
    return rate.id;
  }

  trackByGroup(_: number, group: RateGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: RoomTypeTab): string {
    return tab.key;
  }

  private buildRoomTypeMaps(): void {
    this.roomTypeMap = new Map(this.roomTypes.map((roomType) => [roomType.id, roomType]));

    this.typeOrderMap.clear();
    this.roomTypes.forEach((roomType, index) => {
      this.typeOrderMap.set(`id:${roomType.id}`, index);
    });
  }

  private buildTypeTabs(rates: RateI[]): RoomTypeTab[] {
    const groups = this.buildGroups(rates);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: rates.length
      },
      ...groups.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.items.length
      }))
    ];
  }

  private buildGroups(rates: RateI[]): RateGroup[] {
    const groupsMap = new Map<string, RateGroup>();

    for (const rate of rates) {
      const key = this.getRateTypeKey(rate);
      const label = this.getRoomTypeLabel(rate);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          order: this.resolveTypeOrder(rate, key),
          items: [],
          averagePrice: 0
        });
      }

      groupsMap.get(key)?.items.push(rate);
    }

    const groups = Array.from(groupsMap.values()).map((group) => ({
      ...group,
      averagePrice: this.average(group.items.map((rate) => this.toNumber(rate.price)))
    }));

    groups.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    return groups;
  }

  private getRateTypeKey(rate: RateI): string {
    if (typeof rate.room_type === 'number') {
      return `id:${rate.room_type}`;
    }

    const label = this.getRoomTypeLabel(rate).trim();
    return label ? `name:${label.toLowerCase()}` : 'untyped';
  }

  private resolveTypeOrder(rate: RateI, key: string): number {
    const fromMap = this.typeOrderMap.get(key);
    if (typeof fromMap === 'number') return fromMap;

    const roomType = this.roomTypeMap.get(Number(rate.room_type));
    if (roomType?.name) {
      const index = this.roomTypes.findIndex((item) => item.id === roomType.id);
      if (index >= 0) return index;
    }

    return 999;
  }

  private getValidityState(rate: RateI): RateValidityState {
    const start = this.parseDate(rate.start_date || null);
    const end = this.parseDate(rate.end_date || null);
    const today = this.startOfDay(new Date());

    if (!start && !end) return 'OPEN';
    if (start && start > today) return 'UPCOMING';
    if (end && end < today) return 'EXPIRED';
    return 'ACTIVE_NOW';
  }

  private formatDate(value: string | null | undefined): string {
    const parsed = this.parseDate(value);
    if (!parsed) return 'Sin fecha';

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      return this.startOfDay(new Date(year, month - 1, day));
    }

    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) return null;
    return this.startOfDay(asDate);
  }

  private startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private normalizeSearch(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
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
