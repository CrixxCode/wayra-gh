export type RoomStatus =
  | 'DISPONIBLE'
  | 'RESERVADA'
  | 'OCUPADA'
  | 'MANTENIMIENTO'
  | 'LIMPIEZA'
  | 'FUERA_DE_SERVICIO';

export type RoomVisualStatus = RoomStatus | 'POR_SALIR_HOY';

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

export interface RoomI {
  id: number;
  number: string;
  room_type: number | null;
  room_type_capacity?: number | null;
  floor: number;
  status: RoomStatus;
  notes?: string | null;
  amenities: AmenityI[];
  created_at?: string;

  room_type_name?: string;
  floor_name?: string;
  florr_number?: number;
  active_reservation?: RoomActiveReservationI | null;
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
  real_check_in?: string | null;
  real_check_out?: string | null;
  client_name?: string | null;
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
  status: RoomStatus;
  notes?: string;
  amenity_ids?: number[];
}
