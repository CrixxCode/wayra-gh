export interface PromotionI {
  id: number;
  hotel_settings: number;
  hotel_name?: string;
  discount_type: number;
  discount_type_name?: string;
  discount_type_code?: string;
  service: number | null;
  service_name?: string;
  package: number | null;
  package_name?: string;
  name: string;
  code?: string | null;
  description?: string | null;
  discount_value: string | number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_public: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PromotionFormPayload {
  hotel_settings: number;
  discount_type: number;
  service?: number | null;
  package?: number | null;
  name: string;
  code?: string | null;
  description?: string;
  discount_value: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_public: boolean;
}
