import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';

import { ListFinancialControl } from './list-financial-control';
import { FinancialControlService } from '../../../services/financial-control';
import { HotelSettingsService } from '../../../services/hotel-settings';

const config = () => ({
  id: 7,
  hotel_settings: 1,
  hotel_name: 'Hotel Wayra',
  district_name: 'Riohacha'
});

describe('ListFinancialControl', () => {
  let component: ListFinancialControl;
  let fixture: ComponentFixture<ListFinancialControl>;

  const getDashboard = jasmine.createSpy('getDashboard');
  const getWhatIf = jasmine.createSpy('getWhatIf');
  const getStatements = jasmine.createSpy('getStatements');
  const listConfigs = jasmine.createSpy('listConfigs');
  const createConfig = jasmine.createSpy('createConfig');
  const updateConfig = jasmine.createSpy('updateConfig');
  const getCurrentSettings = jasmine.createSpy('getCurrentSettings');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (data: { tab?: string; dashboard?: unknown } = {}) => {
    for (const spy of [
      getDashboard,
      getWhatIf,
      getStatements,
      listConfigs,
      createConfig,
      updateConfig,
      getCurrentSettings,
      navigate
    ]) {
      spy.calls.reset();
    }

    createConfig.and.returnValue(of(config()));
    updateConfig.and.returnValue(of(config()));

    getDashboard.and.returnValue(of(data.dashboard ?? {}));
    getWhatIf.and.returnValue(of({}));
    getStatements.and.returnValue(of({}));
    listConfigs.and.returnValue(of([config()]));
    getCurrentSettings.and.returnValue(of({ id: 1, hotel_name: 'Hotel Wayra' }));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [ListFinancialControl],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: FinancialControlService,
            useValue: { getDashboard, getWhatIf, getStatements, listConfigs, createConfig, updateConfig }
          },
          { provide: HotelSettingsService, useValue: { getCurrentSettings } },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { queryParamMap: { get: () => data.tab ?? null } } }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(ListFinancialControl);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  // Antes la pantalla pedia las tres consultas pesadas de golpe para mirar una sola.
  describe('la carga perezosa', () => {
    it('solo pide el tablero al abrir', async () => {
      await setup();

      expect(getDashboard).toHaveBeenCalledTimes(1);
      expect(getWhatIf).not.toHaveBeenCalled();
      expect(getStatements).not.toHaveBeenCalled();
    });

    it('pide el escenario recien cuando se abre su pestaña', async () => {
      await setup();

      component.selectTab('what_if');

      expect(getWhatIf).toHaveBeenCalledTimes(1);
      expect(getStatements).not.toHaveBeenCalled();
    });

    it('no repite la consulta al volver a una pestaña ya cargada', async () => {
      await setup();

      component.selectTab('statements');
      component.selectTab('dashboard');
      component.selectTab('statements');

      expect(getStatements).toHaveBeenCalledTimes(1);
      expect(getDashboard).toHaveBeenCalledTimes(1);
    });

    it('los umbrales no consultan nada: llegaron con las configuraciones', async () => {
      await setup();
      getDashboard.calls.reset();

      component.selectTab('config');

      expect(getDashboard).not.toHaveBeenCalled();
      expect(getWhatIf).not.toHaveBeenCalled();
      expect(getStatements).not.toHaveBeenCalled();
    });

    it('abre donde diga la URL, y pide lo de esa pestaña', async () => {
      await setup({ tab: 'statements' });

      expect(component.activeTab).toBe('statements');
      expect(getStatements).toHaveBeenCalledTimes(1);
      expect(getDashboard).not.toHaveBeenCalled();
    });
  });

  describe('el refresco', () => {
    it('actualiza solo lo que se esta mirando, y lo fuerza', async () => {
      await setup();
      getDashboard.calls.reset();

      component.refreshAll();

      expect(getDashboard).toHaveBeenCalledWith(
        jasmine.objectContaining({ forceRefresh: true })
      );
      expect(getStatements).not.toHaveBeenCalled();
    });

    // Los estados miran ano y mes, no el rango: cambiar el rango no los invalida.
    it('cambiar el periodo no vuelve a pedir los estados', async () => {
      await setup();

      component.selectTab('statements');
      getStatements.calls.reset();

      component.selectTab('dashboard');
      component.applyPeriodFilters();
      component.selectTab('statements');

      expect(getStatements).not.toHaveBeenCalled();
    });

    it('cambiar de hotel invalida todo lo cargado', async () => {
      await setup();
      getDashboard.calls.reset();

      component.onHotelFilterChange();

      expect(getDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('los atajos de periodo', () => {
    it('este mes va del dia 1 a hoy', async () => {
      await setup();

      component.applyPreset('this_month');

      const now = new Date();
      expect(component.startDate.slice(8)).toBe('01');
      expect(component.startDate.slice(0, 7)).toBe(component.endDate.slice(0, 7));
      expect(component.statementMonth).toBe(now.getMonth() + 1);
      expect(component.isPresetActive('this_month')).toBeTrue();
    });

    it('el mes pasado termina el ultimo dia de ese mes, no hoy', async () => {
      await setup();

      component.applyPreset('last_month');

      const end = new Date(component.endDate + 'T12:00:00');
      const dayAfter = new Date(end);
      dayAfter.setDate(dayAfter.getDate() + 1);

      expect(dayAfter.getDate()).toBe(1);
      expect(component.isPresetActive('last_month')).toBeTrue();
      expect(component.isPresetActive('this_month')).toBeFalse();
    });

    it('el ano corre desde enero', async () => {
      await setup();

      component.applyPreset('this_year');

      expect(component.startDate.slice(5)).toBe('01-01');
    });
  });

  describe('los escenarios', () => {
    it('subir la tarifa asume que cuesta ocupacion', async () => {
      await setup();

      component.applyScenarioPreset('raise_rate');

      expect(component.rateChangePct).toBe(10);
      expect(component.occupancyChangePct).toBe(-5);
    });

    it('el choque de costos no toca la tarifa', async () => {
      await setup();

      component.applyScenarioPreset('cost_shock');

      expect(component.rateChangePct).toBe(0);
      expect(component.operatingCostChangePct).toBe(15);
    });

    it('volver a cero deja el periodo tal como fue', async () => {
      await setup();

      component.applyScenarioPreset('high_season');
      component.resetScenario();

      expect(component.rateChangePct).toBe(0);
      expect(component.occupancyChangePct).toBe(0);
      expect(component.operatingCostChangePct).toBe(0);
      expect(component.targetOccupancyPctInput).toBe('');
      expect(component.scenarioSentence).toContain('sin cambios');
    });

    it('cuenta el escenario en una frase', async () => {
      await setup();

      component.rateChangePct = 10;
      component.occupancyChangePct = -5;
      component.operatingCostChangePct = 0;

      expect(component.scenarioSentence).toBe(
        'Si la tarifa sube 10%, la ocupacion baja 5%...'
      );
    });

    it('marca el signo del cambio', async () => {
      await setup();

      expect(component.signedPct(10)).toBe('+10%');
      expect(component.signedPct(-5)).toBe('-5%');
      expect(component.signedPct(0)).toBe('0%');
    });
  });

  describe('los filtros de cada pestaña', () => {
    it('el rango de fechas es del tablero y del escenario', async () => {
      await setup();

      expect(component.showsDateRange).toBeTrue();

      component.selectTab('what_if');
      expect(component.showsDateRange).toBeTrue();

      component.selectTab('statements');
      expect(component.showsDateRange).toBeFalse();
      expect(component.showsStatementPeriod).toBeTrue();
    });

    it('los umbrales no filtran por periodo', async () => {
      await setup();

      component.selectTab('config');

      expect(component.showsDateRange).toBeFalse();
      expect(component.showsStatementPeriod).toBeFalse();
    });
  });

  // Quien abre el tablero pregunta "como va el hotel". Esa respuesta estaba enterrada
  // bajo trece tarjetas del mismo peso.
  describe('el veredicto del tablero', () => {
    const withTraffic = (tone: string, progress = 50, target = 1000) => {
      component.dashboardVm = {
        ...component.dashboardVm,
        traffic: { tone: tone as never, label: '', reasons: [] },
        breakEven: {
          ...component.dashboardVm.breakEven,
          progressPct: progress,
          breakEvenRevenue: target
        }
      };
    };

    it('titula segun el semaforo', async () => {
      await setup();

      withTraffic('green');
      expect(component.verdictTitle).toBe('El periodo va bien');

      withTraffic('yellow');
      expect(component.verdictTitle).toBe('El periodo va ajustado');

      withTraffic('red');
      expect(component.verdictTitle).toBe('El periodo va en rojo');
    });

    // Sin costos cargados no hay nada que decir, y decirlo es mejor que un verde falso.
    it('sin datos pide cargar costos en vez de opinar', async () => {
      await setup();

      withTraffic('gray');

      expect(component.verdictTitle).toBe('Sin datos suficientes');
      expect(component.verdictSubtitle).toContain('Carga costos');
    });

    // "87%" no le dice a nadie que hacer; "faltan $X por facturar" si.
    it('el subtitulo dice lo que falta en pesos, no en porcentaje', async () => {
      await setup();

      withTraffic('yellow', 80, 1000);

      expect(component.verdictSubtitle).toContain('Faltan');
      expect(component.verdictSubtitle).toContain('facturar');
    });

    it('cuando ya se cubrio, dice cuanto sobra', async () => {
      await setup();

      withTraffic('green', 120, 1000);

      expect(component.verdictSubtitle).toContain('cubiertos');
    });
  });

  describe('la tendencia de RevPAR', () => {
    const withTrend = (values: number[]) => {
      component.dashboardVm = {
        ...component.dashboardVm,
        revparTrend: values.map((revpar, index) => ({
          month: `2026-${String(index + 1).padStart(2, '0')}`,
          revpar,
          roomRevenue: revpar * 10,
          roomCount: 10,
          availableRoomNights: 300
        }))
      };
    };

    it('el mes mas alto marca el 100%', async () => {
      await setup();
      withTrend([100, 50]);

      expect(component.revparShare(component.dashboardVm.revparTrend[0])).toBe(100);
      expect(component.revparShare(component.dashboardVm.revparTrend[1])).toBe(50);
      expect(component.isBestMonth(component.dashboardVm.revparTrend[0])).toBeTrue();
    });

    // Una barra de altura cero parece un fallo de carga, no un mes flojo.
    it('deja un minimo visible a los meses muy bajos', async () => {
      await setup();
      withTrend([1000000, 1]);

      expect(component.revparShare(component.dashboardVm.revparTrend[1])).toBe(2);
    });

    it('no divide por cero en una serie vacia de importes', async () => {
      await setup();
      withTrend([0, 0]);

      expect(component.revparShare(component.dashboardVm.revparTrend[0])).toBe(0);
      expect(component.isBestMonth(component.dashboardVm.revparTrend[0])).toBeFalse();
    });

    it('traduce el mes a algo legible', async () => {
      await setup();

      expect(component.monthLabel('2026-08')).toBe('ago 26');
      expect(component.monthLabel('')).toBe('-');
      expect(component.monthLabel('cualquier-cosa')).toBe('cualquier-cosa');
    });
  });

  describe('el resultado del escenario', () => {
    const withProfit = (base: number, projected: number) => {
      component.whatIfVm = {
        ...component.whatIfVm,
        hasResult: true,
        baseNetProfit: base,
        projectedNetProfit: projected
      };
    };

    it('dice si la utilidad sube o baja, y cuanto', async () => {
      await setup();

      withProfit(1_000_000, 1_500_000);
      expect(component.scenarioHeadline).toContain('sube');
      expect(component.scenarioImproves).toBeTrue();

      withProfit(1_000_000, 400_000);
      expect(component.scenarioHeadline).toContain('baja');
      expect(component.scenarioImproves).toBeFalse();
    });

    it('no monta un titular por una diferencia de centavos', async () => {
      await setup();

      withProfit(1_000_000, 1_000_000.4);

      expect(component.scenarioHeadline).toContain('practicamente igual');
    });

    // Puede mejorar respecto a la base y aun asi dar perdida: las dos cosas importan.
    it('avisa si el escenario cierra en perdida aunque mejore', async () => {
      await setup();

      withProfit(-900_000, -200_000);

      expect(component.scenarioImproves).toBeTrue();
      expect(component.scenarioEndsInLoss).toBeTrue();
    });

    it('sin simulacion no inventa un resultado', async () => {
      await setup();

      expect(component.whatIfVm.hasResult).toBeFalse();
      expect(component.scenarioEndsInLoss).toBeFalse();
      expect(component.scenarioHeadline).toContain('Simula');
    });
  });

  // En un estado financiero "hacia arriba" no siempre es bueno: esto dice direccion.
  describe('la direccion de una variacion', () => {
    it('distingue subida, bajada y sin cambio', async () => {
      await setup();

      expect(component.deltaDirection(5)).toBe('up');
      expect(component.deltaDirection(-5)).toBe('down');
      expect(component.deltaDirection(0)).toBe('flat');
      expect(component.deltaDirection(null)).toBe('flat');
    });

    it('trata como plano un cambio despreciable', async () => {
      await setup();

      expect(component.deltaDirection(0.001)).toBe('flat');
    });
  });

  // Las tarifas se guardaban en la configuracion pero no habia donde tocarlas: el
  // tablero calculaba impuestos con valores que nadie podia revisar.
  describe('las tarifas de impuestos', () => {
    /** Alta o edicion segun exista configuracion: el payload va en distinta posicion. */
    const savedPayload = (): any => {
      if (updateConfig.calls.any()) return updateConfig.calls.mostRecent().args[1];
      return createConfig.calls.mostRecent().args[0];
    };

    it('viajan en el guardado', async () => {
      await setup();

      component.selectedHotelSettingsId = 1;
      component.configForm.districtName = 'Riohacha';
      component.configForm.standardIncomeTaxRate = 35;
      component.configForm.icaRatePerThousand = 7;
      component.configForm.fonturRatePerThousand = 2.5;
      component.configForm.tourismLawEnabled = true;
      component.configForm.tourismLawPreferentialRate = 9;

      component.saveConfiguration();

      const payload = savedPayload();
      expect(payload.district_name).toBe('Riohacha');
      expect(payload.standard_income_tax_rate).toBe(35);
      expect(payload.ica_rate_per_thousand).toBe(7);
      expect(payload.fontur_rate_per_thousand).toBe(2.5);
      expect(payload.tourism_law_enabled).toBeTrue();
      expect(component.configValidationError).toBe('');
    });

    it('los umbrales del semaforo tambien', async () => {
      await setup();

      component.selectedHotelSettingsId = 1;
      component.configForm.districtName = 'Riohacha';
      component.configForm.breakEvenWarningPct = 80;
      component.configForm.breakEvenOptimalPct = 100;

      component.saveConfiguration();

      const payload = savedPayload();
      expect(payload.break_even_warning_pct).toBe(80);
      expect(payload.break_even_optimal_pct).toBe(100);
    });

    // Un umbral ausente llega como 0 desde la API, y el guardado exige que sea > 0: el
    // formulario cargaba un 0 que el se rechazaba a si mismo, y la pestaña quedaba
    // imposible de guardar por un campo que el usuario nunca toco.
    it('un umbral sin configurar no bloquea el guardado', async () => {
      await setup();

      component.selectedHotelSettingsId = 1;
      component.configForm.districtName = 'Riohacha';
      component.configForm.operationalLowAvailabilityThresholdRooms = null;
      component.configForm.operationalRevenueWindowDays = null;

      component.saveConfiguration();

      expect(component.configValidationError).toBe('');
      expect(updateConfig.calls.any() || createConfig.calls.any()).toBeTrue();
    });

    // Guardar cambia el semaforo y las provisiones: lo ya cargado quedo viejo.
    it('guardar invalida lo que ya se habia cargado', async () => {
      await setup();
      getDashboard.calls.reset();

      component.selectedHotelSettingsId = 1;
      component.configForm.districtName = 'Riohacha';
      component.saveConfiguration();
      component.selectTab('dashboard');

      expect(getDashboard).toHaveBeenCalled();
    });
  });

  // Los graficos se arman leyendo las cifras ya formateadas de las tarjetas: si el
  // parseo falla, la barra sale en cero y nadie se entera.
  describe('los graficos', () => {
    const dashboardPayload = () => ({
      period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      summary: {
        revenue: 5_000_000,
        costs: 1_200_000,
        expenses: 800_000,
        net_profit: 3_000_000,
        occupancy_rate_pct: 72
      },
      benchmarking: {
        variance: {
          revenue_pct: 12.5,
          net_profit_pct: -4.25,
          occupancy_rate_pts: 3,
          revpar_pct: 8
        }
      },
      tax_optimization: {
        provisions_and_compliance: {
          income_tax: { amount: 900_000, rate_pct: 30 },
          ica: { amount: 35_000, rate_per_thousand: 7 },
          fontur: { amount: 12_500, rate_per_thousand: 2.5 },
          total_provisions: 947_500
        },
        benefits_monitoring: { iva_exemption: { enabled: true, estimated_savings: 400_000 } }
      },
      profitability_and_sales: {
        revpar_monthly_trend: [
          { month: '2026-07', revpar: 120_000, room_revenue: 1_000_000, room_count: 10 },
          { month: '2026-08', revpar: 150_000, room_revenue: 1_400_000, room_count: 10 }
        ]
      }
    });

    const withDashboard = async () => setup({ dashboard: dashboardPayload() });

    it('la composicion recupera las cifras del periodo', async () => {
      await withDashboard();

      expect(component.compositionData.labels).toEqual(['Ingresos', 'Costos', 'Gastos', 'Utilidad']);
      expect(component.compositionData.datasets[0].data).toEqual([
        5_000_000, 1_200_000, 800_000, 3_000_000
      ]);
    });

    // Una utilidad negativa es el unico caso donde el color aporta: el signo es el dato.
    it('pinta la utilidad negativa distinta', async () => {
      await setup({
        dashboard: {
          ...dashboardPayload(),
          summary: { ...dashboardPayload().summary, net_profit: -500_000 }
        }
      });

      const colors = component.compositionData.datasets[0].backgroundColor as string[];
      expect(colors[3]).not.toBe(colors[0]);
    });

    // Puntos y porcentajes en un mismo eje serian comparar peras con manzanas.
    it('el comparativo deja la ocupacion fuera del eje de porcentajes', async () => {
      await withDashboard();

      expect(component.benchmarkData.labels).not.toContain('ocupacion');
      expect(component.benchmarkData.datasets[0].data.length).toBe(3);
      expect(component.occupancyVariationLabel).toContain('pts');
    });

    it('el comparativo conserva el signo de cada variacion', async () => {
      await withDashboard();

      const data = component.benchmarkData.datasets[0].data as number[];
      expect(data[0]).toBeCloseTo(12.5, 2);
      expect(data[1]).toBeCloseTo(-4.25, 2);
    });

    it('los impuestos comparan solo las tres provisiones', async () => {
      await withDashboard();

      expect(component.taxData.labels).toEqual(['Impuesto de renta', 'ICA', 'FONTUR']);
      expect(component.taxData.datasets[0].data).toEqual([900_000, 35_000, 12_500]);
    });

    it('la tendencia usa meses legibles', async () => {
      await withDashboard();

      expect(component.hasRevparTrend).toBeTrue();
      expect(component.revparData.labels).toEqual(['jul 26', 'ago 26']);
      expect(component.revparData.datasets[0].data).toEqual([120_000, 150_000]);
    });

    // Con la respuesta vacia el tablero sigue armando sus cuatro barras --en cero, que
    // es la verdad-- pero no puede inventarse una tendencia que no vino.
    it('sin datos deja las barras en cero y no inventa tendencia', async () => {
      await setup();

      expect(component.compositionData.datasets[0].data).toEqual([0, 0, 0, 0]);
      expect(component.hasRevparTrend).toBeFalse();
      expect(component.revparData.datasets[0].data).toEqual([]);
    });
  });

  it('no deja exportar unos estados que no se cargaron', async () => {
    await setup();

    expect(component.canExportStatements).toBeFalse();
  });

  describe('el punto de equilibrio', () => {
    // El estado llega del backend en ingles y en mayusculas; nadie lee eso.
    it('traduce el estado', async () => {
      await setup();

      component.dashboardVm.breakEven.status = 'WARNING';
      expect(component.breakEvenStatusLabel).toBe('Ajustado');

      component.dashboardVm.breakEven.status = 'OPTIMAL';
      expect(component.breakEvenStatusLabel).toBe('En equilibrio');

      component.dashboardVm.breakEven.status = '';
      expect(component.breakEvenStatusLabel).toBe('Sin datos');
    });

    // "87%" no dice que hacer; lo que falta en pesos, si.
    it('dice cuanto falta por facturar', async () => {
      await setup();

      component.dashboardVm.breakEven.breakEvenRevenue = 10_000_000;
      component.dashboardVm.breakEven.progressPct = 75;

      expect(component.breakEvenSentence).toContain('Faltan');
      expect(component.breakEvenSentence).toContain('2.500.000');
    });

    it('avisa cuando ya se cubrio, y por cuanto', async () => {
      await setup();

      component.dashboardVm.breakEven.breakEvenRevenue = 10_000_000;
      component.dashboardVm.breakEven.progressPct = 120;

      expect(component.breakEvenSentence).toContain('cubiertos');
      expect(component.breakEvenSentence).toContain('2.000.000');
    });

    it('no inventa una cifra si no hay costos cargados', async () => {
      await setup();

      component.dashboardVm.breakEven.breakEvenRevenue = null;

      expect(component.breakEvenSentence).toContain('Sin costos cargados');
    });
  });
});
