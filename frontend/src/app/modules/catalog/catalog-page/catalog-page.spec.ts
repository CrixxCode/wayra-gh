import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { of } from 'rxjs';

import { CatalogPage } from './catalog-page';
import { PackagesService } from '../../../services/package';
import { PromotionsService } from '../../../services/promotion';
import { ServicesService } from '../../../services/service';

const dayKey = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const service = (id: number, isActive = true) => ({ id, name: `Servicio ${id}`, is_active: isActive });

const pack = (id: number, serviceIds: number[] = [], isActive = true) => ({
  id,
  name: `Paquete ${id}`,
  is_active: isActive,
  package_services: serviceIds.map((serviceId, index) => ({ id: index + 1, service: serviceId }))
});

const promo = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Promo ${id}`,
  is_active: true,
  start_date: dayKey(-10),
  end_date: dayKey(30),
  ...overrides
});

describe('CatalogPage', () => {
  let component: CatalogPage;
  let fixture: ComponentFixture<CatalogPage>;

  const listServices = jasmine.createSpy('listServices');
  const listPackages = jasmine.createSpy('listPackages');
  const listPromotions = jasmine.createSpy('listPromotions');
  const navigate = jasmine.createSpy('navigate');

  const setup = async (
    data: { services?: any[]; packages?: any[]; promotions?: any[]; tab?: string } = {}
  ) => {
    listServices.calls.reset();
    listPackages.calls.reset();
    listPromotions.calls.reset();
    navigate.calls.reset();

    listServices.and.returnValue(of(data.services || []));
    listPackages.and.returnValue(of(data.packages || []));
    listPromotions.and.returnValue(of(data.promotions || []));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [CatalogPage],
        providers: [
          // Las listas hijas se montan al pintar la pestaña activa y traen sus
          // propias dependencias HTTP.
          provideHttpClient(),
          provideHttpClientTesting(),
          ConfirmationService,
          { provide: ServicesService, useValue: { listServices } },
          { provide: PackagesService, useValue: { listPackages, listPackageServices: () => of([]) } },
          {
            provide: PromotionsService,
            useValue: {
              listPromotions,
              // La lista hija carga a que puede apuntar una promocion.
              getTargetCatalog: () => of({ services: [], packages: [] })
            }
          },
          { provide: Router, useValue: { navigate } },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { queryParamMap: { get: () => data.tab ?? null } }
            }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(CatalogPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const metric = (key: string) => component.metrics.find((item) => item.key === key)!;

  it('abre en servicios por defecto', async () => {
    await setup();

    expect(component.activeTab).toBe('services');
  });

  it('respeta la pestaña que llega en la URL', async () => {
    await setup({ tab: 'promotions' });

    expect(component.activeTab).toBe('promotions');
  });

  it('ignora una pestaña desconocida', async () => {
    await setup({ tab: 'inventado' });

    expect(component.activeTab).toBe('services');
  });

  it('cuenta cada catalogo en su pestaña', async () => {
    await setup({
      services: [service(1), service(2)],
      packages: [pack(10)],
      promotions: [promo(20), promo(21), promo(22)]
    });

    expect(component.tabCount('services')).toBe(2);
    expect(component.tabCount('packages')).toBe(1);
    expect(component.tabCount('promotions')).toBe(3);
  });

  it('deja la pestaña elegida en la URL para poder compartirla', async () => {
    await setup();

    component.selectTab('packages');

    expect(component.activeTab).toBe('packages');
    expect(navigate).toHaveBeenCalled();
    const [, extras] = navigate.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ tab: 'packages' });
  });

  describe('metricas', () => {
    it('separa lo activo de lo que solo existe', async () => {
      await setup({
        services: [service(1), service(2, false)],
        packages: [pack(10), pack(11, [], false)]
      });

      expect(metric('services').value).toBe('1');
      expect(metric('services').note).toContain('de 2');
      expect(metric('packages').value).toBe('1');
    });

    it('cuenta como vigente solo la promocion activa y dentro de fechas', async () => {
      await setup({
        promotions: [
          promo(1),
          promo(2, { is_active: false }),
          promo(3, { start_date: dayKey(5), end_date: dayKey(20) }),
          promo(4, { start_date: dayKey(-40), end_date: dayKey(-1) })
        ]
      });

      expect(component.livePromotions.map((item) => item.id)).toEqual([1]);
    });

    it('avisa de las promociones que vencen esta semana', async () => {
      await setup({
        promotions: [promo(1, { end_date: dayKey(3) }), promo(2, { end_date: dayKey(60) })]
      });

      expect(component.expiringPromotions.map((item) => item.id)).toEqual([1]);
      expect(metric('live').tone).toBe('warning');
      expect(metric('live').note).toContain('1 vence');
    });

    it('no alarma cuando ninguna promocion esta por vencer', async () => {
      await setup({ promotions: [promo(1, { end_date: dayKey(60) })] });

      expect(metric('live').tone).toBe('success');
    });

    it('detecta los servicios que no estan en ningun paquete', async () => {
      await setup({
        services: [service(1), service(2), service(3)],
        packages: [pack(10, [1]), pack(11, [2])]
      });

      expect(component.orphanServices).toBe(1);
      expect(metric('orphans').tone).toBe('warning');
    });

    it('no cuenta como huerfano un servicio inactivo', async () => {
      await setup({ services: [service(1, false)], packages: [] });

      expect(component.orphanServices).toBe(0);
      expect(metric('orphans').tone).toBe('success');
    });
  });

  // La escritura ya invalido el cache desde el servicio, asi que esto va al servidor
  // igual. Forzarlo ademas anularia la deduplicacion de peticiones en vuelo y la lista
  // de la pestaña pediria lo mismo por segunda vez (429 con unos pocos clics).
  it('recarga sin forzar el cache cuando cambia un catalogo', async () => {
    await setup();
    listServices.calls.reset();

    component.onCatalogChanged();

    expect(listServices).toHaveBeenCalledWith({ forceRefresh: false });
  });

  // `loading` desmonta el panel entero: si se activara al recargar, activar o eliminar
  // un elemento se veria como si la pantalla se recargara.
  it('no vacia la pantalla al recargar tras un cambio', async () => {
    await setup();
    let loadingDuranteRecarga = false;
    listServices.and.callFake(() => {
      loadingDuranteRecarga = loadingDuranteRecarga || component.loading;
      return of([]);
    });

    component.onCatalogChanged();

    expect(loadingDuranteRecarga).toBeFalse();
    expect(component.loading).toBeFalse();
  });
});
