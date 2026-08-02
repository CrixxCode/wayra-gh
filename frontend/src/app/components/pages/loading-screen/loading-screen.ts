import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-screen.html',
  styleUrls: ['./loading-screen.css']
})
export class LoadingScreen {
  /** Mensaje opcional a mostrar durante la carga */
  @Input() message: string = 'Cargando...';

  /** Controla la visibilidad del componente */
  @Input() visible: boolean = false;

  /** Controla el color del loader */
  @Input() color: string = '#2563eb';
}
