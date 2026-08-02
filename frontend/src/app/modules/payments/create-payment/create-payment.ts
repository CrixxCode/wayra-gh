import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { PaymentCreatePayloadI, PaymentI } from '../../billing/billing-model';
import { BillingService } from '../../../services/billing';

@Component({
  selector: 'app-create-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-payment.html',
  styleUrls: ['./create-payment.css']
})
export class CreatePayment implements OnChanges {
  @Input() invoiceId: number | null = null;
  @Input() pendingAmount: number | null = null;
  @Input() paymentMethods: MasterDataI[] = [];

  @Output() created = new EventEmitter<PaymentI>();
  @Output() cancelled = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  paymentForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private billingService: BillingService
  ) {
    this.paymentForm = this.fb.group({
      payment_method: [null as number | null, [Validators.required]],
      amount: [0, [Validators.required, Validators.min(1)]],
      reference: [''],
      notes: ['']
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['paymentMethods']) {
      this.ensureDefaultPaymentMethod();
    }
    if (changes['pendingAmount']) {
      this.suggestPendingAmount();
    }
  }

  get payment_method() {
    return this.paymentForm.get('payment_method');
  }

  get amount() {
    return this.paymentForm.get('amount');
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.invoiceId) {
      this.errorMessage = 'No se encontro la factura para registrar el pago.';
      return;
    }

    const pending = this.normalizeAmount(this.pendingAmount);
    if (pending <= 0) {
      this.errorMessage = 'La factura no tiene saldo pendiente.';
      return;
    }

    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    const raw = this.paymentForm.getRawValue();
    const paymentMethod = Number(raw.payment_method || 0);
    if (!Number.isFinite(paymentMethod) || paymentMethod <= 0) {
      this.errorMessage = 'Debes seleccionar un metodo de pago.';
      return;
    }

    const amount = this.normalizeAmount(raw.amount);
    if (amount <= 0) {
      this.errorMessage = 'El monto del pago debe ser mayor a 0.';
      return;
    }

    if (amount > pending) {
      this.errorMessage = 'El monto no puede superar el saldo pendiente de la factura.';
      return;
    }

    const payload: PaymentCreatePayloadI = {
      invoice: Number(this.invoiceId),
      payment_method: paymentMethod,
      amount,
      reference: this.cleanOptionalText(raw.reference),
      notes: this.cleanOptionalText(raw.notes),
      is_active: true
    };

    this.saving = true;
    this.billingService.createPayment(payload).subscribe({
      next: (payment) => {
        this.saving = false;
        this.created.emit(payment);
        this.resetFormForNextEntry();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error);
      }
    });
  }

  close(): void {
    if (this.saving) return;
    this.cancelled.emit();
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(this.normalizeAmount(value));
  }

  private ensureDefaultPaymentMethod(): void {
    const selected = Number(this.paymentForm.getRawValue().payment_method || 0);
    if (selected > 0) return;
    if (!this.paymentMethods.length) return;

    this.paymentForm.patchValue({
      payment_method: this.paymentMethods[0].id
    });
  }

  private suggestPendingAmount(): void {
    const pending = this.normalizeAmount(this.pendingAmount);
    if (pending <= 0) return;

    const amount = this.normalizeAmount(this.paymentForm.getRawValue().amount);
    if (amount <= 0) {
      this.paymentForm.patchValue({ amount: pending });
    }
  }

  private resetFormForNextEntry(): void {
    this.paymentForm.patchValue({
      amount: 0,
      reference: '',
      notes: ''
    });
    this.paymentForm.markAsPristine();
    this.paymentForm.markAsUntouched();
    this.errorMessage = '';
  }

  private normalizeAmount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private cleanOptionalText(value: unknown): string | null {
    const text = String(value || '').trim();
    return text ? text : null;
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No fue posible registrar el pago.';

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
