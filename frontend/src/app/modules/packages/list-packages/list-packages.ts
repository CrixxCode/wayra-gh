import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { PackagesService } from '../../../services/package';
import { RoomService } from '../../../services/room';
import { ServicesService } from '../../../services/service';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { ServiceI } from '../../services/service-model';
import { CreatePackage } from '../create-package/create-package';
import { DetailPackage } from '../detail-package/detail-package';
import { PackageI, PackageServiceI } from '../package-model';
import { UpdatePackage } from '../update-package/update-package';
import { RoomTypeI } from '../../rooms/room-model';

type PackageStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

type PackageCategoryTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type PackageGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: PackageCategoryTone;
  items: PackageI[];
};

type PackageCategoryTab = {
  key: string;
  label: string;
  count: number;
  tone: PackageCategoryTone;
};

const CATEGORY_TONES: Record<string, PackageCategoryTone> = {
  ROMANTICO: {
    icon: 'fa-regular fa-star',
    iconBg: 'var(--gh-status-violet-bg)',
    iconColor: 'var(--gh-status-violet-text)',
    cover: 'linear-gradient(135deg, #7a1d47 0%, #db2777 100%)',
    badgeBg: 'var(--gh-status-violet-bg)',
    badgeColor: 'var(--gh-status-violet-text)',
    accent: 'var(--gh-status-violet-text)'
  },
  FAMILIAR: {
    icon: 'fa-solid fa-people-roof',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #11406b 0%, #0ea5e9 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  CORPORATIVO: {
    icon: 'fa-solid fa-briefcase',
    iconBg: 'var(--gh-status-neutral-bg)',
    iconColor: 'var(--gh-status-neutral-text)',
    cover: 'linear-gradient(135deg, #263344 0%, #64748b 100%)',
    badgeBg: 'var(--gh-status-neutral-bg)',
    badgeColor: 'var(--gh-status-neutral-text)',
    accent: 'var(--gh-text-muted)'
  },
  BIENESTAR: {
    icon: 'fa-solid fa-spa',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #0f3b47 0%, #06b6d4 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  AVENTURA: {
    icon: 'fa-solid fa-mountain-sun',
    iconBg: 'var(--gh-status-orange-bg)',
    iconColor: 'var(--gh-status-orange-text)',
    cover: 'linear-gradient(135deg, #7c3e12 0%, #fb923c 100%)',
    badgeBg: 'var(--gh-status-orange-bg)',
    badgeColor: 'var(--gh-status-orange-text)',
    accent: 'var(--gh-status-orange-strong)'
  },
  TEMPORADA: {
    icon: 'fa-regular fa-snowflake',
    iconBg: 'var(--gh-status-violet-bg)',
    iconColor: 'var(--gh-status-violet-text)',
    cover: 'linear-gradient(135deg, #2a2463 0%, #8b5cf6 100%)',
    badgeBg: 'var(--gh-status-violet-bg)',
    badgeColor: 'var(--gh-status-violet-text)',
    accent: 'var(--gh-status-violet-text)'
  },
  DESAYUNO: {
    icon: 'fa-solid fa-utensils',
    iconBg: 'var(--gh-status-success-bg)',
    iconColor: 'var(--gh-status-success-text)',
    cover: 'linear-gradient(135deg, #14532d 0%, #22c55e 100%)',
    badgeBg: 'var(--gh-status-success-bg)',
    badgeColor: 'var(--gh-status-success-text)',
    accent: 'var(--gh-status-success-strong)'
  },
  DEFAULT: {
    icon: 'fa-solid fa-box-open',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  }
};

