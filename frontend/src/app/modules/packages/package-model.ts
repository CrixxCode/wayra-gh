export interface PackageServiceI {
  id: number;
  package: number;
  service: number;
  service_name?: string;
  service_type_name?: string;
  quantity: number;
  is_included: boolean;
  created_at?: string;
}

export interface PackageI {
  id: number;
  hotel_settings: number;
  hotel_name?: string;
  room_type: number | null;
  room_type_name?: string;
  room_type_code?: string;
  name: string;
  description?: string | null;
  base_price: string | number;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  package_services?: PackageServiceI[];
  created_at?: string;
  updated_at?: string;
}

export interface PackageFormPayload {
  hotel_settings: number;
  room_type?: number | null;
  name: string;
  description?: string;
  base_price: number;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PackageServiceFormPayload {
  package: number;
  service: number;
  quantity: number;
  is_included: boolean;
}
