from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.services import notify_reservation_upcoming_checkin
from apps.reservations.models import Reservation


EXCLUDED_RESERVATION_STATUS_CODES = {
    "CANCELADA",
    "CANCELADO",
    "CANCELLED",
    "ANULADA",
    "ANULADO",
    "FINALIZADA",
    "FINALIZADO",
    "COMPLETADA",
    "COMPLETADO",
    "CHECKED_OUT",
}


class Command(BaseCommand):
    help = "Genera notificaciones para reservas proximas al check-in."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=1,
            help="Cantidad de dias a revisar desde hoy (por defecto: 1).",
        )
        parser.add_argument(
            "--hotel-settings-id",
            type=int,
            dest="hotel_settings_id",
            default=None,
            help="Filtrar por un hotel especifico.",
        )

    def handle(self, *args, **options):
        days = max(int(options.get("days") or 1), 0)
        hotel_settings_id = options.get("hotel_settings_id")

        today = timezone.localdate()
        end_date = today + timedelta(days=days)

        queryset = (
            Reservation.objects.select_related("hotel_settings", "status", "client")
            .filter(
                real_check_in__isnull=True,
                real_check_out__isnull=True,
                expected_check_in__gte=today,
                expected_check_in__lte=end_date,
            )
            .exclude(status__code__in=EXCLUDED_RESERVATION_STATUS_CODES)
            .order_by("expected_check_in", "id")
        )
        if hotel_settings_id:
            queryset = queryset.filter(hotel_settings_id=hotel_settings_id)

        notifications_created = 0
        reservations_processed = 0

        for reservation in queryset:
            reservations_processed += 1
            days_until = (reservation.expected_check_in - today).days
            notifications_created += len(
                notify_reservation_upcoming_checkin(
                    reservation,
                    days_until=max(days_until, 0),
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Upcoming check-ins processed={reservations_processed} notifications_created={notifications_created}"
            )
        )
