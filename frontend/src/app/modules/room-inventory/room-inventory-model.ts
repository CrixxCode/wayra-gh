export interface RoomInventoryI {
  id: number;
  room: number | null;
  room_number?: string;
  item: number | null;
  item_name?: string;
  item_sku?: string | null;
  quantity: number;
  minimum_quantity: number;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RoomInventoryFormPayload {
  room: number;
  item: number;
  quantity: number;
  minimum_quantity: number;
  notes?: string;
  is_active: boolean;
}
