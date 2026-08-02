import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { PaymentRefundI } from '../../billing/billing-model';
import { BillingService } from '../../../services/billing';
import { AuthService } from '../../../services/auth/auth';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';

type RefundActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type RefundDateFilter = 'ALL' | 'TODAY' | 'LAST_30';
type RefundViewMode = 'cards' | 'table';

@Component({
  selector: 'app-list-payment-refunds',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-payment-refunds.html',
  styleUrls: ['./list-payment-refunds.css']
})
export class ListPaymentRefunds implements OnInit {
  loading = false;
  approvingRefundId: number | null = null;
  errorMessage = '';
  infoMessage = '';
  isAdmin = false;

  refunds: PaymentRefundI[] = [];
  filteredRefunds: PaymentRefundI[] = [];

  search = '';
  statusFilter = 'ALL';
  activityFilter: RefundActivityFilter = 'ACTIVE';
  dateFilter: RefundDateFilter = 'ALL';
  viewMode: RefundViewMode = 'cards';

  readonly activityOptions: Array<{ value: RefundActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' }
  ];

  readonly dateOptions: Array<{ value: RefundDateFilter; label: string }> = [
    { value: 'LAST_30', label: 'Ultimos 30 dias' },
    { value: 'TODAY', label: 'Hoy' },
    { value: 'ALL', label: 'Todas las fechas' }
  ];

  constructor(
    private billingService: BillingService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadUserContext();
    this.loadRefundsData();
  }

  get totalRefunds(): number {
    return this.refunds.length;
  }

  get activeRefundsCount(): number {
    return this.refunds.filter((refund) => !!refund.is_active).length;
  }

  get processedRefundsCount(): number {
    return this.refunds.filter((refund) => this.getStatusCode(refund) === 'PROCESADO').length;
  }

  get pendingRefundsCount(): number {
    return this.refunds.filter((refund) => this.getStatusCode(refund) === 'PENDIENTE').length;
  }

  get processedRefundAmountLabel(): string {
    const total = this.refunds
      .filter((refund) => !!refund.is_active && this.getStatusCode(refund) === 'PROCESADO')
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
    return this.formatCurrency(total);
  }

  get statusOptions(): Array<{ value: string; label: string }> {
    const base = [{ value: 'ALL', label: 'Todos los estados' }];
    const unique = new Map<string, string>();

    for (const refund of this.refunds) {
      const code = this.getStatusCode(refund);
      if (!code || unique.has(code)) continue;
      unique.set(code, this.getStatusLabel(refund));
    }

    return [
      ...base,
      ...Array.from(unique.entries()).map(([value, label]) => ({
        value,
        label
      }))
    ];
  }

