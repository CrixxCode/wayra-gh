import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { HotelSettings as HotelSettingsModel } from '../../../components/pages/hotel-settings/hotel-setting-model';
import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { SaasDashboardService } from '../../../services/saas-dashboard';
import { SaasHotelSnapshot } from '../saas-dashboard-model';

type SaasHotelsKpiCard = {
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
};

type HotelActiveFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type HotelPageControl = number | 'ellipsis';
type HotelModalMode = 'create' | 'detail' | 'edit' | null;
type CreateHotelStepKey = 'identity' | 'location' | 'operation' | 'review';

type CreateHotelStep = {
  key: CreateHotelStepKey;
  label: string;
  description: string;
  icon: string;
};

type SaasHotelForm = {
  hotel_name: string;
  legal_name: string;
  slogan: string;
  description: string;
  stars: number;
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
  timezone: string;
  system_language: string;
  is_active: boolean;
};

@Component({
  selector: 'app-list-saas-hotels',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './list-saas-hotels.html',
  styleUrls: ['./list-saas-hotels.css'],
})
export class ListSaasHotels implements OnInit {
  loading = true;
  loadError = '';
  actionMessage = '';
  actionMessageType: 'success' | 'warning' = 'success';
  isPlatformAdmin = false;
  updatingHotelId: number | null = null;
  openActionMenuHotelId: number | null = null;
  modalMode: HotelModalMode = null;
  modalHotel: SaasHotelSnapshot | null = null;
  modalDetails: HotelSettingsModel | null = null;
  modalLoading = false;
  modalSaving = false;
  modalError = '';
  hotelForm: SaasHotelForm = this.buildEmptyHotelForm();
  createHotelStep = 0;
  readonly createHotelSteps: CreateHotelStep[] = [
    {
      key: 'identity',
      label: 'Identidad',
      description: 'Nombre, razon social y presencia comercial.',
      icon: 'fa-solid fa-hotel',
    },
    {
      key: 'location',
      label: 'Ubicacion',
      description: 'Ciudad, direccion y canales de contacto.',
      icon: 'fa-solid fa-location-dot',
    },
    {
      key: 'operation',
      label: 'Operacion',
      description: 'Horarios, moneda, impuesto y estado inicial.',
      icon: 'fa-solid fa-sliders',
    },
    {
      key: 'review',
      label: 'Revision',
      description: 'Confirmacion final antes de crear el hotel.',
      icon: 'fa-solid fa-list-check',
    },
  ];

  hotels: SaasHotelSnapshot[] = [];
  filteredHotels: SaasHotelSnapshot[] = [];
  paginatedHotels: SaasHotelSnapshot[] = [];

  search = '';
  activeFilter: HotelActiveFilter = 'ALL';
  healthFilter: 'ALL' | SaasHotelSnapshot['health'] = 'ALL';
  contactFilter: 'ALL' | SaasHotelSnapshot['contactCompleteness'] = 'ALL';
  countryFilter = 'ALL';

  countryOptions: string[] = [];

  currentPage = 1;
  perPage = 10;
  totalPages = 0;

  statCards: SaasHotelsKpiCard[] = [];

  constructor(
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
    private saasDashboardService: SaasDashboardService
  ) {}

  ngOnInit(): void {
    this.loadHotels();
  }

  loadHotels(): void {
    this.loading = true;
    this.loadError = '';
    this.actionMessage = '';
    this.closeActionMenu();

    this.authService
      .getUserInfo()
      .pipe(
        switchMap((user) => {
          this.isPlatformAdmin = isEffectivePlatformAdmin(user);
          if (!this.isPlatformAdmin) {
            return of([] as SaasHotelSnapshot[]);
          }
          return this.saasDashboardService.getHotelsDirectory();
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar el listado global de hoteles.';
          return of([] as SaasHotelSnapshot[]);
        })
      )
      .subscribe((rows) => {
        if (this.isPlatformAdmin && !this.loadError) {
          this.hotels = rows;
          this.countryOptions = this.buildCountryOptions(rows);
          this.updateStats();
          this.applyFilters();
        } else {
          this.hotels = [];
          this.filteredHotels = [];
          this.paginatedHotels = [];
          this.totalPages = 0;
          this.statCards = [];
        }

        this.loading = false;
      });
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();
    this.closeActionMenu();

    this.filteredHotels = this.hotels.filter((hotel) => {
      const matchesSearch =
        !query ||
        hotel.name.toLowerCase().includes(query) ||
        hotel.location.toLowerCase().includes(query) ||
        hotel.generalEmail.toLowerCase().includes(query) ||
        hotel.reservationsEmail.toLowerCase().includes(query) ||
        hotel.primaryPhone.toLowerCase().includes(query) ||
        String(hotel.id).includes(query);

      const matchesHealth = this.healthFilter === 'ALL' || hotel.health === this.healthFilter;
      const matchesContact =
        this.contactFilter === 'ALL' || hotel.contactCompleteness === this.contactFilter;
      const matchesCountry =
        this.countryFilter === 'ALL' || hotel.country.toLowerCase() === this.countryFilter.toLowerCase();
      const matchesActive =
        this.activeFilter === 'ALL' ||
        (this.activeFilter === 'ACTIVE' && hotel.isActive) ||
        (this.activeFilter === 'INACTIVE' && !hotel.isActive);

      return matchesSearch && matchesHealth && matchesContact && matchesCountry && matchesActive;
    });

    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredHotels.length / this.perPage);

