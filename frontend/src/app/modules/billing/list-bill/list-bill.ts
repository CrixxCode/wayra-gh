import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { BillingService } from '../../../services/billing';
import { MasterDataService } from '../../../services/master-data.service';
import { ReservationService } from '../../../services/reservation';
import { ReservationI } from '../../reservations/reservation-model';
import { InvoiceI } from '../billing-model';
import { DetailBill } from '../detail-bill/detail-bill';

type InvoiceStatusFilter = 'ALL' | 'BORRADOR' | 'EMITIDA' | 'PAGADA' | 'ANULADA';
type InvoiceActivityFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type InvoiceViewMode = 'cards' | 'table';

@Component({
  selector: 'app-list-bill',
  standalone: true,
  imports: [CommonModule, FormsModule, DetailBill],
  templateUrl: './list-bill.html',
  styleUrls: ['./list-bill.css']
})
export class ListBill implements OnInit {
  /** Dentro del contenedor de facturacion: sin encabezado ni metricas propias. */
  @Input() embedded = false;

  /** Un cambio aqui mueve las cifras de las otras dos pestañas. */
  @Output() changed = new EventEmitter<void>();

  /** Solo la primera carga: es la unica que puede dejar la pantalla vacia. */
  loading = false;

  /** Recarga posterior a una accion: la tabla sigue en pantalla. */
  refreshing = false;
  errorMessage = '';
  infoMessage = '';

  invoices: InvoiceI[] = [];
  filteredInvoices: InvoiceI[] = [];
  invoiceStatuses: MasterDataI[] = [];
  reservationsMap = new Map<number, ReservationI>();

  search = '';
  statusFilter: InvoiceStatusFilter = 'ALL';
  activityFilter: InvoiceActivityFilter = 'ACTIVE';
  viewMode: InvoiceViewMode = 'cards';

  selectedInvoice: InvoiceI | null = null;

  readonly activityOptions: Array<{ value: InvoiceActivityFilter; label: string }> = [
    { value: 'ACTIVE', label: 'Activas' },
    { value: 'INACTIVE', label: 'Inactivas' },
    { value: 'ALL', label: 'Todas' }
  ];

