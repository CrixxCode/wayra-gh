import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { ClientI } from '../../clients/client-model';
import { RateI, RoomI } from '../../rooms/room-model';
import { MasterDataService } from '../../../services/master-data.service';
import { ClientsService } from '../../../services/client';
import { RoomService } from '../../../services/room';
import { PaginatedResponseI, ReservationService } from '../../../services/reservation';
import { PackagesService } from '../../../services/package';
import { PackageI } from '../../packages/package-model';
import {
  ReservationDetailI,
  ReservationI,
  ReservationPolicyI,
  ReservationStatusFilter,
  ReservationStatusStyleI,
  ReservationViewMode,
  ReservationVisualStatus
} from '../reservation-model';
import { CreateReservation } from '../create-reservation/create-reservation';
import { UpdateReservation } from '../update-reservation/update-reservation';
import { DetailReservation } from '../detail-reservation/detail-reservation';

interface CalendarDayI {
  date: Date;
  dayLabel: string;
  weekLabel: string;
  iso: string;
  isToday: boolean;
}

interface CalendarBarI {
  reservationId: number;
  reservationCode: string;
  guestName: string;
  status: ReservationVisualStatus;
  startIndex: number;
  span: number;
  leftPercent: number;
  widthPercent: number;
}

interface CalendarRoomRowI {
  key: string;
  roomNumber: string;
  roomType: string;
  bars: CalendarBarI[];
}


type RouteReservationAction = 'detail' | 'edit' | 'create' | 'checkin';

@Component({
  selector: 'app-list-reservations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConfirmDialogModule,
    CreateReservation,
    UpdateReservation,
    DetailReservation
  ],
  templateUrl: './list-reservations.html',
  styleUrls: ['./list-reservations.css'],
  providers: [ConfirmationService]
})
export class ListReservations implements OnInit {
  loading = false;
  detailsLoading = false;
  errorMessage = '';

  reservations: ReservationI[] = [];
  deletedReservations: ReservationI[] = [];
  filteredReservations: ReservationI[] = [];
  showDeletedReservations = false;

  statuses: MasterDataI[] = [];
  origins: MasterDataI[] = [];
  documentTypes: MasterDataI[] = [];
  paymentMethods: MasterDataI[] = [];
  depositStatuses: MasterDataI[] = [];
  clients: ClientI[] = [];
  rooms: RoomI[] = [];
  rates: RateI[] = [];
  reservationPolicies: ReservationPolicyI[] = [];
  packages: PackageI[] = [];

  search = '';
  statusFilter: ReservationStatusFilter = 'ALL';
  originFilter = 'ALL';
  viewMode: ReservationViewMode = 'grid';
  currentPage = 1;
  pageSize = 20;
  totalReservationsCount = 0;
  hasNextPage = false;
  hasPreviousPage = false;

  showCreateOverlay = false;
  showUpdateOverlay = false;
  createPrefillRoomId: number | null = null;
  createPrefillCheckInMode = false;

  selectedReservationId: number | null = null;
  selectedReservationDetail: ReservationDetailI | null = null;
  reservationToEdit: ReservationDetailI | null = null;

  calendarStartDate = this.startOfDay(new Date());
  calendarDays: CalendarDayI[] = [];
  calendarRows: CalendarRoomRowI[] = [];
  checkInLoadingIds = new Set<number>();
  private detailsCache = new Map<number, ReservationDetailI>();
  private roomMap = new Map<number, RoomI>();
  private pendingRouteReservationId: number | null = null;
  private pendingRouteRoomId: number | null = null;
  private pendingRouteAction: RouteReservationAction = 'detail';

  readonly statusTabs: Array<{ key: ReservationStatusFilter; label: string }> = [
    { key: 'ALL', label: 'Todas' },
    { key: 'CONFIRMADA', label: 'Confirmada' },
    { key: 'PENDIENTE', label: 'Pendiente' },
    { key: 'EN_CURSO', label: 'En curso' },
    { key: 'POR_SALIR_HOY', label: 'Por salir hoy' },
    { key: 'CANCELADA', label: 'Cancelada' }
  ];

  constructor(
    private reservationService: ReservationService,
    private masterDataService: MasterDataService,
    private clientsService: ClientsService,
    private roomService: RoomService,
    private packagesService: PackagesService,
    private confirmationService: ConfirmationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.syncRouteContext();
    this.initializeCalendarDays();
    this.loadModuleData();
  }

  get totalReservations(): number {
    return this.totalReservationsCount;
  }

  get totalPages(): number {
    if (this.totalReservationsCount <= 0) return 1;
    return Math.max(1, Math.ceil(this.totalReservationsCount / this.pageSize));
  }

  get deletedReservationsCount(): number {
    return this.deletedReservations.length;
  }

  get inProgressCount(): number {
    return this.reservations.filter((reservation) => this.getVisualStatus(reservation) === 'EN_CURSO').length;
  }

  get checkInsTodayCount(): number {
    return this.reservations.filter((reservation) => {
      if (!this.isToday(reservation.expected_check_in)) return false;
      const status = this.getVisualStatus(reservation);
      return status !== 'CANCELADA' && status !== 'FINALIZADA';
    }).length;
  }

  get checkOutsTodayCount(): number {
    return this.reservations.filter((reservation) => {
      if (!this.isCheckoutToday(reservation)) return false;
      const status = this.getVisualStatus(reservation);
      return status !== 'CANCELADA' && status !== 'FINALIZADA';
    }).length;
  }

  get pendingCount(): number {
    return this.reservations.filter((reservation) => this.getVisualStatus(reservation) === 'PENDIENTE').length;
  }

