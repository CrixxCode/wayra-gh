import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';

import { MasterDataI } from '../../../components/pages/master-data/master-data-model';
import { openActionConfirmation } from '../../../services/action-confirmations';
import { MasterDataService } from '../../../services/master-data.service';
import { RecurringWorkService } from '../../../services/recurring-work';
import { RoomService } from '../../../services/room';
import { ConfirmationService } from 'primeng/api';
import { RoomI } from '../../rooms/room-model';
import {
  RecurringWorkFormPayload,
  RecurringWorkFrequency,
  RecurringWorkI,
  RecurringWorkKind
} from '../recurring-work-model';

const WEEKDAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

/**
 * Programación del trabajo periódico.
 *
 * Una regla no es una tarea que se repite: es **una regla que produce tareas**. Por eso
 * vive en su propia pestaña y no como una casilla del formulario de alta — desde aquí se
 * ve qué está programado y cuándo vuelve a tocar, algo que mirando el trabajo ya creado
 * no se puede reconstruir.
 *
 * Quien materializa el trabajo es el comando `generate_recurring_work`, que corre a
 * diario. Esta pantalla solo define las reglas.
 */
@Component({
  selector: 'app-recurring-work',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recurring-work.html',
  styleUrls: ['./recurring-work.css']
})
export class RecurringWork implements OnInit {
  /** Un cambio aqui puede generar trabajo hoy mismo. */
  @Output() changed = new EventEmitter<void>();

  @Input() set reload(value: number) {
    if (value) this.load(true);
  }

  rules: RecurringWorkI[] = [];
  rooms: RoomI[] = [];
  taskTypes: MasterDataI[] = [];
  priorities: MasterDataI[] = [];

  loading = false;
  saving = false;
  errorMessage = '';

  showForm = false;
  editingId: number | null = null;
  form: RecurringWorkFormPayload = this.emptyForm();

  readonly weekdays = WEEKDAYS;

  readonly kindOptions: Array<{ value: RecurringWorkKind; label: string; icon: string }> = [
    { value: 'CLEANING', label: 'Limpieza', icon: 'fa-solid fa-broom' },
    { value: 'MAINTENANCE', label: 'Mantenimiento', icon: 'fa-solid fa-screwdriver-wrench' }
  ];

  readonly frequencyOptions: Array<{ value: RecurringWorkFrequency; label: string }> = [
    { value: 'DAILY', label: 'Cada dia' },
    { value: 'WEEKLY', label: 'Cada semana' },
    { value: 'MONTHLY', label: 'Cada mes' }
  ];

