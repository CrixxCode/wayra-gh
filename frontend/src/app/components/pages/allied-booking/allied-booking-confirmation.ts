import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PublicFooterComponent } from '../../shared/public-footer/public-footer';
import { PublicHeaderComponent } from '../../shared/public-header/public-header';
import { WebReservationService } from '../../../services/web-reservation';

@Component({
  selector: 'app-allied-booking-confirmation',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicHeaderComponent, PublicFooterComponent],
  templateUrl: './allied-booking-confirmation.html',
  styleUrls: ['./allied-booking.css', './allied-booking-flow.css'],
})
export class AlliedBookingConfirmationPage implements OnInit, AfterViewInit {
  private readonly route = inject(ActivatedRoute);

  @ViewChild('confirmationRegion')
  private readonly confirmationRegion?: ElementRef<HTMLElement>;

  private readonly webReservationService = inject(WebReservationService);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  /** Codigo que trae la URL: solo sirve para pedir la verificacion, no se muestra tal cual. */
  private readonly codeFromUrl = this.route.snapshot.queryParamMap.get('code') ?? '';

  /**
   * Lo que se pinta sale del backend, no de la URL. Antes la pantalla repetia los query
   * params y un enlace manipulado mostraba un hotel y fechas falsos con el dominio de Wayra
   * (auditoria, Bloque 14 #10).
   */
  verification: 'loading' | 'verified' | 'unverified' = 'loading';
  reservationReference = '';
  hotelName = '';
  checkIn = '';
  checkOut = '';

  ngOnInit(): void {
    if (!this.reservationId || !this.codeFromUrl) {
      this.verification = 'unverified';
      return;
    }
    this.webReservationService.getConfirmation(this.reservationId, this.codeFromUrl).subscribe({
      next: (confirmation) => {
        this.reservationReference = confirmation.code;
        this.hotelName = confirmation.hotel_name;
        this.checkIn = confirmation.expected_check_in;
        this.checkOut = confirmation.expected_check_out;
        this.verification = 'verified';
      },
      error: () => {
        this.verification = 'unverified';
      }
    });
  }

  get hasStayDates(): boolean {
    return Boolean(this.checkIn && this.checkOut);
  }

  get hasConfirmationDetails(): boolean {
    return Boolean(this.hotelName || this.reservationReference || this.hasStayDates);
  }

  get clipboardSupported(): boolean {
    return Boolean(typeof navigator !== 'undefined' && navigator.clipboard);
  }

  copyFeedback = '';

  private copyFeedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    this.confirmationRegion?.nativeElement.focus({ preventScroll: true });
  }

  async copyReservationReference(): Promise<void> {
    if (!this.reservationReference || !this.clipboardSupported) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.reservationReference);
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
