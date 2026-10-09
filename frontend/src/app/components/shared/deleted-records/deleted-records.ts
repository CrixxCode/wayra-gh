import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface DeletedRecordRow {
  id: string | number;
  label: string;
  detail?: string;
}

/**
 * Lista de registros eliminados (borrado logico, AGENTS.md 5.5) con su boton "Restaurar".
 *
 * Master Data, Roles y Recursos tenian `restore` en el backend y en sus servicios, pero
 * ninguna pantalla lo ofrecia: eliminar era irreversible desde la UI (auditoria, Bloques
 * 1 #7 y 3 #4). La pagina calcula cuales estan eliminados y hace la restauracion; este
 * componente solo los pinta.
 */
@Component({
  selector: 'app-deleted-records',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="deleted-records" aria-live="polite">
      <header>
        <h3>{{ title }}</h3>
        <button type="button" class="deleted-close" (click)="closed.emit()" aria-label="Cerrar eliminados">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <p class="deleted-empty" *ngIf="loading">Cargando eliminados...</p>
      <p class="deleted-empty" *ngIf="!loading && !rows.length">No hay registros eliminados.</p>

      <ul *ngIf="!loading && rows.length">
        <li *ngFor="let row of rows; trackBy: trackById">
          <span>
            <strong>{{ row.label }}</strong>
            <small *ngIf="row.detail">{{ row.detail }}</small>
          </span>
          <button
            type="button"
            class="deleted-restore"
            [disabled]="restoringId !== null"
            (click)="restore.emit(row.id)">
            {{ restoringId === row.id ? 'Restaurando...' : 'Restaurar' }}
          </button>
        </li>
      </ul>
    </section>
  `,
  styles: [
    `
      .deleted-records {
        margin: 12px 0;
        padding: 12px 14px;
        border: 1px solid var(--gh-border);
        border-radius: 12px;
        background: var(--gh-surface-soft);
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      h3 {
        color: var(--gh-text-strong);
        font-size: 0.9rem;
        font-weight: 800;
      }
      .deleted-close {
        border: 0;
        background: transparent;
        color: var(--gh-text-soft);
        cursor: pointer;
      }
      .deleted-empty {
        color: var(--gh-text-soft);
        font-size: 0.82rem;
      }
      ul {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 260px;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 9px;
        background: var(--gh-surface);
      }
      li span {
        display: flex;
        flex-direction: column;
        min-width: 0;
        color: var(--gh-text);
      }
      li small {
        color: var(--gh-text-soft);
        font-size: 0.75rem;
      }
      .deleted-restore {
        padding: 5px 10px;
        border: 1px solid var(--gh-status-success-border);
        border-radius: 8px;
        background: var(--gh-status-success-bg);
        color: var(--gh-status-success-text);
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
      }
      .deleted-restore:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
    `
  ]
})
export class DeletedRecords {
  @Input() title = 'Eliminados';
  @Input() rows: DeletedRecordRow[] = [];
  @Input() loading = false;
  @Input() restoringId: string | number | null = null;

  @Output() restore = new EventEmitter<string | number>();
  @Output() closed = new EventEmitter<void>();

  trackById(_: number, row: DeletedRecordRow): string | number {
    return row.id;
  }
}
