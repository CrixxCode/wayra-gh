import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../enviorements/environment';
import { AuthService } from './auth/auth';
import {
  ChargeCreatePayloadI,
  ChargeI,
  CreditNoteCreatePayloadI,
  CreditNoteI,
  InvoiceChargeI,
  InvoiceCreatePayloadI,
  InvoiceI,
  PaymentCreatePayloadI,
  PaymentI,
  PosChargeBatchPayloadI,
  PosChargeBatchResponseI,
  PaymentRefundCreatePayloadI,
  PaymentRefundI
} from '../modules/billing/billing-model';

type DRFPaginated<T> = {
  results?: T[];
};

@Injectable({
  providedIn: 'root'
})
export class BillingService {
  private readonly apiBase = environment.API_URI.replace(/\/$/, '');
  private readonly chargesUrl = `${this.apiBase}/api/charges/`;
  private readonly invoicesUrl = `${this.apiBase}/api/invoices/`;
  private readonly invoiceChargesUrl = `${this.apiBase}/api/invoice-charges/`;
  private readonly paymentsUrl = `${this.apiBase}/api/payments/`;
  private readonly paymentRefundsUrl = `${this.apiBase}/api/payment-refunds/`;
  private readonly creditNotesUrl = `${this.apiBase}/api/credit-notes/`;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  listInvoices(filters?: {
    search?: string;
    ordering?: string;
    reservation?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<InvoiceI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.reservation === 'number' && Number.isFinite(filters.reservation) && filters.reservation > 0) {
      params = params.set('reservation', String(filters.reservation));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<InvoiceI[] | DRFPaginated<InvoiceI>>(this.invoicesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<InvoiceI>(res)));
  }

  getInvoiceById(id: number): Observable<InvoiceI> {
    return this.http.get<InvoiceI>(`${this.invoicesUrl}${id}/`, { withCredentials: true });
  }

  downloadInvoicePdf(id: number): Observable<Blob> {
    return this.http.get(`${this.invoicesUrl}${id}/pdf/`, {
      withCredentials: true,
      responseType: 'blob'
    });
  }

