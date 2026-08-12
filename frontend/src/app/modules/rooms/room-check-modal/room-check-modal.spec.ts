import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { RoomCheckModal, RoomCheckMode } from './room-check-modal';
import { BillingService } from '../../../services/billing';
import { PaymentMethodService } from '../../../services/payment-method';
import { ReservationService } from '../../../services/reservation';
import { RoomInventoryService } from '../../../services/room-inventory';
import { RoomI, RoomOperationsI } from '../room-model';

const NO_SIGNALS: RoomOperationsI = {
  pending_cleaning: 0,
  open_maintenance: 0,
  urgent_maintenance: 0,
  low_inventory: 0,
  reservation_pending: '0.00',
  pending_balance: '0.00',
  unbilled_charges: '0.00',
  pending_total: '0.00'
};

const buildRoom = (operations: Partial<RoomOperationsI> = {}): RoomI => ({
  id: 7,
  number: '101',
  room_type: 1,
  rate: 1,
  floor: 1,
  status: 'OCUPADA',
  amenities: [],
  floor_name: 'Piso 1',
  room_type_name: 'Standard',
  active_reservation: { id: 4521, status: 'CONFIRMADA' },
  operations: { ...NO_SIGNALS, ...operations }
});

const buildReservation = (guests: any[] = [], overrides: Record<string, unknown> = {}) => ({
  id: 4521,
  client: 1,
  client_full_name: 'Jose Perez',
  client_document_number: '1006571234',
  status: 2,
  status_name: 'Confirmada',
  origin: 1,
  expected_check_in: '2026-08-10',
  expected_check_out: '2026-08-12',
  total_nights: 2,
  total_amount: '0.00',
  total_deposits: '0.00',
  pending_amount: '0.00',
  rooms_detail: [],
  deposits: [],
  guests,
  ...overrides
});

const charge = (id: number, description: string, total: string, isAutomatic = false) => ({
  id,
  reservation: 4521,
  charge_type: null,
  description,
  quantity: 1,
  unit_price: total,
  total_amount: total,
  is_active: true,
  is_automatic: isAutomatic
});

const guest = (id: number, document: string | null) => ({
  id,
  reservation: 4521,
  first_name: `Huesped${id}`,
  last_name: 'Prueba',
  full_name: `Huesped${id} Prueba`,
  document_number: document,
  document_type_name: 'Cedula'
});

