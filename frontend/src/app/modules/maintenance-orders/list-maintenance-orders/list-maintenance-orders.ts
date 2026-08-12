import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { MasterDataService } from '../../../services/master-data.service';
import { RoomService } from '../../../services/room';
import { RoomI } from '../../rooms/room-model';
import { CreateMaintenanceOrder } from '../create-maintenance-order/create-maintenance-order';
import { DetailMaintenanceOrder } from '../detail-maintenance-order/detail-maintenance-order';
import { MaintenanceOrderFormPayload, MaintenanceOrderI } from '../maintenance-order-model';

type MaintenanceOrderViewMode = 'cards' | 'table';

type MaintenancePriorityTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type MaintenanceOrderGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: MaintenancePriorityTone;
  items: MaintenanceOrderI[];
};

const PRIORITY_TONES: Record<string, MaintenancePriorityTone> = {
  URGENTE: {
    icon: 'fa-solid fa-triangle-exclamation',
    iconBg: 'var(--gh-status-danger-bg)',
    iconColor: 'var(--gh-status-danger-text)',
    cover: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
    badgeBg: 'var(--gh-status-danger-bg)',
    badgeColor: 'var(--gh-status-danger-text)',
    accent: 'var(--gh-status-danger-strong)'
  },
  ALTA: {
    icon: 'fa-solid fa-bolt',
    iconBg: 'var(--gh-status-orange-bg)',
    iconColor: 'var(--gh-status-orange-text)',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: 'var(--gh-status-orange-bg)',
    badgeColor: 'var(--gh-status-orange-text)',
    accent: 'var(--gh-status-orange-strong)'
  },
  MEDIA: {
    icon: 'fa-solid fa-screwdriver-wrench',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  BAJA: {
    icon: 'fa-solid fa-toolbox',
    iconBg: 'var(--gh-status-success-bg)',
    iconColor: 'var(--gh-status-success-text)',
    cover: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)',
    badgeBg: 'var(--gh-status-success-bg)',
    badgeColor: 'var(--gh-status-success-text)',
    accent: 'var(--gh-status-success-strong)'
  },
  DEFAULT: {
    icon: 'fa-solid fa-helmet-safety',
    iconBg: 'var(--gh-status-neutral-bg)',
    iconColor: 'var(--gh-status-neutral-text)',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: 'var(--gh-status-neutral-bg)',
    badgeColor: 'var(--gh-status-neutral-text)',
    accent: 'var(--gh-text-muted)'
  }
};

@Component({
  selector: 'app-list-maintenance-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateMaintenanceOrder, DetailMaintenanceOrder],
  templateUrl: './list-maintenance-orders.html',
  styleUrls: ['./list-maintenance-orders.css']
})
export class ListMaintenanceOrders implements OnInit {
  /** Dentro del contenedor de limpieza y mantenimiento: sin encabezado propio. */
  @Input() embedded = false;

  /** Un cambio aqui mueve la cola que ven las otras pestañas. */
  @Output() changed = new EventEmitter<void>();

  /**
   * Habitacion que se viene siguiendo desde otra pestaña.
   *
   * Llega del contenedor y acota la lista sin tocar los filtros propios.
   */
  @Input() set focusRoomId(value: number | null) {
    this.trackedRoomId = typeof value === 'number' && value > 0 ? value : null;
    this.applyFilters();
  }

  trackedRoomId: number | null = null;

  /** Solo la primera carga: es la unica que puede dejar la pantalla vacia. */
  loading = false;

  /** Recarga posterior a una accion: la cuadricula sigue en pantalla. */
  refreshing = false;
  errorMessage = '';
  infoMessage = '';
  viewMode: MaintenanceOrderViewMode = 'cards';
  showDeletedMaintenanceOrders = false;

