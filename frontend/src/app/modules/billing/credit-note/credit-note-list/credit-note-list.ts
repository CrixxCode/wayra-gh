import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../../services/billing';
import { errorActionAlert, successActionAlert } from '../../../../services/action-alerts';
import { openActionConfirmation } from '../../../../services/action-confirmations';
import { CreditNoteI, InvoiceI } from '../../billing-model';
import { CreditNoteForm } from '../credit-note-form/credit-note-form';

@Component({
  selector: 'app-credit-note-list',
  standalone: true,
  imports: [CommonModule, CreditNoteForm],
  templateUrl: './credit-note-list.html',
  styleUrls: ['./credit-note-list.css']
})
export class CreditNoteList implements OnChanges {
  @Input() invoice: InvoiceI | null = null;
  @Input() statuses: MasterDataI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();

  loading = false;
  refreshing = false;
  errorMessage = '';
  infoMessage = '';
  togglingNoteId: number | null = null;

  showFormModal = false;
  editingNote: CreditNoteI | null = null;

  creditNotes: CreditNoteI[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoice']) {
      this.showFormModal = false;
      this.editingNote = null;
      this.loadCreditNotes();
    }
  }

  constructor(
    private billingService: BillingService,
    private confirmationService: ConfirmationService
  ) {}

  get activeCreditNotes(): CreditNoteI[] {
    return this.creditNotes.filter((note) => !!note.is_active);
  }

  get inactiveCreditNotes(): CreditNoteI[] {
    return this.creditNotes.filter((note) => !note.is_active);
  }

  get totalCreditAmount(): number {
    return this.activeCreditNotes.reduce((sum, note) => sum + this.toNumber(note.amount), 0);
  }

  get invoiceTotalAmount(): number {
    return this.toNumber(this.invoice?.total_amount);
  }

  get availableCreditAmount(): number {
    const available = this.invoiceTotalAmount - this.totalCreditAmount;
    return available > 0 ? available : 0;
  }

  get maxAmountForForm(): number {
    if (!this.editingNote) {
      return this.availableCreditAmount;
    }

    const current = this.toNumber(this.editingNote.amount);
    if (this.editingNote.is_active) {
      return this.availableCreditAmount + current;
    }

    return this.availableCreditAmount;
  }

  get modalTitle(): string {
    return `Notas de credito - ${this.invoice?.invoice_number || 'Factura'}`;
  }

  refresh(): void {
    this.loadCreditNotes(true);
  }

  openCreateForm(): void {
    if (!this.invoice) return;
    if (this.availableCreditAmount <= 0) {
      this.errorMessage = 'La factura no tiene saldo disponible para nuevas notas de credito.';
      return;
    }
    this.errorMessage = '';
    this.infoMessage = '';
    this.editingNote = null;
    this.showFormModal = true;
  }

  openEditForm(note: CreditNoteI): void {
    if (!note.is_active) return;
    this.errorMessage = '';
    this.infoMessage = '';
    this.editingNote = note;
    this.showFormModal = true;
  }

  closeFormModal(): void {
    this.showFormModal = false;
    this.editingNote = null;
  }

  onSaved(note: CreditNoteI): void {
    const isEditing = !!this.editingNote;
    this.infoMessage = isEditing
      ? successActionAlert('update', `nota de credito ${note.credit_note_number}`)
      : successActionAlert('register', `nota de credito ${note.credit_note_number}`);

    this.showFormModal = false;
    this.editingNote = null;
    this.changed.emit();
    this.loadCreditNotes(true);
  }

  deactivateNote(note: CreditNoteI): void {
    if (!note.is_active || this.togglingNoteId === note.id) return;

    openActionConfirmation(this.confirmationService, {
      action: 'deactivate',
      target: `nota de credito ${note.credit_note_number}`,
      onAccept: () => {
        this.togglingNoteId = note.id;
        this.errorMessage = '';
        this.infoMessage = '';

        this.billingService.updateCreditNote(note.id, { is_active: false }).subscribe({
          next: () => {
            this.togglingNoteId = null;
            this.infoMessage = successActionAlert('deactivate', `nota de credito ${note.credit_note_number}`);
            this.changed.emit();
            this.loadCreditNotes(true);
          },
          error: (error) => {
            this.togglingNoteId = null;
            this.errorMessage = this.extractErrorMessage(
              error,
              errorActionAlert('deactivate', `nota de credito ${note.credit_note_number}`)
            );
          }
        });
      }
    });
  }

  close(): void {
    if (this.loading || this.refreshing || this.togglingNoteId !== null) return;
    this.closed.emit();
  }

  getStatusLabel(note: CreditNoteI): string {
    if (note.status_name?.trim()) return note.status_name.trim();

    const byId = this.statuses.find((status) => status.id === note.status);
    if (byId?.name?.trim()) return byId.name.trim();

    const code = this.normalizeCode(note.status_code);
    if (!code) return 'Sin estado';

    const byCode = this.statuses.find((status) => this.normalizeCode(status.code) === code);
    if (byCode?.name?.trim()) return byCode.name.trim();

    return code;
  }

  getStatusTone(note: CreditNoteI): { bg: string; color: string; dot: string } {
    const code = this.normalizeCode(note.status_code);

    if (code.includes('BORRADOR')) {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        dot: 'var(--gh-text-muted)'
      };
    }
    if (code.includes('EMITIDA') || code.includes('APLICADA')) {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-text)',
        dot: 'var(--gh-status-info-strong)'
      };
    }
    if (code.includes('ANULADA') || !note.is_active) {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        dot: 'var(--gh-status-danger-strong)'
      };
    }

    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';

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

  formatCurrency(value: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(this.toNumber(value));
  }

  trackByNote(_: number, note: CreditNoteI): number {
    return note.id;
  }

  private loadCreditNotes(forceRefresh = false): void {
    if (!this.invoice?.id) {
      this.creditNotes = [];
      this.errorMessage = '';
      this.infoMessage = '';
      return;
    }

    this.errorMessage = '';
    if (!forceRefresh) {
      this.infoMessage = '';
    }

    this.loading = !forceRefresh;
    this.refreshing = forceRefresh;

    this.billingService
      .listCreditNotes({ invoice: this.invoice.id, ordering: '-issue_date,-id', include_inactive: true })
      .subscribe({
        next: (rows) => {
          this.loading = false;
          this.refreshing = false;
          this.creditNotes = [...rows].sort((a, b) => b.id - a.id);

          if (!this.creditNotes.length) {
            this.infoMessage = 'Esta factura aun no tiene notas de credito registradas.';
          }
        },
        error: () => {
          this.loading = false;
          this.refreshing = false;
          this.errorMessage = 'No fue posible cargar las notas de credito de la factura.';
        }
      });
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
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
