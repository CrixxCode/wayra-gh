import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import { ResourcesService } from './resources.service';

export interface Role {
  id: string;
  name: string;
  slug: string;
  description?: string;
  resources?: ResourcePermission[];
}

export interface JobTitle {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active?: boolean;
  sort_order?: number;
  role_id?: string;
}

export interface ResourcePermission {
  id: string;
  key: string;
  name: string;
  description?: string;
  link?: string;
  link_backend?: string;
  icon?: string;
  order?: number;
  is_menu?: boolean;
  parent?: string | null;
}

export interface UserMini {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  avatar?: string | null;
}

type DRFPaginated<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly rolesUrl = `${this.apiBase}/api/roles/`;

  private readonly resourcesService = inject(ResourcesService);

  constructor(private http: HttpClient, private auth: AuthService) {}

  private unwrapArray<T>(res: any): T[] {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.results)) return (res as DRFPaginated<T>).results as T[];
    if (res && Array.isArray(res.data)) return res.data as T[]; // por si algún wrapper
    return [];
  }

  listRoles(filters?: {
    include_inactive?: boolean;
    include_deleted?: boolean;
    assign_context?: 'hotel' | 'platform';
  }): Observable<Role[]> {
    let params = new HttpParams();
    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }
    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }
    if (filters?.assign_context) {
      params = params.set('assign_context', filters.assign_context);
    }

    return this.http.get<any>(this.rolesUrl, { withCredentials: true, params }).pipe(
      map((res) => this.unwrapArray<Role>(res))
    );
  }

  createRole(payload: Partial<Role>): Observable<Role> {
    return this.http.post<Role>(this.rolesUrl, payload, this.auth.buildCsrfRequestOptions());
  }

  updateRole(id: string, payload: Partial<Role>): Observable<Role> {
    return this.http.patch<Role>(`${this.rolesUrl}${id}/`, payload, this.auth.buildCsrfRequestOptions());
  }

  deleteRole(id: string): Observable<any> {
    return this.http.delete(`${this.rolesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreRole(id: string): Observable<Role> {
    return this.http.post<Role>(`${this.rolesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  roleUsers(roleId: string, filters?: { include_inactive?: boolean; include_deleted?: boolean }): Observable<UserMini[]> {
    let params = new HttpParams();
    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }
    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http.get<any>(`${this.rolesUrl}${roleId}/users/`, { withCredentials: true, params }).pipe(
      map((res) => this.unwrapArray<UserMini>(res))
    );
  }

  usersCatalog(q: string = ''): Observable<UserMini[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return this.http.get<any>(`${this.rolesUrl}users-catalog/${qs}`, { withCredentials: true }).pipe(
      map((res) => this.unwrapArray<UserMini>(res))
    );
  }

  assignUsers(roleId: string, userIds: string[]): Observable<any> {
    return this.http.post(
      `${this.rolesUrl}${roleId}/assign-users/`,
      { user_ids: userIds },
      this.auth.buildCsrfRequestOptions()
    );
  }

  removeUsers(roleId: string, userIds: string[]): Observable<any> {
    return this.http.post(
      `${this.rolesUrl}${roleId}/remove-users/`,
      { user_ids: userIds },
      this.auth.buildCsrfRequestOptions()
    );
  }

  /** Todos los cargos del rol, incluidos los desactivados, para administrarlos. */
  allRoleJobTitles(roleId: string): Observable<JobTitle[]> {
    return this.http
      .get<any>(`${this.rolesUrl}${roleId}/job-titles/`, {
        params: { include_inactive: 'true' },
        withCredentials: true
      })
      .pipe(map((res) => this.unwrapArray<JobTitle>(res)));
  }

  createJobTitle(roleId: string, payload: { name: string; description?: string }): Observable<JobTitle> {
    return this.http.post<JobTitle>(
      `${this.rolesUrl}${roleId}/job-titles/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateJobTitle(
    roleId: string,
    jobTitleId: string,
    payload: Partial<Pick<JobTitle, 'name' | 'description' | 'is_active' | 'sort_order'>>
  ): Observable<JobTitle> {
    return this.http.patch<JobTitle>(
      `${this.rolesUrl}${roleId}/job-titles/${jobTitleId}/`,
      payload,
      this.auth.buildCsrfRequestOptions()
    );
  }

  roleJobTitles(roleId: string): Observable<JobTitle[]> {
    return this.http.get<any>(`${this.rolesUrl}${roleId}/job-titles/`, { withCredentials: true }).pipe(
      map((res) => this.unwrapArray<JobTitle>(res))
    );
  }

  publicJobTitles(): Observable<JobTitle[]> {
    return this.http.get<any>(`${this.rolesUrl}public-job-titles/`).pipe(
      map((res) => this.unwrapArray<JobTitle>(res))
    );
  }

  // -------- Rol <-> Recursos --------
  // Antes estos cuatro metodos estaban copiados aqui y en `ResourcesService`, con el riesgo de
  // corregir uno y no el otro (auditoria, Bloque 1 #12). Ahora se delega en ese servicio.
  listResources(
    q: string = '',
    filters?: { include_inactive?: boolean; include_deleted?: boolean }
  ): Observable<ResourcePermission[]> {
    return this.resourcesService.listResources(q, filters) as Observable<ResourcePermission[]>;
  }

  roleResources(roleId: string): Observable<ResourcePermission[]> {
    return this.resourcesService.roleResources(roleId) as Observable<ResourcePermission[]>;
  }

  assignResources(roleId: string, resourceIds: string[]): Observable<any> {
    return this.resourcesService.assignResources(roleId, resourceIds);
  }

  removeResources(roleId: string, resourceIds: string[]): Observable<any> {
    return this.resourcesService.removeResources(roleId, resourceIds);
  }
}
