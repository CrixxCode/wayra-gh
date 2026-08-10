import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../../services/room';
import { errorActionAlert, successActionAlert } from '../../../../services/action-alerts';
import { openActionConfirmation } from '../../../../services/action-confirmations';
import { AmenityI, RoomI } from '../../room-model';
import {
  AMENITY_ICON_CATALOG,
  DEFAULT_AMENITY_ICON,
  isCatalogAmenityIcon
} from '../../amenity-icons';
import { extractApiErrorMessage } from '../../api-error';

type FormMode = 'closed' | 'create' | 'edit';

@Component({
  selector: 'app-amenities-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './amenities-manager.html',
  styleUrls: ['./amenities-manager.css']
})
export class AmenitiesManager implements OnInit {
  @Input() embedded = false;
  /** Habitaciones ya cargadas por la vista padre, para calcular el uso sin otra peticion. */
  @Input() rooms: RoomI[] = [];

  @Output() closed = new EventEmitter<void>();
  /** Se emite cuando algo cambio y la vista padre debe recargar. */
  @Output() changed = new EventEmitter<void>();

  readonly iconCatalog = AMENITY_ICON_CATALOG;

  loading = false;
  saving = false;
  feedback = '';
  feedbackKind: 'error' | 'info' = 'info';

  amenities: AmenityI[] = [];
  deletedAmenities: AmenityI[] = [];
  filteredAmenities: AmenityI[] = [];

  search = '';
  showDeleted = false;

  formMode: FormMode = 'closed';
  editingId: number | null = null;
  form = this.emptyForm();

  private usageByAmenity = new Map<number, number>();
  private dirty = false;

  constructor(
    private roomService: RoomService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.usageByAmenity = this.buildUsageMap(this.rooms);
    this.loadAmenities();
  }

  get activeCount(): number {
    return this.amenities.filter((item) => item.is_active !== false).length;
  }

  get inactiveCount(): number {
    return this.amenities.filter((item) => item.is_active === false).length;
  }

  get visibleAmenities(): AmenityI[] {
    return this.showDeleted ? this.deletedAmenities : this.filteredAmenities;
  }

  loadAmenities(): void {
    this.loading = true;

    forkJoin({
      visible: this.roomService
        .listAmenities({ include_inactive: true })
        .pipe(catchError(() => of([] as AmenityI[]))),
      withDeleted: this.roomService
        .listAmenities({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as AmenityI[])))
    }).subscribe({
      next: ({ visible, withDeleted }) => {
        this.loading = false;
        this.amenities = this.sortByName(visible);

        const visibleIds = new Set(this.amenities.map((item) => item.id));
        this.deletedAmenities = this.sortByName(
          withDeleted.filter((item) => !visibleIds.has(item.id))
        );

        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.setFeedback('No se pudieron cargar las amenidades.', 'error');
      }
    });
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();

    this.filteredAmenities = this.amenities.filter((item) => {
      if (!query) return true;
      const pool = [item.name, item.description || ''].join(' ').toLowerCase();
      return pool.includes(query);
    });
  }

  toggleDeletedView(): void {
    this.showDeleted = !this.showDeleted;
    this.closeForm();
  }

  openCreate(): void {
    this.formMode = 'create';
    this.editingId = null;
    this.form = this.emptyForm();
    this.feedback = '';
  }

  openEdit(item: AmenityI): void {
    this.formMode = 'edit';
    this.editingId = item.id;
    this.form = {
      name: item.name || '',
      description: item.description || '',
      icon: isCatalogAmenityIcon(item.icon) ? (item.icon as string) : DEFAULT_AMENITY_ICON,
      is_active: item.is_active !== false
    };
    this.feedback = '';
  }

  closeForm(): void {
    if (this.saving) return;
    this.formMode = 'closed';
    this.editingId = null;
  }

  selectIcon(icon: string): void {
    this.form.icon = icon;
  }

  save(): void {
    if (this.saving) return;

    const name = this.form.name.trim();
    if (!name) {
      this.setFeedback('El nombre de la amenidad es obligatorio.', 'error');
      return;
    }

    if (!isCatalogAmenityIcon(this.form.icon)) {
      this.setFeedback('Selecciona un icono del catalogo.', 'error');
      return;
    }

    const payload: Partial<AmenityI> = {
      name,
      description: this.form.description.trim(),
      icon: this.form.icon,
      is_active: this.form.is_active
    };

    const isEdit = this.formMode === 'edit' && this.editingId !== null;
    const request$ = isEdit
      ? this.roomService.updateAmenity(this.editingId as number, payload)
      : this.roomService.createAmenity(payload);

    this.saving = true;
    request$.subscribe({
      next: () => {
        this.saving = false;
        this.formMode = 'closed';
        this.editingId = null;
        this.markDirty();
        this.setFeedback(successActionAlert(isEdit ? 'update' : 'create', 'amenidad'), 'info');
        this.loadAmenities();
      },
      error: (error) => {
        this.saving = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert(isEdit ? 'update' : 'create', 'amenidad')),
          'error'
        );
      }
    });
  }

  askDelete(item: AmenityI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: item.name || 'amenidad',
      onAccept: () => {
        this.roomService.deleteAmenity(item.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('delete', 'amenidad'), 'info');
            this.loadAmenities();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('delete', 'amenidad')),
              'error'
            );
          }
        });
      }
    });
  }

  askRestore(item: AmenityI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: item.name || 'amenidad',
      onAccept: () => {
        this.roomService.restoreAmenity(item.id).subscribe({
          next: () => {
            this.markDirty();
            this.setFeedback(successActionAlert('restore', 'amenidad'), 'info');
            this.loadAmenities();
          },
          error: (error) => {
            this.setFeedback(
              extractApiErrorMessage(error, errorActionAlert('restore', 'amenidad')),
              'error'
            );
          }
        });
      }
    });
  }

  close(): void {
    if (this.saving) return;
    if (this.dirty) this.changed.emit();
    this.closed.emit();
  }

  getUsageCount(id: number): number {
    return this.usageByAmenity.get(id) || 0;
  }

  iconLabel(icon?: string | null): string {
    return this.iconCatalog.find((option) => option.value === icon)?.label || 'Sin icono';
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  trackByIcon(_: number, option: { value: string }): string {
    return option.value;
  }

  private emptyForm() {
    return {
      name: '',
      description: '',
      icon: DEFAULT_AMENITY_ICON,
      is_active: true
    };
  }

  private markDirty(): void {
    this.dirty = true;
  }

  private setFeedback(message: string, kind: 'error' | 'info'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }

  private sortByName(items: AmenityI[]): AmenityI[] {
    return [...items].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );
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
}
