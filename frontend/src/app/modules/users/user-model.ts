export interface RoleI {
  id: number | string;
  name: string;
  slug?: string;
  description?: string;
}

export interface UserHotelSettingsI {
  id?: number;
  hotel_name?: string;
  city?: string;
  country?: string;
  timezone?: string;
  currency?: string;
  is_active?: boolean;
}

export interface UserI {
  id?: number | string;
  username: string;
  password?: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title?: string;
  avatar?: string; // URL o base64
  role?: RoleI | null;
  roles?: RoleI[];
  job_title_option?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  is_active?: boolean;
  is_staff?: boolean;
  date_joined?: string;
  hotel_settings?: number | UserHotelSettingsI | null;
}
