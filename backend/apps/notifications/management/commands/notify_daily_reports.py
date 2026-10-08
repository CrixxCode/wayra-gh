from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.scheduled import notify_daily_reports


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
        raw_date = options.get("date")
        target_date = timezone.localdate()
        if raw_date:
            try:
                target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError:
                self.stdout.write(self.style.ERROR("La fecha debe tener formato YYYY-MM-DD."))
                return

        # La logica vive en `apps.notifications.scheduled`, que tambien la dispara la campana.
        processed, created = notify_daily_reports(
            hotel_settings_id=options.get("hotel_settings_id"),
            report_date=target_date,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Daily reports processed_hotels={processed} notifications_created={created}"
            )
        )
