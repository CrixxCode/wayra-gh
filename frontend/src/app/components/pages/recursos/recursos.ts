import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService } from 'primeng/api';
import { ResourcesService } from '../../../services/resources.service';
import { RoleLite, Resource } from '../../../services/resources.service';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';

type ToastKind = 'success' | 'danger' | 'info';

@Component({
  selector: 'app-recursos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recursos.html',
  styleUrls: ['./recursos.css'],
})
export class RecursosComponent implements OnInit {
  // Roles
  roles: RoleLite[] = [];
  rolesQuery = '';
  selectedRole: RoleLite | null = null;
  loadingRoles = false;

  // Recursos
  qResources = '';
  resources: Resource[] = [];
  loadingResources = false;
  private resourceCatalog = new Map<string, Resource>();

  // Rol ↔ Recursos
  assigned: Resource[] = [];
  loadingAssigned = false;

  selectedAvailableIds = new Set<string>();
  selectedAssignedIds = new Set<string>();

  // Drawer CRUD
  showDrawer = false;
  isEditing = false;
  editingId: string | null = null;
  form: Partial<Resource> = this.emptyForm();
  deleteTarget: Resource | null = null;

  // Toast
  toastVisible = false;
  toastText = '';
  toastKind: ToastKind = 'info';
  private toastTimer?: any;

  // debounce
  private resourcesDebounce?: any;

  constructor(
    private svc: ResourcesService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadRoles();
    this.loadResources();
  }

  get totalResources(): number {
    return this.resourceCatalog.size;
  }

  get totalAssigned(): number {
    return this.assigned.length;
  }

  get totalAvailable(): number {
    return this.availableResources().length;
  }

  get totalRoles(): number {
    return this.roles.length;
  }

