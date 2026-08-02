import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { UserI } from '../modules/users/user-model';
import { AuthService } from './auth/auth';
import { environment } from '../../enviorements/environment';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly usersUrl = `${this.apiBase}/api/users/`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /** Obtiene la lista de usuarios */
  getUsers(filters?: {
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<UserI[]> {
    let params = new HttpParams();

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<UserI[] | PaginatedResponse<UserI>>(
        this.usersUrl,
        {
          ...this.authService.buildCsrfRequestOptions(),
          params
        }
      )
      .pipe(
        map((response): UserI[] =>
          Array.isArray(response) ? response : response.results ?? []
        ),
        map((users): UserI[] =>
          users.map((user): UserI => {
            const role = user.role ?? user.roles?.[0] ?? null;
            const roles = user.roles ?? (role ? [role] : []);
            const rawStatus =
              user.status ??
              (typeof user.is_active === 'boolean'
                ? user.is_active
                  ? 'ACTIVE'
                  : 'INACTIVE'
                : undefined);
            const normalizedStatus =
              typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined;
            const isActive =
              typeof user.is_active === 'boolean'
                ? user.is_active
                : normalizedStatus === 'ACTIVE';

            return {
              ...user,
              role,
              roles,
              status: normalizedStatus ?? (isActive ? 'ACTIVE' : 'INACTIVE'),
              is_active: isActive,
            } as UserI; // 👈 Aquí TypeScript acepta el tipo final
          })
        )
      );
  }

  /** Crea un nuevo usuario */
  createUser(user: UserI): Observable<UserI> {
    const formData = new FormData();

    // Campos básicos
    formData.append('first_name', user.first_name);
    formData.append('last_name', user.last_name);
    formData.append('username', user.username);
    formData.append('email', user.email);
    formData.append('job_title', user.job_title || '');
    formData.append('password', user.password || '');
    formData.append('avatar', user.avatar || '');

    // Estado (usar is_active)
    formData.append('is_active', user.is_active ? 'true' : 'false');

    const roleId = this.resolveRoleId(user);
    if (roleId !== null) {
      formData.append('role', roleId);
    }

    const jobTitleOptionId = this.resolveUuidLike((user as { job_title_option?: unknown }).job_title_option);
    if (jobTitleOptionId !== null) {
      formData.append('job_title_option', jobTitleOptionId);
    }

    const hotelSettingsId = this.resolveHotelSettingsId(user.hotel_settings);
    if (hotelSettingsId !== null) {
      formData.append('hotel_settings', String(hotelSettingsId));
    }

    return this.http.post<UserI>(
      this.usersUrl,
      formData,
      this.authService.buildCsrfRequestOptions()
    );
  }

  /** Actualiza un usuario existente */
  updateUser(id: number, user: UserI): Observable<UserI> {
    const formData = new FormData();
    formData.append('first_name', user.first_name);
    formData.append('last_name', user.last_name);
    formData.append('username', user.username);
    formData.append('email', user.email);
    formData.append('job_title', user.job_title || '');
    formData.append('avatar', user.avatar || '');
    formData.append('is_active', user.is_active ? 'true' : 'false');
    formData.append('status', user.is_active ? 'ACTIVE' : 'INACTIVE');

    const roleId = this.resolveRoleId(user);
    if (roleId !== null) {
      formData.append('role', roleId);
    }

    const jobTitleOptionId = this.resolveUuidLike((user as { job_title_option?: unknown }).job_title_option);
    if (jobTitleOptionId !== null) {
      formData.append('job_title_option', jobTitleOptionId);
    }

    const hotelSettingsId = this.resolveHotelSettingsId(user.hotel_settings);
    if (hotelSettingsId !== null) {
      formData.append('hotel_settings', String(hotelSettingsId));
    }

    return this.http.patch<UserI>(
      `${this.usersUrl}${id}/`,
      formData,
      this.authService.buildCsrfRequestOptions()
    );
  }


  /** Elimina fisicamente un usuario */
  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}${id}/`, this.authService.buildCsrfRequestOptions());
  }

  /** Elimina logicamente un usuario (por ejemplo, desactiva el estado) */
  deleteUserLogic(id: number): Observable<UserI> {
    // Supone que el backend permite PATCH a /api/users/:id/ con {"is_active": false}
    const body = { is_active: false }; // o { status: 'INACTIVE' } segun tu modelo
    return this.http.patch<UserI>(
      `${this.usersUrl}${id}/`,
      body,
      this.authService.buildCsrfRequestOptions()
    );
  }

  restoreUser(id: number): Observable<UserI> {
    return this.http.post<UserI>(
      `${this.usersUrl}${id}/restore/`,
      {},
      this.authService.buildCsrfRequestOptions()
    );
  }

  private resolveHotelSettingsId(hotelSettings: UserI['hotel_settings']): number | null {
    if (typeof hotelSettings === 'number' && Number.isFinite(hotelSettings) && hotelSettings > 0) {
      return hotelSettings;
    }

    if (
      hotelSettings &&
      typeof hotelSettings === 'object' &&
      typeof hotelSettings.id === 'number' &&
      Number.isFinite(hotelSettings.id) &&
      hotelSettings.id > 0
    ) {
      return hotelSettings.id;
    }

    return null;
  }

  private resolveRoleId(user: UserI): string | null {
    const roleValue = (user as { role?: unknown }).role;

    const fromRaw = this.resolveUuidLike(roleValue);
    if (fromRaw !== null) {
      return fromRaw;
    }

    if (roleValue && typeof roleValue === 'object' && 'id' in roleValue) {
      return this.resolveUuidLike((roleValue as { id?: unknown }).id);
    }

    return null;
  }

  private resolveUuidLike(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? normalized : null;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return String(value);
    }
    return null;
  }
}
