import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { BillingService } from '../../../services/billing';
import { AuthService } from '../../../services/auth/auth';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { InvoiceI, PaymentI, PaymentRefundI } from '../../billing/billing-model';

@Component({
  selector: 'app-detail-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './detail-payment.html',
  styleUrls: ['./detail-payment.css']
})
export class DetailPayment implements OnInit, OnChanges {
  @Input() payment: PaymentI | null = null;
  @Input() initialInvoice: InvoiceI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() paymentUpdated = new EventEmitter<PaymentI>();

  loading = false;
  updating = false;
  submittingRefund = false;
  errorMessage = '';
  infoMessage = '';
  isAdmin = false;

  activePayment: PaymentI | null = null;
  invoice: InvoiceI | null = null;
  invoicePayments: PaymentI[] = [];
  invoiceRefunds: PaymentRefundI[] = [];
  paymentRefunds: PaymentRefundI[] = [];
  readonly refundForm;

  constructor(
    private billingService: BillingService,
    private confirmationService: ConfirmationService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.refundForm = this.fb.nonNullable.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      reason: ['', [Validators.required, Validators.maxLength(500)]],
      reference: ['', [Validators.maxLength(100)]],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  ngOnInit(): void {
    this.loadUserContext();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['payment']) {
      this.loadDetail();
      return;
    }

    if (changes['initialInvoice'] && !this.invoice) {
      this.invoice = this.initialInvoice;
    }
  }

  get invoiceTotalAmount(): number {
    return this.toNumber(this.invoice?.total_amount);
  }

  get totalPaidAmount(): number {
    return this.invoicePayments
      .filter((payment) => !!payment.is_active)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
  }

