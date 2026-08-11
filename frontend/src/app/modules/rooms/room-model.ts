export type RoomStatus =
  | 'DISPONIBLE'
  | 'RESERVADA'
  | 'OCUPADA'
  | 'MANTENIMIENTO'
  | 'LIMPIEZA'
  | 'FUERA_DE_SERVICIO';

export type RoomVisualStatus = RoomStatus | 'POR_SALIR_HOY' | 'SIN_CONFIGURAR';

export interface AmenityI {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface RoomTypeI {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  capacity?: number;
  bed_count?: number;
  bed_type?: string | null;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface RoomTypeFormPayload {
  code: string;
  name: string;
  description?: string | null;
  capacity: number;
  bed_count: number;
  bed_type?: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface RateI {
  id: number;
  room_type: number;
  room_type_name?: string;
  name: string;
  price: string | number;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface RateFormPayload {
  room_type: number;
  name: string;
  price: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
}

export interface HotelFloorI {
  id: number;
  hotel_settings?: number;
  floor_number: number;
  name: string;
  prefix: string;
  room_count: number;
  range_display?: string;
}

/**
 * Señales operativas que `/api/rooms/` calcula en bloque para el tablero de recepcion:
 * limpieza pendiente, mantenimiento abierto y lo que el huesped todavia debe.
 * Los montos llegan como string decimal para no perder precision.
 */
export interface RoomOperationsI {
  pending_cleaning: number;
  open_maintenance: number;
  /** Subconjunto de open_maintenance con prioridad alta o urgente. */
  urgent_maintenance: number;
  /** Items de la habitacion por debajo de su minimo. */
  low_inventory: number;
  // Los montos llegan en `null` cuando el usuario no tiene `rooms.read_guest_data`.
  // `null` significa "no te corresponde verlo"; "0.00" significa "no debe nada".
  /**
   * Lo que el huesped debe por la reserva activa: estadia + paquete + cargos, menos
   * descuentos y abonos. Es el mismo numero que muestra el modal de la habitacion.
   */
  reservation_pending: string | null;
  /** Facturas emitidas y sin pagar de la reserva activa. */
  pending_balance: string | null;
  /** Cargos de la reserva activa que aun no se facturan (consumos). */
  unbilled_charges: string | null;
  /** pending_balance + unbilled_charges. */
  pending_total: string | null;
}

export interface RoomI {
  id: number;
  number: string;
  room_type: number | null;
  room_type_capacity?: number | null;
  rate?: number | null;
  rate_name?: string | null;
  rate_price?: string | number | null;
  floor: number;
  status: RoomStatus;
  notes?: string | null;
  amenities: AmenityI[];
  created_at?: string;

  room_type_name?: string;
  floor_name?: string;
  florr_number?: number;
  active_reservation?: RoomActiveReservationI | null;
  operations?: RoomOperationsI | null;
}

export interface RoomRateMiniI {
  id: number;
  name: string;
  price: string | number;
}

export interface RoomTypeMiniI {
  id: number;
  name: string;
  capacity?: number;
  bed_count?: number;
  bed_type?: string | null;
}

export interface RoomPanelMaintenanceI {
  id: number;
  title: string;
  description?: string | null;
  priority: string;
  priority_label?: string;
  status: string;
  status_label?: string;
  reported_at?: string;
  estimated_completed_at?: string | null;
  completed_at?: string | null;
}

export interface RoomActiveReservationI {
  id: number;
  reservation_room_id?: number;
  status?: string;
  status_label?: string;
  expected_check_in?: string;
  expected_check_out?: string;
  expected_check_out_time?: string | null;
  real_check_in?: string | null;
  real_check_out?: string | null;
  client_name?: string | null;
  client_document?: string | null;
  client?: {
    id?: number | null;
    full_name?: string | null;
    document_number?: string | null;
  } | null;
}

export interface RoomPanelI {
  id: number;
  number: string;
  status: RoomStatus;
  status_label?: string;
  notes?: string | null;
  floor_name?: string;
  floor_number?: number;
  room_type: RoomTypeMiniI | null;
  rate: RoomRateMiniI | null;
  amenities: Array<Pick<AmenityI, 'id' | 'name' | 'icon'>>;
  current_guest: unknown | null;
  active_reservation: RoomActiveReservationI | null;
  active_maintenance: RoomPanelMaintenanceI | null;
}

export interface RoomFormPayload {
  number: string;
  floor: number;
  room_type?: number | null;
  rate?: number | null;
  status: RoomStatus;
  notes?: string;
  amenity_ids?: number[];
}
