import { Component, OnInit } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../../services/user';
import { UserI } from '../user-model';
import { environment } from '../../../../enviorements/environment';
import {
  ACTION_ALERT_ERROR_SUMMARY,
  ACTION_ALERT_SUCCESS_SUMMARY,
  errorActionAlert,
  successActionAlert
} from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { catchError, forkJoin, of } from 'rxjs';

// PrimeNG
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { MessageService, ConfirmationService } from 'primeng/api';

// Child components
import { UserRegister } from '../register/register';
import { UserProfile } from '../profile/profile';
import { UserUpdate } from '../update/update';

@Component({
  selector: 'app-user-list',
  standalone: true,
  templateUrl: './user-list.html',
  styleUrls: ['./user-list.css'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgClass,
    ToastModule,
    ConfirmDialogModule,
    DialogModule,
    UserRegister,
    UserProfile,
    UserUpdate
  ],
  providers: [MessageService, ConfirmationService]
})
export class UserList implements OnInit {
  users: UserI[] = [];
  deletedUsers: UserI[] = [];
  filteredUsers: UserI[] = [];
  showDeletedUsers = false;

  loading = true;
  globalFilter = '';
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  roleFilter: 'ALL' | 'WITH_ROLE' | 'WITHOUT_ROLE' = 'ALL';

  first = 0;
  rows = 6;

  selectedUser: UserI | null = null;

  visibleRegisterDialog = false;
  visibleEditDialog = false;
  visibleViewDialog = false;
  private shouldReloadAfterEdit = false;

  statCards = [
    {
      label: 'Total usuarios',
      value: '0',
      sub: 'Cuentas registradas',
      icon: 'fa-solid fa-users',
      color: 'var(--gh-status-info-strong)',
      bg: 'var(--gh-status-info-bg)'
    },
    {
      label: 'Usuarios activos',
      value: '0',
      sub: 'Acceso habilitado',
      icon: 'fa-solid fa-user-check',
      color: 'var(--gh-status-success-text)',
      bg: 'var(--gh-status-success-bg)'
    },
    {
      label: 'Con roles',
      value: '0',
      sub: 'Permisos asignados',
      icon: 'fa-solid fa-shield-halved',
      color: 'var(--gh-status-warn-text)',
      bg: 'var(--gh-status-warn-bg)'
    },
    {
      label: 'Nuevos este mes',
      value: '0',
      sub: 'Altas recientes',
      icon: 'fa-solid fa-user-plus',
      color: 'var(--gh-status-violet-text)',
      bg: 'var(--gh-status-violet-bg)'
    },
    {
      label: 'Resultados',
      value: '0',
      sub: 'Segun filtros activos',
      icon: 'fa-solid fa-filter',
      color: 'var(--gh-status-info-strong)',
      bg: 'var(--gh-status-info-bg)'
    }
  ];

