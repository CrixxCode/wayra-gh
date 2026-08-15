import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, debounceTime, forkJoin, of, takeUntil } from 'rxjs';

import { AuditEntryI, AuditFiltersI, AuditService } from '../../../services/audit';
import { MotionService } from '../../../services/motion';

/** Una diferencia legible: `campo: antes -> despues`. */
type ChangeRow = {
  field: string;
  before: string;
  after: string;
};

/**
 * Auditoria.
 *
 * Antes esta pantalla se llamaba "registro de actividad" y **no leia ningun registro**:
 * reconstruia una linea de tiempo pidiendo pagos, movimientos, ordenes y reservas, y
 * mezclandolos. Eso dejaba fuera casi todo el sistema, solo ensenaba altas --nunca
 * ediciones ni borrados-- y cambiaba retroactivamente: si alguien editaba el monto de un
 * pago, la "actividad" pasaba a contar otra cosa.
 *
 * Ahora lee `accounts.AuditLog`, una tabla propia e inmutable donde queda toda escritura
 * del sistema con su autor, su origen y el detalle campo a campo.
 */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-log.html',
  styleUrls: ['./audit-log.css']
})
export class AuditLogPage implements OnInit, OnDestroy {
  /** Primera carga: no hay nada que ensenar todavia. */
  loading = true;

  /** Recargas: hay filas en pantalla y se atenuan en vez de desaparecer. */
  refreshing = false;

  errorMessage = '';

  entries: AuditEntryI[] = [];
  entityOptions: string[] = [];
  userOptions: string[] = [];

  search = '';
  actionFilter = '';
  entityFilter = '';
  userFilter = '';
  fromDate = '';
  toDate = '';

  /** La fila desplegada, o `null`. El detalle se abre en su sitio, no en un modal. */
  expandedId: number | null = null;

  readonly actionOptions = [
    { value: '', label: 'Toda accion' },
    { value: 'CREATE', label: 'Creaciones' },
    { value: 'UPDATE', label: 'Modificaciones' },
    { value: 'DELETE', label: 'Eliminaciones' }
  ];

  /**
   * El buscador escribe aqui, no en la API.
   *
   * Sin antirrebote, cada tecla seria una consulta a una tabla que solo crece.
   */
  private readonly searchInput = new Subject<void>();
  private readonly destroyed = new Subject<void>();
  private revealFrame: number | null = null;

  constructor(
    private auditService: AuditService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.searchInput
      .pipe(debounceTime(350), takeUntil(this.destroyed))
      .subscribe(() => this.load());

    this.load();
  }

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // ---------------------------------------------------------------------- datos

  private get filters(): AuditFiltersI {
    return {
      search: this.search.trim() || undefined,
      action: this.actionFilter || undefined,
      entity: this.entityFilter || undefined,
      username: this.userFilter || undefined,
      occurred_after: this.fromDate || undefined,
      occurred_before: this.toDate || undefined,
      page_size: 200
    };
  }

  load(forceRefresh = false): void {
    if (this.entries.length) this.refreshing = true;
    else this.loading = true;

    this.errorMessage = '';

    forkJoin({
      entries: this.auditService
        .listAudit({ ...this.filters, forceRefresh })
        // `null` y no una lista vacia: una lista vacia afirmaria que no paso nada.
        .pipe(catchError(() => of(null))),
      facets: this.auditService
        .listFacets()
        .pipe(catchError(() => of({ entities: [] as string[], users: [] as string[] })))
    }).subscribe(({ entries, facets }) => {
      this.loading = false;
      this.refreshing = false;

      if (entries === null) {
        this.errorMessage = this.entries.length
          ? 'No fue posible actualizar: se muestra la ultima version cargada.'
          : 'No fue posible cargar el rastro de auditoria.';
        return;
      }

      this.entries = entries;
      this.entityOptions = facets.entities;
      this.userOptions = facets.users;
      this.scheduleReveal();
    });
  }

  onSearchInput(): void {
    this.searchInput.next();
  }

  applyFilters(): void {
    this.expandedId = null;
    this.load();
  }

  clearFilters(): void {
    this.search = '';
    this.actionFilter = '';
    this.entityFilter = '';
    this.userFilter = '';
    this.fromDate = '';
    this.toDate = '';
    this.applyFilters();
  }

  get hasFilters(): boolean {
    return !!(
      this.search.trim() ||
      this.actionFilter ||
      this.entityFilter ||
      this.userFilter ||
      this.fromDate ||
      this.toDate
    );
  }

  /** Entrega el periodo filtrado al contador sin darle acceso al sistema. */
  exportCsv(): void {
    window.location.href = this.auditService.buildExportUrl(this.filters);
  }

  // -------------------------------------------------------------------- lectura

  toggleDetail(entry: AuditEntryI): void {
    this.expandedId = this.expandedId === entry.id ? null : entry.id;
  }

  isExpanded(entry: AuditEntryI): boolean {
    return this.expandedId === entry.id;
  }

  /** Quien lo hizo. Vacio significa que no fue nadie: lo hizo el sistema. */
  actorLabel(entry: AuditEntryI): string {
    return entry.user_username || 'Sistema';
  }

  isSystem(entry: AuditEntryI): boolean {
    return !entry.user_username;
  }

  actionIcon(entry: AuditEntryI): string {
    if (entry.action === 'CREATE') return 'fa-solid fa-plus';
    if (entry.action === 'DELETE') return 'fa-solid fa-trash';
    return 'fa-solid fa-pen';
  }

  /**
   * El diff, listo para una tabla.
   *
   * El alta guarda `{after}` y la baja `{before}`: en esos dos casos se listan los
   * campos del estado completo, que es lo que hay que enseñar.
   */
  changeRows(entry: AuditEntryI): ChangeRow[] {
    const changes = entry.changes || {};

    const snapshot = (key: 'before' | 'after'): ChangeRow[] => {
      const state = changes[key];
      if (!state || typeof state !== 'object') return [];
      return Object.entries(state as Record<string, unknown>)
        .filter(([, value]) => value !== null && value !== '')
        .map(([field, value]) => ({
          field,
          before: key === 'before' ? this.display(value) : '',
          after: key === 'after' ? this.display(value) : ''
        }));
    };

    if ('after' in changes && !('before' in changes)) return snapshot('after');
    if ('before' in changes && !('after' in changes)) return snapshot('before');

    return Object.entries(changes)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([field, value]) => {
        const pair = value as { before?: unknown; after?: unknown };
        return {
          field,
          before: this.display(pair.before),
          after: this.display(pair.after)
        };
      });
  }

  /** Cuantos campos cambiaron, para poder decidir si merece la pena desplegar. */
  changeCount(entry: AuditEntryI): number {
    return this.changeRows(entry).length;
  }

  private display(value: unknown): string {
    if (value === null || value === undefined || value === '') return '--';
    if (typeof value === 'boolean') return value ? 'Si' : 'No';
    return String(value);
  }

  formatMoment(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  trackByEntry(_: number, entry: AuditEntryI): number {
    return entry.id;
  }

  trackByChange(_: number, row: ChangeRow): string {
    return row.field;
  }

  // ------------------------------------------------------------------ animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        this.motion.reveal(this.hostRef.nativeElement.querySelectorAll('.audit-row'), {
          stagger: 0.025,
          y: 10,
          duration: 0.26
        });
      });
    });
  }
}
