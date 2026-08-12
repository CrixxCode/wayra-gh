import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService, hasResourceScope } from '../../../services/auth/auth';
import { BillingService } from '../../../services/billing';
import { MotionService } from '../../../services/motion';
import { ListPaymentRefunds } from '../../payments/list-payment-refunds/list-payment-refunds';
import { ListPayments } from '../../payments/list-payments/list-payments';
import { InvoiceI, PaymentI, PaymentRefundI } from '../billing-model';
import { ListBill } from '../list-bill/list-bill';

export type BillingTab = 'invoices' | 'payments' | 'refunds';

type TabDefinition = {
  key: BillingTab;
  label: string;
  icon: string;
  hint: string;
};

/** Tarjeta del resumen: un número y qué hacer con él. */
export type BillingMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  /** Pestaña a la que lleva al pulsarla. */
  tab: BillingTab;
};

/** Facturas que ya no esperan cobro. */
const CLOSED_INVOICE_CODES = ['PAGADA', 'ANULADA'];

/**
 * Facturación: facturas, pagos y reembolsos en una sola pantalla.
 *
 * Las tres eran rutas separadas, pero el modelo es una cadena estricta:
 *
 *     Invoice ──< Payment ──< PaymentRefund
 *
 * Un pago no existe sin factura y un reembolso no existe sin pago. Además ninguna de
 * las tres se crea en su propia vista: el pago nace en el check-out (`room-check-modal`)
 * y el reembolso en el detalle del pago. Son, las tres, vistas de **consulta y auditoría
 * del mismo dinero** — exactamente lo que justifica pestañas y no rutas.
 *
 * Lo que aporta el contenedor y no tenía ninguna de las tres: el **saldo por cobrar**
 * real, que vive entre facturas y pagos y hasta ahora había que calcular a mano saltando
 * de una vista a otra.
 *
 * No se confunde con Finanzas (`/consolidado-ingresos`, `/control-financiero`): aquello
 * es análisis por periodo; esto es el libro operativo, documento a documento.
 */
@Component({
  selector: 'app-billing-page',
  standalone: true,
  imports: [CommonModule, ListBill, ListPayments, ListPaymentRefunds],
  templateUrl: './billing-page.html',
  styleUrls: ['./billing-page.css']
})
export class BillingPage implements OnInit, OnDestroy {
  activeTab: BillingTab = 'invoices';

  /** Solo la primera carga del resumen. */
  loading = true;

  /** Recarga del resumen disparada por un cambio en una pestaña. */
  refreshing = false;

  /**
   * Reembolsos era la unica de las tres que recepcion no tenia en su menu. Al unir
   * las vistas habria heredado el acceso por la puerta de atras, asi que la pestaña
   * se pinta solo con `payment-refunds.read`. No es un control de acceso -- la API
   * valida aparte-- sino conservar el alcance que cada rol ya tenia.
   */
  canSeeRefunds = false;

  invoices: InvoiceI[] = [];
  payments: PaymentI[] = [];
  refunds: PaymentRefundI[] = [];

  readonly tabs: TabDefinition[] = [
    {
      key: 'invoices',
      label: 'Facturas',
      icon: 'fa-solid fa-file-invoice',
      hint: 'Lo que el hotel cobra, documento a documento'
    },
    {
      key: 'payments',
      label: 'Pagos',
      icon: 'fa-solid fa-money-bills',
      hint: 'Lo que ya entro y por que metodo'
    },
    {
      key: 'refunds',
      label: 'Reembolsos',
      icon: 'fa-solid fa-arrow-rotate-left',
      hint: 'Lo que se devolvio sobre un pago'
    }
  ];

  private revealFrame: number | null = null;

  /** La entrada animada es de bienvenida: se ejecuta una vez, no en cada recarga. */
  private revealed = false;

