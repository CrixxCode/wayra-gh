import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { RoomService } from '../../../services/room';
import { AmenityI, RoomI } from '../room-model';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type UsageFilter = 'ALL' | 'IN_USE' | 'NO_USE';
type DrawerMode = 'create' | 'edit';
type ToastKind = 'success' | 'danger' | 'info';

type AmenityIconOption = {
  value: string;
  label: string;
};

const AMENITY_ICON_CATALOG: AmenityIconOption[] = [
  { value: 'fa-solid fa-bed', label: 'Cama' },
  { value: 'fa-solid fa-wifi', label: 'WiFi' },
  { value: 'fa-solid fa-tv', label: 'TV' },
  { value: 'fa-solid fa-bath', label: 'Bano' },
  { value: 'fa-solid fa-snowflake', label: 'Aire' },
  { value: 'fa-solid fa-mug-hot', label: 'Cafe' },
  { value: 'fa-solid fa-square-parking', label: 'Parqueadero' },
  { value: 'fa-solid fa-water-ladder', label: 'Piscina' },
  { value: 'fa-solid fa-bell-concierge', label: 'Servicio' },
  { value: 'fa-solid fa-dumbbell', label: 'Gimnasio' }
];

@Component({
  selector: 'app-amenities',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './amenities.html',
  styleUrls: ['./amenities.css']
})
export class AmenitiesPage implements OnInit {
  loading = false;
  saving = false;
  loadWarning = '';
  showDeletedAmenities = false;
  usageMetricsAvailable = true;

  allAmenities: AmenityI[] = [];
  deletedAmenities: AmenityI[] = [];
  filteredAmenities: AmenityI[] = [];
  usageByAmenity = new Map<number, number>();

  search = '';
  statusFilter: StatusFilter = 'ALL';
  usageFilter: UsageFilter = 'ALL';

  showDrawer = false;
  drawerMode: DrawerMode = 'create';
  editingId: number | null = null;

  form: {
    name: string;
    description: string;
    icon: string;
    is_active: boolean;
  } = {
    name: '',
    description: '',
    icon: AMENITY_ICON_CATALOG[0]?.value || '',
    is_active: true
  };

  deleteTarget: AmenityI | null = null;

  toastVisible = false;
  toastText = '';
  toastKind: ToastKind = 'info';
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly iconCatalog = AMENITY_ICON_CATALOG;

  constructor(
    private roomService: RoomService,
    private confirmationService: ConfirmationService
  ) {
    this.form = this.emptyForm();
  }

  ngOnInit(): void {
    this.loadData();
  }

  get totalAmenities(): number {
    return this.allAmenities.length;
  }

  get deletedAmenitiesCount(): number {
    return this.deletedAmenities.length;
  }

  get activeAmenities(): number {
    return this.allAmenities.filter((item) => !!item.is_active).length;
  }

  get inactiveAmenities(): number {
    return this.allAmenities.filter((item) => !item.is_active).length;
  }

  get usedAmenities(): number {
    return this.allAmenities.filter((item) => this.getUsageCount(item.id) > 0).length;
  }

  get unusedAmenities(): number {
    return this.allAmenities.filter((item) => this.getUsageCount(item.id) === 0).length;
  }

  trackByAmenity(_: number, item: AmenityI): number {
    return item.id;
  }

  loadData(): void {
    this.loading = true;
    this.loadWarning = '';
    this.usageMetricsAvailable = true;
    forkJoin({
      amenitiesResult: this.roomService.listAmenities({ include_inactive: true }).pipe(
        map((data) => ({ data, failed: false })),
        catchError(() => of({ data: [] as AmenityI[], failed: true }))
      ),
      allAmenitiesResult: this.roomService.listAmenities({ include_inactive: true, include_deleted: true }).pipe(
        map((data) => ({ data, failed: false })),
        catchError(() => of({ data: [] as AmenityI[], failed: true }))
      ),
      roomsResult: this.roomService.listRooms().pipe(
        map((data) => ({ data, failed: false, status: 200 })),
        catchError((error: { status?: number }) =>
          of({ data: [] as RoomI[], failed: true, status: error?.status ?? 0 })
        )
      )
    }).subscribe({
      next: ({ amenitiesResult, allAmenitiesResult, roomsResult }) => {
        this.loading = false;
        this.allAmenities = this.sortAmenities(amenitiesResult.data);
        const visibleIds = new Set(this.allAmenities.map((amenity) => amenity.id));
        this.deletedAmenities = this.sortAmenities(
          allAmenitiesResult.data.filter((amenity) => !visibleIds.has(amenity.id))
        );
        const usagePermissionDenied = roomsResult.failed && (roomsResult.status === 401 || roomsResult.status === 403);
        this.usageMetricsAvailable = !roomsResult.failed;
        this.usageByAmenity = this.usageMetricsAvailable ? this.buildUsageMap(roomsResult.data) : new Map<number, number>();
        if (!this.usageMetricsAvailable) {
          this.usageFilter = 'ALL';
        }
        this.applyFilters();

        if (amenitiesResult.failed) {
          this.loadWarning = 'No se pudieron cargar amenidades. Revisa permisos de acceso.';
          this.toast(this.loadWarning, 'danger');
        } else if (roomsResult.failed && !usagePermissionDenied) {
          this.loadWarning = 'No se pudo calcular el uso de amenidades por habitacion.';
          this.toast(this.loadWarning, 'info');
        }
      },
      error: () => {
        this.loading = false;
        this.allAmenities = [];
        this.filteredAmenities = [];
        this.usageByAmenity.clear();
        this.toast('No se pudo cargar amenidades.', 'danger');
      }
    });
  }

