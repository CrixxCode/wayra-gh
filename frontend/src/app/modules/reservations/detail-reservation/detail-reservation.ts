import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ReservationService } from '../../../services/reservation';
import { BillingService } from '../../../services/billing';
import { RoomInventoryService } from '../../../services/room-inventory';
import { RoomInventoryI } from '../../room-inventory/room-inventory-model';
import { InvoiceI } from '../../billing/billing-model';
import {
  ReservationCheckOutPayloadI,
  ReservationCheckoutInventoryReviewLinePayloadI,
  ReservationDetailI,
  ReservationGuestI,
  ReservationPolicyI,
  ReservationStatusStyleI,
  ReservationVisualStatus
} from '../reservation-model';

type CheckoutInventoryLine = {
  key: string;
  roomId: number;
  roomLabel: string;
  itemId: number;
  itemLabel: string;
  expectedQuantity: number;
  reviewedQuantity: number;
  notes: string;
};

@Component({
  selector: 'app-detail-reservation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './detail-reservation.html',
  styleUrls: ['./detail-reservation.css']
})
export class DetailReservation implements OnChanges {
  @Input() reservationId: number | null = null;
  @Input() preloaded: ReservationDetailI | null = null;
  @Input() paymentMethods: MasterDataI[] = [];
  @Input() depositStatuses: MasterDataI[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<ReservationDetailI>();
  @Output() flowChanged = new EventEmitter<ReservationDetailI>();

  reservation: ReservationDetailI | null = null;
  loading = false;
  errorMessage = '';
  actionLoading = false;
  showGuestsModal = false;
  showPoliciesModal = false;
  showCheckoutInventoryModal = false;
  invoicePaymentStatusLabel = '';
  invoicePaymentStatusCode = '';
  invoiceStatusLoading = false;
  checkoutInventoryLoading = false;
  checkoutInventoryError = '';
  checkoutInventoryLines: CheckoutInventoryLine[] = [];

  constructor(
    private reservationService: ReservationService,
    private billingService: BillingService,
    private roomInventoryService: RoomInventoryService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preloaded'] && this.preloaded && this.preloaded.id === this.reservationId) {
      this.reservation = this.preloaded;
      this.errorMessage = '';
      this.showGuestsModal = false;
      this.showPoliciesModal = false;
      this.resetCheckoutInventoryModalState();
      this.loadInvoicePaymentStatus(this.preloaded.id);
      return;
    }

    if (changes['reservationId']) {
      this.showGuestsModal = false;
      this.showPoliciesModal = false;
      this.resetCheckoutInventoryModalState();
      this.clearInvoicePaymentStatus();
      this.loadReservation();
    }
  }

  get visualStatus(): ReservationVisualStatus {
    return this.getVisualStatus(this.reservation);
  }

  get drawerStatusClass(): string {
    switch (this.visualStatus) {
      case 'CONFIRMADA':
        return 'status-confirmada';
      case 'PENDIENTE':
        return 'status-pendiente';
      case 'EN_CURSO':
        return 'status-en-curso';
      case 'POR_SALIR_HOY':
        return 'status-por-salir-hoy';
      case 'CANCELADA':
        return 'status-cancelada';
      case 'FINALIZADA':
        return 'status-finalizada';
      default:
        return 'status-otra';
    }
  }

  get statusStyle(): ReservationStatusStyleI {
    return this.resolveStatusStyle(this.visualStatus);
  }

  get reservationCodeLabel(): string {
    if (!this.reservation) return 'RES';

    const createdDate = this.reservation.created_at ? new Date(this.reservation.created_at) : null;
    const year =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? createdDate.getFullYear()
        : new Date().getFullYear();
    return `RES-${year}-${String(this.reservation.id).padStart(3, '0')}`;
  }

