import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { PaymentI } from '../../billing/billing-model';
import { InventoryMovementI } from '../../inventory-movements/inventory-movement-model';
import { MaintenanceOrderI } from '../../maintenance-orders/maintenance-order-model';
import { ReservationI } from '../../reservations/reservation-model';
import { BillingService } from '../../../services/billing';
import { InventoryMovementsService } from '../../../services/inventory-movement';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { ReservationService } from '../../../services/reservation';

type ActivityTypeFilter = 'ALL' | 'PAYMENT' | 'INVENTORY' | 'MAINTENANCE' | 'RESERVATION';
type ActivityType = Exclude<ActivityTypeFilter, 'ALL'>;
type ActivityTone = 'green' | 'blue' | 'orange' | 'purple' | 'gray';

interface ActivityEvent {
  id: string;
  timestamp: Date;
  timestampLabel: string;
  type: ActivityType;
  title: string;
  detail: string;
  meta: string;
  route: string;
  icon: string;
  tone: ActivityTone;
}

@Component({
  selector: 'app-activity-log-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './activity-log.html',
  styleUrls: ['./activity-log.css'],
})
export class ActivityLogPage implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';

  events: ActivityEvent[] = [];
  filteredEvents: ActivityEvent[] = [];

  search = '';
  typeFilter: ActivityTypeFilter = 'ALL';
  startDate = '';
  endDate = '';

  pageSize = 20;
  currentPage = 1;
  readonly pageSizeOptions = [10, 20, 50];

  readonly typeOptions: Array<{ value: ActivityTypeFilter; label: string }> = [
    { value: 'ALL', label: 'Todos los tipos' },
    { value: 'PAYMENT', label: 'Pagos' },
    { value: 'INVENTORY', label: 'Inventario' },
    { value: 'MAINTENANCE', label: 'Mantenimiento' },
    { value: 'RESERVATION', label: 'Reservas' },
  ];

  constructor(
    private router: Router,
    private billingService: BillingService,
    private inventoryMovementsService: InventoryMovementsService,
    private maintenanceOrdersService: MaintenanceOrdersService,
    private reservationService: ReservationService
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.endDate = this.formatInputDate(today);
    this.startDate = this.formatInputDate(this.addDays(today, -30));
    this.loadActivityLog();
  }

  get totalEvents(): number {
    return this.events.length;
  }

  get paymentsCount(): number {
    return this.events.filter((event) => event.type === 'PAYMENT').length;
  }

  get inventoryCount(): number {
    return this.events.filter((event) => event.type === 'INVENTORY').length;
  }

  get maintenanceCount(): number {
    return this.events.filter((event) => event.type === 'MAINTENANCE').length;
  }

  get reservationCount(): number {
    return this.events.filter((event) => event.type === 'RESERVATION').length;
  }

  get totalPages(): number {
    if (!this.filteredEvents.length) return 1;
    return Math.max(1, Math.ceil(this.filteredEvents.length / this.pageSize));
  }

  get visibleEvents(): ActivityEvent[] {
    if (!this.filteredEvents.length) return [];
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredEvents.slice(start, start + this.pageSize);
  }

  loadActivityLog(): void {
    this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    forkJoin({
      payments: this.billingService
        .listPayments({ ordering: '-payment_date,-id', include_inactive: true })
        .pipe(catchError(() => of([] as PaymentI[]))),
      movements: this.inventoryMovementsService
        .listInventoryMovements({ ordering: '-movement_date,-id' })
        .pipe(catchError(() => of([] as InventoryMovementI[]))),
      maintenance: this.maintenanceOrdersService
        .listMaintenanceOrders({ ordering: '-reported_at,-id' })
        .pipe(catchError(() => of([] as MaintenanceOrderI[]))),
      reservations: this.reservationService
        .listReservations({ include_finished: true, ordering: '-id', page_size: 500 })
        .pipe(catchError(() => of([] as ReservationI[]))),
    }).subscribe({
      next: ({ payments, movements, maintenance, reservations }) => {
        this.loading = false;

        const events = [
          ...this.buildPaymentEvents(payments),
          ...this.buildInventoryEvents(movements),
          ...this.buildMaintenanceEvents(maintenance),
          ...this.buildReservationEvents(reservations),
        ].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

        this.events = events;
        this.applyFilters();

        if (!events.length) {
          this.infoMessage = 'No hay actividad registrada para mostrar.';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el registro completo de actividad.';
      },
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.updateFilteredEvents();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.updateFilteredEvents();
  }

  clearFilters(): void {
    this.search = '';
    this.typeFilter = 'ALL';
    const today = new Date();
    this.endDate = this.formatInputDate(today);
    this.startDate = this.formatInputDate(this.addDays(today, -30));
    this.currentPage = 1;
    this.errorMessage = '';
    this.updateFilteredEvents();
  }

  previousPage(): void {
    if (this.currentPage <= 1) return;
    this.currentPage -= 1;
  }

  nextPage(): void {
    if (this.currentPage >= this.totalPages) return;
    this.currentPage += 1;
  }

  openEvent(event: ActivityEvent): void {
    void this.router.navigate([event.route]);
  }

  trackByEvent(_: number, event: ActivityEvent): string {
    return event.id;
  }

  private updateFilteredEvents(): void {
    const query = this.normalizeText(this.search);
    const start = this.parseInputDate(this.startDate);
    const end = this.parseInputDate(this.endDate);

    if (start && end && start > end) {
      this.errorMessage = 'La fecha inicial no puede ser mayor que la fecha final.';
      this.filteredEvents = [];
      return;
    }

    this.errorMessage = '';
    this.filteredEvents = this.events.filter((event) => {
      const typeMatch = this.typeFilter === 'ALL' || event.type === this.typeFilter;

      const startMatch = !start || event.timestamp.getTime() >= start.getTime();
      const endMatch = !end || event.timestamp.getTime() <= end.getTime() + 86399999;

      const searchMatch =
        !query ||
        this.normalizeText(event.title).includes(query) ||
        this.normalizeText(event.detail).includes(query) ||
        this.normalizeText(event.meta).includes(query);

      return typeMatch && startMatch && endMatch && searchMatch;
    });
  }

  private buildPaymentEvents(payments: PaymentI[]): ActivityEvent[] {
    return payments
      .map((payment) => {
        const timestamp = this.parseDateTime(payment.payment_date || payment.created_at || null);
        if (!timestamp) return null;

        const methodLabel =
          this.cleanText(payment.payment_method_name) ||
          this.cleanText(payment.payment_method_code) ||
          'Metodo no definido';

        return {
          id: `PAY-${payment.id}`,
          timestamp,
          timestampLabel: this.formatDateTime(timestamp),
          type: 'PAYMENT' as ActivityType,
          title: payment.is_active ? 'Pago registrado' : 'Pago inactivado',
          detail: `Factura ${this.cleanText(payment.invoice_number) || `#${payment.invoice}`}`,
          meta: `${methodLabel} - ${this.formatCurrency(this.toNumber(payment.amount))}`,
          route: '/pagos',
          icon: payment.is_active ? 'fa-solid fa-wallet' : 'fa-solid fa-ban',
          tone: payment.is_active ? 'green' : 'gray',
        };
      })
      .filter((event): event is ActivityEvent => !!event);
  }

  private buildInventoryEvents(movements: InventoryMovementI[]): ActivityEvent[] {
    return movements
      .map((movement) => {
        const timestamp = this.parseDateTime(movement.movement_date || movement.created_at || null);
        if (!timestamp) return null;

        const movementLabel =
          this.cleanText(movement.movement_type_name) ||
          this.cleanText(movement.movement_type_code) ||
          'Movimiento';

        const itemLabel = this.cleanText(movement.item_name) || `Item #${movement.item ?? '--'}`;
        const previous = this.formatInteger(movement.previous_stock);
        const next = this.formatInteger(movement.new_stock);

        return {
          id: `INV-${movement.id}`,
          timestamp,
          timestampLabel: this.formatDateTime(timestamp),
          type: 'INVENTORY' as ActivityType,
          title: 'Movimiento de inventario',
          detail: `${movementLabel} - ${itemLabel}`,
          meta: `Cantidad: ${this.formatInteger(movement.quantity)} - Stock: ${previous} -> ${next}`,
          route: '/movimientos-inventario',
          icon: 'fa-solid fa-boxes-stacked',
          tone: 'blue',
        };
      })
      .filter((event): event is ActivityEvent => !!event);
  }

  private buildMaintenanceEvents(orders: MaintenanceOrderI[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];

    orders.forEach((order) => {
      const room = this.cleanText(order.room_number) || `${order.room ?? '--'}`;
      const status = this.cleanText(order.status_label) || this.cleanText(order.status) || 'Sin estado';

      const reportedAt = this.parseDateTime(order.reported_at || null);
      if (reportedAt) {
        events.push({
          id: `MNT-REP-${order.id}`,
          timestamp: reportedAt,
          timestampLabel: this.formatDateTime(reportedAt),
          type: 'MAINTENANCE',
          title: 'Orden de mantenimiento reportada',
          detail: `${this.cleanText(order.title) || 'Sin titulo'} - Hab. ${room}`,
          meta: `Estado: ${status}`,
          route: '/ordenes-mantenimiento',
          icon: 'fa-solid fa-screwdriver-wrench',
          tone: 'orange',
        });
      }

      const completedAt = this.parseDateTime(order.completed_at || null);
      if (completedAt) {
        events.push({
          id: `MNT-DONE-${order.id}`,
          timestamp: completedAt,
          timestampLabel: this.formatDateTime(completedAt),
          type: 'MAINTENANCE',
          title: 'Mantenimiento completado',
          detail: `${this.cleanText(order.title) || 'Sin titulo'} - Hab. ${room}`,
          meta: `Estado: ${status}`,
          route: '/ordenes-mantenimiento',
          icon: 'fa-solid fa-circle-check',
          tone: 'green',
        });
      }
    });

    return events;
  }

  private buildReservationEvents(reservations: ReservationI[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];

    reservations.forEach((reservation) => {
      const guest = this.cleanText(reservation.client_full_name) || `Cliente #${reservation.client}`;
      const stay = `${this.formatDate(reservation.expected_check_in)} -> ${this.formatDate(reservation.expected_check_out)}`;

      const createdAt = this.parseDateTime(reservation.created_at || null);
      if (createdAt) {
        events.push({
          id: `RSV-NEW-${reservation.id}`,
          timestamp: createdAt,
          timestampLabel: this.formatDateTime(createdAt),
          type: 'RESERVATION',
          title: 'Reserva creada',
          detail: `${guest} - Reserva #${reservation.id}`,
          meta: stay,
          route: '/reservas',
          icon: 'fa-regular fa-calendar-plus',
          tone: 'purple',
        });
      }

      const checkIn = this.parseDateTime(reservation.real_check_in || null);
      if (checkIn) {
        events.push({
          id: `RSV-IN-${reservation.id}`,
          timestamp: checkIn,
          timestampLabel: this.formatDateTime(checkIn),
          type: 'RESERVATION',
          title: 'Check-in registrado',
          detail: `${guest} - Reserva #${reservation.id}`,
          meta: stay,
          route: '/reservas',
          icon: 'fa-solid fa-right-to-bracket',
          tone: 'blue',
        });
      }

      const checkOut = this.parseDateTime(reservation.real_check_out || null);
      if (checkOut) {
        events.push({
          id: `RSV-OUT-${reservation.id}`,
          timestamp: checkOut,
          timestampLabel: this.formatDateTime(checkOut),
          type: 'RESERVATION',
          title: 'Check-out registrado',
          detail: `${guest} - Reserva #${reservation.id}`,
          meta: stay,
          route: '/reservas',
          icon: 'fa-solid fa-right-from-bracket',
          tone: 'orange',
        });
      }
    });

    return events;
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }

  private parseDateTime(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private parseInputDate(value: string): Date | null {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(value);
  }

  private formatDate(value?: string | null): string {
    const date = this.parseDateTime(value);
    if (!date) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  }

  private formatInteger(value: unknown): string {
    const amount = this.toNumber(value);
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount);
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private formatInputDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }
}
