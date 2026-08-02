import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { ServicesService } from '../../../services/service';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { CreateService } from '../create-service/create-service';
import { DetailService } from '../detail-service/detail-service';
import { ServiceI } from '../service-model';
import { UpdateService } from '../update-service/update-service';

type ServiceStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type ServiceCategoryTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type ServiceCatalogGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: ServiceCategoryTone;
  items: ServiceI[];
};

type ServiceTypeTab = {
  key: string;
  label: string;
  count: number;
  tone: ServiceCategoryTone;
};

const CATEGORY_TONES: Record<string, ServiceCategoryTone> = {
  RESTAURANTE: {
    icon: 'fa-solid fa-utensils',
    iconBg: '#fff3dc',
    iconColor: '#b45309',
    cover: 'linear-gradient(135deg, #6b4112 0%, #d28d3c 100%)',
    badgeBg: '#fff4dc',
    badgeColor: '#b45309',
    accent: '#f59e0b'
  },
  BAR: {
    icon: 'fa-solid fa-wine-glass',
    iconBg: '#efe9ff',
    iconColor: '#6d28d9',
    cover: 'linear-gradient(135deg, #2a2463 0%, #7c3aed 100%)',
    badgeBg: '#f3ecff',
    badgeColor: '#6d28d9',
    accent: '#8b5cf6'
  },
  SPA: {
    icon: 'fa-solid fa-spa',
    iconBg: '#ddfbff',
    iconColor: '#0e7490',
    cover: 'linear-gradient(135deg, #0f3b47 0%, #1fa8b8 100%)',
    badgeBg: '#ddfbff',
    badgeColor: '#0e7490',
    accent: '#06b6d4'
  },
  LAVANDERIA: {
    icon: 'fa-solid fa-shirt',
    iconBg: '#e7eeff',
    iconColor: '#1d4ed8',
    cover: 'linear-gradient(135deg, #1e3a8a 0%, #4f8ff5 100%)',
    badgeBg: '#e7eeff',
    badgeColor: '#1d4ed8',
    accent: '#3b82f6'
  },
  ROOMSERVICE: {
    icon: 'fa-solid fa-bell-concierge',
    iconBg: '#ffe9de',
    iconColor: '#c2410c',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: '#ffecdf',
    badgeColor: '#c2410c',
    accent: '#fb923c'
  },
  MINIBAR: {
    icon: 'fa-solid fa-bottle-water',
    iconBg: '#dcfdf2',
    iconColor: '#0f766e',
    cover: 'linear-gradient(135deg, #115e59 0%, #10b981 100%)',
    badgeBg: '#dcfdf2',
    badgeColor: '#0f766e',
    accent: '#10b981'
  },
  ACTIVIDADES: {
    icon: 'fa-solid fa-person-hiking',
    iconBg: '#ffe2ef',
    iconColor: '#be185d',
    cover: 'linear-gradient(135deg, #831843 0%, #ec4899 100%)',
    badgeBg: '#ffe4ef',
    badgeColor: '#be185d',
    accent: '#ec4899'
  },
  DEFAULT: {
    icon: 'fa-solid fa-concierge-bell',
    iconBg: '#e6edf7',
    iconColor: '#1f3f73',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: '#e6edf7',
    badgeColor: '#1f3f73',
    accent: '#335f9d'
  }
};

