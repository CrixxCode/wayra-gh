import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../services/billing';
import { MasterDataService } from '../../../services/master-data.service';
import { ReservationService } from '../../../services/reservation';
import { InvoiceI, PaymentI } from '../../billing/billing-model';
import { ReservationI } from '../../reservations/reservation-model';
import { DetailPayment } from '../detail-payment/detail-payment';

type PaymentActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type PaymentDateFilter = 'ALL' | 'TODAY' | 'LAST_30';
type PaymentViewMode = 'cards' | 'table';

@Component({
  selector: 'app-list-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DetailPayment],
  templateUrl: './list-payments.html',
  styleUrls: ['./list-payments.css']
})
export class ListPayments implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';

  payments: PaymentI[] = [];
  filteredPayments: PaymentI[] = [];
  invoicesMap = new Map<number, InvoiceI>();
  reservationsMap = new Map<number, ReservationI>();
  paymentMethods: MasterDataI[] = [];

  search = '';
  methodFilter = 'ALL';
  activityFilter: PaymentActivityFilter = 'ACTIVE';
  dateFilter: PaymentDateFilter = 'ALL';
  viewMode: PaymentViewMode = 'cards';

  selectedPayment: PaymentI | null = null;

  readonly activityOptions: Array<{ value: PaymentActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' }
  ];

  readonly dateOptions: Array<{ value: PaymentDateFilter; label: string }> = [
    { value: 'LAST_30', label: 'Ultimos 30 dias' },
    { value: 'TODAY', label: 'Hoy' },
    { value: 'ALL', label: 'Todas las fechas' }
  ];

  constructor(
    private billingService: BillingService,
    private reservationService: ReservationService,
    private masterDataService: MasterDataService
  ) {}

  ngOnInit(): void {
    this.loadPaymentsData();
  }

  get totalPayments(): number {
    return this.payments.length;
  }

  get activePaymentsCount(): number {
    return this.payments.filter((payment) => !!payment.is_active).length;
  }

  get inactivePaymentsCount(): number {
    return this.payments.filter((payment) => !payment.is_active).length;
  }

  get collectedAmountLabel(): string {
    const total = this.payments
      .filter((payment) => !!payment.is_active)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
    return this.formatCurrency(total);
  }

  get averageTicketLabel(): string {
    if (!this.activePaymentsCount) return this.formatCurrency(0);
    const total = this.payments
      .filter((payment) => !!payment.is_active)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
    return this.formatCurrency(total / this.activePaymentsCount);
  }

  get methodCount(): number {
    return new Set(
      this.payments
        .filter((payment) => !!payment.is_active)
        .map((payment) => this.resolvePaymentMethodCode(payment))
        .filter((code) => code && code !== 'SINMETODO')
    ).size;
  }

  get methodOptions(): Array<{ value: string; label: string }> {
    const base = [{ value: 'ALL', label: 'Todos los metodos' }];
    const options = this.paymentMethods
      .map((method) => ({
        value: this.normalizeCode(method.code || method.name || String(method.id)),
        label: method.name || method.code || `Metodo #${method.id}`
      }))
      .filter((option) => !!option.value);

    const unique = new Map<string, string>();
    for (const option of options) {
      if (!unique.has(option.value)) {
        unique.set(option.value, option.label);
      }
    }

    return [
      ...base,
      ...Array.from(unique.entries()).map(([value, label]) => ({
        value,
        label
      }))
    ];
  }

  loadPaymentsData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    forkJoin({
      payments: this.billingService
        .listPayments({ ordering: '-payment_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as PaymentI[]))),
      invoices: this.billingService
        .listInvoices({ ordering: '-id', include_inactive: true })
        .pipe(catchError(() => of([] as InvoiceI[]))),
      reservationsPage: this.reservationService
        .listReservationsPage({ include_finished: true, ordering: '-id', page: 1, page_size: 200 })
        .pipe(
          catchError(() =>
            of({
              count: 0,
              next: null,
              previous: null,
              results: [] as ReservationI[]
            })
          )
        ),
      paymentMethods: this.masterDataService
        .listMasterData({ group: 'PAYMENT_METHOD', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ payments, invoices, reservationsPage, paymentMethods }) => {
        this.loading = false;
        this.payments = [...payments].sort((a, b) => b.id - a.id);
        this.invoicesMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
        this.reservationsMap = new Map((reservationsPage.results || []).map((reservation) => [reservation.id, reservation]));
        this.paymentMethods = paymentMethods;

        this.applyFilters();

        if (!this.payments.length) {
          this.infoMessage = 'No hay pagos registrados todavia.';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar los pagos.';
      }
    });
  }

  refreshPaymentsData(): void {
    this.loadPaymentsData();
  }

  exportCsv(): void {
    if (!this.filteredPayments.length) return;

    const headers = [
      'factura',
      'reserva',
      'huesped',
      'documento',
      'metodo',
      'referencia',
      'fecha_pago',
      'monto',
      'estado'
    ];

    const rows = this.filteredPayments.map((payment) => {
      const row = [
        this.getInvoiceNumber(payment),
        this.getReservationCode(payment),
        this.getGuestLabel(payment),
        this.getGuestDocument(payment),
        this.getMethodLabel(payment),
        payment.reference || '',
        this.getPaymentDateLabel(payment),
        this.toNumber(payment.amount),
        payment.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pagos-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const query = String(this.search || '').trim().toLowerCase();

    this.filteredPayments = this.payments.filter((payment) => {
      const activityMatch =
        this.activityFilter === 'ALL' ||
        (this.activityFilter === 'ACTIVE' && payment.is_active) ||
        (this.activityFilter === 'INACTIVE' && !payment.is_active);

      const methodCode = this.resolvePaymentMethodCode(payment);
      const methodMatch = this.methodFilter === 'ALL' || methodCode === this.methodFilter;
      const dateMatch = this.matchesDateFilter(payment);

      const invoice = this.invoicesMap.get(payment.invoice) || null;
      const reservation = invoice ? this.reservationsMap.get(invoice.reservation) || null : null;
      const searchPool = [
        payment.invoice_number || invoice?.invoice_number || '',
        payment.payment_method_name || '',
        payment.payment_method_code || '',
        payment.reference || '',
        payment.notes || '',
        reservation?.client_full_name || '',
        reservation?.client_document_number || '',
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !query || searchPool.includes(query);
      return activityMatch && methodMatch && dateMatch && searchMatch;
    });
  }

  openDetail(payment: PaymentI): void {
    this.selectedPayment = payment;
  }

  setViewMode(mode: PaymentViewMode): void {
    this.viewMode = mode;
  }

  closeDetail(): void {
    this.selectedPayment = null;
  }

  onPaymentUpdated(updatedPayment: PaymentI): void {
    const index = this.payments.findIndex((payment) => payment.id === updatedPayment.id);
    if (index >= 0) {
      this.payments[index] = updatedPayment;
    } else {
      this.payments.unshift(updatedPayment);
    }

    this.payments = [...this.payments].sort((a, b) => b.id - a.id);
    this.applyFilters();

    this.selectedPayment = this.payments.find((payment) => payment.id === updatedPayment.id) || null;
  }

  getInvoiceNumber(payment: PaymentI): string {
    if (payment.invoice_number?.trim()) return payment.invoice_number.trim();

    const invoice = this.invoicesMap.get(payment.invoice) || null;
    if (invoice?.invoice_number?.trim()) return invoice.invoice_number.trim();

    return `FAC-${payment.invoice}`;
  }

  getReservationCode(payment: PaymentI): string {
    const invoice = this.invoicesMap.get(payment.invoice) || null;
    const reservation = invoice ? this.reservationsMap.get(invoice.reservation) || null : null;
    if (reservation?.id) {
      const createdDate = reservation.created_at ? new Date(reservation.created_at) : null;
      const year =
        createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.getFullYear() : new Date().getFullYear();
      return `RES-${year}-${String(reservation.id).padStart(4, '0')}`;
    }

    if (invoice?.reservation) {
      return `RES-${String(invoice.reservation).padStart(4, '0')}`;
    }

    return 'Reserva sin identificar';
  }

  getGuestLabel(payment: PaymentI): string {
    const invoice = this.invoicesMap.get(payment.invoice) || null;
    const reservation = invoice ? this.reservationsMap.get(invoice.reservation) || null : null;
    if (reservation?.client_full_name?.trim()) return reservation.client_full_name.trim();

    if (invoice?.reservation) return `Reserva #${invoice.reservation}`;
    return 'Huesped sin nombre';
  }

  getGuestDocument(payment: PaymentI): string {
    const invoice = this.invoicesMap.get(payment.invoice) || null;
    const reservation = invoice ? this.reservationsMap.get(invoice.reservation) || null : null;
    return reservation?.client_document_number || 'Sin documento';
  }

  getMethodLabel(payment: PaymentI): string {
    if (payment.payment_method_name?.trim()) return payment.payment_method_name.trim();

    const methodCode = this.resolvePaymentMethodCode(payment);
    if (methodCode && methodCode !== 'SINMETODO') {
      const method = this.paymentMethods.find((item) => this.normalizeCode(item.code) === methodCode);
      if (method?.name?.trim()) return method.name.trim();
    }

    if (payment.payment_method_code?.trim()) return payment.payment_method_code.trim();
    return 'Sin metodo';
  }

  getStatusTone(payment: PaymentI): { bg: string; color: string; dot: string } {
    if (payment.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong-alt)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  getAmountLabel(payment: PaymentI): string {
    return this.formatCurrency(this.toNumber(payment.amount));
  }

  getPaymentDateLabel(payment: PaymentI): string {
    return this.formatDateTime(payment.payment_date || payment.created_at);
  }

  getPaymentInitials(payment: PaymentI): string {
    const label = this.getGuestLabel(payment).trim();
    if (!label) return 'PG';

    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  trackByPayment(_: number, payment: PaymentI): number {
    return payment.id;
  }

  private matchesDateFilter(payment: PaymentI): boolean {
    if (this.dateFilter === 'ALL') return true;

    const paymentDate = this.parseDate(payment.payment_date || payment.created_at);
    if (!paymentDate) return false;

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const paymentDay = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), paymentDate.getDate());

    if (this.dateFilter === 'TODAY') {
      return paymentDay.getTime() === dayStart.getTime();
    }

    const last30Start = new Date(dayStart);
    last30Start.setDate(last30Start.getDate() - 29);
    return paymentDay >= last30Start && paymentDay <= dayStart;
  }

  private resolvePaymentMethodCode(payment: PaymentI): string {
    const methodCode = this.normalizeCode(payment.payment_method_code);
    if (methodCode) return methodCode;

    const methodName = this.normalizeCode(payment.payment_method_name);
    if (methodName) return methodName;

    return 'SINMETODO';
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

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
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
}
