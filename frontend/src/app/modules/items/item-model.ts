export interface ItemI {
  id: number;
  hotel_settings: number;
  hotel_name?: string;
  item_type: number | null;
  item_type_name?: string;
  item_type_code?: string;
  unit_measure: number | null;
  unit_measure_name?: string;
  unit_measure_code?: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  stock: number;
  minimum_stock: number;
  maximum_stock: number;
  cost_price: string | number;
  sale_price: string | number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ItemFormPayload {
  hotel_settings: number;
  item_type: number;
  unit_measure: number;
  name: string;
  sku?: string | null;
  description?: string;
  stock: number;
  minimum_stock: number;
  maximum_stock: number;
  cost_price: number;
  sale_price: number;
  is_active: boolean;
}
