"""Borra las habitaciones sobrantes que quedaron en un piso, sin tocar las reales.

Existe por el error de la solicitud de demo: hasta 2026-09-14 la conversion creaba un
unico piso con **todas** las habitaciones del hotel, asi que hoteles con varios pisos
quedaron con un "Piso 1" inflado. Corregirlo a mano desde el admin es tedioso y
peligroso; este comando lo hace en seco primero y solo borra lo que nadie ha usado.

Uso tipico (primero en seco, siempre):

    python manage.py prune_floor_rooms --hotel "Nombre del hotel" --floor 1 --keep 16
    python manage.py prune_floor_rooms --hotel "Nombre del hotel" --floor 1 --keep 16 --apply

Tambien acepta numeros explicitos en vez de `--keep`:

    python manage.py prune_floor_rooms --hotel 3 --floor 1 --numbers 117,118,119
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.hotel_settings.models import HotelFloor, HotelSettings
from apps.rooms.models import Room


# Relaciones que apuntan a `Room` con CASCADE: si la habitacion se borra, estas filas se
# van con ella sin avisar. Una habitacion con cualquiera de estas ya se uso, asi que el
# comando no la toca y la reporta. Las otras dos relaciones (`reservation_details` y
# `inventory_check_lines`) son PROTECT, o sea que la base de datos las frena sola; aun
# asi se revisan aqui para poder explicar el motivo en vez de reventar con ProtectedError.
ROOM_USAGE_RELATIONS = [
    ("reservation_details", "reservas"),
    ("inventory_check_lines", "chequeos de inventario"),
    ("maintenance_orders", "ordenes de mantenimiento"),
    ("cleaning_tasks", "tareas de limpieza"),
    ("recurring_work", "trabajos periodicos"),
    ("room_inventory_items", "inventario asignado"),
    ("photos", "fotos"),
]


class Command(BaseCommand):
    help = (
        "Borra las habitaciones sobrantes de un piso (las que nadie ha usado) y deja "
        "`HotelFloor.room_count` cuadrado. Corre en seco salvo que se pase --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--hotel",
            required=True,
            help="Id del hotel, o parte de su nombre (debe coincidir con uno solo).",
        )
        parser.add_argument(
            "--floor",
            required=True,
            type=int,
            help="Numero de piso (`HotelFloor.floor_number`), no su id.",
        )
        parser.add_argument(
            "--keep",
            type=int,
            help="Cuantas habitaciones debe quedar el piso, en orden de numero. Sobran las demas.",
        )
        parser.add_argument(
            "--numbers",
            help="Numeros exactos a borrar, separados por coma (alternativa a --keep).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Ejecuta el borrado. Sin esta bandera solo muestra lo que haria.",
        )

    def handle(self, *args, **options):
        keep = options.get("keep")
        raw_numbers = options.get("numbers")

        if (keep is None) == (not raw_numbers):
            raise CommandError("Usa --keep o --numbers, pero no los dos ni ninguno.")

        hotel = self.resolve_hotel(options["hotel"])
        floor = self.resolve_floor(hotel, options["floor"])

        rooms = list(
            Room.objects.filter(floor=floor)
            .select_related("status")
            .order_by("number", "id")
        )

        self.stdout.write(
            f"Hotel: {hotel.hotel_name} (id {hotel.pk})\n"
            f"Piso: {floor.name} (numero {floor.floor_number}, id {floor.pk})\n"
            f"Habitaciones actuales: {len(rooms)} "
            f"(room_count declarado: {floor.room_count})"
        )

        targets = (
            self.targets_by_keep(rooms, keep)
            if keep is not None
            else self.targets_by_numbers(rooms, raw_numbers)
        )

        if not targets:
            self.stdout.write(self.style.SUCCESS("No hay habitaciones sobrantes. Nada que hacer."))
            return

        removable, blocked = self.split_by_usage(targets)

        if blocked:
            self.stdout.write(self.style.WARNING("\nNo se tocan (ya tienen datos):"))
            for room, reasons in blocked:
                self.stdout.write(f"  - {room.number}: {', '.join(reasons)}")

        if not removable:
            raise CommandError(
                "Todas las habitaciones candidatas ya tienen datos asociados. "
                "Revisa los numeros antes de insistir: borrarlas perderia informacion real."
            )

        self.stdout.write(
            self.style.WARNING(f"\nSe borrarian {len(removable)} habitaciones:")
        )
        self.stdout.write("  " + ", ".join(room.number for room in removable))

        remaining = len(rooms) - len(removable)
        self.stdout.write(f"\nEl piso quedaria con {remaining} habitaciones.")

        if not options["apply"]:
            self.stdout.write(
                self.style.NOTICE("\nCorrida en seco. Repite el comando con --apply para ejecutarlo.")
            )
            return

        with transaction.atomic():
            deleted_numbers = [room.number for room in removable]
            Room.objects.filter(pk__in=[room.pk for room in removable]).delete()

            floor.room_count = Room.objects.filter(floor=floor).count()
            floor.save(update_fields=["room_count"])

        self.stdout.write(
            self.style.SUCCESS(
                f"\nListo. Borradas {len(deleted_numbers)} habitaciones "
                f"({', '.join(deleted_numbers)}). "
                f"room_count del piso: {floor.room_count}."
            )
        )

    # ------------------------------------------------------------------ helpers

    def resolve_hotel(self, raw_hotel: str) -> HotelSettings:
        if str(raw_hotel).isdigit():
            hotel = HotelSettings.objects.filter(pk=int(raw_hotel)).first()
            if hotel is None:
                raise CommandError(f"No existe un hotel con id {raw_hotel}.")
            return hotel

        matches = list(HotelSettings.objects.filter(hotel_name__icontains=raw_hotel)[:10])

        if not matches:
            raise CommandError(f"Ningun hotel coincide con '{raw_hotel}'.")

        if len(matches) > 1:
            names = "\n".join(f"  - {hotel.pk}: {hotel.hotel_name}" for hotel in matches)
            raise CommandError(
                f"'{raw_hotel}' coincide con varios hoteles. Usa el id:\n{names}"
            )

        return matches[0]

    def resolve_floor(self, hotel: HotelSettings, floor_number: int) -> HotelFloor:
        floor = HotelFloor.objects.filter(
            hotel_settings=hotel, floor_number=floor_number
        ).first()

        if floor is None:
            available = ", ".join(
                str(number)
                for number in HotelFloor.objects.filter(hotel_settings=hotel)
                .order_by("floor_number")
                .values_list("floor_number", flat=True)
            )
            raise CommandError(
                f"El hotel no tiene un piso numero {floor_number}. "
                f"Pisos disponibles: {available or 'ninguno'}."
            )

        return floor

    def targets_by_keep(self, rooms, keep: int):
        if keep < 0:
            raise CommandError("--keep no puede ser negativo.")
        # El orden es por numero, asi que se conservan las primeras: 101..116 y sobran
        # las de arriba, que es como quedaron las que creo el bug.
        return rooms[keep:]

    def targets_by_numbers(self, rooms, raw_numbers: str):
        wanted = [
            number.strip()
            for number in str(raw_numbers).split(",")
            if number.strip()
        ]
        by_number = {room.number: room for room in rooms}
        missing = [number for number in wanted if number not in by_number]

        if missing:
            raise CommandError(
                f"Estas habitaciones no estan en el piso: {', '.join(missing)}."
            )

        return [by_number[number] for number in wanted]

    def split_by_usage(self, rooms):
        removable = []
        blocked = []

        for room in rooms:
            reasons = [
                label
                for relation, label in ROOM_USAGE_RELATIONS
                if getattr(room, relation).exists()
            ]

            if reasons:
                blocked.append((room, reasons))
            else:
                removable.append(room)

        return removable, blocked
