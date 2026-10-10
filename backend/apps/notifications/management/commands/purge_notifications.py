from django.core.management.base import BaseCommand

from apps.notifications.retention import expired_notifications, purge_expired_notifications, retention_days


class Command(BaseCommand):
    help = (
        "Borra las notificaciones vencidas (leidas: NOTIFICATION_READ_RETENTION_DAYS; no leidas: "
        "NOTIFICATION_UNREAD_RETENTION_DAYS). La campana ya lo hace sola una vez al dia por hotel."
    )

    def add_arguments(self, parser):
        parser.add_argument("--hotel-settings-id", type=int, dest="hotel_settings_id", default=None)
        parser.add_argument("--dry-run", action="store_true", help="Solo cuenta, no borra.")

    def handle(self, *args, **options):
        hotel_id = options.get("hotel_settings_id")
        read_days, unread_days = retention_days()
        if options.get("dry_run"):
            count = expired_notifications(hotel_settings_id=hotel_id).count()
            self.stdout.write(f"Se borrarian {count} notificaciones (leidas > {read_days} dias, no leidas > {unread_days}).")
            return
        deleted = purge_expired_notifications(hotel_settings_id=hotel_id)
        self.stdout.write(self.style.SUCCESS(f"Notificaciones borradas: {deleted}."))
