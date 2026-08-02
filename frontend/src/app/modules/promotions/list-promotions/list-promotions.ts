import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { HotelSettingsService } from '../../../services/hotel-settings';
import { MasterDataService } from '../../../services/master-data.service';
import { PackagesService } from '../../../services/package';
import { PromotionsService } from '../../../services/promotion';
import { ServicesService } from '../../../services/service';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { PackageI } from '../../packages/package-model';
import { ServiceI } from '../../services/service-model';
import { CreatePromotion } from '../create-promotion/create-promotion';
import { DetailPromotion } from '../detail-promotion/detail-promotion';
import { PromotionI } from '../promotion-model';

type PromotionStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type PromotionVisibilityFilter = 'ALL' | 'PUBLIC' | 'PRIVATE';

type PromotionCategoryTone = {
  icon: string;
  iconBg: string;
  iconColor: string;
  cover: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
};

type PromotionGroup = {
  key: string;
  label: string;
  code: string;
  order: number;
  tone: PromotionCategoryTone;
  items: PromotionI[];
};

type DiscountTypeTab = {
  key: string;
  label: string;
  count: number;
  tone: PromotionCategoryTone;
};

const CATEGORY_TONES: Record<string, PromotionCategoryTone> = {
  PERCENTAGE: {
    icon: 'fa-solid fa-percent',
    iconBg: 'var(--gh-status-info-bg)',
    iconColor: 'var(--gh-status-info-text)',
    cover: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
    badgeBg: 'var(--gh-status-info-bg)',
    badgeColor: 'var(--gh-status-info-text)',
    accent: 'var(--gh-status-info-strong)'
  },
  FIXED: {
    icon: 'fa-solid fa-money-bill-wave',
    iconBg: 'var(--gh-status-orange-bg)',
    iconColor: 'var(--gh-status-orange-text)',
    cover: 'linear-gradient(135deg, #7c2d12 0%, #f97316 100%)',
    badgeBg: 'var(--gh-status-orange-bg)',
    badgeColor: 'var(--gh-status-orange-text)',
    accent: 'var(--gh-status-orange-strong)'
  },
  BOGO: {
    icon: 'fa-solid fa-gift',
    iconBg: 'var(--gh-status-violet-bg)',
    iconColor: 'var(--gh-status-violet-text)',
    cover: 'linear-gradient(135deg, #4c1d95 0%, #a855f7 100%)',
    badgeBg: 'var(--gh-status-violet-bg)',
    badgeColor: 'var(--gh-status-violet-text)',
    accent: 'var(--gh-status-violet-text)'
  },
  DEFAULT: {
    icon: 'fa-solid fa-tags',
    iconBg: 'var(--gh-status-neutral-bg)',
    iconColor: 'var(--gh-status-neutral-text)',
    cover: 'linear-gradient(135deg, #1f365f 0%, #3d659f 100%)',
    badgeBg: 'var(--gh-status-neutral-bg)',
    badgeColor: 'var(--gh-status-neutral-text)',
    accent: 'var(--gh-text-muted)'
  }
};

@Component({
  selector: 'app-list-promotions',
  standalone: true,
  imports: [CommonModule, FormsModule, CreatePromotion, DetailPromotion],
  templateUrl: './list-promotions.html',
  styleUrls: ['./list-promotions.css']
})
export class ListPromotions implements OnInit {
  loading = false;
  errorMessage = '';
  infoMessage = '';
  discountTypesLoadFailed = false;
  hotelSettingsLoadFailed = false;
  servicesLoadFailed = false;
  packagesLoadFailed = false;
  showDeletedPromotions = false;

  promotions: PromotionI[] = [];
  deletedPromotions: PromotionI[] = [];
  filteredPromotions: PromotionI[] = [];
  groupedPromotions: PromotionGroup[] = [];

  discountTypes: MasterDataI[] = [];
  services: ServiceI[] = [];
  packages: PackageI[] = [];
  discountTabs: DiscountTypeTab[] = [];

