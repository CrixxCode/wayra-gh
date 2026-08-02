import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../services/billing';
import { MasterDataService } from '../../../services/master-data.service';
import { PackagesService } from '../../../services/package';
import { ReservationService } from '../../../services/reservation';
import { ServicesService } from '../../../services/service';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { ReservationDetailI, ReservationI } from '../../reservations/reservation-model';
import { PackageI } from '../../packages/package-model';
import { ServiceI } from '../../services/service-model';
import { CreatePayment } from '../../payments/create-payment/create-payment';
import { ChargeI, CreditNoteI, InvoiceI, PaymentI } from '../billing-model';
import { CreateBill } from '../create-bill/create-bill';
import { CreditNoteList } from '../credit-note/credit-note-list/credit-note-list';
import { PosBar } from '../pos-bar/pos-bar';

type ChargeGroupTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  chipBg: string;
  chipColor: string;
  amountColor: string;
};

type ChargeGroupI = {
  key: string;
  code: string;
  label: string;
  total: number;
  count: number;
  tone: ChargeGroupTone;
  rows: ChargeI[];
};

type PaymentMethodTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  amountColor: string;
  badgeBg: string;
  badgeColor: string;
};

type ReservationModalContextI = ReservationI &
  Partial<Pick<ReservationDetailI, 'rooms_detail' | 'guests' | 'deposits'>>;

const CHARGE_GROUP_TONES: Record<string, ChargeGroupTone> = {
  RESTAURANTE: {
    icon: 'fa-solid fa-utensils',
    iconBg: '#fff4dc',
    iconColor: '#b45309',
    chipBg: '#fff3dc',
    chipColor: '#b45309',
    amountColor: '#d97706'
  },
  BAR: {
    icon: 'fa-solid fa-wine-glass',
    iconBg: '#efe9ff',
    iconColor: '#6d28d9',
    chipBg: '#f3ecff',
    chipColor: '#6d28d9',
    amountColor: '#7c3aed'
  },
  SPA: {
    icon: 'fa-solid fa-spa',
    iconBg: '#ddfbff',
    iconColor: '#0e7490',
    chipBg: '#ddfbff',
    chipColor: '#0e7490',
    amountColor: '#0e7490'
  },
  MINIBAR: {
    icon: 'fa-solid fa-bottle-water',
    iconBg: '#dcfdf2',
    iconColor: '#0f766e',
    chipBg: '#dcfdf2',
    chipColor: '#0f766e',
    amountColor: '#0f766e'
  },
  HABITACION: {
    icon: 'fa-solid fa-bed',
    iconBg: '#e7eeff',
    iconColor: '#1d4ed8',
    chipBg: '#e7eeff',
    chipColor: '#1d4ed8',
    amountColor: '#1d4ed8'
  },
  PAQUETE: {
    icon: 'fa-solid fa-box-open',
    iconBg: '#ffedd5',
    iconColor: '#c2410c',
    chipBg: '#ffedd5',
    chipColor: '#c2410c',
    amountColor: '#ea580c'
  },
  SERVICIO: {
    icon: 'fa-solid fa-concierge-bell',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    chipBg: '#e6edf7',
    chipColor: '#1f3f73',
    amountColor: '#1f3f73'
  },
  OTRO: {
    icon: 'fa-solid fa-receipt',
    iconBg: '#f1f5f9',
    iconColor: '#475569',
    chipBg: '#f1f5f9',
    chipColor: '#475569',
    amountColor: '#334155'
  },
  DEFAULT: {
    icon: 'fa-solid fa-receipt',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    chipBg: '#e6edf7',
    chipColor: '#1f3f73',
    amountColor: '#1f3f73'
  }
};

