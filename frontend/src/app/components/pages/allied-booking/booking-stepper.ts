import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type BookingStep = 1 | 2 | 3;

interface BookingStepDefinition {
  step: BookingStep;
  label: string;
}

/**
 * Barra de progreso de la reserva a hoteles aliados: 3 pasos reales (Buscar,
 * Tarifa, Datos), no los 4 del prototipo de diseno original (ese incluye un
 * paso de "Pago" que no existe aqui — la reserva queda como solicitud para
 * que el hotel confirme disponibilidad, sin cobro en linea). El tratamiento
 * visual (nodos numerados conectados por una linea, en una franja oscura
 * bajo el hero) si replica el del prototipo.
 */
@Component({
  selector: 'app-booking-stepper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking-stepper.html',
  styleUrl: './booking-stepper.css',
})
export class BookingStepperComponent {
  @Input({ required: true }) currentStep!: BookingStep;

  readonly steps: BookingStepDefinition[] = [
    { step: 1, label: 'Buscar' },
    { step: 2, label: 'Habitación' },
    { step: 3, label: 'Datos' },
  ];

  stateFor(step: BookingStep): 'done' | 'active' | 'pending' {
    if (step < this.currentStep) {
      return 'done';
    }

    if (step === this.currentStep) {
      return 'active';
    }

    return 'pending';
  }

  trackByStep(_index: number, item: BookingStepDefinition): number {
    return item.step;
  }
}
