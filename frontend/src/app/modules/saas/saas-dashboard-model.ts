export type SaasHotelHealth = 'healthy' | 'warning' | 'risk';

export type SaasHotelSnapshot = {
  id: number;
  name: string;
  city: string;
  country: string;
  location: string;
  generalEmail: string;
  reservationsEmail: string;
  primaryPhone: string;
  hasContact: boolean;
  hasReservationsEmail: boolean;
  hasPhone: boolean;
  contactCompleteness: 'full' | 'partial' | 'none';
  lastUpdatedLabel: string;
  lastUpdatedDays: number | null;
  lastUpdatedAt: string | null;
  createdAt: string | null;
  health: SaasHotelHealth;
};

export type SaasCountrySummary = {
  country: string;
  hotels: number;
  ratio: number;
};

export type SaasDashboardSnapshot = {
  totals: {
    hotels: number;
    users: number;
    activeUsers: number;
    activeReservations: number;
    monthRevenue: number;
    openInvoices: number;
  };
  quality: {
    hotelsWithContact: number;
    hotelsWithoutContact: number;
    recentlyUpdatedHotels: number;
  };
  hotels: SaasHotelSnapshot[];
  countries: SaasCountrySummary[];
};
