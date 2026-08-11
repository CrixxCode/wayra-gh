import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ListRooms } from './list-rooms';
import { RoomService } from '../../../services/room';
import { ReservationService } from '../../../services/reservation';
import { CleaningTasksService } from '../../../services/cleaning-task';
import { AuthService, hasResourceScope } from '../../../services/auth/auth';
import { RoomI, RoomOperationsI, RoomStatus } from '../room-model';

type RoomOverrides = Omit<Partial<RoomI>, 'operations'> & { operations?: Partial<RoomOperationsI> };

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

const buildRoom = (id: number, number: string, status: RoomStatus, overrides: RoomOverrides = {}): RoomI => ({
  id,
  number,
  room_type: 1,
  rate: 1,
  floor: 1,
  status,
  amenities: [],
  ...overrides,
  operations: { ...NO_SIGNALS, ...(overrides.operations || {}) }
});

describe('ListRooms', () => {
  let component: ListRooms;
  let fixture: ComponentFixture<ListRooms>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListRooms],
      providers: [
        {
          provide: RoomService,
          useValue: {
            listRooms: () => of([]),
            listRoomTypes: () => of([]),
            listAmenities: () => of([]),
            listFloors: () => of([]),
            listRates: () => of([]),
            getRoomById: (id: number) => of(buildRoom(id, String(id), 'DISPONIBLE')),
            invalidateRoomsCache: () => undefined,
            invalidateRoomModuleCache: () => undefined
          }
        },
        {
          provide: ReservationService,
          useValue: {
            confirmReservation: () => of({}),
            checkInReservation: () => of({}),
            checkOutReservation: () => of({})
          }
        },
        {
          provide: CleaningTasksService,
          useValue: {
            listCleaningTasks: () => of([]),
            updateCleaningTask: () => of({})
          }
        },
        {
          provide: AuthService,
          useValue: {
            getUserInfo: () => of({ resource_keys: ['rooms.read', 'rooms.read_guest_data'] })
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ListRooms);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filtros operativos', () => {
    beforeEach(() => {
      component.rooms = [
        buildRoom(1, '101', 'DISPONIBLE'),
        // Ocupada y debiendo: el caso que recepcion no puede dejar pasar al checkout.
        buildRoom(2, '102', 'OCUPADA', {
          operations: { reservation_pending: '150000.00' }
        }),
        // Limpieza como estado de la habitacion, sin tarea registrada.
        buildRoom(3, '103', 'LIMPIEZA'),
        // Ocupada pero con una tarea de limpieza abierta.
        buildRoom(4, '104', 'OCUPADA', { operations: { pending_cleaning: 1 } }),
        // Disponible con una orden de mantenimiento sin cerrar.
        buildRoom(5, '105', 'DISPONIBLE', { operations: { open_maintenance: 2 } }),
        buildRoom(6, '106', 'MANTENIMIENTO'),
        // Sin tarifa: no se puede vender.
        buildRoom(7, '107', 'DISPONIBLE', { rate: null })
      ];
      component.applyFilters();
    });

    const filteredNumbers = (): string[] => component.filteredRooms.map((room) => room.number).sort();

    it('filtra por saldo pendiente', () => {
      component.selectOperationalFilter('PENDING_BALANCE');

      expect(filteredNumbers()).toEqual(['102']);
      expect(component.getOperationalCount('PENDING_BALANCE')).toBe(1);
    });

    it('cuenta como limpieza pendiente tanto el estado como las tareas abiertas', () => {
      component.selectOperationalFilter('CLEANING');

      expect(filteredNumbers()).toEqual(['103', '104']);
    });

    it('cuenta como mantenimiento abierto tanto el estado como las ordenes sin cerrar', () => {
      component.selectOperationalFilter('MAINTENANCE');

      expect(filteredNumbers()).toEqual(['105', '106']);
    });

    it('agrupa todo lo pendiente en el filtro de accion', () => {
      component.selectOperationalFilter('NEEDS_ACTION');

      // Todas menos la 101, que esta disponible y sin nada pendiente.
      expect(filteredNumbers()).toEqual(['102', '103', '104', '105', '106', '107']);
    });

    it('trata una habitacion sin tarifa como sin configurar', () => {
      component.selectOperationalFilter('UNCONFIGURED');

      expect(filteredNumbers()).toEqual(['107']);
    });

    it('no rompe cuando el backend no envia senales', () => {
      component.rooms = [{ ...buildRoom(8, '108', 'OCUPADA'), operations: null }];
      component.applyFilters();

      expect(component.hasPendingBalance(component.rooms[0])).toBeFalse();
      expect(component.hasPendingCleaning(component.rooms[0])).toBeFalse();
      expect(component.getPendingTotal(component.rooms[0])).toBe(0);
    });
  });

  describe('acciones rapidas', () => {
    const reservedRoom = (): RoomI =>
      buildRoom(1, '101', 'OCUPADA', {
        active_reservation: {
          id: 4521,
          status: 'CONFIRMADA',
          expected_check_in: '2020-01-01'
        }
      });

    it('el check-in abre la verificacion en vez de ejecutarse de un clic', () => {
      const reservationService = TestBed.inject(ReservationService);
      spyOn(reservationService, 'checkInReservation').and.callThrough();

      const room = reservedRoom();
      component.runQuickAction(room);

      expect(reservationService.checkInReservation).not.toHaveBeenCalled();
      expect(component.checkModalRoom).toBe(room);
      expect(component.checkModalMode).toBe('check-in');
    });

    it('el check-out tambien pasa por la verificacion', () => {
      const reservationService = TestBed.inject(ReservationService);
      spyOn(reservationService, 'checkOutReservation').and.callThrough();

      const room = buildRoom(2, '102', 'OCUPADA', {
        active_reservation: { id: 4522, status: 'EN_CURSO', real_check_in: '2026-08-10T10:00:00Z' }
      });
      component.runQuickAction(room);

      expect(reservationService.checkOutReservation).not.toHaveBeenCalled();
      expect(component.checkModalMode).toBe('check-out');
    });

    it('invalida el cache del listado tras una accion, no solo la tarjeta local', () => {
      const roomService = TestBed.inject(RoomService);
      spyOn(roomService, 'invalidateRoomsCache');

      const room = buildRoom(4, '104', 'OCUPADA', {
        active_reservation: { id: 4524, status: 'PENDIENTE' }
      });
      component.runQuickAction(room);

      expect(roomService.invalidateRoomsCache).toHaveBeenCalled();
    });

    it('confirmar una reserva pendiente sigue siendo directo', () => {
      const reservationService = TestBed.inject(ReservationService);
      spyOn(reservationService, 'confirmReservation').and.callThrough();

      const room = buildRoom(3, '103', 'OCUPADA', {
        active_reservation: { id: 4523, status: 'PENDIENTE' }
      });
      component.runQuickAction(room);

      expect(reservationService.confirmReservation).toHaveBeenCalledWith(4523);
      expect(component.checkModalRoom).toBeNull();
    });
  });

  describe('datos del huesped (rooms.read_guest_data)', () => {
    it('reconoce el scope, sus variantes y los comodines', () => {
      const withScope = { resource_keys: ['rooms.read_guest_data'] } as any;
      const withDash = { resource_keys: ['rooms.read-guest-data'] } as any;
      const withDomainWildcard = { resource_keys: ['rooms.*'] } as any;
      const withGlobalWildcard = { resource_keys: ['*'] } as any;
      const withoutScope = { resource_keys: ['rooms.read'] } as any;
      // El backend intercambia guion y guion bajo, pero no el punto: una clave
      // "rooms-read-guest-data" NO equivale a "rooms.read_guest_data".
      const withDotReplaced = { resource_keys: ['rooms-read-guest-data'] } as any;

      expect(hasResourceScope(withScope, 'rooms.read_guest_data')).toBeTrue();
      expect(hasResourceScope(withDash, 'rooms.read_guest_data')).toBeTrue();
      expect(hasResourceScope(withDomainWildcard, 'rooms.read_guest_data')).toBeTrue();
      expect(hasResourceScope(withGlobalWildcard, 'rooms.read_guest_data')).toBeTrue();
      expect(hasResourceScope(withoutScope, 'rooms.read_guest_data')).toBeFalse();
      expect(hasResourceScope(withDotReplaced, 'rooms.read_guest_data')).toBeFalse();
      expect(hasResourceScope(null, 'rooms.read_guest_data')).toBeFalse();
    });

    it('muestra el filtro y la tarjeta de saldo cuando hay permiso', () => {
      expect(component.canReadGuestData).toBeTrue();
      expect(component.visibleOperationalFilters.map((f) => f.key)).toContain('PENDING_BALANCE');
      expect(component.daySummary.map((c) => c.key)).toContain('balance');
    });

    it('los oculta cuando no hay permiso, en vez de mostrar un cero enganoso', () => {
      component.canReadGuestData = false;

      expect(component.visibleOperationalFilters.map((f) => f.key)).not.toContain(
        'PENDING_BALANCE'
      );
      expect(component.daySummary.map((c) => c.key)).not.toContain('balance');
    });

    it('no pinta el indicador de saldo cuando el backend manda null', () => {
      const room = buildRoom(1, '101', 'OCUPADA', {
        operations: {
          reservation_pending: null,
          pending_balance: null,
          unbilled_charges: null,
          pending_total: null
        }
      });

      expect(component.hasPendingBalance(room)).toBeFalse();
      expect(component.getCardBadges(room).map((badge) => badge.key)).not.toContain('balance');
    });
  });

  describe('busqueda', () => {
    beforeEach(() => {
      component.rooms = [
        buildRoom(1, '101', 'OCUPADA', {
          floor_name: 'Piso 1',
          active_reservation: {
            id: 4521,
            status: 'EN_CURSO',
            status_label: 'En curso',
            client_name: 'José Pérez',
            client_document: '1006571234'
          }
        }),
        buildRoom(2, '201', 'OCUPADA', {
          floor_name: 'Piso 2',
          active_reservation: {
            id: 4522,
            status: 'EN_CURSO',
            status_label: 'En curso',
            client_name: 'Juan Ramirez',
            client_document: '52987654'
          }
        }),
        buildRoom(3, '202', 'DISPONIBLE', { floor_name: 'Piso 2', notes: 'Vista al mar' })
      ];
      component.applyFilters();
    });

    const search = (value: string): string[] => {
      component.search = value;
      component.applyFilters();
      return component.filteredRooms.map((room) => room.number);
    };

    it('encuentra por documento del huesped', () => {
      expect(search('1006571234')).toEqual(['101']);
    });

    it('encuentra por nombre ignorando tildes y mayusculas', () => {
      expect(search('jose')).toEqual(['101']);
      expect(search('PEREZ')).toEqual(['101']);
    });

    it('encuentra por numero de reserva con o sin almohadilla', () => {
      expect(search('4522')).toEqual(['201']);
      expect(search('#4522')).toEqual(['201']);
    });

    it('encuentra por estado visible de la habitacion', () => {
      expect(search('disponible')).toEqual(['202']);
    });

    it('exige todos los terminos, no cualquiera', () => {
      // "piso 2" esta en la 201 y la 202; sumarle "juan" deja solo la 201.
      expect(search('juan piso 2')).toEqual(['201']);
      // Ningun cuarto tiene a la vez "juan" y "202".
      expect(search('juan 202')).toEqual([]);
    });

    it('busca por subcadena, tambien en los numeros', () => {
      // Consecuencia deliberada: escribir "20" mientras se teclea "202" ya filtra.
      expect(search('20')).toEqual(['201', '202']);
    });

    it('sigue encontrando por numero de habitacion y notas', () => {
      expect(search('101')).toEqual(['101']);
      expect(search('vista al mar')).toEqual(['202']);
    });
  });

  describe('tablero por estado', () => {
    beforeEach(() => {
      component.rooms = [
        buildRoom(1, '110', 'DISPONIBLE'),
        buildRoom(2, '102', 'DISPONIBLE'),
        buildRoom(3, '103', 'LIMPIEZA'),
        buildRoom(4, '104', 'MANTENIMIENTO'),
        buildRoom(5, '105', 'FUERA_DE_SERVICIO')
      ];
      component.applyFilters();
    });

    const column = (key: string) => component.boardColumns.find((item) => item.key === key);

    it('mantiene visibles las columnas del recorrido normal aunque esten vacias', () => {
      expect(component.boardColumns.map((item) => item.key)).toEqual([
        'DISPONIBLE',
        'RESERVADA',
        'OCUPADA',
        'POR_SALIR_HOY',
        'LIMPIEZA',
        'MANTENIMIENTO',
        'FUERA_DE_SERVICIO'
      ]);
      expect(column('RESERVADA')!.rooms.length).toBe(0);
    });

    it('oculta las columnas excepcionales cuando no tienen habitaciones', () => {
      component.rooms = [buildRoom(6, '106', 'DISPONIBLE')];
      component.applyFilters();

      expect(component.boardColumns.map((item) => item.key)).not.toContain('FUERA_DE_SERVICIO');
      expect(component.boardColumns.map((item) => item.key)).not.toContain('SIN_CONFIGURAR');
    });

    it('ordena las habitaciones por numero dentro de la columna', () => {
      expect(column('DISPONIBLE')!.rooms.map((room) => room.number)).toEqual(['102', '110']);
    });

    it('respeta los filtros activos', () => {
      component.selectStatus('LIMPIEZA');

      expect(column('LIMPIEZA')!.rooms.length).toBe(1);
      expect(column('DISPONIBLE')!.rooms.length).toBe(0);
    });
  });

  describe('resumen del dia', () => {
    beforeEach(() => {
      component.rooms = [
        buildRoom(1, '101', 'DISPONIBLE'),
        // Debe saldo de la reserva.
        buildRoom(2, '102', 'OCUPADA', {
          operations: { reservation_pending: '80000.00' }
        }),
        // No debe saldo, pero arrastra consumos sin facturar: tambien hay que cobrar.
        buildRoom(3, '103', 'OCUPADA', {
          operations: { unbilled_charges: '20000.00' }
        }),
        buildRoom(4, '104', 'DISPONIBLE', {
          operations: { open_maintenance: 1, urgent_maintenance: 1 }
        }),
        buildRoom(5, '105', 'LIMPIEZA'),
        buildRoom(6, '106', 'DISPONIBLE', { rate: null })
      ];
      component.applyFilters();
    });

    const card = (key: string) => component.daySummary.find((item) => item.key === key)!;

    it('cuenta cada frente de trabajo', () => {
      // La 102 por saldo y la 103 por consumos sin facturar.
      expect(card('balance').count).toBe(2);
      expect(card('maintenance').count).toBe(1);
      expect(card('cleaning').count).toBe(1);
      expect(card('unconfigured').count).toBe(1);
    });

    it('separa saldo de la reserva y consumos sin facturar en la nota', () => {
      expect(component.pendingBalanceTotal).toBe(80000);
      expect(component.unbilledChargesTotal).toBe(20000);
      expect(card('balance').count).toBe(2);
      expect(card('balance').note).toContain('80.000');
      expect(card('balance').note).toContain('20.000');
    });

    it('destaca las ordenes urgentes en la nota de mantenimiento', () => {
      expect(component.urgentMaintenanceCount).toBe(1);
      expect(card('maintenance').note).toContain('1 urgente');
    });

    it('avisa cuando no hay ordenes urgentes', () => {
      component.rooms = [buildRoom(7, '107', 'MANTENIMIENTO')];
      component.applyFilters();

      expect(card('maintenance').count).toBe(1);
      expect(card('maintenance').note).toBe('Sin ordenes urgentes');
    });

    it('resume la ocupacion del hotel', () => {
      // La 106 no cuenta como disponible: sin tarifa no se puede vender.
      expect(component.occupancyLabel).toBe('2 disponibles de 6 · 2 ocupadas');
    });

    it('aplica y quita el filtro al pulsar la misma tarjeta', () => {
      component.toggleOperationalFilter('PENDING_BALANCE');
      expect(component.operationalFilter).toBe('PENDING_BALANCE');
      expect(component.filteredRooms.length).toBe(2);

      component.toggleOperationalFilter('PENDING_BALANCE');
      expect(component.operationalFilter).toBe('ALL');
      expect(component.filteredRooms.length).toBe(6);
    });
  });

  describe('indicadores de la tarjeta', () => {
    const badgeKeys = (room: RoomI): string[] => component.getCardBadges(room).map((b) => b.key);

    it('no muestra indicadores en una habitacion limpia y sin pendientes', () => {
      const room = buildRoom(1, '101', 'DISPONIBLE');

      expect(component.hasCardBadges(room)).toBeFalse();
      expect(badgeKeys(room)).toEqual([]);
    });

    it('ordena los indicadores poniendo primero lo que cuesta plata o bloquea la salida', () => {
      const room = buildRoom(2, '102', 'OCUPADA', {
        operations: {
          pending_cleaning: 1,
          open_maintenance: 1,
          low_inventory: 2,
          reservation_pending: '100000.00',
          unbilled_charges: '20000.00'
        }
      });

      expect(badgeKeys(room)).toEqual([
        'balance',
        'charges',
        'maintenance',
        'cleaning',
        'inventory'
      ]);
    });

    it('muestra el saldo de la reserva, el mismo numero que el modal', () => {
      const room = buildRoom(3, '103', 'OCUPADA', {
        operations: { reservation_pending: '100000.00' }
      });

      const badge = component.getCardBadges(room).find((item) => item.key === 'balance');

      expect(badge?.tone).toBe('danger');
      expect(badge?.label).toContain('100.000');
      expect(badge?.title).toContain('Saldo de la reserva');
    });

    it('muestra los consumos sin facturar como indicador aparte', () => {
      const room = buildRoom(4, '104', 'OCUPADA', {
        operations: { unbilled_charges: '45000.00' }
      });

      const badge = component.getCardBadges(room).find((item) => item.key === 'charges');

      expect(badge?.label).toContain('Consumos');
      expect(badge?.label).toContain('45.000');
      expect(badge?.tone).toBe('warning');
    });

    it('no confunde saldo de reserva con consumos sin facturar', () => {
      // Reserva saldada pero con consumos sin facturar: no hay saldo, si hay que cobrar.
      const room = buildRoom(5, '105', 'OCUPADA', {
        operations: { reservation_pending: '0.00', unbilled_charges: '45000.00' }
      });

      expect(badgeKeys(room)).toEqual(['charges']);
      expect(component.hasPendingBalance(room)).toBeTrue();
    });

    it('pluraliza solo cuando hay mas de un pendiente', () => {
      const one = buildRoom(4, '104', 'DISPONIBLE', { operations: { low_inventory: 1 } });
      const many = buildRoom(5, '105', 'DISPONIBLE', { operations: { low_inventory: 3 } });

      expect(component.getCardBadges(one)[0].label).toBe('Inventario bajo');
      expect(component.getCardBadges(many)[0].label).toBe('Inventario bajo (3)');
    });

    it('marca la salida vencida como urgente', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const room = buildRoom(6, '106', 'OCUPADA', {
        active_reservation: {
          id: 1,
          status: 'EN_CURSO',
          real_check_in: yesterday.toISOString(),
          expected_check_out: yesterday.toISOString().slice(0, 10),
          expected_check_out_time: '12:00'
        }
      });

      const badge = component.getCardBadges(room).find((item) => item.key === 'checkout');

      expect(badge?.label).toBe('Salida vencida');
      expect(badge?.tone).toBe('danger');
    });

    it('no marca salida urgente cuando el huesped se va en varios dias', () => {
      const inThreeDays = new Date();
      inThreeDays.setDate(inThreeDays.getDate() + 3);

      const room = buildRoom(7, '107', 'OCUPADA', {
        active_reservation: {
          id: 2,
          status: 'EN_CURSO',
          real_check_in: new Date().toISOString(),
          expected_check_out: inThreeDays.toISOString().slice(0, 10),
          expected_check_out_time: '12:00'
        }
      });

      expect(component.isCheckoutUrgent(room)).toBeFalse();
      expect(badgeKeys(room)).toEqual([]);
    });
  });
});
