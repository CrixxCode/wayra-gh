import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  ViewChild,
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
export class AlliedBookingConfirmationPage implements AfterViewInit {

  private readonly route = inject(ActivatedRoute);

  @ViewChild('confirmationRegion')
  private readonly confirmationRegion?: ElementRef<HTMLElement>;

  readonly reservationId =
    this.route.snapshot.paramMap.get('reservationId') ?? '';

  readonly hotelName =
    this.route.snapshot.queryParamMap.get('hotel') ?? '';

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

  get hasConfirmationDetails(): boolean {

    return Boolean(
      this.hotelName ||
      this.reservationId ||
      this.hasStayDates
    );
  }

  ngAfterViewInit(): void {
    this.confirmationRegion?.nativeElement.focus();
  }
}
