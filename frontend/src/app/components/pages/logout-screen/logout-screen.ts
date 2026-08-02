import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingScreen } from '../loading-screen/loading-screen';

@Component({
  selector: 'app-logout-screen',
  standalone: true,
  imports: [CommonModule, LoadingScreen],
  templateUrl: './logout-screen.html',
  styleUrls: ['./logout-screen.css']
})
export class LogoutScreen {
  show = true;

  /** Oculta el loader con una animación */
  hide(): void {
    this.show = false;
  }
}
