import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { UserI } from '../user-model';
import { environment } from '../../../../enviorements/environment';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, NgClass],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css']
})
export class UserProfile {
  @Input() user: UserI | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();

  closeDialog(): void {
    this.close.emit();
  }

  editUser(): void {
    this.edit.emit();
  }

  isActive(): boolean {
    if (!this.user) return false;
    if (this.user.status) return this.user.status === 'ACTIVE';
    return !!this.user.is_active;
  }

  getStatusLabel(): string {
    return this.isActive() ? 'Activo' : 'Inactivo';
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
