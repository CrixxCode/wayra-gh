import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';

import { UpdatePromotion } from './update-promotion';
import { PromotionsService } from '../../../services/promotion';
import { PromotionI } from '../promotion-model';

const PERCENT = { id: 1, code: 'PERCENTAGE', name: 'Porcentaje' } as any;
const FIXED = { id: 2, code: 'FIJO', name: 'Valor fijo' } as any;

const buildPromotion = (overrides: Partial<PromotionI> = {}): PromotionI =>
  ({
    id: 15,
    hotel_settings: 10,
    discount_type: FIXED.id,
    service: null,
    package: null,
    name: 'Promo lanzamiento',
    code: 'LANZA',
    description: 'Descripcion',
    discount_value: '20000.00',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    is_active: true,
    is_public: true,
    ...overrides
  }) as PromotionI;

describe('UpdatePromotion', () => {
  let component: UpdatePromotion;
  let fixture: ComponentFixture<UpdatePromotion>;

  const updatePromotion = jasmine.createSpy('updatePromotion').and.returnValue(of({}));

  beforeEach(async () => {
    updatePromotion.calls.reset();
    updatePromotion.and.returnValue(of({}));

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [UpdatePromotion],
        providers: [{ provide: PromotionsService, useValue: { updatePromotion } }]
      })
      .compileComponents();

    fixture = TestBed.createComponent(UpdatePromotion);
    component = fixture.componentInstance;
    component.discountTypes = [PERCENT, FIXED];
    component.services = [{ id: 3, name: 'Spa', is_active: true, hotel_settings: 10 } as any];
    component.packages = [{ id: 4, name: 'Luna de miel', is_active: true, hotel_settings: 10 } as any];
    component.hotelSettingsId = 10;
    fixture.detectChanges();
  });

  /** El componente carga la promocion por ngOnChanges, como lo hace el listado. */
  const load = (promotion: PromotionI) => {
    component.promotion = promotion;
    component.ngOnChanges({ promotion: new SimpleChange(null, promotion, true) });
  };

  it('carga la promocion en el formulario', () => {
    load(buildPromotion());

    expect(component.promotionForm.value.name).toBe('Promo lanzamiento');
    expect(component.promotionForm.value.code).toBe('LANZA');
    expect(component.promotionForm.value.discount_value).toBe(20000);
    expect(component.promotionForm.value.start_date).toBe('2026-08-01');
  });

  it('deduce el alcance a partir de a que apunta la promocion', () => {
    load(buildPromotion());
    expect(component.promotionForm.value.target_scope).toBe('GENERAL');

    load(buildPromotion({ service: 3 }));
    expect(component.promotionForm.value.target_scope).toBe('SERVICE');
    expect(component.isServiceScope).toBeTrue();

    load(buildPromotion({ service: null, package: 4 }));
    expect(component.promotionForm.value.target_scope).toBe('PACKAGE');
    expect(component.isPackageScope).toBeTrue();
  });

  it('guarda los cambios contra la promocion abierta', () => {
    load(buildPromotion());
    component.promotionForm.patchValue({ name: 'Promo corregida', discount_value: 35000 });

    component.submit();

    expect(updatePromotion).toHaveBeenCalled();
    const [id, payload] = updatePromotion.calls.mostRecent().args;
    expect(id).toBe(15);
    expect(payload.name).toBe('Promo corregida');
    expect(payload.discount_value).toBe(35000);
  });

  it('limpia el objetivo que no corresponde al alcance', () => {
    load(buildPromotion({ service: 3 }));
    component.promotionForm.patchValue({ target_scope: 'GENERAL' });

    component.submit();

    const [, payload] = updatePromotion.calls.mostRecent().args;
    expect(payload.service).toBeNull();
    expect(payload.package).toBeNull();
  });

  it('aplica las mismas validaciones que el formulario de creacion', () => {
    // Rango de fechas invertido.
    load(buildPromotion({ start_date: '2026-08-31', end_date: '2026-08-01' }));
    component.submit();
    expect(updatePromotion).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('fecha final');

    // Porcentaje por encima de 100.
    load(buildPromotion({ discount_type: PERCENT.id, discount_value: '150' }));
    component.submit();
    expect(updatePromotion).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('100%');
  });

  it('exige elegir el objetivo cuando el alcance lo pide', () => {
    load(buildPromotion());
    component.promotionForm.patchValue({ target_scope: 'SERVICE', service: null });

    component.submit();

    // El alcance activa el validador del campo, asi que el formulario queda invalido
    // antes de llegar a guardar. Es el mismo comportamiento del formulario de creacion.
    expect(updatePromotion).not.toHaveBeenCalled();
    expect(component.service?.invalid).toBeTrue();
  });

  it('muestra el error del backend sin cerrar el formulario', () => {
    load(buildPromotion());
    updatePromotion.and.returnValue(throwError(() => ({ error: { code: ['Ese codigo ya existe.'] } })));

    component.submit();

    expect(component.errorMessage).toBe('Ese codigo ya existe.');
    expect(component.saving).toBeFalse();
  });
});
