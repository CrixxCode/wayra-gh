import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { RoomService } from '../../../services/room';
import { ReservationService } from '../../../services/reservation';
import { MasterDataService } from '../../../services/master-data.service';
import { PaymentMethodI, PaymentMethodService } from '../../../services/payment-method';
import { ClientsService } from '../../../services/client';
import { PackagesService } from '../../../services/package';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { RoomInventoryService } from '../../../services/room-inventory';
import { ItemsService } from '../../../services/item';
import { BillingService } from '../../../services/billing';
import { errorActionAlert, successActionAlert } from '../../../services/action-alerts';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ClientI } from '../../clients/client-model';
import { CleaningTaskI } from '../../cleaning-tasks/cleaning-task-model';
import { MaintenanceOrderI } from '../../maintenance-orders/maintenance-order-model';
import { ItemI } from '../../items/item-model';
import { PackageI } from '../../packages/package-model';
import { RoomInventoryI } from '../../room-inventory/room-inventory-model';
import { ChargeI, InvoiceI } from '../../billing/billing-model';
import { CreateReservation } from '../../reservations/create-reservation/create-reservation';
import { RoomCheckModal, RoomCheckMode } from '../room-check-modal/room-check-modal';
import { ReservationDetailI, ReservationPolicyI } from '../../reservations/reservation-model';
import {
  AmenityI,
  HotelFloorI,
  RateI,
  RoomActiveReservationI,
  RoomI,
  RoomPanelI,
  RoomStatus,
  RoomVisualStatus,
  RoomTypeI
} from '../room-model';
import { extractApiErrorMessage } from '../api-error';

export type RoomModalTab =
  | 'general'
  | 'amenities'
  | 'rate'
  | 'reservation'
  | 'operations'
  | 'inventory';

const COMPLETED_STATUS_CODE = 'COMPLETADA';
const OPEN_CLEANING_CODES = ['PENDIENTE', 'EN_PROCESO'];
const OPEN_MAINTENANCE_CODES = ['PENDIENTE', 'EN_PROCESO'];
const DEFAULT_CLEANING_TYPE = 'GENERAL';
const DEFAULT_PENDING_STATUS = 'PENDIENTE';
const DEFAULT_MAINTENANCE_PRIORITY = 'MEDIA';

type ReservationConsumptionMode = 'item' | 'manual';
type ReceptionCartLine = {
  item: ItemI;
  quantity: number;
};

@Component({
  selector: 'app-room-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateReservation, RoomCheckModal],
  templateUrl: './room-modal.html',
  styleUrls: ['./room-modal.css']
})
export class RoomModal implements OnChanges, OnDestroy, OnInit {
  @Input({ required: true }) room!: RoomI;
  @Input() floors: HotelFloorI[] = [];
  @Input() roomTypes: RoomTypeI[] = [];
  @Input() amenities: AmenityI[] = [];
  @Input() rates: RateI[] = [];

  @Output() closed = new EventEmitter<void>();
  /** La habitacion cambio: la vista padre debe recargar el listado. */
  @Output() saved = new EventEmitter<RoomI>();
  /** Pide abrir el gestor de tarifas, opcionalmente enfocado en un tipo. */
  @Output() manageRates = new EventEmitter<number | null>();
  /** Pide abrir el gestor de tipos de habitacion. */
  @Output() manageRoomTypes = new EventEmitter<void>();