const PAYMENT_METHOD_TONES: Record<string, PaymentMethodTone> = {
  EFECTIVO: {
    icon: 'fa-solid fa-money-bill-wave',
    iconBg: '#dcfce7',
    iconColor: '#15803d',
    amountColor: '#166534',
    badgeBg: '#dcfce7',
    badgeColor: '#166534'
  },
  TARJETA: {
    icon: 'fa-regular fa-credit-card',
    iconBg: '#dbeafe',
    iconColor: '#1d4ed8',
    amountColor: '#1d4ed8',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8'
  },
  TRANSFERENCIA: {
    icon: 'fa-solid fa-building-columns',
    iconBg: '#ede9fe',
    iconColor: '#7c3aed',
    amountColor: '#6d28d9',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9'
  },
  PSE: {
    icon: 'fa-solid fa-mobile-screen-button',
    iconBg: '#cffafe',
    iconColor: '#0e7490',
    amountColor: '#0e7490',
    badgeBg: '#cffafe',
    badgeColor: '#0e7490'
  },
  DEFAULT: {
    icon: 'fa-solid fa-wallet',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    amountColor: '#1f3f73',
    badgeBg: '#e6edf7',
    badgeColor: '#1f3f73'
  }
};

@Component({
  selector: 'app-detail-bill',
  standalone: true,
  imports: [CommonModule, CreateBill, CreatePayment, CreditNoteList, PosBar],
  templateUrl: './detail-bill.html',
  styleUrls: ['./detail-bill.css']
})
export class DetailBill implements OnChanges {
  @Input() invoice: InvoiceI | null = null;
  @Input() initialReservation: ReservationModalContextI | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() invoiceUpdated = new EventEmitter<InvoiceI>();

  loading = false;
  refreshing = false;
  printing = false;
  removingChargeId: number | null = null;

  errorMessage = '';
  infoMessage = '';

  showCreateChargeForm = false;
  showCreatePaymentForm = false;
  showPosBarForm = false;
  showCreditNotesModal = false;

  activeInvoice: InvoiceI | null = null;
  reservation: ReservationModalContextI | null = null;
  charges: ChargeI[] = [];
  payments: PaymentI[] = [];
  creditNotes: CreditNoteI[] = [];
  groupedCharges: ChargeGroupI[] = [];
  chargeTypes: MasterDataI[] = [];
  paymentMethods: MasterDataI[] = [];
  creditNoteStatuses: MasterDataI[] = [];
  services: ServiceI[] = [];
  packages: PackageI[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['invoice']) {
      this.loadDetail();
      return;
    }

