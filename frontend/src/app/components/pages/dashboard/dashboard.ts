import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { catchError, forkJoin, of } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { ChargeI, InvoiceI, PaymentI } from '../../../modules/billing/billing-model';
import { InventoryMovementI } from '../../../modules/inventory-movements/inventory-movement-model';
import { ItemI } from '../../../modules/items/item-model';
import { MaintenanceOrderI } from '../../../modules/maintenance-orders/maintenance-order-model';
import { ReservationI } from '../../../modules/reservations/reservation-model';
import { RoomI } from '../../../modules/rooms/room-model';
import { BillingService } from '../../../services/billing';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { ItemsService } from '../../../services/item';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { NotificationStateService } from '../../../services/notification-state';
import { ReservationService } from '../../../services/reservation';
import { RoomService } from '../../../services/room';
import { AuthService } from '../../../services/auth/auth';

type MetricTone = 'blue' | 'green' | 'violet' | 'amber' | 'red';
type RoomState = 'occupied' | 'free' | 'maintenance' | 'cleaning' | 'reserved';
type AvatarTone = 'indigo' | 'pink' | 'orange' | 'green' | 'blue' | 'purple' | 'cyan';
type AlertTone = 'warning' | 'info' | 'success';
type ServiceTone = 'orange' | 'violet' | 'pink' | 'blue' | 'teal';
type ActivityTone = 'green' | 'blue' | 'orange' | 'amber' | 'violet' | 'red' | 'gold';
type ActionTone = 'primary' | 'neutral' | 'gold';
type RoomFilterState = 'ALL' | RoomState;
type NavigationQuery = Record<string, string | number | boolean>;

interface MetricCard {
  label: string;
  value: string;
  note: string;
  trend: string;
  trendPositive: boolean;
  icon: string;
  tone: MetricTone;
}

interface RoomTile {
  number: string;
  kind: string;
  detail: string;
  state: RoomState;
  floorId: number | null;
  floorLabel: string;
}

interface StayEvent {
  initials: string;
  guest: string;
  detail: string;
  time: string;
  status: string;
  amount?: string;
  avatarTone: AvatarTone;
}

interface AlertItem {
  id: string;
  text: string;
  age: string;
  action: string;
  tone: AlertTone;
  route: string;
  unread: boolean;
  queryParams?: NavigationQuery;
}

interface ServiceItem {
  name: string;
  transactions: number;
  amount: string;
  ratio: number;
  tone: ServiceTone;
  icon: string;
}

interface ActivityItem {
  text: string;
  time: string;
  tone: ActivityTone;
  icon: string;
}

interface QuickAction {
  label: string;
  icon: string;
  tone: ActionTone;
  route: string;
  queryParams?: NavigationQuery;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxNotificationAgeDays = 7;
  private readAlertIds = new Set<string>();

  isLoading = false;
  loadError = '';

  currentTimeLabel = '';
  todayLabel = '';
  currentUserDisplayName = 'Usuario';

  metrics: MetricCard[] = [];
  occupancyChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  occupancyChartOptions: ChartOptions<'bar'> = {};
  incomeChartData: ChartData<'line'> = { labels: [], datasets: [] };
  incomeChartOptions: ChartOptions<'line'> = {};

  roomLegend = [
    { label: 'Ocupada (0)', state: 'occupied' as RoomState },
    { label: 'Libre (0)', state: 'free' as RoomState },
    { label: 'Mantenimiento (0)', state: 'maintenance' as RoomState },
    { label: 'Limpieza (0)', state: 'cleaning' as RoomState },
    { label: 'Reservada (0)', state: 'reserved' as RoomState },
  ];

