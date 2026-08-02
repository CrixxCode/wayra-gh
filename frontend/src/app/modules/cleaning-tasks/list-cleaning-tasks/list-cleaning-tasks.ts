import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { MasterDataService } from '../../../services/master-data.service';
import { RoomService } from '../../../services/room';
import { RoomI } from '../../rooms/room-model';
import { CreateCleaningTask } from '../create-cleaning-task/create-cleaning-task';
import { DetailCleaningTask } from '../detail-cleaning-task/detail-cleaning-task';
import { CleaningTaskFormPayload, CleaningTaskI } from '../cleaning-task-model';

type CleaningTaskViewMode = 'cards' | 'table';

type CleaningTaskTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type CleaningTaskGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: CleaningTaskTone;
  items: CleaningTaskI[];
};

const TYPE_TONES: Record<string, CleaningTaskTone> = {
  DIARIA: {
    icon: 'fa-solid fa-broom-ball',
    iconBg: 'var(--gh-status-success-bg)',
    iconColor: 'var(--gh-status-success-text)',
    cover: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)',
    badgeBg: 'var(--gh-status-success-bg)',
    badgeColor: 'var(--gh-status-success-text)',
    accent: 'var(--gh-status-success-strong)'
  },
  SALIDA: {
    icon: 'fa-solid fa-door-open',
    iconBg: 'var(--gh-status-orange-bg)',
    iconColor: 'var(--gh-status-orange-text)',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: 'var(--gh-status-orange-bg)',
    badgeColor: 'var(--gh-status-orange-text)',
    accent: 'var(--gh-status-orange-strong)'
  },
  PROFUNDA: {
    icon: 'fa-solid fa-soap',
    iconBg: 'var(--gh-status-violet-bg)',
    iconColor: 'var(--gh-status-violet-text)',
    cover: 'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)',
    badgeBg: 'var(--gh-status-violet-bg)',
    badgeColor: 'var(--gh-status-violet-text)',
    accent: 'var(--gh-status-violet-text)'
  },
  INSPECCION: {
    icon: 'fa-solid fa-clipboard-check',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  DEFAULT: {
    icon: 'fa-solid fa-spray-can-sparkles',
    iconBg: 'var(--gh-status-neutral-bg)',
    iconColor: 'var(--gh-status-neutral-text)',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: 'var(--gh-status-neutral-bg)',
    badgeColor: 'var(--gh-status-neutral-text)',
    accent: 'var(--gh-text-muted)'
  }
};

