import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-public-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './public-footer.html',
  styleUrl: './public-footer.css',
})
export class PublicFooterComponent {

  readonly year = new Date().getFullYear();
}