  allRoomTiles: RoomTile[] = [];
  roomTiles: RoomTile[] = [];
  roomStateFilter: RoomFilterState = 'ALL';
  roomFloorFilter: number | 'ALL' = 'ALL';
  roomFloorFilterOptions: Array<{ id: number; label: string }> = [];
  readonly roomStateFilterOptions: Array<{ value: RoomFilterState; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'occupied', label: 'Ocupadas' },
    { value: 'free', label: 'Libres' },
    { value: 'maintenance', label: 'Mantenimiento' },
    { value: 'cleaning', label: 'Limpieza' },
    { value: 'reserved', label: 'Reservadas' },
  ];

  checkInsToday: StayEvent[] = [];
  checkOutsToday: StayEvent[] = [];
  alerts: AlertItem[] = [];
  servicesToday: ServiceItem[] = [];
  serviceTotalLabel = '$0';
  activityFeed: ActivityItem[] = [];

  readonly quickActions: QuickAction[] = [
    { label: 'Nuevo Check-in', icon: 'fa-solid fa-right-to-bracket', tone: 'primary', route: '/reservas', queryParams: { action: 'CHECKIN' } },
    { label: 'Registrar Salida', icon: 'fa-solid fa-right-from-bracket', tone: 'neutral', route: '/reservas' },
    { label: 'Nueva Reserva', icon: 'fa-regular fa-calendar-plus', tone: 'neutral', route: '/reservas', queryParams: { action: 'CREATE' } },
    { label: 'Cobrar Cuenta', icon: 'fa-regular fa-credit-card', tone: 'neutral', route: '/facturas' },
    { label: 'Ver Reportes', icon: 'fa-solid fa-wave-square', tone: 'gold', route: '/reportes' },
  ];

  private readonly weekdayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  private readonly avatarTones: AvatarTone[] = ['indigo', 'pink', 'orange', 'green', 'blue', 'purple', 'cyan'];
  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

  constructor(
    private router: Router,
    private roomService: RoomService,
    private reservationService: ReservationService,
    private billingService: BillingService,
    private itemsService: ItemsService,
    private maintenanceOrdersService: MaintenanceOrdersService,
    private inventoryMovementsService: InventoryMovementsService,
    private notificationStateService: NotificationStateService,
    private authService: AuthService
  ) {}

  get dayResume(): string {
    return `Hoy tienes ${this.checkInsToday.length} check-ins y ${this.checkOutsToday.length} check-outs programados.`;
  }

  get roomPanelSummary(): string {
    if (!this.allRoomTiles.length) return 'Sin habitaciones registradas';
    if (this.roomStateFilter === 'ALL' && this.roomFloorFilter === 'ALL') {
      return `${this.allRoomTiles.length} habitaciones totales`;
    }
    return `${this.roomTiles.length} de ${this.allRoomTiles.length} habitaciones`;
  }

  get unreadAlertsCount(): number {
    return this.alerts.reduce((sum, alert) => sum + (alert.unread ? 1 : 0), 0);
  }

  ngOnInit(): void {
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
    this.loadCurrentUserDisplayName();
    this.loadReadAlertIds();
    this.refreshData();
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  refreshData(): void {
    this.isLoading = true;
    this.loadError = '';

    forkJoin({
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      reservations: this.reservationService
        .listReservations({ include_finished: true, page_size: 350, ordering: '-expected_check_in' })
        .pipe(catchError(() => of([] as ReservationI[]))),
      invoices: this.billingService
        .listInvoices({ ordering: '-id' })
        .pipe(catchError(() => of([] as InvoiceI[]))),
      payments: this.billingService
        .listPayments({ ordering: '-payment_date', include_inactive: false })
        .pipe(catchError(() => of([] as PaymentI[]))),
      charges: this.billingService
        .listCharges({ ordering: '-charge_date', is_active: true })
        .pipe(catchError(() => of([] as ChargeI[]))),
      items: this.itemsService.listItems({ ordering: 'stock' }).pipe(catchError(() => of([] as ItemI[]))),
      maintenance: this.maintenanceOrdersService
        .listMaintenanceOrders({ ordering: '-reported_at' })
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      movements: this.inventoryMovementsService
        .listInventoryMovements({ ordering: '-movement_date' })
        .pipe(catchError(() => of([] as InventoryMovementI[]))),
    }).subscribe({
      next: (data) => {
        this.bindData(data);
        this.isLoading = false;
      },
      error: () => {
        this.loadError = 'No fue posible cargar datos reales del backend.';
        this.isLoading = false;
      },
    });
  }

  openCheckInsList(): void {
    this.navigateTo('/reservas');
  }

  openCheckOutsList(): void {
    this.navigateTo('/reservas');
  }

  openActivityLog(): void {
    this.navigateTo('/actividad');
  }

  onAlertAction(alert: AlertItem): void {
    if (alert.id !== 'none' && alert.unread) {
      this.readAlertIds.add(alert.id);
      this.alerts = this.applyAlertReadState(this.alerts);
      this.notificationStateService
        .markRead([alert.id])
        .pipe(catchError(() => of(void 0)))
        .subscribe();
    }
    this.navigateTo(alert.route, alert.queryParams);
  }

  onQuickAction(action: QuickAction): void {
    this.navigateTo(action.route, action.queryParams);
  }

  private bindData(data: {
    rooms: RoomI[];
    reservations: ReservationI[];
    invoices: InvoiceI[];
    payments: PaymentI[];
    charges: ChargeI[];
    items: ItemI[];
    maintenance: MaintenanceOrderI[];
    movements: InventoryMovementI[];
  }): void {
    const today = this.getToday();
    const yesterday = this.addDays(today, -1);

    this.allRoomTiles = this.buildRoomTiles(data.rooms);
    this.roomFloorFilterOptions = this.buildFloorFilterOptions(this.allRoomTiles);
    if (this.roomFloorFilter !== 'ALL' && !this.roomFloorFilterOptions.some((floor) => floor.id === this.roomFloorFilter)) {
      this.roomFloorFilter = 'ALL';
    }
    this.applyRoomFilters();

    this.checkInsToday = this.buildStayEvents(data.reservations, 'in');
    this.checkOutsToday = this.buildStayEvents(data.reservations, 'out');

    const occupied = this.allRoomTiles.filter((room) => room.state === 'occupied').length;
    const totalRooms = this.allRoomTiles.length;
    const occupancyPct = totalRooms > 0 ? (occupied * 100) / totalRooms : 0;
    const occupancyBase = Math.max(0, occupied - (this.checkInsToday.length - this.checkOutsToday.length));

    const incomeToday = this.sumPaymentsForDate(data.payments, today);
    const incomeYesterday = this.sumPaymentsForDate(data.payments, yesterday);
    const inHouseGuests = this.countInHouseGuests(data.reservations);
    const reservationPendingById = new Map(
      data.reservations.map((reservation) => [reservation.id, this.toNumber(reservation.pending_amount)])
    );
    const pendingIssuedInvoices = data.invoices.filter((invoice) => {
      if (!invoice.is_active) return false;
      if (this.normalizeCode(invoice.status_code) !== 'EMITIDA') return false;
      return (reservationPendingById.get(invoice.reservation) ?? 0) > 0;
    });
    const pendingReservationIds = new Set(pendingIssuedInvoices.map((invoice) => invoice.reservation));
    const pendingTotal = [...pendingReservationIds].reduce(
      (sum, reservationId) => sum + (reservationPendingById.get(reservationId) ?? 0),
      0
    );

    this.metrics = [
      {
        label: 'Ocupación',
        value: `${Math.round(occupancyPct)}%`,
        note: `${occupied} / ${totalRooms} habitaciones`,
        trend: this.formatSignedPercent(this.computeDelta(occupied, occupancyBase || occupied)),
        trendPositive: occupied >= occupancyBase,
        icon: 'fa-solid fa-bed',
        tone: 'blue',
      },
      {
        label: 'Ingresos hoy',
        value: this.formatCurrency(incomeToday),
        note: `vs ayer ${this.formatCurrency(incomeYesterday)}`,
        trend: this.formatSignedPercent(this.computeDelta(incomeToday, incomeYesterday)),
        trendPositive: incomeToday >= incomeYesterday,
        icon: 'fa-regular fa-money-bill-1',
        tone: 'green',
      },
      {
        label: 'Huéspedes',
        value: this.formatInteger(inHouseGuests),
        note: 'En casa ahora',
        trend: `${this.checkInsToday.length} llegadas hoy`,
        trendPositive: true,
        icon: 'fa-solid fa-users',
        tone: 'violet',
      },
      {
        label: 'RevPAR',
        value: this.formatCurrency(totalRooms > 0 ? incomeToday / totalRooms : 0),
        note: 'Ingreso / hab / noche',
        trend: this.formatSignedPercent(this.computeDelta(incomeToday, incomeYesterday)),
        trendPositive: incomeToday >= incomeYesterday,
        icon: 'fa-solid fa-percent',
        tone: 'amber',
      },
      {
        label: 'Cuentas pendientes',
        value: this.formatCurrency(pendingTotal),
        note: 'Facturas emitidas por cobrar',
        trend: pendingIssuedInvoices.length > 0 ? `${pendingIssuedInvoices.length} facturas emitidas con saldo` : 'Sin facturas emitidas pendientes',
        trendPositive: pendingIssuedInvoices.length === 0,
        icon: 'fa-regular fa-rectangle-list',
        tone: 'red',
      },
    ];

    const chartPalette = this.getChartPalette();
    const occupancySeries = this.buildOccupancySeries(data.reservations, totalRooms);
    const occupancyMax = Math.max(...occupancySeries.occupiedValues, ...occupancySeries.freeValues, totalRooms, 1);
    this.occupancyChartData = {
      labels: occupancySeries.labels,
      datasets: [
        {
          label: 'Ocupadas',
          data: occupancySeries.occupiedValues,
          backgroundColor: chartPalette.occupied,
          borderColor: chartPalette.occupied,
          borderRadius: 8,
          maxBarThickness: 20,
          categoryPercentage: 0.72,
          barPercentage: 0.88,
        },
        {
          label: 'Libres',
          data: occupancySeries.freeValues,
          backgroundColor: chartPalette.free,
          borderColor: chartPalette.free,
          borderRadius: 8,
          maxBarThickness: 20,
          categoryPercentage: 0.72,
          barPercentage: 0.88,
        },
      ],
    };
    this.occupancyChartOptions = this.buildBarOptions(occupancyMax);

    const incomeSeries = this.buildIncomeSeries(data.payments);
    this.incomeChartData = {
      labels: incomeSeries.labels,
      datasets: [{
        label: 'Ingresos',
        data: incomeSeries.values,
        borderColor: chartPalette.revenue,
        backgroundColor: chartPalette.revenueFill,
        pointBackgroundColor: chartPalette.revenue,
        pointBorderColor: chartPalette.revenue,
        pointRadius: 3,
        pointHoverRadius: 4,
        tension: 0.35,
        fill: true,
      }],
    };
    this.incomeChartOptions = this.buildLineOptions(Math.max(...incomeSeries.values, 1000));

    this.servicesToday = this.buildServices(data.charges);
    this.serviceTotalLabel = this.formatCurrency(
      data.charges
        .filter((charge) => this.isSameDay(this.parseDateTime(charge.charge_date || null), today))
        .reduce((sum, charge) => sum + this.toNumber(charge.total_amount), 0)
    );
    this.alerts = this.applyAlertReadState(this.buildAlerts(data.items, data.maintenance, data.reservations));
    this.activityFeed = this.buildActivity(data.payments, data.movements);

    const hasData = data.rooms.length > 0 || data.reservations.length > 0 || data.invoices.length > 0 || data.payments.length > 0;
    this.loadError = hasData ? '' : 'No hay datos del backend para mostrar en el dashboard.';
  }

  private navigateTo(route: string, queryParams?: NavigationQuery): void {
    void this.router.navigate([route], queryParams ? { queryParams } : undefined);
  }

  private buildRoomTiles(rooms: RoomI[]): RoomTile[] {
    return [...rooms]
      .sort((a, b) => {
        const floorDiff = this.toNumber(a.floor) - this.toNumber(b.floor);
        if (floorDiff !== 0) return floorDiff;
        return (Number(a.number) || a.id) - (Number(b.number) || b.id);
      })
      .map((room) => {
        const state = this.mapRoomState(room.status);
        const guest = room.active_reservation?.client_name || room.active_reservation?.client?.full_name || '';
        const floorId = Number(room.floor);
        const floorNumber = Number(room.florr_number);
        const floorLabel =
          String(room.floor_name || '').trim() ||
          (Number.isFinite(floorNumber) && floorNumber > 0 ? `Piso ${floorNumber}` : Number.isFinite(floorId) && floorId > 0 ? `Piso ${floorId}` : 'Sin piso');

        return {
          number: String(room.number || room.id),
          kind: this.abbreviateRoomType(room.room_type_name),
          detail: state === 'occupied' && guest ? this.getInitials(guest) : state === 'maintenance' ? 'Mantenimiento' : state === 'cleaning' ? 'Limpieza' : '-',
          state,
          floorId: Number.isFinite(floorId) && floorId > 0 ? floorId : null,
          floorLabel,
        };
      });
  }

  private buildFloorFilterOptions(roomTiles: RoomTile[]): Array<{ id: number; label: string }> {
    const floors = new Map<number, string>();

    roomTiles.forEach((tile) => {
      if (tile.floorId === null) return;
      if (!floors.has(tile.floorId)) {
        floors.set(tile.floorId, tile.floorLabel || `Piso ${tile.floorId}`);
      }
    });

    return [...floors.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([id, label]) => ({ id, label }));
  }

  applyRoomFilters(): void {
    this.roomTiles = this.allRoomTiles.filter((room) => {
      const statusMatch = this.roomStateFilter === 'ALL' || room.state === this.roomStateFilter;
      const floorMatch = this.roomFloorFilter === 'ALL' || room.floorId === this.roomFloorFilter;
      return statusMatch && floorMatch;
    });
    this.roomLegend = this.buildRoomLegend(this.roomTiles);
  }

  private buildRoomLegend(roomTiles: RoomTile[]): Array<{ label: string; state: RoomState }> {
    const counts = { occupied: 0, free: 0, maintenance: 0, cleaning: 0, reserved: 0 };
    roomTiles.forEach((tile) => {
      counts[tile.state] += 1;
    });

    return [
      { label: `Ocupada (${counts.occupied})`, state: 'occupied' },
      { label: `Libre (${counts.free})`, state: 'free' },
      { label: `Mantenimiento (${counts.maintenance})`, state: 'maintenance' },
      { label: `Limpieza (${counts.cleaning})`, state: 'cleaning' },
      { label: `Reservada (${counts.reserved})`, state: 'reserved' },
    ];
  }

  private buildStayEvents(reservations: ReservationI[], mode: 'in' | 'out'): StayEvent[] {
    const today = this.getToday();

    return reservations
      .filter((reservation) => {
        const date = this.parseDateOnly(mode === 'in' ? reservation.expected_check_in : reservation.expected_check_out);
        if (!date || !this.isSameDay(date, today)) return false;
        if (this.isCanceled(reservation)) return false;
        if (mode === 'in' && reservation.real_check_in) return false;
        if (mode === 'out' && reservation.real_check_out) return false;
        return true;
      })
      .slice(0, mode === 'in' ? 5 : 3)
      .map((reservation, index) => {
        const guest = reservation.client_full_name?.trim() || `Cliente #${reservation.client}`;
        const rooms = Math.max(1, Math.round(this.toNumber(reservation.total_rooms)));
        const nights = this.getNights(reservation);

        return {
          initials: this.getInitials(guest),
          guest,
          detail: `Reserva #${reservation.id} - ${rooms} hab. - ${nights} noches`,
          time: '--:--',
          status: mode === 'in' ? (String(reservation.status_code || '').toUpperCase().includes('PENDIENTE') ? 'Pendiente' : 'Confirmado') : 'Programado',
          amount: mode === 'out' ? this.formatCurrency(this.toNumber(reservation.pending_amount ?? reservation.total_amount)) : undefined,
          avatarTone: this.avatarTones[index % this.avatarTones.length],
        };
      });
  }

  private buildOccupancySeries(
    reservations: ReservationI[],
    totalRooms: number
  ): { labels: string[]; occupiedValues: number[]; freeValues: number[] } {
    const dates = this.lastDays(7);
    const occupiedValues = dates.map((day) => {
      const occupied = reservations.reduce((sum, reservation) => {
        if (this.isCanceled(reservation)) return sum;
        const checkIn = this.parseDateOnly(reservation.expected_check_in);
        const checkOut = this.parseDateOnly(reservation.expected_check_out);
        if (!checkIn || !checkOut) return sum;
        if (day < checkIn || day >= checkOut) return sum;
        return sum + Math.max(1, Math.round(this.toNumber(reservation.total_rooms)));
      }, 0);
      return Math.min(totalRooms, occupied);
    });
    const freeValues = occupiedValues.map((occupied) => Math.max(totalRooms - occupied, 0));

    return {
      labels: dates.map((day, index) => (index === dates.length - 1 ? 'Hoy' : this.weekdayLabels[day.getDay()] || '')),
      occupiedValues,
      freeValues,
    };
  }

  private buildIncomeSeries(payments: PaymentI[]): { labels: string[]; values: number[] } {
    const dates = this.lastDays(7);
    return {
      labels: dates.map((day, index) => (index === dates.length - 1 ? 'Hoy' : this.weekdayLabels[day.getDay()] || '')),
      values: dates.map((day) => this.sumPaymentsForDate(payments, day)),
    };
  }

  private buildServices(charges: ChargeI[]): ServiceItem[] {
    const today = this.getToday();
    const groups = new Map<string, { amount: number; transactions: number }>();

    charges
      .filter((charge) => this.isSameDay(this.parseDateTime(charge.charge_date || null), today))
      .forEach((charge) => {
        const key = charge.service_name || charge.charge_type_name || 'Otros';
        const current = groups.get(key) ?? { amount: 0, transactions: 0 };
        current.amount += this.toNumber(charge.total_amount);
        current.transactions += 1;
        groups.set(key, current);
      });

    const rows = [...groups.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const tones: ServiceTone[] = ['orange', 'violet', 'pink', 'blue', 'teal'];

    if (!rows.length) {
      return [{ name: 'Sin movimientos', transactions: 0, amount: this.formatCurrency(0), ratio: 0, tone: 'blue', icon: 'fa-solid fa-receipt' }];
    }

    return rows.map((row, index) => ({
      name: row.name,
      transactions: row.transactions,
      amount: this.formatCurrency(row.amount),
      ratio: total > 0 ? Math.round((row.amount / total) * 100) : 0,
      tone: tones[index % tones.length],
      icon: this.serviceIcon(row.name),
    }));
  }
  private buildAlerts(items: ItemI[], maintenance: MaintenanceOrderI[], reservations: ReservationI[]): AlertItem[] {
    const alerts: AlertItem[] = [];

    items
      .filter((item) => item.minimum_stock > 0 && item.stock <= item.minimum_stock)
      .slice(0, 3)
      .forEach((item) => {
        const occurredAt = this.parseDateTime(item.updated_at || item.created_at || null);
        if (this.isOlderThanMaxDays(occurredAt, this.maxNotificationAgeDays)) return;
        alerts.push({
          id: `item-${item.id}`,
          text: `${item.name} bajo stock - ${item.stock} unidades`,
          age: this.relativeFromNow(occurredAt),
          action: 'Ver inventario',
          tone: 'warning',
          route: '/items',
          unread: true,
          queryParams: { search: item.name },
        });
      });

    maintenance
      .filter((order) => !String(order.status_label || order.status || '').toUpperCase().includes('COMPLET'))
      .slice(0, 2)
      .forEach((order) => {
        const occurredAt = this.parseDateTime(order.reported_at || null);
        if (this.isOlderThanMaxDays(occurredAt, this.maxNotificationAgeDays)) return;
        alerts.push({
          id: `mnt-${order.id}`,
          text: `${order.title} - Hab. ${order.room_number || order.room || '-'}`,
          age: this.relativeFromNow(occurredAt),
          action: 'Ver mantenimiento',
          tone: 'info',
          route: '/ordenes-mantenimiento',
          unread: true,
          queryParams: { search: order.title },
        });
      });

    const today = this.getToday();
    const upcoming = reservations.find((reservation) => {
      const checkIn = this.parseDateOnly(reservation.expected_check_in);
      if (!checkIn || this.isCanceled(reservation) || reservation.real_check_in) return false;
      const diff = this.dayDifference(today, checkIn);
      return diff >= 0 && diff <= 1;
    });

    if (upcoming) {
      const checkInDate = this.parseDateOnly(upcoming.expected_check_in);
      const diff = checkInDate ? this.dayDifference(today, checkInDate) : 0;
      alerts.push({
        id: `res-${upcoming.id}`,
        text: `Check-in próximo: ${upcoming.client_full_name || `Cliente #${upcoming.client}`}`,
        age: diff === 0 ? 'Llega hoy' : 'Llega mañana',
        action: 'Ver reserva',
        tone: 'info',
        route: '/reservas',
        unread: true,
        queryParams: { search: String(upcoming.id) },
      });
    }

    if (!alerts.length) {
      return [{ id: 'none', text: 'Sistema operativo', age: 'El sistema está funcionando correctamente.', action: 'Ver panel', tone: 'success', route: '/dashboard', unread: false }];
    }

    return alerts.slice(0, 6);
  }

  private applyAlertReadState(alerts: AlertItem[]): AlertItem[] {
    return alerts.map((alert) => {
      if (alert.id === 'none') return { ...alert, unread: false };
      return { ...alert, unread: !this.readAlertIds.has(alert.id) };
    });
  }

  private loadReadAlertIds(): void {
    this.notificationStateService
      .listReadKeys()
      .pipe(catchError(() => of([] as string[])))
      .subscribe((keys) => {
        this.readAlertIds = new Set<string>(keys);
        this.alerts = this.applyAlertReadState(this.alerts);
      });
  }

  private buildActivity(payments: PaymentI[], movements: InventoryMovementI[]): ActivityItem[] {
    const rows: Array<{ date: Date; item: ActivityItem }> = [];

    payments.slice(0, 4).forEach((payment) => {
      const date = this.parseDateTime(payment.payment_date || payment.created_at || null);
      if (!date) return;
      rows.push({
        date,
        item: {
          text: `Pago recibido ${this.formatCurrency(this.toNumber(payment.amount))} - ${payment.invoice_number || `Factura #${payment.invoice}`}`,
          time: this.formatTime(date),
          tone: 'blue',
          icon: 'fa-solid fa-wallet',
        },
      });
    });

    movements.slice(0, 3).forEach((movement) => {
      const date = this.parseDateTime(movement.movement_date || movement.created_at || null);
      if (!date) return;
      rows.push({
        date,
        item: {
          text: `${movement.movement_type_name || 'Movimiento'}: ${movement.quantity} uds - ${movement.item_name || `Item #${movement.item}`}`,
          time: this.formatTime(date),
          tone: 'amber',
          icon: 'fa-solid fa-box-open',
        },
      });
    });

    const sorted = rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 7).map((row) => row.item);
    if (!sorted.length) {
      return [{ text: 'Sin actividad reciente', time: '--:--', tone: 'gold', icon: 'fa-regular fa-star' }];
    }
    return sorted;
  }

  private buildBarOptions(maxValue: number): ChartOptions<'bar'> {
    const max = Math.max(5, Math.ceil(maxValue / 5) * 5);
    const chartPalette = this.getChartPalette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartPalette.tick, font: { size: 11 } }, border: { display: false } },
        y: {
          min: 0,
          max,
          ticks: { stepSize: Math.max(1, Math.round(max / 4)), color: chartPalette.tick, font: { size: 11 } },
          grid: { color: chartPalette.grid },
          border: { display: false },
        },
      },
    };
  }

  private buildLineOptions(maxValue: number): ChartOptions<'line'> {
    const max = Math.max(1000, Math.ceil(maxValue / 1000) * 1000);
    const chartPalette = this.getChartPalette();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: chartPalette.gridSoft }, ticks: { color: chartPalette.tick, font: { size: 11 } }, border: { display: false } },
        y: {
          min: 0,
          max,
          ticks: {
            color: chartPalette.tick,
            font: { size: 11 },
            callback: (value) => this.formatCompactCurrency(this.toNumber(value)),
          },
          grid: { color: chartPalette.grid },
          border: { display: false },
        },
      },
    };
  }

  private getChartPalette(): {
    occupied: string;
    free: string;
    revenue: string;
    revenueFill: string;
    tick: string;
    grid: string;
    gridSoft: string;
  } {
    const occupied = '#0b65d8';
    const free = '#20c96b';
    const revenue = '#0b65d8';
    const tick = '#586576';
    const grid = '#dde6f2';
    const gridSoft = '#eef3fa';
    const revenueFill = 'rgba(11, 101, 216, 0.08)';

    return { occupied, free, revenue, revenueFill, tick, grid, gridSoft };
  }

  private readThemeColor(token: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  private mapRoomState(status: string): RoomState {
    const code = String(status || '').toUpperCase();
    if (code === 'OCUPADA') return 'occupied';
    if (code === 'RESERVADA') return 'reserved';
    if (code === 'MANTENIMIENTO' || code === 'FUERA_DE_SERVICIO') return 'maintenance';
    if (code === 'LIMPIEZA') return 'cleaning';
    return 'free';
  }

  private normalizeCode(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }

  private abbreviateRoomType(value?: string): string {
    const label = String(value || 'Std').trim();
    if (label.length <= 4) return label;
    if (label.toUpperCase().includes('IND')) return 'Ind';
    if (label.toUpperCase().includes('DOB')) return 'Dbl';
    if (label.toUpperCase().includes('SUI')) return 'Suite';
    return label.slice(0, 3);
  }

  private serviceIcon(name: string): string {
    const value = name.toUpperCase();
    if (value.includes('RESTAUR')) return 'fa-solid fa-utensils';
    if (value.includes('BAR')) return 'fa-solid fa-martini-glass-citrus';
    if (value.includes('SPA')) return 'fa-solid fa-spa';
    if (value.includes('PARQ')) return 'fa-solid fa-car-side';
    if (value.includes('MINIBAR')) return 'fa-solid fa-wine-bottle';
    return 'fa-solid fa-concierge-bell';
  }

  private isCanceled(reservation: ReservationI): boolean {
    return String(reservation.status_code || reservation.status_name || '').toUpperCase().includes('CANCEL');
  }

  private getNights(reservation: ReservationI): number {
    const checkIn = this.parseDateOnly(reservation.expected_check_in);
    const checkOut = this.parseDateOnly(reservation.expected_check_out);
    if (!checkIn || !checkOut) return 1;
    const diff = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
    return diff > 0 ? diff : 1;
  }

  private countInHouseGuests(reservations: ReservationI[]): number {
    return reservations.reduce((sum, reservation) => {
      const inProgress = reservation.real_check_in && !reservation.real_check_out;
      if (!inProgress) return sum;
      const guests = Math.round(this.toNumber(reservation.total_guests));
      return sum + (guests > 0 ? guests : 1);
    }, 0);
  }

  private sumPaymentsForDate(payments: PaymentI[], targetDate: Date): number {
    return payments.reduce((sum, payment) => {
      const date = this.parseDateTime(payment.payment_date || payment.created_at || null);
      if (!this.isSameDay(date, targetDate)) return sum;
      return sum + this.toNumber(payment.amount);
    }, 0);
  }

  private parseDateOnly(value?: string | null): Date | null {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  private parseDateTime(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
    return this.parseDateOnly(value);
  }

  private isSameDay(left: Date | null, right: Date | null): boolean {
    if (!left || !right) return false;
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  }

  private getToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return new Date(next.getFullYear(), next.getMonth(), next.getDate());
  }

  private lastDays(total: number): Date[] {
    const today = this.getToday();
    const days: Date[] = [];
    for (let i = total - 1; i >= 0; i--) {
      days.push(this.addDays(today, -i));
    }
    return days;
  }

  private dayDifference(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((end - start) / 86400000);
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private getInitials(name: string): string {
    const parts = name.split(' ').map((part) => part.trim()).filter(Boolean).slice(0, 2);
    if (!parts.length) return '--';
    return parts.map((part) => part[0]?.toUpperCase() || '').join('').slice(0, 2);
  }

  private formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
  }

  private formatSignedPercent(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  private formatCompactCurrency(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `$${Math.round(value / 1000)}k`;
    return `$${Math.round(value)}`;
  }

  private computeDelta(current: number, previous: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private relativeFromNow(date: Date | null): string {
    if (!date) return 'Reciente';
    const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.round(hours / 24)} d`;
  }

  private isOlderThanMaxDays(date: Date | null, maxDays: number): boolean {
    if (!date) return false;
    const today = this.getToday();
    const alertDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return this.dayDifference(alertDay, today) > maxDays;
  }

  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(date);
  }

  private updateClock(): void {
    const now = new Date();

    const date = new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    }).format(now);

    const time = new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    }).format(now);

    this.todayLabel = date.charAt(0).toUpperCase() + date.slice(1);
    this.currentTimeLabel = time.replace(/\u00a0/g, ' ');
  }

  private loadCurrentUserDisplayName(): void {
    this.authService
      .getUserInfo()
      .pipe(catchError(() => of(null)))
      .subscribe((user) => {
        const firstName = String(user?.first_name || '').trim();
        const lastName = String(user?.last_name || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();
        this.currentUserDisplayName = fullName || String(user?.username || '').trim() || 'Usuario';
      });
  }
}
