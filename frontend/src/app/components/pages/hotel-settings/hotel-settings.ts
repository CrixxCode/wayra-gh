import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { environment } from '../../../../enviorements/environment';
import { MasterDataI } from '../master-data/master-data-model';
import { AuthService } from '../../../services/auth/auth';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { ReservationService } from '../../../services/reservation';
import { FinancialControlConfigPayload, FinancialControlService } from '../../../services/financial-control';
import { ReservationPolicyI, ReservationPolicyPayloadI } from '../../../modules/reservations/reservation-model';
import { HotelFloor, HotelSettings as HotelSettingsModel } from './hotel-setting-model';

type SettingsTab = 'general' | 'contact' | 'structure' | 'operation' | 'policies';
type SettingsForm = {
  hotel_name: string;
  legal_name: string;
  slogan: string;
  description: string;
  logo: string;
  stars: number;
  facebook: string;
  instagram: string;
  twitter_x: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  primary_phone: string;
  secondary_phone: string;
  general_email: string;
  reservations_email: string;
  website: string;
  check_in_time: string;
  check_out_time: string;
  max_guests_per_room: number;
  currency: string;
  tax_rate: number;
  system_language: string;
  timezone: string;
};

type ReservationPolicyForm = {
  id: number | null;
  policy_type: number | null;
  penalty_type: number | null;
  name: string;
  description: string;
  penalty_value: number | null;
  hours_before_checkin: number | null;
  is_active: boolean;
};

type FinancialConfigForm = {
  district_name: string;
  tourism_law_enabled: boolean;
  tourism_law_preferential_rate: number | null;
  standard_income_tax_rate: number | null;
  has_iva_exemption: boolean;
  iva_rate: number | null;
  ica_rate_per_thousand: number | null;
  fontur_rate_per_thousand: number | null;
  break_even_warning_pct: number | null;
  break_even_optimal_pct: number | null;
};

@Component({
  selector: 'app-hotel-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hotel-settings.html',
  styleUrl: './hotel-settings.css',
})
export class HotelSettings implements OnInit {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly floorsUrl = `${this.apiBase}/api/hotel-floors/`;
  private readonly themePrimaryStorageKey = 'gh_theme_primary';
  private readonly themeSecondaryStorageKey = 'gh_theme_secondary';
  private readonly defaultThemePrimaryColor = '#0f1f41';
  private readonly defaultThemeSecondaryColor = '#112853';

  loading = true;
  saving = false;
  errorMessage = '';
  successMessage = '';
  canEdit = false;
  canReadPolicies = false;
  canEditPolicies = false;
  canReadFinancialConfig = false;
  canEditFinancialConfig = false;
  isSuperAdmin = false;

  activeTab: SettingsTab = 'general';
  settingsId: number | null = null;
  updatedAt: string | null = null;
  selectedHotelSettingsId: number | null = null;
  isCreatingHotel = false;
  superAdminHotelOptions: HotelSettingsModel[] = [];

  form: SettingsForm = this.buildDefaultForm();
  floors: HotelFloor[] = [];
  deletedFloorIds: number[] = [];
  reservationPolicies: ReservationPolicyI[] = [];
  policyTypes: MasterDataI[] = [];
  penaltyTypes: MasterDataI[] = [];
  policyForm: ReservationPolicyForm = this.buildDefaultPolicyForm();
  policyLoading = false;
  policySaving = false;
  policyDeletingId: number | null = null;

  financialConfigId: number | null = null;
  financialConfigForm: FinancialConfigForm = this.buildDefaultFinancialConfigForm();
  financialConfigLoading = false;
  financialConfigSaving = false;
  financialConfigErrorMessage = '';
  financialConfigSuccessMessage = '';

  private initialSnapshot = '';
  private readonly defaultDistrictName = 'Riohacha';
  themePrimaryColor = this.defaultThemePrimaryColor;
  themeSecondaryColor = this.defaultThemeSecondaryColor;

  readonly tabs: Array<{ key: SettingsTab; label: string; icon: string }> = [
    { key: 'general', label: 'Información General', icon: 'fa-solid fa-building' },
    { key: 'contact', label: 'Contacto & Ubicación', icon: 'fa-solid fa-location-dot' },
    { key: 'structure', label: 'Estructura', icon: 'fa-solid fa-layer-group' },
    { key: 'policies', label: 'Politicas de Reserva', icon: 'fa-solid fa-file-contract' },
    { key: 'operation', label: 'Operación', icon: 'fa-regular fa-clock' },
  ];

  readonly currencyOptions = [
    { code: 'COP', label: 'COP - Peso Colombiano' },
    { code: 'MXN', label: 'MXN - Peso Mexicano' },
    { code: 'USD', label: 'USD - Dólar Estadounidense' },
    { code: 'EUR', label: 'EUR - Euro' },
  ];