  get totalProcessedRefundAmount(): number {
    return this.invoiceRefunds
      .filter((refund) => !!refund.is_active && this.isProcessedRefund(refund))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  get netPaidAmount(): number {
    const net = this.totalPaidAmount - this.totalProcessedRefundAmount;
    return net > 0 ? net : 0;
  }

  get pendingBalanceAmount(): number {
    const pending = this.invoiceTotalAmount - this.netPaidAmount;
    return pending > 0 ? pending : 0;
  }

  get paymentReservedRefundAmount(): number {
    return this.paymentRefunds
      .filter((refund) => !!refund.is_active && !this.isRejectedOrCanceledRefund(refund))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  get paymentProcessedRefundAmount(): number {
    return this.paymentRefunds
      .filter((refund) => !!refund.is_active && this.isProcessedRefund(refund))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  get paymentRefundableAmount(): number {
    const paymentAmount = this.toNumber(this.activePayment?.amount);
    const refundable = paymentAmount - this.paymentReservedRefundAmount;
    return refundable > 0 ? refundable : 0;
  }

  get canRegisterRefund(): boolean {
    if (!this.activePayment?.is_active || this.loading || this.submittingRefund || this.updating) return false;
    return this.paymentRefundableAmount > 0;
  }

  get paymentStatusLabel(): string {
    return this.activePayment?.is_active ? 'Activo' : 'Inactivo';
  }

  get paymentStatusTone(): { bg: string; color: string; dot: string } {
    if (this.activePayment?.is_active) {
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

  closeDrawer(): void {
    this.closed.emit();
  }

  refresh(): void {
    this.loadDetail();
  }

  deactivatePayment(): void {
    if (!this.isAdmin || !this.activePayment || !this.activePayment.is_active || this.updating) return;

    openActionConfirmation(this.confirmationService, {
      action: 'deactivate',
      target: 'pago',
      onAccept: () => {
        this.updating = true;
        this.errorMessage = '';
        this.infoMessage = '';

        this.billingService.updatePayment(this.activePayment!.id, { is_active: false }).subscribe({
          next: (updatedPayment) => {
            this.updating = false;
            this.activePayment = updatedPayment;
            this.paymentUpdated.emit(updatedPayment);
            this.infoMessage = successActionAlert('deactivate', 'pago');
            this.loadDetail();
          },
          error: (error) => {
            this.updating = false;
            this.errorMessage = this.extractErrorMessage(error, errorActionAlert('deactivate', 'pago'));
          }
        });
      }
    });
  }

  registerRefund(): void {
    if (!this.activePayment || !this.canRegisterRefund || this.submittingRefund) return;

    if (this.refundForm.invalid) {
      this.refundForm.markAllAsTouched();
      return;
    }

    const amount = this.toNumber(this.refundForm.value.amount);
    if (amount <= 0) {
      this.errorMessage = 'El monto del reembolso debe ser mayor a 0.';
      return;
    }

    if (amount > this.paymentRefundableAmount) {
      this.errorMessage = 'El monto supera el saldo reembolsable de este pago.';
      return;
    }

    const reason = String(this.refundForm.value.reason || '').trim();
    if (!reason) {
      this.errorMessage = 'Debes indicar el motivo del reembolso.';
      return;
    }

    this.submittingRefund = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.billingService
      .createPaymentRefund({
        payment: this.activePayment.id,
        amount: this.roundAmount(amount),
        reason,
        reference: this.normalizeOptionalText(this.refundForm.value.reference),
        notes: this.normalizeOptionalText(this.refundForm.value.notes)
      })
      .subscribe({
        next: () => {
          this.submittingRefund = false;
          this.infoMessage = 'Reembolso registrado en estado pendiente. Un administrador debe aprobarlo.';
          this.loadDetail();
        },
        error: (error) => {
          this.submittingRefund = false;
          this.errorMessage = this.extractErrorMessage(error, errorActionAlert('register', 'reembolso'));
        }
      });
  }

  resetRefundForm(): void {
    this.refundForm.reset({
      amount: this.roundAmount(this.getSuggestedRefundAmount()),
      reason: '',
      reference: '',
      notes: ''
    });
    this.refundForm.markAsPristine();
    this.refundForm.markAsUntouched();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  formatDateTime(value: string | null | undefined): string {
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

  getRefundStatusLabel(refund: PaymentRefundI): string {
    if (refund.status_name?.trim()) return refund.status_name.trim();
    const code = String(refund.status_code || '').trim().toUpperCase();
    if (!code) return 'Sin estado';

    switch (code) {
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
        return code;
    }
  }

  getRefundStatusTone(refund: PaymentRefundI): { bg: string; color: string; dot: string } {
    const code = String(refund.status_code || '').trim().toUpperCase();
    switch (code) {
      case 'PROCESADO':
        return {
          bg: 'var(--gh-status-success-bg)',
          color: 'var(--gh-status-success-text)',
          dot: 'var(--gh-status-success-strong-alt)'
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

  trackByRefund(_: number, refund: PaymentRefundI): number {
    return refund.id;
  }

  private loadDetail(): void {
    if (!this.payment) {
      this.activePayment = null;
      this.invoice = null;
      this.invoicePayments = [];
      this.invoiceRefunds = [];
      this.paymentRefunds = [];
      this.resetRefundForm();
      return;
    }

    const paymentSnapshot =
      this.activePayment?.id === this.payment.id ? this.activePayment : this.payment;

    this.activePayment = paymentSnapshot;
    this.invoice = this.initialInvoice;
    this.invoicePayments = [];
    this.invoiceRefunds = [];
    this.paymentRefunds = [];

    if (!this.submittingRefund) {
      this.resetRefundForm();
    }

    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    const paymentId = paymentSnapshot.id;
    const invoiceId = paymentSnapshot.invoice;

    forkJoin({
      payment: this.billingService.getPaymentById(paymentId).pipe(catchError(() => of(paymentSnapshot))),
      invoice: this.billingService.getInvoiceById(invoiceId).pipe(catchError(() => of(this.initialInvoice))),
      invoicePayments: this.billingService
        .listPayments({ invoice: invoiceId, ordering: '-payment_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as PaymentI[]))),
      invoiceRefunds: this.billingService
        .listPaymentRefunds({ invoice: invoiceId, ordering: '-refund_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as PaymentRefundI[])))
    }).subscribe({
      next: ({ payment, invoice, invoicePayments, invoiceRefunds }) => {
        this.loading = false;
        this.activePayment = payment;
        this.invoice = invoice || this.initialInvoice;
        this.invoicePayments = invoicePayments
          .filter((row) => Number(row.invoice) === invoiceId)
          .sort((a, b) => b.id - a.id);

        this.invoiceRefunds = invoiceRefunds
          .filter((row) => Number(row.invoice) === invoiceId)
          .sort((a, b) => b.id - a.id);

        this.paymentRefunds = this.invoiceRefunds
          .filter((refund) => Number(refund.payment) === payment.id)
          .sort((a, b) => b.id - a.id);

        if (!this.submittingRefund) {
          this.resetRefundForm();
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el detalle del pago.';
      }
    });
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

  private isProcessedRefund(refund: PaymentRefundI): boolean {
    return String(refund.status_code || '').trim().toUpperCase() === 'PROCESADO';
  }

  private isRejectedOrCanceledRefund(refund: PaymentRefundI): boolean {
    const code = String(refund.status_code || '').trim().toUpperCase();
    return code === 'RECHAZADO' || code === 'ANULADO';
  }

  private getSuggestedRefundAmount(): number {
    const refundable = this.paymentRefundableAmount;
    if (refundable <= 0) return 0;

    const pending = this.pendingBalanceAmount;
    if (pending <= 0) return refundable;
    return refundable < pending ? refundable : pending;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value || '').trim();
    return normalized ? normalized : null;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
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