  maintenanceOrders: MaintenanceOrderI[] = [];
  deletedMaintenanceOrders: MaintenanceOrderI[] = [];
  filteredMaintenanceOrders: MaintenanceOrderI[] = [];
  groupedMaintenanceOrders: MaintenanceOrderGroup[] = [];
  rooms: RoomI[] = [];
  priorities: MasterDataI[] = [];
  statuses: MasterDataI[] = [];

  search = '';
  statusFilter = 'ALL';
  selectedPriorityFilter = 'ALL';
  selectedRoomFilter = 'ALL';

  statusFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todos los estados' }];
  priorityFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todas las prioridades' }];
  roomFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todas las habitaciones' }];

  showCreateDrawer = false;
  selectedMaintenanceOrder: MaintenanceOrderI | null = null;
  showCompletionCommentModal = false;
  completionComment = '';
  completionCommentError = '';
  statusUpdateLoading = false;

  private roomMap = new Map<number, RoomI>();
  private priorityMap = new Map<string, MasterDataI>();
  private statusMap = new Map<string, MasterDataI>();
  private priorityOrderMap = new Map<string, number>();
  private statusCodeByNormalized = new Map<string, string>();
  private highlightedByGroup = new Map<string, Set<number>>();
  private pendingCompletionOrder: MaintenanceOrderI | null = null;
  private pendingCompletionStatusCode: string | null = null;