  readonly statusOptions: Array<{ value: InvoiceStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'BORRADOR', label: 'Borrador' },
    { value: 'EMITIDA', label: 'Emitida' },
    { value: 'PAGADA', label: 'Pagada' },
    { value: 'ANULADA', label: 'Anulada' }
  ];

  constructor(
    private billingService: BillingService,
    private reservationService: ReservationService,
    private masterDataService: MasterDataService
  ) {}

  ngOnInit(): void {
    this.loadBillingData();
  }

  get totalInvoices(): number {
    return this.invoices.length;
  }

  get draftCount(): number {
    return this.invoices.filter((invoice) => this.normalizeCode(invoice.status_code) === 'BORRADOR').length;
  }

  get issuedCount(): number {
    return this.invoices.filter((invoice) => this.normalizeCode(invoice.status_code) === 'EMITIDA').length;
  }

  get paidCount(): number {
    return this.invoices.filter((invoice) => this.normalizeCode(invoice.status_code) === 'PAGADA').length;
  }

  get totalBilledLabel(): string {
    const total = this.invoices.reduce((sum, invoice) => sum + this.toNumber(invoice.total_amount), 0);
    return this.formatCurrency(total);
  }

  get pendingCollectionLabel(): string {
    const total = this.invoices
      .filter((invoice) => {
        const code = this.normalizeCode(invoice.status_code);
        return code !== 'PAGADA' && code !== 'ANULADA';
      })
      .reduce((sum, invoice) => sum + this.toNumber(invoice.total_amount), 0);

    return this.formatCurrency(total);
  }

  loadBillingData(options: { silent?: boolean; force?: boolean } = {}): void {
    // Una recarga silenciosa no toca `loading`, asi que la tabla no se desmonta y
    // la pantalla no parpadea con cada accion.
    if (options.silent) this.refreshing = true;
    else this.loading = true;
    this.errorMessage = '';
    this.infoMessage = '';

    forkJoin({
      invoices: this.billingService
        .listInvoices({ ordering: '-id', include_inactive: true, forceRefresh: options.force })
        .pipe(catchError(() => of([] as InvoiceI[]))),
      reservationsPage: this.reservationService
        .listReservationsPage({ include_finished: true, ordering: '-id', page: 1, page_size: 100 })
        .pipe(
          catchError(() =>
            of({
              count: 0,
              next: null,
              previous: null,
              results: [] as ReservationI[]
            })
          )
        ),
      invoiceStatuses: this.masterDataService
        .listMasterData({ group: 'INVOICE_STATUS', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe({
      next: ({ invoices, reservationsPage, invoiceStatuses }) => {
        this.loading = false;
        this.refreshing = false;
        this.invoices = [...invoices].sort((a, b) => b.id - a.id);
        this.invoiceStatuses = invoiceStatuses;
        this.reservationsMap = new Map(
          (reservationsPage.results || []).map((reservation) => [reservation.id, reservation])
        );

        this.applyFilters();

        if (!this.invoices.length) {
          this.infoMessage = 'No hay facturas registradas todavia.';
        }
      },
      error: () => {
        this.loading = false;
        this.refreshing = false;
        this.errorMessage = 'No fue posible cargar el modulo de facturacion.';
      }
    });
  }

  /**
   * Recarga tras una accion, o a peticion del boton "Actualizar".
   *
   * `force` **solo** para el boton: una escritura ya invalido el cache desde el servicio,
   * asi que la recarga posterior va al servidor igual. Forzarla ademas anula la
   * deduplicacion de peticiones en vuelo del `ResourceCache`, y entonces esta lista y su
   * contenedor piden lo mismo dos veces. Con unos pocos clics seguidos eso agotaba el
   * limite de peticiones por minuto y la API respondia 429.
   */
  refreshBillingData(force = false): void {
    this.changed.emit();
    this.loadBillingData({ silent: true, force });
  }

  exportCsv(): void {
    if (!this.filteredInvoices.length) return;

    const headers = [
      'factura',
      'reserva',
      'huesped',
      'documento',
      'estado',
      'actividad',
      'fecha_emision',
      'total'
    ];

    const rows = this.filteredInvoices.map((invoice) => {
      const reservation = this.reservationsMap.get(invoice.reservation) || null;
      const row = [
        invoice.invoice_number || `FAC-${invoice.id}`,
        this.getReservationCode(invoice, reservation),
        this.getGuestLabel(invoice),
        this.getGuestDocument(invoice),
        this.getStatusLabel(invoice),
        invoice.is_active ? 'Activa' : 'Inactiva',
        this.getIssueDateLabel(invoice),
        this.toNumber(invoice.total_amount)
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facturas-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const query = String(this.search || '').trim().toLowerCase();

    this.filteredInvoices = this.invoices.filter((invoice) => {
      const statusCode = this.normalizeCode(invoice.status_code);
      const activityMatch =
        this.activityFilter === 'ALL' ||
        (this.activityFilter === 'ACTIVE' && invoice.is_active) ||
        (this.activityFilter === 'INACTIVE' && !invoice.is_active);

      const statusMatch =
        this.statusFilter === 'ALL' ||
        (statusCode && statusCode === this.statusFilter);

      const reservation = this.reservationsMap.get(invoice.reservation) || null;
      const searchPool = [
        invoice.invoice_number,
        invoice.status_name || '',
        statusCode,
        this.getReservationCode(invoice, reservation),
        reservation?.client_full_name || '',
        reservation?.client_document_number || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !query || searchPool.includes(query);
      return activityMatch && statusMatch && searchMatch;
    });
  }

  openDetail(invoice: InvoiceI): void {
    this.selectedInvoice = invoice;
  }

  setViewMode(mode: InvoiceViewMode): void {
    this.viewMode = mode;
  }

  closeDetail(): void {
    this.selectedInvoice = null;
  }

  onInvoiceUpdated(updatedInvoice: InvoiceI): void {
    const index = this.invoices.findIndex((invoice) => invoice.id === updatedInvoice.id);
    if (index >= 0) {
      this.invoices[index] = updatedInvoice;
    } else {
      this.invoices.unshift(updatedInvoice);
    }

    this.invoices = [...this.invoices].sort((a, b) => b.id - a.id);
    this.applyFilters();

    this.selectedInvoice = this.invoices.find((invoice) => invoice.id === updatedInvoice.id) || null;
  }

  getStatusLabel(invoice: InvoiceI): string {
    if (invoice.status_name?.trim()) return invoice.status_name.trim();

    const statusCode = this.normalizeCode(invoice.status_code);
    if (!statusCode) return 'Sin estado';

    const status = this.invoiceStatuses.find((item) => this.normalizeCode(item.code) === statusCode);
    if (status?.name?.trim()) return status.name.trim();

    return statusCode;
  }

  getStatusTone(invoice: InvoiceI): { bg: string; color: string; dot: string } {
    const statusCode = this.normalizeCode(invoice.status_code);

    if (statusCode === 'BORRADOR') {
      return {
        bg: 'var(--gh-status-neutral-bg)',
        color: 'var(--gh-status-neutral-text)',
        dot: 'var(--gh-text-muted)'
      };
    }
    if (statusCode === 'EMITIDA') {
      return {
        bg: 'var(--gh-status-warn-bg)',
        color: 'var(--gh-status-warn-text)',
        dot: 'var(--gh-status-warn-strong)'
      };
    }
    if (statusCode === 'PAGADA') {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong-alt)'
      };
    }
    if (statusCode === 'ANULADA') {
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

  getReservationCode(invoice: InvoiceI, reservation?: ReservationI | null): string {
    if (reservation?.code) return reservation.code;
    return `RES-${invoice.reservation}`;
  }

  getGuestLabel(invoice: InvoiceI): string {
    const reservation = this.reservationsMap.get(invoice.reservation) || null;
    if (reservation?.client_full_name?.trim()) return reservation.client_full_name.trim();
    return 'Reserva sin codigo';
  }

  getGuestDocument(invoice: InvoiceI): string {
    const reservation = this.reservationsMap.get(invoice.reservation) || null;
    return reservation?.client_document_number || 'Sin documento';
  }

  getGuestInitials(invoice: InvoiceI): string {
    const label = this.getGuestLabel(invoice).trim();
    if (!label) return 'FC';

    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  getStayLabel(invoice: InvoiceI): string {
    const reservation = this.reservationsMap.get(invoice.reservation) || null;
    if (!reservation) return 'Sin datos de estancia';
    return `${this.formatDate(reservation.expected_check_in)} - ${this.formatDate(reservation.expected_check_out)}`;
  }

  getIssueDateLabel(invoice: InvoiceI): string {
    return this.formatDateTime(invoice.issue_date);
  }

  getAmountLabel(invoice: InvoiceI): string {
    return this.formatCurrency(this.toNumber(invoice.total_amount));
  }

  trackByInvoice(_: number, invoice: InvoiceI): number {
    return invoice.id;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) return 'Sin registro';
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

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private normalizeCode(value: unknown): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
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
}
