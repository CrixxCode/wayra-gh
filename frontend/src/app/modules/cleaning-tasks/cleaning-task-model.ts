export interface CleaningTaskI {
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

export interface CleaningTaskFormPayload {
  room: number;
  task_type: string | number;
  status: string | number;
  scheduled_for?: string | null;
  completed_at?: string | null;
  notes?: string;
}