  search = '';
  statusFilter: PromotionStatusFilter = 'ALL';
  visibilityFilter: PromotionVisibilityFilter = 'ALL';
  selectedDiscountFilter = 'ALL';

  showCreateDrawer = false;
  selectedPromotion: PromotionI | null = null;

  hotelSettingsId: number | null = null;

  readonly statusOptions: Array<{ value: PromotionStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ACTIVE', label: 'Activas' },
    { value: 'INACTIVE', label: 'Inactivas' }
  ];

  readonly visibilityOptions: Array<{ value: PromotionVisibilityFilter; label: string }> = [
    { value: 'ALL', label: 'Todas' },
    { value: 'PUBLIC', label: 'Publicas' },
    { value: 'PRIVATE', label: 'Internas' }
  ];

  private discountTypeMap = new Map<number, MasterDataI>();
  private discountOrderMap = new Map<string, number>();
  private highlightedByGroup = new Map<string, Set<number>>();

  constructor(
    private promotionsService: PromotionsService,
    private masterDataService: MasterDataService,
    private hotelSettingsService: HotelSettingsService,
    private servicesService: ServicesService,
    private packagesService: PackagesService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCatalogData();
  }

  get totalPromotions(): number {
    return this.promotions.length;
  }

  get deletedPromotionsCount(): number {
    return this.deletedPromotions.length;
  }

  get activePromotions(): number {
    return this.promotions.filter((promotion) => promotion.is_active).length;
  }

  get validTodayPromotions(): number {
    return this.promotions.filter((promotion) => this.getValidityState(promotion) === 'VIGENTE').length;
  }

  get publicPromotions(): number {
    return this.promotions.filter((promotion) => promotion.is_public).length;
  }

  get linkedPromotions(): number {
    return this.promotions.filter((promotion) => promotion.service || promotion.package).length;
  }

  get averageDiscountLabel(): string {
    if (!this.promotions.length) return '--';

    const percentageValues: number[] = [];
    const fixedValues: number[] = [];

    for (const promotion of this.promotions) {
      const value = this.toNumber(promotion.discount_value);
      if (this.isPercentagePromotion(promotion)) {
        percentageValues.push(value);
      } else {
        fixedValues.push(value);
      }
    }

    if (percentageValues.length && !fixedValues.length) {
      return this.formatPercent(this.average(percentageValues));
    }

    if (fixedValues.length && !percentageValues.length) {
      return this.formatCurrency(this.average(fixedValues));
    }

    if (percentageValues.length && fixedValues.length) {
      return `${this.formatPercent(this.average(percentageValues))} + ${this.formatCurrency(this.average(fixedValues))}`;
    }

    return '--';
  }

  get canCreatePromotion(): boolean {
    return !!this.hotelSettingsId && this.discountTypes.length > 0;
  }

  loadCatalogData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.discountTypesLoadFailed = false;
    this.hotelSettingsLoadFailed = false;
    this.servicesLoadFailed = false;
    this.packagesLoadFailed = false;
    const selectedPromotionId = this.selectedPromotion?.id ?? null;

