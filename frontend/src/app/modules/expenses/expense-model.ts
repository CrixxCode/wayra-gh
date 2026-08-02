export type ExpenseType = 'OPERATING_COST' | 'ADMIN_EXPENSE' | 'SALES_EXPENSE';
export type CostBehavior = 'FIXED' | 'VARIABLE';

export interface ExpenseI {
  id: number;
  hotel_settings: number;
  hotel_name?: string;
  expense_category: number;
  expense_category_name?: string;
  expense_category_code?: string;
  expense_type: ExpenseType;
  expense_type_label?: string;
  cost_behavior: CostBehavior;
  cost_behavior_label?: string;
  payment_method: number | null;
  payment_method_name?: string;
  payment_method_code?: string;
  concept: string;
  description?: string | null;
  amount: string | number;
  expense_date: string;
  reference?: string | null;
  supplier_name?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseCreatePayloadI {
  hotel_settings: number;
  expense_category: number;
  expense_type: ExpenseType;
  cost_behavior: CostBehavior;
  payment_method: number | null;
  concept: string;
  description?: string | null;
  amount: number;
  expense_date: string;
  reference?: string | null;
  supplier_name?: string | null;
  is_active?: boolean;
}
