import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { ExpenseService } from '../../../services/expense';
import { MotionService } from '../../../services/motion';
import { ReportsService } from '../../../services/reports';
import { ExpenseI } from '../../expenses/expense-model';
import { ListExpenses } from '../../expenses/list-expenses/list-expenses';
import { ListIncomeConsolidated } from '../../income-consolidated/list-income-consolidated/list-income-consolidated';
import { IncomeConsolidatedReportResponse } from '../../reports/report-model';

export type FinanceTab = 'result' | 'income' | 'expenses';

export type FinancePeriod = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'ALL' | 'CUSTOM';

/**
 * El rango que miran las tres pestañas.
 *
 * `from`/`to` son días sueltos (`YYYY-MM-DD`), vacíos cuando el periodo es "todo".
 */
export type FinanceRange = { from: string; to: string };

type TabDefinition = {
  key: FinanceTab;
  label: string;
  icon: string;
  hint: string;
};

export type FinanceMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  tab: FinanceTab;
};

/**
 * Finanzas: lo que entra y lo que sale, en una sola pantalla.
 *
 * Ingresos y egresos eran dos rutas separadas, y ninguna podía contestar la única
 * pregunta que importa: **cuánto queda**. El resultado vive entre las dos —es una resta—,
 * así que hasta ahora había que abrir dos pantallas, anotar dos cifras y restarlas a mano
 * cada vez.
 *
 * Es el mismo caso del saldo por cobrar en facturación (AGENTS.md 5.19): el número que
 * nadie tenía porque vivía en el hueco entre dos vistas.
 *
 * No se mezcla con `/control-financiero`, que es **análisis** —tablero, escenarios,
 * estados—. Esto es el libro del periodo: lo que entró y lo que salió.
 */
@Component({
  selector: 'app-finance-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ListIncomeConsolidated, ListExpenses],
  templateUrl: './finance-page.html',
  styleUrls: ['./finance-page.css']
})
export class FinancePage implements OnInit, OnDestroy {
  activeTab: FinanceTab = 'result';

  /**
   * El periodo lo manda el contenedor, no cada pestaña.
   *
   * Antes cada una traía el suyo: el encabezado sumaba todo el histórico mientras las
   * listas arrancaban en el mes en curso, así que la cifra grande y la de la pestaña
   * podían no coincidir sin que nada lo explicara. Ahora las tres miran el mismo rango.
   */
  period: FinancePeriod = 'THIS_MONTH';

  /** Solo se usan cuando el periodo es `CUSTOM`. */
  customFrom = '';
  customTo = '';

  loading = true;
  refreshing = false;

  income: IncomeConsolidatedReportResponse | null = null;
  expenses: ExpenseI[] = [];

  readonly tabs: TabDefinition[] = [
    {
      key: 'result',
      label: 'Resultado',
      icon: 'fa-solid fa-scale-balanced',
      hint: 'Cuanto entro, cuanto salio y cuanto queda'
    },
    {
      key: 'income',
      label: 'Ingresos',
      icon: 'fa-solid fa-arrow-trend-up',
      hint: 'Cobros consolidados por periodo y metodo'
    },
    {
      key: 'expenses',
      label: 'Egresos',
      icon: 'fa-solid fa-arrow-trend-down',
      hint: 'Lo que el hotel gasta y en que'
    }
  ];

  readonly periodOptions: Array<{ value: FinancePeriod; label: string }> = [
    { value: 'THIS_MONTH', label: 'Este mes' },
    { value: 'LAST_MONTH', label: 'Mes pasado' },
    { value: 'LAST_30', label: 'Ultimos 30 dias' },
    { value: 'THIS_YEAR', label: 'Este ano' },
    { value: 'ALL', label: 'Todo el historico' },
    { value: 'CUSTOM', label: 'Entre dos fechas' }
  ];

  /** El alta de un egreso sube al contenedor: es la accion de la pantalla. */
  @ViewChild(ListExpenses) private expensesList?: ListExpenses;

  private revealFrame: number | null = null;
  private revealed = false;

