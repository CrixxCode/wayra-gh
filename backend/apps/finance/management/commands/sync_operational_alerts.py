from django.core.management.base import BaseCommand

from apps.finance.services import (
    sync_operational_alerts_for_all_hotels,
    sync_operational_alerts_for_hotel,
)


class Command(BaseCommand):
    help = "Sincroniza alertas operativas (ocupacion, disponibilidad, ingresos y reembolsos)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hotel-settings-id",
            type=int,
            dest="hotel_settings_id",
            help="Id de HotelSettings para sincronizar un solo hotel.",
        )

    def handle(self, *args, **options):
        hotel_settings_id = options.get("hotel_settings_id")
        if hotel_settings_id:
            result = sync_operational_alerts_for_hotel(hotel_settings_id=hotel_settings_id)
            self.stdout.write(
                self.style.SUCCESS(
                    (
                        f"Hotel {hotel_settings_id} -> created={result.get('created', 0)} "
                        f"updated={result.get('updated', 0)} "
                        f"resolved={result.get('resolved', 0)} "
                        f"skipped={result.get('skipped', 0)}"
                    )
                )
            )
            return

        result = sync_operational_alerts_for_all_hotels()
        self.stdout.write(
            self.style.SUCCESS(
                (
                    f"hotels_processed={result.get('hotels_processed', 0)} "
                    f"created={result.get('created', 0)} "
                    f"updated={result.get('updated', 0)} "
                    f"resolved={result.get('resolved', 0)} "
                    f"skipped={result.get('skipped', 0)}"
                )
            )
        )
