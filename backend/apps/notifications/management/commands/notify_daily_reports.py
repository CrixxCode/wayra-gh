from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.hotel_settings.models import HotelSettings
from apps.notifications.services import notify_daily_report_available


class Command(BaseCommand):
    help = "Genera notificaciones de disponibilidad del reporte diario."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hotel-settings-id",
            type=int,
            dest="hotel_settings_id",
            default=None,
            help="Filtrar por un hotel especifico.",
        )
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Fecha del reporte en formato YYYY-MM-DD (por defecto: hoy).",
        )

    def handle(self, *args, **options):
        hotel_settings_id = options.get("hotel_settings_id")
        raw_date = options.get("date")

        target_date = timezone.localdate()
        if raw_date:
            try:
                target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                self.stdout.write(
                    self.style.ERROR("La fecha debe tener formato YYYY-MM-DD.")
                )
                return

        queryset = HotelSettings.objects.order_by("id")
        if hotel_settings_id:
            queryset = queryset.filter(id=hotel_settings_id)

        hotels_processed = 0
        notifications_created = 0

        for hotel_settings in queryset:
            hotels_processed += 1
            notifications_created += len(
                notify_daily_report_available(
                    hotel_settings=hotel_settings,
                    report_date=target_date,
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Daily reports processed_hotels={hotels_processed} notifications_created={notifications_created}"
            )
        )