  constructor(
    private reportsService: ReportsService,
    private expenseService: ExpenseService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // -------------------------------------------------------------------- periodo

  /**
   * El rango en fechas sueltas.
   *
   * Se calcula con el calendario local y se serializa a `YYYY-MM-DD` a mano: pasar por
   * `toISOString()` lo convertiría a UTC y correría un día el primero del mes.
   */
  get range(): FinanceRange {
    const now = new Date();
    const iso = (date: Date): string => {
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${day}`;
    };

    if (this.period === 'ALL') return { from: '', to: '' };

    if (this.period === 'CUSTOM') {
      // Si solo hay una punta, el rango no está listo: no se filtra a medias.
      if (!this.customFrom || !this.customTo) return { from: '', to: '' };
      // Al revés se corrige en vez de devolver vacío: es un error de tecleo, no una orden.
      return this.customFrom <= this.customTo
        ? { from: this.customFrom, to: this.customTo }
        : { from: this.customTo, to: this.customFrom };
    }

    if (this.period === 'LAST_MONTH') {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        // Día 0 del mes actual es el último del anterior.
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0))
      };
    }

    if (this.period === 'LAST_30') {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
        to: iso(now)
      };
    }

    if (this.period === 'THIS_YEAR') {
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    }

    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }

  get periodLabel(): string {
    if (this.period === 'CUSTOM') {
      const { from, to } = this.range;
      return from && to ? `${from} a ${to}` : 'Entre dos fechas';
    }
    return this.periodOptions.find((option) => option.value === this.period)?.label || '';
  }

  onPeriodChange(): void {
    // Sin las dos puntas el rango personalizado no dice nada todavía.
    if (this.period === 'CUSTOM' && (!this.customFrom || !this.customTo)) return;
    this.loadSummary(false, true);
  }

  // --------------------------------------------------------------------- datos

  loadSummary(forceRefresh = false, silent = false): void {
    if (silent) this.refreshing = true;
    else this.loading = true;

    const { from, to } = this.range;

    forkJoin({
      income: this.reportsService
        .getIncomeConsolidatedReport(
          // El consolidado quiere las dos puntas juntas o ninguna.
          from && to ? { start_date: from, end_date: to } : { period: 'ALL' }
        )
        .pipe(catchError(() => of(null))),
      expenses: this.expenseService
        .listExpenses({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as ExpenseI[])))
    }).subscribe(({ income, expenses }) => {
      this.loading = false;
      this.refreshing = false;
      this.income = income;
      this.expenses = expenses;

      if (!this.revealed) {
        this.revealed = true;
        this.scheduleReveal();
      }
    });
  }

  // ------------------------------------------------------------------ pestañas

  selectTab(tab: FinanceTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true
    });

    this.scheduleReveal();
  }

  tabCount(tab: FinanceTab): number {
    if (tab === 'income') return this.income?.summary?.total_transactions ?? 0;
    if (tab === 'expenses') return this.activeExpenses.length;
    return 0;
  }

  /** El alta de un egreso, desde cualquier pestaña. */
  createExpense(): void {
    const open = () => this.expensesList?.openCreateDrawer();

    if (this.activeTab === 'expenses') {
      open();
      return;
    }

    this.selectTab('expenses');
    setTimeout(open);
  }

  // ------------------------------------------------------------------- cifras

  /**
   * Los egresos vigentes **del periodo**.
   *
   * El listado llega completo —el endpoint no filtra por fecha— y se recorta aquí. Las
   * fechas se comparan como texto: el egreso guarda un día suelto sin hora, y parsearlo
   * a `Date` lo correría un día según el huso.
   */
  get activeExpenses(): ExpenseI[] {
    const { from, to } = this.range;

    return this.expenses.filter((expense) => {
      if (expense.is_active === false) return false;
      if (!from || !to) return true;

      const day = this.dayKey(expense.expense_date);
      return !!day && day >= from && day <= to;
    });
  }

  get totalIncome(): number {
    return this.toNumber(this.income?.summary?.total_collected);
  }

  get totalExpenses(): number {
    return this.activeExpenses.reduce((sum, expense) => sum + this.toNumber(expense.amount), 0);
  }

  /**
   * Lo que queda: la resta que nadie tenía a la vista.
   *
   * Ingresos menos egresos, sin más. No pretende ser una utilidad contable —eso vive en
   * los estados financieros— sino el resultado de caja del periodo.
   */
  get result(): number {
    return this.totalIncome - this.totalExpenses;
  }

  /** Qué proporción de lo que entra se va en gastos. */
  get expenseRatio(): number {
    if (this.totalIncome <= 0) return this.totalExpenses > 0 ? 100 : 0;
    return Math.min((this.totalExpenses / this.totalIncome) * 100, 100);
  }

  get isProfitable(): boolean {
    return this.result >= 0;
  }

  get incomeToday(): number {
    return this.toNumber(this.income?.summary?.today_collected);
  }

  get expensesToday(): number {
    const today = this.todayKey();
    return this.activeExpenses
      .filter((expense) => this.dayKey(expense.expense_date) === today)
      .reduce((sum, expense) => sum + this.toNumber(expense.amount), 0);
  }

  /** En qué se va el dinero: la categoría que más pesa. */
  get topExpenseCategory(): { label: string; amount: number; share: number } | null {
    const byCategory = new Map<string, number>();

    for (const expense of this.activeExpenses) {
      const label = (expense.expense_category_name || 'Sin categoria').trim();
      byCategory.set(label, (byCategory.get(label) || 0) + this.toNumber(expense.amount));
    }

    if (!byCategory.size) return null;

    const [label, amount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = this.totalExpenses;
    return { label, amount, share: total > 0 ? (amount / total) * 100 : 0 };
  }

  /** El desglose completo, para la pestaña de resultado. */
  get expenseBreakdown(): Array<{ label: string; amount: number; share: number }> {
    const byCategory = new Map<string, number>();

    for (const expense of this.activeExpenses) {
      const label = (expense.expense_category_name || 'Sin categoria').trim();
      byCategory.set(label, (byCategory.get(label) || 0) + this.toNumber(expense.amount));
    }

    const total = this.totalExpenses;
    return [...byCategory.entries()]
      .map(([label, amount]) => ({
        label,
        amount,
        share: total > 0 ? (amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * De dónde viene el dinero, según el consolidado.
   *
   * El importe del método es `total_amount`; el backend ya manda su participación en
   * `share_percent`, así que se usa esa y no una división propia —si el consolidado
   * excluye algo del total, las dos cuentas dejarían de cuadrar—.
   */
  get incomeByMethod(): Array<{ label: string; amount: number; share: number }> {
    const rows = this.income?.method_rows || [];
    const total = this.totalIncome;

    return rows
      .map((row) => {
        const amount = this.toNumber(row.total_amount);
        const share = this.toNumber(row.share_percent);

        return {
          label: String(row.method_label || 'Sin metodo'),
          amount,
          share: share > 0 ? share : total > 0 ? (amount / total) * 100 : 0
        };
      })
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }

  get metrics(): FinanceMetric[] {
    const top = this.topExpenseCategory;

    return [
      {
        key: 'income',
        label: 'Ingresos',
        value: this.formatCurrency(this.totalIncome),
        note: this.incomeToday
          ? `${this.formatCurrency(this.incomeToday)} hoy`
          : 'Sin cobros hoy',
        icon: 'fa-solid fa-arrow-trend-up',
        tone: 'success',
        tab: 'income'
      },
      {
        key: 'expenses',
        label: 'Egresos',
        value: this.formatCurrency(this.totalExpenses),
        note: top ? `${top.label} es lo que mas pesa` : 'Sin gastos registrados',
        icon: 'fa-solid fa-arrow-trend-down',
        tone: 'warning',
        tab: 'expenses'
      },
      {
        key: 'result',
        label: 'Resultado',
        value: this.formatCurrency(this.result),
        note: this.isProfitable
          ? `Queda el ${(100 - this.expenseRatio).toFixed(0)}% de lo que entra`
          : 'Se gasta mas de lo que entra',
        icon: 'fa-solid fa-scale-balanced',
        tone: this.isProfitable ? 'brand' : 'danger',
        tab: 'result'
      },
      {
        key: 'today',
        label: 'Movimiento de hoy',
        value: this.formatCurrency(this.incomeToday - this.expensesToday),
        note: `${this.formatCurrency(this.incomeToday)} entro, ${this.formatCurrency(this.expensesToday)} salio`,
        icon: 'fa-solid fa-calendar-day',
        tone: this.incomeToday - this.expensesToday >= 0 ? 'success' : 'danger',
        tab: 'result'
      }
    ];
  }

  trackByTab(_: number, tab: TabDefinition): string {
    return tab.key;
  }

  trackByMetric(_: number, metric: FinanceMetric): string {
    return metric.key;
  }

  trackByBreakdown(_: number, row: { label: string }): string {
    return row.label;
  }

  onFinanceChanged(): void {
    // Sin forzar: la escritura ya invalido el cache desde el servicio.
    this.loadSummary(false, true);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.fin-metric'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.fin-tab'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26
        });
        this.motion.reveal(host.querySelectorAll('.fin-panel'), { stagger: 0, y: 12, delay: 0.06 });
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private isTab(value: string): value is FinanceTab {
    return value === 'result' || value === 'income' || value === 'expenses';
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Hoy, en el calendario **local** del hotel.
   *
   * `toISOString()` da el día en UTC: de noche en Colombia (UTC-5) eso ya es mañana, y
   * "el movimiento de hoy" salía en cero mientras el rango del periodo —que sí es
   * local— seguía en el día correcto. Las dos fechas tienen que salir del mismo reloj.
   */
  private todayKey(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private dayKey(value: string | null | undefined): string {
    if (!value) return '';
    // Las fechas de egreso vienen sin hora: partir por la T evita que el huso las
    // desplace un dia al parsearlas.
    return String(value).slice(0, 10);
  }
}
