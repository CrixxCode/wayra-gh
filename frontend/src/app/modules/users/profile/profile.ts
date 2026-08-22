import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';
import { UserService } from '../../../services/user';
import { RoleI, UserI } from '../user-model';
import { environment } from '../../../../enviorements/environment';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, NgClass, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css']
})
export class UserProfile {
  @Input() user: UserI | null = null;
  @Input() allowDirectEmail = false;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() rolesUpdated = new EventEmitter<UserI>();

  showEmailModal = false;
  sendingEmail = false;
  emailSubject = '';
  emailMessage = '';
  emailError = '';
  readonly emailSubjectMax = 140;
  readonly emailMessageMax = 5000;

  showRoleModal = false;
  loadingRoles = false;
  savingRoles = false;
  roleOptions: RoleI[] = [];
  selectedRoleIds = new Set<string>();
  rolesError = '';

  constructor(
    private userService: UserService,
    private messageService: MessageService
  ) {}

  closeDialog(): void {
    this.close.emit();
  }

  editUser(): void {
    this.edit.emit();
  }

  openEmailComposer(): void {
    if (!this.canOpenEmailComposer()) return;
    const displayName = this.getDisplayName();
    this.emailSubject = '';
    this.emailMessage = `Hola ${displayName},\n\n`;
    this.emailError = '';
    this.showEmailModal = true;
  }

  closeEmailComposer(): void {
    if (this.sendingEmail) return;
    this.showEmailModal = false;
    this.emailError = '';
  }

  sendDirectEmail(): void {
    if (!this.user?.id || this.sendingEmail) return;

    const subject = this.emailSubject.trim();
    const message = this.emailMessage.trim();
    if (!subject || !message) {
      this.emailError = 'Escribe el asunto y el mensaje antes de enviar.';
      return;
    }

    this.sendingEmail = true;
    this.emailError = '';

    this.userService
      .sendUserEmail(this.user.id, { subject, message })
      .pipe(finalize(() => (this.sendingEmail = false)))
      .subscribe({
        next: () => {
          this.showEmailModal = false;
          this.messageService.add({
            severity: 'success',
            summary: 'Correo enviado',
            detail: 'El mensaje fue enviado al usuario.',
            life: 2600,
          });
        },
        error: (error) => {
          this.emailError =
            error?.error?.detail ||
            'No se pudo enviar el correo. Revisa el asunto, el mensaje y la configuracion de correo.';
        },
      });
  }

  openRoleManager(): void {
    if (!this.user?.id || this.loadingRoles) return;

    this.showRoleModal = true;
    this.loadingRoles = true;
    this.rolesError = '';
    this.roleOptions = [];
    this.selectedRoleIds = new Set<string>();

    this.userService
      .getUserRoles(this.user.id)
      .pipe(finalize(() => (this.loadingRoles = false)))
      .subscribe({
        next: (response) => {
          this.roleOptions = Array.isArray(response.roles) ? response.roles : [];
          this.selectedRoleIds = new Set((response.active_role_ids || []).map((id) => String(id)));
        },
        error: () => {
          this.rolesError = 'No se pudieron cargar los roles disponibles.';
        },
      });
  }

  closeRoleManager(): void {
    if (this.savingRoles) return;
    this.showRoleModal = false;
    this.rolesError = '';
  }

  toggleRole(role: RoleI): void {
    if (this.savingRoles) return;
    const roleId = String(role.id || '').trim();
    if (!roleId) return;

    if (this.selectedRoleIds.has(roleId)) {
      this.selectedRoleIds.delete(roleId);
    } else {
      this.selectedRoleIds.add(roleId);
    }
  }

  isRoleSelected(role: RoleI): boolean {
    return this.selectedRoleIds.has(String(role.id || '').trim());
  }

  saveRoles(): void {
    if (!this.user?.id || this.savingRoles) return;

    this.savingRoles = true;
    this.rolesError = '';
    const roleIds = Array.from(this.selectedRoleIds);

    this.userService
      .setUserRoles(this.user.id, roleIds)
      .pipe(finalize(() => (this.savingRoles = false)))
      .subscribe({
        next: (updatedUser) => {
          this.user = updatedUser;
          this.rolesUpdated.emit(updatedUser);
          this.showRoleModal = false;
          this.messageService.add({
            severity: 'success',
            summary: 'Roles actualizados',
            detail: 'Los roles del usuario fueron actualizados.',
            life: 2600,
          });
        },
        error: () => {
          this.rolesError = 'No se pudieron guardar los cambios de roles.';
        },
      });
  }

  isActive(): boolean {
    if (!this.user) return false;
    if (this.user.status) return this.user.status === 'ACTIVE';
    return !!this.user.is_active;
  }

  getStatusLabel(): string {
    return this.isActive() ? 'Activo' : 'Inactivo';
  }

  canOpenEmailComposer(): boolean {
    return this.allowDirectEmail && !!String(this.user?.email || '').trim();
  }

  getDisplayName(): string {
    if (!this.user) return 'usuario';
    return `${this.user.first_name || ''} ${this.user.last_name || ''}`.trim() || this.user.username || 'usuario';
  }

  getPrimaryRole(): string {
    if (!this.user) return 'Sin rol';
    if (this.user.roles && this.user.roles.length > 0) return this.user.roles[0].name;
    return this.user.role?.name || 'Sin rol';
  }

  getRolesCount(): number {
    if (!this.user) return 0;
    if (this.user.roles && this.user.roles.length > 0) return this.user.roles.length;
    return this.user.role ? 1 : 0;
  }

  getJoinYear(): string {
    if (!this.user) return 'N/D';

    const rawDate =
      (this.user as any).created_at ??
      (this.user as any).createdAt ??
      (this.user as any).date_joined ??
      null;

    if (!rawDate) return 'N/D';

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return 'N/D';

    return `${parsed.getFullYear()}`;
  }

  resolveAvatar(src?: string | null): string | null {
    if (!src) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    const apiBase = (environment.API_URI || window.location.origin).replace(/\/$/, '');
    return `${apiBase}${src.startsWith('/') ? '' : '/'}${src}`;
  }
}
