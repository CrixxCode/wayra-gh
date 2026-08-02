export interface MaintenanceOrderI {
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

export interface MaintenanceOrderFormPayload {
  room: number;
  title: string;
  description?: string;
  priority: string | number;
  status: string | number;
  estimated_completed_at?: string | null;
  completed_at?: string | null;
}
