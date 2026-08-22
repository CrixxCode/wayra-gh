import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';

import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { DemoRequestResponse, DemoRequestService } from '../../../services/demo-request';
import { HotelContextService } from '../../../services/hotel-context';

type DemoRequestStatus = 'ALL' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISCARDED';
type DemoRequestPageControl = number | 'ellipsis';

type DemoRequestStatCard = {
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
};

type DemoRequestStatusOption = {
  value: Exclude<DemoRequestStatus, 'ALL'>;
  label: string;
};

type DemoRequestStatusCounts = Record<Exclude<DemoRequestStatus, 'ALL'>, number>;

@Component({
  selector: 'app-list-demo-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './list-demo-requests.html',
  styleUrls: ['./list-demo-requests.css'],
})
export class ListDemoRequests implements OnInit {
  readonly statusOptions: DemoRequestStatusOption[] = [
    { value: 'NEW', label: 'Nueva' },
    { value: 'CONTACTED', label: 'Contactada' },
    { value: 'CONVERTED', label: 'Convertida' },
    { value: 'DISCARDED', label: 'Descartada' },
  ];
  readonly workflowStatusOptions = this.statusOptions.filter(
    (option) => option.value !== 'CONVERTED'
  );

  loading = true;
  loadError = '';
  actionMessage = '';
  actionMessageType: 'success' | 'warning' = 'success';
  isPlatformAdmin = false;
  updatingId: number | null = null;
  resendingId: number | null = null;
  linkingId: number | null = null;
  openActionMenuRequestId: number | null = null;

  requests: DemoRequestResponse[] = [];
  statCards: DemoRequestStatCard[] = [];
  statusCounts: DemoRequestStatusCounts = {
    NEW: 0,
    CONTACTED: 0,
    CONVERTED: 0,
    DISCARDED: 0,
  };

  search = '';
  statusFilter: DemoRequestStatus = 'ALL';
  currentPage = 1;
  perPage = 10;
  totalItems = 0;
  totalPages = 0;