  private toast(msg: string, kind: ToastKind = 'info') {
    this.toastText = msg;
    this.toastKind = kind;
    this.toastVisible = true;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastVisible = false), 2400);
  }

  trackById(_: number, item: any) {
    return item?.id;
  }

  // -------- Roles --------
  loadRoles(): void {
    this.loadingRoles = true;
    this.svc.listRoles().subscribe({
      next: (data) => {
        this.roles = Array.isArray(data) ? data : [];
        this.loadingRoles = false;

        if (!this.selectedRole && this.roles.length) {
          this.selectRole(this.roles[0]);
        }
      },
      error: () => {
        this.roles = [];
        this.loadingRoles = false;
        this.toast('No se pudieron cargar roles.', 'danger');
      },
    });
  }

  filteredRoles(): RoleLite[] {
    const q = (this.rolesQuery || '').trim().toLowerCase();
    if (!q) return this.roles;
    return this.roles.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.slug || '').toLowerCase().includes(q)
    );
  }

  selectRole(role: RoleLite): void {
    this.selectedRole = role;
    this.selectedAvailableIds.clear();
    this.selectedAssignedIds.clear();
    this.loadAssignedForRole();
  }

  // -------- Recursos list / search --------
  onResourcesSearchInput(): void {
    if (this.resourcesDebounce) clearTimeout(this.resourcesDebounce);
    this.resourcesDebounce = setTimeout(() => {
      this.syncSelectedAvailableWithFilter();
      this.syncSelectedAssignedWithFilter();
    }, 280);
  }

  loadResources(): void {
    this.loadingResources = true;
    this.svc.listResources().subscribe({
      next: (data) => {
        this.resources = Array.isArray(data) ? data : [];
        this.upsertResourceCatalog(this.resources);
        this.loadingResources = false;

        this.syncSelectedAvailableWithFilter();
      },
      error: () => {
        this.resources = [];
        this.loadingResources = false;
        this.toast('No se pudieron cargar recursos.', 'danger');
      },
    });
  }

  // -------- Rol ↔ Recursos --------
  private loadAssignedForRole(): void {
    if (!this.selectedRole) return;
    this.loadingAssigned = true;
    this.svc.roleResources(this.selectedRole.id).subscribe({
      next: (data) => {
        this.assigned = Array.isArray(data) ? data : [];
        this.upsertResourceCatalog(this.assigned);
        this.loadingAssigned = false;

        this.syncSelectedAssignedWithFilter();
      },
      error: () => {
        this.assigned = [];
        this.loadingAssigned = false;
        this.toast('No se pudieron cargar recursos del rol.', 'danger');
      },
    });
  }

  get assignedIds(): Set<string> {
    return new Set(this.assigned.map(r => r.id));
  }

  availableResources(): Resource[] {
    const assigned = this.assignedIds;
    return (this.resources || []).filter(r => !assigned.has(r.id));
  }

  availableResourcesFiltered(): Resource[] {
    const q = (this.qResources || '').trim().toLowerCase();
    if (!q) return this.availableResources();
    return this.availableResources().filter((resource) => this.resourceMatchesQuery(resource, q));
  }

  assignedResourcesFiltered(): Resource[] {
    const q = (this.qResources || '').trim().toLowerCase();
    if (!q) return [...(this.assigned || [])];
    return (this.assigned || []).filter((resource) => this.resourceMatchesQuery(resource, q));
  }

  resolveResourceIcon(resource: Resource): string {
    const visited = new Set<string>();
    let current: Resource | undefined = resource;

    while (current) {
      const ownIcon = (current.icon || '').trim();
      if (ownIcon) return ownIcon;

      const parentId = current.parent || null;
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      current = this.resourceCatalog.get(parentId);
    }

    return 'fa-solid fa-cube';
  }

  getParentName(resource: Resource): string {
    if (!resource.parent) return '';
    const parent = this.resourceCatalog.get(resource.parent);
    return parent?.name || '';
  }

  toggleAvailable(id: string): void {
    if (this.selectedAvailableIds.has(id)) this.selectedAvailableIds.delete(id);
    else this.selectedAvailableIds.add(id);
  }

  toggleAssigned(id: string): void {
    if (this.selectedAssignedIds.has(id)) this.selectedAssignedIds.delete(id);
    else this.selectedAssignedIds.add(id);
  }

  assignSelected(): void {
    if (!this.selectedRole) return;
    const ids = Array.from(this.selectedAvailableIds);
    if (!ids.length) return;

    this.svc.assignResources(this.selectedRole.id, ids).subscribe({
      next: () => {
        this.toast(successActionAlert('assign', 'recursos al rol'), 'success');
        this.selectedAvailableIds.clear();
        this.loadAssignedForRole();
      },
      error: (error) => this.toastActionError('assign', 'recursos al rol', error),
    });
  }

  removeSelected(): void {
    if (!this.selectedRole) return;
    const ids = Array.from(this.selectedAssignedIds);
    if (!ids.length) return;

    this.svc.removeResources(this.selectedRole.id, ids).subscribe({
      next: () => {
        this.toast(successActionAlert('remove', 'recursos del rol'), 'success');
        this.selectedAssignedIds.clear();
        this.loadAssignedForRole();
      },
      error: (error) => this.toastActionError('remove', 'recursos del rol', error),
    });
  }

  // -------- CRUD Drawer --------
  emptyForm(): Partial<Resource> {
    return {
      key: '',
      name: '',
      description: '',
      link: '',
      link_backend: '',
      icon: '',
      order: 0,
      is_menu: true,
      parent: null,
    };
  }

  openCreate(): void {
    this.isEditing = false;
    this.editingId = null;
    this.form = this.emptyForm();
    this.showDrawer = true;
  }

  openEdit(r: Resource): void {
    this.isEditing = true;
    this.editingId = r.id;
    this.form = {
      key: r.key,
      name: r.name,
      description: r.description || '',
      link: r.link || '',
      link_backend: r.link_backend || '',
      icon: r.icon || '',
      order: r.order ?? 0,
      is_menu: r.is_menu ?? true,
      parent: r.parent ?? null,
    };
    this.showDrawer = true;
  }

  save(): void {
    const payload: Partial<Resource> = {
      key: (this.form.key || '').trim(),
      name: (this.form.name || '').trim(),
      description: (this.form.description || '').trim(),
      link: (this.form.link || '').trim(),
      link_backend: (this.form.link_backend || '').trim(),
      icon: (this.form.icon || '').trim(),
      order: Number(this.form.order ?? 0),
      is_menu: !!this.form.is_menu,
      parent: this.form.parent || null,
    };

    if (!payload.key || !payload.name) {
      this.toast('Key y Name son obligatorios.', 'danger');
      return;
    }

    if (!this.isEditing && this.isDuplicateKey(payload.key)) {
      this.toast('Ya existe un recurso con esa key. Posiblemente ya fue creado antes.', 'danger');
      return;
    }

    if (this.isEditing && this.editingId) {
      this.svc.updateResource(this.editingId, payload).subscribe({
        next: () => {
          this.toast(successActionAlert('update', 'recurso'), 'success');
          this.showDrawer = false;
          this.loadResources();
          if (this.selectedRole) this.loadAssignedForRole();
        },
        error: (error) => this.toastActionError('update', 'recurso', error),
      });
    } else {
      this.svc.createResource(payload).subscribe({
        next: () => {
          this.toast(successActionAlert('create', 'recurso'), 'success');
          this.showDrawer = false;
          this.qResources = '';
          this.loadResources();
          if (this.selectedRole) this.loadAssignedForRole();
        },
        error: (error) => this.toastActionError('create', 'recurso', error),
      });
    }
  }

  askDelete(r: Resource): void {
    this.deleteTarget = r;
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: r.key || r.name || 'recurso',
      onAccept: () => this.confirmDelete()
    });
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const id = this.deleteTarget.id;

    this.svc.deleteResource(id).subscribe({
      next: () => {
        this.resourceCatalog.delete(id);
        this.toast(successActionAlert('delete', 'recurso'), 'success');
        this.deleteTarget = null;
        this.loadResources();
        if (this.selectedRole) this.loadAssignedForRole();
      },
      error: (error) => this.toastActionError('delete', 'recurso', error),
    });
  }

  // Dropdown parent: evita seleccionarse a sí mismo
  parentOptions(): Resource[] {
    if (!this.isEditing || !this.editingId) return this.resources;
    return this.resources.filter(r => r.id !== this.editingId);
  }

  refreshView(): void {
    this.loadRoles();
    this.loadResources();
    if (this.selectedRole) this.loadAssignedForRole();
  }

  private upsertResourceCatalog(items: Resource[]): void {
    for (const item of items) {
      if (!item?.id) continue;
      this.resourceCatalog.set(item.id, item);
    }
  }

  private syncSelectedAvailableWithFilter(): void {
    const availableIds = new Set(this.availableResourcesFiltered().map((resource) => resource.id));
    for (const id of Array.from(this.selectedAvailableIds)) {
      if (!availableIds.has(id)) this.selectedAvailableIds.delete(id);
    }
  }

  private syncSelectedAssignedWithFilter(): void {
    const assignedIds = new Set(this.assignedResourcesFiltered().map((resource) => resource.id));
    for (const id of Array.from(this.selectedAssignedIds)) {
      if (!assignedIds.has(id)) this.selectedAssignedIds.delete(id);
    }
  }

  private resourceMatchesQuery(resource: Resource, query: string): boolean {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;

    const parentName = this.getParentName(resource);
    const haystack = [
      resource.key || '',
      resource.name || '',
      resource.description || '',
      resource.link || '',
      resource.link_backend || '',
      parentName || '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  }

  private toastActionError(action: 'create' | 'update' | 'delete' | 'assign' | 'remove', target: string, error: unknown): void {
    const base = errorActionAlert(action, target);
    const detail = this.extractHttpErrorDetail(error);
    this.toast(detail ? `${base} ${detail}` : base, 'danger');
  }

  private extractHttpErrorDetail(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return '';

    if (error.status === 403) {
      return 'Detalle: no tienes permisos para esta accion (resources.write).';
    }

    const payload = error.error;
    if (typeof payload === 'string') {
      const text = payload.trim();
      return text ? `Detalle: ${text}` : '';
    }

    if (!payload || typeof payload !== 'object') return '';

    const wrappedErrors = (payload as { errors?: unknown }).errors;
    if (wrappedErrors && typeof wrappedErrors === 'object') {
      const wrappedMessage = this.extractFieldValidationMessage(wrappedErrors as Record<string, unknown>);
      if (wrappedMessage) return `Detalle: ${wrappedMessage}`;
    }

    const keyError = (payload as { key?: unknown }).key;
    if (Array.isArray(keyError) && keyError.length && typeof keyError[0] === 'string') {
      const message = keyError[0].trim();
      if (/already exists|ya existe/i.test(message)) {
        return 'Detalle: la key ya existe. Ese recurso probablemente ya fue creado.';
      }
      return `Detalle: ${message}`;
    }

    const parentError = (payload as { parent?: unknown }).parent;
    if (Array.isArray(parentError) && parentError.length && typeof parentError[0] === 'string') {
      const message = parentError[0].trim();
      if (/invalid pk|does not exist/i.test(message)) {
        return 'Detalle: el recurso padre seleccionado no existe.';
      }
      return `Detalle: ${message}`;
    }

    const directMessage = this.extractFieldValidationMessage(payload as Record<string, unknown>);
    if (directMessage) return `Detalle: ${directMessage}`;

    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return `Detalle: ${detail.trim()}`;
    }

    for (const value of Object.values(payload as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
        return `Detalle: ${value[0]}`;
      }
      if (typeof value === 'string' && value.trim()) {
        return `Detalle: ${value.trim()}`;
      }
    }

    return '';
  }

  private isDuplicateKey(key?: string): boolean {
    const normalized = String(key || '').trim().toLowerCase();
    if (!normalized) return false;
    return this.resources.some(r => String(r.key || '').trim().toLowerCase() === normalized);
  }

  private extractFieldValidationMessage(errors: Record<string, unknown>): string {
    const keyError = errors['key'];
    if (Array.isArray(keyError) && keyError.length && typeof keyError[0] === 'string') {
      const message = keyError[0].trim();
      if (/already exists|ya existe/i.test(message)) {
        return 'la key ya existe. Ese recurso probablemente ya fue creado.';
      }
      return message;
    }

    const parentError = errors['parent'];
    if (Array.isArray(parentError) && parentError.length && typeof parentError[0] === 'string') {
      const message = parentError[0].trim();
      if (/invalid pk|does not exist/i.test(message)) {
        return 'el recurso padre seleccionado no existe.';
      }
      return message;
    }

    const nonField = errors['non_field_errors'];
    if (Array.isArray(nonField) && nonField.length && typeof nonField[0] === 'string') {
      return nonField[0].trim();
    }

    for (const value of Object.values(errors)) {
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
        return value[0].trim();
      }
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }
}
