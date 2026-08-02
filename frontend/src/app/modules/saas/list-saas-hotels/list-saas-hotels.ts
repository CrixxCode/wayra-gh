import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { AuthService, isEffectivePlatformAdmin } from '../../../services/auth/auth';
import { SaasDashboardService } from '../../../services/saas-dashboard';
import { SaasHotelSnapshot } from '../saas-dashboard-model';

type SaasHotelsKpiCard = {
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
};

@Component({
  selector: 'app-list-saas-hotels',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './list-saas-hotels.html',
  styleUrls: ['./list-saas-hotels.css'],
})
export class ListSaasHotels implements OnInit {
  loading = true;
  loadError = '';
  isPlatformAdmin = false;

  hotels: SaasHotelSnapshot[] = [];
  filteredHotels: SaasHotelSnapshot[] = [];
  paginatedHotels: SaasHotelSnapshot[] = [];

  search = '';
  healthFilter: 'ALL' | SaasHotelSnapshot['health'] = 'ALL';
  contactFilter: 'ALL' | SaasHotelSnapshot['contactCompleteness'] = 'ALL';
  countryFilter = 'ALL';

  countryOptions: string[] = [];

  currentPage = 1;
  perPage = 10;
  totalPages = 0;

  statCards: SaasHotelsKpiCard[] = [];

  constructor(
    private authService: AuthService,
    private saasDashboardService: SaasDashboardService
  ) {}

  ngOnInit(): void {
    this.loadHotels();
  }

  loadHotels(): void {
    this.loading = true;
    this.loadError = '';

    this.authService
      .getUserInfo()
      .pipe(
        switchMap((user) => {
          this.isPlatformAdmin = isEffectivePlatformAdmin(user);
          if (!this.isPlatformAdmin) {
            return of([] as SaasHotelSnapshot[]);
          }
          return this.saasDashboardService.getHotelsDirectory();
        }),
        catchError(() => {
          this.loadError = 'No fue posible cargar el listado global de hoteles.';
          return of([] as SaasHotelSnapshot[]);
        })
      )
      .subscribe((rows) => {
        if (this.isPlatformAdmin && !this.loadError) {
          this.hotels = rows;
          this.countryOptions = this.buildCountryOptions(rows);
          this.updateStats();
          this.applyFilters();
        } else {
          this.hotels = [];
          this.filteredHotels = [];
          this.paginatedHotels = [];
          this.totalPages = 0;
          this.statCards = [];
        }

        this.loading = false;
      });
  }

  applyFilters(): void {
    const query = this.search.trim().toLowerCase();

    this.filteredHotels = this.hotels.filter((hotel) => {
      const matchesSearch =
        !query ||
        hotel.name.toLowerCase().includes(query) ||
        hotel.location.toLowerCase().includes(query) ||
        hotel.generalEmail.toLowerCase().includes(query) ||
        hotel.reservationsEmail.toLowerCase().includes(query) ||
        hotel.primaryPhone.toLowerCase().includes(query) ||
        String(hotel.id).includes(query);

      const matchesHealth = this.healthFilter === 'ALL' || hotel.health === this.healthFilter;
      const matchesContact =
        this.contactFilter === 'ALL' || hotel.contactCompleteness === this.contactFilter;
      const matchesCountry =
        this.countryFilter === 'ALL' || hotel.country.toLowerCase() === this.countryFilter.toLowerCase();

      return matchesSearch && matchesHealth && matchesContact && matchesCountry;
    });

    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredHotels.length / this.perPage);

    if (this.totalPages === 0) {
      this.paginatedHotels = [];
      this.currentPage = 1;
      return;
    }

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    const start = (this.currentPage - 1) * this.perPage;
    const end = start + this.perPage;
    this.paginatedHotels = this.filteredHotels.slice(start, end);
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.updatePagination();
  }

  exportCsv(): void {
    if (!this.filteredHotels.length) return;

    const headers = [
      'id',
      'hotel',
      'ciudad',
      'pais',
      'correo_general',
      'correo_reservas',
      'telefono',
      'contacto',
      'salud',
      'ultima_actualizacion',
    ];

    const rows = this.filteredHotels.map((hotel) =>
      [
        hotel.id,
        hotel.name,
        hotel.city || '',
        hotel.country || '',
        hotel.generalEmail || '',
        hotel.reservationsEmail || '',
        hotel.primaryPhone || '',
        this.getContactLabel(hotel.contactCompleteness),
        this.getHealthLabel(hotel.health),
        this.formatDate(hotel.lastUpdatedAt) || hotel.lastUpdatedLabel,
      ]
        .map((cell) => this.escapeCsvCell(cell))
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saas-hoteles-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  getHealthLabel(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'Saludable';
    if (value === 'warning') return 'Observacion';
    return 'Riesgo';
  }

  getContactLabel(value: SaasHotelSnapshot['contactCompleteness']): string {
    if (value === 'full') return 'Completo';
    if (value === 'partial') return 'Parcial';
    return 'Sin contacto';
  }

  getHealthClass(value: SaasHotelSnapshot['health']): string {
    if (value === 'healthy') return 'ok';
    if (value === 'warning') return 'warn';
    return 'risk';
  }

  getContactClass(value: SaasHotelSnapshot['contactCompleteness']): string {
    if (value === 'full') return 'ok';
    if (value === 'partial') return 'warn';
    return 'risk';
  }

  formatDate(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  trackByHotel(index: number, hotel: SaasHotelSnapshot): number {
    return hotel.id;
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  get showingFrom(): number {
    if (!this.filteredHotels.length) return 0;
    return (this.currentPage - 1) * this.perPage + 1;
  }

  get showingTo(): number {
    if (!this.filteredHotels.length) return 0;
    return Math.min(this.currentPage * this.perPage, this.filteredHotels.length);
  }

  private updateStats(): void {
    const total = this.hotels.length;
    const healthy = this.hotels.filter((hotel) => hotel.health === 'healthy').length;
    const risk = this.hotels.filter((hotel) => hotel.health === 'risk').length;
    const noContact = this.hotels.filter((hotel) => hotel.contactCompleteness === 'none').length;

    this.statCards = [
      {
        label: 'Hoteles registrados',
        value: this.formatInteger(total),
        note: `${this.countryOptions.length} paises en servicio`,
        icon: 'fa-solid fa-hotel',
        tone: 'blue',
      },
      {
        label: 'Saludables',
        value: this.formatInteger(healthy),
        note: 'Configuracion y contacto completos',
        icon: 'fa-solid fa-shield-heart',
        tone: 'green',
      },
      {
        label: 'En riesgo',
        value: this.formatInteger(risk),
        note: 'Requieren intervencion prioritaria',
        icon: 'fa-solid fa-triangle-exclamation',
        tone: 'red',
      },
      {
        label: 'Sin contacto',
        value: this.formatInteger(noContact),
        note: 'Sin email ni telefono operativo',
        icon: 'fa-solid fa-address-book',
        tone: 'amber',
      },
    ];
  }

  private buildCountryOptions(rows: SaasHotelSnapshot[]): string[] {
    return [...new Set(rows.map((hotel) => hotel.country.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }

  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value || 0);
  }

  private formatFileDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private escapeCsvCell(value: unknown): string {
    const normalized = String(value ?? '');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }
}