  private searchInputTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private authService: AuthService,
    private demoRequestService: DemoRequestService,
    private hotelContextService: HotelContextService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadRequests();
  }

  loadRequests(page = this.currentPage): void {
    this.loading = true;
    this.loadError = '';

    this.authService
      .getUserInfo()
      .pipe(
        switchMap((user) => {
          this.isPlatformAdmin = isEffectivePlatformAdmin(user);
          if (!this.isPlatformAdmin) {
            return of(null);
          }

          const search = this.search.trim();
          return forkJoin({
            page: this.demoRequestService.listDemoRequests({
              page,
              page_size: this.perPage,
              search,
              status: this.statusFilter === 'ALL' ? '' : this.statusFilter,
              ordering: '-created_at',
            }),
            counts: this.loadStatusCounts(search),
          });
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar las solicitudes de demo.';
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.requests = response.page.results || [];
          this.totalItems = response.page.count || 0;
          this.currentPage = page;
          this.totalPages = Math.ceil(this.totalItems / this.perPage);
          this.statusCounts = response.counts;
          this.updateStats();
        } else {
          this.requests = [];
          this.totalItems = 0;
          this.totalPages = 0;
          this.statCards = [];
        }

        this.loading = false;
      });
  }

  onSearchInput(): void {
    if (this.searchInputTimer) {
      clearTimeout(this.searchInputTimer);
    }
    this.searchInputTimer = setTimeout(() => this.applyFilters(), 350);
  }

  applyFilters(): void {
    if (this.searchInputTimer) {
      clearTimeout(this.searchInputTimer);
      this.searchInputTimer = null;
    }
    this.loadRequests(1);
  }

  clearFilters(): void {
    this.search = '';
    this.statusFilter = 'ALL';
    this.applyFilters();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.loadRequests(page);
  }

  changePageControl(page: DemoRequestPageControl): void {
    if (page === 'ellipsis') return;
    this.changePage(page);
  }

  updateStatus(request: DemoRequestResponse, status: string): void {
    if (!request.id || request.status === status || this.updatingId === request.id) return;

    if (this.isConverted(request) && status !== 'CONVERTED') {
      this.actionMessageType = 'warning';
      this.actionMessage =
        'La solicitud ya fue convertida. No se puede devolver a seguimiento porque el hotel y el usuario ya existen.';
      return;
    }

    this.updatingId = request.id;
    this.actionMessage = '';
    const baseUrl = status === 'CONVERTED' ? this.loginBaseUrl() : '';

    this.demoRequestService
      .updateStatus(request.id, status, baseUrl)
      .pipe(
        catchError((error) => {
          this.actionMessageType = 'warning';
          this.actionMessage = this.getStatusUpdateErrorMessage(error);
          return of(null);
        })
      )
      .subscribe((response) => {
        this.updatingId = null;
        if (!response) return;

        Object.assign(request, response);
        this.setAccessEmailMessage(response);
        if (response.status !== 'CONVERTED') {
          this.actionMessageType = 'success';
          this.actionMessage = `Solicitud marcada como ${this.getStatusLabel(response.status).toLowerCase()}.`;
        }
        if (!this.matchesCurrentStatusFilter(response)) {
          this.requests = this.requests.filter((item) => item.id !== response.id);
          this.totalItems = Math.max(0, this.totalItems - 1);
          this.totalPages = Math.ceil(this.totalItems / this.perPage);
          if (this.requests.length === 0 && this.currentPage > 1) {
            this.loadRequests(this.currentPage - 1);
            return;
          }
        }
        this.refreshStatusCounts();
        this.updateStats();
      });
  }

  convertRequest(request: DemoRequestResponse): void {
    if (!this.canConvert(request) || this.updatingId === request.id) return;
    this.closeActionMenu();

    const confirmed = window.confirm(
      `Convertir ${request.hotel_name} en hotel activo? Se creara el hotel, el piso inicial, ${request.rooms} habitaciones, el primer usuario administrador y se enviara una clave temporal.`
    );
    if (!confirmed) return;

    this.updateStatus(request, 'CONVERTED');
  }

  resendAccessEmail(request: DemoRequestResponse): void {
    if (!request.id || !request.converted_user || this.resendingId === request.id) return;

    this.closeActionMenu();
    this.resendingId = request.id;
    this.actionMessage = '';

    this.demoRequestService
      .resendAccessEmail(request.id, this.loginBaseUrl())
      .pipe(
        catchError((error) => {
          this.actionMessageType = 'warning';
          this.actionMessage = this.getStatusUpdateErrorMessage(error);
          return of(null);
        })
      )
      .subscribe((response) => {
        this.resendingId = null;
        if (!response) return;

        Object.assign(request, response);
        this.setAccessEmailMessage(response);
      });
  }

  copyAccessLink(request: DemoRequestResponse): void {
    if (!request.id || !request.converted_user || this.linkingId === request.id) return;

    this.closeActionMenu();
    this.linkingId = request.id;
    this.actionMessage = '';

    this.demoRequestService
      .generateAccessLink(request.id, this.loginBaseUrl())
      .pipe(
        catchError((error) => {
          this.actionMessageType = 'warning';
          this.actionMessage = this.getStatusUpdateErrorMessage(error);
          return of(null);
        })
      )
      .subscribe(async (response) => {
        this.linkingId = null;
        const accessUrl = response?.access_url;
        if (!accessUrl) return;

        try {
          await this.copyText(accessUrl);
          this.actionMessageType = 'success';
          this.actionMessage = 'Enlace de ingreso copiado. La clave temporal solo se envia por correo.';
        } catch {
          this.actionMessageType = 'warning';
          this.actionMessage = `No fue posible copiar automaticamente. Enlace: ${accessUrl}`;
        }
      });
  }

  openConvertedHotel(request: DemoRequestResponse): void {
    if (!request.converted_hotel_settings) return;
    this.closeActionMenu();
    this.hotelContextService.selectHotel(request.converted_hotel_settings);
    this.router.navigate(['/hotel-config']);
  }

  toggleActionMenu(request: DemoRequestResponse): void {
    this.openActionMenuRequestId =
      this.openActionMenuRequestId === request.id ? null : request.id;
  }

  closeActionMenu(): void {
    this.openActionMenuRequestId = null;
  }

  formatDate(value?: string | null): string {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';

    return date.toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStatusLabel(status: string): string {
    return this.statusOptions.find((option) => option.value === status)?.label || status || 'Sin estado';
  }

  getStatusClass(status: string): string {
    if (status === 'CONVERTED') return 'ok';
    if (status === 'CONTACTED') return 'info';
    if (status === 'DISCARDED') return 'risk';
    return 'warn';
  }

  canResendAccessEmail(request: DemoRequestResponse): boolean {
    return Boolean(request.converted_user);
  }

  canConvert(request: DemoRequestResponse): boolean {
    return !this.isConverted(request) && request.status !== 'DISCARDED';
  }

  isConverted(request: DemoRequestResponse): boolean {
    return Boolean(
      request.status === 'CONVERTED' ||
        request.converted_hotel_settings ||
        request.converted_user
    );
  }

  isBusy(request: DemoRequestResponse): boolean {
    return (
      this.updatingId === request.id ||
      this.resendingId === request.id ||
      this.linkingId === request.id
    );
  }

  trackByRequest(index: number, request: DemoRequestResponse): number {
    return request.id;
  }

  get pages(): DemoRequestPageControl[] {
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
    return Boolean(this.search.trim() || this.statusFilter !== 'ALL');
  }

  get showingFrom(): number {
    if (!this.totalItems) return 0;
    return (this.currentPage - 1) * this.perPage + 1;
  }

  get showingTo(): number {
    if (!this.totalItems) return 0;
    return Math.min(this.currentPage * this.perPage, this.totalItems);
  }

  private updateStats(): void {
    const totalMatchingSearch = Object.values(this.statusCounts).reduce((sum, value) => sum + value, 0);

    this.statCards = [
      {
        label: 'Solicitudes filtradas',
        value: this.formatInteger(this.totalItems),
        note: `${this.formatInteger(totalMatchingSearch)} coinciden con la busqueda`,
        icon: 'fa-solid fa-inbox',
        tone: 'blue',
      },
      {
        label: 'Nuevas',
        value: this.formatInteger(this.statusCounts.NEW),
        note: 'Pendientes por revisar',
        icon: 'fa-regular fa-bell',
        tone: 'amber',
      },
      {
        label: 'Contactadas',
        value: this.formatInteger(this.statusCounts.CONTACTED),
        note: 'Ya tienen seguimiento',
        icon: 'fa-solid fa-phone-volume',
        tone: 'blue',
      },
      {
        label: 'Convertidas',
        value: this.formatInteger(this.statusCounts.CONVERTED),
        note: `${this.formatInteger(this.statusCounts.DISCARDED)} descartadas`,
        icon: 'fa-solid fa-circle-check',
        tone: 'green',
      },
    ];
  }

  private loadStatusCounts(search: string) {
    const countRequest = (status: Exclude<DemoRequestStatus, 'ALL'>) =>
      this.demoRequestService.listDemoRequests({
        page: 1,
        page_size: 1,
        search,
        status,
        ordering: '-created_at',
      });

    return forkJoin({
      NEW: countRequest('NEW'),
      CONTACTED: countRequest('CONTACTED'),
      CONVERTED: countRequest('CONVERTED'),
      DISCARDED: countRequest('DISCARDED'),
    }).pipe(
      switchMap((counts) =>
        of({
          NEW: counts.NEW.count || 0,
          CONTACTED: counts.CONTACTED.count || 0,
          CONVERTED: counts.CONVERTED.count || 0,
          DISCARDED: counts.DISCARDED.count || 0,
        })
      ),
      catchError(() => of(this.statusCounts))
    );
  }

  private refreshStatusCounts(): void {
    this.loadStatusCounts(this.search.trim()).subscribe((counts) => {
      this.statusCounts = counts;
      this.updateStats();
    });
  }

  private matchesCurrentStatusFilter(request: DemoRequestResponse): boolean {
    return this.statusFilter === 'ALL' || request.status === this.statusFilter;
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
  }

  private loginBaseUrl(): string {
    return `${window.location.origin}/login`;
  }

  private copyText(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return Promise.reject(new Error('Clipboard API is not available.'));
  }

  private setAccessEmailMessage(request: DemoRequestResponse): void {
    if (request.status !== 'CONVERTED' || !request.converted_user) return;

    const emailDeliveryError = String(request.email_delivery_error || '').trim();
    if (emailDeliveryError) {
      this.actionMessageType = 'warning';
      this.actionMessage = emailDeliveryError;
      return;
    }

    if (request.email_delivery_enabled === false) {
      this.actionMessageType = 'warning';
      this.actionMessage =
        'Hotel y primer usuario creados. El correo no se envio porque Resend no esta configurado; agrega RESEND_API_KEY y reenvia la clave temporal.';
      return;
    }

    if (!request.password_reset_sent) {
      this.actionMessageType = 'warning';
      this.actionMessage =
        'Hotel y primer usuario creados, pero no fue posible enviar la clave temporal. Revisa la configuracion de Resend.';
      return;
    }

    this.actionMessageType = 'success';
    this.actionMessage = 'Hotel y primer usuario creados. Clave temporal enviada por correo.';
  }

  private getStatusUpdateErrorMessage(error: any): string {
    const detail = error?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    const fieldMessages = Object.values(error?.error || {})
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map((value) => String(value));

    if (fieldMessages.length) {
      return fieldMessages.join(' ');
    }

    return 'No fue posible actualizar el estado de la solicitud.';
  }
}
