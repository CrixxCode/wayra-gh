export type ReportTab = 'executive' | 'revenue' | 'occupancy' | 'services';

export interface ReportQueryParams {
  hotel_settings?: number;
  year?: number;
  start_date?: string;
  end_date?: string;
}

export interface IncomeConsolidatedQueryParams extends ReportQueryParams {
  period?: 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'THIS_YEAR';
  activity?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  method?: string;
  search?: string;
}

export interface ReportFilters {
  hotel_settings: number;
  year: number | null;
  start_date: string;
  end_date: string;
  generated_at: string;
}

export interface ValueWithVariationPct {
  value: number;
  variation_pct: number | null;
}

export interface ValueWithVariationPoints {
  value: number;
  variation_points: number | null;
}

export interface ValueWithVariationValue {
  value: number;
  variation_value: number | null;
}

export interface OccupancyPeak {
  value: number;
  month: string;
}

export interface MonthlyIncomeProfitItem {
  month: string;
  income: number;
  profit: number;
}

export interface WeeklyOccupancyItem {
  week: string;
  occupied_rooms: number;
  occupancy_rate_pct: number;
}

export interface PaymentMethodSummary {
  method: string;
  amount: number;
  pct: number;
}

export interface PaymentBreakdown {
  method: string;
  transactions_pct: number;
  amount: number;
  amount_pct: number;
}

export interface TopGuest {
  guest_name: string;
  country: string;
  stays: number;
  nights: number;
  total_spent: number;
  segment: string;
}

export interface GuestOriginItem {
  country: string;
  pct: number;
}

export interface MonthlyIncomeExpensesItem {
  month: string;
  income: number;
  expenses: number;
}

export interface MonthlyNetProfitItem {
  month: string;
  value: number;
}

export interface MonthlyOccupancyRateItem {
  month: string;
  pct: number;
}

export interface OccupiedRoomsByMonthItem {
  month: string;
  rooms: number;
}

export interface RoomTypePerformanceItem {
  room_type: string;
  occupancy_pct: number;
  avg_stay: number;
  income: number;
}

export interface TopCategory {
  name: string;
  amount: number;
}

export interface IncomeByCategoryItem {
  category: string;
  amount: number;
}

export interface TransactionsByCategoryItem {
  category: string;
  transactions: number;
}

export interface CategoryDetailItem {
  category: string;
  income: number;
  transactions: number;
  average_ticket: number;
  share_pct: number;
  trend_pct: number | null;
}

export interface ExecutiveKpis {
  annual_income: ValueWithVariationPct;
  net_profit: ValueWithVariationPct;
  average_occupancy: ValueWithVariationPct;
  revpar: ValueWithVariationPct;
}

export interface ExecutiveReportResponse {
  filters: ReportFilters;
  kpis: ExecutiveKpis;
  income_vs_profit_chart: MonthlyIncomeProfitItem[];
  payment_methods: PaymentMethodSummary[];
  weekly_occupancy: WeeklyOccupancyItem[];
  top_guests: TopGuest[];
}

export interface RevenueKpis {
  gross_income: ValueWithVariationPct;
  total_expenses: ValueWithVariationPct;
  net_profit: ValueWithVariationPct;
  net_margin: ValueWithVariationPoints;
}

export interface RevenueReportResponse {
  filters: ReportFilters;
  kpis: RevenueKpis;
  monthly_income_vs_expenses: MonthlyIncomeExpensesItem[];
  monthly_net_profit: MonthlyNetProfitItem[];
  payment_breakdown: PaymentBreakdown[];
  guest_origin: GuestOriginItem[];
}

export interface AverageStayKpi {
  value: number;
  variation_nights: number | null;
}

export interface TotalGuestsKpi {
  value: number;
  variation_pct: number | null;
}

export interface OccupancyKpis {
  average_occupancy: ValueWithVariationPct;
  occupancy_peak: OccupancyPeak;
  average_stay: AverageStayKpi;
  total_guests: TotalGuestsKpi;
}

export interface OccupancyReportResponse {
  filters: ReportFilters;
  kpis: OccupancyKpis;
  monthly_occupancy_rate: MonthlyOccupancyRateItem[];
  by_room_type: RoomTypePerformanceItem[];
  occupied_rooms_by_month: OccupiedRoomsByMonthItem[];
  room_type_performance: RoomTypePerformanceItem[];
}

export interface ServicesKpis {
  service_income: ValueWithVariationPct;
  transactions: ValueWithVariationPct;
  average_ticket: ValueWithVariationValue;
  top_category: TopCategory;
}

export interface ServicesReportResponse {
  filters: ReportFilters;
  kpis: ServicesKpis;
  income_by_category: IncomeByCategoryItem[];
  transactions_by_category: TransactionsByCategoryItem[];
  category_detail: CategoryDetailItem[];
}

export interface ReportDetailMetric {
  label: string;
  value: string;
}

export interface ReportDetailData {
  title: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'gold' | 'purple' | 'red';
  metrics: ReportDetailMetric[];
  note?: string;
}

export interface IncomeConsolidatedFilters {
  hotel_settings: number;
  period: string;
  activity: string;
  method: string;
  search: string;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  generated_at: string;
}

export interface IncomeConsolidatedSummary {
  total_transactions: number;
  active_transactions: number;
  total_collected: number;
  today_collected: number;
  month_collected: number;
  average_ticket: number;
}

export interface IncomeConsolidatedDailyRow {
  date_key: string;
  date_label: string;
  transactions: number;
  active_transactions: number;
  inactive_transactions: number;
  total_amount: number;
  average_ticket: number;
  top_method: string;
  top_guest: string;
}

export interface IncomeConsolidatedMethodRow {
  method_key: string;
  method_label: string;
  transactions: number;
  active_transactions: number;
  inactive_transactions: number;
  total_amount: number;
  average_ticket: number;
  share_percent: number;
}

export interface IncomeConsolidatedReportResponse {
  filters: IncomeConsolidatedFilters;
  summary: IncomeConsolidatedSummary;
  daily_rows: IncomeConsolidatedDailyRow[];
  method_rows: IncomeConsolidatedMethodRow[];
}