describe('RoomCheckModal', () => {
  let fixture: ComponentFixture<RoomCheckModal>;
  let component: RoomCheckModal;

  const checkIn = jasmine.createSpy('checkInReservation').and.returnValue(of({}));
  const checkOut = jasmine.createSpy('checkOutReservation').and.returnValue(of({}));

  const createPayment = jasmine.createSpy('createPayment').and.returnValue(of({ id: 1 }));

  /** Saldos que devuelve la reserva en cada relectura, en orden. */
  let reservationQueue: any[] = [];

  const setup = async (
    mode: RoomCheckMode,
    options: {
      guests?: any[];
      operations?: Partial<RoomOperationsI>;
      inventory?: any[];
      charges?: any[];
      reservation?: Record<string, unknown>;
      afterPayment?: Record<string, unknown>;
      invoices?: any[];
      paymentMethods?: any[];
      payments?: any[];
      refunds?: any[];
    } = {}
  ) => {
    checkIn.calls.reset();
    checkOut.calls.reset();
    createPayment.calls.reset();
    createPayment.and.returnValue(of({ id: 1 }));

    reservationQueue = [buildReservation(options.guests || [], options.reservation || {})];
    if (options.afterPayment) {
      reservationQueue.push(buildReservation(options.guests || [], options.afterPayment));
    }

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [RoomCheckModal],
        providers: [
          {
            provide: ReservationService,
            useValue: {
              getReservationById: () =>
                of(reservationQueue.length > 1 ? reservationQueue.shift() : reservationQueue[0]),
              checkInReservation: checkIn,
              checkOutReservation: checkOut
            }
          },
          {
            provide: RoomInventoryService,
            useValue: { listRoomInventory: () => of(options.inventory || []) }
          },
          {
            provide: BillingService,
            useValue: {
              listCharges: () => of(options.charges || []),
              listInvoices: () =>
                of(options.invoices === undefined ? [{ id: 99 }] : options.invoices),
              listPayments: () => of(options.payments || []),
              listPaymentRefunds: () => of(options.refunds || []),
              createPayment
            }
          },
          {
            // Catalogo del hotel, no el global (AGENTS.md 5.16).
            provide: PaymentMethodService,
            useValue: {
              listPaymentMethods: () =>
                of(
                  options.paymentMethods === undefined
                    ? [{ id: 5, code: 'EFECTIVO', name: 'Efectivo' }]
                    : options.paymentMethods
                )
            }
          }
        ]
      })
      .compileComponents();

    fixture = TestBed.createComponent(RoomCheckModal);
    component = fixture.componentInstance;
    component.room = buildRoom(options.operations);
    component.mode = mode;
    fixture.detectChanges();
  };

  describe('ficha de la estadia', () => {
    it('identifica la habitacion, no el id interno de la reserva', async () => {
      await setup('check-out');

      expect(component.roomLabel).toBe('Habitacion 101 · Piso 1 · Standard');
    });

    it('no inventa separadores cuando falta el piso o el tipo', async () => {
      await setup('check-out');
      component.room = { ...component.room, floor_name: undefined, room_type_name: undefined };

      expect(component.roomLabel).toBe('Habitacion 101');
    });
  });

  describe('check-in', () => {
    it('no deja confirmar sin verificar los documentos', async () => {
      await setup('check-in', { guests: [guest(1, '111'), guest(2, '222')] });

      expect(component.canConfirm).toBeFalse();
      expect(component.blockingReason).toContain('2 huesped(es)');

      component.toggleGuest(component.guests[0]);
      expect(component.canConfirm).toBeFalse();
      expect(component.blockingReason).toContain('1 huesped(es)');

      component.toggleGuest(component.guests[1]);
      expect(component.canConfirm).toBeTrue();
    });

    it('bloquea el ingreso si la reserva no tiene huespedes registrados', async () => {
      await setup('check-in', { guests: [] });

      expect(component.hasGuests).toBeFalse();
      expect(component.canConfirm).toBeFalse();
      expect(component.blockingReason).toContain('no tiene huespedes registrados');
    });

    it('avisa cuando un huesped no tiene documento', async () => {
      await setup('check-in', { guests: [guest(1, '111'), guest(2, null)] });

      expect(component.guestsWithoutDocument).toBe(1);
      expect(component.guestDocumentLabel(component.guests[1])).toBe('Sin documento registrado');
      expect(component.guestDocumentLabel(component.guests[0])).toBe('Cedula 111');
    });

    it('solo llama al backend cuando la verificacion esta completa', async () => {
      await setup('check-in', { guests: [guest(1, '111')] });

      component.confirm();
      expect(checkIn).not.toHaveBeenCalled();

      component.verifyAllGuests();
      component.confirm();
      expect(checkIn).toHaveBeenCalledWith(4521);
    });
  });

  describe('check-out', () => {
    const owing = { total_amount: '150000.00', total_deposits: '0.00', pending_amount: '150000.00' };
    const settled = {
      total_amount: '150000.00',
      total_deposits: '150000.00',
      pending_amount: '0.00'
    };

    it('no deja cerrar mientras quede saldo por cobrar', async () => {
      await setup('check-out', { reservation: owing });

      expect(component.amountDue).toBe(150000);
      expect(component.isSettled).toBeFalse();
      expect(component.canConfirm).toBeFalse();
      expect(component.blockingReason).toContain('Falta cobrar');

      component.confirm();
      expect(checkOut).not.toHaveBeenCalled();
    });

    it('desbloquea el cierre cuando el pago deja el saldo en cero', async () => {
      await setup('check-out', { reservation: owing, afterPayment: settled });

      component.registerPayment();

      expect(createPayment).toHaveBeenCalledWith(
        jasmine.objectContaining({ invoice: 99, payment_method: 5, amount: 150000 })
      );
      expect(component.amountDue).toBe(0);
      expect(component.isSettled).toBeTrue();
      expect(component.canConfirm).toBeTrue();

      component.confirm();
      expect(checkOut).toHaveBeenCalledWith(4521);
    });

    it('propone cobrar el saldo completo y admite abonos parciales', async () => {
      await setup('check-out', { reservation: owing });

      expect(component.paymentForm.amount).toBe(150000);
      expect(component.paymentAmountHint).toContain('Cubre el saldo completo');

      component.paymentForm.amount = 50000;
      expect(component.canRegisterPayment).toBeTrue();
      expect(component.paymentAmountHint).toContain('100.000');
    });

    it('no permite cobrar mas de lo que se debe', async () => {
      await setup('check-out', { reservation: owing });

      component.paymentForm.amount = 200000;
      expect(component.canRegisterPayment).toBeFalse();
      expect(component.paymentAmountHint).toContain('no puede superar');

      component.paymentForm.amount = 0;
      expect(component.canRegisterPayment).toBeFalse();
    });

    it('avisa si la reserva no tiene factura donde registrar el cobro', async () => {
      await setup('check-out', { reservation: owing, invoices: [] });

      component.registerPayment();

      expect(createPayment).not.toHaveBeenCalled();
      expect(component.paymentError).toContain('no tiene una factura');
    });

    it('muestra el error del backend si rechaza el pago', async () => {
      await setup('check-out', { reservation: owing });
      createPayment.and.returnValue(
        throwError(() => ({ error: { amount: ['El monto supera el saldo pendiente.'] } }))
      );

      component.registerPayment();

      expect(component.paymentError).toBe('El monto supera el saldo pendiente.');
      expect(component.isSettled).toBeFalse();
    });

    it('deja cerrar directo cuando no hay nada por cobrar', async () => {
      await setup('check-out');

      expect(component.isSettled).toBeTrue();
      expect(component.canConfirm).toBeTrue();
    });

    describe('historial de pagos', () => {
      const payment = (id: number, amount: string, extra: Record<string, unknown> = {}) => ({
        id,
        invoice: 99,
        payment_method: 5,
        payment_method_name: 'Efectivo',
        amount,
        payment_date: `2026-08-1${id}T10:00:00Z`,
        is_active: true,
        created_by_username: 'cajera',
        ...extra
      });

      it('muestra lo que el huesped ya pago', async () => {
        await setup('check-out', {
          reservation: owing,
          payments: [payment(1, '50000.00', { reference: 'V-001' })]
        });

        expect(component.hasPaymentHistory).toBeTrue();
        expect(component.paymentHistory[0].kind).toBe('payment');
        expect(component.paymentHistory[0].method).toBe('Efectivo');
        expect(component.paymentHistory[0].reference).toBe('V-001');
        // Trazabilidad: quien registro el cobro.
        expect(component.paymentHistory[0].author).toBe('cajera');
        expect(component.historyAmountLabel(component.paymentHistory[0])).toContain('50.000');
      });

      it('avisa cuando todavia no hay pagos', async () => {
        await setup('check-out', { reservation: owing });

        expect(component.hasPaymentHistory).toBeFalse();
      });

      it('incluye los reembolsos como movimiento negativo', async () => {
        await setup('check-out', {
          reservation: owing,
          payments: [payment(1, '100000.00')],
          refunds: [
            {
              id: 7,
              payment: 1,
              amount: '30000.00',
              status_code: 'APROBADO',
              status_name: 'Aprobado',
              reason: 'Cobro duplicado',
              refund_date: '2026-08-12T09:00:00Z',
              is_active: true
            }
          ]
        });

        const refund = component.paymentHistory.find((entry) => entry.kind === 'refund');
        expect(refund?.amount).toBe(-30000);
        expect(component.historyAmountLabel(refund!)).toContain('-');
        // 100.000 cobrados menos 30.000 devueltos: cuadra con "Pagado".
        expect(component.historyNetTotal).toBe(70000);
      });

      it('muestra los anulados y pendientes pero no los suma', async () => {
        await setup('check-out', {
          reservation: owing,
          payments: [payment(1, '100000.00'), payment(2, '40000.00', { is_active: false })],
          refunds: [
            {
              id: 8,
              payment: 1,
              amount: '25000.00',
              status_code: 'PENDIENTE',
              status_name: 'Pendiente',
              reason: 'En revision',
              refund_date: '2026-08-13T09:00:00Z',
              is_active: true
            }
          ]
        });

        expect(component.paymentHistory.length).toBe(3);
        // Solo el pago activo mueve el saldo.
        expect(component.historyNetTotal).toBe(100000);

        const voided = component.paymentHistory.find((entry) => entry.id === 'payment-2');
        expect(voided?.status).toBe('Anulado');
        expect(voided?.counts).toBeFalse();

        const pending = component.paymentHistory.find((entry) => entry.kind === 'refund');
        expect(pending?.counts).toBeFalse();
      });

      it('ordena los movimientos cronologicamente', async () => {
        await setup('check-out', {
          reservation: owing,
          payments: [payment(3, '10000.00'), payment(1, '20000.00')]
        });

        expect(component.paymentHistory.map((entry) => entry.id)).toEqual([
          'payment-1',
          'payment-3'
        ]);
      });
    });

    it('lista los consumos y excluye los cargos automaticos de la estadia', async () => {
      await setup('check-out', {
        reservation: owing,
        charges: [
          charge(1, 'Minibar', '45000.00'),
          charge(2, 'Estadia habitacion 101', '150000.00', true),
          charge(3, 'Lavanderia', '20000.00')
        ]
      });

      expect(component.charges.map((item) => item.description)).toEqual([
        'Minibar',
        'Lavanderia'
      ]);
      expect(component.chargesTotal).toBe(65000);
    });

    it('lista solo el inventario por debajo del minimo', async () => {
      await setup('check-out', {
        inventory: [
          { id: 1, item_name: 'Toalla', quantity: 1, minimum_quantity: 3 },
          { id: 2, item_name: 'Jabon', quantity: 5, minimum_quantity: 3 },
          { id: 3, item_name: 'Vaso', quantity: 0, minimum_quantity: 0 }
        ]
      });

      expect(component.lowInventory.map((line) => line.item_name)).toEqual(['Toalla']);
    });

    it('avisa cuando el saldo esta oculto por permisos, en vez de mostrar cero', async () => {
      await setup('check-out', { operations: { reservation_pending: null } });

      expect(component.moneyIsHidden).toBeTrue();
      // Sin poder ver el saldo no se puede exigir la casilla: se confia en recepcion.
      expect(component.canConfirm).toBeTrue();
    });
  });

  it('informa el error sin cerrar el modal si el backend falla', async () => {
    checkOut.and.returnValue(throwError(() => new Error('boom')));
    await setup('check-out');

    component.confirm();

    expect(component.errorMessage).toContain('No se pudo registrar el check-out');
    expect(component.submitting).toBeFalse();
    checkOut.and.returnValue(of({}));
  });
});
