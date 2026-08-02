import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { MasterDataGroupI, MasterDataI } from './master-data-model';
import { MasterDataService } from '../../../services/master-data.service';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';

type ToastKind = 'success' | 'danger' | 'info';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

@Component({
  selector: 'app-master-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './master-data.html',
  styleUrls: ['./master-data.css']
})
export class MasterDataComponent implements OnInit {
  loading = false;
  saving = false;

  allItems: MasterDataI[] = [];
  filteredItems: MasterDataI[] = [];
  groups: MasterDataGroupI[] = [];

  search = '';
  selectedGroup = 'ALL';
  selectedStatus: StatusFilter = 'ALL';

  showDrawer = false;
  isEditing = false;
  editingId: number | null = null;
  showGroupQuickCreate = false;
  newGroupCode = '';

  form: {
    group: string;
    code: string;
    name: string;
    description: string;
    is_active: boolean;
    sort_order: number;
  } = this.emptyForm();

  deleteTarget: MasterDataI | null = null;

  toastVisible = false;
  toastText = '';
  toastKind: ToastKind = 'info';
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private masterDataService: MasterDataService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
  }

  get totalItems(): number {
    return this.allItems.length;
  }

  get activeItems(): number {
    return this.allItems.filter((item) => item.is_active).length;
  }

  get inactiveItems(): number {
    return this.allItems.filter((item) => !item.is_active).length;
  }

  get totalGroups(): number {
    return this.groups.length;
  }

  trackById(_: number, item: MasterDataI): number {
    return item.id;
  }

  loadInitialData(): void {
    this.loading = true;
    this.masterDataService.listGroups().subscribe({
      next: (groups) => {
        this.groups = Array.isArray(groups) ? groups : [];
        this.loadMasterData();
      },
      error: () => {
        this.groups = [];
        this.loadMasterData();
      }
    });
  }

  loadMasterData(): void {
    this.loading = true;
    this.masterDataService
      .listMasterDataAll({ ordering: 'group,sort_order,name', include_inactive: true })
      .subscribe({
      next: (items) => {
        this.allItems = Array.isArray(items) ? items : [];
        this.loading = false;
        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.allItems = [];
        this.filteredItems = [];
        this.toast('No se pudo cargar el catalogo maestro.', 'danger');
      }
      });
  }

  applyFilters(): void {
    const q = this.search.trim().toLowerCase();

    this.filteredItems = this.allItems.filter((item) => {
      const matchesGroup = this.selectedGroup === 'ALL' || item.group === this.selectedGroup;

      const matchesStatus =
        this.selectedStatus === 'ALL' ||
        (this.selectedStatus === 'ACTIVE' && item.is_active) ||
        (this.selectedStatus === 'INACTIVE' && !item.is_active);

      const pool = [item.group, item.code, item.name, item.description || ''].join(' ').toLowerCase();
      const matchesSearch = !q || pool.includes(q);

      return matchesGroup && matchesStatus && matchesSearch;
    });
  }

  openCreate(): void {
    this.isEditing = false;
    this.editingId = null;
    this.form = this.emptyForm();
    if (this.selectedGroup !== 'ALL') {
      this.form.group = this.selectedGroup;
    }
    this.showDrawer = true;
  }

  openCreateGroup(): void {
    this.showDrawer = false;
    this.newGroupCode = '';
    this.showGroupQuickCreate = true;
  }

  closeCreateGroup(): void {
    this.showGroupQuickCreate = false;
    this.newGroupCode = '';
  }

  startCreateWithNewGroup(): void {
    const normalizedGroup = this.normalizeGroupCode(this.newGroupCode);
    if (!normalizedGroup) {
      this.toast('El codigo de grupo es obligatorio.', 'danger');
      return;
    }

    if (!/^[A-Z0-9_]+$/.test(normalizedGroup)) {
      this.toast('Usa solo letras, numeros y guion bajo para el grupo.', 'danger');
      return;
    }

    this.closeCreateGroup();
    this.openCreate();
    this.form.group = normalizedGroup;
    this.toast(`Grupo ${normalizedGroup} listo. Crea su primer valor.`, 'info');
  }

  openEdit(item: MasterDataI): void {
    this.isEditing = true;
    this.editingId = item.id;
    this.form = {
      group: item.group,
      code: item.code,
      name: item.name,
      description: item.description || '',
      is_active: item.is_active,
      sort_order: Number(item.sort_order || 0)
    };
    this.showDrawer = true;
  }

  closeDrawer(): void {
    if (this.saving) return;
    this.showDrawer = false;
  }

  save(): void {
    if (this.saving) return;

    const group = (this.form.group || '').trim().toUpperCase();
    const code = (this.form.code || '').trim().toUpperCase();
    const name = (this.form.name || '').trim();
    const description = (this.form.description || '').trim();

    if (!group || !code || !name) {
      this.toast('Grupo, codigo y nombre son obligatorios.', 'danger');
      return;
    }

    const payload: Partial<MasterDataI> = {
      group,
      code,
      name,
      description,
      is_active: !!this.form.is_active,
      sort_order: Number(this.form.sort_order || 0)
    };

    this.saving = true;
    if (this.isEditing && this.editingId) {
      this.masterDataService.updateMasterData(this.editingId, payload).subscribe({
        next: () => {
          this.saving = false;
          this.showDrawer = false;
          this.toast(successActionAlert('update', 'valor de catalogo'), 'success');
          this.loadInitialData();
        },
        error: (error) => {
          this.saving = false;
          this.toast(this.extractErrorMessage(error, errorActionAlert('update', 'valor de catalogo')), 'danger');
        }
      });
      return;
    }

    this.masterDataService.createMasterData(payload).subscribe({
      next: () => {
        this.saving = false;
        this.showDrawer = false;
        this.toast(successActionAlert('create', 'valor de catalogo'), 'success');
        this.loadInitialData();
      },
      error: (error) => {
        this.saving = false;
        this.toast(this.extractErrorMessage(error, errorActionAlert('create', 'valor de catalogo')), 'danger');
      }
    });
  }

  askDelete(item: MasterDataI): void {
    this.deleteTarget = item;
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: `${item.group} ${item.code}`.trim(),
      onAccept: () => this.confirmDelete()
    });
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const targetId = this.deleteTarget.id;

    this.masterDataService.deleteMasterData(targetId).subscribe({
      next: () => {
        this.deleteTarget = null;
        this.toast(successActionAlert('delete', 'valor de catalogo'), 'success');
        this.loadInitialData();
      },
      error: (error) => {
        this.deleteTarget = null;
        this.toast(this.extractErrorMessage(error, errorActionAlert('delete', 'valor de catalogo')), 'danger');
      }
    });
  }

  getStatusLabel(item: MasterDataI): string {
    return item.is_active ? 'Activo' : 'Inactivo';
  }

  private emptyForm() {
    return {
      group: '',
      code: '',
      name: '',
      description: '',
      is_active: true,
      sort_order: 0
    };
  }

  private normalizeGroupCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
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
}
