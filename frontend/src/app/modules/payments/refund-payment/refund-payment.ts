import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

import { errorActionAlert } from '../../../services/action-alerts';
import { BillingService } from '../../../services/billing';
import { InvoiceI, PaymentI, PaymentRefundI } from '../../billing/billing-model';

/**
 * Registrar un reembolso de un pago.
 *
 * Antes esto era una tercera columna del detalle del pago, mezclada con datos de solo
 * lectura. Consultar y devolver dinero son dos intenciones distintas: la primera se
 * repasa, la segunda se decide. Separarlas deja el formulario con espacio para lo que
 * de verdad hace falta al decidir —cuánto queda reembolsable y cómo queda el pago
 * después— en vez de tres cifras apretadas en un recuadro.
 *
 * El tope reembolsable se recalcula aquí y no se hereda del listado: entre que se abrió
 * la pantalla y se pulsa el botón, otro usuario pudo registrar un reembolso.
 */
@Component({
  selector: 'app-refund-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './refund-payment.html',
  styleUrls: ['./refund-payment.css']
})
export class RefundPayment implements OnChanges {
  @Input() payment: PaymentI | null = null;
  @Input() initialInvoice: InvoiceI | null = null;

  @Output() closed = new EventEmitter<void>();

  /** Se registró el reembolso: quien abrió el modal debe recargar. */
  @Output() registered = new EventEmitter<PaymentRefundI>();

  loading = false;
  submitting = false;
  errorMessage = '';

  activePayment: PaymentI | null = null;
  invoice: InvoiceI | null = null;
  paymentRefunds: PaymentRefundI[] = [];

  readonly form;

