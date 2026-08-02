import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RolesService, Role, UserMini } from '../../../services/roles.service';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';

type ToastKind = 'success' | 'danger' | 'info';

@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roles.html',
  styleUrls: ['./roles.css'],
})
export class RolesComponent implements OnInit {
  // Data
  roles: Role[] = [];
  selectedRole: Role | null = null;

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
}
