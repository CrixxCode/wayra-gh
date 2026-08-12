import { CommonModule } from '@angular/common';
import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { CleaningTasksService } from '../../../services/cleaning-task';
import { MaintenanceOrdersService } from '../../../services/maintenance-order';
import { MotionService } from '../../../services/motion';
import { CleaningTaskI } from '../../cleaning-tasks/cleaning-task-model';
import { ListCleaningTasks } from '../../cleaning-tasks/list-cleaning-tasks/list-cleaning-tasks';
import { MaintenanceOrderI } from '../../maintenance-orders/maintenance-order-model';
import { ListMaintenanceOrders } from '../../maintenance-orders/list-maintenance-orders/list-maintenance-orders';
import { RoomWorkload } from '../room-workload/room-workload';

export type OperationsTab = 'cleaning' | 'maintenance' | 'rooms';

type TabDefinition = {
  key: OperationsTab;
  label: string;
  icon: string;
  hint: string;
};

/** Tarjeta del resumen: un número y qué hacer con él. */
export type OperationsMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  tab: OperationsTab;
};

/** Habitación que se sigue entre pestañas. */
export type OperationsFocus = {
  id: number;
  label: string;
};

/** Códigos que significan "esto ya está hecho". */
const DONE_CODES = ['COMPLETADA', 'COMPLETADO', 'COMPLETED', 'DONE', 'CERRADA', 'CERRADO'];

/** Códigos que significan "ni siquiera ha empezado". */
const PENDING_CODES = ['PENDIENTE', 'PENDING', 'ABIERTA', 'ABIERTO', 'NUEVA', 'NUEVO'];

/**
 * Limpieza y mantenimiento: el trabajo pendiente sobre las habitaciones.
 *
 * Las dos eran rutas separadas, pero son **la misma clase de objeto**: una orden de
 * trabajo sobre una habitación, con estado, prioridad y fecha. Tan iguales que
 * `CleaningTask.priority` y `MaintenanceOrder.priority` apuntan al **mismo catálogo**
 * (`MAINTENANCE_PRIORITY`), y sus dos pantallas mostraban las mismas cinco métricas con
 * los mismos rótulos: total, pendientes, en proceso, atrasadas y completadas.
 *
 * Lo que aporta el contenedor y no tenía ninguna: **la habitación como unidad de
 * trabajo**. Una habitación puede tener a la vez una tarea de limpieza y una orden de
 * mantenimiento, y hasta ahora no había forma de verlo junto — que es justo lo que
 * decide si se puede vender esa noche.
 */
@Component({
  selector: 'app-operations-page',
  standalone: true,
  imports: [CommonModule, ListCleaningTasks, ListMaintenanceOrders, RoomWorkload],
  templateUrl: './operations-page.html',
  styleUrls: ['./operations-page.css']
})
export class OperationsPage implements OnInit, OnDestroy {
  activeTab: OperationsTab = 'rooms';

  /** Solo la primera carga del resumen. */
  loading = true;

  /** Recarga disparada por un cambio en una pestaña. */
  refreshing = false;

  tasks: CleaningTaskI[] = [];
  orders: MaintenanceOrderI[] = [];

  /** Habitación que se sigue: desde el tablero se salta a su trabajo concreto. */
  focus: OperationsFocus | null = null;

  readonly tabs: TabDefinition[] = [
    {
      key: 'rooms',
      label: 'Por habitacion',
      icon: 'fa-solid fa-bed',
      hint: 'Que le falta a cada habitacion para poder venderse'
    },
    {
      key: 'cleaning',
      label: 'Limpieza',
      icon: 'fa-solid fa-broom',
      hint: 'Tareas de limpieza y su estado'
    },
    {
      key: 'maintenance',
      label: 'Mantenimiento',
      icon: 'fa-solid fa-screwdriver-wrench',
      hint: 'Averias reportadas y su reparacion'
    }
  ];

  private revealFrame: number | null = null;
  private revealed = false;

  constructor(
    private cleaningService: CleaningTasksService,
    private maintenanceService: MaintenanceOrdersService,
    private motion: MotionService,
    private hostRef: ElementRef<HTMLElement>,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const requested = String(this.route.snapshot.queryParamMap.get('tab') || '');
    if (this.isTab(requested)) this.activeTab = requested;

    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    this.motion.killWithin(this.hostRef.nativeElement);
  }

