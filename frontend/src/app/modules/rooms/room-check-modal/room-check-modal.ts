import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

import { BillingService } from '../../../services/billing';
import { PaymentMethodI, PaymentMethodService } from '../../../services/payment-method';
import { ReservationService } from '../../../services/reservation';
import { RoomInventoryService } from '../../../services/room-inventory';
import { ChargeI } from '../../billing/billing-model';
import { ReservationDetailI, ReservationGuestI } from '../../reservations/reservation-model';
import { RoomInventoryI } from '../../room-inventory/room-inventory-model';
import { RoomI } from '../room-model';

export type RoomCheckMode = 'check-in' | 'check-out';

/** Un huesped con su casilla de verificacion de documento. */
export type GuestVerification = {
  guest: ReservationGuestI;
  hasDocument: boolean;
  verified: boolean;
};

/**
 * Paso de verificacion antes de un check-in o un check-out.
 *
 * Hasta ahora las dos acciones se ejecutaban con un clic desde la tarjeta y desde el
 * modal de habitacion. Un check-in de un clic deja entrar huespedes sin contrastar
 * documentos, y un check-out de un clic cierra la habitacion sin mirar el saldo ni el
 * inventario. Este modal obliga a mirar antes de confirmar.
 */
@Component({
  selector: 'app-room-check-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-check-modal.html',
  styleUrls: ['./room-check-modal.css']
})
export class RoomCheckModal implements OnInit {
  @Input({ required: true }) room!: RoomI;
  @Input({ required: true }) mode!: RoomCheckMode;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<void>();

  loading = true;
  submitting = false;
  errorMessage = '';

  reservation: ReservationDetailI | null = null;
  guests: GuestVerification[] = [];
  lowInventory: RoomInventoryI[] = [];

  /** Consumos y cargos de la reserva, para que el huesped vea el detalle. */
  charges: ChargeI[] = [];
  paymentMethods: PaymentMethodI[] = [];

  paymentForm = {
    payment_method: null as number | null,
    amount: 0,
    reference: ''
  };
  registeringPayment = false;
  paymentError = '';
  paymentFeedback = '';

