export type ReservationViewMode = 'table' | 'grid' | 'calendar';

export type ReservationStatusFilter =
  | 'ALL'
  | 'CONFIRMADA'
  | 'PENDIENTE'
  | 'EN_CURSO'
  | 'POR_SALIR_HOY'
  | 'CANCELADA';

export type ReservationVisualStatus =
  | 'CONFIRMADA'
  | 'PENDIENTE'
  | 'EN_CURSO'
  | 'POR_SALIR_HOY'
  | 'CANCELADA'
  | 'FINALIZADA'
  | 'OTRA';

export interface ReservationPolicyI {
  id: number;
  hotel_settings: number;
  policy_type: number;
  policy_type_name?: string;
  policy_type_code?: string;
  penalty_type: number;
  penalty_type_name?: string;
  penalty_type_code?: string;
  name: string;
  description?: string | null;
  penalty_value?: string | number | null;
  hours_before_checkin?: number | null;
  is_active?: boolean;
}

export interface ReservationPolicyPayloadI {
  hotel_settings: number;
  policy_type: number;
  penalty_type: number;
  name: string;
  description?: string | null;
  penalty_value?: string | number | null;
  hours_before_checkin?: number | null;
  is_active?: boolean;
}

export interface ReservationI {
  id: number;
  client: number;
  client_full_name?: string;
  client_document_number?: string;
  status: number;
  status_name?: string;
  status_code?: string;
  origin: number;
  origin_name?: string;
  origin_code?: string;
  package?: number | null;
  package_name?: string;
  package_catalog_name?: string;
  package_display_name?: string;
  package_price?: string | number;
  expected_check_in: string;
  expected_check_out: string;
  real_check_in?: string | null;
  real_check_out?: string | null;
  promo_code?: string | null;
  total_discount?: string | number;
  notes?: string | null;
  policies?: ReservationPolicyI[];
  total_rooms?: number;
  total_guests?: number;
  total_nights?: number;
  rooms_subtotal?: string | number;
  package_subtotal?: string | number;
  total_deposits?: string | number;
  total_amount?: string | number;
  pending_amount?: string | number;
  payment_status_code?: string;
  payment_status_label?: string;
  can_add_payment?: boolean;
  can_confirm?: boolean;
  can_check_in?: boolean;
  can_check_out?: boolean;
  can_cancel?: boolean;
  created_by?: string | null;
  created_at?: string;
}

export interface ReservationWritePayloadI {
  client: number;
  origin: number;
  package?: number | null;
  expected_check_in: string;
  expected_check_out: string;
  real_check_in?: string | null;
  real_check_out?: string | null;
  promo_code?: string | null;
  total_discount?: string | number;
  notes?: string | null;
  policies?: number[];
}

export interface ReservationRoomI {
  id: number;
  reservation: number;
  room: number;
  room_number?: string;
  room_type_name?: string;
  room_type_capacity?: number | null;
  night_rate: string | number;
  adults: number;
  children: number;
  meal_plan?: number | null;
  meal_plan_name?: string;
  meal_plan_code?: string;
  subtotal?: string | number;
  created_at?: string;
}

export interface ReservationRoomPayloadI {
  reservation: number;
  room: number;
  night_rate?: string | number;
  adults?: number;
  children?: number;
  meal_plan?: number | null;
}

export interface ReservationGuestI {
  id: number;
  reservation: number;
  document_type?: number | null;
  document_type_name?: string;
  document_type_code?: string;
  document_number?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  birth_date?: string | null;
  nationality?: string | null;
  blood_type?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  created_at?: string;
}

export interface ReservationGuestPayloadI {
  reservation: number;
  document_type: number;
  document_number: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  nationality?: string | null;
  blood_type?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

export interface ReservationDepositI {
  id: number;
  reservation: number;
  deposit_date: string;
  amount: string | number;
  payment_method?: number | null;
  payment_method_name?: string;
  payment_method_code?: string;
  reference?: string | null;
  status?: number | null;
  status_name?: string;
  status_code?: string;
  notes?: string | null;
  created_at?: string;
}

export interface ReservationDepositPayloadI {
  reservation: number;
  deposit_date?: string;
  amount: string | number;
  payment_method: number;
  reference?: string | null;
  status?: number;
  notes?: string | null;
}

export interface ReservationCheckoutInventoryReviewLinePayloadI {
  room: number;
  item: number;
  quantity: number;
  notes?: string | null;
}

export interface ReservationCheckOutPayloadI {
  inventory_review?: ReservationCheckoutInventoryReviewLinePayloadI[];
}

export interface ReservationInventoryComparisonLineI {
  room_id: number;
  room_number?: string | null;
  item_id: number;
  item_name?: string | null;
  expected_quantity: number;
  reviewed_quantity: number;
  difference_quantity: number;
  notes?: string | null;
}

export interface ReservationInventoryComparisonI {
  check_id?: number | null;
  total_lines: number;
  differences_count: number;
  missing_items_count: number;
  extra_items_count: number;
  lines: ReservationInventoryComparisonLineI[];
}

export interface ReservationDetailI extends ReservationI {
  client_email?: string;
  client_phone?: string;
  rooms_detail: ReservationRoomI[];
  guests: ReservationGuestI[];
  deposits: ReservationDepositI[];
  inventory_comparison?: ReservationInventoryComparisonI;
}

export interface ReservationStatusStyleI {
  label: string;
  chipBg: string;
  chipColor: string;
  dotColor: string;
  borderColor: string;
  actionBg: string;
  actionColor: string;
}
