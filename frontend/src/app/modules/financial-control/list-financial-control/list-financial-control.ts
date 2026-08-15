import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MotionService } from '../../../services/motion';
import { FinancialControlConfigPayload, FinancialControlService } from '../../../services/financial-control';

type CardTone = 'blue' | 'green' | 'amber' | 'red' | 'gray';
type TrafficTone = 'green' | 'yellow' | 'red' | 'gray';
type FinancialTab = 'dashboard' | 'what_if' | 'statements' | 'config';

/** Atajos de periodo: nadie quiere teclear dos fechas para ver el mes en curso. */
type PeriodPreset = 'this_month' | 'last_month' | 'last_30' | 'this_year';

/** Escenarios tipicos, para no partir siempre de cuatro ceros. */
type ScenarioPreset = 'raise_rate' | 'high_season' | 'low_season' | 'cost_shock';

type HotelConfigOption = {
  id: number;
  configId: number | null;
  hotelSettingsId: number;
  hotelName: string;
  districtName: string;
};

type FinancialControlConfigRecord = {
  id: number;
  hotelSettingsId: number;
  hotelName: string;
  districtName: string;
  tourismLawEnabled: boolean;
  tourismLawPreferentialRate: number;
  standardIncomeTaxRate: number;
  hasIvaExemption: boolean;
  ivaRate: number;
  icaRatePerThousand: number;
  fonturRatePerThousand: number;
  breakEvenWarningPct: number;
  breakEvenOptimalPct: number;
  operationalHighOccupancyThresholdPct: number;
  operationalLowAvailabilityThresholdRooms: number;
  operationalRevenueDropThresholdPct: number;
  operationalHighRefundsThresholdCount: number;
  operationalRevenueWindowDays: number;
  operationalRefundWindowDays: number;
};

type FinancialControlConfigForm = {
  districtName: string;
  tourismLawEnabled: boolean;
  tourismLawPreferentialRate: number | null;
  standardIncomeTaxRate: number | null;
  hasIvaExemption: boolean;
  ivaRate: number | null;
  icaRatePerThousand: number | null;
  fonturRatePerThousand: number | null;
  breakEvenWarningPct: number | null;
  breakEvenOptimalPct: number | null;
  operationalHighOccupancyThresholdPct: number | null;
  operationalLowAvailabilityThresholdRooms: number | null;
  operationalRevenueDropThresholdPct: number | null;
  operationalHighRefundsThresholdCount: number | null;
  operationalRevenueWindowDays: number | null;
  operationalRefundWindowDays: number | null;
};

/**
 * `hint` explica el indicador en cristiano.
 *
 * Esta pantalla esta llena de jerga --RevPAR, CPHO, ICA, FONTUR-- que el hotelero no
 * tiene por que saberse. Sin una linea que la traduzca, la mitad del tablero es ruido
 * bonito: se ve, no se entiende, y no se usa.
 */
type SummaryCard = {
  label: string;
  valueLabel: string;
  note: string;
  hint?: string;
  icon: string;
  tone: CardTone;
};

type MetricCard = {
  label: string;
  valueLabel: string;
  note: string;
  hint?: string;
  icon: string;
  tone: CardTone;
};

type TrendRow = {
  month: string;
  revpar: number;
  roomRevenue: number;
  roomCount: number;
  availableRoomNights: number;
};

type DashboardVm = {
  periodLabel: string;
  summaryCards: SummaryCard[];
  benchmarkCards: MetricCard[];
  taxCards: MetricCard[];
  revparTrend: TrendRow[];
  breakEven: {
    progressPct: number;
    status: string;
    breakEvenRevenue: number | null;
    fixedCosts: number;
    variableCosts: number;
    cpho: number;
  };
  traffic: {
    tone: TrafficTone;
    label: string;
    reasons: string[];
  };
};

type WhatIfVm = {
  periodLabel: string;
  baseCards: MetricCard[];
  projectedCards: MetricCard[];
  deltaCards: MetricCard[];
  /**
   * Las cifras crudas de la utilidad, para el titular.
   *
   * Tres columnas de cuatro tarjetas obligan a buscar "utilidad" en dos sitios y restar
   * mentalmente. Lo unico que se quiere saber de un escenario es si se gana o se pierde
   * plata con el, y cuanta.
   */
  baseNetProfit: number;
  projectedNetProfit: number;
  hasResult: boolean;
};

type StatementRowVm = {
  section: string;
  account: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

type IndicatorVm = {
  label: string;
  formula: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
};

type StatementsVm = {
  periodCurrent: string;
  periodPrevious: string;
  balanceRows: StatementRowVm[];
  balanceTotals: StatementRowVm[];
  incomeRows: StatementRowVm[];
  indicators: IndicatorVm[];
};

@Component({
  selector: 'app-list-financial-control',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule],
  templateUrl: './list-financial-control.html',
  styleUrls: ['./list-financial-control.css'],
})
export class ListFinancialControl implements OnInit, OnDestroy {
  loadingConfigs = false;
  loadingDashboard = false;
  loadingWhatIf = false;
  loadingStatements = false;

  dashboardError = '';
  whatIfError = '';
  statementsError = '';
  configInfoMessage = '';
  configValidationError = '';
  configSaveMessage = '';
  periodValidationError = '';
  statementValidationError = '';
  activeTab: FinancialTab = 'dashboard';
  savingConfig = false;

  configs: HotelConfigOption[] = [];
  selectedHotelSettingsId: number | null = null;
  private readonly defaultDistrictName = 'Riohacha';
  private readonly configRecordByHotelSettingsId = new Map<number, FinancialControlConfigRecord>();
  configForm: FinancialControlConfigForm = this.emptyFinancialConfigForm();

  startDate = '';
  endDate = '';
  statementYear = new Date().getFullYear();
  statementMonth = new Date().getMonth() + 1;

  rateChangePct = 0;
  occupancyChangePct = 0;
  targetOccupancyPctInput = '';
  operatingCostChangePct = 0;

  // ------------------------------------------------------------------ graficos
  //
  // Una barra se compara de un vistazo; una columna de cifras hay que leerla entera.
  // Los datos se recalculan al llegar cada respuesta, no en un getter: Chart.js
  // redibuja en cada cambio de referencia y un getter le daria un objeto nuevo en cada
  // ciclo de deteccion.
  compositionData: ChartData<'bar'> = { labels: [], datasets: [] };
  compositionOptions: ChartOptions<'bar'> = {};

  benchmarkData: ChartData<'bar'> = { labels: [], datasets: [] };
  benchmarkOptions: ChartOptions<'bar'> = {};

  taxData: ChartData<'bar'> = { labels: [], datasets: [] };
  taxOptions: ChartOptions<'bar'> = {};

  revparData: ChartData<'line'> = { labels: [], datasets: [] };
  revparOptions: ChartOptions<'line'> = {};

  /** Paleta validada contra el fondo real de la tarjeta. Ver AGENTS.md. */
  private readonly viz = {
    series: '#2a78d6',
    seriesSoft: 'rgba(42, 120, 214, 0.1)',
    negative: '#e34948',
    tick: '#64748b',
    grid: '#e8edf6',
  };

  dashboardVm: DashboardVm = this.emptyDashboardVm();
  whatIfVm: WhatIfVm = this.emptyWhatIfVm();
  statementsVm: StatementsVm = this.emptyStatementsVm();