  readonly statusOptions: Array<{ value: RoomStatus; label: string }> = [
    { value: 'DISPONIBLE', label: 'Disponible' },
    { value: 'RESERVADA', label: 'Reservada' },
    { value: 'OCUPADA', label: 'Ocupada' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { value: 'LIMPIEZA', label: 'Limpieza' },
    { value: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio' }
  ];

  activeTab: RoomModalTab = 'general';

  loadingPanel = false;
  loadingOperations = false;
  loadingReservationCatalogs = false;
  loadingOperationCatalogs = false;
  saving = false;
  actionLoading = false;

  feedback = '';
  feedbackKind: 'error' | 'info' = 'info';

  panel: RoomPanelI | null = null;
  reservationDetail: ReservationDetailI | null = null;

  cleaningTasks: CleaningTaskI[] = [];
  maintenanceOrders: MaintenanceOrderI[] = [];
  inventory: RoomInventoryI[] = [];
  roomInventoryItems: ItemI[] = [];
  receptionItems: ItemI[] = [];
  reservationCharges: ChargeI[] = [];
  reservationInvoices: InvoiceI[] = [];
  clients: ClientI[] = [];
  origins: MasterDataI[] = [];
  documentTypes: MasterDataI[] = [];
  paymentMethods: PaymentMethodI[] = [];
  depositStatuses: MasterDataI[] = [];
  reservationPolicies: ReservationPolicyI[] = [];
  packages: PackageI[] = [];
  cleaningTaskTypes: MasterDataI[] = [];
  cleaningStatuses: MasterDataI[] = [];
  maintenancePriorities: MasterDataI[] = [];
  maintenanceStatuses: MasterDataI[] = [];

  showReservationCreator = false;
  showCheckModal = false;
  checkModalMode: RoomCheckMode = 'check-in';
  reservationCreatorCheckInMode = false;
  showConsumptionCreator = false;
  consumptionMode: ReservationConsumptionMode = 'item';
  showCleaningCreator = false;
  showMaintenanceCreator = false;
  inventorySearch = '';
  consumptionSearch = '';
  loadingReservationBilling = false;
  loadingReceptionItems = false;

  form = {
    number: '',
    floor: null as number | null,
    room_type: null as number | null,
    rate: null as number | null,
    status: 'DISPONIBLE' as RoomStatus,
    notes: ''
  };

  cleaningForm = {
    task_type: DEFAULT_CLEANING_TYPE as string | number,
    scheduled_for: '',
    notes: ''
  };

  maintenanceForm = {
    title: '',
    priority: DEFAULT_MAINTENANCE_PRIORITY as string | number,
    estimated_completed_at: '',
    description: ''
  };

  consumptionForm = {
    description: '',
    quantity: 1,
    unit_price: 0,
    paid_now: false,
    payment_method: null as number | null,
    reference: ''
  };
  receptionCart: ReceptionCartLine[] = [];

  selectedAmenityIds: number[] = [];

  private dirty = false;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  currentTime = new Date();

  constructor(
    private paymentMethodService: PaymentMethodService,
    private roomService: RoomService,
    private reservationService: ReservationService,
    private masterDataService: MasterDataService,
    private clientsService: ClientsService,
    private packagesService: PackagesService,
    private cleaningTasksService: CleaningTasksService,
    private maintenanceOrdersService: MaintenanceOrdersService,
    private roomInventoryService: RoomInventoryService,
    private itemsService: ItemsService,
    private billingService: BillingService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.resetFormFromRoom();
    this.resetOperationForms();
    this.activeTab = this.getDefaultTabForRoom();
    this.loadPanel();
    this.loadOperations();
    this.loadOperationCatalogs();
    this.countdownTimer = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['room'] || changes['room'].firstChange) return;
    if (this.saving || this.actionLoading) return;

    const previous = changes['room'].previousValue as RoomI | null | undefined;
    const current = changes['room'].currentValue as RoomI | null | undefined;
    if (!current) return;

    const previousRate = this.getRoomRateId(previous);
    const currentRate = this.getRoomRateId(current);
    const roomChanged = previous?.id !== current.id;
    const persistedRateChanged = previousRate !== currentRate;

    if (roomChanged || persistedRateChanged) {
      this.resetFormFromRoom();
      if (roomChanged) {
        this.resetOperationForms();
      }
    }

    if (roomChanged) {
      this.activeTab = this.getDefaultTabForRoom();
    }
  }

  // ---------------------------------------------------------------- getters

  get roomNumber(): string {
    return this.room?.number || '--';
  }

  get floorLabel(): string {
    const floor = this.floors.find((item) => item.id === this.room?.floor);
    if (floor) return `${floor.name} - Piso ${floor.floor_number}`;
    return this.room?.floor_name || 'Piso no asignado';
  }

  get statusLabel(): string {
    switch (this.visualStatus) {
      case 'DISPONIBLE':
        return 'Disponible';
      case 'RESERVADA':
        return 'Reservada';
      case 'OCUPADA':
        return 'Ocupada';
      case 'POR_SALIR_HOY':
        return 'Por salir hoy';
      case 'MANTENIMIENTO':
        return 'Mantenimiento';
      case 'LIMPIEZA':
        return 'Limpieza';
      case 'FUERA_DE_SERVICIO':
        return 'Fuera de servicio';
      case 'SIN_CONFIGURAR':
        return 'Sin configurar';
      default:
        return 'Sin estado';
    }
  }

  get statusChipClass(): string {
    switch (this.visualStatus) {
      case 'DISPONIBLE':
        return 'is-success';
      case 'OCUPADA':
      case 'RESERVADA':
        return 'is-info';
      case 'MANTENIMIENTO':
        return 'is-danger';
      case 'LIMPIEZA':
        return 'is-warn';
      default:
        return '';
    }
  }

  get statusHeaderClass(): string {
    switch (this.visualStatus) {
      case 'DISPONIBLE':
        return 'room-head-available';
      case 'RESERVADA':
        return 'room-head-reserved';
      case 'OCUPADA':
        return 'room-head-occupied';
      case 'LIMPIEZA':
        return 'room-head-cleaning';
      case 'MANTENIMIENTO':
        return 'room-head-maintenance';
      case 'FUERA_DE_SERVICIO':
        return 'room-head-out';
      default:
        return 'room-head-neutral';
    }
  }

  get visualStatus(): RoomVisualStatus {
    if (['MANTENIMIENTO', 'LIMPIEZA', 'FUERA_DE_SERVICIO'].includes(this.room?.status || '')) {
      return this.room.status;
    }

    const reservation = this.activeReservation;
    const reservationStatus = this.codeOf(reservation?.status);

    if (reservation) {
      if (
        reservation.real_check_in ||
        ['EN_CURSO', 'CHECKED_IN', 'IN_PROGRESS', 'HOSPEDADO', 'OCUPADA'].includes(
          reservationStatus
        )
      ) {
        if (this.isToday(reservation.expected_check_out)) return 'POR_SALIR_HOY';
        return 'OCUPADA';
      }

      if (
        ['PENDIENTE', 'CONFIRMADA', 'CONFIRMADO', 'CONFIRMED', 'PENDING'].includes(
          reservationStatus
        )
      ) {
        return 'RESERVADA';
      }
    }

    if (!this.room?.room_type || !this.getRoomRateId(this.room)) return 'SIN_CONFIGURAR';
    return this.room?.status || 'DISPONIBLE';
  }

  get activeReservation(): RoomActiveReservationI | null {
    return this.panel?.active_reservation || this.room?.active_reservation || null;
  }

  get selectedRoomType(): RoomTypeI | null {
    const id = this.form.room_type ?? this.room?.room_type;
    if (typeof id !== 'number') return null;
    return this.roomTypes.find((item) => item.id === id) || null;
  }

  get availableRates(): RateI[] {
    const roomTypeId = this.selectedRoomType?.id;
    if (typeof roomTypeId !== 'number') return [];

    return this.rates
      .filter((rate) => rate.room_type === roomTypeId && rate.is_active !== false)
      .sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'es', { numeric: true, sensitivity: 'base' })
      );
  }

  get selectedRate(): RateI | null {
    const rateId = this.form.rate ?? this.room?.rate ?? null;
    if (typeof rateId !== 'number') return null;
    return (
      this.rates.find(
        (rate) => rate.id === rateId && rate.room_type === this.selectedRoomType?.id
      ) || null
    );
  }

  get rateLabel(): string {
    const rate = this.selectedRate;
    if (!rate) return 'Sin tarifa seleccionada';

    const asNumber = Number(rate.price);
    if (Number.isNaN(asNumber)) return String(rate.price);

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  get openCleaningCount(): number {
    return this.cleaningTasks.filter((task) => OPEN_CLEANING_CODES.includes(this.codeOf(task.status)))
      .length;
  }

  get openMaintenanceCount(): number {
    return this.maintenanceOrders.filter((order) =>
      OPEN_MAINTENANCE_CODES.includes(this.codeOf(order.status))
    ).length;
  }

  get lowStockCount(): number {
    return this.inventory.filter((record) => record.is_active && this.isBelowMinimum(record)).length;
  }

  get activeInventoryCount(): number {
    return this.inventory.filter((record) => record.is_active).length;
  }

  get activeReservationId(): number | null {
    const id = Number(this.activeReservation?.id || 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  get activeReservationCharges(): ChargeI[] {
    return this.reservationCharges.filter((charge) => charge.is_active !== false);
  }

  get reservationChargesTotal(): number {
    return this.activeReservationCharges.reduce(
      (sum, charge) => sum + this.toNumber(charge.total_amount),
      0
    );
  }

  get reservationPendingTotal(): number {
    return this.toNumber(this.reservationDetail?.pending_amount);
  }

  get filteredReceptionItems(): ItemI[] {
    const query = this.normalizeInventorySearch(this.consumptionSearch);
    return this.receptionItems
      .filter((item) => this.isReceptionPurposeItem(item))
      .filter((item) => {
        if (!query) return true;
        return this.normalizeInventorySearch(
          [item.name, item.sku, item.item_type_name, item.item_type_code].join(' ')
        ).includes(query);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
  }

  get consumptionTotal(): number {
    if (this.consumptionMode === 'item') {
      return this.receptionCart.reduce(
        (sum, line) => sum + this.toPositiveInt(line.quantity, 1) * this.toNumber(line.item.sale_price),
        0
      );
    }

    return this.toPositiveInt(this.consumptionForm.quantity, 1) * this.toNumber(this.consumptionForm.unit_price);
  }

  get canCreateConsumption(): boolean {
    if (this.actionLoading || !this.activeReservationId) return false;
    if (this.consumptionForm.paid_now && !this.consumptionForm.payment_method) return false;
    if (this.consumptionMode === 'item') {
      return this.receptionCart.length > 0 && this.consumptionTotal > 0;
    }
    return this.consumptionForm.description.trim().length > 0 && this.consumptionTotal >= 0;
  }

  get filteredRoomInventoryItems(): ItemI[] {
    const search = this.normalizeInventorySearch(this.inventorySearch);
    const roomItems = this.roomInventoryItems.filter((item) => this.isRoomPurposeItem(item));
    const filtered = search
      ? roomItems.filter((item) =>
          this.normalizeInventorySearch(
            [
              item.name,
              item.sku,
              item.description,
              item.item_type_name,
              item.item_type_code,
              item.unit_measure_name,
              item.unit_measure_code,
            ].join(' ')
          ).includes(search)
        )
      : roomItems;

    return [...filtered].sort((a, b) => {
      const categoryDiff = this.getItemCategoryLabel(a).localeCompare(
        this.getItemCategoryLabel(b),
        'es',
        { sensitivity: 'base' }
      );
      if (categoryDiff !== 0) return categoryDiff;
      return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });
  }

  isBelowMinimum(record: RoomInventoryI): boolean {
    return Number(record.quantity) < Number(record.minimum_quantity);
  }

  get canConfirmReservation(): boolean {
    const status = this.codeOf(this.activeReservation?.status);
    return (
      status === 'PENDIENTE' &&
      !this.activeReservation?.real_check_in &&
      !this.activeReservation?.real_check_out
    );
  }

  get canCheckIn(): boolean {
    const status = this.codeOf(this.activeReservation?.status);
    return (
      status === 'CONFIRMADA' &&
      !this.activeReservation?.real_check_in &&
      !this.activeReservation?.real_check_out
    );
  }

  get canCheckOut(): boolean {
    if (!this.activeReservation) return false;
    const status = this.codeOf(this.activeReservation.status);
    return (
      (status === 'EN_CURSO' || !!this.activeReservation.real_check_in) &&
      !this.activeReservation.real_check_out
    );
  }

  get canMarkAvailable(): boolean {
    return ['MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'LIMPIEZA'].includes(this.room?.status || '');
  }

  get checkoutCountdownLabel(): string {
    const target = this.checkoutTarget;
    if (!target) return 'Sin salida programada';

    const diffMs = target.getTime() - this.currentTime.getTime();
    if (diffMs <= 0) return 'Salida vencida';

    const totalMinutes = Math.ceil(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      const hourText = hours > 0 ? ` ${hours} h` : '';
      return `Quedan ${days} d${hourText}`;
    }

    if (hours > 0) {
      const minuteText = minutes > 0 ? ` ${minutes} min` : '';
      return `Quedan ${hours} h${minuteText}`;
    }

    return `Quedan ${minutes} min`;
  }

  get checkoutCountdownClass(): string {
    const target = this.checkoutTarget;
    if (!target) return '';

    const diffMs = target.getTime() - this.currentTime.getTime();
    if (diffMs <= 0) return 'is-expired';
    if (diffMs <= 2 * 60 * 60 * 1000) return 'is-urgent';
    if (diffMs <= 6 * 60 * 60 * 1000) return 'is-soon';
    return '';
  }

  get checkoutTargetLabel(): string {
    const target = this.checkoutTarget;
    if (!target) return '--';
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
      .format(target)
      .replace('.', '');
  }

  private get checkoutTarget(): Date | null {
    const checkOut = this.activeReservation?.expected_check_out;
    if (!checkOut) return null;

    const date = this.parseDate(checkOut);
    if (!date) return null;

    const [hours, minutes] = this.parseTime(
      this.activeReservation?.expected_check_out_time || '12:00'
    );
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  get isDirtyGeneral(): boolean {
    return (
      this.form.number.trim() !== (this.room?.number || '') ||
      this.form.floor !== this.room?.floor ||
      (this.form.room_type ?? null) !== (this.room?.room_type ?? null) ||
      (this.form.rate ?? null) !== (this.room?.rate ?? null) ||
      this.form.status !== this.room?.status ||
      this.form.notes.trim() !== (this.room?.notes || '')
    );
  }

  get isDirtyAmenities(): boolean {
    const current = (this.room?.amenities || []).map((item) => item.id).sort();
    const next = [...this.selectedAmenityIds].sort();
    return current.length !== next.length || current.some((id, index) => id !== next[index]);
  }

  // ------------------------------------------------------------------ carga

  loadPanel(): void {
    if (!this.room?.id) return;

    this.loadingPanel = true;
    this.roomService.getRoomPanel(this.room.id).subscribe({
      next: (panel) => {
        this.loadingPanel = false;
        this.panel = panel;
        this.loadReservationDetail();
      },
      error: () => {
        this.loadingPanel = false;
        this.setFeedback('No se pudo cargar el detalle de la habitacion.', 'error');
      }
    });
  }

  loadOperations(): void {
    if (!this.room?.id) return;
    const roomId = this.room.id;

    this.loadingOperations = true;
    forkJoin({
      cleaning: this.cleaningTasksService
        .listCleaningTasks()
        .pipe(catchError(() => of([] as CleaningTaskI[]))),
      maintenance: this.maintenanceOrdersService
        .listMaintenanceOrders()
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      inventory: this.roomInventoryService
        .listRoomInventory({ include_inactive: true })
        .pipe(catchError(() => of([] as RoomInventoryI[]))),
      items: this.itemsService
        .listItems({ include_inactive: false, item_purpose: 'ROOM', ordering: 'name' })
        .pipe(catchError(() => of([] as ItemI[])))
    }).subscribe({
      next: ({ cleaning, maintenance, inventory, items }) => {
        this.loadingOperations = false;
        this.cleaningTasks = cleaning.filter((task) => task.room === roomId);
        this.maintenanceOrders = maintenance.filter((order) => order.room === roomId);
        this.inventory = inventory.filter((record) => record.room === roomId);
        this.roomInventoryItems = items.filter((item) => this.isRoomPurposeItem(item));
      },
      error: () => {
        this.loadingOperations = false;
      }
    });
  }

  loadOperationCatalogs(): void {
    if (this.loadingOperationCatalogs) return;
    if (
      this.cleaningTaskTypes.length &&
      this.cleaningStatuses.length &&
      this.maintenancePriorities.length &&
      this.maintenanceStatuses.length
    ) {
      return;
    }

    this.loadingOperationCatalogs = true;
    forkJoin({
      cleaningTaskTypes: this.masterDataService
        .listMasterData({ group: 'CLEANING_TASK_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      cleaningStatuses: this.masterDataService
        .listMasterData({ group: 'CLEANING_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      maintenancePriorities: this.masterDataService
        .listMasterData({ group: 'MAINTENANCE_PRIORITY', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      maintenanceStatuses: this.masterDataService
        .listMasterData({ group: 'MAINTENANCE_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ cleaningTaskTypes, cleaningStatuses, maintenancePriorities, maintenanceStatuses }) => {
        this.loadingOperationCatalogs = false;
        this.cleaningTaskTypes = this.dedupeMasterDataByCode(cleaningTaskTypes);
        this.cleaningStatuses = this.dedupeMasterDataByCode(cleaningStatuses);
        this.maintenancePriorities = this.dedupeMasterDataByCode(maintenancePriorities);
        this.maintenanceStatuses = this.dedupeMasterDataByCode(maintenanceStatuses);
        this.applyOperationDefaults();
      },
      error: () => {
        this.loadingOperationCatalogs = false;
      }
    });
  }

  private loadReservationDetail(): void {
    const reservationId = this.activeReservation?.id;
    if (!reservationId) {
      this.reservationDetail = null;
      this.reservationCharges = [];
      this.reservationInvoices = [];
      return;
    }

    this.reservationService.getReservationById(reservationId).subscribe({
      next: (detail) => {
        this.reservationDetail = detail;
        this.loadReservationBilling(reservationId);
      },
      error: () => {
        this.reservationDetail = null;
        this.reservationCharges = [];
        this.reservationInvoices = [];
      }
    });
  }

  // --------------------------------------------------------------- pestanas

  selectTab(tab: RoomModalTab): void {
    this.activeTab = tab;
    this.feedback = '';
  }

  // ------------------------------------------------------------ tab general

  resetFormFromRoom(): void {
    this.form = {
      number: this.room?.number || '',
      floor: this.room?.floor ?? null,
      room_type: this.room?.room_type ?? null,
      rate: this.getRoomRateId(this.room),
      status: (this.room?.status || 'DISPONIBLE') as RoomStatus,
      notes: this.room?.notes || ''
    };
    this.selectedAmenityIds = (this.room?.amenities || []).map((item) => item.id);
  }

  saveGeneral(): void {
    if (this.saving) return;

    const number = this.form.number.trim();
    if (!number) {
      this.setFeedback('El numero de la habitacion es obligatorio.', 'error');
      return;
    }

    if (!this.form.floor) {
      this.setFeedback('La habitacion debe pertenecer a un piso.', 'error');
      return;
    }

    this.persist({
      number,
      floor: Number(this.form.floor),
      room_type: this.form.room_type ? Number(this.form.room_type) : null,
      rate: this.form.rate ? Number(this.form.rate) : null,
      status: this.form.status,
      notes: this.form.notes.trim(),
      amenity_ids: this.selectedAmenityIds
    });
  }

  onRoomTypeChange(): void {
    const selected = this.rates.find((rate) => rate.id === this.form.rate);
    if (!selected || selected.room_type !== this.form.room_type) {
      this.form.rate = null;
    }
  }

  selectRoomType(roomTypeId: number): void {
    this.form.room_type = roomTypeId;
    this.onRoomTypeChange();
  }

  selectRate(rateId: number): void {
    this.form.rate = rateId;
  }

  clearRate(): void {
    this.form.rate = null;
  }

  saveRate(): void {
    if (this.saving || !this.room?.floor) return;

    this.saving = true;
    const roomType = this.form.room_type ? Number(this.form.room_type) : null;
    const rate = this.form.rate ? Number(this.form.rate) : null;
    this.roomService.updateRoom(this.room.id, {
      number: this.room.number,
      floor: this.room.floor,
      room_type: roomType,
      rate,
      status: this.room.status,
      notes: this.room.notes || '',
      amenity_ids: (this.room.amenities || []).map((item) => item.id)
    }).subscribe({
      next: (updated) => {
        const persistedRate = this.getRoomRateId(updated) ?? rate;
        const selectedRate = this.rates.find((item) => item.id === persistedRate) || null;

        this.saving = false;
        this.dirty = true;
        this.room = {
          ...this.room,
          ...updated,
          room_type: updated.room_type ?? roomType,
          rate: persistedRate,
          rate_name: updated.rate_name ?? selectedRate?.name ?? null,
          rate_price: updated.rate_price ?? selectedRate?.price ?? null,
        };
        this.resetFormFromRoom();
        this.setFeedback(successActionAlert('update', `habitacion ${this.roomNumber}`), 'info');
        this.loadPanel();
        this.saved.emit(this.room);
      },
      error: (error) => {
        this.saving = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'tarifa de habitacion')),
          'error'
        );
      }
    });
  }

  // ---------------------------------------------------------- tab amenities

  toggleAmenity(amenityId: number, checked: boolean): void {
    this.selectedAmenityIds = checked
      ? Array.from(new Set([...this.selectedAmenityIds, amenityId]))
      : this.selectedAmenityIds.filter((id) => id !== amenityId);
  }

  isAmenitySelected(amenityId: number): boolean {
    return this.selectedAmenityIds.includes(amenityId);
  }

  saveAmenities(): void {
    if (this.saving) return;
    if (!this.room?.floor) return;

    this.persist({
      number: this.room.number,
      floor: this.room.floor,
      room_type: this.room.room_type ?? null,
      rate: this.room.rate ?? null,
      status: this.room.status,
      notes: this.room.notes || '',
      amenity_ids: this.selectedAmenityIds
    });
  }

  // -------------------------------------------------------- tab reservacion

  confirmReservation(): void {
    const id = this.activeReservation?.id;
    if (!id || !this.canConfirmReservation) return;
    this.runReservationAction(this.reservationService.confirmReservation(id));
  }

  /**
   * El ingreso y la salida pasan por el modal de verificacion, igual que desde la
   * tarjeta: si aqui se ejecutaran directo, bastaria con abrir la habitacion para
   * saltarse el control de documentos y de saldo.
   */
  checkIn(): void {
    if (!this.activeReservation?.id || !this.canCheckIn) return;
    this.checkModalMode = 'check-in';
    this.showCheckModal = true;
  }

  checkOut(): void {
    if (!this.activeReservation?.id || !this.canCheckOut) return;
    this.checkModalMode = 'check-out';
    this.showCheckModal = true;
  }

  closeCheckModal(): void {
    this.showCheckModal = false;
  }

  onCheckConfirmed(): void {
    const wasCheckOut = this.checkModalMode === 'check-out';
    this.showCheckModal = false;
    this.dirty = true;
    this.actionLoading = true;
    this.refreshRoomAfterReservationAction(wasCheckOut);
  }

  openReservationCreator(mode: 'reserve' | 'checkin'): void {
    if (!this.room?.id) return;

    if (!this.form.room_type || !this.form.rate) {
      this.setFeedback(
        'Antes de reservar, asigna un tipo y una tarifa a esta habitacion.',
        'error'
      );
      this.activeTab = 'rate';
      return;
    }

    this.reservationCreatorCheckInMode = mode === 'checkin';
    this.showReservationCreator = true;
    this.loadReservationCatalogs();
  }

  closeReservationCreator(): void {
    this.showReservationCreator = false;
    this.reservationCreatorCheckInMode = false;
  }

  onReservationCreatedFromRoom(): void {
    this.showReservationCreator = false;
    this.reservationCreatorCheckInMode = false;
    this.dirty = true;
    this.setFeedback(successActionAlert('create', 'reserva'), 'info');
    this.loadPanel();
    this.saved.emit(this.room);
  }

  openConsumptionCreator(mode: ReservationConsumptionMode = 'item'): void {
    if (!this.activeReservationId || this.actionLoading) return;
    this.consumptionMode = mode;
    this.resetConsumptionForm();
    this.showConsumptionCreator = true;
    this.loadReceptionItems();
    this.loadReservationCatalogs();
  }

  closeConsumptionCreator(): void {
    if (this.actionLoading) return;
    this.showConsumptionCreator = false;
  }

  setConsumptionMode(mode: ReservationConsumptionMode): void {
    if (this.actionLoading) return;
    this.consumptionMode = mode;
    this.consumptionForm.description = '';
    this.consumptionForm.quantity = 1;
    this.consumptionForm.unit_price = 0;
    this.consumptionSearch = '';
    this.receptionCart = [];
  }

  selectReceptionItem(item: ItemI): void {
    if (this.actionLoading) return;
    const current = this.receptionCart.find((line) => line.item.id === item.id);
    if (current) {
      this.increaseReceptionItem(current);
      return;
    }
    if (this.getReceptionItemAvailable(item) <= 0) return;
    this.receptionCart = [...this.receptionCart, { item, quantity: 1 }];
  }

  increaseReceptionItem(line: ReceptionCartLine): void {
    if (this.actionLoading) return;
    const available = this.toNonNegativeInt(line.item.stock);
    if (line.quantity >= available) return;
    line.quantity += 1;
  }

  decreaseReceptionItem(line: ReceptionCartLine): void {
    if (this.actionLoading) return;
    if (line.quantity <= 1) {
      this.removeReceptionItem(line);
      return;
    }
    line.quantity -= 1;
  }

  updateReceptionItemQuantity(line: ReceptionCartLine, value: unknown): void {
    if (this.actionLoading) return;
    const available = this.toNonNegativeInt(line.item.stock);
    const quantity = Math.min(available, this.toPositiveInt(value, 1));
    if (quantity <= 0) {
      this.removeReceptionItem(line);
      return;
    }
    line.quantity = quantity;
  }

  removeReceptionItem(line: ReceptionCartLine): void {
    if (this.actionLoading) return;
    this.receptionCart = this.receptionCart.filter((current) => current.item.id !== line.item.id);
  }

  getReceptionCartQuantity(itemId: number): number {
    return this.receptionCart.find((line) => line.item.id === itemId)?.quantity || 0;
  }

  getReceptionItemAvailable(item: ItemI): number {
    return Math.max(0, this.toNonNegativeInt(item.stock) - this.getReceptionCartQuantity(item.id));
  }

  getReceptionLineTotal(line: ReceptionCartLine): number {
    return this.toPositiveInt(line.quantity, 1) * this.toNumber(line.item.sale_price);
  }

  trackByReceptionLine(_: number, line: ReceptionCartLine): number {
    return line.item.id;
  }

  submitConsumption(): void {
    if (!this.canCreateConsumption || !this.activeReservationId) return;

    const reservationId = this.activeReservationId;
    this.actionLoading = true;
    this.feedback = '';

    if (this.consumptionMode === 'item') {
      if (!this.receptionCart.length) {
        this.actionLoading = false;
        this.setFeedback('Agrega al menos un producto de recepcion al consumo.', 'error');
        return;
      }

      this.billingService
        .createPosChargeBatch({
          reservation: reservationId,
          reference: `ROOM-${this.roomNumber}-${reservationId}-${Date.now()}`,
          charge_type_code: 'BAR',
          lines: this.receptionCart.map((line) => ({
            item: line.item.id,
            quantity: this.toPositiveInt(line.quantity, 1),
            description: `Consumo recepcion: ${line.item.name}`
          }))
        })
        .subscribe({
          next: (response) => {
            this.afterConsumptionCreated(
              this.toNumber(response.total_amount),
              response.reference,
              'consumo de recepcion'
            );
          },
          error: (error) => this.handleConsumptionError(error)
        });
      return;
    }

    this.billingService
      .createCharge({
        reservation: reservationId,
        charge_type: null,
        description: this.consumptionForm.description.trim(),
        quantity: this.toPositiveInt(this.consumptionForm.quantity, 1),
        unit_price: this.toNumber(this.consumptionForm.unit_price),
        is_active: true
      })
      .subscribe({
        next: (charge) => {
          this.afterConsumptionCreated(
            this.toNumber(charge.total_amount),
            `CHARGE-${charge.id}`,
            'cargo de habitacion'
          );
        },
        error: (error) => this.handleConsumptionError(error)
      });
  }

  markAvailable(): void {
    if (!this.room?.floor || !this.canMarkAvailable) return;

    this.persist({
      number: this.room.number,
      floor: this.room.floor,
      room_type: this.room.room_type ?? null,
      rate: this.room.rate ?? null,
      status: 'DISPONIBLE',
      notes: this.room.notes || '',
      amenity_ids: (this.room.amenities || []).map((item) => item.id)
    });
  }

  openReservationsModule(action: 'detail' | 'edit' | 'create' | 'checkin'): void {
    const queryParams: Record<string, string | number> = { action };

    if (action === 'create' || action === 'checkin') {
      if (!this.room?.id) return;
      queryParams['roomId'] = this.room.id;
    } else {
      const reservationId = this.activeReservation?.id;
      if (!reservationId) return;
      queryParams['reservationId'] = reservationId;
    }

    this.emitCloseState();
    void this.router.navigate(['/reservas'], { queryParams });
  }

  // -------------------------------------------------------- tab operaciones

  createCleaningTask(): void {
    if (this.actionLoading || !this.room?.id) return;

    this.actionLoading = true;
    this.cleaningTasksService
      .createCleaningTask({
        room: this.room.id,
        task_type: this.cleaningForm.task_type || DEFAULT_CLEANING_TYPE,
        status: this.defaultCleaningStatus,
        scheduled_for: this.cleaningForm.scheduled_for || this.todayInputValue(),
        notes: this.cleaningForm.notes
      })
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.dirty = true;
          this.resetCleaningForm();
          this.showCleaningCreator = false;
          this.setFeedback(successActionAlert('create', 'tarea de limpieza'), 'info');
          this.refreshRoomAfterOperationChange();
        },
        error: (error) => {
          this.actionLoading = false;
          this.setFeedback(
            extractApiErrorMessage(error, errorActionAlert('create', 'tarea de limpieza')),
            'error'
          );
        }
      });
  }

  createMaintenanceOrder(): void {
    if (this.actionLoading || !this.room?.id) return;

    const title = this.maintenanceForm.title.trim();
    if (!title) {
      this.setFeedback('El titulo de la orden de mantenimiento es obligatorio.', 'error');
      return;
    }

    this.actionLoading = true;
    this.maintenanceOrdersService
      .createMaintenanceOrder({
        room: this.room.id,
        title,
        description: this.maintenanceForm.description,
        priority: this.maintenanceForm.priority || DEFAULT_MAINTENANCE_PRIORITY,
        status: this.defaultMaintenanceStatus,
        estimated_completed_at: this.toDateTimeValue(this.maintenanceForm.estimated_completed_at),
        completed_at: null
      })
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.dirty = true;
          this.resetMaintenanceForm();
          this.showMaintenanceCreator = false;
          this.setFeedback(successActionAlert('create', 'orden de mantenimiento'), 'info');
          this.refreshRoomAfterOperationChange();
        },
        error: (error) => {
          this.actionLoading = false;
          this.setFeedback(
            extractApiErrorMessage(error, errorActionAlert('create', 'orden de mantenimiento')),
            'error'
          );
        }
      });
  }

  completeCleaningTask(task: CleaningTaskI): void {
    if (this.actionLoading) return;

    openActionConfirmation(this.confirmationService, {
      action: 'save',
      target: `tarea de limpieza de la habitacion ${this.roomNumber}`,
      onAccept: () => {
        this.actionLoading = true;
        this.cleaningTasksService
          .updateCleaningTask(task.id, { status: COMPLETED_STATUS_CODE })
          .subscribe({
            next: () => {
              this.actionLoading = false;
              this.dirty = true;
              this.setFeedback(successActionAlert('update', 'tarea de limpieza'), 'info');
              this.loadOperations();
              this.loadPanel();
              this.saved.emit(this.room);
            },
            error: (error) => {
              this.actionLoading = false;
              this.setFeedback(
                extractApiErrorMessage(error, errorActionAlert('update', 'tarea de limpieza')),
                'error'
              );
            }
          });
      }
    });
  }

  completeMaintenanceOrder(order: MaintenanceOrderI): void {
    if (this.actionLoading) return;

    openActionConfirmation(this.confirmationService, {
      action: 'save',
      target: `orden de mantenimiento "${order.title}"`,
      onAccept: () => {
        this.actionLoading = true;
        this.maintenanceOrdersService
          .updateMaintenanceOrder(order.id, { status: COMPLETED_STATUS_CODE })
          .subscribe({
            next: () => {
              this.actionLoading = false;
              this.dirty = true;
              this.setFeedback(successActionAlert('update', 'orden de mantenimiento'), 'info');
              this.loadOperations();
              this.loadPanel();
              this.saved.emit(this.room);
            },
            error: (error) => {
              this.actionLoading = false;
              this.setFeedback(
                extractApiErrorMessage(error, errorActionAlert('update', 'orden de mantenimiento')),
                'error'
              );
            }
          });
      }
    });
  }

  goToOperationsModule(target: 'cleaning' | 'maintenance'): void {
    this.emitCloseState();
    void this.router.navigate([target === 'cleaning' ? '/tareas-limpieza' : '/ordenes-mantenimiento']);
  }

  openCleaningCreator(): void {
    if (this.actionLoading) return;
    this.resetCleaningForm();
    this.showCleaningCreator = true;
  }

  closeCleaningCreator(): void {
    if (this.actionLoading) return;
    this.showCleaningCreator = false;
  }

  openMaintenanceCreator(): void {
    if (this.actionLoading) return;
    this.resetMaintenanceForm();
    this.showMaintenanceCreator = true;
  }

  closeMaintenanceCreator(): void {
    if (this.actionLoading) return;
    this.showMaintenanceCreator = false;
  }

  // --------------------------------------------------------- tab inventario

  adjustInventory(record: RoomInventoryI, delta: number): void {
    if (this.actionLoading) return;

    const nextQuantity = Math.max(0, (Number(record.quantity) || 0) + delta);
    if (nextQuantity === record.quantity) return;

    this.actionLoading = true;
    this.roomInventoryService.updateRoomInventory(record.id, { quantity: nextQuantity }).subscribe({
      next: (updated) => {
        this.actionLoading = false;
        record.quantity = updated?.quantity ?? nextQuantity;
      },
      error: (error) => {
        this.actionLoading = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'inventario de habitacion')),
          'error'
        );
      }
    });
  }

  getInventoryRecordForItem(itemId: number): RoomInventoryI | null {
    return this.inventory.find((record) => record.item === itemId) || null;
  }

  isInventoryItemSelected(itemId: number): boolean {
    return !!this.getInventoryRecordForItem(itemId)?.is_active;
  }

  getInventoryQuantityForItem(itemId: number): number {
    return this.getInventoryRecordForItem(itemId)?.quantity ?? 0;
  }

  getInventoryMinimumForItem(itemId: number): number {
    return this.getInventoryRecordForItem(itemId)?.minimum_quantity ?? 0;
  }

  toggleRoomInventoryItem(item: ItemI, checked: boolean): void {
    if (this.actionLoading || !this.room?.id) return;

    const record = this.getInventoryRecordForItem(item.id);

    this.actionLoading = true;
    const request$ = record
      ? this.roomInventoryService.updateRoomInventory(record.id, {
          is_active: checked,
          quantity: checked ? Math.max(1, Number(record.quantity) || 0) : Number(record.quantity) || 0,
          minimum_quantity: Number(record.minimum_quantity) || 0,
        })
      : this.roomInventoryService.createRoomInventory({
          room: this.room.id,
          item: item.id,
          quantity: 1,
          minimum_quantity: 0,
          notes: '',
          is_active: true,
        });

    request$.subscribe({
      next: (updated) => {
        this.actionLoading = false;
        this.upsertInventoryRecord(updated);
        this.dirty = true;
      },
      error: (error) => {
        this.actionLoading = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'inventario de habitacion')),
          'error'
        );
      }
    });
  }

  updateRoomInventoryAmount(
    item: ItemI,
    field: 'quantity' | 'minimum_quantity',
    value: unknown
  ): void {
    if (this.actionLoading) return;

    const record = this.getInventoryRecordForItem(item.id);
    if (!record?.is_active) return;

    const nextValue = this.toNonNegativeInt(value);
    if (Number(record[field]) === nextValue) return;

    this.actionLoading = true;
    this.roomInventoryService.updateRoomInventory(record.id, { [field]: nextValue }).subscribe({
      next: (updated) => {
        this.actionLoading = false;
        this.upsertInventoryRecord(updated);
        this.dirty = true;
      },
      error: (error) => {
        this.actionLoading = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'inventario de habitacion')),
          'error'
        );
      }
    });
  }

  getRoomInventoryItemState(item: ItemI): string {
    const record = this.getInventoryRecordForItem(item.id);
    if (!record?.is_active) return 'No asignado';
    return this.isBelowMinimum(record) ? 'Bajo minimo' : 'Asignado';
  }

  getRoomInventoryItemStateClass(item: ItemI): string {
    const record = this.getInventoryRecordForItem(item.id);
    if (!record?.is_active) return '';
    return this.isBelowMinimum(record) ? 'is-danger' : 'is-success';
  }

  getItemStockLabel(item: ItemI): string {
    const unit = item.unit_measure_name || item.unit_measure_code || 'unid.';
    return `${this.toNonNegativeInt(item.stock)} ${unit}`;
  }

  getReceptionItemStockLabel(item: ItemI): string {
    const unit = item.unit_measure_name || item.unit_measure_code || 'unid.';
    return `${this.toNonNegativeInt(item.stock)} ${unit}`;
  }

  getItemCategoryLabel(item: ItemI): string {
    return item.item_type_name || item.item_type_code || 'Sin categoria';
  }

  getChargeDateLabel(charge: ChargeI): string {
    return this.formatDateTime(charge.charge_date || null);
  }

  shouldShowInventoryCategoryHead(item: ItemI, index: number): boolean {
    if (index <= 0) return true;
    const previous = this.filteredRoomInventoryItems[index - 1];
    return this.getItemCategoryKey(previous) !== this.getItemCategoryKey(item);
  }

  getCategoryInventoryCount(item: ItemI): number {
    const key = this.getItemCategoryKey(item);
    return this.filteredRoomInventoryItems.filter((current) => this.getItemCategoryKey(current) === key)
      .length;
  }

  clearInventorySearch(): void {
    this.inventorySearch = '';
  }

  goToInventoryModule(): void {
    this.emitCloseState();
    void this.router.navigate(['/inventario-habitaciones']);
  }

  // -------------------------------------------------------------- utilidades

  requestRatesManager(): void {
    this.manageRates.emit(this.selectedRoomType?.id ?? null);
  }

  requestRoomTypesManager(): void {
    this.manageRoomTypes.emit();
  }

  close(): void {
    if (this.saving || this.actionLoading) return;
    this.emitCloseState();
  }

  formatDate(value?: string | null): string {
    if (!value) return '--';

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return this.formatDateObject(date);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return this.formatDateObject(parsed);
  }

  formatDateTime(value?: string | null): string {
    if (!value) return '--';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return this.formatDate(value);

    return `${this.formatDateObject(parsed)} · ${parsed.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  formatCurrency(value: string | number | null | undefined): string {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber)) return String(value ?? '--');

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(asNumber);
  }

  statusChipFor(code: string | number | null | undefined): string {
    const normalized = this.codeOf(code);
    if (normalized === COMPLETED_STATUS_CODE) return 'is-success';
    if (normalized === 'EN_PROCESO') return 'is-info';
    if (normalized === 'PENDIENTE') return 'is-warn';
    if (normalized === 'CANCELADA') return 'is-danger';
    return '';
  }

  isOpenStatus(code: string | number | null | undefined): boolean {
    const normalized = this.codeOf(code);
    return OPEN_CLEANING_CODES.includes(normalized) || OPEN_MAINTENANCE_CODES.includes(normalized);
  }

  catalogValue(item: MasterDataI): string | number {
    return item.code || item.id;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private isToday(value: string | null | undefined): boolean {
    const date = this.parseDate(value);
    if (!date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date.getTime() === today.getTime();
  }

  private get defaultCleaningStatus(): string | number {
    return this.findCatalogValue(this.cleaningStatuses, DEFAULT_PENDING_STATUS);
  }

  private get defaultMaintenanceStatus(): string | number {
    return this.findCatalogValue(this.maintenanceStatuses, DEFAULT_PENDING_STATUS);
  }

  private resetOperationForms(): void {
    this.resetCleaningForm();
    this.resetMaintenanceForm();
  }

  private resetCleaningForm(): void {
    this.cleaningForm = {
      task_type: this.findCatalogValue(this.cleaningTaskTypes, DEFAULT_CLEANING_TYPE),
      scheduled_for: this.todayInputValue(),
      notes: ''
    };
  }

  private resetMaintenanceForm(): void {
    this.maintenanceForm = {
      title: '',
      priority: this.findCatalogValue(this.maintenancePriorities, DEFAULT_MAINTENANCE_PRIORITY),
      estimated_completed_at: '',
      description: ''
    };
  }

  private resetConsumptionForm(): void {
    this.consumptionSearch = '';
    this.consumptionForm = {
      description: '',
      quantity: 1,
      unit_price: 0,
      paid_now: false,
      payment_method: this.paymentMethods[0]?.id ?? null,
      reference: ''
    };
    this.receptionCart = [];
  }

  private applyOperationDefaults(): void {
    if (!this.cleaningForm.scheduled_for) {
      this.cleaningForm.scheduled_for = this.todayInputValue();
    }
    this.cleaningForm.task_type = this.resolveCurrentCatalogValue(
      this.cleaningForm.task_type,
      this.cleaningTaskTypes,
      DEFAULT_CLEANING_TYPE
    );
    this.maintenanceForm.priority = this.resolveCurrentCatalogValue(
      this.maintenanceForm.priority,
      this.maintenancePriorities,
      DEFAULT_MAINTENANCE_PRIORITY
    );
  }

  private findCatalogValue(items: MasterDataI[], preferredCode: string): string | number {
    const preferred = items.find((item) => this.codeOf(item.code) === preferredCode);
    const fallback = preferred || items[0];
    return fallback?.code || preferredCode;
  }

  private resolveCurrentCatalogValue(
    current: string | number,
    items: MasterDataI[],
    fallbackCode: string
  ): string | number {
    const normalized = this.codeOf(current);
    const exists = items.some((item) => this.codeOf(item.code) === normalized || item.id === current);
    return exists ? current : this.findCatalogValue(items, fallbackCode);
  }

  private refreshRoomAfterOperationChange(): void {
    this.loadOperations();
    this.loadPanel();
    this.roomService.getRoomById(this.room.id).subscribe({
      next: (room) => {
        this.room = room;
        this.resetFormFromRoom();
        this.saved.emit(room);
      },
      error: () => {
        this.saved.emit(this.room);
      }
    });
  }

  private todayInputValue(): string {
    return this.formatDateForInput(new Date());
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toDateTimeValue(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseTime(value: string): [number, number] {
    const [rawHours, rawMinutes] = String(value || '12:00').split(':');
    const hours = Number(rawHours);
    const minutes = Number(rawMinutes);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return [12, 0];
    return [Math.min(Math.max(hours, 0), 23), Math.min(Math.max(minutes, 0), 59)];
  }

  private getDefaultTabForRoom(): RoomModalTab {
    return this.isRoomConfigured(this.room) ? 'reservation' : 'rate';
  }

  private isRoomConfigured(room: RoomI | null | undefined): boolean {
    return !!room?.room_type && !!this.getRoomRateId(room);
  }

  private persist(payload: {
    number: string;
    floor: number;
    room_type: number | null;
    rate: number | null;
    status: RoomStatus;
    notes: string;
    amenity_ids: number[];
  }): void {
    this.saving = true;
    this.roomService.updateRoom(this.room.id, payload).subscribe({
      next: (updated) => {
        this.saving = false;
        this.dirty = true;
        this.room = {
          ...this.room,
          ...updated,
          rate: this.getRoomRateId(updated) ?? payload.rate,
        };
        this.resetFormFromRoom();
        this.setFeedback(successActionAlert('update', `habitacion ${this.roomNumber}`), 'info');
        this.loadPanel();
        this.saved.emit(this.room);
      },
      error: (error) => {
        this.saving = false;
        this.setFeedback(
          extractApiErrorMessage(error, errorActionAlert('update', 'habitacion')),
          'error'
        );
      }
    });
  }

  private runReservationAction(
    action$: Observable<unknown>,
    options: { openOperationsTab?: boolean } = {}
  ): void {
    this.actionLoading = true;
    this.feedback = '';

    action$.subscribe({
      next: () => {
        this.dirty = true;
        this.refreshRoomAfterReservationAction(!!options.openOperationsTab);
      },
      error: (error) => {
        this.actionLoading = false;
        this.setFeedback(
          extractApiErrorMessage(error, 'No fue posible ejecutar la accion sobre la reserva.'),
          'error'
        );
      }
    });
  }

  private refreshRoomAfterReservationAction(openOperationsTab: boolean): void {
    const roomId = this.room?.id;
    if (!roomId) {
      this.actionLoading = false;
      return;
    }

    forkJoin({
      room: this.roomService.getRoomById(roomId).pipe(catchError(() => of(this.room))),
      panel: this.roomService.getRoomPanel(roomId).pipe(catchError(() => of(null as RoomPanelI | null))),
      cleaning: this.cleaningTasksService
        .listCleaningTasks()
        .pipe(catchError(() => of([] as CleaningTaskI[]))),
      maintenance: this.maintenanceOrdersService
        .listMaintenanceOrders()
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      inventory: this.roomInventoryService
        .listRoomInventory({ include_inactive: true })
        .pipe(catchError(() => of([] as RoomInventoryI[])))
    }).subscribe({
      next: ({ room, panel, cleaning, maintenance, inventory }) => {
        this.actionLoading = false;
        this.loadingPanel = false;
        this.loadingOperations = false;
        this.room = room;
        this.panel = panel;
        this.cleaningTasks = cleaning.filter((task) => task.room === roomId);
        this.maintenanceOrders = maintenance.filter((order) => order.room === roomId);
        this.inventory = inventory.filter((record) => record.room === roomId);
        this.resetFormFromRoom();
        this.loadReservationDetail();

        if (openOperationsTab) {
          this.activeTab = 'operations';
        }

        this.setFeedback(successActionAlert('update', `habitacion ${this.roomNumber}`), 'info');
        this.saved.emit(this.room);
      },
      error: () => {
        this.actionLoading = false;
        this.loadPanel();
        this.loadOperations();
        this.saved.emit(this.room);
      }
    });
  }

  private loadReservationBilling(reservationId: number): void {
    this.loadingReservationBilling = true;
    forkJoin({
      charges: this.billingService
        .listCharges({ reservation: reservationId, is_active: true, ordering: '-charge_date' })
        .pipe(catchError(() => of([] as ChargeI[]))),
      invoices: this.billingService
        .listInvoices({ reservation: reservationId, is_active: true, ordering: '-id' })
        .pipe(catchError(() => of([] as InvoiceI[])))
    }).subscribe({
      next: ({ charges, invoices }) => {
        this.loadingReservationBilling = false;
        this.reservationCharges = charges;
        this.reservationInvoices = invoices;
      },
      error: () => {
        this.loadingReservationBilling = false;
        this.reservationCharges = [];
        this.reservationInvoices = [];
      }
    });
  }

  private loadReceptionItems(): void {
    if (this.receptionItems.length || this.loadingReceptionItems) return;

    this.loadingReceptionItems = true;
    this.itemsService
      .listItems({ include_inactive: false, item_purpose: 'RECEPTION', ordering: 'name' })
      .subscribe({
        next: (items) => {
          this.loadingReceptionItems = false;
          this.receptionItems = items.filter((item) => item.is_active !== false && this.isReceptionPurposeItem(item));
        },
        error: () => {
          this.loadingReceptionItems = false;
          this.receptionItems = [];
          this.setFeedback('No se pudo cargar el inventario de recepcion.', 'error');
        }
      });
  }

  private afterConsumptionCreated(total: number, reference: string | null | undefined, target: string): void {
    if (!this.consumptionForm.paid_now) {
      this.finishConsumption(target);
      return;
    }

    const reservationId = this.activeReservationId;
    const paymentMethod = this.consumptionForm.payment_method;
    if (!reservationId || !paymentMethod) {
      this.actionLoading = false;
      this.setFeedback(
        `El ${target} se registro, pero falta metodo de pago para cobrarlo ahora.`,
        'error'
      );
      this.refreshReservationBillingAfterConsumption();
      return;
    }

    this.billingService
      .listInvoices({ reservation: reservationId, is_active: true, ordering: '-id' })
      .subscribe({
        next: (invoices) => {
          const invoice = invoices[0];
          if (!invoice?.id) {
            this.actionLoading = false;
            this.setFeedback(
              `El ${target} se registro, pero no se encontro la factura de la reserva para cobrarlo.`,
              'error'
            );
            this.refreshReservationBillingAfterConsumption();
            return;
          }

          this.billingService
            .createPayment({
              invoice: invoice.id,
              payment_method: paymentMethod,
              amount: total,
              reference: this.consumptionForm.reference.trim() || reference || null,
              notes: `Pago inmediato de ${target}`,
              is_active: true
            })
            .subscribe({
              next: () => this.finishConsumption(`${target} pagado`),
              error: (error) => {
                this.actionLoading = false;
                this.setFeedback(
                  extractApiErrorMessage(error, `El ${target} se registro, pero no fue posible guardar el pago.`),
                  'error'
                );
                this.refreshReservationBillingAfterConsumption();
              }
            });
        },
        error: (error) => {
          this.actionLoading = false;
          this.setFeedback(
            extractApiErrorMessage(error, `El ${target} se registro, pero no fue posible consultar la factura.`),
            'error'
          );
          this.refreshReservationBillingAfterConsumption();
        }
      });
  }

  private finishConsumption(target: string): void {
    this.actionLoading = false;
    this.showConsumptionCreator = false;
    this.dirty = true;
    this.resetConsumptionForm();
    this.setFeedback(successActionAlert('create', target), 'info');
    this.refreshReservationBillingAfterConsumption();
  }

  private refreshReservationBillingAfterConsumption(): void {
    const reservationId = this.activeReservationId;
    if (reservationId) {
      this.loadReservationBilling(reservationId);
      this.loadReservationDetail();
    }
    this.receptionItems = [];
    this.loadReceptionItems();
    this.saved.emit(this.room);
  }

  private handleConsumptionError(error: unknown): void {
    this.actionLoading = false;
    this.setFeedback(
      extractApiErrorMessage(error, 'No fue posible registrar el consumo en la reserva.'),
      'error'
    );
  }

  private loadReservationCatalogs(): void {
    if (this.loadingReservationCatalogs) return;
    if (
      this.clients.length &&
      this.origins.length &&
      this.documentTypes.length &&
      this.paymentMethods.length
    ) {
      return;
    }

    this.loadingReservationCatalogs = true;
    forkJoin({
      clients: this.clientsService.listClients().pipe(catchError(() => of([] as ClientI[]))),
      origins: this.masterDataService
        .listMasterData({ group: 'RESERVATION_ORIGIN', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      documentTypes: this.masterDataService
        .listMasterData({ group: 'DOCUMENT_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      paymentMethods: this.paymentMethodService
        .listPaymentMethods()
        .pipe(catchError(() => of([] as PaymentMethodI[]))),
      depositStatuses: this.masterDataService
        .listMasterData({ group: 'RESERVATION_DEPOSIT_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      packages: this.packagesService
        .listPackages({ ordering: 'name' })
        .pipe(catchError(() => of([] as PackageI[]))),
      reservationPolicies: this.reservationService
        .listReservationPolicies({ ordering: '-id', is_active: true })
        .pipe(catchError(() => of([] as ReservationPolicyI[])))
    }).subscribe({
      next: ({
        clients,
        origins,
        documentTypes,
        paymentMethods,
        depositStatuses,
        packages,
        reservationPolicies
      }) => {
        this.loadingReservationCatalogs = false;
        this.clients = clients;
        this.origins = this.dedupeMasterDataByCode(origins);
        this.documentTypes = this.dedupeMasterDataByCode(documentTypes);
        this.paymentMethods = paymentMethods;
        this.depositStatuses = this.dedupeMasterDataByCode(depositStatuses);
        this.packages = packages;
        this.reservationPolicies = reservationPolicies;
      },
      error: () => {
        this.loadingReservationCatalogs = false;
        this.setFeedback('No se pudieron cargar los datos para crear la reserva.', 'error');
      }
    });
  }

  private dedupeMasterDataByCode(items: MasterDataI[]): MasterDataI[] {
    const uniqueMap = new Map<string, MasterDataI>();

    for (const item of items) {
      const code = this.codeOf(item.code);
      if (!code) continue;

      const existing = uniqueMap.get(code);
      if (!existing) {
        uniqueMap.set(code, item);
        continue;
      }

      const existingOrder = Number(existing.sort_order ?? Number.MAX_SAFE_INTEGER);
      const currentOrder = Number(item.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (currentOrder < existingOrder) {
        uniqueMap.set(code, item);
      }
    }

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.name || '').localeCompare(b.name || '', 'es-CO');
    });
  }

  private emitCloseState(): void {
    if (this.dirty) this.saved.emit(this.room);
    this.closed.emit();
  }

  private setFeedback(message: string, kind: 'error' | 'info'): void {
    this.feedback = message;
    this.feedbackKind = kind;
  }

  private codeOf(value: string | number | null | undefined): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private getRoomRateId(room: RoomI | null | undefined): number | null {
    const value = room?.rate as unknown;
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (value && typeof value === 'object' && 'id' in value) {
      const parsed = Number((value as { id?: unknown }).id);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private upsertInventoryRecord(record: RoomInventoryI): void {
    const index = this.inventory.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      this.inventory = [
        ...this.inventory.slice(0, index),
        record,
        ...this.inventory.slice(index + 1),
      ];
      return;
    }

    this.inventory = [record, ...this.inventory];
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private toPositiveInt(value: unknown, fallback = 1): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeInventorySearch(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private isRoomPurposeItem(item: ItemI): boolean {
    return !item.item_purpose || item.item_purpose === 'ROOM';
  }

  private isReceptionPurposeItem(item: ItemI): boolean {
    return !item.item_purpose || item.item_purpose === 'RECEPTION';
  }

  private getItemCategoryKey(item: ItemI): string {
    if (typeof item.item_type === 'number') return `type:${item.item_type}`;
    const code = String(item.item_type_code || this.getItemCategoryLabel(item)).trim();
    return code ? `code:${code.toUpperCase()}` : 'uncategorized';
  }

  private formatDateObject(date: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }
}