    forkJoin({
      promotions: this.promotionsService
        .listPromotions({ include_inactive: true })
        .pipe(catchError(() => of([] as PromotionI[]))),
      allPromotions: this.promotionsService
        .listPromotions({ include_inactive: true, include_deleted: true })
        .pipe(catchError(() => of([] as PromotionI[]))),
      discountTypes: this.masterDataService
        .listMasterData({ group: 'PROMOTION_DISCOUNT_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(
          catchError(() => {
            this.discountTypesLoadFailed = true;
            return of([] as MasterDataI[]);
          })
        ),
      services: this.servicesService
        .listServices({ include_inactive: true })
        .pipe(
          catchError(() => {
            this.servicesLoadFailed = true;
            return of([] as ServiceI[]);
          })
        ),
      packages: this.packagesService
        .listPackages({ include_inactive: true })
        .pipe(
          catchError(() => {
            this.packagesLoadFailed = true;
            return of([] as PackageI[]);
          })
        ),
      targetCatalog: this.promotionsService.getTargetCatalog().pipe(
        catchError(() => of({ services: [] as ServiceI[], packages: [] as PackageI[] }))
      ),
      settings: this.hotelSettingsService.getCurrentSettings().pipe(
        catchError(() => {
          this.hotelSettingsLoadFailed = true;
          return of(null);
        })
      )
    }).subscribe({
      next: ({ promotions, allPromotions, discountTypes, services, packages, targetCatalog, settings }) => {
        this.loading = false;
        this.promotions = promotions;
        const visibleIds = new Set(promotions.map((promotion) => promotion.id));
        this.deletedPromotions = allPromotions.filter((promotion) => !visibleIds.has(promotion.id));
        this.discountTypes = discountTypes;
        this.services = services.length ? services : targetCatalog.services;
        this.packages = packages.length ? packages : targetCatalog.packages;

        if (selectedPromotionId) {
          this.selectedPromotion = promotions.find((promotion) => promotion.id === selectedPromotionId) || null;
        }

        this.buildDiscountMaps();
        this.hotelSettingsId = this.resolveHotelSettingsId(
          settings,
          this.promotions,
          this.services,
          this.packages,
          this.hotelSettingsId
        );
        this.discountTabs = this.buildDiscountTabs(this.promotions);
        this.applyFilters();

        if (this.discountTypesLoadFailed) {
          this.infoMessage =
            'No fue posible cargar los tipos de descuento desde master data. Verifica permisos (master_data.read) y el endpoint /api/master-data/.';
        } else if (this.hotelSettingsLoadFailed) {
          this.infoMessage =
            'No fue posible cargar la configuracion del hotel. Verifica permisos (hotel_settings.read) y el endpoint /api/hotel-settings/current/.';
        } else if (this.servicesLoadFailed || this.packagesLoadFailed) {
          const serviceHint = this.servicesLoadFailed ? 'services.read' : '';
          const packageHint = this.packagesLoadFailed ? 'packages.read' : '';
          const joiner = serviceHint && packageHint ? ' y ' : '';
          this.infoMessage =
            `No fue posible cargar el catalogo de servicios/paquetes para promociones. Verifica permisos (${serviceHint}${joiner}${packageHint}) y los endpoints /api/services/ y /api/packages/.`;
        } else if (!this.hotelSettingsId) {
          this.infoMessage = 'No se encontro una configuracion activa de hotel. Podras ver promociones, pero no crear nuevas.';
        } else if (!this.discountTypes.length) {
          this.infoMessage =
            'No hay tipos de descuento activos en master data. Registra primero PROMOTION_DISCOUNT_TYPE para crear promociones.';
        } else {
          this.infoMessage = '';
        }
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'No fue posible cargar el catalogo de promociones.';
      }
    });
  }

  refreshPromotions(): void {
    this.loadCatalogData();
  }