  get monthlyRevenueLabel(): string {
    const now = new Date();

    const monthReservations = this.reservations.filter((reservation) => {
      const checkIn = this.parseDate(reservation.expected_check_in);
      return !!checkIn && checkIn.getMonth() === now.getMonth() && checkIn.getFullYear() === now.getFullYear();
    });

    if (monthReservations.length === 0) return this.formatCurrency(0);

    const total = monthReservations.reduce((sum, reservation) => sum + this.calculateReservationAmount(reservation), 0);
    return this.formatCurrency(total);
  }

  get hasCalendarData(): boolean {
    return this.calendarRows.length > 0;
  }

  loadModuleData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.detailsCache.clear();

    forkJoin({
      reservationsPage: this.reservationService
        .listReservationsPage(this.buildReservationPageFilters())
        .pipe(
          catchError(
            () =>
              of({
                count: 0,
                next: null,
                previous: null,
                results: [] as ReservationI[],
              } as PaginatedResponseI<ReservationI>)
          )
        ),
      deletedReservationsPage: this.reservationService
        .listReservationsPage(this.buildDeletedReservationPageFilters())
        .pipe(
          catchError(
            () =>
              of({
                count: 0,
                next: null,
                previous: null,
                results: [] as ReservationI[],
              } as PaginatedResponseI<ReservationI>)
          )
        ),
      statuses: this.masterDataService
        .listMasterData({ group: 'RESERVATION_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      origins: this.masterDataService
        .listMasterData({ group: 'RESERVATION_ORIGIN', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      documentTypes: this.masterDataService
        .listMasterData({ group: 'DOCUMENT_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      paymentMethods: this.masterDataService
        .listMasterData({ group: 'PAYMENT_METHOD', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      depositStatuses: this.masterDataService
        .listMasterData({ group: 'RESERVATION_DEPOSIT_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      clients: this.clientsService.listClients().pipe(catchError(() => of([] as ClientI[]))),
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      rates: this.roomService.listRates().pipe(catchError(() => of([] as RateI[]))),
      packages: this.packagesService
        .listPackages({ ordering: 'name' })
        .pipe(catchError(() => of([] as PackageI[]))),
      reservationPolicies: this.reservationService
        .listReservationPolicies({ ordering: '-id', is_active: true })
        .pipe(catchError(() => of([] as ReservationPolicyI[])))
    }).subscribe({
      next: ({
        reservationsPage,
        deletedReservationsPage,
        statuses,
        origins,
        documentTypes,
        paymentMethods,
        depositStatuses,
        clients,
        rooms,
        rates,
        packages,
        reservationPolicies
      }) => {
        this.loading = false;

        this.setReservationPageData(reservationsPage);
        this.setDeletedReservationPageData(deletedReservationsPage);
        this.statuses = this.dedupeMasterDataByCode(statuses);
        this.origins = this.dedupeMasterDataByCode(origins);
        this.documentTypes = this.dedupeMasterDataByCode(documentTypes);
        this.paymentMethods = this.dedupeMasterDataByCode(paymentMethods);
        this.depositStatuses = this.dedupeMasterDataByCode(depositStatuses);
        this.clients = clients;
        this.rooms = rooms;
        this.rates = rates;
        this.packages = packages.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es-CO'));
        this.reservationPolicies = reservationPolicies.sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', 'es-CO')
        );
        this.roomMap = new Map(rooms.map((room) => [room.id, room]));

        this.applyFilters();
        this.consumePendingRouteReservationAction();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se pudo cargar el modulo de reservas.';
      }
    });
  }

  refreshReservations(): void {
    this.loadReservationsPage();
  }

  onSearchInput(): void {
    this.currentPage = 1;
    this.loadReservationsPage();
  }

  previousPage(): void {
    if (!this.hasPreviousPage || this.currentPage <= 1 || this.loading) return;
    this.currentPage -= 1;
    this.loadReservationsPage();
  }

  nextPage(): void {
    if (!this.hasNextPage || this.loading) return;
    this.currentPage += 1;
    this.loadReservationsPage();
  }

  private loadReservationsPage(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      reservationsPage: this.reservationService.listReservationsPage(this.buildReservationPageFilters()),
      deletedReservationsPage: this.reservationService
        .listReservationsPage(this.buildDeletedReservationPageFilters())
        .pipe(
          catchError(
            () =>
              of({
                count: 0,
                next: null,
                previous: null,
                results: [] as ReservationI[],
              } as PaginatedResponseI<ReservationI>)
          )
        )
    }).subscribe({
      next: ({ reservationsPage, deletedReservationsPage }) => {
        this.loading = false;
        this.setReservationPageData(reservationsPage);
        this.setDeletedReservationPageData(deletedReservationsPage);
        this.applyFilters();
        this.consumePendingRouteReservationAction();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No se pudieron actualizar las reservas.';
      }
    });
  }

  applyFilters(): void {
    const query = this.search.toLowerCase().trim();

    this.filteredReservations = this.reservations
      .filter((reservation) => {
        const statusMatch = this.matchesStatusFilter(reservation, this.statusFilter);
        const originMatch =
          this.originFilter === 'ALL' || this.normalizeCode(reservation.origin_code) === this.normalizeCode(this.originFilter);

        const searchableFields = [
          this.getReservationCode(reservation),
          reservation.client_full_name || '',
          reservation.client_document_number || '',
          reservation.status_name || '',
          reservation.origin_name || '',
          reservation.expected_check_in || '',
          reservation.expected_check_out || '',
          reservation.promo_code || ''
        ]
          .join(' ')
          .toLowerCase();

        const searchMatch = !query || searchableFields.includes(query);

        return statusMatch && originMatch && searchMatch;
      })
      .sort((a, b) => b.id - a.id);

    if (this.viewMode === 'calendar') {
      this.preloadReservationDetails(this.filteredReservations.map((reservation) => reservation.id));
    }
  }

  selectStatus(status: ReservationStatusFilter): void {
    this.statusFilter = status;
    this.applyFilters();
  }

  setViewMode(mode: ReservationViewMode): void {
    this.viewMode = mode;

    if (mode === 'calendar') {
      this.preloadReservationDetails(this.filteredReservations.map((reservation) => reservation.id));
    }
  }

  openCreateOverlay(): void {
    this.showUpdateOverlay = false;
    this.createPrefillRoomId = null;
    this.createPrefillCheckInMode = false;
    this.showCreateOverlay = true;
  }

  openReports(): void {
    void this.router.navigate(['/reportes']);
  }

  closeCreateOverlay(): void {
    this.showCreateOverlay = false;
    this.createPrefillRoomId = null;
    this.createPrefillCheckInMode = false;
  }

  onReservationCreated(): void {
    this.showCreateOverlay = false;
    this.createPrefillRoomId = null;
    this.createPrefillCheckInMode = false;
    this.refreshReservations();
  }

  openUpdateOverlay(reservation: ReservationI | ReservationDetailI | null | undefined): void {
    const reservationId = reservation?.id;
    if (!reservationId) return;

    this.ensureReservationDetail(reservationId, (detail) => {
      if (!this.canEditReservation(detail)) {
        this.errorMessage = 'No puedes editar una reserva que ya tiene check-in registrado.';
        return;
      }

      this.showCreateOverlay = false;
      this.selectedReservationId = null;
      this.selectedReservationDetail = null;
      this.reservationToEdit = detail;
      this.showUpdateOverlay = true;
    });
  }

  closeUpdateOverlay(): void {
    this.showUpdateOverlay = false;
    this.reservationToEdit = null;
  }

  onReservationUpdated(): void {
    this.showUpdateOverlay = false;
    this.reservationToEdit = null;
    this.refreshReservations();
  }

  onReservationFlowChanged(detail: ReservationDetailI): void {
    this.syncReservationDetail(detail);
    this.refreshReservations();
  }

  openDetail(reservation: ReservationI | ReservationDetailI): void {
    this.selectedReservationId = reservation.id;
    this.selectedReservationDetail = this.detailsCache.get(reservation.id) || null;
  }

  openDetailById(reservationId: number): void {
    this.selectedReservationId = reservationId;
    this.selectedReservationDetail = this.detailsCache.get(reservationId) || null;
  }

  closeDetail(): void {
    this.selectedReservationId = null;
    this.selectedReservationDetail = null;
  }

  openUpdateFromDetail(detail: ReservationDetailI): void {
    if (!this.canEditReservation(detail)) {
      this.errorMessage = 'No puedes editar una reserva que ya tiene check-in registrado.';
      return;
    }

    this.closeDetail();
    this.openUpdateOverlay(detail);
  }

  confirmDelete(reservation: ReservationI): void {
    const reservationCode = this.getReservationCode(reservation);

    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: reservationCode,
      key: 'reservationDelete',
      onAccept: () => {
        this.reservationService.deleteReservation(reservation.id).subscribe({
          next: () => {
            this.detailsCache.delete(reservation.id);
            if (this.selectedReservationId === reservation.id) {
              this.closeDetail();
            }
            this.refreshReservations();
          },
          error: () => {
            this.errorMessage = 'No se pudo eliminar la reserva seleccionada.';
          }
        });
      }
    });
  }

  restoreReservation(reservation: ReservationI): void {
    const reservationCode = this.getReservationCode(reservation);

    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: reservationCode,
      key: 'reservationDelete',
      onAccept: () => {
        this.reservationService.restoreReservation(reservation.id).subscribe({
          next: () => {
            this.detailsCache.delete(reservation.id);
            this.refreshReservations();
          },
          error: () => {
            this.errorMessage = 'No se pudo restaurar la reserva seleccionada.';
          }
        });
      }
    });
  }

  exportCsv(): void {
    if (this.filteredReservations.length === 0) return;

    const headers = [
      'codigo',
      'huesped',
      'documento',
      'habitaciones',
      'check_in',
      'check_out',
      'estado',
      'origen',
      'total',
      'pago'
    ];

    const rows = this.filteredReservations.map((reservation) => {
      const row = [
        this.getReservationCode(reservation),
        reservation.client_full_name || '',
        reservation.client_document_number || '',
        this.getRoomSummary(reservation),
        reservation.expected_check_in || '',
        reservation.expected_check_out || '',
        this.getStatusStyle(reservation).label,
        reservation.origin_name || '',
        this.calculateReservationAmount(reservation),
        this.getPaymentLabel(reservation)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservas-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  getStatusCount(status: ReservationStatusFilter): number {
    return this.reservations.filter((reservation) => this.matchesStatusFilter(reservation, status)).length;
  }

  getStatusStyle(reservation: ReservationI): ReservationStatusStyleI {
    return this.resolveStatusStyle(this.getVisualStatus(reservation));
  }

  getReservationCode(reservation: ReservationI): string {
    const createdDate = reservation.created_at ? new Date(reservation.created_at) : null;
    const year = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.getFullYear() : new Date().getFullYear();
    return `RES-${year}-${String(reservation.id).padStart(4, '0')}`;
  }

  getRoomSummary(reservation: ReservationI): string {
    const detail = this.detailsCache.get(reservation.id);

    if (detail?.rooms_detail?.length) {
      if (detail.rooms_detail.length === 1) {
        const room = detail.rooms_detail[0];
        return room.room_number ? `Hab. ${room.room_number}` : `Hab. #${room.room}`;
      }

      return `${detail.rooms_detail.length} habitaciones`;
    }

    const roomCount = Number(reservation.total_rooms || 0);
    if (roomCount > 0) {
      return `${roomCount} habitaciones`;
    }

    return 'Sin asignar';
  }

  getRoomSubtitle(reservation: ReservationI): string {
    const detail = this.detailsCache.get(reservation.id);

    if (!detail?.rooms_detail?.length) {
      return `${reservation.total_guests || 0} huesped(es)`;
    }

    const adults = detail.rooms_detail.reduce((sum, room) => sum + Number(room.adults || 0), 0);
    const children = detail.rooms_detail.reduce((sum, room) => sum + Number(room.children || 0), 0);
    const capacity = detail.rooms_detail.reduce((sum, room) => sum + this.getRoomCapacity(room), 0);

    const occupancyLabel = `${adults || 0} adulto(s) - ${children || 0} nino(s)`;
    if (capacity > 0) {
      return `Cap. ${capacity} - ${occupancyLabel}`;
    }

    return occupancyLabel;
  }

  getStayLabel(reservation: ReservationI): string {
    return `${this.formatDate(reservation.expected_check_in)} -> ${this.formatDate(reservation.expected_check_out)}`;
  }

  getNightsLabel(reservation: ReservationI): string {
    const nights = this.getNights(reservation);
    return `${nights} noche(s)`;
  }

  getOriginLabel(reservation: ReservationI): string {
    return reservation.origin_name || 'Sin origen';
  }

  getAmountLabel(reservation: ReservationI): string {
    const amount = this.calculateReservationAmount(reservation);
    return this.formatCurrency(amount);
  }

  getPaymentLabel(reservation: ReservationI): string {
    const backendLabel = String(reservation.payment_status_label || '').trim();
    if (backendLabel) return backendLabel;

    const detail = this.detailsCache.get(reservation.id);

    if (!detail) return 'Sin datos';

    const total = this.calculateReservationAmount(reservation);
    const deposits = this.calculateDepositsAmount(reservation);

    if (total <= 0 && deposits <= 0) return 'Sin cargos';
    if (deposits >= total && total > 0) return 'Pagado';
    if (deposits > 0) return 'Parcial';

    return 'Pendiente';
  }

  getPaymentTone(reservation: ReservationI): { bg: string; color: string } {
    const label = this.getPaymentLabel(reservation);

    if (label === 'Pagado') {
      return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    }

    if (label === 'Parcial') {
      return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    }

    if (label === 'Pendiente') {
      return { bg: 'var(--gh-status-warn-bg)', color: 'var(--gh-status-warn-text)' };
    }

    return { bg: 'var(--gh-status-neutral-bg)', color: 'var(--gh-status-neutral-text)' };
  }

  formatAmount(value: number): string {
    return this.formatCurrency(value);
  }

  getCardDateLabel(reservation: ReservationI): string {
    return this.formatDate(reservation.expected_check_in || reservation.created_at || null);
  }

  getCardStatusClass(reservation: ReservationI): string {
    const visual = this.getVisualStatus(reservation);

    switch (visual) {
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

  getCardStatusLabel(reservation: ReservationI): string {
    const visual = this.getVisualStatus(reservation);

    if (visual === 'EN_CURSO') return 'Check-In';
    if (visual === 'POR_SALIR_HOY') return 'Check-Out';
    if (visual === 'FINALIZADA') return 'Completada';

    return this.getStatusStyle(reservation).label;
  }

  getCardRoomLine(reservation: ReservationI): string {
    const detail = this.detailsCache.get(reservation.id);

    if (detail?.rooms_detail?.length === 1) {
      const room = detail.rooms_detail[0];
      const roomNumber = String(room.room_number || room.room || '').trim();
      const roomMeta = room.room ? this.roomMap.get(room.room) : null;
      const roomType = roomMeta?.room_type_name ? String(roomMeta.room_type_name).trim() : '';

      const numberLabel = roomNumber ? `#${roomNumber.replace(/^#/, '')}` : 'Sin asignar';
      return roomType ? `${numberLabel} - ${roomType}` : numberLabel;
    }

    if (detail?.rooms_detail?.length && detail.rooms_detail.length > 1) {
      return `${detail.rooms_detail.length} habitaciones`;
    }

    const roomCount = Number(reservation.total_rooms || 0);
    if (roomCount > 0) return `${roomCount} habitaciones`;

    return 'Sin asignar';
  }

  getCardStayCompact(reservation: ReservationI): string {
    const checkIn = this.parseDate(reservation.expected_check_in);
    const checkOut = this.parseDate(reservation.expected_check_out);
    const nights = this.getNights(reservation);

    const start = checkIn ? this.formatDateShort(checkIn) : this.formatDate(reservation.expected_check_in);
    const end = checkOut ? this.formatDateShort(checkOut) : this.formatDate(reservation.expected_check_out);

    return `${start} -> ${end} (${nights} ${nights === 1 ? 'noche' : 'noches'})`;
  }

  getCardPendingAmount(reservation: ReservationI): number {
    const backendPending = Number(reservation.pending_amount);
    if (Number.isFinite(backendPending) && backendPending >= 0) {
      return backendPending;
    }

    const total = this.calculateReservationAmount(reservation);
    const deposits = this.calculateDepositsAmount(reservation);
    const pending = total - deposits;
    return pending > 0 ? pending : 0;
  }

  getCardActionLabel(reservation: ReservationI): string {
    if (this.canCheckInReservation(reservation) && this.isCheckInLoading(reservation)) {
      return 'Procesando...';
    }

    const visual = this.getVisualStatus(reservation);

    if (visual === 'CONFIRMADA') return 'Check-In';
    if (visual === 'EN_CURSO' || visual === 'POR_SALIR_HOY') return 'Check-Out';

    return 'Ver detalles';
  }

  getCardActionClass(reservation: ReservationI): string {
    const visual = this.getVisualStatus(reservation);

    if (visual === 'CONFIRMADA') return 'action-checkin';
    if (visual === 'EN_CURSO' || visual === 'POR_SALIR_HOY') return 'action-checkout';

    return 'action-detail';
  }

  getCardActionIcon(reservation: ReservationI): string {
    if (this.canCheckInReservation(reservation) && this.isCheckInLoading(reservation)) {
      return 'fa-solid fa-spinner fa-spin';
    }

    const visual = this.getVisualStatus(reservation);

    if (visual === 'CONFIRMADA') return 'fa-solid fa-arrow-right-to-bracket';
    if (visual === 'EN_CURSO' || visual === 'POR_SALIR_HOY') return 'fa-solid fa-arrow-right-from-bracket';

    return 'fa-regular fa-eye';
  }

  handleCardPrimaryAction(reservation: ReservationI): void {
    if (this.canCheckInReservation(reservation)) {
      this.performCheckInFromList(reservation);
      return;
    }

    this.openDetail(reservation);
  }

  canCheckInReservation(reservation: ReservationI | ReservationDetailI | null | undefined): boolean {
    if (!reservation) return false;

    if (typeof reservation.can_check_in === 'boolean') {
      return reservation.can_check_in && !reservation.real_check_in && !reservation.real_check_out;
    }

    const statusCode = this.normalizeCode(reservation.status_code);
    return statusCode === 'CONFIRMADA' && !reservation.real_check_in && !reservation.real_check_out;
  }

  isCheckInLoading(reservation: ReservationI | ReservationDetailI | null | undefined): boolean {
    const reservationId = Number(reservation?.id || 0);
    if (!Number.isFinite(reservationId) || reservationId <= 0) return false;
    return this.checkInLoadingIds.has(reservationId);
  }

  performCheckInFromList(reservation: ReservationI | ReservationDetailI | null | undefined): void {
    if (!reservation) return;

    const reservationId = Number(reservation.id);
    if (!Number.isFinite(reservationId) || reservationId <= 0) return;
    if (!this.canCheckInReservation(reservation)) return;
    if (this.checkInLoadingIds.has(reservationId)) return;

    this.errorMessage = '';
    this.checkInLoadingIds.add(reservationId);

    this.reservationService.checkInReservation(reservationId).subscribe({
      next: (detail) => {
        this.checkInLoadingIds.delete(reservationId);
        this.syncReservationDetail(detail);
        this.refreshReservations();
      },
      error: (error: unknown) => {
        this.checkInLoadingIds.delete(reservationId);
        this.errorMessage = this.extractReservationActionError(
          error,
          'No se pudo registrar el check-in de la reserva.'
        );
      }
    });
  }

  canEditReservation(reservation: ReservationI | ReservationDetailI | null | undefined): boolean {
    if (!reservation) return false;
    if (reservation.real_check_in) return false;

    const visual = this.getVisualStatus(reservation as ReservationI);
    return !['EN_CURSO', 'POR_SALIR_HOY', 'CANCELADA', 'FINALIZADA'].includes(visual);
  }

  trackByReservation(_: number, reservation: ReservationI): number {
    return reservation.id;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  trackByCalendarDay(_: number, day: CalendarDayI): string {
    return day.iso;
  }

  trackByCalendarRow(_: number, row: CalendarRoomRowI): string {
    return row.key;
  }

  previousCalendarRange(): void {
    this.calendarStartDate = this.addDays(this.calendarStartDate, -14);
    this.initializeCalendarDays();
    this.preloadReservationDetails(this.filteredReservations.map((reservation) => reservation.id));
  }

  nextCalendarRange(): void {
    this.calendarStartDate = this.addDays(this.calendarStartDate, 14);
    this.initializeCalendarDays();
    this.preloadReservationDetails(this.filteredReservations.map((reservation) => reservation.id));
  }

  goCalendarToday(): void {
    this.calendarStartDate = this.startOfDay(new Date());
    this.initializeCalendarDays();
    this.preloadReservationDetails(this.filteredReservations.map((reservation) => reservation.id));
  }

  getCalendarPeriodLabel(): string {
    if (this.calendarDays.length === 0) return '';

    const first = this.calendarDays[0].date;
    const last = this.calendarDays[this.calendarDays.length - 1].date;

    return `${this.formatDateFromDate(first)} - ${this.formatDateFromDate(last)}`;
  }

  getCalendarBarStyle(bar: CalendarBarI): Record<string, string | number> {
    const statusStyle = this.resolveStatusStyle(bar.status);

    return {
      'left.%': bar.leftPercent,
      'width.%': bar.widthPercent,
      'background-color': statusStyle.borderColor,
      color: 'var(--gh-on-brand)'
    };
  }

  private syncRouteContext(): void {
    const currentPath = this.router.url.split('?')[0].toLowerCase();

    if (currentPath.endsWith('/calendario')) {
      this.viewMode = 'calendar';
    }

    if (currentPath.endsWith('/nueva')) {
      this.showCreateOverlay = true;
    }

    const actionRaw = this.normalizeCode(this.route.snapshot.queryParamMap.get('action') || '');
    const reservationId = Number(this.route.snapshot.queryParamMap.get('reservationId'));
    const roomId = Number(this.route.snapshot.queryParamMap.get('roomId'));

    if (actionRaw === 'CREATE' || actionRaw === 'CHECKIN') {
      this.pendingRouteAction = actionRaw === 'CHECKIN' ? 'checkin' : 'create';
      this.pendingRouteRoomId = Number.isFinite(roomId) && roomId > 0 ? roomId : null;
      return;
    }

    if ((actionRaw === 'DETAIL' || actionRaw === 'EDIT') && Number.isFinite(reservationId) && reservationId > 0) {
      this.pendingRouteReservationId = reservationId;
      this.pendingRouteAction = actionRaw === 'EDIT' ? 'edit' : 'detail';
    }
  }

  private consumePendingRouteReservationAction(): void {
    if (this.pendingRouteAction === 'create' || this.pendingRouteAction === 'checkin') {
      this.showUpdateOverlay = false;
      this.selectedReservationId = null;
      this.selectedReservationDetail = null;
      this.reservationToEdit = null;
      this.createPrefillRoomId = this.pendingRouteRoomId;
      this.createPrefillCheckInMode = this.pendingRouteAction === 'checkin';
      this.showCreateOverlay = true;

      this.pendingRouteReservationId = null;
      this.pendingRouteRoomId = null;
      this.pendingRouteAction = 'detail';
      this.clearRouteReservationActionParams();
      return;
    }

    if (!this.pendingRouteReservationId) return;

    const reservationId = this.pendingRouteReservationId;
    const action = this.pendingRouteAction;
    this.pendingRouteReservationId = null;
    this.pendingRouteRoomId = null;
    this.pendingRouteAction = 'detail';

    if (action === 'edit') {
      this.openUpdateOverlay({ id: reservationId } as ReservationI);
    } else {
      this.openDetailById(reservationId);
    }

    this.clearRouteReservationActionParams();
  }

  private clearRouteReservationActionParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { reservationId: null, roomId: null, action: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private buildReservationPageFilters(includeDeleted = false): {
    search?: string;
    ordering?: string;
    include_finished?: boolean;
    include_inactive?: boolean;
    include_deleted?: boolean;
    page: number;
    page_size: number;
  } {
    const query = this.search.trim();

    return {
      search: query || undefined,
      ordering: '-id',
      include_deleted: includeDeleted ? true : undefined,
      page: this.currentPage,
      page_size: this.pageSize,
    };
  }

  private buildDeletedReservationPageFilters(): {
    ordering?: string;
    include_inactive?: boolean;
    include_deleted?: boolean;
    page: number;
    page_size: number;
  } {
    return {
      ordering: '-id',
      include_inactive: true,
      include_deleted: true,
      page: 1,
      page_size: 200,
    };
  }

  private setReservationPageData(pageData: PaginatedResponseI<ReservationI>): void {
    this.reservations = pageData.results || [];
    this.totalReservationsCount = Number.isFinite(pageData.count) ? pageData.count : this.reservations.length;
    this.hasNextPage = !!pageData.next;
    this.hasPreviousPage = !!pageData.previous;
  }

  private setDeletedReservationPageData(pageData: PaginatedResponseI<ReservationI>): void {
    this.deletedReservations = (pageData.results || []).filter((reservation) =>
      this.isReservationDeleted(reservation)
    );
  }

  private isReservationDeleted(reservation: ReservationI): boolean {
    const record = reservation as unknown as Record<string, unknown>;
    const isDeletedFlag = record['is_deleted'];
    if (typeof isDeletedFlag === 'boolean') return isDeletedFlag;

    const deletedAt = record['deleted_at'];
    if (typeof deletedAt === 'string' && deletedAt.trim()) return true;

    return false;
  }

  private preloadReservationDetails(ids: number[]): void {
    const uniqueIds = Array.from(new Set(ids.filter((id) => !!id)));
    const missingIds = uniqueIds.filter((id) => !this.detailsCache.has(id));

    if (missingIds.length === 0) {
      this.buildCalendarRows();
      return;
    }

    this.detailsLoading = true;

    const requests = missingIds.map((id) =>
      this.reservationService
        .getReservationById(id)
        .pipe(catchError(() => of(null)))
    );

    forkJoin(requests).subscribe({
      next: (details) => {
        for (const detail of details) {
          if (!detail) continue;
          this.detailsCache.set(detail.id, detail);
        }

        this.detailsLoading = false;
        this.selectedReservationDetail = this.selectedReservationId
          ? this.detailsCache.get(this.selectedReservationId) || null
          : null;

        if (this.reservationToEdit?.id) {
          this.reservationToEdit = this.detailsCache.get(this.reservationToEdit.id) || this.reservationToEdit;
        }

        this.buildCalendarRows();
      },
      error: () => {
        this.detailsLoading = false;
        this.buildCalendarRows();
      }
    });
  }

  private ensureReservationDetail(
    reservationId: number,
    callback: (detail: ReservationDetailI) => void
  ): void {
    const cached = this.detailsCache.get(reservationId);
    if (cached) {
      callback(cached);
      return;
    }

    this.reservationService.getReservationById(reservationId).subscribe({
      next: (detail) => {
        this.detailsCache.set(reservationId, detail);
        callback(detail);
      },
      error: () => {
        this.errorMessage = 'No fue posible cargar el detalle de la reserva seleccionada.';
      }
    });
  }

  private initializeCalendarDays(): void {
    const today = this.startOfDay(new Date());

    this.calendarDays = Array.from({ length: 14 }).map((_, index) => {
      const date = this.addDays(this.calendarStartDate, index);

      return {
        date,
        dayLabel: `${date.getDate()}`,
        weekLabel: this.getWeekShort(date),
        iso: this.toIsoDate(date),
        isToday: date.getTime() === today.getTime()
      };
    });
  }

  private buildCalendarRows(): void {
    if (this.calendarDays.length === 0) {
      this.calendarRows = [];
      return;
    }

    const rangeStart = this.calendarDays[0].date;
    const rangeEndExclusive = this.addDays(this.calendarDays[this.calendarDays.length - 1].date, 1);
    const rowMap = new Map<string, CalendarRoomRowI>();

    const source = [...this.filteredReservations].sort((a, b) => {
      const aDate = this.parseDate(a.expected_check_in)?.getTime() || 0;
      const bDate = this.parseDate(b.expected_check_in)?.getTime() || 0;
      return aDate - bDate;
    });

    for (const reservation of source) {
      const detail = this.detailsCache.get(reservation.id);
      if (!detail) continue;

      const roomDetails = detail.rooms_detail?.length ? detail.rooms_detail : [];

      if (roomDetails.length === 0) {
        const bar = this.buildCalendarBar(reservation, rangeStart, rangeEndExclusive);
        if (!bar) continue;

        const rowKey = 'WITHOUT_ROOM';
        const row = rowMap.get(rowKey) || {
          key: rowKey,
          roomNumber: 'Sin habitacion',
          roomType: 'Asignacion pendiente',
          bars: []
        };

        row.bars.push(bar);
        rowMap.set(rowKey, row);
        continue;
      }

      for (const roomDetail of roomDetails) {
        const roomNumber = roomDetail.room_number || String(roomDetail.room);
        const roomMeta = this.roomMap.get(roomDetail.room);

        const bar = this.buildCalendarBar(reservation, rangeStart, rangeEndExclusive);
        if (!bar) continue;

        const rowKey = `ROOM_${roomDetail.room}`;
        const row = rowMap.get(rowKey) || {
          key: rowKey,
          roomNumber: roomNumber,
          roomType: roomMeta?.room_type_name || 'Sin tipo',
          bars: []
        };

        row.bars.push(bar);
        rowMap.set(rowKey, row);
      }
    }

    const rows = Array.from(rowMap.values()).map((row) => ({
      ...row,
      bars: [...row.bars].sort((a, b) => a.startIndex - b.startIndex)
    }));

    rows.sort((a, b) => this.sortRoomNumber(a.roomNumber, b.roomNumber));

    this.calendarRows = rows;
  }

  private buildCalendarBar(
    reservation: ReservationI,
    rangeStart: Date,
    rangeEndExclusive: Date
  ): CalendarBarI | null {
    const reservationStart = this.parseDate(reservation.expected_check_in);
    const reservationEnd = this.parseDate(reservation.expected_check_out);

    if (!reservationStart || !reservationEnd) return null;

    const normalizedReservationEnd = reservationEnd > reservationStart ? reservationEnd : this.addDays(reservationStart, 1);

    const overlapStart = reservationStart > rangeStart ? reservationStart : rangeStart;
    const overlapEnd = normalizedReservationEnd < rangeEndExclusive ? normalizedReservationEnd : rangeEndExclusive;

    if (overlapEnd <= overlapStart) return null;

    const startIndex = this.diffInDays(rangeStart, overlapStart);
    const span = Math.max(1, this.diffInDays(overlapStart, overlapEnd));
    const totalDays = this.calendarDays.length;

    return {
      reservationId: reservation.id,
      reservationCode: this.getReservationCode(reservation),
      guestName: reservation.client_full_name || 'Huesped sin nombre',
      status: this.getVisualStatus(reservation),
      startIndex,
      span,
      leftPercent: (startIndex / totalDays) * 100,
      widthPercent: Math.max((span / totalDays) * 100, 6)
    };
  }

  private getRoomCapacity(roomDetail: { room?: number; room_type_capacity?: number | null }): number {
    const detailCapacity = Number(roomDetail.room_type_capacity || 0);
    if (Number.isFinite(detailCapacity) && detailCapacity > 0) return detailCapacity;

    const roomId = Number(roomDetail.room || 0);
    if (!roomId || Number.isNaN(roomId)) return 0;

    const room = this.roomMap.get(roomId);
    const roomCapacity = Number(room?.room_type_capacity || 0);
    if (!Number.isFinite(roomCapacity) || roomCapacity <= 0) return 0;

    return roomCapacity;
  }

  private getVisualStatus(reservation: ReservationI): ReservationVisualStatus {
    const statusCode = this.normalizeCode(reservation.status_code);

    if (statusCode === 'CANCELADA') return 'CANCELADA';
    if (statusCode === 'FINALIZADA') return 'FINALIZADA';

    if (this.isCheckoutToday(reservation) && ['CONFIRMADA', 'EN_CURSO', 'PENDIENTE'].includes(statusCode)) {
      return 'POR_SALIR_HOY';
    }

    if (statusCode === 'EN_CURSO') return 'EN_CURSO';
    if (statusCode === 'PENDIENTE') return 'PENDIENTE';
    if (statusCode === 'CONFIRMADA') return 'CONFIRMADA';

    return 'OTRA';
  }

  private matchesStatusFilter(reservation: ReservationI, statusFilter: ReservationStatusFilter): boolean {
    if (statusFilter === 'ALL') return true;

    const visualStatus = this.getVisualStatus(reservation);

    if (statusFilter === 'POR_SALIR_HOY') {
      return visualStatus === 'POR_SALIR_HOY';
    }

    return visualStatus === statusFilter;
  }

  private resolveStatusStyle(status: ReservationVisualStatus): ReservationStatusStyleI {
    switch (status) {
      case 'CONFIRMADA':
        return {
          label: 'Confirmada',
          chipBg: 'var(--gh-status-info-bg)',
          chipColor: 'var(--gh-status-info-text)',
          dotColor: 'var(--gh-status-info-strong)',
          borderColor: 'var(--gh-status-info-strong)',
          actionBg: 'var(--gh-status-info-strong)',
          actionColor: 'var(--gh-on-brand)'
        };
      case 'PENDIENTE':
        return {
          label: 'Pendiente',
          chipBg: 'var(--gh-status-warn-bg)',
          chipColor: 'var(--gh-status-warn-text)',
          dotColor: 'var(--gh-status-warn-strong)',
          borderColor: 'var(--gh-status-warn-strong)',
          actionBg: 'var(--gh-status-warn-text)',
          actionColor: 'var(--gh-on-brand)'
        };
      case 'EN_CURSO':
        return {
          label: 'En curso',
          chipBg: 'var(--gh-status-success-bg)',
          chipColor: 'var(--gh-status-success-text)',
          dotColor: 'var(--gh-status-success-strong-alt)',
          borderColor: 'var(--gh-status-success-strong-alt)',
          actionBg: 'var(--gh-status-success-strong-alt)',
          actionColor: 'var(--gh-on-brand)'
        };
      case 'POR_SALIR_HOY':
        return {
          label: 'Por salir hoy',
          chipBg: 'var(--gh-status-orange-bg)',
          chipColor: 'var(--gh-status-orange-text)',
          dotColor: 'var(--gh-status-orange-strong)',
          borderColor: 'var(--gh-status-orange-strong)',
          actionBg: 'var(--gh-status-orange-strong)',
          actionColor: 'var(--gh-on-brand)'
        };
      case 'CANCELADA':
        return {
          label: 'Cancelada',
          chipBg: 'var(--gh-status-neutral-bg)',
          chipColor: 'var(--gh-status-neutral-text)',
          dotColor: 'var(--gh-text-soft)',
          borderColor: 'var(--gh-text-soft)',
          actionBg: 'var(--gh-text-muted)',
          actionColor: 'var(--gh-on-brand)'
        };
      case 'FINALIZADA':
        return {
          label: 'Finalizada',
          chipBg: 'var(--gh-status-neutral-bg)',
          chipColor: 'var(--gh-status-neutral-text)',
          dotColor: 'var(--gh-text-muted)',
          borderColor: 'var(--gh-text-muted)',
          actionBg: 'var(--gh-text-muted)',
          actionColor: 'var(--gh-on-brand)'
        };
      default:
        return {
          label: 'Sin estado',
          chipBg: 'var(--gh-status-neutral-bg)',
          chipColor: 'var(--gh-status-neutral-text)',
          dotColor: 'var(--gh-text-soft)',
          borderColor: 'var(--gh-text-soft)',
          actionBg: 'var(--gh-text-muted)',
          actionColor: 'var(--gh-on-brand)'
        };
    }
  }

  private calculateReservationAmount(reservation: ReservationI): number {
    const backendTotal = Number(reservation.total_amount);
    if (Number.isFinite(backendTotal) && backendTotal >= 0) {
      return backendTotal;
    }

    const detail = this.detailsCache.get(reservation.id);

    if (!detail) {
      const fallbackSubtotal = Number(reservation.rooms_subtotal || 0);
      const fallbackPackage = Number(reservation.package_price || 0);
      const fallbackDiscount = Number(reservation.total_discount || 0);
      const subtotal = Number.isNaN(fallbackSubtotal) ? 0 : fallbackSubtotal;
      const packageAmount = Number.isNaN(fallbackPackage) ? 0 : fallbackPackage;
      const discount = Number.isNaN(fallbackDiscount) ? 0 : fallbackDiscount;
      return Math.max(0, subtotal + packageAmount - discount);
    }

    const roomsTotal = (detail.rooms_detail || []).reduce((sum, room) => {
      const subtotal = Number(room.subtotal || 0);
      if (Number.isNaN(subtotal)) return sum;
      return sum + subtotal;
    }, 0);
    const packageAmount = Number(detail.package_price || reservation.package_price || 0);

    const discount = Number(detail.total_discount || reservation.total_discount || 0);

    return Math.max(0, roomsTotal + (Number.isNaN(packageAmount) ? 0 : packageAmount) - (Number.isNaN(discount) ? 0 : discount));
  }

  private calculateDepositsAmount(reservation: ReservationI): number {
    const backendDeposits = Number(reservation.total_deposits);
    if (Number.isFinite(backendDeposits) && backendDeposits >= 0) {
      return backendDeposits;
    }

    const detail = this.detailsCache.get(reservation.id);
    if (!detail) return 0;

    return (detail.deposits || []).reduce((sum, deposit) => {
      const amount = Number(deposit.amount || 0);
      return sum + (Number.isNaN(amount) ? 0 : amount);
    }, 0);
  }

  private syncReservationDetail(detail: ReservationDetailI): void {
    this.detailsCache.set(detail.id, detail);

    if (this.selectedReservationId === detail.id) {
      this.selectedReservationDetail = detail;
    }

    if (this.reservationToEdit?.id === detail.id) {
      this.reservationToEdit = detail;
    }
  }

  private extractReservationActionError(error: unknown, fallback: string): string {
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

  private normalizeCode(value: string | undefined): string {
    return String(value || '').trim().toUpperCase();
  }

  private isCheckoutToday(reservation: ReservationI): boolean {
    return this.isToday(reservation.expected_check_out);
  }

  private isToday(value: string | null | undefined): boolean {
    const date = value ? this.parseDate(value) : null;
    if (!date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    return date.getTime() === today.getTime();
  }

  private parseDate(value: string): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;

      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const datetime = new Date(value);
    if (Number.isNaN(datetime.getTime())) return null;

    return datetime;
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private diffInDays(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
  }

  private getWeekShort(date: Date): string {
    return date
      .toLocaleDateString('es-CO', { weekday: 'short' })
      .replace('.', '')
      .slice(0, 1)
      .toUpperCase();
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private sortRoomNumber(a: string, b: string): number {
    const parse = (value: string): number => {
      const match = value.match(/\d+/);
      if (!match) return Number.MAX_SAFE_INTEGER;
      return Number(match[0]);
    };

    const diff = parse(a) - parse(b);
    if (diff !== 0) return diff;

    return a.localeCompare(b, 'es-CO');
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';

    const date = this.parseDate(value);
    if (!date) return value;

    return this.formatDateFromDate(date);
  }

  private formatDateFromDate(date: Date): string {
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatDateShort(date: Date): string {
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short'
    });
  }

  private getNights(reservation: ReservationI): number {
    if (typeof reservation.total_nights === 'number') return reservation.total_nights;

    const checkIn = this.parseDate(reservation.expected_check_in);
    const checkOut = this.parseDate(reservation.expected_check_out);
    if (!checkIn || !checkOut) return 0;

    const nights = this.diffInDays(checkIn, checkOut);
    return nights > 0 ? nights : 0;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private formatFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private escapeCsvCell(value: unknown): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private dedupeMasterDataByCode(items: MasterDataI[]): MasterDataI[] {
    const uniqueMap = new Map<string, MasterDataI>();

    for (const item of items) {
      const code = this.normalizeCode(item.code);
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
}