  loadRefundsData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.billingService
      .listPaymentRefunds({ ordering: '-refund_date,-id', include_inactive: true })
      .pipe(catchError(() => of([] as PaymentRefundI[])))
      .subscribe({
        next: (refunds) => {
          this.loading = false;
          this.refunds = [...refunds].sort((a, b) => b.id - a.id);
          this.applyFilters();
          if (!this.refunds.length) {
            this.infoMessage = 'No hay reembolsos registrados todavia.';
          }
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'No fue posible cargar los reembolsos.';
        }
      });
  }

  refreshData(): void {
    this.loadRefundsData();
  }

  exportCsv(): void {
    if (!this.filteredRefunds.length) return;

    const headers = [
      'factura',
      'pago',
      'metodo',
      'fecha_reembolso',
      'monto',
      'estado',
      'actividad',
      'motivo',
      'referencia'
    ];

    const rows = this.filteredRefunds.map((refund) => {
      const row = [
        this.getInvoiceLabel(refund),
        `Pago #${refund.payment}`,
        this.getMethodLabel(refund),
        this.getDateLabel(refund),
        this.toNumber(refund.amount),
        this.getStatusLabel(refund),
        refund.is_active ? 'Activo' : 'Inactivo',
        refund.reason || '',
        refund.reference || ''
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reembolsos-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  canApprove(refund: PaymentRefundI): boolean {
    if (!this.isAdmin) return false;
    if (!refund.is_active) return false;
    if (this.approvingRefundId !== null) return false;
    return this.getStatusCode(refund) === 'PENDIENTE';
  }

  approveRefund(refund: PaymentRefundI): void {
    if (!this.canApprove(refund)) return;

    this.approvingRefundId = refund.id;
    this.errorMessage = '';
    this.infoMessage = '';

    this.billingService.approvePaymentRefund(refund.id).subscribe({
      next: (updated) => {
        this.approvingRefundId = null;
        this.refunds = this.refunds.map((row) => (row.id === updated.id ? updated : row));
        this.applyFilters();
        this.infoMessage = successActionAlert('update', 'estado del reembolso');
      },
      error: (error) => {
        this.approvingRefundId = null;
        this.errorMessage = this.extractErrorMessage(error, errorActionAlert('update', 'estado del reembolso'));
      }
    });
  }

  applyFilters(): void {
    const query = String(this.search || '').trim().toLowerCase();

    this.filteredRefunds = this.refunds.filter((refund) => {
      const activityMatch =
        this.activityFilter === 'ALL' ||
        (this.activityFilter === 'ACTIVE' && refund.is_active) ||
        (this.activityFilter === 'INACTIVE' && !refund.is_active);

      const statusCode = this.getStatusCode(refund);
      const statusMatch = this.statusFilter === 'ALL' || statusCode === this.statusFilter;
      const dateMatch = this.matchesDateFilter(refund);

      const searchPool = [
        this.getInvoiceLabel(refund),
        `PAGO-${refund.payment}`,
        this.getMethodLabel(refund),
        this.getStatusLabel(refund),
        refund.reason || '',
        refund.reference || '',
        refund.notes || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !query || searchPool.includes(query);
      return activityMatch && statusMatch && dateMatch && searchMatch;
    });
  }

  setViewMode(mode: RefundViewMode): void {
    this.viewMode = mode;
  }

  getInvoiceLabel(refund: PaymentRefundI): string {
    if (refund.invoice_number?.trim()) return refund.invoice_number.trim();
    if (typeof refund.invoice === 'number' && refund.invoice > 0) return `FAC-${refund.invoice}`;
    return 'Factura sin identificar';
  }

  getMethodLabel(refund: PaymentRefundI): string {
    if (refund.payment_method_name?.trim()) return refund.payment_method_name.trim();
    if (refund.payment_method_code?.trim()) return refund.payment_method_code.trim();
    return 'Sin metodo';
  }

  getStatusLabel(refund: PaymentRefundI): string {
    if (refund.status_name?.trim()) return refund.status_name.trim();

    switch (this.getStatusCode(refund)) {
      case 'PENDIENTE':
        return 'Pendiente';
      case 'APROBADO':
        return 'Aprobado';
      case 'PROCESADO':
        return 'Procesado';
      case 'RECHAZADO':
        return 'Rechazado';
      case 'ANULADO':
        return 'Anulado';
      default:
        return 'Sin estado';
    }
  }

  getStatusTone(refund: PaymentRefundI): { bg: string; color: string; dot: string } {
    switch (this.getStatusCode(refund)) {
      case 'PROCESADO':
        return {
          bg: 'var(--gh-status-success-bg)',
          color: 'var(--gh-status-success-text)',
          dot: 'var(--gh-status-success-strong)'
        };
      case 'APROBADO':
        return {
          bg: 'var(--gh-status-info-bg)',
          color: 'var(--gh-status-info-text)',
          dot: 'var(--gh-status-info-strong)'
        };
      case 'PENDIENTE':
        return {
          bg: 'var(--gh-status-warn-bg)',
          color: 'var(--gh-status-warn-text)',
          dot: 'var(--gh-status-warn-strong)'
        };
      case 'RECHAZADO':
        return {
          bg: 'var(--gh-status-danger-bg)',
          color: 'var(--gh-status-danger-text)',
          dot: 'var(--gh-status-danger-strong)'
        };
      case 'ANULADO':
        return {
          bg: 'var(--gh-status-neutral-bg)',
          color: 'var(--gh-status-neutral-text)',
          dot: 'var(--gh-text-soft)'
        };
      default:
        return {
          bg: 'var(--gh-status-neutral-bg)',
          color: 'var(--gh-status-neutral-text)',
          dot: 'var(--gh-text-soft)'
        };
    }
  }

  getDateLabel(refund: PaymentRefundI): string {
    return this.formatDateTime(refund.refund_date || refund.created_at);
  }

  getAmountLabel(refund: PaymentRefundI): string {
    return this.formatCurrency(this.toNumber(refund.amount));
  }

  getRefundInitials(refund: PaymentRefundI): string {
    const source = this.getInvoiceLabel(refund).replace(/^FAC-?/i, '').trim() || `P${refund.payment}`;
    return source
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'RB';
  }

  trackByRefund(_: number, refund: PaymentRefundI): number {
    return refund.id;
  }

  private matchesDateFilter(refund: PaymentRefundI): boolean {
    if (this.dateFilter === 'ALL') return true;

    const refundDate = this.parseDate(refund.refund_date || refund.created_at);
    if (!refundDate) return false;

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const refundDay = new Date(refundDate.getFullYear(), refundDate.getMonth(), refundDate.getDate());

    if (this.dateFilter === 'TODAY') {
      return refundDay.getTime() === dayStart.getTime();
    }

    const last30Start = new Date(dayStart);
    last30Start.setDate(last30Start.getDate() - 29);
    return refundDay >= last30Start && refundDay <= dayStart;
  }

  private loadUserContext(): void {
    this.authService
      .getUserInfo()
      .pipe(catchError(() => of(null)))
      .subscribe((user) => {
        const roles = Array.isArray(user?.roles) ? user.roles : [];
        this.isAdmin = roles.some((role) => {
          const slug = String((role as { slug?: unknown })?.slug || '')
            .trim()
            .toLowerCase();
          return slug === 'admin';
        });
      });
  }

  private getStatusCode(refund: PaymentRefundI): string {
    return String(refund.status_code || '')
      .trim()
      .toUpperCase();
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = (payload as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
    }

    return fallback;
  }
}