    if (changes['initialReservation'] && this.invoice && !this.reservation) {
      this.reservation = this.buildReservationContext(this.initialReservation);
    }
  }

  constructor(
    private billingService: BillingService,
    private reservationService: ReservationService,
    private masterDataService: MasterDataService,
    private servicesService: ServicesService,
    private packagesService: PackagesService,
    private confirmationService: ConfirmationService
  ) {}

  get roomBadgeLabel(): string {
    if (!this.reservation?.rooms_detail?.length) return '--';
    const firstRoom = this.reservation.rooms_detail[0];
    const roomNumber = String(firstRoom.room_number || firstRoom.room || '').trim();
    if (!roomNumber) return '--';

    const numbersOnly = roomNumber.replace(/\D/g, '');
    return numbersOnly || roomNumber;
  }

  get guestName(): string {
    return this.reservation?.client_full_name || 'Huesped sin nombre';
  }

  get reservationSecondaryLabel(): string {
    const roomLabel = this.firstRoomFullLabel;
    const stayLabel = this.stayRangeLabel;
    const nightsLabel = `${this.totalNights} noche(s)`;
    return `${roomLabel}  |  ${stayLabel} (${nightsLabel})`;
  }

  get originLabel(): string {
    return this.reservation?.origin_name || 'Hospedaje';
  }

  get totalAmount(): number {
    const invoiceTotal = this.toNumber(this.activeInvoice?.total_amount);
    if (invoiceTotal > 0) return invoiceTotal;
    return this.chargesTotal;
  }

  get chargeCount(): number {
    return this.charges.length;
  }

  get paymentCount(): number {
    return this.payments.length;
  }

  get totalPaidAmount(): number {
    return this.payments
      .filter((payment) => !!payment.is_active)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);
  }

  get pendingAmount(): number {
    const pending = this.totalWithTaxAmount - this.totalPaidAmount;
    return pending > 0 ? pending : 0;
  }

  get creditNotesCount(): number {
    return this.creditNotes.filter((note) => !!note.is_active).length;
  }

  get creditNotesTotal(): number {
    return this.creditNotes
      .filter((note) => !!note.is_active)
      .reduce((sum, note) => sum + this.toNumber(note.amount), 0);
  }

  get canRegisterPayments(): boolean {
    return !!this.activeInvoice && this.pendingAmount > 0;
  }

  get isInvoicePaid(): boolean {
    if (!this.activeInvoice) return false;
    return this.normalizeCode(this.activeInvoice.status_code) === 'PAGADA';
  }

  get canManageCharges(): boolean {
    if (!this.activeInvoice) return false;

    const statusCode = this.normalizeCode(this.activeInvoice.status_code);
    return statusCode !== 'EMITIDA' && statusCode !== 'PAGADA' && statusCode !== 'ANULADA';
  }

  get subtotalAmount(): number {
    const value = this.toNumber(this.activeInvoice?.subtotal);
    if (value > 0) return value;
    return this.chargesTotal;
  }

  get taxAmount(): number {
    return this.toNumber(this.activeInvoice?.tax_amount);
  }

  get totalWithTaxAmount(): number {
    const value = this.toNumber(this.activeInvoice?.total_amount);
    if (value > 0) return value;
    return this.subtotalAmount + this.taxAmount;
  }

  get chargesTotal(): number {
    return this.charges.reduce((sum, charge) => sum + this.toNumber(charge.total_amount), 0);
  }

  get stayRangeLabel(): string {
    const checkIn = this.formatDate(this.reservation?.expected_check_in);
    const checkOut = this.formatDate(this.reservation?.expected_check_out);
    return `${checkIn} - ${checkOut}`;
  }

  get totalNights(): number {
    if (typeof this.reservation?.total_nights === 'number') {
      return this.reservation.total_nights;
    }

    const checkIn = this.parseDate(this.reservation?.expected_check_in || null);
    const checkOut = this.parseDate(this.reservation?.expected_check_out || null);
    if (!checkIn || !checkOut) return 0;

    const diff = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  get firstRoomFullLabel(): string {
    if (!this.reservation?.rooms_detail?.length) {
      const totalRooms = Number(this.reservation?.total_rooms || 0);
      return totalRooms > 0 ? `${totalRooms} habitacion(es)` : 'Sin habitacion';
    }

    const firstRoom = this.reservation.rooms_detail[0];
    const roomNumber = String(firstRoom.room_number || firstRoom.room || '').trim();
    if (!roomNumber) return 'Sin habitacion';

    const floorMatch = roomNumber.match(/\d/);
    if (floorMatch?.[0]) {
      return `Piso ${floorMatch[0]} - Suite ${roomNumber}`;
    }

    return `Suite ${roomNumber}`;
  }

  closeDrawer(): void {
    this.closed.emit();
  }

  toggleCreateChargeForm(): void {
    if (!this.showCreateChargeForm && !this.canManageCharges) return;

    this.showCreateChargeForm = !this.showCreateChargeForm;
    if (this.showCreateChargeForm) {
      this.showCreatePaymentForm = false;
      this.showPosBarForm = false;
    }
    this.errorMessage = '';
  }

  toggleCreatePaymentForm(): void {
    if (!this.showCreatePaymentForm && !this.canRegisterPayments) return;

    this.showCreatePaymentForm = !this.showCreatePaymentForm;
    if (this.showCreatePaymentForm) {
      this.showCreateChargeForm = false;
      this.showPosBarForm = false;
    }
    this.errorMessage = '';
  }

  togglePosBarForm(): void {
    if (!this.showPosBarForm && !this.canManageCharges) return;

    this.showPosBarForm = !this.showPosBarForm;
    if (this.showPosBarForm) {
      this.showCreateChargeForm = false;
      this.showCreatePaymentForm = false;
    }
    this.errorMessage = '';
  }

  openCreditNotesModal(): void {
    if (!this.activeInvoice) return;
    this.showCreditNotesModal = true;
    this.errorMessage = '';
  }

  closeCreditNotesModal(): void {
    this.showCreditNotesModal = false;
  }

  onCreditNotesChanged(): void {
    this.infoMessage = successActionAlert('update', 'notas de credito');
    this.refreshInvoiceData();
  }

  onChargeCreated(): void {
    this.infoMessage = successActionAlert('register', 'cargo');
    this.refreshInvoiceData();
  }

  onPaymentCreated(): void {
    this.infoMessage = successActionAlert('register', 'pago');
    this.showCreatePaymentForm = false;
    this.refreshInvoiceData();
  }

  onCreateChargeCancelled(): void {
    this.showCreateChargeForm = false;
  }

  onCreatePaymentCancelled(): void {
    this.showCreatePaymentForm = false;
  }

  onPosBarCancelled(): void {
    this.showPosBarForm = false;
  }

  onPosChargesCreated(payload: { count: number; totalLabel: string }): void {
    const count = Number(payload?.count || 0);
    this.infoMessage = count
      ? `Se registraron ${count} consumo(s) desde bar/mini tienda.`
      : 'Se registraron consumos desde bar/mini tienda.';
    this.showPosBarForm = false;
    this.refreshInvoiceData();
  }

  deactivateCharge(charge: ChargeI): void {
    if (charge.is_automatic || !this.canManageCharges) return;

    openActionConfirmation(this.confirmationService, {
      action: 'remove',
      target: 'cargo de la factura',
      onAccept: () => {
        this.removingChargeId = charge.id;
        this.errorMessage = '';
        this.infoMessage = '';

        this.billingService.updateCharge(charge.id, { is_active: false }).subscribe({
          next: () => {
            this.removingChargeId = null;
            this.infoMessage = successActionAlert('remove', 'cargo');
            this.refreshInvoiceData();
          },
          error: (error) => {
            this.removingChargeId = null;
            this.errorMessage = this.extractErrorMessage(error, errorActionAlert('remove', 'cargo'));
          }
        });
      }
    });
  }

  printInvoice(): void {
    if (!this.activeInvoice || this.printing) return;
    const invoice = this.activeInvoice;

    this.printing = true;
    this.errorMessage = '';
    this.infoMessage = '';

    this.billingService.downloadInvoicePdf(invoice.id).subscribe({
      next: (blob) => {
        this.printing = false;

        const fileName = this.buildPdfFileName(invoice);
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.click();
        window.URL.revokeObjectURL(objectUrl);

        this.infoMessage = 'Factura PDF generada correctamente.';
      },
      error: (error) => {
        this.printing = false;
        this.errorMessage = this.extractErrorMessage(error, 'No fue posible generar el PDF de la factura.');
      }
    });
  }

  getGroupTone(group: ChargeGroupI): ChargeGroupTone {
    return group.tone;
  }

  getPaymentTone(payment: PaymentI): PaymentMethodTone {
    const key = this.resolvePaymentMethodKey(payment);
    return PAYMENT_METHOD_TONES[key] || PAYMENT_METHOD_TONES['DEFAULT'];
  }

  getPaymentMethodLabel(payment: PaymentI): string {
    const byName = String(payment.payment_method_name || '').trim();
    if (byName) return byName;

    const byCode = String(payment.payment_method_code || '').trim();
    if (byCode) return byCode;

    return 'Metodo sin nombre';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';

    const date = this.parseDate(value);
    if (!date) return String(value);

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    });
  }

  formatHour(value: string | null | undefined): string {
    if (!value) return '--:--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';

    return date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackByGroup(_: number, group: ChargeGroupI): string {
    return group.key;
  }

  trackByCharge(_: number, charge: ChargeI): number {
    return charge.id;
  }

  trackByPayment(_: number, payment: PaymentI): number {
    return payment.id;
  }

  private loadDetail(): void {
    if (!this.invoice) {
      this.activeInvoice = null;
      this.reservation = null;
      this.charges = [];
      this.payments = [];
      this.creditNotes = [];
      this.groupedCharges = [];
      this.packages = [];
      return;
    }

    const invoiceId = this.invoice.id;
    const reservationId = this.invoice.reservation;

    this.activeInvoice = this.invoice;
    this.reservation = this.buildReservationContext(this.initialReservation);
    this.charges = [];
    this.payments = [];
    this.creditNotes = [];
    this.groupedCharges = [];

    this.loading = true;
    this.refreshing = false;
    this.errorMessage = '';
    this.infoMessage = '';
    this.showCreateChargeForm = false;
    this.showCreatePaymentForm = false;
    this.showPosBarForm = false;
    this.showCreditNotesModal = false;

    forkJoin({
      invoice: this.billingService.getInvoiceById(invoiceId).pipe(catchError(() => of(this.invoice as InvoiceI))),
      reservation: this.reservationService
        .getReservationById(reservationId)
        .pipe(catchError(() => of(this.reservation))),
      charges: this.billingService
        .listCharges({ reservation: reservationId, ordering: '-charge_date,-id', is_active: true })
        .pipe(catchError(() => of([] as ChargeI[]))),
      chargeTypes: this.masterDataService
        .listMasterData({ group: 'CHARGE_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      paymentMethods: this.masterDataService
        .listMasterData({ group: 'PAYMENT_METHOD', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      creditNoteStatuses: this.masterDataService
        .listMasterData({ group: 'CREDIT_NOTE_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      payments: this.billingService
        .listPayments({ invoice: invoiceId, ordering: '-payment_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as PaymentI[]))),
      creditNotes: this.billingService
        .listCreditNotes({ invoice: invoiceId, ordering: '-issue_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as CreditNoteI[]))),
      services: this.servicesService
        .listServices({ ordering: 'name' })
        .pipe(catchError(() => of([] as ServiceI[]))),
      packages: this.packagesService
        .listPackages({ ordering: 'name' })
        .pipe(catchError(() => of([] as PackageI[])))
    }).subscribe({
      next: ({
        invoice,
        reservation,
        charges,
        chargeTypes,
        paymentMethods,
        creditNoteStatuses,
        payments,
        creditNotes,
        services,
        packages
      }) => {
        this.loading = false;
        this.activeInvoice = invoice;
        this.reservation = this.buildReservationContext(reservation);
        this.chargeTypes = chargeTypes;
        this.paymentMethods = paymentMethods;
        this.creditNoteStatuses = creditNoteStatuses;
        this.services = services.filter((service) => !!service.is_active);
        this.packages = packages.filter((pkg) => !!pkg.is_active);
        this.setChargeRows(charges);
        this.setPaymentRows(payments);
        this.setCreditNoteRows(creditNotes);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el detalle de la factura.';
      }
    });
  }

  private refreshInvoiceData(): void {
    if (!this.activeInvoice) return;

    this.refreshing = true;
    this.errorMessage = '';

    forkJoin({
      invoice: this.billingService.getInvoiceById(this.activeInvoice.id).pipe(catchError(() => of(this.activeInvoice as InvoiceI))),
      charges: this.billingService
        .listCharges({
          reservation: this.activeInvoice.reservation,
          ordering: '-charge_date,-id',
          is_active: true
        })
        .pipe(catchError(() => of([] as ChargeI[]))),
      payments: this.billingService
        .listPayments({
          invoice: this.activeInvoice.id,
          ordering: '-payment_date,-id',
          include_inactive: true
        })
        .pipe(catchError(() => of([] as PaymentI[]))),
      creditNotes: this.billingService
        .listCreditNotes({
          invoice: this.activeInvoice.id,
          ordering: '-issue_date,-id',
          include_inactive: true
        })
        .pipe(catchError(() => of([] as CreditNoteI[])))
    }).subscribe({
      next: ({ invoice, charges, payments, creditNotes }) => {
        this.refreshing = false;
        this.activeInvoice = invoice;
        this.invoiceUpdated.emit(invoice);
        this.setChargeRows(charges);
        this.setPaymentRows(payments);
        this.setCreditNoteRows(creditNotes);
      },
      error: () => {
        this.refreshing = false;
        this.errorMessage = 'No fue posible actualizar la factura despues del cambio.';
      }
    });
  }

  private setChargeRows(charges: ChargeI[]): void {
    const invoiceReservationId = Number(this.activeInvoice?.reservation || 0);
    const filtered = charges
      .filter((charge) => Number(charge.reservation) === invoiceReservationId)
      .filter((charge) => !!charge.is_active);

    this.charges = filtered.sort((a, b) => b.id - a.id);
    this.groupedCharges = this.buildChargeGroups(this.charges);
  }

  private setPaymentRows(payments: PaymentI[]): void {
    const invoiceId = Number(this.activeInvoice?.id || 0);
    const filtered = payments.filter((payment) => Number(payment.invoice) === invoiceId);

    this.payments = filtered.sort((a, b) => b.id - a.id);
  }

  private setCreditNoteRows(creditNotes: CreditNoteI[]): void {
    const invoiceId = Number(this.activeInvoice?.id || 0);
    const filtered = creditNotes.filter((creditNote) => Number(creditNote.invoice) === invoiceId);
    this.creditNotes = filtered.sort((a, b) => b.id - a.id);
  }

  private buildReservationContext(reservation: ReservationModalContextI | null): ReservationModalContextI | null {
    if (!reservation) return null;

    return {
      ...reservation,
      rooms_detail: Array.isArray(reservation.rooms_detail) ? reservation.rooms_detail : [],
      guests: Array.isArray(reservation.guests) ? reservation.guests : [],
      deposits: Array.isArray(reservation.deposits) ? reservation.deposits : []
    };
  }

  private buildChargeGroups(charges: ChargeI[]): ChargeGroupI[] {
    const groups = new Map<string, ChargeGroupI>();

    for (const charge of charges) {
      const code = this.resolveChargeCode(charge);
      const key = code || 'OTRO';
      const tone = CHARGE_GROUP_TONES[key] || CHARGE_GROUP_TONES['DEFAULT'];

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          code: key,
          label: this.resolveChargeLabel(charge, key),
          total: 0,
          count: 0,
          tone,
          rows: []
        });
      }

      const group = groups.get(key);
      if (!group) continue;

      group.rows.push(charge);
      group.count += 1;
      group.total += this.toNumber(charge.total_amount);
    }

    const weight: Record<string, number> = {
      RESTAURANTE: 1,
      BAR: 2,
      SPA: 3,
      MINIBAR: 4,
      HABITACION: 5,
      PAQUETE: 6,
      SERVICIO: 7,
      OTRO: 8
    };

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((a, b) => b.id - a.id)
      }))
      .sort((a, b) => {
        const first = weight[a.code] || 99;
        const second = weight[b.code] || 99;
        if (first !== second) return first - second;
        return a.label.localeCompare(b.label, 'es');
      });
  }

  private resolveChargeCode(charge: ChargeI): string {
    const fromTypeCode = this.normalizeCode(charge.charge_type_code);
    if (fromTypeCode) return fromTypeCode;

    const fromTypeName = this.normalizeCode(charge.charge_type_name);
    if (fromTypeName) return fromTypeName;

    return 'OTRO';
  }

  private resolvePaymentMethodKey(payment: PaymentI): string {
    const fromCode = this.normalizeCode(payment.payment_method_code);
    if (fromCode) return fromCode;

    const fromName = this.normalizeCode(payment.payment_method_name);
    if (fromName.includes('TARJETA')) return 'TARJETA';
    if (fromName.includes('EFECTIVO')) return 'EFECTIVO';
    if (fromName.includes('TRANSFERENCIA')) return 'TRANSFERENCIA';
    if (fromName.includes('PSE')) return 'PSE';

    return 'DEFAULT';
  }

  private resolveChargeLabel(charge: ChargeI, fallbackCode: string): string {
    const byName = String(charge.charge_type_name || '').trim();
    if (byName) return byName;

    if (fallbackCode === 'HABITACION') return 'Habitacion';
    if (fallbackCode === 'PAQUETE') return 'Paquete';
    if (fallbackCode === 'SERVICIO') return 'Servicio';
    if (fallbackCode === 'OTRO') return 'Otros cargos';

    return fallbackCode;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((item) => Number.isNaN(item))) return null;

      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private buildPdfFileName(invoice: InvoiceI): string {
    const base = String(invoice.invoice_number || `FAC-${invoice.id}` || 'factura').trim();
    const safe = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return `${safe || `FAC-${invoice.id}`}.pdf`;
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
