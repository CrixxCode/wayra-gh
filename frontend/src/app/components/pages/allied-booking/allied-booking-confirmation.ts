import { CommonModule } from '@angular/common';
import {
  Component,
  inject,
} from '@angular/core';
import {
  ActivatedRoute,
  RouterLink,
} from '@angular/router';

@Component({
  selector: 'app-allied-booking-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
  ],
  templateUrl: './allied-booking-confirmation.html',
  styleUrl: './allied-booking.css',
})
export class AlliedBookingConfirmationPage {

  private readonly route = inject(ActivatedRoute);

  readonly checkIn =
    this.route.snapshot.queryParamMap.get('checkIn') ?? '';

  readonly checkOut =
    this.route.snapshot.queryParamMap.get('checkOut') ?? '';

  get hasStayDates(): boolean {

    return Boolean(
      this.checkIn &&
      this.checkOut
    );
  }
}
