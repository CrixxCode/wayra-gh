export interface ServiceI {
  id: number;
  hotel_settings: number;
  hotel_name?: string;
  service_type: number | null;
  service_type_name?: string;
  service_type_code?: string;
  name: string;
  description?: string | null;
  base_price: string | number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceFormPayload {
  hotel_settings: number;
  service_type: number;
  name: string;
  description?: string;
  base_price: number;
  is_active: boolean;
}