  readonly monthOptions = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];
  readonly tabs: Array<{ key: FinancialTab; label: string; icon: string; hint: string }> = [
    {
      key: 'dashboard',
      label: 'Tablero',
      icon: 'fa-solid fa-chart-line',
      hint: 'Como va el hotel en el periodo: punto de equilibrio, alertas y tendencia',
    },
    {
      key: 'what_if',
      label: 'Escenarios',
      icon: 'fa-solid fa-flask',
      hint: 'Que pasaria si subo la tarifa o cambia la ocupacion',
    },
    {
      key: 'statements',
      label: 'Estados',
      icon: 'fa-solid fa-file-invoice',
      hint: 'Estado de resultados e indicadores del mes',
    },
    {
      key: 'config',
      label: 'Umbrales',
      icon: 'fa-solid fa-sliders',
      hint: 'Impuestos y limites que disparan las alertas',
    },
  ];

  readonly scenarioPresets: Array<{
    key: ScenarioPreset;
    label: string;
    icon: string;
    hint: string;
  }> = [
    {
      key: 'raise_rate',
      label: 'Subir tarifa 10%',
      icon: 'fa-solid fa-arrow-up',
      hint: 'Sube el precio un 10% y asume que se pierde algo de ocupacion',
    },
    {
      key: 'high_season',
      label: 'Temporada alta',
      icon: 'fa-solid fa-sun',
      hint: 'Mas ocupacion y mejor tarifa, con los costos que eso arrastra',
    },
    {
      key: 'low_season',
      label: 'Temporada baja',
      icon: 'fa-solid fa-cloud-rain',
      hint: 'Cae la ocupacion: cuanto aguanta el hotel',
    },
    {
      key: 'cost_shock',
      label: 'Costos +15%',
      icon: 'fa-solid fa-fire',
      hint: 'Suben nomina y servicios sin poder subir la tarifa',
    },
  ];

  readonly periodPresets: Array<{ key: PeriodPreset; label: string }> = [
    { key: 'this_month', label: 'Este mes' },
    { key: 'last_month', label: 'Mes pasado' },
    { key: 'last_30', label: 'Ultimos 30 dias' },
    { key: 'this_year', label: 'Este ano' },
  ];

  private readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
  private readonly amountFormatter = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  private readonly integerFormatter = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  });

  /**
   * Que pestañas ya trajeron sus datos.
   *
   * Antes la pantalla pedia el tablero, el escenario y los estados **de golpe** en cada
   * carga y en cada cambio de hotel: tres consultas pesadas para mirar una sola. Ahora
   * cada pestaña pide lo suyo la primera vez que se abre.
   */
  private readonly loadedTabs = new Set<FinancialTab>();

  private revealFrame: number | null = null;

  constructor(
    private financialControlService: FinancialControlService,
    private hotelSettingsService: HotelSettingsService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.startDate = this.toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    this.endDate = this.toIsoDate(now);
    this.statementYear = now.getFullYear();
    this.statementMonth = now.getMonth() + 1;

    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadConfigsAndBootstrap();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  get isRefreshing(): boolean {
    return this.loadingDashboard || this.loadingWhatIf || this.loadingStatements || this.loadingConfigs;
  }

  get breakEvenProgressWidth(): number {
    const value = Number(this.dashboardVm.breakEven.progressPct || 0);
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 100);
  }

  get breakEvenStatusTone(): TrafficTone {
    const status = String(this.dashboardVm.breakEven.status || '').toUpperCase();
    if (status === 'OPTIMAL') return 'green';
    if (status === 'WARNING') return 'yellow';
    if (status === 'CRITICAL') return 'red';
    return 'gray';
  }

  /** El estado llega del backend en ingles y en mayusculas; nadie lee eso. */
  get breakEvenStatusLabel(): string {
    const status = String(this.dashboardVm.breakEven.status || '').toUpperCase();
    if (status === 'OPTIMAL') return 'En equilibrio';
    if (status === 'WARNING') return 'Ajustado';
    if (status === 'CRITICAL') return 'En riesgo';
    return 'Sin datos';
  }

  /**
   * Lo que falta para cubrir el punto de equilibrio, en pesos.
   *
   * "87%" no le dice a nadie que hacer; "faltan $4.200.000 por facturar" si. Se deriva
   * del avance y del ingreso de equilibrio, que ya vienen en la respuesta.
   */
  get breakEvenSentence(): string {
    const target = Number(this.dashboardVm.breakEven.breakEvenRevenue);
    const progress = Number(this.dashboardVm.breakEven.progressPct);

    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(progress)) {
      return 'Sin costos cargados no hay punto de equilibrio que calcular.';
    }

    if (progress >= 100) {
      const surplus = target * (progress / 100 - 1);
      return `Los costos del periodo estan cubiertos, con ${this.currencyFormatter.format(surplus)} por encima.`;
    }

    const missing = target * (1 - progress / 100);
    return `Faltan ${this.currencyFormatter.format(missing)} por facturar para cubrir los costos del periodo.`;
  }

  // ---------------------------------------------------------------- veredicto
  //
  // El tablero abria con trece tarjetas del mismo peso y el semaforo --que es LA
  // respuesta-- enterrado en la mitad. Quien abre esta pantalla viene a preguntar una
  // sola cosa: **como va el hotel**. Eso va arriba, en una frase, y el resto es el
  // detalle que la sustenta.

  get verdictTone(): TrafficTone {
    return this.dashboardVm.traffic.tone;
  }

  /** El titular: como va el hotel, en dos palabras. */
  get verdictTitle(): string {
    const tone = this.verdictTone;
    if (tone === 'green') return 'El periodo va bien';
    if (tone === 'yellow') return 'El periodo va ajustado';
    if (tone === 'red') return 'El periodo va en rojo';
    return 'Sin datos suficientes';
  }

  /**
   * El porque, en una linea.
   *
   * Prefiere lo que falta para el equilibrio --que es accionable-- sobre la etiqueta del
   * semaforo, que solo repite el color con otras palabras.
   */
  get verdictSubtitle(): string {
    if (this.verdictTone === 'gray') {
      return 'Carga costos y gastos del periodo para que el tablero pueda decir algo.';
    }
    return this.breakEvenSentence;
  }

  /** Las razones del semaforo son la letra pequeña del veredicto. */
  get verdictReasons(): string[] {
    return this.dashboardVm.traffic.reasons;
  }

  get hasDashboardData(): boolean {
    return this.dashboardVm.summaryCards.length > 0;
  }

  // ------------------------------------------------------------ tendencia RevPAR
  //
  // Doce filas de tabla no dejan ver una tendencia; doce barras, si.

  get revparMax(): number {
    return this.dashboardVm.revparTrend.reduce((max, row) => Math.max(max, row.revpar), 0);
  }

  revparShare(row: TrendRow): number {
    const max = this.revparMax;
    if (max <= 0) return 0;
    // Un minimo visible: una barra de cero altura parece un fallo de carga.
    return Math.max((row.revpar / max) * 100, 2);
  }

  /** El mes mas alto de la serie, para poder senalarlo. */
  isBestMonth(row: TrendRow): boolean {
    return row.revpar > 0 && row.revpar === this.revparMax;
  }

  /** `2026-08` no se lee; `ago 26` si. */
  monthLabel(month: string): string {
    const raw = String(month || '').trim();
    const match = /^(\d{4})-(\d{2})/.exec(raw);
    if (!match) return raw || '-';

    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const index = Number(match[2]) - 1;
    if (index < 0 || index > 11) return raw;
    return `${names[index]} ${match[1].slice(2)}`;
  }

  get selectedConfigRecord(): FinancialControlConfigRecord | null {
    if (!this.selectedHotelSettingsId) return null;
    return this.configRecordByHotelSettingsId.get(this.selectedHotelSettingsId) ?? null;
  }

  get hasSelectedConfig(): boolean {
    return this.selectedConfigRecord !== null;
  }

  trackByConfig(_: number, item: HotelConfigOption): number {
    return item.id;
  }

  trackByTab(_: number, tab: { key: FinancialTab }): FinancialTab {
    return tab.key;
  }

  trackBySummaryCard(_: number, card: SummaryCard): string {
    return card.label;
  }

  trackByMetricCard(_: number, card: MetricCard): string {
    return `${card.label}-${card.tone}`;
  }

  trackByTrend(_: number, row: TrendRow): string {
    return row.month;
  }

  trackByStatementRow(index: number, row: StatementRowVm): string {
    return `${row.section}-${row.account}-${index}`;
  }

  trackByIndicator(_: number, indicator: IndicatorVm): string {
    return indicator.label;
  }

  selectTab(tab: FinancialTab): void {
    this.activeTab = tab;

    // La pestaña vive en la URL: recargar o compartir el enlace cae donde estabas.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });

    if (tab === 'config') {
      this.configValidationError = '';
      this.configSaveMessage = '';
      this.syncConfigFormWithSelection();
    }

    this.loadActiveTab();
    this.scheduleReveal();
  }

  onHotelFilterChange(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    this.syncConfigFormWithSelection();
    // Cambiar de hotel invalida lo cargado: los datos eran de otro hotel.
    this.loadedTabs.clear();
    this.loadActiveTab();
  }

  /** Atajos de periodo: un clic en vez de dos calendarios. */
  applyPreset(preset: PeriodPreset): void {
    const now = new Date();
    let start: Date;
    let end = now;

    if (preset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'last_30') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }

    this.startDate = this.toIsoDate(start);
    this.endDate = this.toIsoDate(end);

    // El mes de los estados sigue al periodo: son la misma pregunta vista de dos formas.
    this.statementYear = end.getFullYear();
    this.statementMonth = end.getMonth() + 1;

    this.applyPeriodFilters();
  }

  isPresetActive(preset: PeriodPreset): boolean {
    const now = new Date();
    const same = (start: Date, end: Date) =>
      this.startDate === this.toIsoDate(start) && this.endDate === this.toIsoDate(end);

    if (preset === 'this_month') return same(new Date(now.getFullYear(), now.getMonth(), 1), now);
    if (preset === 'last_month') {
      return same(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 0)
      );
    }
    if (preset === 'last_30') {
      return same(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), now);
    }
    return same(new Date(now.getFullYear(), 0, 1), now);
  }

  // ------------------------------------------------------------------ exportar

  get canExportStatements(): boolean {
    return (
      !this.loadingStatements &&
      (this.statementsVm.balanceRows.length > 0 || this.statementsVm.incomeRows.length > 0)
    );
  }

  /**
   * Descarga los dos estados en un CSV.
   *
   * Se genera en el navegador con lo que ya esta en pantalla: no hay endpoint de
   * exportacion y pedir uno solo para esto seria pedirle al servidor que repita un
   * calculo que ya hizo.
   *
   * Separador `;` y BOM: es lo que Excel en español abre sin preguntar nada.
   */
  exportStatements(): void {
    if (!this.canExportStatements) return;

    const rows: string[][] = [['Estado', 'Seccion', 'Cuenta', 'Actual', 'Anterior', 'Delta', 'Var %']];

    const push = (statement: string, list: StatementRowVm[]) => {
      for (const row of list) {
        rows.push([
          statement,
          row.section || '',
          row.account || '',
          String(row.current ?? ''),
          String(row.previous ?? ''),
          String(row.delta ?? ''),
          row.deltaPct === null || row.deltaPct === undefined ? '' : String(row.deltaPct),
        ]);
      }
    };

    push('Situacion financiera', this.statementsVm.balanceRows);
    push('Situacion financiera', this.statementsVm.balanceTotals);
    push('Resultados integrales', this.statementsVm.incomeRows);

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const hotel = (this.selectedConfigRecord?.hotelName || 'hotel').replace(/[^\w-]+/g, '-');
    const period = `${this.statementYear}-${String(this.statementMonth).padStart(2, '0')}`;

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estados-financieros-${hotel}-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------- resultado del escenario
  //
  // El simulador devolvia tres columnas de cuatro tarjetas: base, proyectado y delta.
  // Para saber lo unico que importa --si con este escenario se gana o se pierde plata--
  // habia que buscar "utilidad" en dos columnas y restar de cabeza.

  /** Cuanta utilidad gana o pierde el hotel con el escenario. */
  get scenarioProfitDelta(): number {
    return this.whatIfVm.projectedNetProfit - this.whatIfVm.baseNetProfit;
  }

  get scenarioImproves(): boolean {
    return this.scenarioProfitDelta >= 0;
  }

  /** El titular: que le pasa a la utilidad si esto ocurre. */
  get scenarioHeadline(): string {
    if (!this.whatIfVm.hasResult) return 'Simula un escenario para ver que le pasa a la utilidad.';

    const delta = this.scenarioProfitDelta;
    if (Math.abs(delta) < 1) return 'La utilidad se queda practicamente igual.';

    const amount = this.currencyFormatter.format(Math.abs(delta));
    return delta > 0 ? `La utilidad sube ${amount}` : `La utilidad baja ${amount}`;
  }

  /** De cuanto a cuanto, que es lo que da sentido a la diferencia. */
  get scenarioFromTo(): string {
    if (!this.whatIfVm.hasResult) return '';
    const from = this.currencyFormatter.format(this.whatIfVm.baseNetProfit);
    const to = this.currencyFormatter.format(this.whatIfVm.projectedNetProfit);
    return `De ${from} a ${to}`;
  }

  /**
   * Un escenario que deja la utilidad en negativo es una advertencia, no un resultado.
   *
   * Puede subir respecto a la base y aun asi dar perdida: las dos cosas son ciertas y la
   * segunda importa mas.
   */
  get scenarioEndsInLoss(): boolean {
    return this.whatIfVm.hasResult && this.whatIfVm.projectedNetProfit < 0;
  }

  // ----------------------------------------------------------------- escenarios

  /**
   * Escenarios tipicos.
   *
   * Cada uno mueve varias palancas a la vez porque en la realidad van juntas: subir la
   * tarifa cuesta ocupacion, y la temporada alta trae mas costos con mas huespedes.
   */
  applyScenarioPreset(preset: ScenarioPreset): void {
    if (preset === 'raise_rate') {
      this.rateChangePct = 10;
      this.occupancyChangePct = -5;
      this.operatingCostChangePct = 0;
    } else if (preset === 'high_season') {
      this.rateChangePct = 15;
      this.occupancyChangePct = 20;
      this.operatingCostChangePct = 8;
    } else if (preset === 'low_season') {
      this.rateChangePct = -10;
      this.occupancyChangePct = -25;
      this.operatingCostChangePct = -5;
    } else {
      this.rateChangePct = 0;
      this.occupancyChangePct = 0;
      this.operatingCostChangePct = 15;
    }

    this.targetOccupancyPctInput = '';
    this.runWhatIf();
  }

  resetScenario(): void {
    this.rateChangePct = 0;
    this.occupancyChangePct = 0;
    this.operatingCostChangePct = 0;
    this.targetOccupancyPctInput = '';
    this.runWhatIf();
  }

  signedPct(value: number | string): string {
    const parsed = Number(value) || 0;
    return `${parsed > 0 ? '+' : ''}${parsed}%`;
  }

  /** El escenario dicho en una frase, para no leer cuatro deslizadores por separado. */
  get scenarioSentence(): string {
    const parts: string[] = [];
    const describe = (value: number | string, up: string, down: string) => {
      const parsed = Number(value) || 0;
      if (!parsed) return;
      parts.push(`${parsed > 0 ? up : down} ${Math.abs(parsed)}%`);
    };

    describe(this.rateChangePct, 'la tarifa sube', 'la tarifa baja');
    describe(this.occupancyChangePct, 'la ocupacion sube', 'la ocupacion baja');
    describe(this.operatingCostChangePct, 'los costos suben', 'los costos bajan');

    const target = this.parseOptionalNumber(this.targetOccupancyPctInput);
    if (target !== null) parts.push(`la ocupacion queda en ${target}%`);

    if (!parts.length) return 'Escenario sin cambios: es el periodo tal como fue.';
    return `Si ${parts.join(', ')}...`;
  }

  /** Los filtros que la pestaña activa realmente usa. */
  get showsDateRange(): boolean {
    return this.activeTab === 'dashboard' || this.activeTab === 'what_if';
  }

  get showsStatementPeriod(): boolean {
    return this.activeTab === 'statements';
  }

  restoreConfigForm(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    this.syncConfigFormWithSelection();
  }

  saveConfig(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';

    const hotelSettingsId = this.selectedHotelSettingsId;
    if (!hotelSettingsId || hotelSettingsId <= 0) {
      this.configValidationError = 'Debes seleccionar un hotel para guardar la configuracion.';
      return;
    }

    const payloadResult = this.buildConfigPayload(hotelSettingsId);
    if (payloadResult.error) {
      this.configValidationError = payloadResult.error;
      return;
    }

    const existingConfig = this.selectedConfigRecord;
    const updatePayload: Partial<FinancialControlConfigPayload> = { ...payloadResult.payload };
    delete updatePayload.hotel_settings;

    const request$ = existingConfig
      ? this.financialControlService.updateConfig(existingConfig.id, updatePayload)
      : this.financialControlService.createConfig(payloadResult.payload);

    this.savingConfig = true;
    request$.subscribe({
      next: (payload) => {
        this.savingConfig = false;
        // Los umbrales alimentan el semaforo y los impuestos el estado de resultados:
        // lo ya cargado quedo viejo.
        this.loadedTabs.clear();
        const parsed = this.parseConfigRecord(payload);
        if (parsed) {
          this.upsertConfigRecord(parsed);
          this.selectedHotelSettingsId = parsed.hotelSettingsId;
          this.syncConfigFormWithSelection();
          this.configSaveMessage = existingConfig
            ? 'Configuracion financiera actualizada.'
            : 'Configuracion financiera creada.';
        } else {
          this.configSaveMessage = 'Configuracion guardada. Actualiza para ver los cambios.';
          this.loadConfigsAndBootstrap();
        }
      },
      error: (error) => {
        this.savingConfig = false;
        this.configValidationError = this.extractHttpErrorMessage(
          error,
          'No fue posible guardar la configuracion financiera.'
        );
      },
    });
  }

  /**
   * Cambiar el periodo invalida lo que dependia de el, no lo recarga todo.
   *
   * Los estados financieros no miran `startDate`/`endDate` sino ano y mes, asi que un
   * cambio de rango no tiene por que volver a pedirlos.
   */
  applyPeriodFilters(): void {
    if (!this.validateDateRange()) return;
    if (!this.ensureHotelSelection('dashboard')) return;

    this.loadedTabs.delete('dashboard');
    this.loadedTabs.delete('what_if');
    this.loadActiveTab();
  }

  applyStatementsFilters(): void {
    if (!this.validateStatementPeriod()) return;
    if (!this.ensureHotelSelection('statements')) return;

    this.loadedTabs.delete('statements');
    this.loadStatements();
  }

  /** El boton de actualizar: trae datos frescos **de lo que se esta mirando**. */
  refreshAll(): void {
    if (!this.ensureHotelSelection('all')) return;

    this.loadedTabs.delete(this.activeTab);
    this.loadActiveTab(true);
  }

  /**
   * Carga lo que la pestaña activa necesita, y solo si aun no lo tiene.
   *
   * `force` salta tanto esta marca como el cache del servicio: es el boton de actualizar.
   */
  private loadActiveTab(force = false): void {
    if (this.loadingConfigs) return;
    if (!this.selectedHotelSettingsId) return;
    if (!force && this.loadedTabs.has(this.activeTab)) return;

    if (this.activeTab === 'dashboard') {
      if (this.validateDateRange()) this.loadDashboard(force);
      return;
    }

    if (this.activeTab === 'what_if') {
      if (this.validateDateRange()) this.runWhatIf(force);
      return;
    }

    if (this.activeTab === 'statements') {
      if (this.validateStatementPeriod()) this.loadStatements(force);
    }

    // `config` no consulta nada: los umbrales llegaron con la lista de configuraciones.
  }

  runWhatIf(forceRefresh = false): void {
    if (!this.validateDateRange()) return;
    if (!this.ensureHotelSelection('what_if')) return;

    this.loadingWhatIf = true;
    this.whatIfError = '';

    const targetOccupancyPct = this.parseOptionalNumber(this.targetOccupancyPctInput);
    this.financialControlService
      .getWhatIf({
        ...this.buildDateRangeParams(),
        rate_change_pct: this.rateChangePct,
        occupancy_change_pct: this.occupancyChangePct,
        target_occupancy_pct: targetOccupancyPct ?? undefined,
        operating_cost_change_pct: this.operatingCostChangePct,
        forceRefresh,
      })
      .subscribe({
        next: (payload) => {
          this.whatIfVm = this.buildWhatIfVm(payload);
          this.loadingWhatIf = false;
          this.loadedTabs.add('what_if');
          this.scheduleReveal();
        },
        error: (error) => {
          this.loadingWhatIf = false;
          this.whatIfVm = this.emptyWhatIfVm();
          this.whatIfError = this.extractHttpErrorMessage(error, 'No fue posible calcular el escenario.');
        },
      });
  }

  toggleConfigSection(): void {
    this.configValidationError = '';
    this.configSaveMessage = '';
    if (this.selectedHotelSettingsId) {
      this.syncConfigFormWithSelection();
    }
  }

  saveConfiguration(): void {
    if (!this.selectedHotelSettingsId) {
      this.configValidationError = 'Debes seleccionar un hotel.';
      return;
    }

    this.configValidationError = '';
    this.configSaveMessage = '';

    const payloadResult = this.buildConfigPayload(this.selectedHotelSettingsId);
    if (payloadResult.error) {
      this.configValidationError = payloadResult.error;
      return;
    }

    const existingConfig = this.selectedConfigRecord;
    const updatePayload: Partial<FinancialControlConfigPayload> = { ...payloadResult.payload };
    delete updatePayload.hotel_settings;

    const request$ = existingConfig
      ? this.financialControlService.updateConfig(existingConfig.id, updatePayload)
      : this.financialControlService.createConfig(payloadResult.payload);

    this.savingConfig = true;
    request$.subscribe({
      next: (payload) => {
        this.savingConfig = false;
        // Los umbrales alimentan el semaforo y los impuestos el estado de resultados:
        // lo ya cargado quedo viejo.
        this.loadedTabs.clear();
        const parsed = this.parseConfigRecord(payload);
        if (parsed) {
          this.upsertConfigRecord(parsed);
          this.selectedHotelSettingsId = parsed.hotelSettingsId;
          this.syncConfigFormWithSelection();
          this.configSaveMessage = existingConfig
            ? 'Configuracion financiera actualizada.'
            : 'Configuracion financiera creada.';
        } else {
          this.configSaveMessage = 'Configuracion guardada. Actualiza para ver los cambios.';
          this.loadConfigsAndBootstrap();
        }
      },
      error: (error) => {
        this.savingConfig = false;
        this.configValidationError = this.extractHttpErrorMessage(
          error,
          'No fue posible guardar la configuracion financiera.'
        );
      },
    });
  }

  private loadConfigsAndBootstrap(): void {
    this.loadingConfigs = true;
    this.configInfoMessage = '';

    forkJoin({
      configs: this.financialControlService.listConfigs().pipe(
        catchError((error) => {
          this.configInfoMessage = this.extractHttpErrorMessage(
            error,
            'No fue posible cargar configuraciones financieras.'
          );
          return of([] as Record<string, unknown>[]);
        })
      ),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe(({ configs, settings }) => {
      const records = this.parseConfigRecords(configs);
      this.configRecordByHotelSettingsId.clear();
      for (const record of records) {
        this.configRecordByHotelSettingsId.set(record.hotelSettingsId, record);
      }
      this.configs = records.map((record) => ({
        id: record.id,
        configId: record.id,
        hotelSettingsId: record.hotelSettingsId,
        hotelName: record.hotelName,
        districtName: record.districtName,
      }));

      const currentSettingsId = Number(settings?.id || 0);
      const currentHotelName = String(settings?.hotel_name || '').trim();

      if (currentSettingsId > 0 && !this.configs.some((item) => item.hotelSettingsId === currentSettingsId)) {
        this.configs.unshift({
          id: -currentSettingsId,
          configId: null,
          hotelSettingsId: currentSettingsId,
          hotelName: currentHotelName || `Hotel #${currentSettingsId}`,
          districtName: '',
        });
      }

      if (!this.selectedHotelSettingsId && this.configs.length > 0) {
        this.selectedHotelSettingsId = this.configs[0].hotelSettingsId;
      }

      this.syncConfigFormWithSelection();

      if (!this.configs.length && !this.configInfoMessage) {
        this.configInfoMessage =
          'No hay configuraciones financieras ni hotel activo. Debes crear o seleccionar un hotel para consultar el modulo.';
      }

      this.loadingConfigs = false;
      this.loadActiveTab();
      this.scheduleReveal();
    });
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.tab-btn'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26,
        });
        this.motion.reveal(host.querySelectorAll('.stat-card'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.insight-card, .module-card'), {
          stagger: 0.05,
          y: 12,
          delay: 0.06,
        });
      });
    });
  }

  private isTab(value: string): value is FinancialTab {
    return value === 'dashboard' || value === 'what_if' || value === 'statements' || value === 'config';
  }

  private loadDashboard(forceRefresh = false): void {
    if (!this.ensureHotelSelection('dashboard')) return;

    this.loadingDashboard = true;
    this.dashboardError = '';

    this.financialControlService
      .getDashboard({ ...this.buildDateRangeParams(), forceRefresh })
      .subscribe({
      next: (payload) => {
        this.dashboardVm = this.buildDashboardVm(payload);
        this.buildDashboardCharts();
        this.loadingDashboard = false;
        this.loadedTabs.add('dashboard');
        this.scheduleReveal();
      },
      error: (error) => {
        this.loadingDashboard = false;
        this.dashboardVm = this.emptyDashboardVm();
        this.dashboardError = this.extractHttpErrorMessage(error, 'No fue posible cargar el tablero financiero.');
      },
    });
  }

  private loadStatements(forceRefresh = false): void {
    if (!this.ensureHotelSelection('statements')) return;

    this.loadingStatements = true;
    this.statementsError = '';

    this.financialControlService
      .getStatements({ ...this.buildStatementParams(), forceRefresh })
      .subscribe({
      next: (payload) => {
        this.statementsVm = this.buildStatementsVm(payload);
        this.loadingStatements = false;
        this.loadedTabs.add('statements');
        this.scheduleReveal();
      },
      error: (error) => {
        this.loadingStatements = false;
        this.statementsVm = this.emptyStatementsVm();
        this.statementsError = this.extractHttpErrorMessage(
          error,
          'No fue posible cargar los estados financieros.'
        );
      },
    });
  }

  private buildDateRangeParams(): {
    hotel_settings?: number;
    start_date: string;
    end_date: string;
  } {
    return {
      start_date: this.startDate,
      end_date: this.endDate,
      ...(this.selectedHotelSettingsId ? { hotel_settings: this.selectedHotelSettingsId } : {}),
    };
  }

  private buildStatementParams(): { hotel_settings?: number; year: number; month: number } {
    return {
      year: this.statementYear,
      month: this.statementMonth,
      ...(this.selectedHotelSettingsId ? { hotel_settings: this.selectedHotelSettingsId } : {}),
    };
  }

  private validateDateRange(): boolean {
    this.periodValidationError = '';
    if (!this.startDate || !this.endDate) {
      this.periodValidationError = 'Debes seleccionar fecha inicial y fecha final.';
      return false;
    }
    if (this.startDate > this.endDate) {
      this.periodValidationError = 'La fecha inicial no puede ser mayor que la fecha final.';
      return false;
    }
    return true;
  }

  private validateStatementPeriod(): boolean {
    this.statementValidationError = '';
    if (this.statementYear < 1900 || this.statementYear > 2999) {
      this.statementValidationError = 'El ano debe estar entre 1900 y 2999.';
      return false;
    }
    if (this.statementMonth < 1 || this.statementMonth > 12) {
      this.statementValidationError = 'El mes debe estar entre 1 y 12.';
      return false;
    }
    return true;
  }

  private buildDashboardVm(payload: Record<string, unknown>): DashboardVm {
    const periodStart = this.getString(payload, ['period', 'start_date']);
    const periodEnd = this.getString(payload, ['period', 'end_date']);

    const revenue = this.getNumber(payload, ['summary', 'revenue']);
    const costs = this.getNumber(payload, ['summary', 'costs']);
    const expenses = this.getNumber(payload, ['summary', 'expenses']);
    const netProfit = this.getNumber(payload, ['summary', 'net_profit']);
    const occupancyRatePct = this.getNumber(payload, ['summary', 'occupancy_rate_pct']);
    const grossOperatingProfit = this.getNumber(payload, ['summary', 'gross_operating_profit']);

    const breakEvenProgress = this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'progress_pct']);
    const breakEvenStatus = this.getString(payload, ['operational_efficiency', 'break_even_dynamic', 'status']) || '-';

    const benchmarkRevenuePct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'revenue_pct']);
    const benchmarkNetProfitPct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'net_profit_pct']);
    const benchmarkOccupancyPts = this.getNumber(payload, ['benchmarking', 'variance', 'occupancy_rate_pts']);
    const benchmarkRevparPct = this.getNullableNumber(payload, ['benchmarking', 'variance', 'revpar_pct']);

    const trafficColor = this.getString(payload, ['financial_traffic_light', 'color']).toUpperCase();
    const trafficTone: TrafficTone =
      trafficColor === 'GREEN'
        ? 'green'
        : trafficColor === 'YELLOW'
          ? 'yellow'
          : trafficColor === 'RED'
            ? 'red'
            : 'gray';
    const trafficLabel = this.getString(payload, ['financial_traffic_light', 'label']) || 'Sin clasificacion';
    const trafficReasons = this.getStringArray(payload, ['financial_traffic_light', 'reasons']);

    const revparTrend = this.getRecordArray(payload, ['profitability_and_sales', 'revpar_monthly_trend']).map(
      (row) => ({
        month: this.getString(row, ['month']) || '-',
        revpar: this.getNumber(row, ['revpar']),
        roomRevenue: this.getNumber(row, ['room_revenue']),
        roomCount: this.getNumber(row, ['room_count']),
        availableRoomNights: this.getNumber(row, ['available_room_nights']),
      })
    );

    return {
      periodLabel: periodStart && periodEnd ? `${periodStart} a ${periodEnd}` : 'Periodo sin definir',
      summaryCards: [
        {
          label: 'Ingresos',
          valueLabel: this.formatCurrency(revenue),
          note: 'Ingresos netos del periodo',
          hint: 'Todo lo que el hotel facturo en el periodo, sin impuestos.',
          icon: 'fa-solid fa-sack-dollar',
          tone: 'blue',
        },
        {
          label: 'Costos',
          valueLabel: this.formatCurrency(costs),
          note: 'Costos de prestacion de servicios',
          hint: 'Lo que cuesta prestar el servicio: ropa de cama, aseo, amenidades.',
          icon: 'fa-solid fa-industry',
          tone: 'amber',
        },
        {
          label: 'Gastos',
          valueLabel: this.formatCurrency(expenses),
          note: 'Gastos operativos registrados',
          hint: 'Lo que cuesta tener el hotel abierto: nomina, servicios, administracion.',
          icon: 'fa-solid fa-file-invoice-dollar',
          tone: 'red',
        },
        {
          label: 'Utilidad neta',
          valueLabel: this.formatCurrency(netProfit),
          note: `Ocupacion ${this.formatPercent(occupancyRatePct, 1)}`,
          hint: 'Lo que queda despues de costos y gastos. Es la cifra que decide todo.',
          icon: 'fa-solid fa-chart-line',
          tone: netProfit >= 0 ? 'green' : 'red',
        },
      ],
      benchmarkCards: [
        {
          label: 'Var. ingresos',
          valueLabel: this.formatPercentNullable(benchmarkRevenuePct, 2),
          note: 'Vs. mismo periodo ano anterior',
          hint: 'Cuanto mas --o menos-- se facturo que el mismo periodo del ano pasado.',
          icon: 'fa-solid fa-arrow-trend-up',
          tone: this.resolveToneFromNullableNumber(benchmarkRevenuePct),
        },
        {
          label: 'Var. utilidad neta',
          valueLabel: this.formatPercentNullable(benchmarkNetProfitPct, 2),
          note: 'Comparativo interanual',
          icon: 'fa-solid fa-scale-balanced',
          tone: this.resolveToneFromNullableNumber(benchmarkNetProfitPct),
        },
        {
          label: 'Var. ocupacion',
          valueLabel: this.formatSignedNumber(benchmarkOccupancyPts, 2) + ' pts',
          note: 'Puntos porcentuales',
          hint: 'Diferencia en puntos de ocupacion, no en porcentaje de cambio.',
          icon: 'fa-solid fa-bed',
          tone: benchmarkOccupancyPts >= 0 ? 'green' : 'red',
        },
        {
          label: 'Var. RevPAR',
          valueLabel: this.formatPercentNullable(benchmarkRevparPct, 2),
          note: 'Ingreso por habitacion disponible',
          hint: 'RevPAR: cuanto rinde cada habitacion del hotel, este llena o vacia.',
          icon: 'fa-solid fa-chart-area',
          tone: this.resolveToneFromNullableNumber(benchmarkRevparPct),
        },
      ],
      taxCards: [
        {
          label: 'Impuesto de renta',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'income_tax', 'amount'])),
          note:
            'Tarifa aplicada ' +
            this.formatPercent(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'income_tax', 'rate_pct']),
              2
            ),
          hint: 'Provision de renta sobre la utilidad del periodo.',
          icon: 'fa-solid fa-receipt',
          tone: 'red',
        },
        {
          label: 'ICA',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'ica', 'amount'])),
          note:
            'Tarifa x mil ' +
            this.formatNumber(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'ica', 'rate_per_thousand']),
              4
            ),
          hint: 'ICA: impuesto municipal sobre lo facturado, por cada mil pesos.',
          icon: 'fa-solid fa-city',
          tone: 'amber',
        },
        {
          label: 'FONTUR',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'fontur', 'amount'])),
          note:
            'Tarifa x mil ' +
            this.formatNumber(
              this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'fontur', 'rate_per_thousand']),
              4
            ),
          hint: 'FONTUR: contribucion parafiscal de turismo, por cada mil pesos.',
          icon: 'fa-solid fa-plane-up',
          tone: 'blue',
        },
        {
          label: 'Total provisiones',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'provisions_and_compliance', 'total_provisions'])),
          note: 'Renta + ICA + FONTUR',
          hint: 'Lo que conviene tener apartado para no quedar corto al pagar.',
          icon: 'fa-solid fa-layer-group',
          tone: 'red',
        },
        {
          label: 'Ahorro IVA estimado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['tax_optimization', 'benefits_monitoring', 'iva_exemption', 'estimated_savings'])),
          note: this.getBoolean(payload, ['tax_optimization', 'benefits_monitoring', 'iva_exemption', 'enabled'])
            ? 'Exencion de IVA habilitada'
            : 'Exencion de IVA no habilitada',
          icon: 'fa-solid fa-percent',
          tone: 'green',
        },
      ],
      revparTrend,
      breakEven: {
        progressPct: breakEvenProgress,
        status: breakEvenStatus,
        breakEvenRevenue: this.getNullableNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'break_even_revenue']),
        fixedCosts: this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'fixed_costs']),
        variableCosts: this.getNumber(payload, ['operational_efficiency', 'break_even_dynamic', 'variable_costs']),
        cpho: this.getNumber(payload, ['operational_efficiency', 'cost_per_occupied_room', 'cpho']),
      },
      traffic: {
        tone: trafficTone,
        label: trafficLabel,
        reasons: trafficReasons,
      },
    };
  }

  private buildWhatIfVm(payload: Record<string, unknown>): WhatIfVm {
    const startDate = this.getString(payload, ['period', 'start_date']);
    const endDate = this.getString(payload, ['period', 'end_date']);

    const deltaRevenuePct = this.getNullableNumber(payload, ['delta', 'revenue_pct']);
    const deltaNetProfitPct = this.getNullableNumber(payload, ['delta', 'net_profit_pct']);
    const deltaOccupancyPts = this.getNullableNumber(payload, ['delta', 'occupancy_rate_pts']);

    return {
      periodLabel: startDate && endDate ? `${startDate} a ${endDate}` : 'Periodo sin definir',
      baseNetProfit: this.getNumber(payload, ['base', 'net_profit']),
      projectedNetProfit: this.getNumber(payload, ['projected', 'net_profit']),
      hasResult: true,
      baseCards: [
        {
          label: 'Ingresos base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'revenue'])),
          note: 'Escenario actual',
          icon: 'fa-solid fa-wallet',
          tone: 'blue',
        },
        {
          label: 'Utilidad neta base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'net_profit'])),
          note: 'Antes de simulacion',
          icon: 'fa-solid fa-scale-balanced',
          tone: 'amber',
        },
        {
          label: 'Ocupacion base',
          valueLabel: this.formatPercent(this.getNumber(payload, ['base', 'occupancy_rate_pct']), 2),
          note: 'Tasa actual',
          icon: 'fa-solid fa-bed',
          tone: 'gray',
        },
        {
          label: 'RevPAR base',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['base', 'revpar'])),
          note: 'Ingreso por hab. disponible',
          icon: 'fa-solid fa-chart-column',
          tone: 'gray',
        },
      ],
      projectedCards: [
        {
          label: 'Ingresos proyectados',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'revenue'])),
          note: 'Con supuestos del escenario',
          icon: 'fa-solid fa-coins',
          tone: 'blue',
        },
        {
          label: 'Utilidad neta proyectada',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'net_profit'])),
          note: 'Resultado esperado',
          icon: 'fa-solid fa-chart-line',
          tone: 'green',
        },
        {
          label: 'Ocupacion proyectada',
          valueLabel: this.formatPercent(this.getNumber(payload, ['projected', 'occupancy_rate_pct']), 2),
          note: 'Con ajuste aplicado',
          icon: 'fa-solid fa-hotel',
          tone: 'green',
        },
        {
          label: 'RevPAR proyectado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'revpar'])),
          note: 'Escenario simulado',
          icon: 'fa-solid fa-chart-area',
          tone: 'green',
        },
      ],
      deltaCards: [
        {
          label: 'Variacion ingresos',
          valueLabel: this.formatPercentNullable(deltaRevenuePct, 2),
          note: 'Cambio porcentual',
          icon: 'fa-solid fa-arrow-up-right-dots',
          tone: this.resolveToneFromNullableNumber(deltaRevenuePct),
        },
        {
          label: 'Variacion utilidad neta',
          valueLabel: this.formatPercentNullable(deltaNetProfitPct, 2),
          note: 'Impacto del escenario',
          icon: 'fa-solid fa-signal',
          tone: this.resolveToneFromNullableNumber(deltaNetProfitPct),
        },
        {
          label: 'Variacion ocupacion',
          valueLabel:
            (deltaOccupancyPts === null ? 'N/A' : this.formatSignedNumber(deltaOccupancyPts, 2)) +
            (deltaOccupancyPts === null ? '' : ' pts'),
          note: 'Diferencia en puntos',
          icon: 'fa-solid fa-bed-pulse',
          tone: this.resolveToneFromNullableNumber(deltaOccupancyPts),
        },
        {
          label: 'Impuesto renta proyectado',
          valueLabel: this.formatCurrency(this.getNumber(payload, ['projected', 'income_tax_amount'])),
          note: 'Provision estimada',
          icon: 'fa-solid fa-file-circle-check',
          tone: 'red',
        },
      ],
    };
  }

  private buildStatementsVm(payload: Record<string, unknown>): StatementsVm {
    const periodCurrent = this.getString(payload, ['period', 'current']) || '-';
    const periodPrevious = this.getString(payload, ['period', 'previous']) || '-';

    const balanceRows = this.getRecordArray(payload, ['balance_sheet', 'rows']).map((row) => {
      const current = this.getNumber(row, ['current']);
      const previous = this.getNumber(row, ['previous']);
      return {
        section: this.getString(row, ['section']) || 'BALANCE',
        account: this.getString(row, ['account']) || '-',
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const totalsRecord = this.getRecord(payload, ['balance_sheet', 'totals']);
    const totalsLabelMap: Record<string, string> = {
      total_assets: 'Total activos',
      total_liabilities: 'Total pasivos',
      total_equity: 'Total patrimonio',
      total_liabilities_and_equity: 'Total pasivo + patrimonio',
    };

    const balanceTotals: StatementRowVm[] = Object.entries(totalsRecord).map(([key, value]) => {
      const entry = this.asRecord(value);
      const current = this.getNumber(entry, ['current']);
      const previous = this.getNumber(entry, ['previous']);
      return {
        section: 'TOTAL',
        account: totalsLabelMap[key] || this.keyToLabel(key),
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const incomeRows = this.getRecordArray(payload, ['income_statement', 'rows']).map((row) => {
      const current = this.getNumber(row, ['current']);
      const previous = this.getNumber(row, ['previous']);
      return {
        section: 'RESULTADOS',
        account: this.getString(row, ['account']) || '-',
        current,
        previous,
        delta: current - previous,
        deltaPct: this.computeDeltaPct(current, previous),
      };
    });

    const indicatorRecord = this.getRecord(payload, ['indicators']);
    const indicators: IndicatorVm[] = Object.entries(indicatorRecord).map(([key, value]) => {
      const entry = this.asRecord(value);
      const current = this.getNullableNumber(entry, ['current']);
      const previous = this.getNullableNumber(entry, ['previous']);
      const delta = current === null || previous === null ? null : current - previous;
      return {
        label: this.keyToLabel(key),
        formula: this.getString(entry, ['formula']) || '',
        current,
        previous,
        delta,
        deltaPct: current === null || previous === null ? null : this.computeDeltaPct(current, previous),
      };
    });

    return {
      periodCurrent,
      periodPrevious,
      balanceRows,
      balanceTotals,
      incomeRows,
      indicators,
    };
  }

  private parseConfigRecords(items: Record<string, unknown>[]): FinancialControlConfigRecord[] {
    const records: FinancialControlConfigRecord[] = [];
    for (const item of items) {
      const parsed = this.parseConfigRecord(item);
      if (parsed) records.push(parsed);
    }
    return records;
  }

  private parseConfigRecord(item: Record<string, unknown>): FinancialControlConfigRecord | null {
    const hotelSettingsIdRaw = this.getNullableNumber(item, ['hotel_settings']);
    if (hotelSettingsIdRaw === null) return null;

    const hotelSettingsId = Math.trunc(hotelSettingsIdRaw);
    if (hotelSettingsId <= 0) return null;

    const id = Math.trunc(this.getNumber(item, ['id']));
    if (id <= 0) return null;

    return {
      id,
      hotelSettingsId,
      hotelName: this.getString(item, ['hotel_name']) || `Hotel #${hotelSettingsId}`,
      districtName: this.getString(item, ['district_name']) || this.defaultDistrictName,
      tourismLawEnabled: this.getBoolean(item, ['tourism_law_enabled']),
      tourismLawPreferentialRate: this.getNumber(item, ['tourism_law_preferential_rate']),
      standardIncomeTaxRate: this.getNumber(item, ['standard_income_tax_rate']),
      hasIvaExemption: this.getBoolean(item, ['has_iva_exemption']),
      ivaRate: this.getNumber(item, ['iva_rate']),
      icaRatePerThousand: this.getNumber(item, ['ica_rate_per_thousand']),
      fonturRatePerThousand: this.getNumber(item, ['fontur_rate_per_thousand']),
      breakEvenWarningPct: this.getNumber(item, ['break_even_warning_pct']),
      breakEvenOptimalPct: this.getNumber(item, ['break_even_optimal_pct']),
      operationalHighOccupancyThresholdPct: this.getNumber(item, ['operational_high_occupancy_threshold_pct']),
      operationalLowAvailabilityThresholdRooms: this.getNumber(item, ['operational_low_availability_threshold_rooms']),
      operationalRevenueDropThresholdPct: this.getNumber(item, ['operational_revenue_drop_threshold_pct']),
      operationalHighRefundsThresholdCount: this.getNumber(item, ['operational_high_refunds_threshold_count']),
      operationalRevenueWindowDays: this.getNumber(item, ['operational_revenue_window_days']),
      operationalRefundWindowDays: this.getNumber(item, ['operational_refund_window_days']),
    };
  }

  private emptyFinancialConfigForm(): FinancialControlConfigForm {
    return {
      districtName: this.defaultDistrictName,
      tourismLawEnabled: true,
      tourismLawPreferentialRate: null,
      standardIncomeTaxRate: null,
      hasIvaExemption: false,
      ivaRate: null,
      icaRatePerThousand: null,
      fonturRatePerThousand: null,
      breakEvenWarningPct: null,
      breakEvenOptimalPct: null,
      operationalHighOccupancyThresholdPct: null,
      operationalLowAvailabilityThresholdRooms: null,
      operationalRevenueDropThresholdPct: null,
      operationalHighRefundsThresholdCount: null,
      operationalRevenueWindowDays: null,
      operationalRefundWindowDays: null,
    };
  }

  private syncConfigFormWithSelection(): void {
    const hotelSettingsId = this.selectedHotelSettingsId;
    if (!hotelSettingsId || hotelSettingsId <= 0) {
      this.configForm = this.emptyFinancialConfigForm();
      return;
    }

    const existing = this.configRecordByHotelSettingsId.get(hotelSettingsId);
    if (!existing) {
      const optionDistrict =
        this.configs.find((item) => item.hotelSettingsId === hotelSettingsId)?.districtName?.trim() || '';
      this.configForm = {
        ...this.emptyFinancialConfigForm(),
        districtName: optionDistrict || this.defaultDistrictName,
      };
      return;
    }

    this.configForm = {
      districtName: existing.districtName || this.defaultDistrictName,
      tourismLawEnabled: existing.tourismLawEnabled,
      tourismLawPreferentialRate: existing.tourismLawPreferentialRate,
      standardIncomeTaxRate: existing.standardIncomeTaxRate,
      hasIvaExemption: existing.hasIvaExemption,
      ivaRate: existing.ivaRate,
      icaRatePerThousand: existing.icaRatePerThousand,
      fonturRatePerThousand: existing.fonturRatePerThousand,
      breakEvenWarningPct: existing.breakEvenWarningPct,
      breakEvenOptimalPct: existing.breakEvenOptimalPct,
      operationalHighOccupancyThresholdPct: existing.operationalHighOccupancyThresholdPct,
      // Estos cuatro exigen ser mayores que cero al guardar, y la lectura convierte los
      // ausentes en 0. Sin esto, un hotel al que le falte cualquiera de ellos **no podia
      // guardar nada** desde esta pestaña: el formulario cargaba un 0 que el propio
      // guardado rechazaba, y el error hablaba de un campo que el usuario ni toco.
      operationalLowAvailabilityThresholdRooms: this.blankIfNotPositive(
        existing.operationalLowAvailabilityThresholdRooms
      ),
      operationalRevenueDropThresholdPct: existing.operationalRevenueDropThresholdPct,
      operationalHighRefundsThresholdCount: this.blankIfNotPositive(
        existing.operationalHighRefundsThresholdCount
      ),
      operationalRevenueWindowDays: this.blankIfNotPositive(existing.operationalRevenueWindowDays),
      operationalRefundWindowDays: this.blankIfNotPositive(existing.operationalRefundWindowDays),
    };
  }

  /** Para los umbrales donde 0 no es un valor legal, 0 significa "sin configurar". */
  private blankIfNotPositive(value: number | null | undefined): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private buildConfigPayload(hotelSettingsId: number): {
    payload: FinancialControlConfigPayload;
    error: string | null;
  } {
    const districtName = String(this.configForm.districtName || '').trim();
    if (!districtName) {
      return {
        payload: {
          hotel_settings: hotelSettingsId,
          district_name: '',
          tourism_law_enabled: this.configForm.tourismLawEnabled,
          has_iva_exemption: this.configForm.hasIvaExemption,
        },
        error: 'Debes ingresar el nombre del distrito.',
      };
    }

    const payload: FinancialControlConfigPayload = {
      hotel_settings: hotelSettingsId,
      district_name: districtName,
      tourism_law_enabled: !!this.configForm.tourismLawEnabled,
      has_iva_exemption: !!this.configForm.hasIvaExemption,
    };

    const tourismRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'tourism_law_preferential_rate',
      this.configForm.tourismLawPreferentialRate,
      'Tarifa preferencial ley de turismo'
    );
    if (tourismRateError) return { payload, error: tourismRateError };

    const standardTaxError = this.appendOptionalNonNegativeNumber(
      payload,
      'standard_income_tax_rate',
      this.configForm.standardIncomeTaxRate,
      'Tarifa estandar de renta'
    );
    if (standardTaxError) return { payload, error: standardTaxError };

    const ivaRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'iva_rate',
      this.configForm.ivaRate,
      'Tarifa de IVA'
    );
    if (ivaRateError) return { payload, error: ivaRateError };

    const icaRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'ica_rate_per_thousand',
      this.configForm.icaRatePerThousand,
      'Tarifa ICA x mil'
    );
    if (icaRateError) return { payload, error: icaRateError };

    const fonturRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'fontur_rate_per_thousand',
      this.configForm.fonturRatePerThousand,
      'Tarifa FONTUR x mil'
    );
    if (fonturRateError) return { payload, error: fonturRateError };

    const warningRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'break_even_warning_pct',
      this.configForm.breakEvenWarningPct,
      'Umbral de alerta break-even'
    );
    if (warningRateError) return { payload, error: warningRateError };

    const optimalRateError = this.appendOptionalNonNegativeNumber(
      payload,
      'break_even_optimal_pct',
      this.configForm.breakEvenOptimalPct,
      'Umbral optimo break-even'
    );
    if (optimalRateError) return { payload, error: optimalRateError };

    const occupancyThresholdError = this.appendOptionalNonNegativeNumber(
      payload,
      'operational_high_occupancy_threshold_pct',
      this.configForm.operationalHighOccupancyThresholdPct,
      'Umbral ocupacion alta'
    );
    if (occupancyThresholdError) return { payload, error: occupancyThresholdError };

    const availabilityThresholdError = this.appendOptionalPositiveInteger(
      payload,
      'operational_low_availability_threshold_rooms',
      this.configForm.operationalLowAvailabilityThresholdRooms,
      'Umbral habitaciones disponibles'
    );
    if (availabilityThresholdError) return { payload, error: availabilityThresholdError };

    const revenueDropError = this.appendOptionalNonNegativeNumber(
      payload,
      'operational_revenue_drop_threshold_pct',
      this.configForm.operationalRevenueDropThresholdPct,
      'Umbral caida ingresos'
    );
    if (revenueDropError) return { payload, error: revenueDropError };

    const refundsThresholdError = this.appendOptionalPositiveInteger(
      payload,
      'operational_high_refunds_threshold_count',
      this.configForm.operationalHighRefundsThresholdCount,
      'Umbral reembolsos altos'
    );
    if (refundsThresholdError) return { payload, error: refundsThresholdError };

    const revenueWindowError = this.appendOptionalPositiveInteger(
      payload,
      'operational_revenue_window_days',
      this.configForm.operationalRevenueWindowDays,
      'Ventana dias ingresos'
    );
    if (revenueWindowError) return { payload, error: revenueWindowError };

    const refundWindowError = this.appendOptionalPositiveInteger(
      payload,
      'operational_refund_window_days',
      this.configForm.operationalRefundWindowDays,
      'Ventana dias reembolsos'
    );
    if (refundWindowError) return { payload, error: refundWindowError };

    const selectedConfig = this.selectedConfigRecord;
    const effectiveWarning =
      payload.break_even_warning_pct !== undefined
        ? payload.break_even_warning_pct
        : selectedConfig?.breakEvenWarningPct;
    const effectiveOptimal =
      payload.break_even_optimal_pct !== undefined
        ? payload.break_even_optimal_pct
        : selectedConfig?.breakEvenOptimalPct;

    if (
      effectiveWarning !== undefined &&
      effectiveWarning !== null &&
      effectiveOptimal !== undefined &&
      effectiveOptimal !== null &&
      effectiveOptimal < effectiveWarning
    ) {
      return {
        payload,
        error: 'El umbral optimo debe ser mayor o igual al umbral de alerta.',
      };
    }

    return { payload, error: null };
  }

  private appendOptionalNonNegativeNumber(
    payload: FinancialControlConfigPayload,
    key:
      | 'tourism_law_preferential_rate'
      | 'standard_income_tax_rate'
      | 'iva_rate'
      | 'ica_rate_per_thousand'
      | 'fontur_rate_per_thousand'
      | 'break_even_warning_pct'
      | 'break_even_optimal_pct'
      | 'operational_high_occupancy_threshold_pct'
      | 'operational_revenue_drop_threshold_pct',
    value: number | null,
    label: string
  ): string | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return `${label} debe ser numerico.`;
    }
    if (parsed < 0) {
      return `${label} no puede ser negativo.`;
    }
    payload[key] = parsed;
    return null;
  }

  private appendOptionalPositiveInteger(
    payload: FinancialControlConfigPayload,
    key:
      | 'operational_low_availability_threshold_rooms'
      | 'operational_high_refunds_threshold_count'
      | 'operational_revenue_window_days'
      | 'operational_refund_window_days',
    value: number | null,
    label: string
  ): string | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return `${label} debe ser un numero entero.`;
    }
    if (parsed < 1) {
      return `${label} debe ser mayor a 0.`;
    }
    payload[key] = parsed;
    return null;
  }

  private upsertConfigRecord(record: FinancialControlConfigRecord): void {
    this.configRecordByHotelSettingsId.set(record.hotelSettingsId, record);

    const existingIndex = this.configs.findIndex((item) => item.hotelSettingsId === record.hotelSettingsId);
    const previousOption = existingIndex >= 0 ? this.configs[existingIndex] : null;
    const option: HotelConfigOption = {
      id: record.id,
      configId: record.id,
      hotelSettingsId: record.hotelSettingsId,
      hotelName: record.hotelName || previousOption?.hotelName || `Hotel #${record.hotelSettingsId}`,
      districtName: record.districtName || this.defaultDistrictName,
    };

    if (existingIndex >= 0) {
      this.configs[existingIndex] = option;
      this.configs = [...this.configs];
      return;
    }

    this.configs = [option, ...this.configs];
  }

  private emptyDashboardVm(): DashboardVm {
    return {
      periodLabel: '',
      summaryCards: [],
      benchmarkCards: [],
      taxCards: [],
      revparTrend: [],
      breakEven: {
        progressPct: 0,
        status: '',
        breakEvenRevenue: null,
        fixedCosts: 0,
        variableCosts: 0,
        cpho: 0,
      },
      traffic: {
        tone: 'gray',
        label: '',
        reasons: [],
      },
    };
  }

  private emptyWhatIfVm(): WhatIfVm {
    return {
      periodLabel: '',
      baseCards: [],
      projectedCards: [],
      deltaCards: [],
      baseNetProfit: 0,
      projectedNetProfit: 0,
      hasResult: false,
    };
  }

  private emptyStatementsVm(): StatementsVm {
    return {
      periodCurrent: '',
      periodPrevious: '',
      balanceRows: [],
      balanceTotals: [],
      incomeRows: [],
      indicators: [],
    };
  }

  private extractHttpErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) return fallback;

    if (error.status === 403) {
      return 'No tienes permisos para consultar control financiero (financial_control.read).';
    }

    const payload = error.error;
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === 'object') {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
      }

      for (const value of Object.values(payload as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
          return value[0];
        }
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return fallback;
  }

  private ensureHotelSelection(target: 'dashboard' | 'what_if' | 'statements' | 'all'): boolean {
    if (typeof this.selectedHotelSettingsId === 'number' && this.selectedHotelSettingsId > 0) {
      return true;
    }

    const message = 'Debes seleccionar un hotel para consultar el control financiero.';
    if (target === 'all' || target === 'dashboard') {
      this.loadingDashboard = false;
      this.dashboardError = message;
      this.dashboardVm = this.emptyDashboardVm();
    }
    if (target === 'all' || target === 'what_if') {
      this.loadingWhatIf = false;
      this.whatIfError = message;
      this.whatIfVm = this.emptyWhatIfVm();
    }
    if (target === 'all' || target === 'statements') {
      this.loadingStatements = false;
      this.statementsError = message;
      this.statementsVm = this.emptyStatementsVm();
    }
    return false;
  }

  private parseOptionalNumber(raw: string): number | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatCurrency(value: number): string {
    return this.currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  private formatNumber(value: number, digits = 2): string {
    const safe = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(safe);
  }

  private formatSignedNumber(value: number, digits = 2): string {
    const safe = Number.isFinite(value) ? value : 0;
    const abs = this.formatNumber(Math.abs(safe), digits);
    if (safe > 0) return `+${abs}`;
    if (safe < 0) return `-${abs}`;
    return abs;
  }

  private formatPercent(value: number, digits = 2): string {
    return `${this.formatNumber(value, digits)}%`;
  }

  private formatPercentNullable(value: number | null, digits = 2): string {
    if (value === null) return 'N/A';
    return `${this.formatNumber(value, digits)}%`;
  }

  formatCurrencyLabel(value: number): string {
    return this.formatCurrency(value);
  }

  formatCurrencyNullable(value: number | null): string {
    if (value === null) return 'N/A';
    return this.formatCurrency(value);
  }

  formatDeltaLabel(value: number): string {
    return this.formatSignedNumber(value, 2);
  }

  formatDeltaPctLabel(value: number | null): string {
    if (value === null) return 'N/A';
    return `${this.formatSignedNumber(value, 2)}%`;
  }

  /**
   * La direccion de una variacion, para poder barrer una columna sin leer las cifras.
   *
   * En un estado financiero "hacia arriba" no siempre es bueno --que suban los gastos no
   * lo es--, asi que esto dice **direccion**, no juicio. El color lo pone quien sabe de
   * que fila se trata.
   */
  deltaDirection(value: number | null): 'up' | 'down' | 'flat' {
    if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.005) return 'flat';
    return value > 0 ? 'up' : 'down';
  }

  deltaIcon(value: number | null): string {
    const direction = this.deltaDirection(value);
    if (direction === 'up') return 'fa-solid fa-arrow-up';
    if (direction === 'down') return 'fa-solid fa-arrow-down';
    return 'fa-solid fa-minus';
  }

  formatIndicatorValue(value: number | null): string {
    if (value === null) return 'N/A';
    return this.amountFormatter.format(value);
  }

  formatInteger(value: number): string {
    const safe = Number.isFinite(value) ? value : 0;
    return this.integerFormatter.format(safe);
  }

  private resolveToneFromNullableNumber(value: number | null): CardTone {
    if (value === null) return 'gray';
    return value >= 0 ? 'green' : 'red';
  }

  private computeDeltaPct(current: number, previous: number): number | null {
    if (!Number.isFinite(previous) || previous === 0) return null;
    if (!Number.isFinite(current)) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private toIsoDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private keyToLabel(key: string): string {
    return String(key || '')
      .split('_')
      .map((part) => {
        if (!part) return '';
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private getValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private getRecord(source: unknown, path: string[]): Record<string, unknown> {
    return this.asRecord(this.getValue(source, path));
  }

  private getRecordArray(source: unknown, path: string[]): Record<string, unknown>[] {
    const value = this.getValue(source, path);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)
    );
  }

  private getString(source: unknown, path: string[]): string {
    const value = this.getValue(source, path);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  private getStringArray(source: unknown, path: string[]): string[] {
    const value = this.getValue(source, path);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
  }

  private getNumber(source: unknown, path: string[]): number {
    const value = this.getValue(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private getNullableNumber(source: unknown, path: string[]): number | null {
    const value = this.getValue(source, path);
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private getBoolean(source: unknown, path: string[]): boolean {
    const value = this.getValue(source, path);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  }

  // ------------------------------------------------------------------ graficos

  /**
   * Rehace los cuatro graficos con lo que acaba de llegar.
   *
   * Se llama una vez por respuesta. Devolver estos objetos desde un getter haria que
   * Chart.js redibujara en cada ciclo de deteccion de cambios.
   */
  private buildDashboardCharts(): void {
    this.buildCompositionChart();
    this.buildBenchmarkChart();
    this.buildTaxChart();
    this.buildRevparChart();
  }

  /**
   * A donde va el dinero del periodo.
   *
   * Barras y no un anillo de composicion: la utilidad puede ser **negativa**, y una
   * composicion con una parte negativa no significa nada. Con barras desde cero, una
   * utilidad en rojo se lee sola.
   */
  private buildCompositionChart(): void {
    const value = (label: string) =>
      this.parseMoneyLabel(
        this.dashboardVm.summaryCards.find((card) => card.label === label)?.valueLabel
      );

    const profit = value('Utilidad neta');

    this.compositionData = {
      labels: ['Ingresos', 'Costos', 'Gastos', 'Utilidad'],
      datasets: [
        {
          data: [value('Ingresos'), value('Costos'), value('Gastos'), profit],
          // Una sola serie: el color no distingue nada y el eje ya nombra cada barra.
          // La utilidad negativa si cambia de color, porque ahi el signo es el dato.
          backgroundColor: [
            this.viz.series,
            this.viz.series,
            this.viz.series,
            profit >= 0 ? this.viz.series : this.viz.negative,
          ],
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 46,
        },
      ],
    };

    this.compositionOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => this.formatCurrency(this.toNumber(context.parsed.y)),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
          border: { display: false },
        },
        y: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
          },
        },
      },
    };
  }

  /**
   * Comparativo interanual: barras divergentes desde cero.
   *
   * Solo van los **porcentajes**. La variacion de ocupacion viene en *puntos*, que es
   * otra unidad: meterla en el mismo eje seria comparar peras con manzanas, asi que se
   * queda como cifra al lado.
   */
  private buildBenchmarkChart(): void {
    const rows = this.dashboardVm.benchmarkCards
      .filter((card) => card.label !== 'Var. ocupacion')
      .map((card) => ({
        label: card.label.replace('Var. ', ''),
        value: this.parsePercentLabel(card.valueLabel),
      }));

    this.benchmarkData = {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          data: rows.map((row) => row.value),
          backgroundColor: rows.map((row) =>
            row.value >= 0 ? this.viz.series : this.viz.negative
          ),
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 30,
        },
      ],
    };

    this.benchmarkOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${this.formatSignedNumber(this.toNumber(context.parsed.x), 2)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => `${this.toNumber(raw)}%`,
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  /** Las tres provisiones, que son comparables entre si. */
  private buildTaxChart(): void {
    const rows = this.dashboardVm.taxCards
      .filter((card) => ['Impuesto de renta', 'ICA', 'FONTUR'].includes(card.label))
      .map((card) => ({ label: card.label, value: this.parseMoneyLabel(card.valueLabel) }));

    this.taxData = {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          data: rows.map((row) => row.value),
          backgroundColor: this.viz.series,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 30,
        },
      ],
    };

    this.taxOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => this.formatCurrency(this.toNumber(context.parsed.x)),
          },
        },
      },
      scales: {
        x: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
      },
    };
  }

  /** Doce meses de RevPAR: una tendencia se lee en una linea. */
  private buildRevparChart(): void {
    const trend = this.dashboardVm.revparTrend;

    this.revparData = {
      labels: trend.map((row) => this.monthLabel(row.month)),
      datasets: [
        {
          data: trend.map((row) => row.revpar),
          borderColor: this.viz.series,
          backgroundColor: this.viz.seriesSoft,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: this.viz.series,
          fill: true,
          tension: 0.3,
        },
      ],
    };

    this.revparOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          // El cursor no tiene que caer justo sobre el punto para leer el mes.
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => this.formatCurrency(this.toNumber(context.parsed.y)),
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: this.viz.tick, font: { size: 11 } },
        },
        y: {
          grid: { color: this.viz.grid },
          border: { display: false },
          ticks: {
            color: this.viz.tick,
            font: { size: 11 },
            callback: (raw) => this.formatCompactCurrency(this.toNumber(raw)),
          },
        },
      },
    };
  }

  get hasRevparTrend(): boolean {
    return this.dashboardVm.revparTrend.length > 0;
  }

  get hasBenchmark(): boolean {
    return this.dashboardVm.benchmarkCards.length > 0;
  }

  /** La variacion de ocupacion, que va en puntos y no cabe en el eje de porcentajes. */
  get occupancyVariationLabel(): string {
    return (
      this.dashboardVm.benchmarkCards.find((card) => card.label === 'Var. ocupacion')
        ?.valueLabel || 'N/A'
    );
  }

  /**
   * Las cifras ya vienen formateadas en las tarjetas; el grafico necesita el numero.
   *
   * Se limpia todo lo que no sea digito, signo o separador decimal. El formato es
   * es-CO, asi que el punto es de miles y la coma es decimal.
   */
  private parseMoneyLabel(label: string | undefined): number {
    if (!label) return 0;
    const cleaned = String(label)
      .replace(/[^0-9,\-]/g, '')
      .replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private parsePercentLabel(label: string | undefined): number {
    if (!label || label.includes('N/A')) return 0;
    const cleaned = String(label)
      .replace('%', '')
      .replace(/[^0-9,.\-]/g, '')
      .replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** `$ 1,2 M` en un eje: la cifra exacta la da el tooltip. */
  private formatCompactCurrency(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$ ${(value / 1_000_000).toFixed(1)} M`;
    if (abs >= 1_000) return `$ ${Math.round(value / 1_000)} k`;
    return `$ ${Math.round(value)}`;
  }
}