  constructor(
    private paymentMethodService: PaymentMethodService,
    private reservationService: ReservationService,
    private roomInventoryService: RoomInventoryService,
    private billingService: BillingService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  // ------------------------------------------------------------------ carga

  private load(): void {
    const reservationId = this.room?.active_reservation?.id;
    if (!reservationId) {
      this.loading = false;
      this.errorMessage = 'Esta habitacion no tiene una reserva activa.';
      return;
    }

    const isCheckOut = this.mode === 'check-out';

    forkJoin({
      reservation: this.reservationService
        .getReservationById(reservationId)
        .pipe(catchError(() => of(null))),
      inventory: isCheckOut
        ? this.roomInventoryService
            .listRoomInventory({ room: this.room.id })
            .pipe(catchError(() => of([] as RoomInventoryI[])))
        : of([] as RoomInventoryI[]),
      charges: isCheckOut
        ? this.billingService
            .listCharges({ reservation: reservationId, is_active: true, ordering: 'id' })
            .pipe(catchError(() => of([] as ChargeI[])))
        : of([] as ChargeI[]),
      paymentMethods: isCheckOut
        ? this.paymentMethodService
            .listPaymentMethods()
            .pipe(catchError(() => of([] as PaymentMethodI[])))
        : of([] as PaymentMethodI[])
    }).subscribe(({ reservation, inventory, charges, paymentMethods }) => {
      this.loading = false;

      if (!reservation) {
        this.errorMessage = 'No se pudo cargar la reserva para verificarla.';
        return;
      }

      this.reservation = reservation;
      this.guests = (reservation.guests || []).map((guest) => this.toVerification(guest));
      this.lowInventory = inventory.filter(
        (line) => (line.minimum_quantity || 0) > 0 && (line.quantity || 0) < line.minimum_quantity!
      );
      // Los cargos automaticos son la estadia y el paquete: ya salen en el saldo, no
      // son "lo que el huesped consumio".
      this.charges = charges.filter((charge) => !charge.is_automatic);
      this.paymentMethods = paymentMethods;
      this.resetPaymentForm();
    });
  }

  private resetPaymentForm(): void {
    this.paymentForm = {
      payment_method: this.paymentMethods[0]?.id ?? null,
      amount: this.amountDue,
      reference: ''
    };
  }

  private toVerification(guest: ReservationGuestI): GuestVerification {
    const hasDocument = Boolean(String(guest.document_number || '').trim());
    return { guest, hasDocument, verified: false };
  }

  // ----------------------------------------------------------------- textos

  get title(): string {
    return this.mode === 'check-in' ? 'Verificar ingreso' : 'Revisar salida';
  }

  get subtitle(): string {
    const number = this.room?.number ? `Habitacion ${this.room.number}` : 'Habitacion';
    return this.mode === 'check-in'
      ? `${number} · contrasta los documentos antes de dar el ingreso`
      : `${number} · revisa lo pendiente antes de cerrar la estadia`;
  }

  get confirmLabel(): string {
    if (this.submitting) return 'Procesando...';
    return this.mode === 'check-in' ? 'Confirmar ingreso' : 'Confirmar salida';
  }

  get holderName(): string {
    return this.reservation?.client_full_name?.trim() || 'Sin titular registrado';
  }

  get holderDocument(): string {
    return this.reservation?.client_document_number?.trim() || 'Sin documento registrado';
  }

  // ------------------------------------------------------------- check-in

  get verifiedGuestCount(): number {
    return this.guests.filter((item) => item.verified).length;
  }

  get guestsWithoutDocument(): number {
    return this.guests.filter((item) => !item.hasDocument).length;
  }

  get hasGuests(): boolean {
    return this.guests.length > 0;
  }

  toggleGuest(entry: GuestVerification): void {
    entry.verified = !entry.verified;
  }

  verifyAllGuests(): void {
    const allVerified = this.verifiedGuestCount === this.guests.length;
    for (const entry of this.guests) {
      entry.verified = !allVerified;
    }
  }

  guestDocumentLabel(entry: GuestVerification): string {
    if (!entry.hasDocument) return 'Sin documento registrado';
    const type = entry.guest.document_type_name || entry.guest.document_type_code || 'Doc.';
    return `${type} ${entry.guest.document_number}`;
  }

  guestName(entry: GuestVerification): string {
    const full = entry.guest.full_name?.trim();
    if (full) return full;
    return `${entry.guest.first_name || ''} ${entry.guest.last_name || ''}`.trim() || 'Sin nombre';
  }

  // ------------------------------------------------------------- check-out

  /**
   * Lo que el huesped debe **ahora**, leido de la reserva y no de la tarjeta: despues
   * de cada pago se recarga la reserva, asi que este valor baja hasta cero.
   */
  get amountDue(): number {
    return this.toAmount(this.reservation?.pending_amount);
  }

  get totalCharged(): number {
    return this.toAmount(this.reservation?.total_amount);
  }

  get totalPaid(): number {
    return this.toAmount(this.reservation?.total_deposits);
  }

  get chargesTotal(): number {
    return this.charges.reduce((total, charge) => total + this.toAmount(charge.total_amount), 0);
  }

  get isSettled(): boolean {
    return this.amountDue <= 0;
  }

  /** El saldo puede no ser visible: `rooms.read_guest_data` lo devuelve en null. */
  get moneyIsHidden(): boolean {
    return (
      this.room?.operations?.reservation_pending === null ||
      this.room?.operations?.reservation_pending === undefined
    );
  }

  get amountDueLabel(): string {
    return this.formatMoney(this.amountDue);
  }

  get totalChargedLabel(): string {
    return this.formatMoney(this.totalCharged);
  }

  get totalPaidLabel(): string {
    return this.formatMoney(this.totalPaid);
  }

  get chargesTotalLabel(): string {
    return this.formatMoney(this.chargesTotal);
  }

  chargeTotalLabel(charge: ChargeI): string {
    return this.formatMoney(this.toAmount(charge.total_amount));
  }

  chargeUnitLabel(charge: ChargeI): string {
    const quantity = Number(charge.quantity) || 1;
    if (quantity <= 1) return '';
    return `${quantity} × ${this.formatMoney(this.toAmount(charge.unit_price))}`;
  }

  // --------------------------------------------------------------- cobro

  get canRegisterPayment(): boolean {
    if (this.registeringPayment || this.isSettled) return false;
    if (!this.paymentForm.payment_method) return false;

    const amount = Number(this.paymentForm.amount);
    return Number.isFinite(amount) && amount > 0 && amount <= this.amountDue;
  }

  get paymentAmountHint(): string {
    const amount = Number(this.paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return 'Ingresa un monto mayor que cero.';
    if (amount > this.amountDue) return `El monto no puede superar ${this.amountDueLabel}.`;
    if (amount < this.amountDue) {
      return `Abono parcial: quedarian ${this.formatMoney(this.amountDue - amount)} por cobrar.`;
    }
    return 'Cubre el saldo completo.';
  }

  payFullAmount(): void {
    this.paymentForm.amount = this.amountDue;
  }

  get selectedPaymentMethod(): PaymentMethodI | null {
    return (
      this.paymentMethods.find((method) => method.id === this.paymentForm.payment_method) || null
    );
  }

  /**
   * Cuenta destino cuando se cobra por transferencia: es el dato que recepcion le dicta
   * al huesped, y por eso se guarda con el metodo.
   */
  get selectedAccountNumber(): string {
    const method = this.selectedPaymentMethod;
    if (!method || method.method_type !== 'TRANSFERENCIA') return '';
    return String(method.account_number || '').trim();
  }

  /**
   * Registra el pago contra la factura por defecto de la reserva.
   *
   * Es el mismo camino que usa el cobro inmediato de un consumo en el modal de
   * habitacion: los signals de facturacion mantienen esa factura sincronizada con el
   * total de la reserva, asi que su saldo pendiente coincide con el de la reserva.
   */
  registerPayment(): void {
    if (!this.canRegisterPayment) return;

    const reservationId = this.reservation?.id;
    const method = this.paymentForm.payment_method;
    if (!reservationId || !method) return;

    this.registeringPayment = true;
    this.paymentError = '';
    this.paymentFeedback = '';

    const amount = Number(this.paymentForm.amount);

    this.billingService
      .listInvoices({ reservation: reservationId, is_active: true, ordering: '-id' })
      .subscribe({
        next: (invoices) => {
          const invoice = invoices[0];
          if (!invoice?.id) {
            this.registeringPayment = false;
            this.paymentError =
              'La reserva no tiene una factura donde registrar el pago. Revisa facturacion.';
            return;
          }

          this.billingService
            .createPayment({
              invoice: invoice.id,
              payment_method: method,
              amount,
              reference: this.paymentForm.reference.trim() || null,
              notes: 'Cobro en check-out',
              is_active: true
            })
            .subscribe({
              next: () => this.afterPaymentRegistered(amount),
              error: (error) => {
                this.registeringPayment = false;
                this.paymentError = this.extractPaymentError(error);
              }
            });
        },
        error: () => {
          this.registeringPayment = false;
          this.paymentError = 'No se pudo consultar la factura de la reserva.';
        }
      });
  }

  private afterPaymentRegistered(amount: number): void {
    const reservationId = this.reservation?.id;
    if (!reservationId) {
      this.registeringPayment = false;
      return;
    }

    // Se relee la reserva para que `pending_amount` refleje el pago: es lo que
    // desbloquea el boton de confirmar.
    forkJoin({
      reservation: this.reservationService
        .getReservationById(reservationId)
        .pipe(catchError(() => of(this.reservation))),
      charges: this.billingService
        .listCharges({ reservation: reservationId, is_active: true, ordering: 'id' })
        .pipe(catchError(() => of(this.charges)))
    }).subscribe(({ reservation, charges }) => {
      this.registeringPayment = false;
      if (reservation) this.reservation = reservation;
      this.charges = (charges || []).filter((charge) => !charge.is_automatic);
      this.paymentFeedback = `Pago de ${this.formatMoney(amount)} registrado.`;
      this.resetPaymentForm();
    });
  }

  private extractPaymentError(error: unknown): string {
    const detail = (error as { error?: Record<string, unknown> })?.error;
    if (detail && typeof detail === 'object') {
      const amount = (detail as Record<string, unknown>)['amount'];
      if (Array.isArray(amount) && amount.length) return String(amount[0]);
      if (typeof amount === 'string') return amount;
      const message = (detail as Record<string, unknown>)['detail'];
      if (typeof message === 'string') return message;
    }
    return 'No se pudo registrar el pago.';
  }

  // ------------------------------------------------------------ confirmar

  get blockingReason(): string {
    if (this.loading || this.errorMessage) return this.errorMessage;

    if (this.mode === 'check-in') {
      if (!this.hasGuests) {
        return 'La reserva no tiene huespedes registrados. Agregalos antes de dar el ingreso.';
      }
      if (this.verifiedGuestCount < this.guests.length) {
        const missing = this.guests.length - this.verifiedGuestCount;
        return `Falta verificar el documento de ${missing} huesped(es).`;
      }
      return '';
    }

    // Sin permiso para ver el saldo no se puede exigir cobrarlo: el cierre queda a
    // cargo de quien si tiene acceso a facturacion.
    if (this.moneyIsHidden) return '';

    if (!this.isSettled) {
      return `Falta cobrar ${this.amountDueLabel} antes de cerrar la estadia.`;
    }
    return '';
  }

  get canConfirm(): boolean {
    return !this.loading && !this.submitting && !this.blockingReason;
  }

  confirm(): void {
    if (!this.canConfirm) return;

    const reservationId = this.reservation?.id;
    if (!reservationId) return;

    this.submitting = true;
    this.errorMessage = '';

    const action =
      this.mode === 'check-in'
        ? this.reservationService.checkInReservation(reservationId)
        : this.reservationService.checkOutReservation(reservationId);

    action.subscribe({
      next: () => {
        this.submitting = false;
        this.confirmed.emit();
      },
      error: () => {
        this.submitting = false;
        this.errorMessage =
          this.mode === 'check-in'
            ? 'No se pudo registrar el check-in.'
            : 'No se pudo registrar el check-out.';
      }
    });
  }

  close(): void {
    if (this.submitting) return;
    this.closed.emit();
  }

  trackByGuest(_: number, entry: GuestVerification): number {
    return entry.guest.id;
  }

  trackByInventory(_: number, line: RoomInventoryI): number {
    return line.id;
  }

  trackByCharge(_: number, charge: ChargeI): number {
    return charge.id;
  }

  // ---------------------------------------------------------------- helpers

  private toAmount(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatMoney(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  }
}
