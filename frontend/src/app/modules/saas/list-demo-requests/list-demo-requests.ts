import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { DemoRequestResponse, DemoRequestService } from '../../../services/demo-request';

type DemoRequestStatus = 'ALL' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISCARDED';

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

  loading = true;
  loadError = '';
  actionMessage = '';
  actionMessageType: 'success' | 'warning' = 'success';
  isPlatformAdmin = false;
  updatingId: number | null = null;
  resendingId: number | null = null;
  linkingId: number | null = null;

  requests: DemoRequestResponse[] = [];
  statCards: DemoRequestStatCard[] = [];

  search = '';
  statusFilter: DemoRequestStatus = 'ALL';
  currentPage = 1;
  perPage = 10;
  totalItems = 0;
  totalPages = 0;

  constructor(
    private authService: AuthService,
    private demoRequestService: DemoRequestService
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

          return this.demoRequestService.listDemoRequests({
            page,
            page_size: this.perPage,
            search: this.search.trim(),
            status: this.statusFilter === 'ALL' ? '' : this.statusFilter,
            ordering: '-created_at',
          });
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar las solicitudes de demo.';
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response) {
          this.requests = response.results || [];
          this.totalItems = response.count || 0;
          this.currentPage = page;
          this.totalPages = Math.ceil(this.totalItems / this.perPage);
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

  applyFilters(): void {
    this.loadRequests(1);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.loadRequests(page);
  }

  updateStatus(request: DemoRequestResponse, status: string): void {
    if (!request.id || request.status === status || this.updatingId === request.id) return;

    this.updatingId = request.id;
    this.loadError = '';
    this.actionMessage = '';
    const baseUrl = status === 'CONVERTED' ? this.resetPasswordBaseUrl() : '';

    this.demoRequestService
      .updateStatus(request.id, status, baseUrl)
      .pipe(
        catchError((error) => {
          this.loadError = this.getStatusUpdateErrorMessage(error);
          return of(null);
        })
      )
      .subscribe((response) => {
        this.updatingId = null;
        if (!response) return;

        Object.assign(request, response);
        this.setAccessEmailMessage(response);
        this.updateStats();
      });
  }

  resendAccessEmail(request: DemoRequestResponse): void {
    if (!request.id || !request.converted_user || this.resendingId === request.id) return;

    this.resendingId = request.id;
    this.loadError = '';
    this.actionMessage = '';

    this.demoRequestService
      .resendAccessEmail(request.id, this.resetPasswordBaseUrl())
      .pipe(
        catchError((error) => {
          this.loadError = this.getStatusUpdateErrorMessage(error);
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

    this.linkingId = request.id;
    this.loadError = '';
    this.actionMessage = '';

    this.demoRequestService
      .generateAccessLink(request.id, this.resetPasswordBaseUrl())
      .pipe(
        catchError((error) => {
          this.loadError = this.getStatusUpdateErrorMessage(error);
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
          this.actionMessage = 'Enlace de acceso copiado. Puedes enviarlo manualmente al primer usuario.';
        } catch {
          this.actionMessageType = 'warning';
          this.actionMessage = `No fue posible copiar automaticamente. Enlace: ${accessUrl}`;
        }
      });
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

  trackByRequest(index: number, request: DemoRequestResponse): number {
    return request.id;
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
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
    const counters = this.requests.reduce(
      (acc, request) => {
        const status = request.status || 'NEW';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    this.statCards = [
      {
        label: 'En esta pagina',
        value: this.formatInteger(this.requests.length),
        note: `${this.formatInteger(this.totalItems)} solicitudes totales`,
        icon: 'fa-solid fa-inbox',
        tone: 'blue',
      },
      {
        label: 'Nuevas',
        value: this.formatInteger(counters['NEW'] || 0),
        note: 'Pendientes por revisar',
        icon: 'fa-regular fa-bell',
        tone: 'amber',
      },
      {
        label: 'Contactadas',
        value: this.formatInteger(counters['CONTACTED'] || 0),
        note: 'Ya tienen seguimiento',
        icon: 'fa-solid fa-phone-volume',
        tone: 'blue',
      },
      {
        label: 'Convertidas',
        value: this.formatInteger(counters['CONVERTED'] || 0),
        note: 'Listas para activacion',
        icon: 'fa-solid fa-circle-check',
        tone: 'green',
      },
    ];
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
  }

  private resetPasswordBaseUrl(): string {
    return `${window.location.origin}/reset-password`;
  }

  private copyText(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return Promise.reject(new Error('Clipboard API is not available.'));
  }

  private setAccessEmailMessage(request: DemoRequestResponse): void {
    if (request.status !== 'CONVERTED' || !request.converted_user) return;

    if (request.email_delivery_enabled === false) {
      this.actionMessageType = 'warning';
      this.actionMessage =
        'Hotel y primer usuario creados. El correo no se envio porque el servidor esta en modo consola; configura SMTP y reenvia el enlace.';
      return;
    }

    if (!request.password_reset_sent) {
      this.actionMessageType = 'warning';
      this.actionMessage =
        'Hotel y primer usuario creados, pero no fue posible enviar el enlace de acceso. Revisa la configuracion SMTP.';
      return;
    }

    this.actionMessageType = 'success';
    this.actionMessage = 'Hotel y primer usuario creados. Enlace de acceso enviado.';
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
