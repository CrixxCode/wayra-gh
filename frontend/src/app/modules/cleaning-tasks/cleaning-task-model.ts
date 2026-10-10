export interface CleaningTaskI {
  assigned_to?: number | null;
  assigned_to_name?: string;
  id: number;
  room: number | null;
  room_number?: string;
  task_type: string | number | null;
  task_type_label?: string;
  status: string | number | null;
  status_label?: string;
  scheduled_for?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface AssignableUserI {
  id: number;
  name: string;
}

export interface CleaningTaskFormPayload {
  /** Responsable (B4 #11): usuario del hotel con permiso sobre el modulo. */
  assigned_to?: number | null;
  room: number;
  task_type: string | number;
  status: string | number;
  scheduled_for?: string | null;
  completed_at?: string | null;
  notes?: string;
}