@Component({
  selector: 'app-list-services',
  standalone: true,
  imports: [CommonModule, FormsModule, CreateService, UpdateService, DetailService],
  templateUrl: './list-services.html',
  styleUrls: ['./list-services.css']
})
export class ListServices implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  showDeletedServices = false;

  services: ServiceI[] = [];
  deletedServices: ServiceI[] = [];
  filteredServices: ServiceI[] = [];
  groupedServices: ServiceCatalogGroup[] = [];
  serviceTypes: MasterDataI[] = [];
  typeTabs: ServiceTypeTab[] = [];

  search = '';
  statusFilter: ServiceStatusFilter = 'ALL';
  selectedTypeFilter = 'ALL';

  showCreateDrawer = false;
  showUpdateDrawer = false;
  selectedService: ServiceI | null = null;
  serviceToEdit: ServiceI | null = null;

  hotelSettingsId: number | null = null;

  readonly statusOptions: Array<{ value: ServiceStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos los estados' },
    { value: 'ACTIVE', label: 'Solo activos' },
    { value: 'INACTIVE', label: 'Solo inactivos' }
  ];

  private serviceTypeMap = new Map<number, MasterDataI>();
  private typeOrderMap = new Map<string, number>();
  private popularByGroup = new Map<string, Set<number>>();

  constructor(
    private servicesService: ServicesService,
    private masterDataService: MasterDataService,
    private hotelSettingsService: HotelSettingsService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalServices(): number {
    return this.services.length;
  }

  get deletedServicesCount(): number {
    return this.deletedServices.length;
  }

  get activeServices(): number {
    return this.services.filter((service) => service.is_active).length;
  }

  get inactiveServices(): number {
    return this.services.filter((service) => !service.is_active).length;
  }

  get categoryCount(): number {
    return this.typeTabs.length > 0 ? Math.max(this.typeTabs.length - 1, 0) : 0;
  }

  get averagePriceLabel(): string {
    if (!this.services.length) return this.formatCurrency(0);
    const total = this.services.reduce((sum, service) => sum + this.toPriceNumber(service.base_price), 0);
    const average = total / this.services.length;
    return this.formatCurrency(average);
  }

  get topCategoryLabel(): string {
    const tabsWithoutAll = this.typeTabs.filter((tab) => tab.key !== 'ALL');
    if (!tabsWithoutAll.length) return 'Sin categoria';

    const [winner] = [...tabsWithoutAll].sort((a, b) => b.count - a.count);
    return winner?.label || 'Sin categoria';
  }

  get topCategoryCount(): number {
    const tabsWithoutAll = this.typeTabs.filter((tab) => tab.key !== 'ALL');
    if (!tabsWithoutAll.length) return 0;

    const [winner] = [...tabsWithoutAll].sort((a, b) => b.count - a.count);
    return winner?.count || 0;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedServiceId = this.selectedService?.id ?? null;
    const serviceToEditId = this.serviceToEdit?.id ?? null;

    forkJoin({
      services: this.servicesService
        .listServices({ include_inactive: true })
        .pipe(catchError(() => of([] as ServiceI[]))),
      allServices: this.servicesService
        .listServices({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as ServiceI[]))),
      serviceTypes: this.masterDataService
        .listMasterData({ group: 'SERVICE_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ services, allServices, serviceTypes, settings }) => {
        this.loading = false;
        this.services = services;
        const visibleIds = new Set(services.map((service) => service.id));
        this.deletedServices = allServices.filter((service) => !visibleIds.has(service.id));
        this.serviceTypes = serviceTypes;

        if (selectedServiceId) {
          this.selectedService = services.find((service) => service.id === selectedServiceId) || null;
        }

        if (serviceToEditId) {
          this.serviceToEdit = services.find((service) => service.id === serviceToEditId) || null;
          if (!this.serviceToEdit) this.showUpdateDrawer = false;
        }

        this.buildTypeMaps();
        this.hotelSettingsId = this.resolveHotelSettingsId(settings, services, this.hotelSettingsId);
        this.typeTabs = this.buildTypeTabs(this.services);
        this.applyFilters();

        this.infoMessage = this.hotelSettingsId
          ? ''
          : 'No se encontro una configuracion activa de hotel. Podras ver servicios, pero no crear nuevos.';
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el catalogo de servicios.';
      }
    });
  }

  refreshServices(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredServices.length) return;

    const headers = ['nombre', 'descripcion', 'tipo', 'precio_base', 'unidad', 'estado'];

    const rows = this.filteredServices.map((service) => {
      const row = [
        service.name || '',
        this.getServiceDescription(service),
        this.getServiceTypeLabel(service),
        this.toPriceNumber(service.base_price),
        this.getUnitLabel(service),
        service.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicios-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredServices = this.services.filter((service) => {
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && service.is_active) ||
        (this.statusFilter === 'INACTIVE' && !service.is_active);

      const typeMatch =
        this.selectedTypeFilter === 'ALL' ||
        this.getServiceTypeKey(service) === this.selectedTypeFilter;

      const searchPool = [
        service.name,
        service.description || '',
        this.getServiceTypeLabel(service),
        service.service_type_code || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && typeMatch && searchMatch;
    });

    this.groupedServices = this.buildGroups(this.filteredServices);
  }

  selectTypeFilter(tabKey: string): void {
    this.selectedTypeFilter = tabKey;
    this.applyFilters();
  }

  openCreateDrawer(): void {
    this.selectedService = null;
    this.serviceToEdit = null;
    this.showUpdateDrawer = false;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onServiceCreated(): void {
    this.showCreateDrawer = false;
    this.refreshServices();
  }

  openDetail(service: ServiceI): void {
    this.showCreateDrawer = false;
    this.showUpdateDrawer = false;
    this.serviceToEdit = null;
    this.selectedService = service;
  }

  closeDetail(): void {
    this.selectedService = null;
  }

  openUpdateDrawer(service: ServiceI): void {
    this.selectedService = null;
    this.showCreateDrawer = false;
    this.serviceToEdit = service;
    this.showUpdateDrawer = true;
  }

  openUpdateFromDetail(service: ServiceI): void {
    this.closeDetail();
    this.openUpdateDrawer(service);
  }

  closeUpdateDrawer(): void {
    this.showUpdateDrawer = false;
    this.serviceToEdit = null;
  }

  onServiceUpdated(): void {
    this.showUpdateDrawer = false;
    this.serviceToEdit = null;
    this.refreshServices();
  }

  toggleServiceStatus(service: ServiceI): void {
    this.errorMessage = '';
    this.servicesService
      .updateService(service.id, { is_active: !service.is_active })
      .subscribe({
        next: () => {
          this.refreshServices();
        },
        error: () => {
          this.errorMessage = 'No fue posible actualizar el estado del servicio.';
        }
      });
  }

  confirmDelete(service: ServiceI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: service.name || 'servicio',
      onAccept: () => {
        this.errorMessage = '';
        this.servicesService.deleteService(service.id).subscribe({
          next: () => {
            if (this.selectedService?.id === service.id) {
              this.closeDetail();
            }
            if (this.serviceToEdit?.id === service.id) {
              this.closeUpdateDrawer();
            }
            this.refreshServices();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar el servicio seleccionado.';
          }
        });
      }
    });
  }

  restoreService(service: ServiceI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: service.name || 'servicio',
      onAccept: () => {
        this.errorMessage = '';
        this.servicesService.restoreService(service.id).subscribe({
          next: () => {
            this.refreshServices();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el servicio seleccionado.';
          }
        });
      }
    });
  }

  getServiceTypeLabel(service: ServiceI): string {
    const serviceType = this.getTypeByService(service);
    if (serviceType?.name) return serviceType.name;
    if (service.service_type_name) return service.service_type_name;
    if (service.service_type_code) return service.service_type_code;
    return 'Sin tipo';
  }

  getServiceDescription(service: ServiceI): string {
    const description = service.description?.trim();
    if (description) return description;
    return 'Servicio sin descripcion operativa.';
  }

  getPriceLabel(service: ServiceI): string {
    return this.formatCurrency(this.toPriceNumber(service.base_price));
  }

  getUnitLabel(service: ServiceI): string {
    const serviceType = this.getTypeByService(service);
    const metadataUnit = this.readMetadataString(serviceType, ['unit_label', 'unit', 'pricing_unit']);
    if (metadataUnit) return metadataUnit;

    const code = this.getServiceTypeCode(service);
    if (code === 'RESTAURANTE') return 'persona';
    if (code === 'BAR') return 'copa';
    if (code === 'SPA') return 'sesion';
    if (code === 'LAVANDERIA') return 'prenda';
    if (code === 'ROOMSERVICE') return 'servicio';
    if (code === 'MINIBAR') return 'unidad';
    if (code === 'ACTIVIDADES') return 'persona';
    return 'servicio';
  }

  getGroupTone(group: ServiceCatalogGroup): ServiceCategoryTone {
    return group.tone;
  }

  getStatusTone(service: ServiceI): { bg: string; color: string; dot: string } {
    if (service.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong-alt)'
      };
    }
    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  isPopular(groupKey: string, serviceId: number): boolean {
    return this.popularByGroup.get(groupKey)?.has(serviceId) || false;
  }

  trackByService(_: number, service: ServiceI): number {
    return service.id;
  }

  trackByGroup(_: number, group: ServiceCatalogGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: ServiceTypeTab): string {
    return tab.key;
  }

  private buildTypeMaps(): void {
    this.serviceTypeMap = new Map(this.serviceTypes.map((serviceType) => [serviceType.id, serviceType]));

    this.typeOrderMap.clear();
    for (const serviceType of this.serviceTypes) {
      const key = this.getTypeKeyFromType(serviceType);
      this.typeOrderMap.set(key, Number(serviceType.sort_order || 0));
    }
  }

  private buildTypeTabs(services: ServiceI[]): ServiceTypeTab[] {
    const groups = this.buildGroups(services, false);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: services.length,
        tone: CATEGORY_TONES['DEFAULT']
      },
      ...groups.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.items.length,
        tone: group.tone
      }))
    ];
  }

  private buildGroups(services: ServiceI[], updatePopular = true): ServiceCatalogGroup[] {
    const groupsMap = new Map<string, ServiceCatalogGroup>();

    for (const service of services) {
      const key = this.getServiceTypeKey(service);
      const label = this.getServiceTypeLabel(service);
      const code = this.getServiceTypeCode(service);
      const tone = this.resolveTone(code);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          code,
          tone,
          order: this.resolveTypeOrder(service, key),
          items: []
        });
      }

      groupsMap.get(key)?.items.push(service);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    if (updatePopular) {
      this.popularByGroup.clear();
      for (const group of groups) {
        const sortedByPrice = [...group.items].sort(
          (a, b) => this.toPriceNumber(b.base_price) - this.toPriceNumber(a.base_price)
        );
        const popularSize = sortedByPrice.length >= 4 ? 2 : 1;
        this.popularByGroup.set(
          group.key,
          new Set(sortedByPrice.slice(0, popularSize).map((service) => service.id))
        );
      }
    }

    return groups;
  }

  private resolveTypeOrder(service: ServiceI, typeKey: string): number {
    const fromTypeMap = this.typeOrderMap.get(typeKey);
    if (typeof fromTypeMap === 'number') return fromTypeMap;

    const fallbackType = this.getTypeByService(service);
    if (fallbackType && typeof fallbackType.sort_order === 'number') {
      return fallbackType.sort_order;
    }

    return 999;
  }

  private resolveTone(code: string): ServiceCategoryTone {
    return CATEGORY_TONES[code] || CATEGORY_TONES['DEFAULT'];
  }

  private getTypeByService(service: ServiceI): MasterDataI | null {
    if (typeof service.service_type !== 'number') return null;
    return this.serviceTypeMap.get(service.service_type) || null;
  }

  private getTypeKeyFromType(serviceType: MasterDataI): string {
    return `id:${serviceType.id}`;
  }

  private getServiceTypeKey(service: ServiceI): string {
    if (typeof service.service_type === 'number') {
      return `id:${service.service_type}`;
    }

    const code = this.getServiceTypeCode(service);
    if (code) return `code:${code}`;

    return 'untyped';
  }

  private getServiceTypeCode(service: ServiceI): string {
    const serviceType = this.getTypeByService(service);
    const rawCode = serviceType?.code || service.service_type_code || this.getServiceTypeLabel(service);
    return this.normalizeCode(rawCode);
  }

  private resolveHotelSettingsId(
    settings: { id?: number } | null,
    services: ServiceI[],
    current: number | null
  ): number | null {
    const fromSettings = Number(settings?.id || 0);
    if (fromSettings > 0) return fromSettings;

    if (typeof current === 'number' && current > 0) return current;

    const fromServices = services.find((service) => Number(service.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromServices === 'number' && fromServices > 0) return fromServices;

    return null;
  }

  private readMetadataString(serviceType: MasterDataI | null, keys: string[]): string | null {
    if (!serviceType?.metadata || typeof serviceType.metadata !== 'object') return null;

    for (const key of keys) {
      const value = (serviceType.metadata as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private toPriceNumber(value: string | number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
  }

  private normalizeCode(value: string): string {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private normalizeSearch(value: string): string {
    return String(value || '').trim().toLowerCase();
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
