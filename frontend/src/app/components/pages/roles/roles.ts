import { Component, OnInit } from '@angular/core';
import { DeletedRecordRow, DeletedRecords } from '../../shared/deleted-records/deleted-records';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobTitle, RolesService, Role, UserMini } from '../../../services/roles.service';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { makeUniqueIdentifier } from '../../../shared/auto-identifiers';

type ToastKind = 'success' | 'danger' | 'info';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, DeletedRecords],
  templateUrl: './roles.html',
  styleUrls: ['./roles.css'],
})
export class RolesComponent implements OnInit {
  // Data
  roles: Role[] = [];
  selectedRole: Role | null = null;

  /**
   * Cargos del rol seleccionado. El cargo es obligatorio al crear un usuario y no habia
   * pantalla para darlos de alta: un rol nuevo sin cargos bloqueaba el alta de usuarios.
   */
  jobTitles: JobTitle[] = [];
  loadingJobTitles = false;
  savingJobTitle = false;
  newJobTitleName = '';
  editingJobTitleId: string | null = null;
  editingJobTitleName = '';

  assignedUsers: UserMini[] = [];
  catalogUsers: UserMini[] = []; // resultados de búsqueda (disponibles del servidor)

  // UI state
  loadingRoles = false;
  loadingAssigned = false;
  loadingCatalog = false;

  roleFilter = '';
  qAvailable = '';
  qAssigned = '';

  // selection in transfer lists
  selectedAvailableIds = new Set<string>();
  selectedAssignedIds = new Set<string>();

  // Role editor drawer
  showRoleDrawer = false;
  isEditing = false;
  roleForm: Partial<Role> = { name: '', slug: '', description: '' };

  // Toast
  toastVisible = false;
  toastText = '';
  toastKind: ToastKind = 'info';
  private toastTimer?: any;

  // debounce timers
  private catalogDebounce?: any;
  private roleUserCounts = new Map<string, number>();
  private roleCountsRequestId = 0;

  constructor(
    private rolesSvc: RolesService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadRoles();
  }

  // ---------- Helpers ----------
  trackById(_: number, item: any) {
    return item?.id;
  }

  fullName(u: UserMini): string {
    return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
  }

  get assignedIds(): Set<string> {
    return new Set(this.assignedUsers.map(u => u.id));
  }

  filteredRoles(): Role[] {
    const f = (this.roleFilter || '').trim().toLowerCase();
    if (!f) return this.roles;
    return this.roles.filter(r =>
      (r.name || '').toLowerCase().includes(f) ||
      (r.slug || '').toLowerCase().includes(f)
    );
  }

  // Catalog users returned by backend search = candidates; we subtract already assigned
  availableUsers(): UserMini[] {
    const assigned = this.assignedIds;
    let list = (this.catalogUsers || []).filter(u => !assigned.has(u.id));

    // filtro local adicional (por si quieres refinar sin pedir al backend)
    const f = (this.qAvailable || '').trim().toLowerCase();
    if (f) {
      list = list.filter(u =>
        (u.username || '').toLowerCase().includes(f) ||
        (u.email || '').toLowerCase().includes(f) ||
        (u.first_name || '').toLowerCase().includes(f) ||
        (u.last_name || '').toLowerCase().includes(f)
      );
    }
    return list;
  }

  assignedUsersFiltered(): UserMini[] {
    let list = [...(this.assignedUsers || [])];
    const f = (this.qAssigned || '').trim().toLowerCase();
    if (f) {
      list = list.filter(u =>
        (u.username || '').toLowerCase().includes(f) ||
        (u.email || '').toLowerCase().includes(f) ||
        (u.first_name || '').toLowerCase().includes(f) ||
        (u.last_name || '').toLowerCase().includes(f)
      );
    }
    return list;
  }

  get totalRoles(): number {
    return this.roles.length;
  }

  get rolesWithUsersCount(): number {
    let count = 0;
    for (const role of this.roles) {
      if ((this.roleUserCounts.get(role.id) || 0) > 0) count += 1;
    }
    return count;
  }

  get selectedRoleAssignedCount(): number {
    return this.assignedUsers.length;
  }

  get selectedRoleAvailableCount(): number {
    const assigned = this.assignedIds;
    return (this.catalogUsers || []).filter((u) => !assigned.has(u.id)).length;
  }