  createInvoice(payload: InvoiceCreatePayloadI): Observable<InvoiceI> {
    return this.http.post<InvoiceI>(
      this.invoicesUrl,
      this.normalizeInvoicePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateInvoice(id: number, payload: Partial<InvoiceCreatePayloadI>): Observable<InvoiceI> {
    return this.http.patch<InvoiceI>(
      `${this.invoicesUrl}${id}/`,
      this.normalizeInvoicePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteInvoice(id: number): Observable<void> {
    return this.http.delete<void>(`${this.invoicesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreInvoice(id: number): Observable<InvoiceI> {
    return this.http.post<InvoiceI>(`${this.invoicesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  listCharges(filters?: {
    search?: string;
    ordering?: string;
    reservation?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<ChargeI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.reservation === 'number' && Number.isFinite(filters.reservation) && filters.reservation > 0) {
      params = params.set('reservation', String(filters.reservation));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<ChargeI[] | DRFPaginated<ChargeI>>(this.chargesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<ChargeI>(res)));
  }

  getChargeById(id: number): Observable<ChargeI> {
    return this.http.get<ChargeI>(`${this.chargesUrl}${id}/`, { withCredentials: true });
  }

  createCharge(payload: ChargeCreatePayloadI): Observable<ChargeI> {
    return this.http.post<ChargeI>(
      this.chargesUrl,
      this.normalizeChargePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateCharge(id: number, payload: Partial<ChargeCreatePayloadI>): Observable<ChargeI> {
    return this.http.patch<ChargeI>(
      `${this.chargesUrl}${id}/`,
      this.normalizeChargePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteCharge(id: number): Observable<void> {
    return this.http.delete<void>(`${this.chargesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreCharge(id: number): Observable<ChargeI> {
    return this.http.post<ChargeI>(`${this.chargesUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  createPosChargeBatch(payload: PosChargeBatchPayloadI): Observable<PosChargeBatchResponseI> {
    return this.http.post<PosChargeBatchResponseI>(
      `${this.chargesUrl}pos-batch/`,
      this.normalizePosChargeBatchPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  listInvoiceCharges(filters?: {
    search?: string;
    ordering?: string;
    invoice?: number;
    include_deleted?: boolean;
  }): Observable<InvoiceChargeI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.invoice === 'number' && Number.isFinite(filters.invoice) && filters.invoice > 0) {
      params = params.set('invoice', String(filters.invoice));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<InvoiceChargeI[] | DRFPaginated<InvoiceChargeI>>(this.invoiceChargesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<InvoiceChargeI>(res)));
  }

  createInvoiceCharge(payload: { invoice: number; charge: number }): Observable<InvoiceChargeI> {
    return this.http.post<InvoiceChargeI>(this.invoiceChargesUrl, payload, this.auth.buildCsrfRequestOptions());
  }

  deleteInvoiceCharge(id: number): Observable<void> {
    return this.http.delete<void>(`${this.invoiceChargesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreInvoiceCharge(id: number): Observable<InvoiceChargeI> {
    return this.http.post<InvoiceChargeI>(
      `${this.invoiceChargesUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  listPayments(filters?: {
    search?: string;
    ordering?: string;
    invoice?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<PaymentI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.invoice === 'number' && Number.isFinite(filters.invoice) && filters.invoice > 0) {
      params = params.set('invoice', String(filters.invoice));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<PaymentI[] | DRFPaginated<PaymentI>>(this.paymentsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<PaymentI>(res)));
  }

  getPaymentById(id: number): Observable<PaymentI> {
    return this.http.get<PaymentI>(`${this.paymentsUrl}${id}/`, { withCredentials: true });
  }

  createPayment(payload: PaymentCreatePayloadI): Observable<PaymentI> {
    return this.http.post<PaymentI>(
      this.paymentsUrl,
      this.normalizePaymentPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updatePayment(id: number, payload: Partial<PaymentCreatePayloadI>): Observable<PaymentI> {
    return this.http.patch<PaymentI>(
      `${this.paymentsUrl}${id}/`,
      this.normalizePaymentPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deletePayment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.paymentsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restorePayment(id: number): Observable<PaymentI> {
    return this.http.post<PaymentI>(`${this.paymentsUrl}${id}/restore/`, {}, this.auth.buildCsrfRequestOptions());
  }

  listPaymentRefunds(filters?: {
    search?: string;
    ordering?: string;
    payment?: number;
    invoice?: number;
    status?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<PaymentRefundI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.payment === 'number' && Number.isFinite(filters.payment) && filters.payment > 0) {
      params = params.set('payment', String(filters.payment));
    }

    if (typeof filters?.invoice === 'number' && Number.isFinite(filters.invoice) && filters.invoice > 0) {
      params = params.set('invoice', String(filters.invoice));
    }

    if (typeof filters?.status === 'number' && Number.isFinite(filters.status) && filters.status > 0) {
      params = params.set('status', String(filters.status));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<PaymentRefundI[] | DRFPaginated<PaymentRefundI>>(this.paymentRefundsUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<PaymentRefundI>(res)));
  }

  getPaymentRefundById(id: number): Observable<PaymentRefundI> {
    return this.http.get<PaymentRefundI>(`${this.paymentRefundsUrl}${id}/`, { withCredentials: true });
  }

  createPaymentRefund(payload: PaymentRefundCreatePayloadI): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      this.paymentRefundsUrl,
      this.normalizePaymentRefundPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updatePaymentRefund(id: number, payload: Partial<PaymentRefundCreatePayloadI>): Observable<PaymentRefundI> {
    return this.http.patch<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/`,
      this.normalizePaymentRefundPayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  approvePaymentRefund(id: number): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/approve/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  processPaymentRefund(id: number): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/process/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  rejectPaymentRefund(id: number): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/reject/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  cancelPaymentRefund(id: number): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/cancel/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  deletePaymentRefund(id: number): Observable<void> {
    return this.http.delete<void>(`${this.paymentRefundsUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restorePaymentRefund(id: number): Observable<PaymentRefundI> {
    return this.http.post<PaymentRefundI>(
      `${this.paymentRefundsUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  listCreditNotes(filters?: {
    search?: string;
    ordering?: string;
    invoice?: number;
    is_active?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
  }): Observable<CreditNoteI[]> {
    let params = new HttpParams();

    if (filters?.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    if (filters?.ordering?.trim()) {
      params = params.set('ordering', filters.ordering.trim());
    }

    if (typeof filters?.invoice === 'number' && Number.isFinite(filters.invoice) && filters.invoice > 0) {
      params = params.set('invoice', String(filters.invoice));
    }

    if (typeof filters?.is_active === 'boolean') {
      params = params.set('is_active', String(filters.is_active));
    }

    if (typeof filters?.include_inactive === 'boolean') {
      params = params.set('include_inactive', String(filters.include_inactive));
    }

    if (typeof filters?.include_deleted === 'boolean') {
      params = params.set('include_deleted', String(filters.include_deleted));
    }

    return this.http
      .get<CreditNoteI[] | DRFPaginated<CreditNoteI>>(this.creditNotesUrl, {
        withCredentials: true,
        params
      })
      .pipe(map((res) => this.unwrapArray<CreditNoteI>(res)));
  }

  getCreditNoteById(id: number): Observable<CreditNoteI> {
    return this.http.get<CreditNoteI>(`${this.creditNotesUrl}${id}/`, { withCredentials: true });
  }

  createCreditNote(payload: CreditNoteCreatePayloadI): Observable<CreditNoteI> {
    return this.http.post<CreditNoteI>(
      this.creditNotesUrl,
      this.normalizeCreditNotePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  updateCreditNote(id: number, payload: Partial<CreditNoteCreatePayloadI>): Observable<CreditNoteI> {
    return this.http.patch<CreditNoteI>(
      `${this.creditNotesUrl}${id}/`,
      this.normalizeCreditNotePayload(payload),
      this.auth.buildCsrfRequestOptions()
    );
  }

  deleteCreditNote(id: number): Observable<void> {
    return this.http.delete<void>(`${this.creditNotesUrl}${id}/`, this.auth.buildCsrfRequestOptions());
  }

  restoreCreditNote(id: number): Observable<CreditNoteI> {
    return this.http.post<CreditNoteI>(
      `${this.creditNotesUrl}${id}/restore/`,
      {},
      this.auth.buildCsrfRequestOptions()
    );
  }

  private unwrapArray<T>(res: unknown): T[] {
    if (Array.isArray(res)) return res as T[];
    if (res && typeof res === 'object' && Array.isArray((res as DRFPaginated<T>).results)) {
      return (res as DRFPaginated<T>).results as T[];
    }
    return [];
  }

  private normalizeInvoicePayload(
    payload: Partial<InvoiceCreatePayloadI>
  ): Partial<InvoiceCreatePayloadI> {
    const normalized: Partial<InvoiceCreatePayloadI> = {};

    if (typeof payload.reservation === 'number') {
      normalized.reservation = Number(payload.reservation);
    }

    if (typeof payload.status === 'number') {
      normalized.status = Number(payload.status);
    }

    if (typeof payload.invoice_number === 'string') {
      normalized.invoice_number = payload.invoice_number.trim();
    }

    if (typeof payload.subtotal === 'number') {
      normalized.subtotal = Number(payload.subtotal) || 0;
    }

    if (typeof payload.tax_amount === 'number') {
      normalized.tax_amount = Number(payload.tax_amount) || 0;
    }

    if (payload.notes !== undefined) {
      normalized.notes = payload.notes ? String(payload.notes).trim() : null;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizeChargePayload(
    payload: Partial<ChargeCreatePayloadI>
  ): Partial<ChargeCreatePayloadI> {
    const normalized: Partial<ChargeCreatePayloadI> = {};

    if (typeof payload.reservation === 'number') {
      normalized.reservation = Number(payload.reservation);
    }

    if (payload.charge_type === null) {
      normalized.charge_type = null;
    } else if (typeof payload.charge_type === 'number') {
      normalized.charge_type = Number(payload.charge_type);
    }

    if (payload.service === null) {
      normalized.service = null;
    } else if (typeof payload.service === 'number') {
      normalized.service = Number(payload.service);
    }

    if (payload.package === null) {
      normalized.package = null;
    } else if (typeof payload.package === 'number') {
      normalized.package = Number(payload.package);
    }

    if (typeof payload.description === 'string') {
      normalized.description = payload.description.trim();
    }

    if (typeof payload.quantity === 'number') {
      const quantity = Number(payload.quantity);
      normalized.quantity = Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1;
    }

    if (typeof payload.unit_price === 'number') {
      const unitPrice = Number(payload.unit_price);
      normalized.unit_price = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizePosChargeBatchPayload(payload: PosChargeBatchPayloadI): PosChargeBatchPayloadI {
    const reservation = Number(payload?.reservation || 0);
    const reference = payload?.reference ? String(payload.reference).trim() : null;
    const chargeTypeCode = payload?.charge_type_code
      ? String(payload.charge_type_code).trim().toUpperCase()
      : null;
    const lines = Array.isArray(payload?.lines)
      ? payload.lines
          .map((line) => ({
            item: Number(line?.item || 0),
            quantity: Math.max(1, Math.round(Number(line?.quantity || 1))),
            unit_price:
              typeof line?.unit_price === 'number' && Number.isFinite(line.unit_price) && line.unit_price >= 0
                ? Number(line.unit_price)
                : undefined,
            description: line?.description ? String(line.description).trim() : undefined,
            notes: line?.notes ? String(line.notes).trim() : null
          }))
          .filter((line) => line.item > 0)
      : [];

    return {
      reservation,
      reference,
      charge_type_code: chargeTypeCode,
      lines
    };
  }

  private normalizePaymentPayload(
    payload: Partial<PaymentCreatePayloadI>
  ): Partial<PaymentCreatePayloadI> {
    const normalized: Partial<PaymentCreatePayloadI> = {};

    if (typeof payload.invoice === 'number') {
      normalized.invoice = Number(payload.invoice);
    }

    if (payload.payment_method === null) {
      normalized.payment_method = null;
    } else if (typeof payload.payment_method === 'number') {
      normalized.payment_method = Number(payload.payment_method);
    }

    if (typeof payload.amount === 'number') {
      const amount = Number(payload.amount);
      normalized.amount = Number.isFinite(amount) ? amount : 0;
    }

    if (payload.reference !== undefined) {
      normalized.reference = payload.reference ? String(payload.reference).trim() : null;
    }

    if (payload.notes !== undefined) {
      normalized.notes = payload.notes ? String(payload.notes).trim() : null;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizePaymentRefundPayload(
    payload: Partial<PaymentRefundCreatePayloadI>
  ): Partial<PaymentRefundCreatePayloadI> {
    const normalized: Partial<PaymentRefundCreatePayloadI> = {};

    if (typeof payload.payment === 'number') {
      normalized.payment = Number(payload.payment);
    }

    if (typeof payload.status === 'number') {
      normalized.status = Number(payload.status);
    }

    if (typeof payload.amount === 'number') {
      const amount = Number(payload.amount);
      normalized.amount = Number.isFinite(amount) ? amount : 0;
    }

    if (typeof payload.reason === 'string') {
      normalized.reason = payload.reason.trim();
    }

    if (payload.reference !== undefined) {
      normalized.reference = payload.reference ? String(payload.reference).trim() : null;
    }

    if (payload.notes !== undefined) {
      normalized.notes = payload.notes ? String(payload.notes).trim() : null;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }

  private normalizeCreditNotePayload(
    payload: Partial<CreditNoteCreatePayloadI>
  ): Partial<CreditNoteCreatePayloadI> {
    const normalized: Partial<CreditNoteCreatePayloadI> = {};

    if (typeof payload.invoice === 'number') {
      normalized.invoice = Number(payload.invoice);
    }

    if (typeof payload.status === 'number') {
      normalized.status = Number(payload.status);
    }

    if (typeof payload.credit_note_number === 'string') {
      normalized.credit_note_number = payload.credit_note_number.trim();
    }

    if (typeof payload.amount === 'number') {
      const amount = Number(payload.amount);
      normalized.amount = Number.isFinite(amount) ? amount : 0;
    }

    if (typeof payload.reason === 'string') {
      normalized.reason = payload.reason.trim();
    }

    if (payload.notes !== undefined) {
      normalized.notes = payload.notes ? String(payload.notes).trim() : null;
    }

    if (typeof payload.is_active === 'boolean') {
      normalized.is_active = payload.is_active;
    }

    return normalized;
  }
}