  constructor(
    private billingService: BillingService,
    private fb: FormBuilder,
    private hostRef: ElementRef<HTMLElement>
  ) {
    this.form = this.fb.nonNullable.group({
      amount: [0, [Validators.required, Validators.min(1)]],
      reason: ['', [Validators.required, Validators.maxLength(500)]],
      reference: ['', [Validators.maxLength(100)]],
      notes: ['', [Validators.maxLength(1000)]]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['payment']) this.load();
  }

  // ------------------------------------------------------------------ cifras

  get paymentAmount(): number {
    return this.toNumber(this.activePayment?.amount);
  }

  /** Comprometido: lo procesado y también lo que espera aprobación. */
  get reservedAmount(): number {
    return this.paymentRefunds
      .filter((refund) => !!refund.is_active && !this.isRejectedOrCanceled(refund))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  get processedAmount(): number {
    return this.paymentRefunds
      .filter((refund) => !!refund.is_active && this.isProcessed(refund))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  get pendingRequests(): number {
    return this.paymentRefunds.filter(
      (refund) => !!refund.is_active && !this.isProcessed(refund) && !this.isRejectedOrCanceled(refund)
    ).length;
  }

  get refundableAmount(): number {
    const refundable = this.paymentAmount - this.reservedAmount;
    return refundable > 0 ? refundable : 0;
  }

  /** Cuánto se está pidiendo devolver ahora mismo, según el formulario. */
  get requestedAmount(): number {
    return this.toNumber(this.form.value.amount);
  }

  /** Cómo queda el pago si se registra este reembolso. */
  get remainingAfterRefund(): number {
    const remaining = this.refundableAmount - this.requestedAmount;
    return remaining > 0 ? remaining : 0;
  }

  get isFullRefund(): boolean {
    return this.requestedAmount > 0 && this.requestedAmount >= this.refundableAmount;
  }

  get exceedsRefundable(): boolean {
    return this.requestedAmount > this.refundableAmount;
  }

  get reasonLength(): number {
    return String(this.form.value.reason || '').length;
  }

  // ------------------------------------------------------------------ estado

  get blockedReason(): string {
    if (this.loading) return '';
    if (!this.activePayment) return 'No se encontro el pago.';
    if (!this.activePayment.is_active) {
      return 'El pago esta anulado, asi que no admite reembolsos.';
    }
    if (this.refundableAmount <= 0) {
      return 'Este pago ya esta reembolsado por completo o tiene solicitudes que cubren su total.';
    }
    return '';
  }

  get canSubmit(): boolean {
    if (this.loading || this.submitting || this.blockedReason) return false;
    if (this.form.invalid || this.exceedsRefundable) return false;
    return this.requestedAmount > 0;
  }

  // ----------------------------------------------------------------- acciones

  close(): void {
    this.closed.emit();
  }

  /** Atajo del caso más común: devolver todo lo que queda. */
  fillFullAmount(): void {
    this.form.patchValue({ amount: this.roundAmount(this.refundableAmount) });
  }

  submit(): void {
    if (!this.activePayment || this.submitting) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.requestedAmount <= 0) {
      this.errorMessage = 'El monto del reembolso debe ser mayor a 0.';
      return;
    }

    if (this.exceedsRefundable) {
      this.errorMessage = 'El monto supera el saldo reembolsable de este pago.';
      return;
    }

    const reason = String(this.form.value.reason || '').trim();
    if (!reason) {
      this.errorMessage = 'Debes indicar el motivo del reembolso.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.billingService
      .createPaymentRefund({
        payment: this.activePayment.id,
        amount: this.roundAmount(this.requestedAmount),
        reason,
        reference: this.normalizeOptionalText(this.form.value.reference),
        notes: this.normalizeOptionalText(this.form.value.notes)
      })
      .subscribe({
        next: (refund) => {
          this.submitting = false;
          // El modal se cierra al registrar: la confirmación es que el reembolso
          // aparece ya en el listado, no un cartel dentro de un formulario vacío.
          this.registered.emit(refund);
        },
        error: (error) => {
          this.submitting = false;
          this.errorMessage = this.extractErrorMessage(error, errorActionAlert('register', 'reembolso'));
        }
      });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  // ------------------------------------------------------------------ interno

  private load(): void {
    this.errorMessage = '';
    this.form.reset({ amount: 0, reason: '', reference: '', notes: '' });

    if (!this.payment) {
      this.activePayment = null;
      this.invoice = null;
      this.paymentRefunds = [];
      return;
    }

    this.activePayment = this.payment;
    this.invoice = this.initialInvoice;
    this.paymentRefunds = [];
    this.loading = true;

    const paymentId = this.payment.id;

    forkJoin({
      payment: this.billingService.getPaymentById(paymentId).pipe(catchError(() => of(this.payment!))),
      refunds: this.billingService
        .listPaymentRefunds({ payment: paymentId, include_inactive: true })
        .pipe(catchError(() => of([] as PaymentRefundI[])))
    }).subscribe({
      next: ({ payment, refunds }) => {
        this.loading = false;
        this.activePayment = payment;
        this.paymentRefunds = refunds.filter((refund) => Number(refund.payment) === paymentId);

        // Se propone devolver todo lo que queda, que es el caso corriente, pero el
        // usuario puede bajarlo.
        this.form.patchValue({ amount: this.roundAmount(this.refundableAmount) });
        this.focusFirstField();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible calcular el saldo reembolsable de este pago.';
      }
    });
  }

  private focusFirstField(): void {
    requestAnimationFrame(() => {
      const field = this.hostRef.nativeElement.querySelector<HTMLElement>('textarea, input');
      field?.focus();
    });
  }

  private isProcessed(refund: PaymentRefundI): boolean {
    return this.statusCode(refund) === 'PROCESADO';
  }

  private isRejectedOrCanceled(refund: PaymentRefundI): boolean {
    const code = this.statusCode(refund);
    return code === 'RECHAZADO' || code === 'ANULADO';
  }

  private statusCode(refund: PaymentRefundI): string {
    return String(refund.status_code || '')
      .trim()
      .toUpperCase();
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private roundAmount(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    const text = String(value || '').trim();
    return text ? text : null;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();

    const body = (error as { error?: Record<string, unknown> })?.error;
    if (body && typeof body === 'object') {
      for (const value of Object.values(body)) {
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }

    return fallback;
  }
}