@Component({
  selector: 'app-list-cleaning-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateCleaningTask, DetailCleaningTask],
  templateUrl: './list-cleaning-tasks.html',
  styleUrls: ['./list-cleaning-tasks.css']
})
export class ListCleaningTasks implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  viewMode: CleaningTaskViewMode = 'cards';
  showDeletedCleaningTasks = false;

  cleaningTasks: CleaningTaskI[] = [];
  deletedCleaningTasks: CleaningTaskI[] = [];
  filteredCleaningTasks: CleaningTaskI[] = [];
  groupedCleaningTasks: CleaningTaskGroup[] = [];
  rooms: RoomI[] = [];
  taskTypes: MasterDataI[] = [];
  statuses: MasterDataI[] = [];

  search = '';
  statusFilter = 'ALL';
  selectedTypeFilter = 'ALL';
  selectedRoomFilter = 'ALL';

  statusFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todos los estados' }];
  typeFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todos los tipos' }];
  roomFilterOptions: Array<{ value: string; label: string }> = [{ value: 'ALL', label: 'Todas las habitaciones' }];

  showCreateDrawer = false;
  selectedCleaningTask: CleaningTaskI | null = null;
  showCompletionCommentModal = false;
  completionComment = '';
  completionCommentError = '';
  statusUpdateLoading = false;

  private roomMap = new Map<number, RoomI>();
  private taskTypeMap = new Map<string, MasterDataI>();
  private statusMap = new Map<string, MasterDataI>();
  private taskTypeOrderMap = new Map<string, number>();
  private statusCodeByNormalized = new Map<string, string>();
  private highlightedByGroup = new Map<string, Set<number>>();
  private pendingCompletionTask: CleaningTaskI | null = null;
  private pendingCompletionStatusCode: string | null = null;

  constructor(
    private cleaningTasksService: CleaningTasksService,
    private roomService: RoomService,
    private masterDataService: MasterDataService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalTasks(): number {
    return this.cleaningTasks.length;
  }

  get deletedCleaningTasksCount(): number {
    return this.deletedCleaningTasks.length;
  }

  get pendingTasks(): number {
    return this.cleaningTasks.filter((task) => this.normalizeCode(task.status) === 'PENDIENTE').length;
  }

  get inProgressTasks(): number {
    return this.cleaningTasks.filter((task) => this.normalizeCode(task.status) === 'ENPROCESO').length;
  }

  get overdueTasks(): number {
    return this.cleaningTasks.filter((task) => this.isOverdue(task)).length;
  }

  get completedTasks(): number {
    return this.cleaningTasks.filter((task) => this.normalizeCode(task.status) === 'COMPLETADA').length;
  }

  get canCreateTask(): boolean {
    return this.rooms.length > 0 && this.taskTypes.length > 0 && this.statuses.length > 0;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedId = this.selectedCleaningTask?.id ?? null;

    forkJoin({
      cleaningTasks: this.cleaningTasksService
        .listCleaningTasks({ include_inactive: true })
        .pipe(catchError(() => of([] as CleaningTaskI[]))),
      allCleaningTasks: this.cleaningTasksService
        .listCleaningTasks({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as CleaningTaskI[]))),
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      taskTypes: this.masterDataService
        .listMasterData({ group: 'CLEANING_TASK_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      statuses: this.masterDataService
        .listMasterData({ group: 'CLEANING_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ cleaningTasks, allCleaningTasks, rooms, taskTypes, statuses }) => {
        this.loading = false;
        this.cleaningTasks = cleaningTasks;
        const visibleIds = new Set(cleaningTasks.map((task) => task.id));
        this.deletedCleaningTasks = allCleaningTasks.filter((task) => !visibleIds.has(task.id));
        this.rooms = rooms;
        this.taskTypes = taskTypes;
        this.statuses = statuses;

        if (selectedId) {
          this.selectedCleaningTask = cleaningTasks.find((task) => task.id === selectedId) || null;
        }

        this.buildMaps();
        this.buildFilterOptions();
        this.applyFilters();

        if (!rooms.length) {
          this.infoMessage = 'No hay habitaciones disponibles para crear tareas.';
        } else if (!taskTypes.length) {
          this.infoMessage = 'No hay tipos de tarea activos en master data.';
        } else if (!statuses.length) {
          this.infoMessage = 'No hay estados de limpieza activos en master data.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar las tareas de limpieza.';
      }
    });
  }

  refreshCleaningTasks(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredCleaningTasks.length) return;

    const headers = ['codigo', 'habitacion', 'tipo_tarea', 'estado', 'fecha_programada', 'fecha_finalizacion', 'notas'];
    const rows = this.filteredCleaningTasks.map((task) => {
      const row = [
        this.getTaskCode(task),
        this.getRoomLabel(task),
        this.getTaskTypeLabel(task),
        this.getStatusLabel(task),
        this.formatDate(task.scheduled_for),
        this.formatDateTime(task.completed_at),
        this.getNotesLabel(task)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tareas-limpieza-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredCleaningTasks = this.cleaningTasks.filter((task) => {
      const statusMatch =
        this.statusFilter === 'ALL' || this.normalizeCode(task.status) === this.normalizeCode(this.statusFilter);

      const typeMatch =
        this.selectedTypeFilter === 'ALL' ||
        this.normalizeCode(this.getTaskTypeCode(task)) === this.normalizeCode(this.selectedTypeFilter);

      const roomMatch = this.selectedRoomFilter === 'ALL' || this.getRoomKey(task) === this.selectedRoomFilter;

      const searchPool = [
        this.getTaskCode(task),
        this.getRoomLabel(task),
        this.getTaskTypeLabel(task),
        this.getStatusLabel(task),
        this.getNotesLabel(task),
        task.scheduled_for || '',
        task.completed_at || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && typeMatch && roomMatch && searchMatch;
    });

    this.groupedCleaningTasks = this.buildGroups(this.filteredCleaningTasks);
  }

  setViewMode(mode: CleaningTaskViewMode): void {
    this.viewMode = mode;
  }

  openCreateDrawer(): void {
    this.selectedCleaningTask = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onCleaningTaskCreated(): void {
    this.showCreateDrawer = false;
    this.refreshCleaningTasks();
  }

  openDetail(task: CleaningTaskI): void {
    this.showCreateDrawer = false;
    this.selectedCleaningTask = task;
  }

  closeDetail(): void {
    this.selectedCleaningTask = null;
  }

  advanceTaskStatus(task: CleaningTaskI): void {
    this.errorMessage = '';
    const nextCode = this.resolveNextStatusCode(task);
    if (!nextCode) return;

    const nextNormalized = this.normalizeCode(nextCode);
    if (nextNormalized === 'COMPLETADA') {
      this.openCompletionCommentModal(task, nextCode);
      return;
    }

    this.updateTaskStatus(task, nextCode);
  }

  closeCompletionCommentModal(): void {
    if (this.statusUpdateLoading) return;
    this.resetCompletionCommentState();
  }

  submitCompletionWithComment(): void {
    if (this.statusUpdateLoading) return;
    if (!this.pendingCompletionTask || !this.pendingCompletionStatusCode) return;

    this.completionCommentError = '';

    const completionNotes = this.buildCompletionNotes(
      this.pendingCompletionTask,
      this.completionComment
    );

    this.updateTaskStatus(
      this.pendingCompletionTask,
      this.pendingCompletionStatusCode,
      completionNotes
    );
  }

  getCompletionTaskCode(): string {
    if (!this.pendingCompletionTask) return '--';
    return this.getTaskCode(this.pendingCompletionTask);
  }

  getCompletionRoomLabel(): string {
    if (!this.pendingCompletionTask) return 'Habitacion no definida';
    return this.getRoomLabel(this.pendingCompletionTask);
  }

  confirmDelete(task: CleaningTaskI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: this.getTaskCode(task),
      onAccept: () => {
        this.errorMessage = '';
        this.cleaningTasksService.deleteCleaningTask(task.id).subscribe({
          next: () => {
            if (this.selectedCleaningTask?.id === task.id) {
              this.closeDetail();
            }
            this.refreshCleaningTasks();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar la tarea seleccionada.';
          }
        });
      }
    });
  }

  restoreCleaningTask(task: CleaningTaskI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: this.getTaskCode(task),
      onAccept: () => {
        this.errorMessage = '';
        this.cleaningTasksService.restoreCleaningTask(task.id).subscribe({
          next: () => {
            this.refreshCleaningTasks();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar la tarea seleccionada.';
          }
        });
      }
    });
  }

  getRoomLabel(task: CleaningTaskI): string {
    if (task.room_number?.trim()) return `Habitacion ${task.room_number.trim()}`;

    if (typeof task.room === 'number' && task.room > 0) {
      const room = this.roomMap.get(task.room);
      if (room?.number?.trim()) return `Habitacion ${room.number.trim()}`;
      return `Habitacion #${task.room}`;
    }

    return 'Habitacion no definida';
  }

  getTaskCode(task: CleaningTaskI): string {
    return `TL-${String(task.id).padStart(4, '0')}`;
  }

  getTaskTypeLabel(task: CleaningTaskI): string {
    const fromRecord = task.task_type_label?.trim();
    if (fromRecord) return fromRecord;

    const catalog = this.taskTypeMap.get(this.normalizeCode(task.task_type));
    if (catalog?.name?.trim()) return catalog.name.trim();

    return this.toTitleLabel(task.task_type || 'Sin tipo');
  }

  getStatusLabel(task: CleaningTaskI): string {
    const fromRecord = task.status_label?.trim();
    if (fromRecord) return fromRecord;

    const catalog = this.statusMap.get(this.normalizeCode(task.status));
    if (catalog?.name?.trim()) return catalog.name.trim();

    return this.toTitleLabel(task.status || 'Sin estado');
  }

  getNotesLabel(task: CleaningTaskI): string {
    const notes = task.notes?.trim();
    if (notes) return notes;
    return 'Sin notas operativas.';
  }

  getStatusTone(task: CleaningTaskI): { bg: string; color: string; dot: string } {
    const code = this.normalizeCode(task.status);
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

  getTypeBadgeTone(task: CleaningTaskI): { bg: string; color: string; dot: string } {
    const tone = this.resolveTypeTone(task);
    return {
      bg: tone.badgeBg,
      color: tone.badgeColor,
      dot: tone.accent
    };
  }

  getGroupTone(group: CleaningTaskGroup): CleaningTaskTone {
    return group.tone;
  }

  isHighlighted(groupKey: string, taskId: number): boolean {
    return this.highlightedByGroup.get(groupKey)?.has(taskId) || false;
  }

  isOverdue(task: CleaningTaskI): boolean {
    const status = this.normalizeCode(task.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return false;

    const scheduled = this.parseDate(task.scheduled_for);
    if (!scheduled) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduled.setHours(0, 0, 0, 0);

    return scheduled.getTime() < today.getTime();
  }

  getProgressActionLabel(task: CleaningTaskI): string {
    const status = this.normalizeCode(task.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return 'Reabrir';
    if (status === 'ENPROCESO') return 'Completar';
    return 'Iniciar';
  }

  getProgressActionIcon(task: CleaningTaskI): string {
    const status = this.normalizeCode(task.status);
    if (status === 'COMPLETADA' || status === 'CANCELADA') return 'fa-solid fa-rotate-left';
    if (status === 'ENPROCESO') return 'fa-solid fa-check';
    return 'fa-solid fa-play';
  }

  trackByTask(_: number, task: CleaningTaskI): number {
    return task.id;
  }

  trackByGroup(_: number, group: CleaningTaskGroup): string {
    return group.key;
  }

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

    this.taskTypeMap.clear();
    this.taskTypeOrderMap.clear();
    for (const taskType of this.taskTypes) {
      const normalized = this.normalizeCode(taskType.code);
      this.taskTypeMap.set(normalized, taskType);
      this.taskTypeOrderMap.set(normalized, Number(taskType.sort_order || 0));
    }

    this.statusMap.clear();
    this.statusCodeByNormalized.clear();
    for (const status of this.statuses) {
      const normalized = this.normalizeCode(status.code);
      this.statusMap.set(normalized, status);
      this.statusCodeByNormalized.set(normalized, status.code);
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
      ...sortedStatuses.map((status) => ({
        value: status.code,
        label: status.name || this.toTitleLabel(status.code)
      }))
    ];

    const sortedTypes = [...this.taskTypes].sort((a, b) => {
      const byOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (byOrder !== 0) return byOrder;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });

    this.typeFilterOptions = [
      { value: 'ALL', label: 'Todos los tipos' },
      ...sortedTypes.map((taskType) => ({
        value: taskType.code,
        label: taskType.name || this.toTitleLabel(taskType.code)
      }))
    ];

    const roomCounts = new Map<string, { label: string; count: number }>();
    for (const task of this.cleaningTasks) {
      const key = this.getRoomKey(task);
      const label = this.getRoomLabel(task);
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
    if (!this.typeFilterOptions.some((option) => option.value === this.selectedTypeFilter)) {
      this.selectedTypeFilter = 'ALL';
    }
    if (!this.roomFilterOptions.some((option) => option.value === this.selectedRoomFilter)) {
      this.selectedRoomFilter = 'ALL';
    }
  }

  private buildGroups(tasks: CleaningTaskI[]): CleaningTaskGroup[] {
    const groupsMap = new Map<string, CleaningTaskGroup>();

    for (const task of tasks) {
      const key = this.getTaskTypeKey(task);
      const label = this.getTaskTypeLabel(task);
      const code = this.getTaskTypeCode(task);
      const tone = this.resolveTypeTone(task);
      const order = this.resolveTypeOrder(code);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          code,
          tone,
          order,
          items: []
        });
      }

      groupsMap.get(key)?.items.push(task);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
    });

    this.highlightedByGroup.clear();
    for (const group of groups) {
      const overdueTasks = group.items.filter((task) => this.isOverdue(task));

      if (overdueTasks.length > 0) {
        this.highlightedByGroup.set(group.key, new Set(overdueTasks.slice(0, 2).map((task) => task.id)));
        continue;
      }

      const soonest = [...group.items]
        .filter((task) => !!task.scheduled_for)
        .sort((a, b) => {
          const aTime = this.parseDate(a.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
          const bTime = this.parseDate(b.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })
        .slice(0, 1)
        .map((task) => task.id);

      this.highlightedByGroup.set(group.key, new Set(soonest));
    }

    return groups;
  }

  private getTaskTypeKey(task: CleaningTaskI): string {
    const normalized = this.normalizeCode(this.getTaskTypeCode(task));
    if (normalized) return `type:${normalized}`;
    return 'type:unknown';
  }

  private getTaskTypeCode(task: CleaningTaskI): string {
    const raw = String(task.task_type || '').trim();
    if (raw) return raw;
    return '';
  }

  private getRoomKey(task: CleaningTaskI): string {
    if (typeof task.room === 'number' && task.room > 0) return `room:${task.room}`;
    if (task.room_number?.trim()) return `room-number:${task.room_number.trim()}`;
    return 'room:unknown';
  }

  private resolveTypeTone(task: CleaningTaskI): CleaningTaskTone {
    const normalized = this.normalizeCode(this.getTaskTypeCode(task));
    return TYPE_TONES[normalized] || TYPE_TONES['DEFAULT'];
  }

  private resolveTypeOrder(code: string): number {
    const normalized = this.normalizeCode(code);
    const fromCatalog = this.taskTypeOrderMap.get(normalized);
    if (typeof fromCatalog === 'number') return fromCatalog;
    return 999;
  }

  private resolveNextStatusCode(task: CleaningTaskI): string | null {
    const current = this.normalizeCode(task.status);

    if (current === 'ENPROCESO') {
      return this.findStatusCode('COMPLETADA') || this.findStatusCode('PENDIENTE') || null;
    }

    if (current === 'COMPLETADA' || current === 'CANCELADA') {
      return this.findStatusCode('PENDIENTE') || this.findStatusCode('ENPROCESO') || null;
    }

    return this.findStatusCode('ENPROCESO') || this.findStatusCode('PENDIENTE') || null;
  }

  private updateTaskStatus(
    task: CleaningTaskI,
    nextCode: string,
    notes: string | undefined = undefined
  ): void {
    const nextNormalized = this.normalizeCode(nextCode);
    const payload: Partial<CleaningTaskFormPayload> = {
      status: nextCode,
      completed_at: nextNormalized === 'COMPLETADA' ? this.toDateTimeLocal(new Date()) : null
    };
    if (typeof notes === 'string') {
      payload.notes = notes;
    }

    this.statusUpdateLoading = true;
    this.cleaningTasksService.updateCleaningTask(task.id, payload).subscribe({
      next: () => {
        this.statusUpdateLoading = false;
        this.resetCompletionCommentState();
        this.refreshCleaningTasks();
      },
      error: () => {
        this.statusUpdateLoading = false;
        if (this.showCompletionCommentModal) {
          this.completionCommentError = 'No fue posible completar la tarea con el comentario.';
          return;
        }
        this.errorMessage = 'No fue posible actualizar el estado de la tarea.';
      }
    });
  }

  private openCompletionCommentModal(task: CleaningTaskI, nextCode: string): void {
    this.pendingCompletionTask = task;
    this.pendingCompletionStatusCode = nextCode;
    this.completionComment = '';
    this.completionCommentError = '';
    this.showCompletionCommentModal = true;
  }

  private resetCompletionCommentState(): void {
    this.showCompletionCommentModal = false;
    this.pendingCompletionTask = null;
    this.pendingCompletionStatusCode = null;
    this.completionComment = '';
    this.completionCommentError = '';
  }

  private buildCompletionNotes(task: CleaningTaskI, comment: string): string | undefined {
    const trimmedComment = String(comment || '').trim();
    if (!trimmedComment) return undefined;

    const currentNotes = String(task.notes || '').trim();
    const timestamp = this.formatCompletionCommentTimestamp(new Date());
    const commentEntry = `[${timestamp}] Cierre de limpieza: ${trimmedComment}`;

    if (!currentNotes) return commentEntry;
    return `${currentNotes}\n${commentEntry}`;
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

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

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
