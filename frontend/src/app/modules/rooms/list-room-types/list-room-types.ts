import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { RoomService } from '../../../services/room';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { CreateRoomType } from '../create-room-type/create-room-type';
import { DetailRoomType } from '../detail-room-type/detail-room-type';
import { UpdateRoomType } from '../update-room-type/update-room-type';
import { RateI, RoomTypeI } from '../room-model';

type RoomTypeStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

@Component({
  selector: 'app-list-room-types',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateRoomType, DetailRoomType, UpdateRoomType],
  templateUrl: './list-room-types.html',
  styleUrls: ['./list-room-types.css']
})
export class ListRoomTypes implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  showDeletedRoomTypes = false;

  roomTypes: RoomTypeI[] = [];
  deletedRoomTypes: RoomTypeI[] = [];
  filteredRoomTypes: RoomTypeI[] = [];
  rates: RateI[] = [];

  search = '';
  statusFilter: RoomTypeStatusFilter = 'ALL';

  showCreateDrawer = false;
  showUpdateDrawer = false;
  selectedRoomType: RoomTypeI | null = null;
  roomTypeToEdit: RoomTypeI | null = null;

  readonly statusOptions: Array<{ value: RoomTypeStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'ACTIVE', label: 'Solo activos' },
    { value: 'INACTIVE', label: 'Solo inactivos' }
  ];

  private activeRateByType = new Map<number, RateI>();

  constructor(
    private roomService: RoomService,
    private router: Router,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalTypes(): number {
    return this.roomTypes.length;
  }

  get deletedRoomTypesCount(): number {
    return this.deletedRoomTypes.length;
  }

  get activeTypes(): number {
    return this.roomTypes.filter((roomType) => roomType.is_active !== false).length;
  }

  get inactiveTypes(): number {
    return this.roomTypes.filter((roomType) => roomType.is_active === false).length;
  }

  get averageCapacityLabel(): string {
    if (!this.roomTypes.length) return '--';

    const totalCapacity = this.roomTypes.reduce((sum, roomType) => sum + this.toPositiveNumber(roomType.capacity), 0);
    const average = totalCapacity / this.roomTypes.length;
    return `${average.toFixed(1)} personas`;
  }

  get averageRateLabel(): string {
    const activeRates = Array.from(this.activeRateByType.values());
    if (!activeRates.length) return '--';

    const total = activeRates.reduce((sum, rate) => sum + this.toNumber(rate.price), 0);
    const average = total / activeRates.length;
    return this.formatCurrency(average);
  }

  get roomTypesWithRate(): number {
    return this.activeRateByType.size;
  }

  get roomTypesWithoutRate(): number {
    return Math.max(this.totalTypes - this.roomTypesWithRate, 0);
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedRoomTypeId = this.selectedRoomType?.id ?? null;

    forkJoin({
      roomTypes: this.roomService
        .listRoomTypes({ ordering: 'sort_order,name', include_inactive: true })
        .pipe(catchError(() => of([] as RoomTypeI[]))),
      allRoomTypes: this.roomService
        .listRoomTypes({ ordering: 'sort_order,name', include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as RoomTypeI[]))),
      rates: this.roomService
        .listRates({ ordering: '-created_at', include_inactive: true })
        .pipe(catchError(() => of([] as RateI[])))
    }).subscribe({
      next: ({ roomTypes, allRoomTypes, rates }) => {
        this.loading = false;
        this.roomTypes = roomTypes;
        const visibleIds = new Set(roomTypes.map((roomType) => roomType.id));
        this.deletedRoomTypes = allRoomTypes.filter((roomType) => !visibleIds.has(roomType.id));
        this.rates = rates;
        this.buildActiveRateMap();

        if (selectedRoomTypeId) {
          this.selectedRoomType = roomTypes.find((roomType) => roomType.id === selectedRoomTypeId) || null;
        }

        this.infoMessage = this.roomTypes.length
          ? ''
          : 'No hay tipos de habitacion registrados. Crea el primer tipo para continuar.';

        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el catalogo de tipos de habitacion.';
      }
    });
  }

  refreshRoomTypes(): void {
    this.loadCatalogData();
  }

  goToRooms(): void {
    void this.router.navigate(['/habitaciones']);
  }

  goToRates(): void {
    void this.router.navigate(['/tarifas-habitacion']);
  }

  exportCsv(): void {
    if (!this.filteredRoomTypes.length) return;

    const headers = [
      'codigo',
      'nombre',
      'capacidad',
      'cantidad_camas',
      'tipo_cama',
      'tarifa_activa',
      'estado',
      'orden'
    ];

    const rows = this.filteredRoomTypes.map((roomType) => {
      const row = [
        roomType.code || '',
        roomType.name || '',
        this.toPositiveNumber(roomType.capacity),
        this.toPositiveNumber(roomType.bed_count),
        roomType.bed_type || '',
        this.getActiveRatePriceValue(roomType),
        roomType.is_active === false ? 'Inactivo' : 'Activo',
        Number(roomType.sort_order || 0)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tipos-habitacion-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredRoomTypes = this.roomTypes.filter((roomType) => {
      const isActive = roomType.is_active !== false;
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && isActive) ||
        (this.statusFilter === 'INACTIVE' && !isActive);

      const searchPool = [
        roomType.code,
        roomType.name,
        roomType.description || '',
        roomType.bed_type || '',
        this.getActiveRateName(roomType),
        this.getActiveRatePriceLabel(roomType)
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && searchMatch;
    });
  }

  openCreateDrawer(): void {
    this.selectedRoomType = null;
    this.roomTypeToEdit = null;
    this.showUpdateDrawer = false;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onRoomTypeCreated(): void {
    this.showCreateDrawer = false;
    this.refreshRoomTypes();
  }

  openDetail(roomType: RoomTypeI): void {
    this.showCreateDrawer = false;
    this.showUpdateDrawer = false;
    this.roomTypeToEdit = null;
    this.selectedRoomType = roomType;
  }

  closeDetail(): void {
    this.selectedRoomType = null;
  }

  openUpdateDrawer(roomType: RoomTypeI): void {
    this.selectedRoomType = null;
    this.showCreateDrawer = false;
    this.roomTypeToEdit = roomType;
    this.showUpdateDrawer = true;
  }

  openUpdateFromDetail(roomType: RoomTypeI): void {
    this.closeDetail();
    this.openUpdateDrawer(roomType);
  }

  closeUpdateDrawer(): void {
    this.showUpdateDrawer = false;
    this.roomTypeToEdit = null;
  }

  onRoomTypeUpdated(): void {
    this.showUpdateDrawer = false;
    this.roomTypeToEdit = null;
    this.refreshRoomTypes();
  }

  toggleRoomTypeStatus(roomType: RoomTypeI): void {
    this.errorMessage = '';
    const nextStatus = roomType.is_active === false;

    this.roomService.updateRoomType(roomType.id, { is_active: nextStatus }).subscribe({
      next: () => {
        this.refreshRoomTypes();
      },
      error: (error) => {
        this.errorMessage = this.extractErrorMessage(error, 'No fue posible actualizar el estado del tipo de habitacion.');
      }
    });
  }

  confirmDelete(roomType: RoomTypeI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: roomType.name || 'tipo de habitacion',
      onAccept: () => {
        this.errorMessage = '';
        this.roomService.deleteRoomType(roomType.id).subscribe({
          next: () => {
            if (this.selectedRoomType?.id === roomType.id) {
              this.closeDetail();
            }
            if (this.roomTypeToEdit?.id === roomType.id) {
              this.closeUpdateDrawer();
            }
            this.refreshRoomTypes();
          },
          error: (error) => {
            this.errorMessage = this.extractErrorMessage(
              error,
              'No fue posible eliminar el tipo de habitacion. Verifica si tiene habitaciones o tarifas asociadas.'
            );
          }
        });
      }
    });
  }

  restoreRoomType(roomType: RoomTypeI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: roomType.name || 'tipo de habitacion',
      onAccept: () => {
        this.errorMessage = '';
        this.roomService.restoreRoomType(roomType.id).subscribe({
          next: () => {
            this.refreshRoomTypes();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el tipo de habitacion seleccionado.';
          }
        });
      }
    });
  }

  getStatusTone(roomType: RoomTypeI): { bg: string; color: string; dot: string } {
    if (roomType.is_active === false) {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        dot: 'var(--gh-status-neutral-border)'
      };
    }
    return {
      bg: 'var(--gh-status-success-bg)',
      color: 'var(--gh-status-success-text)',
      dot: 'var(--gh-status-success-strong)'
    };
  }

  getBedSummary(roomType: RoomTypeI): string {
    const bedCount = this.toPositiveNumber(roomType.bed_count);
    const bedType = String(roomType.bed_type || '').trim() || 'cama estandar';
    const bedWord = bedCount === 1 ? 'cama' : 'camas';
    return `${bedCount} ${bedWord} - ${bedType}`;
  }

  getBedCompact(roomType: RoomTypeI): string {
    const bedCount = this.toPositiveNumber(roomType.bed_count);
    const bedType = String(roomType.bed_type || '').trim() || 'Estandar';
    return `${bedCount} ${bedType}`;
  }

  getCapacityLabel(roomType: RoomTypeI): string {
    const capacity = this.toPositiveNumber(roomType.capacity);
    return `${capacity} persona${capacity === 1 ? '' : 's'}`;
  }

  getActiveRateName(roomType: RoomTypeI | null): string {
    const rate = this.getActiveRate(roomType);
    if (!rate) return 'Sin tarifa activa';
    return rate.name || 'Tarifa activa';
  }

  getActiveRatePriceLabel(roomType: RoomTypeI | null): string {
    const rate = this.getActiveRate(roomType);
    if (!rate) return 'Sin tarifa';
    return this.formatCurrency(this.toNumber(rate.price));
  }

  getSelectedRoomTypeRate(): RateI | null {
    return this.getActiveRate(this.selectedRoomType);
  }

  trackByRoomType(_: number, roomType: RoomTypeI): number {
    return roomType.id;
  }

  private buildActiveRateMap(): void {
    this.activeRateByType.clear();

    for (const rate of this.rates) {
      const roomTypeId = Number(rate.room_type);
      if (!roomTypeId || rate.is_active === false) continue;

      const existing = this.activeRateByType.get(roomTypeId);
      if (!existing) {
        this.activeRateByType.set(roomTypeId, rate);
        continue;
      }

      const existingDate = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const currentDate = rate.created_at ? new Date(rate.created_at).getTime() : 0;

      if (currentDate >= existingDate) {
        this.activeRateByType.set(roomTypeId, rate);
      }
    }
  }

  private getActiveRate(roomType: RoomTypeI | null): RateI | null {
    if (!roomType) return null;
    return this.activeRateByType.get(roomType.id) || null;
  }

  private getActiveRatePriceValue(roomType: RoomTypeI): number {
    const rate = this.getActiveRate(roomType);
    if (!rate) return 0;
    return this.toNumber(rate.price);
  }

  private normalizeSearch(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private toNumber(value: string | number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = (payload as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
    }

    return fallback;
  }
}
