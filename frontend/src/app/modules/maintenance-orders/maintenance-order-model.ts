export interface MaintenanceOrderI {
  assigned_to?: number | null;
  assigned_to_name?: string;
  id: number;
  room: number | null;
  room_number?: string;
  title: string;
  description?: string | null;
  priority: string | number | null;
  priority_label?: string;
  status: string | number | null;
  status_label?: string;
  reported_at?: string;
  estimated_completed_at?: string | null;
  completed_at?: string | null;
}

export interface AssignableUserI {
  id: number;
  name: string;
}

export interface MaintenanceOrderFormPayload {
  /** Responsable (B4 #11): usuario del hotel con permiso sobre el modulo. */
  assigned_to?: number | null;
  room: number;
  title: string;
  description?: string;
  priority: string | number;
  status: string | number;
  estimated_completed_at?: string | null;
  completed_at?: string | null;
}