  readonly languageOptions = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'Inglés' },
    { code: 'pt', label: 'Portugués' },
  ];

  readonly timezoneOptions = [
    'America/Bogota',
    'America/Mexico_City',
    'America/New_York',
    'Europe/Madrid',
  ];

  constructor(
    private settingsSvc: HotelSettingsService,
    private http: HttpClient,
    private auth: AuthService,
    private masterDataService: MasterDataService,
    private reservationService: ReservationService,
    private financialControlService: FinancialControlService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadThemeCustomization();
    this.resolvePermissions();
  }

  selectTab(tab: SettingsTab): void {
    this.activeTab = tab;
  }

  get totalFloors(): number {
    return this.floors.length;
  }

  get totalRooms(): number {
    return this.floors.reduce((sum, floor) => sum + (Number(floor.room_count) || 0), 0);
  }

  get averageRoomsPerFloor(): number {
    if (!this.totalFloors) return 0;
    return Number((this.totalRooms / this.totalFloors).toFixed(1));
  }

  get starsArray(): number[] {
    const stars = Math.max(1, Math.min(5, Number(this.form.stars) || 1));
    return Array.from({ length: 5 }, (_, i) => (i < stars ? 1 : 0));
  }

  get taxRateDisplay(): string {
    return `${Number(this.form.tax_rate || 0).toFixed(0)}%`;
  }

  get lastUpdatedLabel(): string {
    if (!this.updatedAt) return 'Sin actualizaciones registradas';
    const parsed = new Date(this.updatedAt);
    if (Number.isNaN(parsed.getTime())) return 'Sin actualizaciones registradas';

    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      hour12: true,
    }).format(parsed);
  }

  get hasChanges(): boolean {
    return this.initialSnapshot !== this.currentSnapshot();
  }

  get isActiveTabReadOnly(): boolean {
    if (!this.canManageSelectedHotel) return true;
    if (this.activeTab === 'policies') return !this.canEditPolicies;
    return !this.canEdit;
  }

  get canManageSelectedHotel(): boolean {
    return !this.isSuperAdmin || this.selectedHotelSettingsId !== null || this.isCreatingHotel;
  }

  get activePoliciesCount(): number {
    return this.reservationPolicies.filter((policy) => policy.is_active !== false).length;
  }

  get isPercentagePenaltySelected(): boolean {
    return this.getPenaltyTypeCode(this.policyForm.penalty_type) === 'PERCENTAGE';
  }

  get hasFinancialConfig(): boolean {
    return !!this.financialConfigId;
  }

  setStars(value: number): void {
    if (!this.canEdit) return;
    this.form.stars = value;
  }

  resolveLogoSrc(): string {
    return this.auth.buildMediaUrl(this.form.logo || '');
  }

  addFloor(): void {
    if (!this.canEdit) return;
    const nextFloorNumber = Math.max(0, ...this.floors.map((f) => Number(f.floor_number) || 0)) + 1;
    this.floors = [
      ...this.floors,
      {
        floor_number: nextFloorNumber,
        name: `Piso ${nextFloorNumber}`,
        prefix: String(nextFloorNumber),
        room_count: 1,
      },
    ];
  }

  removeFloor(index: number): void {
    if (!this.canEdit) return;
    const floor = this.floors[index];
    if (!floor) return;
    if (floor.id) this.deletedFloorIds.push(floor.id);
    this.floors = this.floors.filter((_, i) => i !== index);
  }

  floorRange(floor: HotelFloor): string {
    const prefix = `${floor.prefix || ''}`.trim();
    const roomCount = Number(floor.room_count) || 0;
    if (!prefix || roomCount <= 0) return 'Sin rango';

    const start = `${prefix}01`;
    const end = `${prefix}${String(roomCount).padStart(2, '0')}`;
    return `${start} - ${end}`;
  }

  trackPolicy(_: number, policy: ReservationPolicyI): number {
    return policy.id;
  }

  newPolicy(): void {
    if (!this.canEditPolicies) return;
    this.policyForm = this.buildDefaultPolicyForm();
    this.applyPolicyCatalogDefaults();
    this.errorMessage = '';
    this.successMessage = '';
  }

  editPolicy(policy: ReservationPolicyI): void {
    if (!this.canEditPolicies) return;

    const penaltyValue =
      policy.penalty_value === undefined || policy.penalty_value === null || policy.penalty_value === ''
        ? null
        : Number(policy.penalty_value);

    this.policyForm = {
      id: policy.id,
      policy_type: Number(policy.policy_type) || null,
      penalty_type: Number(policy.penalty_type) || null,
      name: (policy.name || '').trim(),
      description: String(policy.description || ''),
      penalty_value: Number.isNaN(penaltyValue) ? null : penaltyValue,
      hours_before_checkin:
        policy.hours_before_checkin === undefined || policy.hours_before_checkin === null
          ? null
          : Number(policy.hours_before_checkin),
      is_active: policy.is_active !== false
    };

    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelPolicyEdition(): void {
    this.policyForm = this.buildDefaultPolicyForm();
    this.applyPolicyCatalogDefaults();
    this.errorMessage = '';
    this.successMessage = '';
  }

  savePolicy(): void {
    if (!this.canEditPolicies) {
      this.errorMessage = 'No tienes permisos para modificar politicas de reserva.';
      return;
    }

    const validation = this.validatePolicyBeforeSave();
    if (validation) {
      this.errorMessage = validation;
      return;
    }

    const payload = this.buildPolicyPayload();
    if (!payload) {
      this.errorMessage = 'No se pudo construir la politica a guardar.';
      return;
    }

    this.policySaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const request$ = this.policyForm.id
      ? this.reservationService.updateReservationPolicy(this.policyForm.id, payload)
      : this.reservationService.createReservationPolicy(payload);

    request$.subscribe({
      next: () => {
        this.policySaving = false;
        const wasEditing = !!this.policyForm.id;
        this.policyForm = this.buildDefaultPolicyForm();
        this.applyPolicyCatalogDefaults();
        this.loadReservationPolicies();
        this.successMessage = wasEditing
          ? successActionAlert('update', 'politica de reserva')
          : successActionAlert('create', 'politica de reserva');
      },
      error: (error) => {
        this.policySaving = false;
        this.errorMessage = this.extractApiErrorMessage(
          error,
          errorActionAlert('save', 'politica de reserva')
        );
      }
    });
  }

  deletePolicy(policy: ReservationPolicyI): void {
    if (!this.canEditPolicies) return;
    const policyName = (policy.name || '').trim() || `#${policy.id}`;

    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: `politica ${policyName}`,
      onAccept: () => {
        this.policyDeletingId = policy.id;
        this.errorMessage = '';
        this.successMessage = '';

        this.reservationService.deleteReservationPolicy(policy.id).subscribe({
          next: () => {
            if (this.policyForm.id === policy.id) {
              this.policyForm = this.buildDefaultPolicyForm();
              this.applyPolicyCatalogDefaults();
            }

            this.loadReservationPolicies();
            this.policyDeletingId = null;
            this.successMessage = successActionAlert('delete', 'politica de reserva');
          },
          error: (error) => {
            this.policyDeletingId = null;
            this.errorMessage = this.extractApiErrorMessage(
              error,
              errorActionAlert('delete', 'politica de reserva')
            );
          }
        });
      }
    });
  }

  policyPenaltyLabel(policy: ReservationPolicyI): string {
    const penaltyCode = this.normalizeCode(policy.penalty_type_code);
    const penaltyValue = Number(policy.penalty_value);

    if (Number.isNaN(penaltyValue)) {
      return policy.penalty_type_name || policy.penalty_type_code || 'Sin penalidad';
    }

    if (penaltyCode === 'PERCENTAGE') {
      return `${penaltyValue}%`;
    }

    return penaltyValue.toLocaleString('es-CO');
  }

  saveSettings(): void {
    if (!this.canEdit) {
      this.errorMessage = 'No tienes permisos para modificar la configuración del hotel.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.canManageSelectedHotel) {
      this.errorMessage = 'Selecciona un hotel para poder guardar cambios.';
      return;
    }

    const validation = this.validateBeforeSave();
    if (validation) {
      this.errorMessage = validation;
      return;
    }

    this.saving = true;
    const payload = this.buildSavePayload();
    const save$ = this.settingsId
      ? this.settingsSvc.updateSettings(this.settingsId, payload)
      : this.settingsSvc.createSettings(payload);

    save$
      .pipe(
        switchMap((saved) => {
          this.settingsId = saved.id ?? null;
          if (this.isSuperAdmin && this.settingsId) {
            this.selectedHotelSettingsId = this.settingsId;
            this.isCreatingHotel = false;
          }
          this.updatedAt = this.extractUpdatedAt(saved);
          if (!saved.id) return of(saved);

          return this.syncFloors(saved.id).pipe(map(() => saved));
        }),
        switchMap(() => this.settingsSvc.getCurrentSettings(this.getCurrentHotelContextId()))
      )
      .subscribe({
        next: (fresh) => {
          this.saving = false;
          this.applySettings(fresh);
          this.refreshSuperAdminHotelOptions();
          this.notifyBrandingUpdated();
          this.initialSnapshot = this.currentSnapshot();
          this.successMessage = successActionAlert('save', 'configuracion del hotel');
        },
        error: () => {
          this.saving = false;
          this.errorMessage = errorActionAlert('save', 'configuracion del hotel');
        },
      });
  }

  discardChanges(): void {
    if (!this.canEdit) return;
    if (!this.canManageSelectedHotel) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.loadCurrentSettings(this.getCurrentHotelContextId());
  }

  clearAllSettings(): void {
    if (!this.canEdit || this.saving) return;
    if (!this.canManageSelectedHotel) {
      this.errorMessage = 'Selecciona un hotel para poder eliminar su configuracion.';
      return;
    }

    if (!this.settingsId) {
      this.errorMessage = 'No hay configuracion activa para eliminar.';
      return;
    }

    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: 'configuracion del hotel',
      onAccept: () => {
        this.saving = true;
        this.errorMessage = '';
        this.successMessage = '';

        this.settingsSvc
          .clearSettings(this.settingsId)
          .pipe(switchMap(() => this.settingsSvc.getCurrentSettings(this.getCurrentHotelContextId())))
          .subscribe({
            next: (fresh) => {
              this.saving = false;
              this.applySettings(fresh);
              if (!fresh && this.isSuperAdmin) {
                this.selectedHotelSettingsId = null;
              }
              this.refreshSuperAdminHotelOptions();
              this.notifyBrandingUpdated();
              this.initialSnapshot = this.currentSnapshot();
              this.successMessage = successActionAlert('delete', 'configuracion del hotel');
            },
            error: (error) => {
              this.saving = false;
              if (error?.status === 404) {
                this.applySettings(null);
                if (this.isSuperAdmin) {
                  this.selectedHotelSettingsId = null;
                }
                this.refreshSuperAdminHotelOptions();
                this.notifyBrandingUpdated();
                this.initialSnapshot = this.currentSnapshot();
                this.successMessage = 'No habia configuracion activa.';
                return;
              }
              this.errorMessage = errorActionAlert('delete', 'configuracion del hotel');
            },
          });
      }
    });
  }

  resetOperationDefaults(): void {
    if (!this.canEdit) return;
    this.form.check_in_time = '14:00';
    this.form.check_out_time = '12:00';
    this.form.max_guests_per_room = 2;
    this.form.currency = 'COP';
    this.form.tax_rate = 19;
    this.form.system_language = 'es';
    this.form.timezone = 'America/Bogota';
  }

  onThemeColorsChanged(): void {
    this.themePrimaryColor = this.normalizeThemeColor(this.themePrimaryColor, this.defaultThemePrimaryColor);
    this.themeSecondaryColor = this.normalizeThemeColor(this.themeSecondaryColor, this.defaultThemeSecondaryColor);
    this.persistThemeCustomization();
    this.applyThemeCustomization();
  }

  resetThemeColors(): void {
    this.themePrimaryColor = this.defaultThemePrimaryColor;
    this.themeSecondaryColor = this.defaultThemeSecondaryColor;
    this.persistThemeCustomization();
    this.applyThemeCustomization();
  }

  get themeOnPrimaryColor(): string {
    return this.resolveOnBrandColor(this.themePrimaryColor);
  }

  resetFinancialConfigForm(): void {
    this.financialConfigErrorMessage = '';
    this.financialConfigSuccessMessage = '';

    if (!this.settingsId) {
      this.financialConfigForm = this.buildDefaultFinancialConfigForm();
      return;
    }

    this.loadFinancialConfigForCurrentHotel();
  }

  saveFinancialConfig(): void {
    this.financialConfigErrorMessage = '';
    this.financialConfigSuccessMessage = '';

    if (!this.canEditFinancialConfig) {
      this.financialConfigErrorMessage = 'No tienes permisos para modificar la configuracion financiera.';
      return;
    }

    const hotelSettingsId = this.settingsId;
    if (!hotelSettingsId) {
      this.financialConfigErrorMessage = 'Guarda primero la configuracion del hotel para asociar estos parametros.';
      return;
    }

    const payloadResult = this.buildFinancialConfigPayload(hotelSettingsId);
    if (payloadResult.error) {
      this.financialConfigErrorMessage = payloadResult.error;
      return;
    }

    this.financialConfigSaving = true;
    const updatePayload: Partial<FinancialControlConfigPayload> = { ...payloadResult.payload };
    delete updatePayload.hotel_settings;

    const request$ = this.financialConfigId
      ? this.financialControlService.updateConfig(this.financialConfigId, updatePayload)
      : this.financialControlService.createConfig(payloadResult.payload);

    request$.subscribe({
      next: (saved) => {
        this.financialConfigSaving = false;
        this.financialConfigId = this.toOptionalPositiveInt(saved['id']);
        this.applyFinancialConfigRecord(saved);
        this.financialConfigSuccessMessage = this.financialConfigId
          ? successActionAlert('save', 'configuracion financiera')
          : 'Configuracion financiera creada correctamente.';
      },
      error: (error) => {
        this.financialConfigSaving = false;
        this.financialConfigErrorMessage = this.extractApiErrorMessage(
          error,
          errorActionAlert('save', 'configuracion financiera')
        );
      },
    });
  }

  trackFloor(_: number, floor: HotelFloor): number | string {
    return floor.id ?? `${floor.floor_number}-${floor.prefix}`;
  }

  onSuperAdminHotelChange(): void {
    if (!this.isSuperAdmin) return;

    this.errorMessage = '';
    this.successMessage = '';

    const selectedId = this.toOptionalPositiveInt(this.selectedHotelSettingsId);
    this.selectedHotelSettingsId = selectedId;
    this.isCreatingHotel = false;

    if (!selectedId) {
      this.loading = false;
      this.applySettings(null);
      this.initialSnapshot = this.currentSnapshot();
      return;
    }

    this.loadCurrentSettings(selectedId);
  }

  startSuperAdminHotelCreate(): void {
    if (!this.isSuperAdmin || !this.canEdit) return;

    this.errorMessage = '';
    this.successMessage = '';
    this.selectedHotelSettingsId = null;
    this.isCreatingHotel = true;
    this.loading = false;
    this.applySettings(null);
    this.initialSnapshot = this.currentSnapshot();
  }

  private loadCurrentSettings(hotelSettingsId?: number | null): void {
    this.loading = true;
    this.settingsSvc.getCurrentSettings(hotelSettingsId).subscribe({
      next: (settings) => {
        this.loading = false;
        this.applySettings(settings);
        this.initialSnapshot = this.currentSnapshot();
      },
      error: () => {
        this.loading = false;
        this.applySettings(null);
        this.initialSnapshot = this.currentSnapshot();
        this.errorMessage = 'No se pudo cargar la configuración actual.';
      },
    });
  }

  private resolvePermissions(): void {
    this.auth.getUserInfo().subscribe({
      next: (user) => {
        const keys = Array.isArray(user.resource_keys) ? user.resource_keys : [];
        this.isSuperAdmin = this.resolveIsSuperAdmin(user);
        this.canEdit = this.hasSettingsWritePermission(keys);
        this.canReadPolicies = this.hasPoliciesReadPermission(keys);
        this.canEditPolicies = this.hasPoliciesWritePermission(keys);
        this.canReadFinancialConfig = this.hasFinancialControlReadPermission(keys);
        this.canEditFinancialConfig = this.hasFinancialControlWritePermission(keys);

        if (this.canReadPolicies) {
          this.loadPolicyCatalogs();
          if (this.settingsId) {
            this.loadReservationPolicies();
          }
        } else {
          this.resetPolicyState();
        }

        if (!this.canReadFinancialConfig) {
          this.resetFinancialConfigState();
        }

        if (this.isSuperAdmin) {
          this.isCreatingHotel = false;
          this.loadSuperAdminHotelOptions();
          return;
        }

        this.selectedHotelSettingsId = null;
        this.isCreatingHotel = false;
        this.superAdminHotelOptions = [];
        this.loadCurrentSettings();
      },
      error: () => {
        this.loading = false;
        this.isSuperAdmin = false;
        this.canEdit = false;
        this.canReadPolicies = false;
        this.canEditPolicies = false;
        this.canReadFinancialConfig = false;
        this.canEditFinancialConfig = false;
        this.selectedHotelSettingsId = null;
        this.isCreatingHotel = false;
        this.superAdminHotelOptions = [];
        this.resetPolicyState();
        this.resetFinancialConfigState();
        this.applySettings(null);
        this.initialSnapshot = this.currentSnapshot();
      }
    });
  }

  private resolveIsSuperAdmin(user: unknown): boolean {
    if (!user || typeof user !== 'object') return false;

    const normalizedUser = user as {
      is_superuser?: boolean;
      is_staff?: boolean;
      hotel_settings?: unknown;
    };

    const explicitFlag = normalizedUser.is_superuser;
    if (typeof explicitFlag === 'boolean') {
      return explicitFlag;
    }

    const isStaff = Boolean(normalizedUser.is_staff);
    const hasHotel = Boolean(normalizedUser.hotel_settings);
    return isStaff && !hasHotel;
  }

  private loadSuperAdminHotelOptions(preferredHotelId?: number | null): void {
    this.loading = true;
    this.settingsSvc.listSettings().subscribe({
      next: (hotels) => {
        this.superAdminHotelOptions = [...hotels]
          .filter((hotel) => this.toOptionalPositiveInt(hotel.id) !== null)
          .sort((left, right) =>
            String(left.hotel_name || '').localeCompare(String(right.hotel_name || ''), 'es-CO')
          );

        const preferredId = this.toOptionalPositiveInt(preferredHotelId);
        const hasPreferredSelection =
          preferredId !== null &&
          this.superAdminHotelOptions.some((hotel) => hotel.id === preferredId);
        this.selectedHotelSettingsId = hasPreferredSelection ? preferredId : null;
        this.isCreatingHotel = false;

        if (!this.selectedHotelSettingsId) {
          this.loading = false;
          this.applySettings(null);
          this.initialSnapshot = this.currentSnapshot();
          return;
        }

        this.loadCurrentSettings(this.selectedHotelSettingsId);
      },
      error: () => {
        this.loading = false;
        this.superAdminHotelOptions = [];
        this.selectedHotelSettingsId = null;
        this.isCreatingHotel = false;
        this.applySettings(null);
        this.initialSnapshot = this.currentSnapshot();
        this.errorMessage = 'No se pudo cargar el listado de hoteles.';
      }
    });
  }

  private refreshSuperAdminHotelOptions(): void {
    if (!this.isSuperAdmin) return;

    this.settingsSvc
      .listSettings()
      .pipe(catchError(() => of([] as HotelSettingsModel[])))
      .subscribe((hotels) => {
        this.superAdminHotelOptions = [...hotels]
          .filter((hotel) => this.toOptionalPositiveInt(hotel.id) !== null)
          .sort((left, right) =>
            String(left.hotel_name || '').localeCompare(String(right.hotel_name || ''), 'es-CO')
          );

        if (
          this.selectedHotelSettingsId !== null &&
          !this.superAdminHotelOptions.some((hotel) => hotel.id === this.selectedHotelSettingsId)
        ) {
          this.selectedHotelSettingsId = null;
          if (!this.settingsId) {
            this.isCreatingHotel = false;
          }
        }
      });
  }

  private getCurrentHotelContextId(): number | null {
    return this.isSuperAdmin ? this.selectedHotelSettingsId : this.settingsId;
  }

  private hasSettingsWritePermission(resourceKeys: string[]): boolean {
    const normalized = new Set(resourceKeys.map((k) => (k || '').trim().toLowerCase()));
    return (
      normalized.has('*') ||
      normalized.has('hotel_settings.write') ||
      normalized.has('hotel-settings.write') ||
      normalized.has('hotel-config.write') ||
      normalized.has('hotel_settings.*') ||
      normalized.has('hotel-settings.*') ||
      normalized.has('hotel-config.*')
    );
  }

  private hasPoliciesReadPermission(resourceKeys: string[]): boolean {
    const normalized = new Set(resourceKeys.map((k) => (k || '').trim().toLowerCase()));
    return (
      normalized.has('*') ||
      normalized.has('reservation-policies.read') ||
      normalized.has('reservation_policies.read') ||
      normalized.has('reservation-policies.write') ||
      normalized.has('reservation_policies.write') ||
      normalized.has('reservation-policies.*') ||
      normalized.has('reservation_policies.*')
    );
  }

  private hasPoliciesWritePermission(resourceKeys: string[]): boolean {
    const normalized = new Set(resourceKeys.map((k) => (k || '').trim().toLowerCase()));
    return (
      normalized.has('*') ||
      normalized.has('reservation-policies.write') ||
      normalized.has('reservation_policies.write') ||
      normalized.has('reservation-policies.*') ||
      normalized.has('reservation_policies.*')
    );
  }

  private hasFinancialControlReadPermission(resourceKeys: string[]): boolean {
    const normalized = new Set(resourceKeys.map((k) => (k || '').trim().toLowerCase()));
    return (
      normalized.has('*') ||
      normalized.has('financial_control.read') ||
      normalized.has('financial-control.read') ||
      normalized.has('financial_control.write') ||
      normalized.has('financial-control.write') ||
      normalized.has('financial_control.*') ||
      normalized.has('financial-control.*')
    );
  }

  private hasFinancialControlWritePermission(resourceKeys: string[]): boolean {
    const normalized = new Set(resourceKeys.map((k) => (k || '').trim().toLowerCase()));
    return (
      normalized.has('*') ||
      normalized.has('financial_control.write') ||
      normalized.has('financial-control.write') ||
      normalized.has('financial_control.*') ||
      normalized.has('financial-control.*')
    );
  }

  private applySettings(settings: HotelSettingsModel | null): void {
    if (!settings) {
      this.settingsId = null;
      this.updatedAt = null;
      this.form = this.buildDefaultForm();
      this.floors = [];
      this.deletedFloorIds = [];
      this.clearPoliciesCollection();
      this.resetFinancialConfigState();
      return;
    }

    this.settingsId = settings.id ?? null;
    this.updatedAt = this.extractUpdatedAt(settings);
    this.form = {
      ...this.buildDefaultForm(),
      ...settings,
      logo: this.getTrimmedString(settings.logo),
      stars: settings.stars ?? 3,
      tax_rate: Number(settings.tax_rate ?? 0),
      max_guests_per_room: Number(settings.max_guests_per_room ?? 2),
      check_in_time: this.normalizeTime(settings.check_in_time, '14:00'),
      check_out_time: this.normalizeTime(settings.check_out_time, '12:00'),
    };

    this.floors = (settings.floors ?? []).map((floor) => ({
      ...floor,
      room_count: Number(floor.room_count) || 0,
    }));
    this.deletedFloorIds = [];

    if (this.canReadPolicies) {
      this.loadReservationPolicies();
    } else {
      this.clearPoliciesCollection();
    }

    if (this.canReadFinancialConfig) {
      this.loadFinancialConfigForCurrentHotel();
    } else {
      this.resetFinancialConfigState();
    }
  }

  private loadPolicyCatalogs(): void {
    forkJoin({
      policyTypes: this.masterDataService
        .listMasterData({
          group: 'RESERVATION_POLICY_TYPE',
          is_active: 'true',
          ordering: 'sort_order,name'
        })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      penaltyTypes: this.masterDataService
        .listMasterData({
          group: 'RESERVATION_PENALTY_TYPE',
          is_active: 'true',
          ordering: 'sort_order,name'
        })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ policyTypes, penaltyTypes }) => {
        this.policyTypes = [...policyTypes];
        this.penaltyTypes = [...penaltyTypes];
        this.applyPolicyCatalogDefaults();
      }
    });
  }

  private loadReservationPolicies(): void {
    const settingsId = this.settingsId;
    if (!this.canReadPolicies || !settingsId) {
      this.clearPoliciesCollection();
      return;
    }

    this.policyLoading = true;
    this.reservationService
      .listReservationPolicies({
        ordering: '-id',
        hotel_settings: settingsId,
        is_active: true
      })
      .subscribe({
      next: (policies) => {
        this.policyLoading = false;
        this.reservationPolicies = policies.sort((a, b) => b.id - a.id);
      },
      error: (error) => {
        this.policyLoading = false;
        this.reservationPolicies = [];

        if (error?.status === 403) {
          this.canReadPolicies = false;
          this.canEditPolicies = false;
          this.resetPolicyState();
          this.errorMessage = 'No tienes permisos para ver politicas de reserva.';
          return;
        }

        this.errorMessage = 'No se pudieron cargar las politicas de reserva.';
      }
    });
  }

  private clearPoliciesCollection(): void {
    this.reservationPolicies = [];
    this.policyForm = this.buildDefaultPolicyForm();
    this.policyLoading = false;
    this.policySaving = false;
    this.policyDeletingId = null;
    this.applyPolicyCatalogDefaults();
  }

  private resetPolicyState(): void {
    this.policyTypes = [];
    this.penaltyTypes = [];
    this.clearPoliciesCollection();
  }

  private applyPolicyCatalogDefaults(): void {
    if (this.policyForm.id) return;

    if (!this.policyForm.policy_type && this.policyTypes.length > 0) {
      this.policyForm.policy_type = this.policyTypes[0].id;
    }

    if (!this.policyForm.penalty_type && this.penaltyTypes.length > 0) {
      this.policyForm.penalty_type = this.penaltyTypes[0].id;
    }
  }

  private loadFinancialConfigForCurrentHotel(): void {
    const hotelSettingsId = this.settingsId;
    if (!this.canReadFinancialConfig || !hotelSettingsId) {
      this.resetFinancialConfigState();
      return;
    }

    this.financialConfigLoading = true;
    this.financialConfigErrorMessage = '';
    this.financialConfigSuccessMessage = '';

    this.financialControlService.listConfigs({ hotel_settings: hotelSettingsId }).subscribe({
      next: (configs) => {
        this.financialConfigLoading = false;
        const selected = configs.find((item) => this.toOptionalPositiveInt(item['hotel_settings']) === hotelSettingsId);
        if (!selected) {
          this.financialConfigId = null;
          this.financialConfigForm = this.buildDefaultFinancialConfigForm();
          return;
        }

        this.financialConfigId = this.toOptionalPositiveInt(selected['id']);
        this.applyFinancialConfigRecord(selected);
      },
      error: (error) => {
        this.financialConfigLoading = false;

        if (error?.status === 403) {
          this.canReadFinancialConfig = false;
          this.canEditFinancialConfig = false;
          this.resetFinancialConfigState();
          this.financialConfigErrorMessage = 'No tienes permisos para consultar configuracion financiera.';
          return;
        }

        this.financialConfigErrorMessage = this.extractApiErrorMessage(
          error,
          'No se pudo cargar la configuracion financiera.'
        );
      },
    });
  }

  private resetFinancialConfigState(): void {
    this.financialConfigId = null;
    this.financialConfigForm = this.buildDefaultFinancialConfigForm();
    this.financialConfigLoading = false;
    this.financialConfigSaving = false;
    this.financialConfigErrorMessage = '';
    this.financialConfigSuccessMessage = '';
  }

  private applyFinancialConfigRecord(payload: Record<string, unknown>): void {
    this.financialConfigForm = {
      district_name: this.getTrimmedString(payload['district_name']) || this.defaultDistrictName,
      tourism_law_enabled: this.toBoolean(payload['tourism_law_enabled'], true),
      tourism_law_preferential_rate: this.toOptionalNumber(payload['tourism_law_preferential_rate']),
      standard_income_tax_rate: this.toOptionalNumber(payload['standard_income_tax_rate']),
      has_iva_exemption: this.toBoolean(payload['has_iva_exemption'], false),
      iva_rate: this.toOptionalNumber(payload['iva_rate']),
      ica_rate_per_thousand: this.toOptionalNumber(payload['ica_rate_per_thousand']),
      fontur_rate_per_thousand: this.toOptionalNumber(payload['fontur_rate_per_thousand']),
      break_even_warning_pct: this.toOptionalNumber(payload['break_even_warning_pct']),
      break_even_optimal_pct: this.toOptionalNumber(payload['break_even_optimal_pct']),
    };
  }

  private buildFinancialConfigPayload(hotelSettingsId: number): {
    payload: FinancialControlConfigPayload;
    error: string | null;
  } {
    const districtName = this.getTrimmedString(this.financialConfigForm.district_name);
    if (!districtName) {
      return {
        payload: {
          hotel_settings: hotelSettingsId,
          district_name: '',
          tourism_law_enabled: !!this.financialConfigForm.tourism_law_enabled,
          has_iva_exemption: !!this.financialConfigForm.has_iva_exemption,
        },
        error: 'El nombre del distrito es obligatorio.',
      };
    }

    const payload: FinancialControlConfigPayload = {
      hotel_settings: hotelSettingsId,
      district_name: districtName,
      tourism_law_enabled: !!this.financialConfigForm.tourism_law_enabled,
      has_iva_exemption: !!this.financialConfigForm.has_iva_exemption,
    };

    const tourismRateError = this.appendOptionalFinancialNumber(
      payload,
      'tourism_law_preferential_rate',
      this.financialConfigForm.tourism_law_preferential_rate,
      'Tarifa preferencial de ley de turismo'
    );
    if (tourismRateError) return { payload, error: tourismRateError };

    const standardTaxError = this.appendOptionalFinancialNumber(
      payload,
      'standard_income_tax_rate',
      this.financialConfigForm.standard_income_tax_rate,
      'Tarifa estandar de renta'
    );
    if (standardTaxError) return { payload, error: standardTaxError };

    const ivaRateError = this.appendOptionalFinancialNumber(
      payload,
      'iva_rate',
      this.financialConfigForm.iva_rate,
      'Tarifa de IVA'
    );
    if (ivaRateError) return { payload, error: ivaRateError };

    const icaRateError = this.appendOptionalFinancialNumber(
      payload,
      'ica_rate_per_thousand',
      this.financialConfigForm.ica_rate_per_thousand,
      'Tarifa ICA por mil'
    );
    if (icaRateError) return { payload, error: icaRateError };

    const fonturRateError = this.appendOptionalFinancialNumber(
      payload,
      'fontur_rate_per_thousand',
      this.financialConfigForm.fontur_rate_per_thousand,
      'Tarifa FONTUR por mil'
    );
    if (fonturRateError) return { payload, error: fonturRateError };

    const warningRateError = this.appendOptionalFinancialNumber(
      payload,
      'break_even_warning_pct',
      this.financialConfigForm.break_even_warning_pct,
      'Umbral break-even de alerta'
    );
    if (warningRateError) return { payload, error: warningRateError };

    const optimalRateError = this.appendOptionalFinancialNumber(
      payload,
      'break_even_optimal_pct',
      this.financialConfigForm.break_even_optimal_pct,
      'Umbral break-even optimo'
    );
    if (optimalRateError) return { payload, error: optimalRateError };

    const warningPct = payload.break_even_warning_pct;
    const optimalPct = payload.break_even_optimal_pct;
    if (
      warningPct !== undefined &&
      warningPct !== null &&
      optimalPct !== undefined &&
      optimalPct !== null &&
      optimalPct < warningPct
    ) {
      return {
        payload,
        error: 'El umbral optimo debe ser mayor o igual al umbral de alerta.',
      };
    }

    return { payload, error: null };
  }

  private appendOptionalFinancialNumber(
    payload: FinancialControlConfigPayload,
    key:
      | 'tourism_law_preferential_rate'
      | 'standard_income_tax_rate'
      | 'iva_rate'
      | 'ica_rate_per_thousand'
      | 'fontur_rate_per_thousand'
      | 'break_even_warning_pct'
      | 'break_even_optimal_pct',
    value: number | null,
    label: string
  ): string | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return `${label} debe ser numerica.`;
    }
    if (parsed < 0) {
      return `${label} no puede ser negativa.`;
    }

    payload[key] = parsed;
    return null;
  }

  private syncFloors(settingsId: number): Observable<void> {
    const options = this.auth.buildCsrfRequestOptions();
    const createReqs = this.floors
      .filter((floor) => !floor.id)
      .map((floor) =>
        this.http.post(this.floorsUrl, this.floorPayload(floor, settingsId), options)
      );

    const updateReqs = this.floors
      .filter((floor) => !!floor.id)
      .map((floor) =>
        this.http.patch(
          `${this.floorsUrl}${floor.id}/`,
          this.floorPayload(floor, settingsId),
          options
        )
      );

    const deleteReqs = this.deletedFloorIds.map((id) =>
      this.http.delete(`${this.floorsUrl}${id}/`, options)
    );

    const requests = [...createReqs, ...updateReqs, ...deleteReqs];
    if (!requests.length) return of(void 0);

    return forkJoin(requests).pipe(map(() => void 0));
  }

  private floorPayload(floor: HotelFloor, settingsId: number): Partial<HotelFloor> & { hotel_settings: number } {
    return {
      hotel_settings: settingsId,
      floor_number: Number(floor.floor_number) || 1,
      name: (floor.name || '').trim() || `Piso ${Number(floor.floor_number) || 1}`,
      prefix: (floor.prefix || '').trim() || String(Number(floor.floor_number) || 1),
      room_count: Math.max(1, Number(floor.room_count) || 1),
    };
  }

  private buildPayload(): Partial<HotelSettingsModel> {
    return {
      hotel_name: this.form.hotel_name.trim(),
      legal_name: this.emptyAsUndefined(this.form.legal_name),
      slogan: this.emptyAsUndefined(this.form.slogan),
      description: this.emptyAsUndefined(this.form.description),
      logo: this.emptyAsUndefined(this.form.logo),
      stars: Math.max(1, Math.min(5, Number(this.form.stars) || 3)),
      facebook: this.emptyAsUndefined(this.form.facebook),
      instagram: this.emptyAsUndefined(this.form.instagram),
      twitter_x: this.emptyAsUndefined(this.form.twitter_x),
      address: this.emptyAsUndefined(this.form.address),
      city: this.emptyAsUndefined(this.form.city),
      state: this.emptyAsUndefined(this.form.state),
      country: this.emptyAsUndefined(this.form.country),
      postal_code: this.emptyAsUndefined(this.form.postal_code),
      primary_phone: this.emptyAsUndefined(this.form.primary_phone),
      secondary_phone: this.emptyAsUndefined(this.form.secondary_phone),
      general_email: this.emptyAsUndefined(this.form.general_email),
      reservations_email: this.emptyAsUndefined(this.form.reservations_email),
      website: this.emptyAsUndefined(this.form.website),
      check_in_time: this.emptyAsUndefined(this.form.check_in_time),
      check_out_time: this.emptyAsUndefined(this.form.check_out_time),
      max_guests_per_room: Math.max(1, Number(this.form.max_guests_per_room) || 1),
      currency: this.form.currency || 'COP',
      tax_rate: Math.max(0, Math.min(100, Number(this.form.tax_rate) || 0)),
      system_language: this.form.system_language || 'es',
      timezone: this.form.timezone || 'America/Bogota',
    };
  }

  private buildSavePayload(): Partial<HotelSettingsModel> {
    return this.buildPayload();
  }

  private validateBeforeSave(): string | null {
    if (!(this.form.hotel_name || '').trim()) {
      return 'El nombre comercial del hotel es obligatorio.';
    }

    const floorNumbers = new Set<number>();
    for (const floor of this.floors) {
      const floorNumber = Number(floor.floor_number);
      const roomCount = Number(floor.room_count);
      if (!floorNumber || floorNumber < 1) return 'Todos los pisos deben tener un número válido.';
      if (floorNumbers.has(floorNumber)) return 'No puede haber números de piso duplicados.';
      if (!roomCount || roomCount < 1) return 'Cada piso debe tener al menos una habitación.';
      floorNumbers.add(floorNumber);
    }

    if (this.form.check_in_time && this.form.check_out_time && this.form.check_in_time === this.form.check_out_time) {
      return 'Check-in y check-out no pueden tener la misma hora.';
    }

    return null;
  }

  private validatePolicyBeforeSave(): string | null {
    if (!this.settingsId) {
      return 'Debes guardar primero la configuracion principal del hotel.';
    }

    if (!(this.policyForm.name || '').trim()) {
      return 'El nombre de la politica es obligatorio.';
    }

    if (!this.policyForm.policy_type) {
      return 'Debes seleccionar el tipo de politica.';
    }

    if (!this.policyForm.penalty_type) {
      return 'Debes seleccionar el tipo de penalidad.';
    }

    if (this.policyForm.penalty_value !== null && Number(this.policyForm.penalty_value) < 0) {
      return 'El valor de penalidad no puede ser negativo.';
    }

    if (
      this.policyForm.hours_before_checkin !== null &&
      Number(this.policyForm.hours_before_checkin) < 0
    ) {
      return 'Las horas antes del check-in no pueden ser negativas.';
    }

    if (this.isPercentagePenaltySelected) {
      if (this.policyForm.penalty_value === null) {
        return 'El valor de penalidad es obligatorio para penalidad porcentual.';
      }

      if (Number(this.policyForm.penalty_value) > 100) {
        return 'La penalidad porcentual no puede ser mayor a 100.';
      }
    }

    return null;
  }

  private buildPolicyPayload(): ReservationPolicyPayloadI | null {
    if (!this.settingsId) return null;

    const penaltyValue =
      this.policyForm.penalty_value === null || this.policyForm.penalty_value === undefined
        ? null
        : Number(this.policyForm.penalty_value);
    const hoursBeforeCheckin =
      this.policyForm.hours_before_checkin === null || this.policyForm.hours_before_checkin === undefined
        ? null
        : Number(this.policyForm.hours_before_checkin);

    return {
      hotel_settings: this.settingsId,
      policy_type: Number(this.policyForm.policy_type || 0),
      penalty_type: Number(this.policyForm.penalty_type || 0),
      name: (this.policyForm.name || '').trim(),
      description: this.emptyAsNull(this.policyForm.description),
      penalty_value: penaltyValue,
      hours_before_checkin: hoursBeforeCheckin,
      is_active: this.policyForm.is_active
    };
  }

  private getPenaltyTypeCode(penaltyTypeId: number | null): string {
    if (!penaltyTypeId) return '';
    const selected = this.penaltyTypes.find((item) => item.id === penaltyTypeId);
    return this.normalizeCode(selected?.code);
  }

  private currentSnapshot(): string {
    const normalizedFloors = this.floors
      .map((floor) => ({
        id: floor.id ?? null,
        floor_number: Number(floor.floor_number) || 0,
        name: (floor.name || '').trim(),
        prefix: (floor.prefix || '').trim(),
        room_count: Number(floor.room_count) || 0,
      }))
      .sort((a, b) => a.floor_number - b.floor_number);

    return JSON.stringify({
      settingsId: this.settingsId,
      payload: this.buildPayload(),
      floors: normalizedFloors,
      deletedFloorIds: [...this.deletedFloorIds].sort((a, b) => a - b),
    });
  }

  private toOptionalPositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.floor(parsed);
    return normalized > 0 ? normalized : null;
  }

  private toOptionalNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    if (value === null || value === undefined) return fallback;
    return Boolean(value);
  }

  private getTrimmedString(value: unknown): string {
    return String(value || '').trim();
  }

  private normalizeTime(value?: string | null, fallback = '00:00'): string {
    if (!value) return fallback;
    return value.slice(0, 5);
  }

  private emptyAsUndefined(value?: string | null): string | undefined {
    const normalized = (value || '').trim();
    return normalized ? normalized : undefined;
  }

  private emptyAsNull(value?: string | null): string | null {
    const normalized = (value || '').trim();
    return normalized ? normalized : null;
  }

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }

  private extractApiErrorMessage(error: unknown, fallback: string): string {
    const payload =
      error && typeof error === 'object' ? (error as Record<string, unknown>)['error'] : null;

    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === 'object') {
      const detail = (payload as Record<string, unknown>)['detail'];
      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
      }

      for (const value of Object.values(payload as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
          const first = value[0].trim();
          if (first) return first;
        }
      }
    }

    return fallback;
  }

  private loadThemeCustomization(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedPrimary = localStorage.getItem(this.themePrimaryStorageKey);
      const storedSecondary = localStorage.getItem(this.themeSecondaryStorageKey);

      this.themePrimaryColor = this.normalizeThemeColor(storedPrimary, this.defaultThemePrimaryColor);
      this.themeSecondaryColor = this.normalizeThemeColor(storedSecondary, this.defaultThemeSecondaryColor);
      this.applyThemeCustomization();
    } catch {
      this.themePrimaryColor = this.defaultThemePrimaryColor;
      this.themeSecondaryColor = this.defaultThemeSecondaryColor;
    }
  }

  private persistThemeCustomization(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.themePrimaryStorageKey, this.themePrimaryColor);
      localStorage.setItem(this.themeSecondaryStorageKey, this.themeSecondaryColor);
    } catch {
      // Ignore write errors for restricted browser contexts.
    }
  }

  private applyThemeCustomization(): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.style.setProperty('--gh-brand', this.themePrimaryColor);
    root.style.setProperty('--gh-brand-hover', this.themeSecondaryColor);
    root.style.setProperty('--gh-brand-secondary', this.themeSecondaryColor);
    root.style.setProperty('--gh-on-brand', this.resolveOnBrandColor(this.themePrimaryColor));
  }

  private normalizeThemeColor(value: string | null | undefined, fallback: string): string {
    const candidate = String(value || '').trim();
    return /^#[\da-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
  }

  private resolveOnBrandColor(hexColor: string): string {
    const normalized = this.normalizeThemeColor(hexColor, this.defaultThemePrimaryColor).slice(1);
    const red = parseInt(normalized.slice(0, 2), 16) / 255;
    const green = parseInt(normalized.slice(2, 4), 16) / 255;
    const blue = parseInt(normalized.slice(4, 6), 16) / 255;

    const linearize = (channel: number): number =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

    const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
    return luminance > 0.45 ? '#0f172a' : '#ffffff';
  }

  private buildDefaultForm(): SettingsForm {
    return {
      hotel_name: '',
      legal_name: '',
      slogan: '',
      description: '',
      logo: '',
      stars: 3,
      facebook: '',
      instagram: '',
      twitter_x: '',
      address: '',
      city: '',
      state: '',
      country: '',
      postal_code: '',
      primary_phone: '',
      secondary_phone: '',
      general_email: '',
      reservations_email: '',
      website: '',
      check_in_time: '14:00',
      check_out_time: '12:00',
      max_guests_per_room: 2,
      currency: 'COP',
      tax_rate: 19,
      system_language: 'es',
      timezone: 'America/Bogota',
    };
  }

  private buildDefaultFinancialConfigForm(): FinancialConfigForm {
    return {
      district_name: this.getTrimmedString(this.form.city) || this.defaultDistrictName,
      tourism_law_enabled: true,
      tourism_law_preferential_rate: 9,
      standard_income_tax_rate: 35,
      has_iva_exemption: false,
      iva_rate: 19,
      ica_rate_per_thousand: 9.66,
      fontur_rate_per_thousand: 2.5,
      break_even_warning_pct: 90,
      break_even_optimal_pct: 110,
    };
  }

  private buildDefaultPolicyForm(): ReservationPolicyForm {
    return {
      id: null,
      policy_type: null,
      penalty_type: null,
      name: '',
      description: '',
      penalty_value: null,
      hours_before_checkin: null,
      is_active: true
    };
  }

  private extractUpdatedAt(settings: unknown): string | null {
    if (!settings || typeof settings !== 'object') return null;
    const value = (settings as Record<string, unknown>)['updated_at'];
    return typeof value === 'string' ? value : null;
  }

  private notifyBrandingUpdated(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('gh-hotel-brand-updated'));
  }
}