  // ---------- Toast ----------
  private toast(msg: string, kind: ToastKind = 'info') {
    this.toastText = msg;
    this.toastKind = kind;
    this.toastVisible = true;

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2400);
  }

  // ---------- Roles CRUD ----------
  showDeleted = false;
  loadingDeleted = false;
  deletedRows: DeletedRecordRow[] = [];
  restoringDeletedId: string | number | null = null;

  toggleDeleted(): void {
    this.showDeleted = !this.showDeleted;
    if (this.showDeleted) this.loadDeleted();
  }

  /** Eliminados = lo que aparece con `include_deleted` y no en el listado normal. */
  loadDeleted(): void {
    this.loadingDeleted = true;
    forkJoin({
      visible: this.rolesSvc.listRoles(),
      all: this.rolesSvc.listRoles({ include_deleted: true })
    }).subscribe({
      next: ({ visible, all }) => {
        const visibleIds = new Set((visible || []).map((row: { id: unknown }) => String(row.id)));
        this.deletedRows = (all || [])
          .filter((row: { id: unknown }) => !visibleIds.has(String(row.id)))
          .map((row: any) => ({ id: row.id, label: row.name, detail: row.slug }));
        this.loadingDeleted = false;
      },
      error: () => {
        this.loadingDeleted = false;
        this.deletedRows = [];
      }
    });
  }

  restoreDeleted(id: string | number): void {
    this.restoringDeletedId = id;
    this.rolesSvc.restoreRole(String(id)).subscribe({
      next: () => {
        this.restoringDeletedId = null;
        this.loadRoles();
        this.loadDeleted();
      },
      error: () => {
        this.restoringDeletedId = null;
      }
    });
  }

  loadRoles(): void {
    this.loadingRoles = true;
    this.rolesSvc.listRoles().subscribe({
      next: (data) => {
        this.roles = Array.isArray(data) ? data : [];
        this.loadingRoles = false;
        this.refreshRoleUserCounts();
      },
      error: () => {
        this.roles = [];
        this.loadingRoles = false;
        this.toast('No se pudieron cargar los roles.', 'danger');
      },
    });
  }

  selectRole(role: Role): void {
    this.selectedRole = role;

    // reset transfer selections
    this.selectedAvailableIds.clear();
    this.selectedAssignedIds.clear();
    this.qAvailable = '';
    this.qAssigned = '';

    // cargar asignados + precargar catálogo
    this.loadAssignedUsers();
    this.searchCatalogUsers(''); // primer load
    this.loadJobTitles();
  }

  // ---------------------------------------------------------------- cargos

  get activeJobTitlesCount(): number {
    return this.jobTitles.filter((jobTitle) => jobTitle.is_active !== false).length;
  }

  loadJobTitles(): void {
    const roleId = this.selectedRole?.id;
    this.cancelEditJobTitle();
    if (!roleId) {
      this.jobTitles = [];
      return;
    }
    this.loadingJobTitles = true;
    this.rolesSvc.allRoleJobTitles(roleId).subscribe({
      next: (jobTitles) => {
        if (this.selectedRole?.id !== roleId) return;
        this.jobTitles = jobTitles;
        this.loadingJobTitles = false;
      },
      error: () => {
        this.jobTitles = [];
        this.loadingJobTitles = false;
        this.toast('No se pudieron cargar los cargos del rol.', 'danger');
      }
    });
  }

  createJobTitle(): void {
    const roleId = this.selectedRole?.id;
    const name = this.newJobTitleName.trim();
    if (!roleId || !name || this.savingJobTitle) return;

    this.savingJobTitle = true;
    this.rolesSvc.createJobTitle(roleId, { name }).subscribe({
      next: () => {
        this.savingJobTitle = false;
        this.newJobTitleName = '';
        this.toast(successActionAlert('create', 'cargo'), 'success');
        this.loadJobTitles();
      },
      error: (error) => {
        this.savingJobTitle = false;
        this.toast(this.jobTitleError(error, errorActionAlert('create', 'cargo')), 'danger');
      }
    });
  }

  startEditJobTitle(jobTitle: JobTitle): void {
    this.editingJobTitleId = jobTitle.id;
    this.editingJobTitleName = jobTitle.name;
  }

  cancelEditJobTitle(): void {
    this.editingJobTitleId = null;
    this.editingJobTitleName = '';
  }

  saveJobTitleName(jobTitle: JobTitle): void {
    const name = this.editingJobTitleName.trim();
    if (!name || name === jobTitle.name) {
      this.cancelEditJobTitle();
      return;
    }
    this.patchJobTitle(jobTitle, { name });
  }

  toggleJobTitle(jobTitle: JobTitle): void {
    this.patchJobTitle(jobTitle, { is_active: jobTitle.is_active === false });
  }

  private patchJobTitle(jobTitle: JobTitle, payload: Partial<JobTitle>): void {
    const roleId = this.selectedRole?.id;
    if (!roleId || this.savingJobTitle) return;

    this.savingJobTitle = true;
    this.rolesSvc.updateJobTitle(roleId, jobTitle.id, payload).subscribe({
      next: () => {
        this.savingJobTitle = false;
        this.toast(successActionAlert('update', 'cargo'), 'success');
        this.loadJobTitles();
      },
      error: (error) => {
        this.savingJobTitle = false;
        this.toast(this.jobTitleError(error, errorActionAlert('update', 'cargo')), 'danger');
      }
    });
  }

  private jobTitleError(error: unknown, fallback: string): string {
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    return typeof detail === 'string' && detail ? detail : fallback;
  }

  openCreateRole(): void {
    this.isEditing = false;
    this.roleForm = { name: '', slug: '', description: '' };
    this.showRoleDrawer = true;
  }

  openEditRole(): void {
    if (!this.selectedRole) return;
    this.isEditing = true;
    this.roleForm = { ...this.selectedRole };
    this.showRoleDrawer = true;
  }

  saveRole(): void {
    this.syncRoleSlug();

    const payload = {
      name: (this.roleForm.name || '').trim(),
      slug: (this.roleForm.slug || '').trim(),
      description: (this.roleForm.description || '').trim(),
    };

    if (!payload.name || !payload.slug) {
      this.toast('Nombre y slug son obligatorios.', 'danger');
      return;
    }

    if (this.isEditing && this.selectedRole) {
      this.rolesSvc.updateRole(this.selectedRole.id, payload).subscribe({
        next: (updated) => {
          this.showRoleDrawer = false;
          this.toast(successActionAlert('update', 'rol'), 'success');
          this.loadRoles();
          this.selectedRole = updated;
        },
        error: () => this.toast(errorActionAlert('update', 'rol'), 'danger'),
      });
    } else {
      this.rolesSvc.createRole(payload).subscribe({
        next: (created) => {
          this.showRoleDrawer = false;
          this.toast(successActionAlert('create', 'rol'), 'success');
          this.loadRoles();
          this.selectRole(created);
        },
        error: () => this.toast(errorActionAlert('create', 'rol'), 'danger'),
      });
    }
  }

  askDeleteRole(): void {
    if (!this.selectedRole) return;

    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: this.selectedRole.name || 'rol',
      onAccept: () => this.deleteRoleConfirmed()
    });
  }

  deleteRoleConfirmed(): void {
    if (!this.selectedRole) return;
    const id = this.selectedRole.id;

    this.rolesSvc.deleteRole(id).subscribe({
      next: () => {
        this.toast(successActionAlert('delete', 'rol'), 'success');
        this.selectedRole = null;
        this.assignedUsers = [];
        this.catalogUsers = [];
        this.selectedAvailableIds.clear();
        this.selectedAssignedIds.clear();
        this.loadRoles();
      },
      error: () => this.toast(errorActionAlert('delete', 'rol'), 'danger'),
    });
  }

  // ---------- Assigned users ----------
  loadAssignedUsers(): void {
    if (!this.selectedRole) return;

    this.loadingAssigned = true;
    this.rolesSvc.roleUsers(this.selectedRole.id).subscribe({
      next: (users) => {
        this.assignedUsers = Array.isArray(users) ? users : [];
        this.loadingAssigned = false;
        if (this.selectedRole) {
          this.roleUserCounts.set(this.selectedRole.id, this.assignedUsers.length);
        }

        // limpiar selecciones que ya no existan
        const ids = new Set(this.assignedUsers.map(u => u.id));
        for (const id of Array.from(this.selectedAssignedIds)) {
          if (!ids.has(id)) this.selectedAssignedIds.delete(id);
        }
      },
      error: () => {
        this.assignedUsers = [];
        this.loadingAssigned = false;
        this.toast('No se pudieron cargar los usuarios asignados.', 'danger');
      },
    });
  }

  // ---------- Catalog search (available users) ----------
  onCatalogSearchInput(): void {
    // Debounce para evitar spamear al backend
    if (this.catalogDebounce) clearTimeout(this.catalogDebounce);
    this.catalogDebounce = setTimeout(() => {
      this.searchCatalogUsers(this.qAvailable);
    }, 320);
  }

  searchCatalogUsers(q: string): void {
    this.loadingCatalog = true;
    this.rolesSvc.usersCatalog(q || '').subscribe({
      next: (users) => {
        this.catalogUsers = Array.isArray(users) ? users : [];
        this.loadingCatalog = false;

        // limpiar selecciones que ya no existan
        const availableIds = new Set(this.availableUsers().map(u => u.id));
        for (const id of Array.from(this.selectedAvailableIds)) {
          if (!availableIds.has(id)) this.selectedAvailableIds.delete(id);
        }
      },
      error: () => {
        this.catalogUsers = [];
        this.loadingCatalog = false;
        this.toast('No se pudieron cargar usuarios del catálogo.', 'danger');
      },
    });
  }

  // ---------- Transfer list actions ----------
  toggleAvailable(id: string): void {
    if (this.selectedAvailableIds.has(id)) this.selectedAvailableIds.delete(id);
    else this.selectedAvailableIds.add(id);
  }

  toggleAssigned(id: string): void {
    if (this.selectedAssignedIds.has(id)) this.selectedAssignedIds.delete(id);
    else this.selectedAssignedIds.add(id);
  }

  selectAllAvailable(): void {
    for (const u of this.availableUsers()) this.selectedAvailableIds.add(u.id);
  }

  clearAvailableSelection(): void {
    this.selectedAvailableIds.clear();
  }

  selectAllAssigned(): void {
    for (const u of this.assignedUsersFiltered()) this.selectedAssignedIds.add(u.id);
  }

  clearAssignedSelection(): void {
    this.selectedAssignedIds.clear();
  }

  assignSelected(): void {
    if (!this.selectedRole) return;
    const ids = Array.from(this.selectedAvailableIds);
    if (!ids.length) return;

    this.rolesSvc.assignUsers(this.selectedRole.id, ids).subscribe({
      next: () => {
        this.toast(successActionAlert('assign', 'usuarios al rol'), 'success');
        this.selectedAvailableIds.clear();
        this.loadAssignedUsers();
        // refresca catálogo para que “desaparezcan” los ya asignados
        this.searchCatalogUsers(this.qAvailable);
      },
      error: () => this.toast(errorActionAlert('assign', 'usuarios al rol'), 'danger'),
    });
  }

  removeSelected(): void {
    if (!this.selectedRole) return;
    const ids = Array.from(this.selectedAssignedIds);
    if (!ids.length) return;

    this.rolesSvc.removeUsers(this.selectedRole.id, ids).subscribe({
      next: () => {
        this.toast(successActionAlert('remove', 'usuarios del rol'), 'success');
        this.selectedAssignedIds.clear();
        this.loadAssignedUsers();
        this.searchCatalogUsers(this.qAvailable);
      },
      error: () => this.toast(errorActionAlert('remove', 'usuarios del rol'), 'danger'),
    });
  }

  onRoleNameInput(): void {
    this.syncRoleSlug();
  }

  private refreshRoleUserCounts(): void {
    const requestId = ++this.roleCountsRequestId;

    if (!this.roles.length) {
      this.roleUserCounts.clear();
      return;
    }

    const requests = this.roles.map((role) =>
      this.rolesSvc.roleUsers(role.id).pipe(
        map((users) => ({ roleId: role.id, count: Array.isArray(users) ? users.length : 0 })),
        catchError(() => of({ roleId: role.id, count: 0 }))
      )
    );

    forkJoin(requests).subscribe({
      next: (rows) => {
        if (requestId !== this.roleCountsRequestId) return;
        this.roleUserCounts = new Map(rows.map((row) => [row.roleId, row.count]));
      },
      error: () => {
        if (requestId !== this.roleCountsRequestId) return;
        this.roleUserCounts.clear();
      },
    });
  }

  private syncRoleSlug(): void {
    const name = (this.roleForm.name || '').trim();
    if (!name) {
      if (!this.isEditing) this.roleForm.slug = '';
      return;
    }

    if (this.isEditing && this.roleForm.slug) return;

    this.roleForm.slug = makeUniqueIdentifier(
      name,
      this.roles.map((role) => role.slug),
      {
        currentValue: this.isEditing ? this.selectedRole?.slug : '',
        fallback: 'rol',
        maxLength: 80,
        style: 'slug',
      }
    );
  }
}