  // --------------------------------------------------------------------- datos

  loadSummary(forceRefresh = false, silent = false): void {
    if (silent) this.refreshing = true;
    else this.loading = true;

    forkJoin({
      tasks: this.cleaningService
        .listCleaningTasks({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as CleaningTaskI[]))),
      orders: this.maintenanceService
        .listMaintenanceOrders({ include_inactive: true, forceRefresh })
        .pipe(catchError(() => of([] as MaintenanceOrderI[])))
    }).subscribe(({ tasks, orders }) => {
      this.loading = false;
      this.refreshing = false;
      this.tasks = tasks;
      this.orders = orders;

      if (!this.revealed) {
        this.revealed = true;
        this.scheduleReveal();
      }
    });
  }

  // ------------------------------------------------------------------ pestañas

  selectTab(tab: OperationsTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true
    });

    this.scheduleReveal();
  }

  tabCount(tab: OperationsTab): number {
    if (tab === 'cleaning') return this.openTasks.length;
    if (tab === 'maintenance') return this.openOrders.length;
    return this.roomsWithWork.length;
  }

  /** Sigue una habitación en otra pestaña, ya filtrada por ella. */
  followRoom(room: OperationsFocus, tab: OperationsTab): void {
    this.focus = room;
    this.selectTab(tab);
  }

  clearFocus(): void {
    this.focus = null;
  }

  // ---------------------------------------------------------------- lo abierto

  get openTasks(): CleaningTaskI[] {
    return this.tasks.filter((task) => !this.isDone(task.status_label ?? task.status));
  }

  get openOrders(): MaintenanceOrderI[] {
    return this.orders.filter((order) => !this.isDone(order.status_label ?? order.status));
  }

  /** Sin empezar: la cola de verdad, no lo que ya está en manos de alguien. */
  get untouchedCount(): number {
    const tasks = this.openTasks.filter((task) => this.isPending(task.status_label ?? task.status));
    const orders = this.openOrders.filter((order) =>
      this.isPending(order.status_label ?? order.status)
    );
    return tasks.length + orders.length;
  }

  /**
   * Atrasado: tenía fecha y ya pasó.
   *
   * En limpieza la fecha es `scheduled_for` (cuándo tocaba) y en mantenimiento
   * `estimated_completed_at` (cuándo se prometió). Son la misma idea: un compromiso
   * incumplido.
   */
  get overdueCount(): number {
    const today = this.todayKey();

    const tasks = this.openTasks.filter(
      (task) => !!task.scheduled_for && this.dayKey(task.scheduled_for) < today
    );
    const orders = this.openOrders.filter(
      (order) => !!order.estimated_completed_at && this.dayKey(order.estimated_completed_at) < today
    );

    return tasks.length + orders.length;
  }

  get doneTodayCount(): number {
    const today = this.todayKey();
    const tasks = this.tasks.filter(
      (task) => !!task.completed_at && this.dayKey(task.completed_at) === today
    );
    const orders = this.orders.filter(
      (order) => !!order.completed_at && this.dayKey(order.completed_at) === today
    );
    return tasks.length + orders.length;
  }

  /**
   * El trabajo agrupado por habitación.
   *
   * Es lo que ninguna de las dos vistas podía contestar: qué le falta a la 101. Una
   * habitación con limpieza pendiente **y** una avería abierta no es lo mismo que una
   * con solo una de las dos, y esa diferencia decide si se puede vender esa noche.
   */
  get roomsWithWork(): Array<{
    id: number;
    label: string;
    tasks: CleaningTaskI[];
    orders: MaintenanceOrderI[];
    overdue: number;
  }> {
    const rooms = new Map<number, { id: number; label: string; tasks: CleaningTaskI[]; orders: MaintenanceOrderI[]; overdue: number }>();
    const today = this.todayKey();

    const ensure = (id: unknown, label: unknown) => {
      const roomId = Number(id);
      if (!Number.isFinite(roomId) || roomId <= 0) return null;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          id: roomId,
          label: String(label || '').trim() || 'Habitacion sin numero',
          tasks: [],
          orders: [],
          overdue: 0
        });
      }
      return rooms.get(roomId)!;
    };

    for (const task of this.openTasks) {
      const entry = ensure(task.room, task.room_number);
      if (!entry) continue;
      entry.tasks.push(task);
      if (task.scheduled_for && this.dayKey(task.scheduled_for) < today) entry.overdue += 1;
    }

    for (const order of this.openOrders) {
      const entry = ensure(order.room, order.room_number);
      if (!entry) continue;
      entry.orders.push(order);
      if (order.estimated_completed_at && this.dayKey(order.estimated_completed_at) < today) {
        entry.overdue += 1;
      }
    }

    // Primero lo atrasado, luego lo que acumula mas trabajo.
    return [...rooms.values()].sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      const load = b.tasks.length + b.orders.length - (a.tasks.length + a.orders.length);
      if (load !== 0) return load;
      return a.label.localeCompare(b.label, 'es', { numeric: true });
    });
  }

  /** Las que tienen las dos cosas abiertas: no se resuelven con un solo equipo. */
  get roomsBlockedByBoth(): number {
    return this.roomsWithWork.filter((room) => room.tasks.length > 0 && room.orders.length > 0)
      .length;
  }

  get metrics(): OperationsMetric[] {
    const overdue = this.overdueCount;
    const both = this.roomsBlockedByBoth;

    return [
      {
        key: 'rooms',
        label: 'Habitaciones con trabajo',
        value: String(this.roomsWithWork.length),
        note: both ? `${both} necesitan limpieza y reparacion` : 'Ninguna con doble frente',
        icon: 'fa-solid fa-bed',
        tone: both ? 'warning' : 'brand',
        tab: 'rooms'
      },
      {
        key: 'overdue',
        label: 'Atrasadas',
        value: String(overdue),
        note: overdue ? 'Paso su fecha y siguen abiertas' : 'Nada fuera de plazo',
        icon: 'fa-solid fa-clock',
        tone: overdue ? 'danger' : 'success',
        tab: 'rooms'
      },
      {
        key: 'queue',
        label: 'Sin empezar',
        value: String(this.untouchedCount),
        note: `${this.openTasks.length} limpieza, ${this.openOrders.length} mantenimiento`,
        icon: 'fa-solid fa-list-check',
        tone: this.untouchedCount ? 'warning' : 'success',
        tab: 'cleaning'
      },
      {
        key: 'done',
        label: 'Cerradas hoy',
        value: String(this.doneTodayCount),
        note: 'Trabajo terminado en el dia',
        icon: 'fa-solid fa-circle-check',
        tone: 'success',
        tab: 'maintenance'
      }
    ];
  }

  trackByTab(_: number, tab: TabDefinition): string {
    return tab.key;
  }

  trackByMetric(_: number, metric: OperationsMetric): string {
    return metric.key;
  }

  onWorkChanged(): void {
        // Sin forzar: la escritura ya invalido el cache desde el servicio, asi que esto
    // va al servidor igual. Forzarlo ademas anularia la deduplicacion de peticiones
    // en vuelo y la lista de la pestaña pediria lo mismo por segunda vez.
    this.loadSummary(false, true);
  }

  // ---------------------------------------------------------------- animacion

  private scheduleReveal(): void {
    if (this.motion.prefersReducedMotion) return;
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);

    this.zone.runOutsideAngular(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = null;
        const host = this.hostRef.nativeElement;

        this.motion.reveal(host.querySelectorAll('.ops-metric'), { stagger: 0.045, y: 14 });
        this.motion.reveal(host.querySelectorAll('.ops-tab'), {
          stagger: 0.04,
          y: 10,
          duration: 0.26
        });
        this.motion.reveal(host.querySelectorAll('.ops-panel'), { stagger: 0, y: 12, delay: 0.06 });
      });
    });
  }

  // ------------------------------------------------------------------ helpers

  private isTab(value: string): value is OperationsTab {
    return value === 'cleaning' || value === 'maintenance' || value === 'rooms';
  }

  private isDone(status: unknown): boolean {
    return DONE_CODES.includes(this.normalize(status));
  }

  private isPending(status: unknown): boolean {
    return PENDING_CODES.includes(this.normalize(status));
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  private todayKey(): string {
    return this.dayKey(new Date().toISOString());
  }

  /** Solo la parte de fecha: comparar instantes daría falsos atrasos por la hora. */
  private dayKey(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    return `${parsed.getFullYear()}-${month}-${day}`;
  }
}
