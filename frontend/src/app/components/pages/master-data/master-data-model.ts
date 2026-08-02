export interface MasterDataI {
  id: number;
  group: string;
  group_label?: string;
  code: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface MasterDataGroupI {
  code: string;
  label: string;
}
