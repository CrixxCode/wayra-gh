import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserI } from '../user-model';
import { UserService } from '../../../services/user';
import { MessageService } from 'primeng/api';
import { environment } from '../../../../enviorements/environment';
import { AuthService, MeResponse } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelSettings } from '../../../components/pages/hotel-settings/hotel-setting-model';
import { JobTitle, Role, RolesService } from '../../../services/roles.service';
import { catchError, of } from 'rxjs';
import {
  ACTION_ALERT_ERROR_SUMMARY,
  errorActionAlert
} from '../../../services/action-alerts';

@Component({
  selector: 'app-user-update',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './update.html',
  styleUrls: ['./update.css']
})
export class UserUpdate implements OnChanges {
  @Input() user: UserI | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  form!: FormGroup;
  avatarPreview: string | null = null;
  loading = false;
  hotelsLoading = false;
  rolesLoading = false;
  jobTitlesLoading = false;
  isSuperAdmin = false;
  canSelectHotel = false;
  hotels: HotelSettings[] = [];
  roles: Role[] = [];
  jobTitles: JobTitle[] = [];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private messageService: MessageService,
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private rolesService: RolesService
  ) {
    this.form = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role: [null, Validators.required],
      job_title_option: [null, Validators.required],
      job_title: [''],
      avatar: [''],
      is_active: [true],
      hotel_settings: [null]
    });

    this.form.get('avatar')?.valueChanges.subscribe((value) => {
      this.avatarPreview = this.resolveAvatar(value || null);
    });

    this.form.get('role')?.valueChanges.subscribe((roleId) => {
      this.form.patchValue({ job_title_option: null, job_title: '' }, { emitEvent: false });
      this.jobTitles = [];

      const normalizedRoleId = this.normalizeId(roleId);
      if (!normalizedRoleId) return;

      this.loadJobTitleOptions(normalizedRoleId);
    });

    this.form.get('job_title_option')?.valueChanges.subscribe((jobTitleId) => {
      const normalizedJobTitleId = this.normalizeId(jobTitleId);
      const selectedJobTitle = this.jobTitles.find((jobTitle) => jobTitle.id === normalizedJobTitleId);
      this.form.patchValue({ job_title: selectedJobTitle?.name || '' }, { emitEvent: false });
    });

    this.loadRoleOptions();
    this.resolveHotelAccess();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['user'] && this.user) {
      const roleId = this.resolvePrimaryRoleIdFromUser(this.user);
      const hotelId = this.resolveHotelIdFromUser(this.user.hotel_settings);

      this.form.patchValue(
        {
          first_name: this.user.first_name || '',
          last_name: this.user.last_name || '',
          username: this.user.username || '',
          email: this.user.email || '',
          role: roleId,
          job_title_option: null,
          job_title: this.user.job_title || '',
          avatar: this.user.avatar || '',
          is_active: this.user.is_active !== false,
          hotel_settings: hotelId,
        },
        { emitEvent: false }
      );

      this.avatarPreview = this.user.avatar ? this.resolveAvatar(this.user.avatar) : null;

      if (roleId) {
        this.loadJobTitleOptions(roleId, this.user.job_title || '');
      }
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.user?.id) return;

    this.loading = true;
    const updatedUser: UserI = {
      ...this.user,
      ...this.form.value,
      role: this.form.value.role,
      job_title_option: this.form.value.job_title_option,
      hotel_settings: this.form.value.hotel_settings,
      is_active: !!this.form.value.is_active,
    };

    this.userService.updateUser(this.user.id, updatedUser).subscribe({
      next: () => {
        this.loading = false;
        this.updated.emit();
        this.close.emit();
      },
      error: () => {
        this.loading = false;
        this.messageService.add({
          severity: 'error',
          summary: ACTION_ALERT_ERROR_SUMMARY,
          detail: errorActionAlert('update', 'usuario'),
          life: 3000
        });
      }
    });
  }


  cancel(): void {
    this.close.emit();
  }

  resolveAvatar(src?: string | null): string | null {
    if (!src) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    const apiBase = (environment.API_URI || window.location.origin).replace(/\/$/, '');
    return `${apiBase}${src.startsWith('/') ? '' : '/'}${src}`;
  }

  private resolveHotelAccess(): void {
    this.authService
      .getUserInfo()
      .pipe(catchError(() => of(null as MeResponse | null)))
      .subscribe((user) => {
        this.isSuperAdmin = this.resolveIsSuperAdmin(user);
        const roles = Array.isArray(user?.roles) ? user?.roles : [];
        const isAdminRole = roles.some((role) => {
          const slug = String((role as { slug?: string })?.slug || '').trim().toLowerCase();
          return slug === 'admin' || slug === 'superadmin' || slug === 'super-admin';
        });

        this.canSelectHotel = this.isSuperAdmin || isAdminRole;

        const hotelControl = this.form.get('hotel_settings');
        if (this.isSuperAdmin) {
          hotelControl?.setValidators([Validators.required]);
        } else {
          hotelControl?.clearValidators();
        }
        hotelControl?.updateValueAndValidity({ emitEvent: false });

        if (!this.canSelectHotel) {
          this.hotels = [];
          return;
        }

        this.loadHotelOptions();
      });
  }

  private loadRoleOptions(): void {
    this.rolesLoading = true;
    this.rolesService
      .listRoles({ include_inactive: false })
      .pipe(catchError(() => of([] as Role[])))
      .subscribe((roles) => {
        this.rolesLoading = false;
        this.roles = [...roles].sort((left, right) =>
          String(left.name || '').localeCompare(String(right.name || ''), 'es-CO')
        );
      });
  }

  private loadJobTitleOptions(roleId: string, preferredName?: string): void {
    this.jobTitlesLoading = true;
    this.rolesService
      .roleJobTitles(roleId)
      .pipe(catchError(() => of([] as JobTitle[])))
      .subscribe((jobTitles) => {
        this.jobTitlesLoading = false;
        this.jobTitles = [...jobTitles]
          .filter((jobTitle) => jobTitle.is_active !== false)
          .sort((left, right) =>
            String(left.name || '').localeCompare(String(right.name || ''), 'es-CO')
          );

        const preferred = String(preferredName || '').trim().toLowerCase();
        const currentSelection = this.normalizeId(this.form.get('job_title_option')?.value);

        if (currentSelection && this.jobTitles.some((jobTitle) => jobTitle.id === currentSelection)) {
          return;
        }

        const selectedByName = preferred
          ? this.jobTitles.find((jobTitle) => String(jobTitle.name || '').trim().toLowerCase() === preferred)
          : null;
        const fallback = selectedByName || this.jobTitles[0] || null;

        this.form.patchValue(
          {
            job_title_option: fallback?.id || null,
            job_title: fallback?.name || '',
          },
          { emitEvent: false }
        );
      });
  }

  private loadHotelOptions(): void {
    this.hotelsLoading = true;
    this.hotelSettingsService
      .listSettings()
      .pipe(catchError(() => of([] as HotelSettings[])))
      .subscribe((hotels) => {
        this.hotelsLoading = false;
        this.hotels = [...hotels]
          .filter((hotel) => typeof hotel.id === 'number' && Number(hotel.id) > 0)
          .sort((left, right) =>
            String(left.hotel_name || '').localeCompare(String(right.hotel_name || ''), 'es-CO')
          );
      });
  }

  private resolvePrimaryRoleIdFromUser(user: UserI): string | null {
    const firstRole = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles[0] : user.role;
    const candidate = firstRole ? (firstRole as { id?: unknown }).id : null;
    return this.normalizeId(candidate);
  }

  private resolveHotelIdFromUser(value: UserI['hotel_settings']): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (
      value &&
      typeof value === 'object' &&
      typeof value.id === 'number' &&
      Number.isFinite(value.id) &&
      value.id > 0
    ) {
      return value.id;
    }
    return null;
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? normalized : null;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return String(value);
    }
    return null;
  }

  private resolveIsSuperAdmin(user: MeResponse | null): boolean {
    if (!user || typeof user !== 'object') return false;

    const normalizedUser = user as unknown as {
      is_superuser?: boolean;
      is_staff?: boolean;
      hotel_settings?: unknown;
    };

    if (typeof normalizedUser.is_superuser === 'boolean') {
      return normalizedUser.is_superuser;
    }

    const isStaff = Boolean(normalizedUser.is_staff);
    const hasHotel = Boolean(normalizedUser.hotel_settings);
    return isStaff && !hasHotel;
  }
}
