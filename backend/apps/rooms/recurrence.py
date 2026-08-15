"""Calculo de fechas de las reglas de trabajo periodico.

Vive aparte del modelo y del comando a proposito: es la unica parte con aritmetica de
calendario, y es la que hay que poder probar sin base de datos ni reloj.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta

from apps.rooms.models import RecurringWork


def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _add_months(value: date, months: int) -> date:
    """Suma meses conservando el dia cuando existe.

    Sumar un mes al 31 de enero no da el 31 de febrero: da el 28 (o 29). Es lo que
    espera quien programa "el ultimo dia de cada mes" poniendo 31.
    """
    total = value.month - 1 + months
    year = value.year + total // 12
    month = total % 12 + 1
    day = min(value.day, _last_day_of_month(year, month))
    return date(year, month, day)


def _on_or_after_weekday(value: date, weekday: int) -> date:
    """Primer dia con ese dia de la semana, contando el propio `value`."""
    delta = (weekday - value.weekday()) % 7
    return value + timedelta(days=delta)


def _month_occurrence(year: int, month: int, day_of_month: int) -> date:
    """El dia pedido dentro del mes, recortado al ultimo si el mes es mas corto."""
    return date(year, month, min(day_of_month, _last_day_of_month(year, month)))


def first_run_on(rule: RecurringWork) -> date:
    """Primera fecha en la que la regla toca, a partir de su inicio.

    No es siempre `starts_on`: una regla semanal que arranca un miercoles pero corre los
    lunes toca por primera vez el lunes siguiente.
    """
    start = rule.starts_on

    if rule.frequency == RecurringWork.Frequency.DAILY:
        return start

    if rule.frequency == RecurringWork.Frequency.WEEKLY:
        return _on_or_after_weekday(start, int(rule.weekday or 0))

    candidate = _month_occurrence(start.year, start.month, int(rule.day_of_month or 1))
    if candidate >= start:
        return candidate

    following = _add_months(date(start.year, start.month, 1), 1)
    return _month_occurrence(following.year, following.month, int(rule.day_of_month or 1))


def next_run_after(rule: RecurringWork, current: date) -> date:
    """La fecha siguiente a `current`, respetando el intervalo.

    El intervalo se cuenta sobre la ocurrencia anterior, no sobre hoy: una regla
    quincenal que no se genero durante un mes vuelve a su ritmo desde su ultima fecha
    prevista, sin arrastrar el retraso indefinidamente.
    """
    interval = max(int(rule.interval or 1), 1)

    if rule.frequency == RecurringWork.Frequency.DAILY:
        return current + timedelta(days=interval)

    if rule.frequency == RecurringWork.Frequency.WEEKLY:
        return current + timedelta(weeks=interval)

    following = _add_months(date(current.year, current.month, 1), interval)
    return _month_occurrence(following.year, following.month, int(rule.day_of_month or current.day))


def is_finished(rule: RecurringWork, run_on: date) -> bool:
    """La regla ya paso su fecha de fin."""
    return bool(rule.ends_on and run_on > rule.ends_on)


def advance(rule: RecurringWork, today: date) -> date:
    """Adelanta `next_run_on` hasta dejarlo por delante de hoy.

    Si el comando no corrio durante varios dias, la regla podria haber acumulado varias
    ocurrencias vencidas. **Se genera una sola vez** y se salta el resto: cinco tareas de
    limpieza identicas del lunes al viernes no son trabajo pendiente, son ruido que
    alguien tendria que cerrar a mano.
    """
    run_on = rule.next_run_on
    while run_on <= today:
        run_on = next_run_after(rule, run_on)
    return run_on
