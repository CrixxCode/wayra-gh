import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ItemI } from '../../items/item-model';
import { BillingService } from '../../../services/billing';
import { ItemsService } from '../../../services/item';

type PosCategoryI = {
  code: string;
  label: string;
  count: number;
};

type PosCartLineI = {
  item: ItemI;
  quantity: number;
};

@Component({
  selector: 'app-pos-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos-bar.html',
  styleUrls: ['./pos-bar.css']
})
export class PosBar implements OnInit, OnChanges {
  @Input() reservationId: number | null = null;

  @Output() created = new EventEmitter<{ count: number; totalLabel: string }>();
  @Output() cancelled = new EventEmitter<void>();

  loading = false;
  saving = false;
  errorMessage = '';
  infoMessage = '';

  items: ItemI[] = [];
  filteredItems: ItemI[] = [];
  categories: PosCategoryI[] = [];
  categoryLabelByCode = new Map<string, string>();

  search = '';
  categoryFilter = 'ALL';
  onlyAvailable = true;

  cart: PosCartLineI[] = [];

  constructor(
    private itemsService: ItemsService,
    private billingService: BillingService
  ) {}

  ngOnInit(): void {
    this.loadCatalog();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      this.cart = [];
      this.errorMessage = '';
      this.infoMessage = '';
    }
  }

  get cartCount(): number {
    return this.cart.reduce((sum, line) => sum + line.quantity, 0);
  }

  get cartSubtotal(): number {
    return this.cart.reduce(
      (sum, line) => sum + line.quantity * this.toNumber(line.item.sale_price),
      0
    );
  }

  get canSubmit(): boolean {
    return !this.saving && !this.loading && !!this.reservationId && this.cart.length > 0;
  }

  loadCatalog(): void {
    this.loading = true;
    this.errorMessage = '';

    this.itemsService.listItems({ ordering: 'name' }).subscribe({
      next: (items) => {
        this.loading = false;
        this.items = items.filter((item) => !!item.is_active);
        this.buildCategories();
        this.applyFilters();
      },
      error: () => {
        this.loading = false;
        this.items = [];
        this.filteredItems = [];
        this.errorMessage = 'No fue posible cargar el catalogo de productos para POS.';
      }
    });
  }

  applyFilters(): void {
    const query = String(this.search || '').trim().toLowerCase();

    this.filteredItems = this.items
      .filter((item) => {
        const categoryCode = this.getCategoryCode(item);
        const categoryMatch = this.categoryFilter === 'ALL' || this.categoryFilter === categoryCode;
        const availabilityMatch = !this.onlyAvailable || this.getAvailableStock(item) > 0;
        const searchMatch =
          !query ||
          [
            item.name,
            item.sku || '',
            item.item_type_name || '',
            item.item_type_code || ''
          ]
            .join(' ')
            .toLowerCase()
            .includes(query);

        return categoryMatch && availabilityMatch && searchMatch;
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
  }

  addItem(item: ItemI): void {
    this.errorMessage = '';

    const available = this.getAvailableStock(item);
    if (available <= 0) {
      this.errorMessage = `No hay stock disponible para ${item.name}.`;
      return;
    }

    const existing = this.cart.find((line) => line.item.id === item.id);
    if (existing) {
      existing.quantity += 1;
      return;
    }

    this.cart.push({ item, quantity: 1 });
  }

  increase(line: PosCartLineI): void {
    const stock = this.toNonNegativeInt(line.item.stock);
    if (line.quantity >= stock) {
      this.errorMessage = `No puedes superar el stock disponible de ${line.item.name}.`;
      return;
    }
    line.quantity += 1;
  }

  decrease(line: PosCartLineI): void {
    if (line.quantity <= 1) {
      this.remove(line);
      return;
    }
    line.quantity -= 1;
  }

  onQuantityChanged(line: PosCartLineI, value: number | string): void {
    const stock = this.toNonNegativeInt(line.item.stock);
    if (stock <= 0) {
      this.remove(line);
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      line.quantity = 1;
      return;
    }

    const quantity = Math.max(1, Math.min(stock, Math.floor(parsed)));
    if (quantity < Math.floor(parsed)) {
      this.errorMessage = `Cantidad ajustada al stock disponible para ${line.item.name}.`;
    }
    line.quantity = quantity;
  }

  remove(line: PosCartLineI): void {
    this.cart = this.cart.filter((row) => row.item.id !== line.item.id);
  }

  clearCart(): void {
    if (this.saving) return;
    this.cart = [];
    this.errorMessage = '';
  }

  submit(): void {
    this.errorMessage = '';
    this.infoMessage = '';

    if (!this.reservationId) {
      this.errorMessage = 'No se encontro una reserva asociada para registrar el consumo.';
      return;
    }

    if (!this.cart.length) {
      this.errorMessage = 'Debes agregar al menos un producto al ticket.';
      return;
    }

    const payloadLines = this.cart.map((line) => ({
      item: line.item.id,
      quantity: line.quantity,
      description: `Consumo bar/mini tienda: ${line.item.name}`,
    }));

    this.saving = true;
    this.billingService
      .createPosChargeBatch({
        reservation: this.reservationId,
        reference: `POS-${this.reservationId}-${Date.now()}`,
        charge_type_code: 'BAR',
        lines: payloadLines
      })
      .subscribe({
        next: (response) => {
          this.saving = false;
          const count = Number(response?.charges_created || 0);
          const total = this.formatCurrency(this.toNumber(response?.total_amount));
          this.infoMessage = count
            ? `Se registraron ${count} consumo(s) en la factura.`
            : 'Consumos registrados correctamente.';
          this.cart = [];
          this.loadCatalog();
          this.created.emit({
            count,
            totalLabel: total
          });
        },
        error: (error) => {
          this.saving = false;
          this.errorMessage = this.extractErrorMessage(error);
        }
      });
  }

  close(): void {
    if (this.saving) return;
    this.cancelled.emit();
  }

  getCategoryLabel(item: ItemI): string {
    const code = this.getCategoryCode(item);
    return this.categoryLabelByCode.get(code) || 'Sin categoria';
  }

  getPriceLabel(item: ItemI): string {
    return this.formatCurrency(this.toNumber(item.sale_price));
  }

  getCartLineTotalLabel(line: PosCartLineI): string {
    return this.formatCurrency(line.quantity * this.toNumber(line.item.sale_price));
  }

  getAvailableStock(item: ItemI): number {
    const cartQuantity = this.getCartQuantity(item.id);
    const stock = this.toNonNegativeInt(item.stock);
    return Math.max(0, stock - cartQuantity);
  }

  getAvailableStockLabel(item: ItemI): string {
    return `${this.getAvailableStock(item)} disponible(s)`;
  }

  getCartQuantity(itemId: number): number {
    const line = this.cart.find((row) => row.item.id === itemId);
    return line ? line.quantity : 0;
  }

  trackByItem(_: number, item: ItemI): number {
    return item.id;
  }

  trackByCartItem(_: number, line: PosCartLineI): number {
    return line.item.id;
  }

  private buildCategories(): void {
    const totals = new Map<string, number>();
    this.categoryLabelByCode.clear();

    for (const item of this.items) {
      const code = this.getCategoryCode(item);
      const label = this.resolveCategoryLabel(item);
      totals.set(code, (totals.get(code) || 0) + 1);
      this.categoryLabelByCode.set(code, label);
    }

    const dynamicCategories = Array.from(totals.entries())
      .map(([code, count]) => ({
        code,
        label: this.categoryLabelByCode.get(code) || code,
        count
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));

    this.categories = [
      {
        code: 'ALL',
        label: 'Todas las categorias',
        count: this.items.length
      },
      ...dynamicCategories
    ];

    const currentFilterExists = this.categories.some((category) => category.code === this.categoryFilter);
    if (!currentFilterExists) {
      this.categoryFilter = 'ALL';
    }
  }

  private getCategoryCode(item: ItemI): string {
    const source = item.item_type_code || item.item_type_name || 'SIN_CATEGORIA';
    const normalized = String(source || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized || 'SIN_CATEGORIA';
  }

  private resolveCategoryLabel(item: ItemI): string {
    const byName = String(item.item_type_name || '').trim();
    if (byName) return byName;

    const byCode = String(item.item_type_code || '').trim();
    if (byCode) return byCode;

    return 'Sin categoria';
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  private extractErrorMessage(error: unknown): string {
    const fallback = 'No fue posible registrar los consumos del POS.';

    if (!error || typeof error !== 'object') return fallback;
    const payload = (error as { error?: unknown }).error;
    if (!payload || typeof payload !== 'object') return fallback;

    const detail = (payload as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;

    for (const key of Object.keys(payload as Record<string, unknown>)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
    }

    return fallback;
  }
}
