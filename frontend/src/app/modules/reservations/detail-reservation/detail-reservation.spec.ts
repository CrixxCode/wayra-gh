import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DetailReservation } from './detail-reservation';
import { ReservationService } from '../../../services/reservation';
import { BillingService } from '../../../services/billing';

describe('DetailReservation', () => {
  let component: DetailReservation;
  let fixture: ComponentFixture<DetailReservation>;

  const promotionsPayload = {
    applied: [
      {
        promotion: 3,
        promotion_name: 'Temporada baja',
        scope: 'STAY',
        is_automatic: false,
        amount: '30000.00',
        charge: null,
        charge_description: null,
        applied_by_username: 'recepcion'
      }
    ],
    available: []
  };
  const applyPromotion = jasmine.createSpy('applyReservationPromotion');

  beforeEach(async () => {
    applyPromotion.calls.reset();
    applyPromotion.and.returnValue(of(promotionsPayload));
    await TestBed.configureTestingModule({
      imports: [DetailReservation],
      providers: [
        {
          provide: ReservationService,
          useValue: {
            getReservationPromotions: () => of({ applied: [], available: [] }),
            applyReservationPromotion: applyPromotion,
            getReservationById: () =>
              of({
                id: 1,
                client: 1,
                status: 1,
                origin: 1,
                expected_check_in: '2026-03-01',
                expected_check_out: '2026-03-03',
                total_discount: 0,
                rooms_detail: [],
                guests: [],
                deposits: []
              })
          }
        },
        {
          provide: BillingService,
          useValue: {
            listInvoices: () => of([])
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DetailReservation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the holder document as the header secondary label even when guests have nationality', () => {
    component.reservation = {
      id: 1,
      client: 1,
      client_full_name: 'Ana Perez',
      client_document_number: '123456789',
      status: 1,
      origin: 1,
      expected_check_in: '2026-03-01',
      expected_check_out: '2026-03-03',
      total_discount: 0,
      rooms_detail: [],
      guests: [
        {
          id: 10,
          reservation: 1,
          document_number: '987654321',
          first_name: 'Ana',
          last_name: 'Perez',
          nationality: 'Colombia'
        }
      ],
      deposits: []
    };

    expect(component.guestSecondaryLabel).toBe('123456789');
  });

  describe('promociones', () => {
    const openReservation = (extra: Record<string, unknown> = {}) =>
      ({
        id: 1,
        client: 1,
        status: 1,
        status_code: 'CONFIRMADA',
        origin: 1,
        expected_check_in: '2026-03-01',
        expected_check_out: '2026-03-03',
        total_discount: 0,
        rooms_detail: [],
        guests: [],
        deposits: [],
        ...extra
      }) as any;

    it('solo deja elegir promociones mientras la reserva esta abierta', () => {
      component.reservation = openReservation();
      expect(component.canEditPromotions).toBeTrue();

      component.reservation = openReservation({ real_check_out: '2026-03-03T12:00:00Z' });
      expect(component.canEditPromotions).toBeFalse();

      component.reservation = openReservation({ status_code: 'CANCELADA' });
      expect(component.canEditPromotions).toBeFalse();
    });

    it('aplica la general elegida y relee la reserva para refrescar el total', () => {
      const changed: unknown[] = [];
      component.flowChanged.subscribe((detail) => changed.push(detail));
      component.reservation = openReservation();
      component.selectedPromotionId = 3;

      component.applyPromotion();

      expect(applyPromotion).toHaveBeenCalledWith(1, 3);
      expect(component.appliedPromotions.length).toBe(1);
      expect(component.promotionAmountLabel(component.appliedPromotions[0])).toContain('30.000');
      expect(changed.length).toBe(1);
    });

    it('etiqueta de donde sale cada descuento', () => {
      expect(
        component.promotionScopeLabel({
          ...promotionsPayload.applied[0],
          scope: 'SERVICE',
          charge_description: 'Minibar'
        } as any)
      ).toBe('Servicio · Minibar');
      expect(component.promotionScopeLabel(promotionsPayload.applied[0] as any)).toBe('Estadia');
    });
  });
});