  exportCsv(): void {
    if (!this.filteredPromotions.length) return;

    const headers = [
      'nombre',
      'codigo',
      'tipo_descuento',
      'valor_descuento',
      'objetivo',
      'fecha_inicio',
      'fecha_fin',
      'estado',
      'visibilidad'
    ];

    const rows = this.filteredPromotions.map((promotion) => {
      const row = [
        promotion.name || '',
        promotion.code || '',
        this.getDiscountTypeLabel(promotion),
        this.getDiscountValueLabel(promotion),
        this.getPromotionTargetLabel(promotion),
        promotion.start_date || '',
        promotion.end_date || '',
        promotion.is_active ? 'Activa' : 'Inactiva',
        promotion.is_public ? 'Publica' : 'Interna'
      ];

      return row.map((cell) => this.escapeCsvCell(cell)).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promociones-${this.formatFileDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  applyFilters(): void {
    const searchValue = this.normalizeSearch(this.search);

    this.filteredPromotions = this.promotions.filter((promotion) => {
      const statusMatch =
        this.statusFilter === 'ALL' ||
        (this.statusFilter === 'ACTIVE' && promotion.is_active) ||
        (this.statusFilter === 'INACTIVE' && !promotion.is_active);

      const visibilityMatch =
        this.visibilityFilter === 'ALL' ||
        (this.visibilityFilter === 'PUBLIC' && promotion.is_public) ||
        (this.visibilityFilter === 'PRIVATE' && !promotion.is_public);

      const typeMatch =
        this.selectedDiscountFilter === 'ALL' || this.getDiscountTypeKey(promotion) === this.selectedDiscountFilter;

      const searchPool = [
        promotion.name,
        promotion.code || '',
        promotion.description || '',
        this.getDiscountTypeLabel(promotion),
        this.getPromotionTargetLabel(promotion),
        promotion.service_name || '',
        promotion.package_name || ''
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = !searchValue || searchPool.includes(searchValue);

      return statusMatch && visibilityMatch && typeMatch && searchMatch;
    });

    this.groupedPromotions = this.buildGroups(this.filteredPromotions);
  }

  selectDiscountFilter(tabKey: string): void {
    this.selectedDiscountFilter = tabKey;
    this.applyFilters();
  }

  openCreateDrawer(): void {
    this.selectedPromotion = null;
    this.showCreateDrawer = true;
  }

  closeCreateDrawer(): void {
    this.showCreateDrawer = false;
  }

  onPromotionCreated(): void {
    this.showCreateDrawer = false;
    this.refreshPromotions();
  }

  openDetail(promotion: PromotionI): void {
    this.showCreateDrawer = false;
    this.selectedPromotion = promotion;
  }

  closeDetail(): void {
    this.selectedPromotion = null;
  }

  togglePromotionStatus(promotion: PromotionI): void {
    this.errorMessage = '';
    this.promotionsService.updatePromotion(promotion.id, { is_active: !promotion.is_active }).subscribe({
      next: () => {
        this.refreshPromotions();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar el estado de la promocion.';
      }
    });
  }

  togglePromotionVisibility(promotion: PromotionI): void {
    this.errorMessage = '';
    this.promotionsService.updatePromotion(promotion.id, { is_public: !promotion.is_public }).subscribe({
      next: () => {
        this.refreshPromotions();
      },
      error: () => {
        this.errorMessage = 'No fue posible actualizar la visibilidad de la promocion.';
      }
    });
  }

  confirmDelete(promotion: PromotionI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: promotion.name || 'promocion',
      onAccept: () => {
        this.errorMessage = '';
        this.promotionsService.deletePromotion(promotion.id).subscribe({
          next: () => {
            if (this.selectedPromotion?.id === promotion.id) {
              this.closeDetail();
            }
            this.refreshPromotions();
          },
          error: () => {
            this.errorMessage = 'No fue posible eliminar la promocion seleccionada.';
          }
        });
      }
    });
  }

  restorePromotion(promotion: PromotionI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'restore',
      target: promotion.name || 'promocion',
      onAccept: () => {
        this.errorMessage = '';
        this.promotionsService.restorePromotion(promotion.id).subscribe({
          next: () => {
            this.refreshPromotions();
          },
          error: () => {
            this.errorMessage = 'No fue posible restaurar la promocion seleccionada.';
          }
        });
      }
    });
  }

  getDiscountTypeLabel(promotion: PromotionI): string {
    const discountType = this.getDiscountTypeByPromotion(promotion);
    if (discountType?.name) return discountType.name;
    if (promotion.discount_type_name) return promotion.discount_type_name;
    if (promotion.discount_type_code) return promotion.discount_type_code;
    return 'Sin tipo';
  }

  getDiscountValueLabel(promotion: PromotionI): string {
    const value = this.toNumber(promotion.discount_value);
    if (this.isPercentagePromotion(promotion)) {
      return this.formatPercent(value);
    }
    return this.formatCurrency(value);
  }

  getPromotionTargetLabel(promotion: PromotionI): string {
    if (promotion.package_name) return `Paquete: ${promotion.package_name}`;
    if (promotion.service_name) return `Servicio: ${promotion.service_name}`;

    if (promotion.package) return `Paquete #${promotion.package}`;
    if (promotion.service) return `Servicio #${promotion.service}`;

    return 'Promocion general';
  }

  getTargetTypeLabel(promotion: PromotionI): string {
    if (promotion.package || promotion.package_name) return 'Paquete';
    if (promotion.service || promotion.service_name) return 'Servicio';
    return 'General';
  }

  getDateRangeLabel(promotion: PromotionI): string {
    const start = this.formatDate(promotion.start_date);
    const end = this.formatDate(promotion.end_date);
    return `${start} - ${end}`;
  }

  getValidityState(promotion: PromotionI): 'VIGENTE' | 'PROXIMO' | 'FUERA' {
    const start = this.parseDate(promotion.start_date);
    const end = this.parseDate(promotion.end_date);
    const today = this.startOfDay(new Date());

    if (start && start > today) return 'PROXIMO';
    if (end && end < today) return 'FUERA';
    return 'VIGENTE';
  }

  getValidityLabel(promotion: PromotionI): string {
    const state = this.getValidityState(promotion);
    if (state === 'VIGENTE') return 'Vigente';
    if (state === 'PROXIMO') return 'Proxima';
    return 'Vencida';
  }

  getValidityTone(promotion: PromotionI): { bg: string; color: string } {
    const state = this.getValidityState(promotion);
    if (state === 'VIGENTE') return { bg: 'var(--gh-status-success-bg)', color: 'var(--gh-status-success-text)' };
    if (state === 'PROXIMO') return { bg: 'var(--gh-status-info-bg)', color: 'var(--gh-status-info-text)' };
    return { bg: 'var(--gh-status-orange-bg)', color: 'var(--gh-status-orange-text)' };
  }

  getStatusTone(promotion: PromotionI): { bg: string; color: string; dot: string } {
    if (promotion.is_active) {
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

  getVisibilityTone(promotion: PromotionI): { bg: string; color: string; dot: string } {
    if (promotion.is_public) {
      return {
        bg: 'var(--gh-status-info-bg)',
        color: 'var(--gh-status-info-text)',
        dot: 'var(--gh-status-info-strong)'
      };
    }

    return {
      bg: 'var(--gh-status-warn-bg)',
      color: 'var(--gh-status-warn-text)',
      dot: 'var(--gh-status-warn-strong)'
    };
  }

  getGroupTone(group: PromotionGroup): PromotionCategoryTone {
    return group.tone;
  }

  isHighlighted(groupKey: string, promotionId: number): boolean {
    return this.highlightedByGroup.get(groupKey)?.has(promotionId) || false;
  }

  trackByPromotion(_: number, promotion: PromotionI): number {
    return promotion.id;
  }

  trackByGroup(_: number, group: PromotionGroup): string {
    return group.key;
  }

  trackByTab(_: number, tab: DiscountTypeTab): string {
    return tab.key;
  }

  private buildDiscountMaps(): void {
    this.discountTypeMap = new Map(this.discountTypes.map((discountType) => [discountType.id, discountType]));

    this.discountOrderMap.clear();
    for (const discountType of this.discountTypes) {
      const key = this.getDiscountTypeKeyFromType(discountType);
      this.discountOrderMap.set(key, Number(discountType.sort_order || 0));
    }
  }

  private buildDiscountTabs(promotions: PromotionI[]): DiscountTypeTab[] {
    const groups = this.buildGroups(promotions, false);
    return [
      {
        key: 'ALL',
        label: 'Todos',
        count: promotions.length,
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

  private buildGroups(promotions: PromotionI[], updateHighlights = true): PromotionGroup[] {
    const groupsMap = new Map<string, PromotionGroup>();

    for (const promotion of promotions) {
      const key = this.getDiscountTypeKey(promotion);
      const label = this.getDiscountTypeLabel(promotion);
      const code = this.getDiscountTypeCode(promotion);
      const tone = this.resolveTone(code);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          label,
          code,
          tone,
          order: this.resolveDiscountOrder(promotion, key),
          items: []
        });
      }

      groupsMap.get(key)?.items.push(promotion);
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label, 'es');
    });

    if (updateHighlights) {
      this.highlightedByGroup.clear();
      for (const group of groups) {
        const sortedByValue = [...group.items].sort(
          (a, b) => this.toNumber(b.discount_value) - this.toNumber(a.discount_value)
        );
        const featuredCount = sortedByValue.length >= 4 ? 2 : sortedByValue.length ? 1 : 0;
        this.highlightedByGroup.set(
          group.key,
          new Set(sortedByValue.slice(0, featuredCount).map((promotion) => promotion.id))
        );
      }
    }

    return groups;
  }

  private resolveDiscountOrder(promotion: PromotionI, key: string): number {
    const fromMap = this.discountOrderMap.get(key);
    if (typeof fromMap === 'number') return fromMap;

    const discountType = this.getDiscountTypeByPromotion(promotion);
    if (discountType && typeof discountType.sort_order === 'number') return discountType.sort_order;

    return 999;
  }

  private getDiscountTypeByPromotion(promotion: PromotionI): MasterDataI | null {
    if (typeof promotion.discount_type !== 'number') return null;
    return this.discountTypeMap.get(promotion.discount_type) || null;
  }

  private getDiscountTypeKeyFromType(discountType: MasterDataI): string {
    return `id:${discountType.id}`;
  }

  private getDiscountTypeKey(promotion: PromotionI): string {
    if (typeof promotion.discount_type === 'number') return `id:${promotion.discount_type}`;

    const code = this.getDiscountTypeCode(promotion);
    if (code) return `code:${code}`;

    return 'untyped';
  }

  private getDiscountTypeCode(promotion: PromotionI): string {
    const discountType = this.getDiscountTypeByPromotion(promotion);
    const rawCode = discountType?.code || promotion.discount_type_code || this.getDiscountTypeLabel(promotion);
    return this.normalizeCode(rawCode);
  }

  private isPercentagePromotion(promotion: PromotionI): boolean {
    const code = this.getDiscountTypeCode(promotion);
    return code.includes('PERCENT') || code.includes('PORCEN') || code === 'PCT';
  }

  private resolveTone(code: string): PromotionCategoryTone {
    if (code.includes('PERCENT') || code.includes('PORCEN') || code === 'PCT') {
      return CATEGORY_TONES['PERCENTAGE'];
    }

    if (code.includes('BOGO') || code.includes('BUNDLE') || code.includes('COMBO')) {
      return CATEGORY_TONES['BOGO'];
    }

    if (code.includes('FIXED') || code.includes('AMOUNT') || code.includes('MONTO') || code.includes('VALUE')) {
      return CATEGORY_TONES['FIXED'];
    }

    return CATEGORY_TONES['DEFAULT'];
  }

  private resolveHotelSettingsId(
    settings: { id?: number } | null,
    promotions: PromotionI[],
    services: ServiceI[],
    packages: PackageI[],
    current: number | null
  ): number | null {
    const fromSettings = Number(settings?.id || 0);
    if (fromSettings > 0) return fromSettings;

    if (typeof current === 'number' && current > 0) return current;

    const fromPromotions = promotions.find((promotion) => Number(promotion.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromPromotions === 'number' && fromPromotions > 0) return fromPromotions;

    const fromServices = services.find((service) => Number(service.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromServices === 'number' && fromServices > 0) return fromServices;

    const fromPackages = packages.find((pkg) => Number(pkg.hotel_settings) > 0)?.hotel_settings;
    if (typeof fromPackages === 'number' && fromPackages > 0) return fromPackages;

    return null;
  }

  private average(values: number[]): number {
    if (!values.length) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private formatPercent(value: number): string {
    const normalized = Number.isInteger(value) ? `${value}` : value.toFixed(2);
    return `${normalized}%`;
  }

  private toNumber(value: string | number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 0;
    return parsed;
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
