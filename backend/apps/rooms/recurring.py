"""Materializacion del trabajo periodico.

Vive aparte del comando a proposito: **no puede depender de que alguien programe un
cron**. Un hotel que instala el sistema y crea una regla espera que funcione, no que
funcione si ademas configuro una tarea diaria en el servidor.

Por eso la misma funcion la llaman dos sitios:

1. El comando `generate_recurring_work`, para quien si tenga un programador (Railway,
   cron) y quiera que el trabajo aparezca a primera hora aunque nadie abra la pantalla.
2. **La propia API**, al listar limpieza, mantenimiento o las reglas. Abrir la pantalla
   pone al dia lo que ya vencio.

Que se llame desde los dos lados es seguro porque la operacion es **idempotente por
dia**: al generar, `next_run_on` queda por delante de hoy, y el bloqueo de fila impide
que dos peticiones simultaneas generen lo mismo dos veces.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.master_data.models import MasterData
from apps.rooms.models import CleaningTask, MaintenanceOrder, RecurringWork, Room
from apps.rooms.operations import _exclude_soft_deleted
from apps.rooms.recurrence import advance, is_finished


def _default_status(group: str, codes: list[str]):
    """Primer estado disponible de una lista de codigos preferidos.

    Los catalogos los edita cada hotel, asi que no se puede dar por hecho que exista
    `PENDIENTE`: se prueban los alias y, si no hay ninguno, el primero activo del grupo.
    """
    for code in codes:
        found = MasterData.objects.filter(group=group, code=code, is_active=True).first()
        if found:
            return found

    return (
        MasterData.objects.filter(group=group, is_active=True)
        .order_by("sort_order", "id")
        .first()
    )


def _target_rooms(rule: RecurringWork):
    """Habitaciones a las que aplica la regla.

    Sin habitacion, la regla es del hotel entero: se materializa una por cada habitacion
    viva, que es lo que significa "revision mensual de todas las habitaciones".

    Las habitaciones no tienen `is_active`: su baja es logica y vive en `SoftDeleteMarker`
    (AGENTS.md 5.5), asi que hay que excluirlas a mano o la regla generaria trabajo para
    habitaciones que el hotel ya dio de baja.
    """
    if rule.room_id:
        return [rule.room]

    return list(
        _exclude_soft_deleted(
            Room.objects.filter(floor__hotel_settings_id=rule.hotel_settings_id)
        ).order_by("number")
    )


def _rule_notes(rule: RecurringWork) -> str:
    """Deja rastro de que el trabajo salio de una regla, no de una persona."""
    base = (rule.notes or "").strip()
    origin = f"Generado por la programacion '{rule.name}'."
    return f"{base} {origin}".strip() if base else origin


def _materialize(rule: RecurringWork, rooms) -> int:
    if rule.kind == RecurringWork.Kind.CLEANING:
        status = _default_status(MasterData.Group.CLEANING_STATUS, ["PENDIENTE", "PENDING", "NUEVA"])
        if status is None:
            return 0

        CleaningTask.objects.bulk_create(
            [
                CleaningTask(
                    room=room,
                    task_type=rule.task_type,
                    status=status,
                    priority=rule.priority,
                    scheduled_for=rule.next_run_on,
                    notes=_rule_notes(rule),
                )
                for room in rooms
            ]
        )
        return len(rooms)

    status = _default_status(MasterData.Group.MAINTENANCE_STATUS, ["PENDIENTE", "PENDING", "ABIERTA"])
    priority = rule.priority or _default_status(
        MasterData.Group.MAINTENANCE_PRIORITY, ["MEDIA", "NORMAL", "BAJA"]
    )
    if status is None or priority is None:
        return 0

    MaintenanceOrder.objects.bulk_create(
        [
            MaintenanceOrder(
                room=room,
                title=rule.name,
                description=_rule_notes(rule),
                priority=priority,
                status=status,
            )
            for room in rooms
        ]
    )
    return len(rooms)


def has_due_rules(hotel_settings_id: int | None = None) -> bool:
    """Comprobacion barata para no abrir una transaccion en cada lectura.

    Es una consulta por indice (`next_run_on`), asi que el caso normal --nada vencido--
    cuesta practicamente nada.
    """
    queryset = RecurringWork.objects.filter(is_active=True, next_run_on__lte=timezone.localdate())
    if hotel_settings_id is not None:
        queryset = queryset.filter(hotel_settings_id=hotel_settings_id)
    return queryset.exists()


def materialize_due_recurring_work(
    hotel_settings_id: int | None = None,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """Genera el trabajo de las reglas vencidas y las adelanta.

    Devuelve cuantos registros se crearon y cuantas reglas se cerraron por llegar a su
    fecha de fin.
    """
    today = timezone.localdate()
    created_total = 0
    closed_total = 0
    skipped_rules: list[str] = []

    due_ids = list(
        RecurringWork.objects.filter(is_active=True, next_run_on__lte=today)
        .filter(**({"hotel_settings_id": hotel_settings_id} if hotel_settings_id else {}))
        .values_list("id", flat=True)
    )

    for rule_id in due_ids:
        with transaction.atomic():
            # Bloqueo de fila y **revision dentro de la transaccion**: dos peticiones
            # simultaneas de la misma pantalla no pueden generar el mismo dia dos veces.
            rule = (
                RecurringWork.objects.select_for_update()
                .select_related("room", "task_type", "priority")
                .filter(id=rule_id, is_active=True, next_run_on__lte=today)
                .first()
            )
            if rule is None:
                continue

            if is_finished(rule, rule.next_run_on):
                closed_total += 1
                if not dry_run:
                    rule.is_active = False
                    rule.save(update_fields=["is_active", "updated_at"])
                continue

            rooms = _target_rooms(rule)
            if not rooms:
                skipped_rules.append(rule.name)
                continue

            if dry_run:
                created_total += len(rooms)
                continue

            created = _materialize(rule, rooms)
            if not created:
                skipped_rules.append(rule.name)
                continue

            created_total += created
            rule.last_generated_on = rule.next_run_on
            rule.generated_count += created
            rule.next_run_on = advance(rule, today)
            # Si al adelantar se paso del fin, la regla ya cumplio su ciclo.
            if is_finished(rule, rule.next_run_on):
                rule.is_active = False

            rule.save(
                update_fields=[
                    "last_generated_on",
                    "generated_count",
                    "next_run_on",
                    "is_active",
                    "updated_at",
                ]
            )

    return {
        "created": created_total,
        "closed": closed_total,
        "skipped": len(skipped_rules),
        "skipped_names": skipped_rules,
    }
