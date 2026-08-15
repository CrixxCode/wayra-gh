export type RecurringWorkKind = 'CLEANING' | 'MAINTENANCE';
export type RecurringWorkFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface RecurringWorkI {
  id: number;
  hotel_settings?: number | null;
  /** Sin habitacion, la regla aplica a todas las del hotel. */
  room: number | null;
  room_number?: string;
  kind: RecurringWorkKind;
  name: string;
  task_type?: string | number | null;
  task_type_label?: string;
  priority?: string | number | null;
  priority_label?: string;
  notes?: string | null;
  frequency: RecurringWorkFrequency;
  interval: number;
  /** Lunes = 0, domingo = 6. Solo en la frecuencia semanal. */
  weekday?: number | null;
  day_of_month?: number | null;
  starts_on: string;
  ends_on?: string | null;
  /** Lo calcula el servidor: cuando vuelve a tocar. */
  next_run_on: string;
  last_generated_on?: string | null;
  generated_count: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RecurringWorkFormPayload {
  hotel_settings?: number | null;
  room?: number | null;
  kind: RecurringWorkKind;
  name: string;
  task_type?: string | number | null;
  priority?: string | number | null;
  notes?: string | null;
  frequency: RecurringWorkFrequency;
  interval: number;
  weekday?: number | null;
  day_of_month?: number | null;
  starts_on: string;
  ends_on?: string | null;
  is_active?: boolean;
}
