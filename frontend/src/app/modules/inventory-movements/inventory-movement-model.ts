export interface InventoryMovementI {
  id: number;
  item: number | null;
  item_name?: string;
  movement_type: number | null;
  movement_type_name?: string;
  movement_type_code?: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reference?: string | null;
  notes?: string | null;
  /** Quien movio el stock. Null en los movimientos anteriores al campo. */
  created_by?: string | null;
  created_by_username?: string | null;
  movement_date?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryMovementFormPayload {
  item: number;
  movement_type: number;
  quantity: number;
  reference?: string | null;
  notes?: string;
  is_active: boolean;
}
