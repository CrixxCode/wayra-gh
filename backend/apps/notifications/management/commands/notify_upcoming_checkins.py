from django.core.management.base import BaseCommand

from apps.notifications.scheduled import notify_upcoming_checkins


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
        # La logica vive en `apps.notifications.scheduled`, que tambien la dispara la campana.
        processed, created = notify_upcoming_checkins(
            hotel_settings_id=options.get("hotel_settings_id"),
            days=max(int(options.get("days") or 1), 0),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Upcoming check-ins processed={processed} notifications_created={created}"
            )
        )