@Component({
  selector: 'app-list-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, CreatePackage, UpdatePackage, DetailPackage],
  templateUrl: './list-packages.html',
  styleUrls: ['./list-packages.css']
})
export class ListPackages implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  showDeletedPackages = false;

  packages: PackageI[] = [];
  deletedPackages: PackageI[] = [];
  filteredPackages: PackageI[] = [];
  groupedPackages: PackageGroup[] = [];

  roomTypes: RoomTypeI[] = [];
  services: ServiceI[] = [];
  categoryTabs: PackageCategoryTab[] = [];

  search = '';
  statusFilter: PackageStatusFilter = 'ALL';
  selectedCategoryFilter = 'ALL';

  showCreateDrawer = false;
  showUpdateDrawer = false;
  selectedPackage: PackageI | null = null;
  packageToEdit: PackageI | null = null;

  hotelSettingsId: number | null = null;

  readonly statusOptions: Array<{ value: PackageStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' }
  ];

  private roomTypeMap = new Map<number, RoomTypeI>();
  private roomTypeOrderMap = new Map<string, number>();
  private featuredByGroup = new Map<string, Set<number>>();

  constructor(
    private packagesService: PackagesService,
    private servicesService: ServicesService,
    private roomService: RoomService,
    private hotelSettingsService: HotelSettingsService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalPackages(): number {
    return this.packages.length;
  }

  get deletedPackagesCount(): number {
    return this.deletedPackages.length;
  }

  get activePackages(): number {
    return this.packages.filter((pkg) => pkg.is_active).length;
  }

  get featuredPackages(): number {
    let total = 0;
    for (const ids of this.featuredByGroup.values()) {
      total += ids.size;
    }
    return total;
  }

  get packagesWithServices(): number {
    return this.packages.filter((pkg) => this.getPackageServices(pkg).length > 0).length;
  }

  get averagePriceLabel(): string {
    if (!this.packages.length) return this.formatCurrency(0);
    const total = this.packages.reduce((sum, pkg) => sum + this.toPriceNumber(pkg.base_price), 0);
    return this.formatCurrency(total / this.packages.length);
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    const selectedPackageId = this.selectedPackage?.id ?? null;
    const packageToEditId = this.packageToEdit?.id ?? null;

    forkJoin({
      packages: this.packagesService
        .listPackages({ include_inactive: true })
        .pipe(catchError(() => of([] as PackageI[]))),
      allPackages: this.packagesService
        .listPackages({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as PackageI[]))),
      roomTypes: this.roomService
        .listRoomTypes({ ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as RoomTypeI[]))),
      servicesCatalog: this.servicesService
        .listServices({ include_inactive: true })
        .pipe(catchError(() => of([] as ServiceI[]))),
      packageServices: this.packagesService
        .listPackageServices({ ordering: 'id' })
        .pipe(catchError(() => of([] as PackageServiceI[]))),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ packages, allPackages, roomTypes, servicesCatalog, packageServices, settings }) => {
        this.loading = false;
        this.packages = packages;
        const visibleIds = new Set(packages.map((pkg) => pkg.id));
        this.deletedPackages = allPackages.filter((pkg) => !visibleIds.has(pkg.id));
        this.roomTypes = roomTypes;
        const effectivePackageServices = this.getEffectivePackageServices(packages, packageServices);
        this.services = this.mergeServicesCatalog(servicesCatalog, packages, effectivePackageServices);

        if (selectedPackageId) {
          this.selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId) || null;
        }

        if (packageToEditId) {
          this.packageToEdit = packages.find((pkg) => pkg.id === packageToEditId) || null;
          if (!this.packageToEdit) this.showUpdateDrawer = false;
        }

        this.buildRoomTypeMaps();
        this.hotelSettingsId = this.resolveHotelSettingsId(
          settings,
          packages,
          this.services,
          effectivePackageServices,
          this.hotelSettingsId
        );
        this.categoryTabs = this.buildCategoryTabs(this.packages);
        this.applyFilters();

        this.infoMessage = this.hotelSettingsId
          ? ''
          : 'No se encontro una configuracion activa de hotel. Podras ver paquetes, pero no crear nuevos.';
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el catalogo de paquetes.';
      }
    });
  }

  refreshPackages(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredPackages.length) return;

    const headers = [
      'nombre',
      'descripcion',
      'categoria',
      'servicios',
      'precio_base',
      'fecha_inicio',
      'fecha_fin',
      'estado'
    ];

    const rows = this.filteredPackages.map((pkg) => {
      const services = this.getPackageServices(pkg)
        .map((service) => service.service_name || `Servicio #${service.service}`)
        .join(' | ');

      const row = [
        pkg.name || '',
        pkg.description || '',
        this.getCategoryLabel(pkg),
        services,
        this.toPriceNumber(pkg.base_price),
        pkg.start_date || '',
        pkg.end_date || '',
        pkg.is_active ? 'Activo' : 'Inactivo'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `paquetes-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredPackages = this.packages.filter((pkg) => {
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && pkg.is_active) ||
        (this.statusFilter === 'INACTIVE' && !pkg.is_active);

      const categoryMatch =
        this.selectedCategoryFilter === 'ALL' ||
        this.getPackageCategoryKey(pkg) === this.selectedCategoryFilter;

      const serviceNames = this.getPackageServices(pkg)
        .map((packageService) => packageService.service_name || '')
        .join(' ');

      const searchPool = [
        pkg.name,
        pkg.description || '',
        this.getCategoryLabel(pkg),
        pkg.room_type_code || '',
        serviceNames
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);
      return statusMatch && categoryMatch && searchMatch;
    });

    this.groupedPackages = this.buildGroups(this.filteredPackages);
  }

  selectCategoryFilter(tabKey: string): void {
    this.selectedCategoryFilter = tabKey;
    this.applyFilters();
  }

  openCreateDrawer(): void {
    this.selectedPackage = null;
    this.packageToEdit = null;
    this.showUpdateDrawer = false;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onPackageCreated(): void {
    this.showCreateDrawer = false;
    this.refreshPackages();
  }

  openDetail(pkg: PackageI): void {
    this.showCreateDrawer = false;
    this.showUpdateDrawer = false;
    this.packageToEdit = null;
    this.selectedPackage = pkg;
  }

  closeDetail(): void {
    this.selectedPackage = null;
  }

  openUpdateDrawer(pkg: PackageI): void {
    this.selectedPackage = null;
    this.showCreateDrawer = false;
    this.packageToEdit = pkg;
    this.showUpdateDrawer = true;
  }

  openUpdateFromDetail(pkg: PackageI): void {
    this.closeDetail();
    this.openUpdateDrawer(pkg);
  }

  closeUpdateDrawer(): void {
    this.showUpdateDrawer = false;
    this.packageToEdit = null;
  }

  onPackageUpdated(): void {
    this.showUpdateDrawer = false;
    this.packageToEdit = null;
    this.refreshPackages();
  }

  togglePackageStatus(pkg: PackageI): void {
    this.errorMessage = '';
    this.packagesService.updatePackage(pkg.id, { is_active: !pkg.is_active }).subscribe({
      next: () => {
        this.refreshPackages();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar el estado del paquete.';
      }
    });
  }

  confirmDelete(pkg: PackageI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: pkg.name || 'paquete',
      onAccept: () => {
        this.errorMessage = '';
        this.packagesService.deletePackage(pkg.id).subscribe({
          next: () => {
            if (this.selectedPackage?.id === pkg.id) this.closeDetail();
            if (this.packageToEdit?.id === pkg.id) this.closeUpdateDrawer();
            this.refreshPackages();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar el paquete seleccionado.';
          }
        });
      }
    });
  }

  restorePackage(pkg: PackageI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: pkg.name || 'paquete',
      onAccept: () => {
        this.errorMessage = '';
        this.packagesService.restorePackage(pkg.id).subscribe({
          next: () => {
            this.refreshPackages();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar el paquete seleccionado.';
          }
        });
      }
    });
  }

  getCategoryLabel(pkg: PackageI): string {
    const roomType = this.getRoomTypeByPackage(pkg);
    if (roomType?.name) return roomType.name;
    if (pkg.room_type_name) return pkg.room_type_name;
    if (pkg.room_type_code) return pkg.room_type_code;
    return 'General';
  }

  getPackageServices(pkg: PackageI): PackageServiceI[] {
    return Array.isArray(pkg.package_services) ? pkg.package_services : [];
  }

  getVisibleServiceTags(pkg: PackageI): PackageServiceI[] {
    return this.getPackageServices(pkg).slice(0, 3);
  }

  getHiddenServiceCount(pkg: PackageI): number {
    const total = this.getPackageServices(pkg).length;
    return Math.max(total - 3, 0);
  }

  getDateRangeLabel(pkg: PackageI): string {
    const start = this.formatDate(pkg.start_date);
    const end = this.formatDate(pkg.end_date);
    if (!pkg.start_date && !pkg.end_date) return 'Sin vigencia definida';
    return `${start} - ${end}`;
  }

  getValidityState(pkg: PackageI): 'VIGENTE' | 'PROXIMO' | 'FUERA' | 'SIN_FECHA' {
    const start = this.parseDate(pkg.start_date);
    const end = this.parseDate(pkg.end_date);
    const today = this.startOfDay(new Date());

    if (!start && !end) return 'SIN_FECHA';
    if (start && start > today) return 'PROXIMO';
    if (end && end < today) return 'FUERA';
    return 'VIGENTE';
  }

  getValidityLabel(pkg: PackageI): string {
    const state = this.getValidityState(pkg);
    if (state === 'VIGENTE') return 'Vigente';
    if (state === 'PROXIMO') return 'Proximo';
    if (state === 'FUERA') return 'Fuera de fecha';
    return 'Sin fecha';
  }

  getValidityTone(pkg: PackageI): { bg: string; color: string } {
    const state = this.getValidityState(pkg);
    if (state === 'VIGENTE') return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    if (state === 'PROXIMO') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    if (state === 'FUERA') return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
    return { bg: 'var(--gh-status-neutral-bg)', color: 'var(--gh-status-neutral-text)' };
  }

  getStatusTone(pkg: PackageI): { bg: string; color: string; dot: string } {
    if (pkg.is_active) {
      return {
        bg: 'var(--gh-status-success-bg)',
        color: 'var(--gh-status-success-text)',
        dot: 'var(--gh-status-success-strong)'
      };
    }

    return {
      bg: 'var(--gh-status-neutral-bg)',
      color: 'var(--gh-status-neutral-text)',
      dot: 'var(--gh-text-soft)'
    };
  }

  getCategoryTone(group: PackageGroup): PackageCategoryTone {
    return group.tone;
  }

  isFeatured(groupKey: string, packageId: number): boolean {
    return this.featuredByGroup.get(groupKey)?.has(packageId) || false;
  }

  getPriceLabel(pkg: PackageI): string {
    return this.formatCurrency(this.toPriceNumber(pkg.base_price));
  }

  trackByPackage(_: number, pkg: PackageI): number {
    return pkg.id;
  }

  trackByGroup(_: number, group: PackageGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: PackageCategoryTab): string {
    return tab.key;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  private buildRoomTypeMaps(): void {
    this.roomTypeMap = new Map(this.roomTypes.map((roomType) => [roomType.id, roomType]));

    this.roomTypeOrderMap.clear();
    for (const roomType of this.roomTypes) {
      const key = this.getCategoryKeyFromRoomType(roomType);
      this.roomTypeOrderMap.set(key, Number(roomType.sort_order || 0));
    }
  }

  private buildCategoryTabs(packages: PackageI[]): PackageCategoryTab[] {
    const groups = this.buildGroups(packages, false);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: packages.length,
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

  private buildGroups(packages: PackageI[], updateFeatured = true): PackageGroup[] {
    const mapGroups = new Map<string, PackageGroup>();

    for (const pkg of packages) {
      const key = this.getPackageCategoryKey(pkg);
      const label = this.getCategoryLabel(pkg);
      const code = this.getCategoryCode(pkg);
      const tone = this.resolveTone(code);

      if (!mapGroups.has(key)) {
        mapGroups.set(key, {
          key,
          label,
          code,
          tone,
          order: this.resolveCategoryOrder(pkg, key),
          items: []
        });
      }

      mapGroups.get(key)?.items.push(pkg);
    }

    const groups = Array.from(mapGroups.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    if (updateFeatured) {
      this.featuredByGroup.clear();
      for (const group of groups) {
        const sortedByPrice = [...group.items].sort(
          (a, b) => this.toPriceNumber(b.base_price) - this.toPriceNumber(a.base_price)
        );
        const featuredCount = sortedByPrice.length >= 4 ? 2 : sortedByPrice.length ? 1 : 0;
        this.featuredByGroup.set(
          group.key,
          new Set(sortedByPrice.slice(0, featuredCount).map((pkg) => pkg.id))
        );
      }
    }

    return groups;
  }

  private resolveCategoryOrder(pkg: PackageI, key: string): number {
    const fromMap = this.roomTypeOrderMap.get(key);
    if (typeof fromMap === 'number') return fromMap;

    const roomType = this.getRoomTypeByPackage(pkg);
    if (roomType && typeof roomType.sort_order === 'number') return roomType.sort_order;

    return 999;
  }

  private getRoomTypeByPackage(pkg: PackageI): RoomTypeI | null {
    if (typeof pkg.room_type !== 'number') return null;
    return this.roomTypeMap.get(pkg.room_type) || null;
  }

  private getCategoryKeyFromRoomType(roomType: RoomTypeI): string {
    return `id:${roomType.id}`;
  }

  private getPackageCategoryKey(pkg: PackageI): string {
    if (typeof pkg.room_type === 'number') return `id:${pkg.room_type}`;

    const code = this.getCategoryCode(pkg);
    if (code) return `code:${code}`;

    return 'untyped';
  }

  private getCategoryCode(pkg: PackageI): string {
    const roomType = this.getRoomTypeByPackage(pkg);
    const rawCode = roomType?.code || pkg.room_type_code || this.getCategoryLabel(pkg);
    return this.normalizeCode(rawCode);
  }

  private resolveTone(code: string): PackageCategoryTone {
    return CATEGORY_TONES[code] || CATEGORY_TONES['DEFAULT'];
  }

  private resolveHotelSettingsId(
    settings: { id?: number } | null,
    packages: PackageI[],
    services: ServiceI[],
    packageServices: PackageServiceI[],
    current: number | null
  ): number | null {
    const fromSettings = Number(settings?.id || 0);
    if (fromSettings > 0) return fromSettings;

    if (typeof current === 'number' && current > 0) return current;

    const fromPackages = packages.find((pkg) => Number(pkg.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromPackages === 'number' && fromPackages > 0) return fromPackages;

    const fromServices = services.find((service) => Number(service.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromServices === 'number' && fromServices > 0) return fromServices;

    const packageHotelMap = new Map<number, number>();
    for (const pkg of packages) {
      packageHotelMap.set(Number(pkg.id), Number(pkg.hotel_settings) || 0);
    }

    for (const link of packageServices) {
      const mappedHotelSettings = packageHotelMap.get(Number(link.package));
      if (typeof mappedHotelSettings === 'number' && mappedHotelSettings > 0) {
        return mappedHotelSettings;
      }
    }

    return null;
  }

  private getEffectivePackageServices(packages: PackageI[], packageServices: PackageServiceI[]): PackageServiceI[] {
    if (packageServices.length) return packageServices;

    const nestedLinks: PackageServiceI[] = [];
    for (const pkg of packages) {
      const links = Array.isArray(pkg.package_services) ? pkg.package_services : [];
      for (const link of links) {
        nestedLinks.push({
          ...link,
          package: typeof link.package === 'number' ? link.package : pkg.id,
          quantity: Number(link.quantity) || 1,
          is_included: link.is_included !== false
        });
      }
    }

    return nestedLinks;
  }

  private mergeServicesCatalog(
    catalogServices: ServiceI[],
    packages: PackageI[],
    packageServices: PackageServiceI[]
  ): ServiceI[] {
    const servicesById = new Map<number, ServiceI>();

    for (const service of catalogServices) {
      if (typeof service.id !== 'number' || service.id <= 0) continue;
      servicesById.set(service.id, service);
    }

    const packageById = new Map<number, PackageI>(packages.map((pkg) => [pkg.id, pkg]));

    for (const link of packageServices) {
      const serviceId = Number(link.service);
      if (!Number.isInteger(serviceId) || serviceId <= 0 || servicesById.has(serviceId)) continue;

      const linkedPackage = packageById.get(Number(link.package));
      servicesById.set(serviceId, {
        id: serviceId,
        hotel_settings: Number(linkedPackage?.hotel_settings || 0),
        service_type: null,
        service_type_name: link.service_type_name || 'General',
        service_type_code: '',
        name: link.service_name || `Servicio #${serviceId}`,
        description: '',
        base_price: 0,
        is_active: true
      });
    }

    return Array.from(servicesById.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private toPriceNumber(value: string | number): number {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber)) return 0;
    return asNumber;
  }

  private formatDate(value: string | null | undefined): string {
    const parsed = this.parseDate(value);
    if (!parsed) return 'Sin fecha';

    return parsed.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      if ([year, month, day].some((part) => Number.isNaN(part))) return null;
      return this.startOfDay(new Date(year, month - 1, day));
    }

    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) return null;
    return this.startOfDay(asDate);
  }

  private startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
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
