import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';

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
  private readonly resourcesUrl = `${this.apiBase}/api/resources/`;

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
  }): Observable<Role[]> {
    let params = new HttpParams();
    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }
    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
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

  roleJobTitles(roleId: string): Observable<JobTitle[]> {
    return this.http.get<any>(`${this.rolesUrl}${roleId}/job-titles/`, { withCredentials: true }).pipe(
      map((res) => this.unwrapArray<JobTitle>(res))
    );
  }

  listResources(q: string = '', filters?: { include_inactive?: boolean; include_deleted?: boolean }): Observable<ResourcePermission[]> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }
    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http.get<any>(this.resourcesUrl, { withCredentials: true, params }).pipe(
      map((res) => this.unwrapArray<ResourcePermission>(res))
    );
  }

  roleResources(roleId: string): Observable<ResourcePermission[]> {
    return this.http.get<any>(`${this.rolesUrl}${roleId}/resources/`, { withCredentials: true }).pipe(
      map((res) => this.unwrapArray<ResourcePermission>(res))
    );
  }

  assignResources(roleId: string, resourceIds: string[]): Observable<any> {
    return this.http.post(
      `${this.rolesUrl}${roleId}/assign-resources/`,
      { resource_ids: resourceIds },
      this.auth.buildCsrfRequestOptions()
    );
  }

  removeResources(roleId: string, resourceIds: string[]): Observable<any> {
    return this.http.post(
      `${this.rolesUrl}${roleId}/remove-resources/`,
      { resource_ids: resourceIds },
      this.auth.buildCsrfRequestOptions()
    );
  }
}