  applyFilters(): void {
    const q = this.search.trim().toLowerCase();

    this.filteredAmenities = this.allAmenities.filter((item) => {
      const matchesStatus =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && !!item.is_active) ||
        (this.statusFilter === 'INACTIVE' && !item.is_active);

      const pool = [item.name, item.description || '', item.icon || ''].join(' ').toLowerCase();
      const matchesSearch = !q || pool.includes(q);
      const usageCount = this.getUsageCount(item.id);
      const matchesUsage =
        this.usageFilter === 'ALL' ||
        (this.usageFilter === 'IN_USE' && usageCount > 0) ||
        (this.usageFilter === 'NO_USE' && usageCount === 0);

      return matchesStatus && matchesSearch && matchesUsage;
    });
  }

  exportCsv(): void {
    if (!this.filteredAmenities.length) return;

    const headers = ['amenidad', 'descripcion', 'icono', 'uso', 'estado', 'creada'];

    const rows = this.filteredAmenities.map((item) => {
      const row = [
        item.name || '',
        item.description || '',
        item.icon || '',
        this.getUsageCount(item.id),
        item.is_active ? 'Activa' : 'Inactiva',
        this.formatDate(item.created_at)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amenidades-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  openCreate(): void {
    this.drawerMode = 'create';
    this.editingId = null;
    this.form = this.emptyForm();
    this.showDrawer = true;
  }

  openEdit(item: AmenityI): void {
    this.drawerMode = 'edit';
    this.editingId = item.id;
    this.form = {
      name: item.name || '',
      description: item.description || '',
      icon: this.isCatalogIcon(item.icon) ? item.icon! : this.iconCatalog[0].value,
      is_active: item.is_active !== false
    };
    this.showDrawer = true;
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.showDrawer = false;
  }

  selectIcon(icon: string): void {
    this.form.icon = icon;
  }

  saveAmenity(): void {
    if (this.saving) return;

    const name = (this.form.name || '').trim();
    const description = (this.form.description || '').trim();
    const icon = (this.form.icon || '').trim();

    if (!name) {
      this.toast('El nombre es obligatorio.', 'danger');
      return;
    }

    if (!this.isCatalogIcon(icon)) {
      this.toast('Selecciona un icono del catalogo.', 'danger');
      return;
    }

    const payload: Partial<AmenityI> = {
      name,
      description,
      icon,
      is_active: !!this.form.is_active
    };

    this.saving = true;
    if (this.drawerMode === 'edit' && this.editingId) {
      this.roomService.updateAmenity(this.editingId, payload).subscribe({
        next: () => {
          this.saving = false;
          this.showDrawer = false;
          this.toast(successActionAlert('update', 'amenidad'), 'success');
          this.loadData();
        },
        error: (error) => {
          this.saving = false;
          this.toast(this.extractErrorMessage(error, errorActionAlert('update', 'amenidad')), 'danger');
        }
      });
      return;
    }

    this.roomService.createAmenity(payload).subscribe({
      next: () => {
        this.saving = false;
        this.showDrawer = false;
        this.toast(successActionAlert('create', 'amenidad'), 'success');
        this.loadData();
      },
      error: (error) => {
        this.saving = false;
        this.toast(this.extractErrorMessage(error, errorActionAlert('create', 'amenidad')), 'danger');
      }
    });
  }

  askDelete(item: AmenityI): void {
    this.deleteTarget = item;
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: item.name || 'amenidad',
      onAccept: () => this.confirmDelete()
    });
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const targetId = this.deleteTarget.id;

    this.roomService.deleteAmenity(targetId).subscribe({
      next: () => {
        this.deleteTarget = null;
        this.toast(successActionAlert('delete', 'amenidad'), 'success');
        this.loadData();
      },
      error: (error) => {
        this.deleteTarget = null;
        this.toast(this.extractErrorMessage(error, errorActionAlert('delete', 'amenidad')), 'danger');
      }
    });
  }

  restoreAmenity(item: AmenityI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: item.name || 'amenidad',
      onAccept: () => {
        this.roomService.restoreAmenity(item.id).subscribe({
          next: () => {
            this.toast(successActionAlert('restore', 'amenidad'), 'success');
            this.loadData();
          },
          error: (error) => {
            this.toast(this.extractErrorMessage(error, errorActionAlert('restore', 'amenidad')), 'danger');
          }
        });
      }
    });
  }

  getUsageCount(id: number): number {
    return this.usageByAmenity.get(id) || 0;
  }

  formatDate(value?: string): string {
    if (!value) return 'N/D';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/D';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(date);
  }

  defaultIcon(): string {
    return this.iconCatalog[0].value;
  }

  private emptyForm() {
    return {
      name: '',
      description: '',
      icon: this.iconCatalog[0].value,
      is_active: true
    };
  }

  private isCatalogIcon(icon?: string | null): boolean {
    if (!icon) return false;
    return this.iconCatalog.some((item) => item.value === icon);
  }

  private sortAmenities(items: AmenityI[]): AmenityI[] {
    return [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  }

  private buildUsageMap(rooms: RoomI[]): Map<number, number> {
    const usage = new Map<number, number>();
    for (const room of rooms) {
      if (!Array.isArray(room.amenities)) continue;
      for (const amenity of room.amenities) {
        if (typeof amenity?.id !== 'number') continue;
        usage.set(amenity.id, (usage.get(amenity.id) || 0) + 1);
      }
    }
    return usage;
  }

  private toast(message: string, kind: ToastKind = 'info'): void {
    this.toastText = message;
    this.toastKind = kind;
    this.toastVisible = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastVisible = false;
    }, 2600);
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
