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

import { PublicHeaderComponent } from '../../shared/public-header/public-header';
import { PublicFooterComponent } from '../../shared/public-footer/public-footer';

@Component({
  selector: 'app-allied-booking-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PublicHeaderComponent,
    PublicFooterComponent,
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

  get clipboardSupported(): boolean {

    return Boolean(
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    );
  }

  copyFeedback = '';

  private copyFeedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    this.confirmationRegion?.nativeElement.focus();
  }

  async copyReservationReference(): Promise<void> {

    if (
      !this.reservationId ||
      !this.clipboardSupported
    ) {
      return;
    }

    try {

      await navigator.clipboard.writeText(
        this.reservationId
      );
    } catch {
      // Clipboard write can fail (permission denied, insecure context,
      // etc.). The reference stays visible as plain text either way, so
      // there is nothing to recover from here — just skip the feedback.
      return;
    }

    this.copyFeedback = 'Referencia copiada.';

    if (this.copyFeedbackTimeoutId !== null) {
      clearTimeout(this.copyFeedbackTimeoutId);
    }

    this.copyFeedbackTimeoutId = setTimeout(() => {
      this.copyFeedback = '';
      this.copyFeedbackTimeoutId = null;
    }, 2500);
  }
}