  constructor(
    private maintenanceOrdersService: MaintenanceOrdersService,
    private roomService: RoomService,
    private masterDataService: MasterDataService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalOrders(): number {
    return this.maintenanceOrders.length;
  }

  get deletedMaintenanceOrdersCount(): number {
    return this.deletedMaintenanceOrders.length;
  }

  get pendingOrders(): number {
    return this.maintenanceOrders.filter((order) => this.normalizeCode(order.status) === 'PENDIENTE').length;
  }

  get inProgressOrders(): number {
    return this.maintenanceOrders.filter((order) => this.normalizeCode(order.status) === 'ENPROCESO').length;
  }

  get delayedOrders(): number {
    return this.maintenanceOrders.filter((order) => this.isDelayed(order)).length;
  }

  get completedOrders(): number {
    return this.maintenanceOrders.filter((order) => this.normalizeCode(order.status) === 'COMPLETADA').length;
  }

  get canCreateOrder(): boolean {
    return this.rooms.length > 0 && this.priorities.length > 0 && this.statuses.length > 0;
  }

  loadCatalogData(options: { silent?: boolean; force?: boolean } = {}): void {
    // Una recarga silenciosa no toca `loading`, asi que la cuadricula no se desmonta
    // y la pantalla no parpadea con cada accion.
    if (options.silent) this.refreshing = true;
    else this.loading = true;
    this.errorMessage = '';
    const selectedId = this.selectedMaintenanceOrder?.id ?? null;

    forkJoin({
      maintenanceOrders: this.maintenanceOrdersService
        .listMaintenanceOrders({ include_inactive: true, forceRefresh: options.force })
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      allMaintenanceOrders: this.maintenanceOrdersService
        .listMaintenanceOrders({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      priorities: this.masterDataService
        .listMasterData({ group: 'MAINTENANCE_PRIORITY', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      statuses: this.masterDataService
        .listMasterData({ group: 'MAINTENANCE_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ maintenanceOrders, allMaintenanceOrders, rooms, priorities, statuses }) => {
        this.loading = false;
        this.refreshing = false;
        this.maintenanceOrders = maintenanceOrders;
        const visibleIds = new Set(maintenanceOrders.map((order) => order.id));
        this.deletedMaintenanceOrders = allMaintenanceOrders.filter((order) => !visibleIds.has(order.id));
        this.rooms = rooms;
        this.priorities = priorities;
        this.statuses = statuses;

        if (selectedId) {
          this.selectedMaintenanceOrder = maintenanceOrders.find((order) => order.id === selectedId) || null;
        }

        this.buildMaps();
        this.buildFilterOptions();
        this.applyFilters();

        if (!rooms.length) {
          this.infoMessage = 'No hay habitaciones disponibles para crear ordenes.';
        } else if (!priorities.length) {
          this.infoMessage = 'No hay prioridades de mantenimiento activas en master data.';
        } else if (!statuses.length) {
          this.infoMessage = 'No hay estados de mantenimiento activos en master data.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.refreshing = false;
        this.errorMessage = 'No fue posible cargar las ordenes de mantenimiento.';
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
  refreshMaintenanceOrders(force = false): void {
    this.changed.emit();
    this.loadCatalogData({ silent: true, force });
  }

  exportCsv(): void {
    if (!this.filteredMaintenanceOrders.length) return;

    const headers = [
      'codigo',
      'habitacion',
      'titulo',
      'prioridad',
      'estado',
      'reportado_en',
      'finalizacion_estimada',
      'finalizacion_real',
      'descripcion'
    ];
    const rows = this.filteredMaintenanceOrders.map((order) => {
      const row = [
        this.getOrderCode(order),
        this.getRoomLabel(order),
        this.getTitleLabel(order),
        this.getPriorityLabel(order),
        this.getStatusLabel(order),
        this.formatDateTime(order.reported_at),
        this.formatDateTime(order.estimated_completed_at),
        this.formatDateTime(order.completed_at),
        this.getDescriptionLabel(order)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ordenes-mantenimiento-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredMaintenanceOrders = this.maintenanceOrders.filter((order) => {
      // Seguimiento desde otra pestaña: acota sin tocar los filtros del usuario.
      if (this.trackedRoomId !== null && Number(order.room) !== this.trackedRoomId) return false;

      const statusMatch =
        this.statusFilter === 'ALL' || this.normalizeCode(order.status) === this.normalizeCode(this.statusFilter);

      const priorityMatch =
        this.selectedPriorityFilter === 'ALL' ||
        this.normalizeCode(this.getPriorityCode(order)) === this.normalizeCode(this.selectedPriorityFilter);

      const roomMatch = this.selectedRoomFilter === 'ALL' || this.getRoomKey(order) === this.selectedRoomFilter;

      const searchPool = [
        this.getOrderCode(order),
        this.getRoomLabel(order),
        this.getTitleLabel(order),
        this.getDescriptionLabel(order),
        this.getPriorityLabel(order),
        this.getStatusLabel(order),
        order.reported_at || '',
        order.estimated_completed_at || '',
        order.completed_at || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && priorityMatch && roomMatch && searchMatch;
    });

    this.groupedMaintenanceOrders = this.buildGroups(this.filteredMaintenanceOrders);
  }

  setViewMode(mode: MaintenanceOrderViewMode): void {
    this.viewMode = mode;
  }

  openCreateDrawer(): void {
    this.selectedMaintenanceOrder = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onMaintenanceOrderCreated(): void {
    this.showCreateDrawer = false;
    this.refreshMaintenanceOrders();
  }

  openDetail(order: MaintenanceOrderI): void {
    this.showCreateDrawer = false;
    this.selectedMaintenanceOrder = order;
  }

  closeDetail(): void {
    this.selectedMaintenanceOrder = null;
  }

  advanceOrderStatus(order: MaintenanceOrderI): void {
    this.errorMessage = '';
    const nextCode = this.resolveNextStatusCode(order);
    if (!nextCode) return;

    const nextNormalized = this.normalizeCode(nextCode);
    if (nextNormalized === 'COMPLETADA') {
      this.openCompletionCommentModal(order, nextCode);
      return;
    }

    this.updateOrderStatus(order, nextCode);
  }

  closeCompletionCommentModal(): void {
    if (this.statusUpdateLoading) return;
    this.resetCompletionCommentState();
  }

  submitCompletionWithComment(): void {
    if (this.statusUpdateLoading) return;
    if (!this.pendingCompletionOrder || !this.pendingCompletionStatusCode) return;

    this.completionCommentError = '';

    const completionDescription = this.buildCompletionDescription(
      this.pendingCompletionOrder,
      this.completionComment
    );

    this.updateOrderStatus(
      this.pendingCompletionOrder,
      this.pendingCompletionStatusCode,
      completionDescription
    );
  }

  getCompletionOrderCode(): string {
    if (!this.pendingCompletionOrder) return '--';
    return this.getOrderCode(this.pendingCompletionOrder);
  }

  getCompletionRoomLabel(): string {
    if (!this.pendingCompletionOrder) return 'Habitacion no definida';
    return this.getRoomLabel(this.pendingCompletionOrder);
  }

  confirmDelete(order: MaintenanceOrderI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: this.getOrderCode(order),
      onAccept: () => {
        this.errorMessage = '';
        this.maintenanceOrdersService.deleteMaintenanceOrder(order.id).subscribe({
          next: () => {
            if (this.selectedMaintenanceOrder?.id === order.id) {
              this.closeDetail();
            }
            this.refreshMaintenanceOrders();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar la orden seleccionada.';
          }
        });
      }
    });
  }

  restoreMaintenanceOrder(order: MaintenanceOrderI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: this.getOrderCode(order),
      onAccept: () => {
        this.errorMessage = '';
        this.maintenanceOrdersService.restoreMaintenanceOrder(order.id).subscribe({
          next: () => {
            this.refreshMaintenanceOrders();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar la orden seleccionada.';
          }
        });
      }
    });
  }

  getRoomLabel(order: MaintenanceOrderI): string {
    if (order.room_number?.trim()) return `Habitacion ${order.room_number.trim()}`;

    if (typeof order.room === 'number' && order.room > 0) {
      const room = this.roomMap.get(order.room);
      if (room?.number?.trim()) return `Habitacion ${room.number.trim()}`;
      return 'Habitacion sin numero';
    }

    return 'Habitacion no definida';
  }

  getOrderCode(order: MaintenanceOrderI): string {
    return `OM-${String(order.id).padStart(4, '0')}`;
  }

  getTitleLabel(order: MaintenanceOrderI): string {
    const title = String(order.title || '').trim();
    if (title) return title;
    return 'Sin titulo';
  }

  getDescriptionLabel(order: MaintenanceOrderI): string {
    const description = order.description?.trim();
    if (description) return description;
    return 'Sin descripcion tecnica.';
  }

  getPriorityLabel(order: MaintenanceOrderI): string {
    const fromRecord = order.priority_label?.trim();
    if (fromRecord) return fromRecord;

    const catalog = this.priorityMap.get(this.normalizeCode(order.priority));
    if (catalog?.name?.trim()) return catalog.name.trim();

    return this.toTitleLabel(order.priority || 'Sin prioridad');
  }

  getStatusLabel(order: MaintenanceOrderI): string {
    const fromRecord = order.status_label?.trim();
    if (fromRecord) return fromRecord;

    const catalog = this.statusMap.get(this.normalizeCode(order.status));
    if (catalog?.name?.trim()) return catalog.name.trim();

    return this.toTitleLabel(order.status || 'Sin estado');
  }

  getStatusTone(order: MaintenanceOrderI): { bg: string; color: string; dot: string } {
    const code = this.normalizeCode(order.status);
    if (code === 'COMPLETADA') {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }
    if (code === 'ENPROCESO') {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-text)',
        dot: 'var(--gh-status-info-strong)'
      };
    }
    if (code === 'CANCELADA') {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        dot: 'var(--gh-text-muted)'
      };
    }
    return {
      bg: 'var(--gh-status-orange-bg)',
      color: 'var(--gh-status-orange-text)',
      dot: 'var(--gh-status-orange-strong)'
    };
  }

  getPriorityBadgeTone(order: MaintenanceOrderI): { bg: string; color: string; dot: string } {
    const tone = this.resolvePriorityTone(order);
    return {
      bg: tone.badgeBg,
      color: tone.badgeColor,
      dot: tone.accent
    };
  }

  getGroupTone(group: MaintenanceOrderGroup): MaintenancePriorityTone {
    return group.tone;
  }

  isHighlighted(groupKey: string, orderId: number): boolean {
    return this.highlightedByGroup.get(groupKey)?.has(orderId) || false;
  }

  isClosed(order: MaintenanceOrderI): boolean {
    const status = this.normalizeCode(order.status);
    return status === 'COMPLETADA' || status === 'CANCELADA';
  }

  /**
   * El compromiso dicho como consecuencia.
   *
   * En mantenimiento la fecha es la que se prometio (`estimated_completed_at`), y lo
   * util no es leerla sino saber si ya se incumplio.
   */
  getScheduleLabel(order: MaintenanceOrderI): string {
    if (this.isClosed(order)) {
      const done = this.parseDate(order.completed_at);
      return done ? `Cerrada el ${this.formatDate(order.completed_at)}` : 'Cerrada';
    }

    const estimated = this.parseDate(order.estimated_completed_at);
    if (!estimated) return 'Sin fecha comprometida';

    const days = this.daysFromToday(estimated);
    if (days < 0) return `Vencio hace ${Math.abs(days)} dia(s)`;
    if (days === 0) return 'Se prometio para hoy';
    if (days === 1) return 'Se prometio para maniana';
    return `Se prometio en ${days} dia(s)`;
  }

  /** El color de la tarjeta sale de la urgencia, no de la prioridad nominal. */
  getUrgencyTone(order: MaintenanceOrderI): { bg: string; bar: string } {
    if (this.isClosed(order)) {
      return { bg: 'var(--gh-status-neutral-bg)', bar: 'var(--gh-text-soft)' };
    }
    if (this.isDelayed(order)) {
      return { bg: 'var(--gh-status-danger-bg)', bar: 'var(--gh-status-danger-strong)' };
    }
    if (this.normalizeCode(order.status) === 'ENPROCESO') {
      return { bg: 'var(--gh-status-info-bg)', bar: 'var(--gh-status-info-strong)' };
    }
    return { bg: 'var(--gh-status-orange-bg)', bar: 'var(--gh-status-warn-strong)' };
  }

  /** Dias entre hoy y una fecha, ignorando la hora. */
  private daysFromToday(date: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  isDelayed(order: MaintenanceOrderI): boolean {
    const status = this.normalizeCode(order.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return false;

    const reported = this.parseDate(order.reported_at);
    if (!reported) return false;

    const now = new Date();
    const diffMs = now.getTime() - reported.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= 48;
  }

  getProgressActionLabel(order: MaintenanceOrderI): string {
    const status = this.normalizeCode(order.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return 'Reabrir';
    if (status === 'ENPROCESO') return 'Completar';
    return 'Iniciar';
  }

  getProgressActionIcon(order: MaintenanceOrderI): string {
    const status = this.normalizeCode(order.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return 'fa-solid fa-rotate-left';
    if (status === 'ENPROCESO') return 'fa-solid fa-check';
    return 'fa-solid fa-play';
  }

  trackByOrder(_: number, order: MaintenanceOrderI): number {
    return order.id;
  }

  trackByGroup(_: number, group: MaintenanceOrderGroup): string {
    return group.key;
  }

  /** Solo el dia: en el cierre de una orden la hora no aporta. */
  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    const parsed = this.parseDate(value);
    if (!parsed) return String(value);

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    const parsed = this.parseDate(value);
    if (!parsed) return String(value);

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private buildMaps(): void {
    this.roomMap = new Map(this.rooms.map((room) => [room.id, room]));

    this.priorityMap.clear();
    this.priorityOrderMap.clear();
    for (const priorityItem of this.priorities) {
      const normalized = this.normalizeCode(priorityItem.code);
      this.priorityMap.set(normalized, priorityItem);
      this.priorityOrderMap.set(normalized, Number(priorityItem.sort_order || 0));
    }

    this.statusMap.clear();
    this.statusCodeByNormalized.clear();
    for (const statusItem of this.statuses) {
      const normalized = this.normalizeCode(statusItem.code);
      this.statusMap.set(normalized, statusItem);
      this.statusCodeByNormalized.set(normalized, statusItem.code);
    }
  }

  private buildFilterOptions(): void {
    const sortedStatuses = [...this.statuses].sort((a, b) => {
      const byOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (byOrder !== 0) return byOrder;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });

    this.statusFilterOptions = [
      { value: 'ALL', label: 'Todos los estados' },
      ...sortedStatuses.map((statusItem) => ({
        value: statusItem.code,
        label: statusItem.name || this.toTitleLabel(statusItem.code)
      }))
    ];

    const sortedPriorities = [...this.priorities].sort((a, b) => {
      const byOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (byOrder !== 0) return byOrder;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });

    this.priorityFilterOptions = [
      { value: 'ALL', label: 'Todas las prioridades' },
      ...sortedPriorities.map((priorityItem) => ({
        value: priorityItem.code,
        label: priorityItem.name || this.toTitleLabel(priorityItem.code)
      }))
    ];

    const roomCounts = new Map<string, { label: string; count: number }>();
    for (const order of this.maintenanceOrders) {
      const key = this.getRoomKey(order);
      const label = this.getRoomLabel(order);
      const current = roomCounts.get(key) || { label, count: 0 };
      current.count += 1;
      roomCounts.set(key, current);
    }

    const roomOptions = Array.from(roomCounts.entries())
      .map(([key, data]) => ({
        value: key,
        label: `${data.label} (${data.count})`
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));

    this.roomFilterOptions = [{ value: 'ALL', label: 'Todas las habitaciones' }, ...roomOptions];

    if (!this.statusFilterOptions.some((option) => option.value === this.statusFilter)) {
      this.statusFilter = 'ALL';
    }
    if (!this.priorityFilterOptions.some((option) => option.value === this.selectedPriorityFilter)) {
      this.selectedPriorityFilter = 'ALL';
    }
    if (!this.roomFilterOptions.some((option) => option.value === this.selectedRoomFilter)) {
      this.selectedRoomFilter = 'ALL';
    }
  }

  private buildGroups(orders: MaintenanceOrderI[]): MaintenanceOrderGroup[] {
    const groupsMap = new Map<string, MaintenanceOrderGroup>();

    for (const order of orders) {
      const key = this.getPriorityKey(order);
      const label = this.getPriorityLabel(order);
      const code = this.getPriorityCode(order);
      const tone = this.resolvePriorityTone(order);
      const orderValue = this.resolvePriorityOrder(code);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          code,
          tone,
          order: orderValue,
          items: []
        });
      }

      groupsMap.get(key)?.items.push(order);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
    });

    this.highlightedByGroup.clear();
    for (const group of groups) {
      const delayed = group.items.filter((order) => this.isDelayed(order));
      if (delayed.length > 0) {
        this.highlightedByGroup.set(group.key, new Set(delayed.slice(0, 2).map((order) => order.id)));
        continue;
      }

      const inProgress = group.items
        .filter((order) => this.normalizeCode(order.status) === 'ENPROCESO')
        .slice(0, 1)
        .map((order) => order.id);
      this.highlightedByGroup.set(group.key, new Set(inProgress));
    }

    return groups;
  }

  private getPriorityKey(order: MaintenanceOrderI): string {
    const normalized = this.normalizeCode(this.getPriorityCode(order));
    if (normalized) return `priority:${normalized}`;
    return 'priority:unknown';
  }

  private getPriorityCode(order: MaintenanceOrderI): string {
    const raw = String(order.priority || '').trim();
    if (raw) return raw;
    return '';
  }

  private getRoomKey(order: MaintenanceOrderI): string {
    if (typeof order.room === 'number' && order.room > 0) return `room:${order.room}`;
    if (order.room_number?.trim()) return `room-number:${order.room_number.trim()}`;
    return 'room:unknown';
  }

  private resolvePriorityTone(order: MaintenanceOrderI): MaintenancePriorityTone {
    const normalized = this.normalizeCode(this.getPriorityCode(order));
    return PRIORITY_TONES[normalized] || PRIORITY_TONES['DEFAULT'];
  }

  private resolvePriorityOrder(code: string): number {
    const normalized = this.normalizeCode(code);
    const fromCatalog = this.priorityOrderMap.get(normalized);
    if (typeof fromCatalog === 'number') return fromCatalog;
    return 999;
  }

  private resolveNextStatusCode(order: MaintenanceOrderI): string | null {
    const current = this.normalizeCode(order.status);

    if (current === 'ENPROCESO') {
      return this.findStatusCode('COMPLETADA') || this.findStatusCode('PENDIENTE') || null;
    }

    if (current === 'COMPLETADA' || current === 'CANCELADA') {
      return this.findStatusCode('PENDIENTE') || this.findStatusCode('ENPROCESO') || null;
    }

    return this.findStatusCode('ENPROCESO') || this.findStatusCode('PENDIENTE') || null;
  }

  private updateOrderStatus(
    order: MaintenanceOrderI,
    nextCode: string,
    description: string | undefined = undefined
  ): void {
    const nextNormalized = this.normalizeCode(nextCode);
    const payload: Partial<MaintenanceOrderFormPayload> = {
      status: nextCode,
      completed_at: nextNormalized === 'COMPLETADA' ? this.toDateTimeLocal(new Date()) : null
    };

    if (typeof description === 'string') {
      payload.description = description;
    }

    this.statusUpdateLoading = true;
    this.maintenanceOrdersService.updateMaintenanceOrder(order.id, payload).subscribe({
      next: () => {
        this.statusUpdateLoading = false;
        this.resetCompletionCommentState();
        this.refreshMaintenanceOrders();
      },
      error: () => {
        this.statusUpdateLoading = false;
        if (this.showCompletionCommentModal) {
          this.completionCommentError = 'No fue posible completar la orden con el comentario.';
          return;
        }
        this.errorMessage = 'No fue posible actualizar el estado de la orden.';
      }
    });
  }

  private openCompletionCommentModal(order: MaintenanceOrderI, nextCode: string): void {
    this.pendingCompletionOrder = order;
    this.pendingCompletionStatusCode = nextCode;
    this.completionComment = '';
    this.completionCommentError = '';
    this.showCompletionCommentModal = true;
  }

  private resetCompletionCommentState(): void {
    this.showCompletionCommentModal = false;
    this.pendingCompletionOrder = null;
    this.pendingCompletionStatusCode = null;
    this.completionComment = '';
    this.completionCommentError = '';
  }

  private buildCompletionDescription(order: MaintenanceOrderI, comment: string): string | undefined {
    const trimmedComment = String(comment || '').trim();
    if (!trimmedComment) return undefined;

    const currentDescription = String(order.description || '').trim();
    const timestamp = this.formatCompletionCommentTimestamp(new Date());
    const commentEntry = `[${timestamp}] Cierre de mantenimiento: ${trimmedComment}`;

    if (!currentDescription) return commentEntry;
    return `${currentDescription}\n${commentEntry}`;
  }

  private findStatusCode(normalizedCode: string): string | null {
    return this.statusCodeByNormalized.get(this.normalizeCode(normalizedCode)) || null;
  }

  private toTitleLabel(value: unknown): string {
    return String(value || '')
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private normalizeCode(value: unknown): string {
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

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private toDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private formatCompletionCommentTimestamp(date: Date): string {
    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const year = date.getFullYear();
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
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