  constructor(
    private recurringService: RecurringWorkService,
    private roomService: RoomService,
    private masterDataService: MasterDataService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  // ----------------------------------------------------------------- datos

  load(force = false): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      rules: this.recurringService
        .listRecurringWork({ forceRefresh: force })
        .pipe(catchError(() => of([] as RecurringWorkI[]))),
      rooms: this.roomService.listRooms().pipe(catchError(() => of([] as RoomI[]))),
      taskTypes: this.masterDataService
        .listMasterData({ group: 'CLEANING_TASK_TYPE', is_active: 'true', ordering: 'sort_order,name' })
        .pipe(catchError(() => of([] as MasterDataI[]))),
      priorities: this.masterDataService
        .listMasterData({
          group: 'MAINTENANCE_PRIORITY',
          is_active: 'true',
          ordering: 'sort_order,name'
        })
        .pipe(catchError(() => of([] as MasterDataI[])))
    }).subscribe(({ rules, rooms, taskTypes, priorities }) => {
      this.loading = false;
      this.rules = rules;
      this.rooms = rooms;
      this.taskTypes = taskTypes;
      this.priorities = priorities;
    });
  }

  // ------------------------------------------------------------- formulario

  private emptyForm(): RecurringWorkFormPayload {
    const today = new Date();
    return {
      kind: 'CLEANING',
      name: '',
      room: null,
      task_type: null,
      priority: null,
      notes: '',
      frequency: 'WEEKLY',
      interval: 1,
      weekday: today.getDay() === 0 ? 6 : today.getDay() - 1,
      day_of_month: today.getDate(),
      starts_on: this.dateKey(today),
      ends_on: null,
      is_active: true
    };
  }

  openCreate(kind: RecurringWorkKind = 'CLEANING'): void {
    this.editingId = null;
    this.form = { ...this.emptyForm(), kind };
    this.errorMessage = '';
    this.showForm = true;
  }

  openEdit(rule: RecurringWorkI): void {
    this.editingId = rule.id;
    this.form = {
      kind: rule.kind,
      name: rule.name,
      room: rule.room,
      task_type: rule.task_type ?? null,
      priority: rule.priority ?? null,
      notes: rule.notes || '',
      frequency: rule.frequency,
      interval: rule.interval,
      weekday: rule.weekday ?? 0,
      day_of_month: rule.day_of_month ?? 1,
      starts_on: rule.starts_on,
      ends_on: rule.ends_on || null,
      is_active: rule.is_active
    };
    this.errorMessage = '';
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingId = null;
  }

  get isCleaning(): boolean {
    return this.form.kind === 'CLEANING';
  }

  get canSave(): boolean {
    if (this.saving) return false;
    if (!this.form.name.trim()) return false;
    if (this.isCleaning && !this.form.task_type) return false;
    return !!this.form.starts_on && Number(this.form.interval) >= 1;
  }

  /** Cómo se lee la regla en una frase: es la comprobación real de que dice lo que quieres. */
  get formPreview(): string {
    return this.describe({
      frequency: this.form.frequency,
      interval: Number(this.form.interval) || 1,
      weekday: this.form.weekday ?? null,
      day_of_month: this.form.day_of_month ?? null
    });
  }

  save(): void {
    if (!this.canSave) return;

    this.saving = true;
    this.errorMessage = '';

    const payload: RecurringWorkFormPayload = {
      ...this.form,
      name: this.form.name.trim(),
      notes: (this.form.notes || '').trim() || null,
      interval: Math.max(Number(this.form.interval) || 1, 1),
      // Solo viaja lo que la frecuencia usa: mandar un dia del mes en una regla
      // semanal deja un dato que nadie lee y que confunde al editarla.
      weekday: this.form.frequency === 'WEEKLY' ? this.form.weekday ?? 0 : null,
      day_of_month: this.form.frequency === 'MONTHLY' ? this.form.day_of_month ?? 1 : null,
      task_type: this.isCleaning ? this.form.task_type : null,
      ends_on: this.form.ends_on || null
    };

    const request = this.editingId
      ? this.recurringService.updateRecurringWork(this.editingId, payload)
      : this.recurringService.createRecurringWork(payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.closeForm();
        this.load(true);
        this.changed.emit();
      },
      error: () => {
        this.saving = false;
        this.errorMessage = 'No fue posible guardar la programacion. Revisa los datos.';
      }
    });
  }

  // -------------------------------------------------------------- acciones

  toggleActive(rule: RecurringWorkI): void {
    this.recurringService
      .updateRecurringWork(rule.id, { is_active: !rule.is_active })
      .subscribe({
        next: (updated) => {
          rule.is_active = updated?.is_active ?? !rule.is_active;
        },
        error: () => {
          this.errorMessage = 'No fue posible cambiar el estado de la programacion.';
        }
      });
  }

  confirmDelete(rule: RecurringWorkI): void {
    openActionConfirmation(this.confirmationService, {
      action: 'delete',
      target: rule.name,
      onAccept: () => {
        this.recurringService.deleteRecurringWork(rule.id).subscribe({
          next: () => this.load(true),
          error: () => {
            this.errorMessage = 'No fue posible eliminar la programacion.';
          }
        });
      }
    });
  }

  // -------------------------------------------------------------- lectura

  get cleaningRules(): RecurringWorkI[] {
    return this.rules.filter((rule) => rule.kind === 'CLEANING');
  }

  get maintenanceRules(): RecurringWorkI[] {
    return this.rules.filter((rule) => rule.kind === 'MAINTENANCE');
  }

  /** Una regla escrita en castellano, que es como se comprueba que dice lo que debe. */
  describe(rule: {
    frequency: RecurringWorkFrequency;
    interval: number;
    weekday?: number | null;
    day_of_month?: number | null;
  }): string {
    const every = rule.interval > 1 ? `cada ${rule.interval} ` : 'cada ';

    if (rule.frequency === 'DAILY') {
      return rule.interval > 1 ? `Cada ${rule.interval} dias` : 'Todos los dias';
    }

    if (rule.frequency === 'WEEKLY') {
      const day = WEEKDAYS[rule.weekday ?? 0] || 'lunes';
      return rule.interval > 1
        ? `${every}semanas, los ${day.toLowerCase()}`
        : `Todos los ${day.toLowerCase()}`;
    }

    const day = rule.day_of_month ?? 1;
    return rule.interval > 1
      ? `${every}meses, el dia ${day}`
      : `El dia ${day} de cada mes`;
  }

  scopeLabel(rule: RecurringWorkI): string {
    return rule.room ? `Habitacion ${rule.room_number || ''}`.trim() : 'Todas las habitaciones';
  }

  /** Cuánto falta para que vuelva a generar: más útil que la fecha suelta. */
  nextRunLabel(rule: RecurringWorkI): string {
    if (!rule.is_active) return 'Pausada';

    const days = this.daysFromToday(rule.next_run_on);
    if (days === null) return 'Sin fecha';
    if (days < 0) return 'Pendiente de generar';
    if (days === 0) return 'Genera hoy';
    if (days === 1) return 'Genera maniana';
    return `Genera en ${days} dias`;
  }

  isImminent(rule: RecurringWorkI): boolean {
    const days = this.daysFromToday(rule.next_run_on);
    return rule.is_active && days !== null && days <= 1;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  trackByRule(_: number, rule: RecurringWorkI): number {
    return rule.id;
  }

  private daysFromToday(value: string | null | undefined): number | null {
    if (!value) return null;
    const target = new Date(`${value}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  }

  private dateKey(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