  get guestInitials(): string {
    const fullName = String(this.reservation?.client_full_name || '').trim();
    if (!fullName) return 'HG';

    const parts = fullName.split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) || '';
    const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return `${first}${second}`.toUpperCase();
  }

  get guestSecondaryLabel(): string {
    const firstNationality = this.reservation?.guests?.find((guest) => !!guest.nationality)?.nationality;
    if (firstNationality && String(firstNationality).trim()) return String(firstNationality).trim();

    return this.reservation?.client_document_number || 'Sin documento';
  }

  get guestCountLabel(): string {
    if (!this.reservation) return '0 huespedes';

    const adults = (this.reservation.rooms_detail || []).reduce((sum, room) => sum + Number(room.adults || 0), 0);
    const children = (this.reservation.rooms_detail || []).reduce((sum, room) => sum + Number(room.children || 0), 0);
    const capacity = (this.reservation.rooms_detail || []).reduce(
      (sum, room) => sum + Number(room.room_type_capacity || 0),
      0
    );

    if (adults <= 0 && children <= 0) {
      const totalGuests = Number(this.reservation.total_guests || 0);
      const occupancy = `${totalGuests} huesped${totalGuests === 1 ? '' : 'es'}`;
      if (capacity > 0) return `Cap. ${capacity} - ${occupancy}`;
      return occupancy;
    }

    const occupancy =
      children > 0
        ? `${adults} adulto${adults === 1 ? '' : 's'} + ${children} nino${children === 1 ? '' : 's'}`
        : `${adults} adulto${adults === 1 ? '' : 's'}`;

    if (capacity > 0) {
      return `Cap. ${capacity} - ${occupancy}`;
    }

    return occupancy;
  }

  get guests(): ReservationGuestI[] {
    return this.reservation?.guests || [];
  }

  get hasGuests(): boolean {
    return this.guests.length > 0;
  }

  get guestSummaryRows(): ReservationGuestI[] {
    return this.guests.slice(0, 3);
  }

  get hiddenGuestsCount(): number {
    return Math.max(0, this.guests.length - this.guestSummaryRows.length);
  }

  get policies(): ReservationPolicyI[] {
    return this.reservation?.policies || [];
  }

  get hasPolicies(): boolean {
    return this.policies.length > 0;
  }

  get policySummaryRows(): ReservationPolicyI[] {
    return this.policies.slice(0, 2);
  }

  get hiddenPoliciesCount(): number {
    return Math.max(0, this.policies.length - this.policySummaryRows.length);
  }

  get hasCheckoutInventoryLines(): boolean {
    return this.checkoutInventoryLines.length > 0;
  }

  get stayCheckoutLabel(): string {
    if (!this.reservation?.expected_check_out) return 'Sin registro';
    if (this.visualStatus === 'POR_SALIR_HOY') return 'Hoy';
    return this.formatDate(this.reservation.expected_check_out);
  }

  get canRunPrimaryAction(): boolean {
    switch (this.visualStatus) {
      case 'PENDIENTE':
        return this.canConfirm;
      case 'CONFIRMADA':
        return this.canCheckIn;
      case 'EN_CURSO':
      case 'POR_SALIR_HOY':
        return this.canCheckOut;
      default:
        return false;
    }
  }

  get primaryActionLabel(): string {
    if (this.actionLoading) return 'Procesando...';

    switch (this.visualStatus) {
      case 'PENDIENTE':
        return 'Confirmar reserva';
      case 'CONFIRMADA':
        return 'Registrar check-in';
      case 'POR_SALIR_HOY':
        return 'Confirmar check-out';
      case 'EN_CURSO':
        return 'Registrar check-out';
      default:
        return 'Accion';
    }
  }

  get showCancelInfoMessage(): boolean {
    return this.visualStatus === 'CANCELADA';
  }

  get showEditAction(): boolean {
    if (!this.reservation) return false;
    if (this.reservation.real_check_in) return false;
    return !['EN_CURSO', 'POR_SALIR_HOY', 'CANCELADA', 'FINALIZADA'].includes(this.visualStatus);
  }

  get showCancelAction(): boolean {
    if (this.visualStatus === 'PENDIENTE') return false;
    return this.canCancel;
  }

  get totalNights(): number {
    if (!this.reservation) return 0;
    if (typeof this.reservation.total_nights === 'number') return this.reservation.total_nights;

    const checkIn = this.parseDate(this.reservation.expected_check_in);
    const checkOut = this.parseDate(this.reservation.expected_check_out);
    if (!checkIn || !checkOut) return 0;

    const diff = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  get totalAmount(): number {
    const backendTotal = Number(this.reservation?.total_amount);
    if (Number.isFinite(backendTotal) && backendTotal >= 0) {
      return backendTotal;
    }

    return Math.max(0, this.roomsSubtotal + this.packageSubtotal - this.discountAmount);
  }

  get roomsSubtotal(): number {
    const backendSubtotal = Number(this.reservation?.rooms_subtotal);
    if (Number.isFinite(backendSubtotal) && backendSubtotal >= 0) {
      return backendSubtotal;
    }

    if (!this.reservation) return 0;

    return (this.reservation.rooms_detail || []).reduce((sum, room) => {
      const subtotal = Number(room.subtotal ?? room.night_rate ?? 0);
      return sum + (Number.isNaN(subtotal) ? 0 : subtotal);
    }, 0);
  }

  get discountAmount(): number {
    const discount = Number(this.reservation?.total_discount || 0);
    return Number.isNaN(discount) ? 0 : discount;
  }

  get roomChargeLabel(): string {
    if (this.packageSubtotal > 0) return 'Alojamiento';

    const nights = this.totalNights;
    if (nights <= 0 || this.roomChargeAmount <= 0) return 'Habitacion';

    const nightRate = this.roomChargeAmount / nights;
    return `Habitacion (${nights}n x ${this.formatCurrency(nightRate)})`;
  }

  get roomChargeAmount(): number {
    return this.roomsSubtotal;
  }

  get packageSubtotal(): number {
    const value = Number(this.reservation?.package_price || 0);
    return Number.isNaN(value) ? 0 : value;
  }

  get totalDeposits(): number {
    const backendDeposits = Number(this.reservation?.total_deposits);
    if (Number.isFinite(backendDeposits) && backendDeposits >= 0) {
      return backendDeposits;
    }

    if (!this.reservation) return 0;

    return (this.reservation.deposits || []).reduce((sum, deposit) => {
      const amount = Number(deposit.amount || 0);
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0);
  }

  get pendingAmount(): number {
    const backendPending = Number(this.reservation?.pending_amount);
    if (Number.isFinite(backendPending) && backendPending >= 0) {
      return backendPending;
    }

    return Math.max(0, this.totalAmount - this.totalDeposits);
  }

  get paymentLabel(): string {
    if (this.invoiceStatusLoading) return 'Consultando...';

    const invoiceLabel = this.toTrimmedString(this.invoicePaymentStatusLabel);
    if (invoiceLabel) return invoiceLabel;

    return 'Sin factura';
  }

  get paymentTone(): { bg: string; color: string } {
    const invoiceCode = this.normalizeCode(this.invoicePaymentStatusCode);
    const invoiceLabel = this.normalizeCode(this.paymentLabel);

    if (invoiceCode === 'PAGADA' || invoiceCode === 'PAGADO' || invoiceLabel === 'PAGADA' || invoiceLabel === 'PAGADO') {
      return { bg: '#dcfce7', color: '#15803d' };
    }

    if (invoiceCode === 'PARCIAL' || invoiceLabel === 'PARCIAL') {
      return { bg: '#dbeafe', color: '#1d4ed8' };
    }

    if (invoiceCode === 'EMITIDA' || invoiceCode === 'PENDIENTE' || invoiceLabel === 'EMITIDA' || invoiceLabel === 'PENDIENTE') {
      return { bg: '#fef3c7', color: '#b45309' };
    }

    if (invoiceCode === 'ANULADA' || invoiceLabel === 'ANULADA') {
      return { bg: '#fee2e2', color: '#b91c1c' };
    }

    if (invoiceCode === 'BORRADOR' || invoiceLabel === 'BORRADOR') {
      return { bg: '#e0e7ff', color: '#3730a3' };
    }

    return { bg: '#e2e8f0', color: '#475569' };
  }

  get firstRoomLabel(): string {
    if (!this.reservation?.rooms_detail?.length) return 'Sin habitacion';
    const roomNumber = this.reservation.rooms_detail[0].room_number || String(this.reservation.rooms_detail[0].room);
    const normalized = String(roomNumber || '').trim();
    if (!normalized) return 'Sin habitacion';
    return /^hab\./i.test(normalized) ? normalized : `Hab. ${normalized}`;
  }

  get firstRoomCategoryLabel(): string {
    const firstRoom = this.reservation?.rooms_detail?.[0] as Record<string, unknown> | undefined;
    const roomTypeName = firstRoom?.['room_type_name'];
    if (typeof roomTypeName === 'string' && roomTypeName.trim()) {
      return roomTypeName.trim();
    }

    return 'Habitacion';
  }

  get canConfirm(): boolean {
    if (!this.reservation) return false;

    if (typeof this.reservation.can_confirm === 'boolean') {
      return this.reservation.can_confirm;
    }

    const statusCode = this.normalizeCode(this.reservation.status_code);
    return statusCode === 'PENDIENTE' && !this.reservation.real_check_in && !this.reservation.real_check_out;
  }

  get canCheckIn(): boolean {
    if (!this.reservation) return false;

    if (typeof this.reservation.can_check_in === 'boolean') {
      return this.reservation.can_check_in;
    }

    const statusCode = this.normalizeCode(this.reservation.status_code);
    return statusCode === 'CONFIRMADA' && !this.reservation.real_check_in && !this.reservation.real_check_out;
  }

  get canCheckOut(): boolean {
    if (!this.reservation) return false;

    if (typeof this.reservation.can_check_out === 'boolean') {
      return this.reservation.can_check_out;
    }

    const statusCode = this.normalizeCode(this.reservation.status_code);
    return (
      (statusCode === 'EN_CURSO' || !!this.reservation.real_check_in) &&
      !this.reservation.real_check_out
    );
  }

  get canCancel(): boolean {
    if (!this.reservation) return false;

    if (typeof this.reservation.can_cancel === 'boolean') {
      return this.reservation.can_cancel;
    }

    const statusCode = this.normalizeCode(this.reservation.status_code);
    return ['PENDIENTE', 'CONFIRMADA'].includes(statusCode) && !this.reservation.real_check_in && !this.reservation.real_check_out;
  }

  closeDrawer(): void {
    this.showGuestsModal = false;
    this.showPoliciesModal = false;
    this.resetCheckoutInventoryModalState();
    this.closed.emit();
  }

  openGuestsModal(): void {
    if (!this.hasGuests) return;
    this.showGuestsModal = true;
  }

  closeGuestsModal(): void {
    this.showGuestsModal = false;
  }

  openPoliciesModal(): void {
    if (!this.hasPolicies) return;
    this.showPoliciesModal = true;
  }

  closePoliciesModal(): void {
    this.showPoliciesModal = false;
  }

  requestEdit(): void {
    if (!this.reservation) return;
    this.editRequested.emit(this.reservation);
  }

  confirmReservation(): void {
    if (!this.reservation || this.actionLoading || !this.canConfirm) return;
    this.runFlowAction(this.reservationService.confirmReservation(this.reservation.id));
  }

  performCheckIn(): void {
    if (!this.reservation || this.actionLoading || !this.canCheckIn) return;
    this.runFlowAction(this.reservationService.checkInReservation(this.reservation.id));
  }

  performCheckOut(): void {
    if (!this.reservation || this.actionLoading || !this.canCheckOut) return;
    this.openCheckoutInventoryModal();
  }

  cancelReservation(): void {
    if (!this.reservation || this.actionLoading || !this.canCancel) return;
    this.runFlowAction(this.reservationService.cancelReservation(this.reservation.id));
  }

  runPrimaryAction(): void {
    if (this.actionLoading || !this.canRunPrimaryAction) return;

    switch (this.visualStatus) {
      case 'PENDIENTE':
        this.confirmReservation();
        break;
      case 'CONFIRMADA':
        this.performCheckIn();
        break;
      case 'EN_CURSO':
      case 'POR_SALIR_HOY':
        this.performCheckOut();
        break;
      default:
        break;
    }
  }

  openCheckoutInventoryModal(): void {
    if (!this.reservation || this.actionLoading || !this.canCheckOut) return;

    this.showCheckoutInventoryModal = true;
    this.checkoutInventoryError = '';
    this.checkoutInventoryLines = [];
    this.loadCheckoutInventoryLines();
  }

  closeCheckoutInventoryModal(): void {
    if (this.actionLoading) return;
    this.resetCheckoutInventoryModalState();
  }

  submitCheckOutWithInventoryReview(): void {
    if (!this.reservation || this.actionLoading || this.checkoutInventoryLoading) return;

    const payload = this.buildCheckOutPayload();
    this.runFlowAction(
      this.reservationService.checkOutReservation(this.reservation.id, payload),
      () => this.resetCheckoutInventoryModalState(),
      (message) => {
        this.checkoutInventoryError = message;
      }
    );
  }

  updateCheckoutInventoryQuantity(line: CheckoutInventoryLine, value: unknown): void {
    line.reviewedQuantity = this.toNonNegativeInt(value);
  }

  updateCheckoutInventoryNotes(line: CheckoutInventoryLine, value: unknown): void {
    line.notes = String(value || '');
  }

  getCheckoutDifference(line: CheckoutInventoryLine): number {
    return this.toNonNegativeInt(line.reviewedQuantity) - this.toNonNegativeInt(line.expectedQuantity);
  }

  getCheckoutDifferenceClass(line: CheckoutInventoryLine): string {
    const diff = this.getCheckoutDifference(line);
    if (diff === 0) return 'is-balanced';
    return diff < 0 ? 'is-missing' : 'is-extra';
  }

  getCheckoutDifferenceLabel(line: CheckoutInventoryLine): string {
    const diff = this.getCheckoutDifference(line);
    if (diff === 0) return 'Sin diferencia';
    if (diff < 0) return `Faltan ${Math.abs(diff)}`;
    return `Sobrante ${diff}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin registro';

    const parsed = this.parseDate(value);
    if (!parsed) return value;

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin registro';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getGuestDocumentLabel(guest: ReservationGuestI): string {
    const documentType = guest.document_type_code || guest.document_type_name || 'Doc';
    const documentNumber = guest.document_number || 'Sin numero';
    return `${documentType}: ${documentNumber}`;
  }

  getPolicyTypeLabel(policy: ReservationPolicyI): string {
    return policy.policy_type_name || policy.policy_type_code || 'Sin tipo';
  }

  getPenaltyTypeLabel(policy: ReservationPolicyI): string {
    return policy.penalty_type_name || policy.penalty_type_code || 'Sin penalidad';
  }

  formatPolicyPenalty(policy: ReservationPolicyI): string {
    const penaltyValue = Number(policy.penalty_value ?? 0);
    if (Number.isNaN(penaltyValue) || penaltyValue <= 0) return 'No definida';

    const penaltyCode = this.normalizeCode(policy.penalty_type_code);
    if (penaltyCode === 'PERCENTAGE') {
      return `${penaltyValue}%`;
    }

    return this.formatCurrency(penaltyValue);
  }

  getPolicyHoursLabel(policy: ReservationPolicyI): string {
    const hours = Number(policy.hours_before_checkin ?? 0);
    if (Number.isNaN(hours) || hours <= 0) return 'No definida';
    return `${hours} h antes del check-in`;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  trackByCheckoutInventoryLine(_: number, line: CheckoutInventoryLine): string {
    return line.key;
  }

  private loadCheckoutInventoryLines(): void {
    if (!this.reservation) {
      this.checkoutInventoryLoading = false;
      return;
    }

    const roomLabelById = this.buildReservationRoomLabelMap(this.reservation);
    const reservationRoomIds = new Set(roomLabelById.keys());
    if (reservationRoomIds.size === 0) {
      this.checkoutInventoryLoading = false;
      this.checkoutInventoryLines = [];
      return;
    }

    this.checkoutInventoryLoading = true;
    this.checkoutInventoryError = '';

    this.roomInventoryService.listRoomInventory().subscribe({
      next: (records) => {
        const lineByKey = new Map<string, CheckoutInventoryLine>();

        records.forEach((record) => {
          if (!record.is_active) return;

          const roomId = Number(record.room);
          const itemId = Number(record.item);
          if (!Number.isFinite(roomId) || roomId <= 0 || !Number.isFinite(itemId) || itemId <= 0) return;
          if (!reservationRoomIds.has(roomId)) return;

          const key = `${roomId}:${itemId}`;
          const roomLabel = roomLabelById.get(roomId) || `Hab. ${roomId}`;
          const itemLabel = this.resolveItemLabel(record, itemId);
          const quantity = this.toNonNegativeInt(record.quantity);
          const notes = this.toTrimmedString(record.notes);

          const existing = lineByKey.get(key);
          if (existing) {
            existing.expectedQuantity += quantity;
            existing.reviewedQuantity += quantity;
            if (!existing.notes && notes) existing.notes = notes;
            return;
          }

          lineByKey.set(key, {
            key,
            roomId,
            roomLabel,
            itemId,
            itemLabel,
            expectedQuantity: quantity,
            reviewedQuantity: quantity,
            notes
          });
        });

        this.checkoutInventoryLines = Array.from(lineByKey.values()).sort((a, b) => {
          const roomCompare = a.roomLabel.localeCompare(b.roomLabel, 'es-CO', {
            numeric: true,
            sensitivity: 'base'
          });
          if (roomCompare !== 0) return roomCompare;
          return a.itemLabel.localeCompare(b.itemLabel, 'es-CO', {
            numeric: true,
            sensitivity: 'base'
          });
        });

        this.checkoutInventoryLoading = false;
      },
      error: () => {
        this.checkoutInventoryLoading = false;
        this.checkoutInventoryError =
          'No fue posible cargar el inventario de las habitaciones. Puedes continuar sin diligenciar esta revision.';
      }
    });
  }

  private buildCheckOutPayload(): ReservationCheckOutPayloadI | Record<string, never> {
    const inventoryReviewLines: ReservationCheckoutInventoryReviewLinePayloadI[] = this.checkoutInventoryLines.map((line) => ({
      room: line.roomId,
      item: line.itemId,
      quantity: this.toNonNegativeInt(line.reviewedQuantity),
      notes: this.toTrimmedString(line.notes) || null
    }));

    if (inventoryReviewLines.length === 0) return {};
    return { inventory_review: inventoryReviewLines };
  }

  private buildReservationRoomLabelMap(reservation: ReservationDetailI): Map<number, string> {
    const map = new Map<number, string>();

    (reservation.rooms_detail || []).forEach((roomLine) => {
      const roomId = Number(roomLine.room);
      if (!Number.isFinite(roomId) || roomId <= 0) return;

      const roomNumber = this.toTrimmedString(roomLine.room_number);
      map.set(roomId, roomNumber ? `Hab. ${roomNumber}` : `Hab. ${roomId}`);
    });

    return map;
  }

  private resolveItemLabel(record: RoomInventoryI, itemId: number): string {
    const itemName = this.toTrimmedString(record.item_name);
    if (itemName) return itemName;

    const itemSku = this.toTrimmedString(record.item_sku);
    if (itemSku) return itemSku;

    return `Item #${itemId}`;
  }

  private resetCheckoutInventoryModalState(): void {
    this.showCheckoutInventoryModal = false;
    this.checkoutInventoryLoading = false;
    this.checkoutInventoryError = '';
    this.checkoutInventoryLines = [];
  }

  private clearInvoicePaymentStatus(): void {
    this.invoicePaymentStatusLabel = '';
    this.invoicePaymentStatusCode = '';
    this.invoiceStatusLoading = false;
  }

  private loadInvoicePaymentStatus(reservationId: number): void {
    if (!reservationId || !Number.isFinite(reservationId)) {
      this.clearInvoicePaymentStatus();
      return;
    }

    this.invoiceStatusLoading = true;
    this.invoicePaymentStatusLabel = '';
    this.invoicePaymentStatusCode = '';

    this.billingService
      .listInvoices({
        reservation: reservationId,
        is_active: true,
        ordering: '-id'
      })
      .subscribe({
        next: (invoices: InvoiceI[]) => {
          if (this.reservation?.id !== reservationId) return;

          const invoice = invoices[0] || null;
          this.invoicePaymentStatusLabel = this.toTrimmedString(invoice?.status_name || '');
          this.invoicePaymentStatusCode = this.toTrimmedString(invoice?.status_code || '');
          this.invoiceStatusLoading = false;
        },
        error: () => {
          if (this.reservation?.id !== reservationId) return;
          this.clearInvoicePaymentStatus();
        }
      });
  }

  private loadReservation(): void {
    if (!this.reservationId) {
      this.reservation = null;
      this.clearInvoicePaymentStatus();
      return;
    }

    if (this.preloaded && this.preloaded.id === this.reservationId) {
      this.reservation = this.preloaded;
      this.errorMessage = '';
      this.loadInvoicePaymentStatus(this.preloaded.id);
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.reservationService.getReservationById(this.reservationId).subscribe({
      next: (detail) => {
        this.loading = false;
        this.reservation = detail;
        this.loadInvoicePaymentStatus(detail.id);
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el detalle de la reserva.';
        this.clearInvoicePaymentStatus();
      }
    });
  }

  private runFlowAction(
    action$: Observable<ReservationDetailI>,
    onSuccess?: (detail: ReservationDetailI) => void,
    onError?: (message: string) => void
  ): void {
    this.actionLoading = true;
    this.errorMessage = '';

    action$.subscribe({
      next: (detail: ReservationDetailI) => {
        this.actionLoading = false;
        this.reservation = detail;
        this.loadInvoicePaymentStatus(detail.id);
        onSuccess?.(detail);
        this.flowChanged.emit(detail);
      },
      error: (error: unknown) => {
        this.actionLoading = false;
        const message = this.extractErrorMessage(error);
        this.errorMessage = message;
        onError?.(message);
      }
    });
  }

  private parseDate(value: string): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const asDateTime = new Date(value);
    if (Number.isNaN(asDateTime.getTime())) return null;
    return asDateTime;
  }

  private getVisualStatus(reservation: ReservationDetailI | null): ReservationVisualStatus {
    if (!reservation) return 'OTRA';

    const statusCode = this.normalizeCode(reservation.status_code);

    if (statusCode === 'CANCELADA') return 'CANCELADA';
    if (statusCode === 'FINALIZADA') return 'FINALIZADA';

    if (this.isCheckoutToday(reservation) && (statusCode === 'CONFIRMADA' || statusCode === 'EN_CURSO' || statusCode === 'PENDIENTE')) {
      return 'POR_SALIR_HOY';
    }

    if (statusCode === 'EN_CURSO') return 'EN_CURSO';
    if (statusCode === 'PENDIENTE') return 'PENDIENTE';
    if (statusCode === 'CONFIRMADA') return 'CONFIRMADA';

    return 'OTRA';
  }

  private isCheckoutToday(reservation: ReservationDetailI): boolean {
    const checkout = this.parseDate(reservation.expected_check_out);
    if (!checkout) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    checkout.setHours(0, 0, 0, 0);

    return checkout.getTime() === today.getTime();
  }

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }

  private toTrimmedString(value: unknown): string {
    return String(value || '').trim();
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private resolveStatusStyle(status: ReservationVisualStatus): ReservationStatusStyleI {
    switch (status) {
      case 'CONFIRMADA':
        return {
          label: 'Confirmada',
          chipBg: '#dbeafe',
          chipColor: '#1d4ed8',
          dotColor: '#3b82f6',
          borderColor: '#3b82f6',
          actionBg: '#1d4ed8',
          actionColor: '#ffffff'
        };
      case 'PENDIENTE':
        return {
          label: 'Pendiente',
          chipBg: '#fef3c7',
          chipColor: '#b45309',
          dotColor: '#f59e0b',
          borderColor: '#f59e0b',
          actionBg: '#b45309',
          actionColor: '#ffffff'
        };
      case 'EN_CURSO':
        return {
          label: 'En curso',
          chipBg: '#dcfce7',
          chipColor: '#15803d',
          dotColor: '#22c55e',
          borderColor: '#22c55e',
          actionBg: '#166534',
          actionColor: '#ffffff'
        };
      case 'POR_SALIR_HOY':
        return {
          label: 'Por salir hoy',
          chipBg: '#ffedd5',
          chipColor: '#c2410c',
          dotColor: '#f97316',
          borderColor: '#f97316',
          actionBg: '#ea580c',
          actionColor: '#ffffff'
        };
      case 'CANCELADA':
        return {
          label: 'Cancelada',
          chipBg: '#e5e7eb',
          chipColor: '#4b5563',
          dotColor: '#9ca3af',
          borderColor: '#9ca3af',
          actionBg: '#64748b',
          actionColor: '#ffffff'
        };
      case 'FINALIZADA':
        return {
          label: 'Finalizada',
          chipBg: '#e2e8f0',
          chipColor: '#334155',
          dotColor: '#64748b',
          borderColor: '#64748b',
          actionBg: '#334155',
          actionColor: '#ffffff'
        };
      default:
        return {
          label: 'Sin estado',
          chipBg: '#e2e8f0',
          chipColor: '#334155',
          dotColor: '#94a3b8',
          borderColor: '#94a3b8',
          actionBg: '#334155',
          actionColor: '#ffffff'
        };
    }
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No se pudo completar la accion sobre la reserva.';

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
