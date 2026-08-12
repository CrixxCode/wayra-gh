import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CleaningTaskI } from '../../cleaning-tasks/cleaning-task-model';
import { MaintenanceOrderI } from '../../maintenance-orders/maintenance-order-model';

/** Una habitación con trabajo abierto encima. */
export type RoomWork = {
  id: number;
  label: string;
  tasks: CleaningTaskI[];
  orders: MaintenanceOrderI[];
  overdue: number;
};

type WorkFilter = 'ALL' | 'OVERDUE' | 'BOTH';

/**
 * Trabajo pendiente agrupado por habitación.
 *
 * Es la pregunta que no contestaba ninguna de las dos listas: *¿qué le falta a la 101?*
 * Una habitación con limpieza pendiente **y** una avería abierta no es lo mismo que una
 * con solo una de las dos, y esa diferencia es la que decide si se puede vender esa
 * noche. Mirándolo por tipo de trabajo, eso no se ve.
 */
@Component({
  selector: 'app-room-workload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-workload.html',
  styleUrls: ['./room-workload.css']
})
export class RoomWorkload {
  @Input() rooms: RoomWork[] = [];

  /** Pide abrir el trabajo de una habitación en su pestaña. */
  @Output() openWork = new EventEmitter<{
    room: { id: number; label: string };
    tab: 'cleaning' | 'maintenance';
  }>();

  search = '';
  filter: WorkFilter = 'ALL';

  readonly filterOptions: Array<{ value: WorkFilter; label: string }> = [
    { value: 'ALL', label: 'Todas' },
    { value: 'OVERDUE', label: 'Con atraso' },
    { value: 'BOTH', label: 'Doble frente' }
  ];

  get visibleRooms(): RoomWork[] {
    const search = this.normalize(this.search);

    return this.rooms.filter((room) => {
      if (this.filter === 'OVERDUE' && room.overdue <= 0) return false;
      if (this.filter === 'BOTH' && !(room.tasks.length && room.orders.length)) return false;

      if (!search) return true;
      return this.normalize(room.label).includes(search);
    });
  }

  workload(room: RoomWork): number {
    return room.tasks.length + room.orders.length;
  }

  /** Necesita dos equipos distintos: no se resuelve con una sola visita. */
  needsBoth(room: RoomWork): boolean {
    return room.tasks.length > 0 && room.orders.length > 0;
  }

  /** Titular de la habitación: lo más grave primero. */
  headline(room: RoomWork): string {
    if (room.overdue > 0) return `${room.overdue} fuera de plazo`;
    if (this.needsBoth(room)) return 'Limpieza y reparacion';
    if (room.orders.length) return 'Solo mantenimiento';
    return 'Solo limpieza';
  }

  tone(room: RoomWork): { bg: string; color: string; bar: string } {
    if (room.overdue > 0) {
      return {
        bg: 'var(--gh-status-danger-bg)',
        color: 'var(--gh-status-danger-text)',
        bar: 'var(--gh-status-danger-strong)'
      };
    }
    if (this.needsBoth(room)) {
      return {
        bg: 'var(--gh-status-orange-bg)',
        color: 'var(--gh-status-orange-text)',
        bar: 'var(--gh-status-warn-strong)'
      };
    }
    return {
      bg: 'var(--gh-status-info-bg)',
      color: 'var(--gh-status-info-text)',
      bar: 'var(--gh-status-info-strong)'
    };
  }

  /** Lo primero de la cola de esa habitación, para no obligar a abrirla. */
  previewLines(room: RoomWork): string[] {
    const lines = [
      ...room.tasks.map((task) => this.taskLabel(task)),
      ...room.orders.map((order) => this.orderLabel(order))
    ];
    return lines.slice(0, 3);
  }

  hiddenLines(room: RoomWork): number {
    return Math.max(this.workload(room) - 3, 0);
  }

  goToCleaning(room: RoomWork): void {
    this.openWork.emit({ room: { id: room.id, label: room.label }, tab: 'cleaning' });
  }

  goToMaintenance(room: RoomWork): void {
    this.openWork.emit({ room: { id: room.id, label: room.label }, tab: 'maintenance' });
  }

  trackByRoom(_: number, room: RoomWork): number {
    return room.id;
  }

  private taskLabel(task: CleaningTaskI): string {
    const type = String(task.task_type_label || task.task_type || 'Limpieza').trim();
    return `Limpieza: ${type}`;
  }

  private orderLabel(order: MaintenanceOrderI): string {
    return `Averia: ${String(order.title || 'Sin titulo').trim()}`;
  }

  private normalize(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }
}
