"""Materializa el trabajo periodico que ya toca.

    python manage.py generate_recurring_work

**No es obligatorio programarlo.** La API materializa lo vencido al listar limpieza,
mantenimiento o las reglas (ver `apps/rooms/recurring.py`), asi que un hotel sin cron
sigue recibiendo su trabajo en cuanto alguien abre la pantalla.

Este comando existe para quien si tenga un programador y prefiera que el trabajo aparezca
a primera hora aunque nadie haya entrado todavia. Llamar a los dos es seguro: la operacion
es idempotente por dia.
"""

from django.core.management.base import BaseCommand

from apps.rooms.recurring import materialize_due_recurring_work


class Command(BaseCommand):
    help = "Genera las tareas de limpieza y ordenes de mantenimiento periodicas que ya tocan."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Muestra que se generaria sin escribir nada.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        result = materialize_due_recurring_work(dry_run=dry_run)

        for name in result["skipped_names"]:
            self.stdout.write(f"  regla '{name}': sin habitaciones o sin catalogos, se omite")

        prefix = "[dry-run] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Trabajo periodico: {result['created']} registro(s) generados, "
                f"{result['closed']} regla(s) cerradas."
            )
        )