  constructor(
    private billingService: BillingService,
    private authService: AuthService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // La pestaña viaja en la URL para que un enlace compartido abra donde corresponde.
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadRefundsPermission();
    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // --------------------------------------------------------------------- datos

  /**
   * Resumen de la cadena completa.
   *
   * Las tres peticiones se sirven del mismo cache-aside que usan las listas de las
   * pestañas, así que abrir la pantalla no duplica el tráfico: la primera pestaña
   * encuentra su respuesta ya cargada.
   */
  loadSummary(forceRefresh = false, silent = false): void {
    if (silent) this.refreshing = true;
    else this.loading = true;

    forkJoin({
      invoices: this.billingService
        .listInvoices({ ordering: '-id', include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as InvoiceI[]))),
      payments: this.billingService
        .listPayments({ ordering: '-payment_date,-id', include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as PaymentI[]))),
      refunds: this.billingService
        .listPaymentRefunds({ ordering: '-refund_date,-id', include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as PaymentRefundI[])))
    }).subscribe(({ invoices, payments, refunds }) => {
      this.loading = false;
      this.refreshing = false;
      this.invoices = invoices;
      this.payments = payments;
      this.refunds = refunds;

      // Solo la primera carga se anima: reanimar en cada recarga haría que registrar un
      // pago se viera como si la pantalla se recargara entera.
      if (!this.revealed) {
        this.revealed = true;
        this.scheduleReveal();
      }
    });
  }

  // ------------------------------------------------------------------ pestañas

  get visibleTabs(): TabDefinition[] {
    return this.tabs.filter((tab) => tab.key !== 'refunds' || this.canSeeRefunds);
  }

  selectTab(tab: BillingTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true
    });

    this.scheduleReveal();
  }

  tabCount(tab: BillingTab): number {
    if (tab === 'invoices') return this.invoices.length;
    if (tab === 'payments') return this.payments.length;
    return this.refunds.length;
  }

  // ------------------------------------------------------------------ métricas

  /** Facturado: solo facturas vivas, que son las que representan una deuda real. */
  get billedTotal(): number {
    return this.invoices
      .filter((invoice) => invoice.is_active !== false)
      .reduce((sum, invoice) => sum + this.toNumber(invoice.total_amount), 0);
  }

  /** Cobrado neto: lo que entró menos lo que se devolvió. */
  get collectedTotal(): number {
    const paid = this.payments
      .filter((payment) => payment.is_active !== false)
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);

    return paid - this.refundedTotal;
  }

  /** Solo los reembolsos procesados salieron de caja; los pendientes aún no. */
  get refundedTotal(): number {
    return this.refunds
      .filter((refund) => refund.is_active !== false && this.statusCode(refund) === 'PROCESADO')
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  /**
   * Por cobrar: el número que no tenía ninguna de las tres vistas.
   *
   * Se calcula sobre las facturas que siguen esperando cobro —ni pagadas ni anuladas—
   * y no como `facturado - cobrado`, porque esa resta arrastra el histórico completo y
   * daría un pendiente falso en cuanto haya una factura anulada.
   */
  get pendingTotal(): number {
    const openInvoiceIds = new Set(
      this.invoices
        .filter(
          (invoice) =>
            invoice.is_active !== false &&
            !CLOSED_INVOICE_CODES.includes(this.statusCode(invoice))
        )
        .map((invoice) => invoice.id)
    );

    const billed = this.invoices
      .filter((invoice) => openInvoiceIds.has(invoice.id))
      .reduce((sum, invoice) => sum + this.toNumber(invoice.total_amount), 0);

    const paid = this.payments
      .filter((payment) => payment.is_active !== false && openInvoiceIds.has(Number(payment.invoice)))
      .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0);

    return Math.max(billed - paid, 0);
  }

  /** Facturas abiertas que ya tienen algún pago pero no llegan al total. */
  get partiallyPaidCount(): number {
    const paidByInvoice = new Map<number, number>();
    for (const payment of this.payments) {
      if (payment.is_active === false) continue;
      const invoiceId = Number(payment.invoice);
      paidByInvoice.set(invoiceId, (paidByInvoice.get(invoiceId) || 0) + this.toNumber(payment.amount));
    }

    return this.invoices.filter((invoice) => {
      if (invoice.is_active === false) return false;
      if (CLOSED_INVOICE_CODES.includes(this.statusCode(invoice))) return false;

      const paid = paidByInvoice.get(invoice.id) || 0;
      return paid > 0 && paid < this.toNumber(invoice.total_amount);
    }).length;
  }

  /** Reembolsos esperando aprobación: lo único del resumen que exige una decisión. */
  get pendingRefunds(): PaymentRefundI[] {
    return this.refunds.filter(
      (refund) => refund.is_active !== false && this.statusCode(refund) === 'PENDIENTE'
    );
  }

  get metrics(): BillingMetric[] {
    // Sin permiso de reembolsos no se muestra su tarjeta: llevaria a una pestaña
    // que no existe para este usuario.
    return this.allMetrics.filter((metric) => metric.tab !== 'refunds' || this.canSeeRefunds);
  }

  private get allMetrics(): BillingMetric[] {
    const pending = this.pendingTotal;
    const partial = this.partiallyPaidCount;
    const pendingRefunds = this.pendingRefunds.length;

    return [
      {
        key: 'billed',
        label: 'Facturado',
        value: this.formatCurrency(this.billedTotal),
        note: `${this.invoices.length} factura(s) emitidas`,
        icon: 'fa-solid fa-file-invoice',
        tone: 'brand',
        tab: 'invoices'
      },
      {
        key: 'collected',
        label: 'Cobrado neto',
        value: this.formatCurrency(this.collectedTotal),
        note: this.refundedTotal
          ? `Ya descontados ${this.formatCurrency(this.refundedTotal)} en reembolsos`
          : `${this.payments.length} pago(s) registrados`,
        icon: 'fa-solid fa-money-bills',
        tone: 'success',
        tab: 'payments'
      },
      {
        key: 'pending',
        label: 'Por cobrar',
        value: this.formatCurrency(pending),
        note: partial ? `${partial} factura(s) a medio pagar` : 'Sin cobros a medias',
        icon: 'fa-solid fa-hourglass-half',
        tone: pending > 0 ? 'warning' : 'success',
        tab: 'invoices'
      },
      {
        key: 'refunds',
        label: 'Reembolsos por aprobar',
        value: String(pendingRefunds),
        note: pendingRefunds
          ? `${this.formatCurrency(this.pendingRefundsAmount)} a la espera`
          : 'Nada pendiente de decision',
        icon: 'fa-solid fa-arrow-rotate-left',
        tone: pendingRefunds ? 'danger' : 'success',
        tab: 'refunds'
      }
    ];
  }

  get pendingRefundsAmount(): number {
    return this.pendingRefunds.reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
  }

  trackByTab(_: number, tab: TabDefinition): string {
    return tab.key;
  }

  trackByMetric(_: number, metric: BillingMetric): string {
    return metric.key;
  }

  /**
   * Un cambio en una pestaña afecta a las métricas y a las otras dos.
   *
   * Va en silencio: la lista que disparó el cambio ya muestra su propio indicador, y
   * las métricas se actualizan en su sitio cuando llegan los datos.
   */
  onBillingChanged(): void {
        // Sin forzar: la escritura ya invalido el cache desde el servicio, asi que esto
    // va al servidor igual. Forzarlo ademas anularia la deduplicacion de peticiones
    // en vuelo y la lista de la pestaña pediria lo mismo por segunda vez.
    this.loadSummary(false, true);
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    // Fuera de la zona de Angular: GSAP anima con requestAnimationFrame y dentro
    // dispararia una deteccion de cambios por frame.
    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.ledger-metric'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.ledger-tab'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26
        });
        this.motion.reveal(host.querySelectorAll('.ledger-panel'), {
          stagger: 0,
          y: 12,
          delay: 0.06
        });
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private loadRefundsPermission(): void {
    this.authService
      .getUserInfo()
      .pipe(catchError(() => of(null)))
      .subscribe((user) => {
        this.canSeeRefunds = hasResourceScope(user, 'payment-refunds.read');
        if (!this.canSeeRefunds && this.activeTab === 'refunds') this.activeTab = 'invoices';
      });
  }

  private isTab(value: string): value is BillingTab {
    return value === 'invoices' || value === 'payments' || value === 'refunds';
  }

  private statusCode(entity: { status_code?: string }): string {
    return String(entity.status_code || '')
      .trim()
      .toUpperCase();
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  }
}