  constructor(
    private userService: UserService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  get deletedUsersCount(): number {
    return this.deletedUsers.length;
  }

  loadUsers(): void {
    this.loading = true;
    forkJoin({
      users: this.userService
        .getUsers({ include_inactive: true })
        .pipe(catchError(() => of([] as UserI[]))),
      allUsers: this.userService
        .getUsers({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as UserI[])))
    }).subscribe({
      next: ({ users, allUsers }) => {
        this.users = users;
        const visibleIds = new Set(users.map((user) => user.id));
        this.deletedUsers = allUsers.filter((user) => !visibleIds.has(user.id));
        this.updateStats();
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los usuarios.',
          life: 3000
        });
        this.loading = false;
      }
    });
  }

  restoreUser(user: UserI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: `${user.first_name} ${user.last_name}`.trim() || 'usuario',
      key: 'userDelete',
      onAccept: () => {
        if (!user.id) return;

        this.userService.restoreUser(user.id).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: ACTION_ALERT_SUCCESS_SUMMARY,
              detail: successActionAlert('restore', 'usuario'),
              life: 3000
            });
            this.loadUsers();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: ACTION_ALERT_ERROR_SUMMARY,
              detail: errorActionAlert('restore', 'usuario'),
              life: 3000
            });
          }
        });
      }
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  applyFilters(): void {
    const query = this.globalFilter.toLowerCase().trim();

    this.filteredUsers = this.users.filter((user) =>
      this.matchesSearch(user, query) &&
      this.matchesStatus(user) &&
      this.matchesRole(user)
    );

    this.statCards[4].value = `${this.filteredUsers.length}`;
    this.first = 0;
  }

  exportCsv(): void {
    if (!this.filteredUsers.length) return;

    const headers = ['usuario', 'nombre', 'correo', 'rol', 'estado'];

    const rows = this.filteredUsers.map((user) => {
      const row = [
        user.username || '',
        `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        user.email || '',
        this.getRoleLabel(user),
        this.isActive(user) ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  openRegisterDialog(): void {
    this.visibleRegisterDialog = true;
  }

  closeRegisterDialog(): void {
    this.visibleRegisterDialog = false;
    this.loadUsers();
  }

  onEdit(user: UserI): void {
    this.selectedUser = this.cloneUser(user);
    this.visibleViewDialog = false;
    this.shouldReloadAfterEdit = false;
    this.visibleEditDialog = true;
  }

  onUserUpdated(): void {
    this.shouldReloadAfterEdit = true;
    this.messageService.add({
      severity: 'success',
      summary: ACTION_ALERT_SUCCESS_SUMMARY,
      detail: successActionAlert('update', 'usuario'),
      life: 3000
    });
  }

  onEditDialogHide(): void {
    this.visibleEditDialog = false;
    this.selectedUser = null;
    if (this.shouldReloadAfterEdit) {
      this.shouldReloadAfterEdit = false;
      this.loadUsers();
    }
  }

  onView(user: UserI): void {
    this.selectedUser = this.cloneUser(user);
    this.visibleViewDialog = true;
  }

  onEditFromView(): void {
    if (!this.selectedUser) return;
    this.onEdit(this.selectedUser);
  }

  confirmDelete(user: UserI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: `${user.first_name} ${user.last_name}`.trim() || 'usuario',
      key: 'userDelete',
      onAccept: () => {
        if (!user.id) return;

        this.userService.deleteUserLogic(user.id).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: ACTION_ALERT_SUCCESS_SUMMARY,
              detail: successActionAlert('delete', 'usuario'),
              life: 3000
            });
            this.loadUsers();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: ACTION_ALERT_ERROR_SUMMARY,
              detail: errorActionAlert('delete', 'usuario'),
              life: 3000
            });
          }
        });
      }
    });
  }

  nextPage(): void {
    if (this.first + this.rows < this.filteredUsers.length) {
      this.first += this.rows;
    }
  }

  previousPage(): void {
    if (this.first > 0) {
      this.first -= this.rows;
    }
  }

  goToPage(page: number): void {
    const total = this.totalPages || 1;
    if (page < 1 || page > total) return;
    this.first = (page - 1) * this.rows;
  }

  get currentPage(): number {
    return Math.floor(this.first / this.rows) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.filteredUsers.length / this.rows);
  }

  get visibleUsers(): UserI[] {
    return this.filteredUsers.slice(this.first, this.first + this.rows);
  }

  getPageStart(): number {
    if (this.filteredUsers.length === 0) return 0;
    return this.first + 1;
  }

  getPageEnd(): number {
    return Math.min(this.first + this.rows, this.filteredUsers.length);
  }

  getPages(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  getActiveCount(): number {
    return this.users.filter((user) => this.isActive(user)).length;
  }

  getUsersWithRoleCount(): number {
    return this.users.filter((user) => this.hasAnyRole(user)).length;
  }

  getNewThisMonthCount(): number {
    const now = new Date();

    return this.users.filter((user) => {
      const rawDate =
        (user as any).created_at ??
        (user as any).createdAt ??
        (user as any).date_joined ??
        null;

      if (!rawDate) return false;

      const created = new Date(rawDate);
      if (Number.isNaN(created.getTime())) return false;

      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
  }

  getRoleLabel(user: UserI): string {
    if (user.roles && user.roles.length > 0) {
      return user.roles[0].name;
    }

    return user.role?.name || 'Sin rol';
  }

  getExtraRolesCount(user: UserI): number {
    if (!user.roles || user.roles.length <= 1) return 0;
    return user.roles.length - 1;
  }

  isActive(user: UserI): boolean {
    if (user.status) return user.status === 'ACTIVE';
    return !!user.is_active;
  }

  getUserInitials(user: UserI): string {
    const first = user.first_name?.trim().charAt(0) || '';
    const last = user.last_name?.trim().charAt(0) || '';
    return `${first}${last}`.toUpperCase() || 'US';
  }

  resolveAvatar(src?: string | null): string | null {
    if (!src) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    const apiBase = (environment.API_URI || window.location.origin).replace(/\/$/, '');
    return `${apiBase}${src.startsWith('/') ? '' : '/'}${src}`;
  }

  private updateStats(): void {
    this.statCards[0].value = `${this.users.length}`;
    this.statCards[1].value = `${this.getActiveCount()}`;
    this.statCards[2].value = `${this.getUsersWithRoleCount()}`;
    this.statCards[3].value = `${this.getNewThisMonthCount()}`;
  }

  private matchesSearch(user: UserI, query: string): boolean {
    if (!query) return true;

    const searchable = [
      user.username,
      user.email,
      user.first_name,
      user.last_name,
      this.getRoleLabel(user)
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  }

  private matchesStatus(user: UserI): boolean {
    if (this.statusFilter === 'ALL') return true;
    return this.statusFilter === 'ACTIVE' ? this.isActive(user) : !this.isActive(user);
  }

  private matchesRole(user: UserI): boolean {
    if (this.roleFilter === 'ALL') return true;
    return this.roleFilter === 'WITH_ROLE' ? this.hasAnyRole(user) : !this.hasAnyRole(user);
  }

  private hasAnyRole(user: UserI): boolean {
    return (user.roles && user.roles.length > 0) || !!user.role;
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

  private cloneUser(user: UserI): UserI {
    return {
      ...user,
      role: user.role ? { ...user.role } : user.role,
      roles: Array.isArray(user.roles) ? user.roles.map((role) => ({ ...role })) : user.roles,
      hotel_settings:
        user.hotel_settings && typeof user.hotel_settings === 'object'
          ? { ...user.hotel_settings }
          : user.hotel_settings,
    };
  }
}
