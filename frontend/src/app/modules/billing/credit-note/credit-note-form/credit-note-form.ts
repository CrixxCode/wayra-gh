import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterDataI } from '../../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../../services/billing';
import { CreditNoteCreatePayloadI, CreditNoteI } from '../../billing-model';

@Component({
  selector: 'app-credit-note-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './credit-note-form.html',
  styleUrls: ['./credit-note-form.css']
})
export class CreditNoteForm implements OnChanges {
  @Input() invoiceId: number | null = null;
  @Input() invoiceNumber: string | null = null;
  @Input() statuses: MasterDataI[] = [];
  @Input() maxAvailableAmount: number | null = null;
  @Input() mode: 'create' | 'update' = 'create';
  @Input() note: CreditNoteI | null = null;

  @Output() saved = new EventEmitter<CreditNoteI>();
  @Output() cancelled = new EventEmitter<void>();

  saving = false;
  errorMessage = '';

  creditNoteForm: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private billingService: BillingService
  ) {
    this.creditNoteForm = this.fb.group({
      status: [null as number | null, [Validators.required]],
      credit_note_number: ['', [Validators.required, Validators.maxLength(50)]],
      amount: [0, [Validators.required, Validators.min(1)]],
      reason: ['', [Validators.required]],
      notes: ['']
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['note'] || changes['mode']) {
      this.patchFormFromInputs();
    }

    if (changes['statuses']) {
      this.ensureDefaultStatus();
    }

    if (changes['maxAvailableAmount']) {
      this.suggestAvailableAmount();
    }
  }

  get title(): string {
    return this.mode === 'update' ? 'Editar nota de credito' : 'Nueva nota de credito';
  }

  get actionLabel(): string {
    if (this.saving) return this.mode === 'update' ? 'Guardando...' : 'Registrando...';
    return this.mode === 'update' ? 'Guardar cambios' : 'Registrar nota';
  }

  get maxAmountLabel(): string {
    return this.formatCurrency(this.normalizeAmount(this.maxAvailableAmount));
  }

  submit(): void {
    this.errorMessage = '';

    if (!this.invoiceId) {
      this.errorMessage = 'No se encontro la factura para registrar la nota de credito.';
      return;
    }

    if (this.mode === 'update' && !this.note?.id) {
      this.errorMessage = 'No se encontro la nota de credito a editar.';
      return;
    }

    if (this.creditNoteForm.invalid) {
      this.creditNoteForm.markAllAsTouched();
      return;
    }

    const raw = this.creditNoteForm.getRawValue();
    const status = Number(raw.status || 0);
    if (!Number.isFinite(status) || status <= 0) {
      this.errorMessage = 'Debes seleccionar un estado para la nota de credito.';
      return;
    }

    const amount = this.normalizeAmount(raw.amount);
    if (amount <= 0) {
      this.errorMessage = 'El monto debe ser mayor a 0.';
      return;
    }

    const maxAmount = this.normalizeAmount(this.maxAvailableAmount);
    if (maxAmount > 0 && amount > maxAmount) {
      this.errorMessage = 'El monto supera el saldo disponible de la factura para notas de credito.';
      return;
    }

    const creditNoteNumber = String(raw.credit_note_number || '').trim();
    if (!creditNoteNumber) {
      this.errorMessage = 'Debes indicar el numero de nota de credito.';
      return;
    }

    const reason = String(raw.reason || '').trim();
    if (!reason) {
      this.errorMessage = 'Debes indicar la razon de la nota de credito.';
      return;
    }

    const payloadBase: Partial<CreditNoteCreatePayloadI> = {
      status,
      credit_note_number: creditNoteNumber,
      amount,
      reason,
      notes: this.cleanOptionalText(raw.notes)
    };

    this.saving = true;

    if (this.mode === 'update' && this.note?.id) {
      this.billingService.updateCreditNote(this.note.id, payloadBase).subscribe({
        next: (savedNote) => {
          this.saving = false;
          this.saved.emit(savedNote);
        },
        error: (error) => {
          this.saving = false;
          this.errorMessage = this.extractErrorMessage(error, 'No fue posible actualizar la nota de credito.');
        }
      });
      return;
    }

    const payload: CreditNoteCreatePayloadI = {
      invoice: Number(this.invoiceId),
      status,
      credit_note_number: creditNoteNumber,
      amount,
      reason,
      notes: this.cleanOptionalText(raw.notes),
      is_active: true
    };

    this.billingService.createCreditNote(payload).subscribe({
      next: (savedNote) => {
        this.saving = false;
        this.saved.emit(savedNote);
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = this.extractErrorMessage(error, 'No fue posible registrar la nota de credito.');
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

  private patchFormFromInputs(): void {
    if (this.mode === 'update' && this.note) {
      this.creditNoteForm.patchValue({
        status: this.note.status || null,
        credit_note_number: this.note.credit_note_number || '',
        amount: this.normalizeAmount(this.note.amount),
        reason: this.note.reason || '',
        notes: this.note.notes || ''
      });
      this.creditNoteForm.markAsPristine();
      this.creditNoteForm.markAsUntouched();
      return;
    }

    this.creditNoteForm.patchValue({
      credit_note_number: '',
      amount: 0,
      reason: '',
      notes: ''
    });
    this.creditNoteForm.markAsPristine();
    this.creditNoteForm.markAsUntouched();
  }

  private ensureDefaultStatus(): void {
    const current = Number(this.creditNoteForm.getRawValue().status || 0);
    if (current > 0) return;
    if (!this.statuses.length) return;

    const emittedStatus = this.statuses.find(
      (status) => this.normalizeCode(status.code) === 'EMITIDA'
    );

    this.creditNoteForm.patchValue({
      status: emittedStatus?.id || this.statuses[0].id
    });
  }

  private suggestAvailableAmount(): void {
    if (this.mode !== 'create') return;

    const available = this.normalizeAmount(this.maxAvailableAmount);
    if (available <= 0) return;

    const currentAmount = this.normalizeAmount(this.creditNoteForm.getRawValue().amount);
    if (currentAmount <= 0) {
      this.creditNoteForm.patchValue({
        amount: available
      });
    }
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

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
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
