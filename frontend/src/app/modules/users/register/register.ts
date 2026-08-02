import { Component, EventEmitter, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../../services/user';
import { MessageService } from 'primeng/api';
import { CommonModule } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { AuthService, MeResponse } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { HotelSettings } from '../../../components/pages/hotel-settings/hotel-setting-model';
import { JobTitle, Role, RolesService } from '../../../services/roles.service';
import { catchError, of } from 'rxjs';
import {
  ACTION_ALERT_ERROR_SUMMARY,
  ACTION_ALERT_SUCCESS_SUMMARY,
  errorActionAlert,
  successActionAlert
} from '../../../services/action-alerts';

@Component({
  selector: 'app-user-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ToastModule],
  templateUrl: './register.html',
  styleUrls: ['./register.css'],
})
export class UserRegister {
  @Output() close = new EventEmitter<void>();

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
  
  // Hotel creation modal state
  showHotelCreateModal = false;
  hotelCreateForm!: FormGroup;
  hotelCreating = false;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private messageService: MessageService,
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private rolesService: RolesService
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      role: [null, Validators.required],
      job_title_option: [null, Validators.required],
      job_title: [''],
      avatar: [''],
      password: ['', Validators.required],
      is_active: [true],
      hotel_settings: [null]
    });

    this.hotelCreateForm = this.fb.group({
      hotel_name: ['', Validators.required],
      city: [''],
      country: [''],
      primary_phone: [''],
      general_email: ['']
    });

    this.form.get('avatar')?.valueChanges.subscribe((value) => {
      const normalized = `${value || ''}`.trim();
      this.avatarPreview = normalized || null;
    });

    this.form.get('role')?.valueChanges.subscribe((roleId) => {
      this.form.patchValue({ job_title_option: null, job_title: '' }, { emitEvent: false });
      this.jobTitles = [];

      const normalizedRoleId = this.normalizeId(roleId);
      if (!normalizedRoleId) {
        return;
      }

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

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.userService.createUser(this.form.value).subscribe({
      next: (user) => {
        this.messageService.add({
          severity: 'success',
          summary: ACTION_ALERT_SUCCESS_SUMMARY,
          detail: successActionAlert('create', `usuario ${user.username}`),
          life: 3000
        });
        this.loading = false;
        this.resetForm();
        setTimeout(() => {
          this.close.emit();
        }, 500);
      },
      error: (err) => {
        console.error('Error creando usuario:', err);
        this.messageService.add({
          severity: 'error',
          summary: ACTION_ALERT_ERROR_SUMMARY,
          detail: this.getCreateErrorMessage(err),
          life: 3000
        });
        this.loading = false;
      }
    });
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  openHotelCreateModal(): void {
    this.showHotelCreateModal = true;
    this.hotelCreateForm.reset();
  }

  closeHotelCreateModal(): void {
    this.showHotelCreateModal = false;
    this.hotelCreateForm.reset();
  }

  createHotel(): void {
    if (this.hotelCreateForm.invalid) {
      this.hotelCreateForm.markAllAsTouched();
      return;
    }

    this.hotelCreating = true;
    const hotelData: Partial<HotelSettings> = {
      hotel_name: this.hotelCreateForm.get('hotel_name')?.value || '',
      city: this.hotelCreateForm.get('city')?.value || '',
      country: this.hotelCreateForm.get('country')?.value || '',
      primary_phone: this.hotelCreateForm.get('primary_phone')?.value || '',
      general_email: this.hotelCreateForm.get('general_email')?.value || ''
    };

    this.hotelSettingsService.createSettings(hotelData).subscribe({
      next: (newHotel) => {
        this.hotelCreating = false;
        this.messageService.add({
          severity: 'success',
          summary: ACTION_ALERT_SUCCESS_SUMMARY,
          detail: successActionAlert('create', `hotel ${newHotel.hotel_name}`),
          life: 3000
        });
        
        this.hotelCreateForm.reset();
        this.showHotelCreateModal = false;
        
        // Reload hotels and select the new one
        this.loadHotelOptions();
      },
      error: (err) => {
        this.hotelCreating = false;
        console.error('Error creando hotel:', err);
        
        let errorMsg = 'No se pudo crear el hotel';
        if (err?.error?.detail) {
          errorMsg = err.error.detail;
        } else if (err?.error?.hotel_name) {
          errorMsg = 'El nombre del hotel es requerido.';
        }
        
        this.messageService.add({
          severity: 'error',
          summary: ACTION_ALERT_ERROR_SUMMARY,
          detail: errorMsg,
          life: 3000
        });
      }
    });
  }

  private resetForm(): void {
    this.form.reset({
      role: null,
      job_title_option: null,
      job_title: '',
      is_active: true,
      avatar: '',
      hotel_settings: null
    });
    this.avatarPreview = null;
  }

  private getCreateErrorMessage(err: any): string {
    const backendError = err?.error;
    const fieldErrors = backendError?.errors;

    if (fieldErrors && typeof fieldErrors === 'object') {
      const messages = Object.entries(fieldErrors).flatMap(([field, value]) => {
        const values = Array.isArray(value) ? value : [value];
        return values
          .filter((item) => item !== null && item !== undefined && `${item}`.trim() !== '')
          .map((item) => `${this.getFieldLabel(field)}: ${item}`);
      });

      if (messages.length > 0) {
        return messages.join(' | ');
      }
    }

    if (typeof backendError?.detail === 'string' && backendError.detail.trim()) {
      return backendError.detail;
    }

    return errorActionAlert('register', 'usuario');
  }

  private getFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      username: 'Usuario',
      email: 'Correo',
      password: 'Contrasena',
      first_name: 'Nombre',
      last_name: 'Apellido',
      job_title: 'Cargo',
      role: 'Rol',
      job_title_option: 'Cargo',
      avatar: 'Avatar URL',
      hotel_settings: 'Hotel',
      non_field_errors: 'Validacion'
    };

    return labels[field] || field;
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

  private loadJobTitleOptions(roleId: string): void {
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

        if (this.jobTitles.length === 1) {
          const onlyOption = this.jobTitles[0];
          this.form.patchValue({
            job_title_option: onlyOption.id,
            job_title: onlyOption.name
          });
        }
      });
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

        if (this.hotels.length === 1) {
          this.form.patchValue({ hotel_settings: this.hotels[0].id });
        }
      });
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