    if (this.totalPages === 0) {
      this.paginatedHotels = [];
      this.currentPage = 1;
      return;
    }

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    const start = (this.currentPage - 1) * this.perPage;
    const end = start + this.perPage;
    this.paginatedHotels = this.filteredHotels.slice(start, end);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.closeActionMenu();
    this.updatePagination();
  }

  changePageControl(page: HotelPageControl): void {
    if (page === 'ellipsis') return;
    this.changePage(page);
  }

  clearFilters(): void {
    this.search = '';
    this.activeFilter = 'ALL';
    this.healthFilter = 'ALL';
    this.contactFilter = 'ALL';
    this.countryFilter = 'ALL';
    this.applyFilters();
  }

  openCreateHotelModal(): void {
    this.closeActionMenu();
    this.modalMode = 'create';
    this.modalHotel = null;
    this.modalDetails = null;
    this.modalError = '';
    this.modalLoading = false;
    this.createHotelStep = 0;
    this.hotelForm = this.buildEmptyHotelForm();
  }

  openHotelDetails(hotel: SaasHotelSnapshot): void {
    this.openHotelModal('detail', hotel);
  }

  openHotelConfiguration(hotel: SaasHotelSnapshot): void {
    this.openHotelModal('edit', hotel);
  }

  closeHotelModal(): void {
    if (this.modalSaving) return;
    this.modalMode = null;
    this.modalHotel = null;
    this.modalDetails = null;
    this.modalError = '';
    this.modalLoading = false;
    this.createHotelStep = 0;
    this.hotelForm = this.buildEmptyHotelForm();
  }

  toggleHotelActive(hotel: SaasHotelSnapshot): void {
    if (this.updatingHotelId) return;
    this.closeActionMenu();

    const nextStatus = !hotel.isActive;
    const action = nextStatus ? 'reactivar' : 'suspender';
    const confirmed = window.confirm(
      nextStatus
        ? `Reactivar ${hotel.name}? Sus usuarios podran volver a ingresar.`
        : `Suspender ${hotel.name}? Sus usuarios no podran ingresar hasta reactivarlo.`
    );
    if (!confirmed) return;

    this.updatingHotelId = hotel.id;
    this.loadError = '';
    this.actionMessage = '';

    this.saasDashboardService
      .updateHotelStatus(hotel.id, nextStatus)
      .pipe(
        catchError(() => {
          this.actionMessageType = 'warning';
          this.actionMessage = `No fue posible ${action} el hotel.`;
          return of(null);
        })
      )
      .subscribe((updatedHotel) => {
        this.updatingHotelId = null;
        if (!updatedHotel) return;

        this.replaceHotel(updatedHotel);
        this.updateStats();
        this.applyFilters();
        this.actionMessageType = 'success';
        this.actionMessage = `${updatedHotel.name} quedo ${
          updatedHotel.isActive ? 'activo' : 'suspendido'
        }.`;
      });
  }

  toggleActionMenu(hotel: SaasHotelSnapshot): void {
    this.openActionMenuHotelId =
      this.openActionMenuHotelId === hotel.id ? null : hotel.id;
  }

  closeActionMenu(): void {
    this.openActionMenuHotelId = null;
  }

  saveHotelModal(): void {
    if (!this.modalMode || this.modalMode === 'detail' || this.modalSaving) return;

    if (this.modalMode === 'create' && this.createHotelStep < this.lastCreateHotelStepIndex) {
      this.goToNextCreateHotelStep();
      return;
    }

    const payload = this.buildHotelPayload();
    if (!payload.hotel_name) {
      this.modalError = 'El nombre comercial del hotel es obligatorio.';
      this.createHotelStep = 0;
      return;
    }

    this.modalSaving = true;
    this.modalError = '';
    const savingMode = this.modalMode;
    const targetId = this.modalDetails?.id || this.modalHotel?.id || 0;
    if (savingMode === 'edit' && !targetId) {
      this.modalError = 'No se encontro el hotel que se va a actualizar.';
      return;
    }

    const request =
      savingMode === 'create'
        ? this.hotelSettingsService.createSettings(payload)
        : this.hotelSettingsService.updateSettings(targetId, payload);

    request
      .pipe(
        catchError((error) => {
          this.modalError = this.getHotelSaveErrorMessage(error);
          return of(null);
        })
      )
      .subscribe((hotel) => {
        this.modalSaving = false;
        if (!hotel) return;

        const hotelName = hotel.hotel_name || payload.hotel_name;
        this.closeHotelModal();
        this.loadHotels();
        this.actionMessageType = 'success';
        this.actionMessage =
          savingMode === 'create'
            ? `${hotelName} fue creado.`
            : `${hotelName} fue actualizado.`;
      });
  }

  goToCreateHotelStep(index: number): void {
    if (this.modalMode !== 'create') return;
    if (index < 0 || index > this.lastCreateHotelStepIndex) return;
    if (index > this.createHotelStep && !this.validateCurrentCreateHotelStep()) return;
    this.modalError = '';
    this.createHotelStep = index;
  }

  goToNextCreateHotelStep(): void {
    if (this.modalMode !== 'create') return;
    if (!this.validateCurrentCreateHotelStep()) return;
    this.modalError = '';
    this.createHotelStep = Math.min(this.createHotelStep + 1, this.lastCreateHotelStepIndex);
  }

  goToPreviousCreateHotelStep(): void {
    if (this.modalMode !== 'create') return;
    this.modalError = '';
    this.createHotelStep = Math.max(this.createHotelStep - 1, 0);
  }

  getCreateHotelStepClass(index: number): Record<string, boolean> {
    return {
      'is-current': index === this.createHotelStep,
      'is-complete': index < this.createHotelStep,
    };
  }

  getCreateHotelStepCounter(): string {
    return `${this.createHotelStep + 1} de ${this.createHotelSteps.length}`;
  }

  getCreateHotelReviewValue(value: unknown, fallback = 'Sin definir'): string {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  get lastCreateHotelStepIndex(): number {
    return this.createHotelSteps.length - 1;
  }

  get canCreateHotelFromWizard(): boolean {
    return Boolean(this.cleanText(this.hotelForm.hotel_name));
  }

  exportCsv(): void {
    if (!this.filteredHotels.length) return;

    const headers = [
      'id',
      'hotel',
      'ciudad',
      'pais',
      'correo_general',
      'correo_reservas',
      'telefono',
      'estado_operativo',
      'contacto',
      'salud',
      'pisos',
      'habitaciones',
      'motivo',
      'ultima_actualizacion',
    ];

    const rows = this.filteredHotels.map((hotel) =>
      [
        hotel.id,
        hotel.name,
        hotel.city || '',
        hotel.country || '',
        hotel.generalEmail || '',
        hotel.reservationsEmail || '',
        hotel.primaryPhone || '',
        this.getActiveLabel(hotel),
        this.getContactLabel(hotel.contactCompleteness),
        this.getHealthLabel(hotel.health),
        hotel.totalFloors,
        hotel.totalRooms,
        hotel.attentionReason,
        this.formatDate(hotel.lastUpdatedAt) || hotel.lastUpdatedLabel,
      ]
        .map((cell) => this.escapeCsvCell(cell))
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saas-hoteles-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  getHealthLabel(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'Saludable';
    if (value === 'warning') return 'Observacion';
    return 'Riesgo';
  }

  getActiveLabel(hotel: SaasHotelSnapshot): string {
    return hotel.isActive ? 'Activo' : 'Suspendido';
  }

  getActiveClass(hotel: SaasHotelSnapshot): string {
    return hotel.isActive ? 'ok' : 'risk';
  }

  getContactLabel(value: SaasHotelSnapshot['contactCompleteness']): string {
    if (value === 'full') return 'Completo';
    if (value === 'partial') return 'Parcial';
    return 'Sin contacto';
  }

  getHealthClass(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'ok';
    if (value === 'warning') return 'warn';
    return 'risk';
  }

  getContactClass(value: SaasHotelSnapshot['contactCompleteness']): string {
    if (value === 'full') return 'ok';
    if (value === 'partial') return 'warn';
    return 'risk';
  }

  formatDate(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  trackByHotel(index: number, hotel: SaasHotelSnapshot): number {
    return hotel.id;
  }

  get pages(): HotelPageControl[] {
    if (this.totalPages <= 7) {
      return Array.from({ length: this.totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([
      1,
      this.totalPages,
      this.currentPage - 1,
      this.currentPage,
      this.currentPage + 1,
    ]);
    const ordered = [...pages]
      .filter((page) => page >= 1 && page <= this.totalPages)
      .sort((a, b) => a - b);

    return ordered.flatMap((page, index) => {
      const previous = ordered[index - 1];
      if (index > 0 && previous && page - previous > 1) {
        return ['ellipsis' as const, page];
      }
      return [page];
    });
  }

  get hasActiveFilters(): boolean {
    return Boolean(
      this.search.trim() ||
        this.activeFilter !== 'ALL' ||
        this.healthFilter !== 'ALL' ||
        this.contactFilter !== 'ALL' ||
        this.countryFilter !== 'ALL'
    );
  }

  get showingFrom(): number {
    if (!this.filteredHotels.length) return 0;
    return (this.currentPage - 1) * this.perPage + 1;
  }

  get showingTo(): number {
    if (!this.filteredHotels.length) return 0;
    return Math.min(this.currentPage * this.perPage, this.filteredHotels.length);
  }

  private openHotelModal(mode: Exclude<HotelModalMode, 'create' | null>, hotel: SaasHotelSnapshot): void {
    this.closeActionMenu();
    this.modalMode = mode;
    this.modalHotel = hotel;
    this.modalDetails = null;
    this.modalError = '';
    this.modalLoading = true;
    this.hotelForm = this.buildFormFromSnapshot(hotel);

    this.hotelSettingsService
      .getCurrentSettings(hotel.id)
      .pipe(
        catchError((error) => {
          this.modalError = this.getHotelSaveErrorMessage(error);
          return of(null);
        })
      )
      .subscribe((settings) => {
        this.modalLoading = false;
        if (!settings) return;
        this.modalDetails = settings;
        this.hotelForm = this.buildFormFromSettings(settings);
      });
  }

  private buildEmptyHotelForm(): SaasHotelForm {
    return {
      hotel_name: '',
      legal_name: '',
      slogan: '',
      description: '',
      stars: 3,
      address: '',
      city: '',
      state: '',
      country: 'Colombia',
      postal_code: '',
      primary_phone: '',
      secondary_phone: '',
      general_email: '',
      reservations_email: '',
      website: '',
      check_in_time: '15:00',
      check_out_time: '11:00',
      max_guests_per_room: 2,
      currency: 'COP',
      tax_rate: 0,
      timezone: 'America/Bogota',
      system_language: 'es',
      is_active: true,
    };
  }

  private buildFormFromSnapshot(hotel: SaasHotelSnapshot): SaasHotelForm {
    return {
      ...this.buildEmptyHotelForm(),
      hotel_name: hotel.name,
      city: hotel.city,
      country: hotel.country || 'Colombia',
      general_email: hotel.generalEmail,
      reservations_email: hotel.reservationsEmail,
      primary_phone: hotel.primaryPhone,
      is_active: hotel.isActive,
    };
  }

  private buildFormFromSettings(settings: HotelSettingsModel): SaasHotelForm {
    return {
      ...this.buildEmptyHotelForm(),
      hotel_name: settings.hotel_name || '',
      legal_name: settings.legal_name || '',
      slogan: settings.slogan || '',
      description: settings.description || '',
      stars: Number(settings.stars || 3),
      address: settings.address || '',
      city: settings.city || '',
      state: settings.state || '',
      country: settings.country || 'Colombia',
      postal_code: settings.postal_code || '',
      primary_phone: settings.primary_phone || '',
      secondary_phone: settings.secondary_phone || '',
      general_email: settings.general_email || '',
      reservations_email: settings.reservations_email || '',
      website: settings.website || '',
      check_in_time: this.formatTimeInput(settings.check_in_time),
      check_out_time: this.formatTimeInput(settings.check_out_time),
      max_guests_per_room: Number(settings.max_guests_per_room || 2),
      currency: settings.currency || 'COP',
      tax_rate: Number(settings.tax_rate || 0),
      timezone: settings.timezone || 'America/Bogota',
      system_language: settings.system_language || 'es',
      is_active: settings.is_active !== false,
    };
  }

  private buildHotelPayload(): Partial<HotelSettingsModel> {
    const form = this.hotelForm;
    const payload: Record<string, string | number | boolean | null> = {
      hotel_name: this.cleanText(form.hotel_name),
      legal_name: this.cleanNullableText(form.legal_name),
      slogan: this.cleanNullableText(form.slogan),
      description: this.cleanNullableText(form.description),
      stars: Number(form.stars || 3),
      address: this.cleanNullableText(form.address),
      city: this.cleanNullableText(form.city),
      state: this.cleanNullableText(form.state),
      country: this.cleanNullableText(form.country),
      postal_code: this.cleanNullableText(form.postal_code),
      primary_phone: this.cleanNullableText(form.primary_phone),
      secondary_phone: this.cleanNullableText(form.secondary_phone),
      general_email: this.cleanNullableText(form.general_email),
      reservations_email: this.cleanNullableText(form.reservations_email),
      website: this.cleanNullableText(form.website),
      check_in_time: this.cleanNullableText(form.check_in_time),
      check_out_time: this.cleanNullableText(form.check_out_time),
      max_guests_per_room: Number(form.max_guests_per_room || 2),
      currency: this.cleanNullableText(form.currency) || 'COP',
      tax_rate: Number(form.tax_rate || 0),
      timezone: this.cleanNullableText(form.timezone) || 'America/Bogota',
      system_language: this.cleanNullableText(form.system_language) || 'es',
      is_active: Boolean(form.is_active),
    };
    return payload as Partial<HotelSettingsModel>;
  }

  private cleanText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private cleanNullableText(value: unknown): string | null {
    const normalized = this.cleanText(value);
    return normalized || null;
  }

  private formatTimeInput(value?: string | null): string {
    if (!value) return '';
    return String(value).slice(0, 5);
  }

  private getHotelSaveErrorMessage(error: any): string {
    const detail = error?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;

    const errors = error?.error?.errors || error?.error || {};
    const messages = Object.values(errors)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map((value) => String(value));

    if (messages.length) return messages.join(' ');
    return 'No fue posible guardar la informacion del hotel.';
  }

  private updateStats(): void {
    const total = this.hotels.length;
    const active = this.hotels.filter((hotel) => hotel.isActive).length;
    const inactive = total - active;
    const healthy = this.hotels.filter((hotel) => hotel.health === 'healthy').length;
    const risk = this.hotels.filter((hotel) => hotel.health === 'risk').length;

    this.statCards = [
      {
        label: 'Hoteles registrados',
        value: this.formatInteger(total),
        note: `${this.countryOptions.length} paises en servicio`,
        icon: 'fa-solid fa-hotel',
        tone: 'blue',
      },
      {
        label: 'Activos',
        value: this.formatInteger(active),
        note: `${this.formatInteger(inactive)} suspendidos`,
        icon: 'fa-solid fa-toggle-on',
        tone: 'green',
      },
      {
        label: 'En riesgo',
        value: this.formatInteger(risk),
        note: 'Requieren intervencion prioritaria',
        icon: 'fa-solid fa-triangle-exclamation',
        tone: 'red',
      },
      {
        label: 'Saludables',
        value: this.formatInteger(healthy),
        note: 'Configuracion y contacto completos',
        icon: 'fa-solid fa-shield-heart',
        tone: 'amber',
      },
    ];
  }

  private replaceHotel(updatedHotel: SaasHotelSnapshot): void {
    this.hotels = this.hotels
      .map((hotel) => (hotel.id === updatedHotel.id ? updatedHotel : hotel))
      .sort((a, b) => {
        if (a.health !== b.health) {
          const order: Record<SaasHotelSnapshot['health'], number> = {
            risk: 0,
            warning: 1,
            healthy: 2,
          };
          return order[a.health] - order[b.health];
        }

        if (a.lastUpdatedDays !== b.lastUpdatedDays) {
          const aDays = a.lastUpdatedDays ?? Number.MAX_SAFE_INTEGER;
          const bDays = b.lastUpdatedDays ?? Number.MAX_SAFE_INTEGER;
          return aDays - bDays;
        }

        return a.name.localeCompare(b.name, 'es');
      });
  }

  private buildCountryOptions(rows: SaasHotelSnapshot[]): string[] {
    return [...new Set(rows.map((hotel) => hotel.country.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
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

  private validateCurrentCreateHotelStep(): boolean {
    if (this.createHotelStep === 0 && !this.canCreateHotelFromWizard) {
      this.modalError = 'Escribe el nombre comercial del hotel para continuar.';
      return false;
    }
    return true;
  }
}
