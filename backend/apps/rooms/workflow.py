"""
Flujo de las tareas de limpieza y las ordenes de mantenimiento (auditoria, Bloque 4 #11-13).

Decisiones del 2026-10-09 (ver AGENTS.md 5.21):

- **Estados.** Pendiente -> En proceso -> Completada, y Pendiente -> Completada directo para
  las tareas rapidas. Mantenimiento ademas se puede Cancelar desde Pendiente o En proceso. Una
  tarea Completada o Cancelada no se reabre: se crea otra. Antes el frontend simulaba la
  secuencia con botones, pero un PATCH directo podia saltar o reabrir sin control.
- **Responsable.** Solo usuarios activos del mismo hotel que tengan el permiso de escritura
  del modulo (`cleaning_tasks.write` o `maintenance_orders.write`).
"""

from django.contrib.auth import get_user_model
from django.db.models import Q

from accounts.soft_delete import exclude_soft_deleted

CLEANING = "cleaning"
MAINTENANCE = "maintenance"

PENDING = "PENDIENTE"
IN_PROGRESS = "EN_PROCESO"
COMPLETED = "COMPLETADA"
CANCELLED = "CANCELADA"

# Alias historicos del catalogo: cuentan como el estado canonico.
STATUS_ALIASES = {"COMPLETADO": COMPLETED, "CANCELADO": CANCELLED}

TRANSITIONS = {
    CLEANING: {
        PENDING: {IN_PROGRESS, COMPLETED},
        IN_PROGRESS: {COMPLETED},
        COMPLETED: set(),
    },
    MAINTENANCE: {
        PENDING: {IN_PROGRESS, COMPLETED, CANCELLED},
        IN_PROGRESS: {COMPLETED, CANCELLED},
        COMPLETED: set(),
        CANCELLED: set(),
    },
}

# Con que estado puede nacer una tarea: tambien se registra trabajo ya hecho.
INITIAL_STATUSES = {PENDING, IN_PROGRESS, COMPLETED}

WRITE_SCOPE = {CLEANING: "cleaning_tasks.write", MAINTENANCE: "maintenance_orders.write"}

STATUS_LABELS = {PENDING: "Pendiente", IN_PROGRESS: "En proceso", COMPLETED: "Completada", CANCELLED: "Cancelada"}


def canonical_status(code) -> str:
    normalized = str(code or "").strip().upper()
    return STATUS_ALIASES.get(normalized, normalized)


def status_transition_error(kind: str, current, target) -> str | None:
    """Mensaje si el cambio no se permite; `None` si si. `current=None` es una tarea nueva."""
    target_code = canonical_status(target)
    transitions = TRANSITIONS[kind]

    if current is None:
        if target_code in INITIAL_STATUSES or target_code not in transitions:
            return None
        return f"Una tarea nueva no puede crearse como {STATUS_LABELS.get(target_code, target_code)}."

    current_code = canonical_status(current)
    if current_code == target_code:
        return None
    # Estados que el catalogo agregue por su cuenta no tienen regla: no se bloquean.
    if current_code not in transitions or target_code not in transitions:
        return None
    if target_code in transitions[current_code]:
        return None
    if not transitions[current_code]:
        return (
            f"La tarea ya esta {STATUS_LABELS.get(current_code, current_code).lower()}: no se "
            "reabre. Crea una nueva si hace falta."
        )
    return (
        f"No se puede pasar de {STATUS_LABELS.get(current_code, current_code)} a "
        f"{STATUS_LABELS.get(target_code, target_code)}."
    )


def assignable_users(hotel_settings_id, kind: str):
    """Usuarios activos del hotel con el permiso de escritura del modulo (o su comodin)."""
    scope = WRITE_SCOPE[kind]
    prefix = scope.rsplit(".", 1)[0]
    keys = [scope, f"{prefix}.*", "*"]
    User = get_user_model()
    if not hotel_settings_id:
        return User.objects.none()
    queryset = User.objects.filter(
        hotel_settings_id=hotel_settings_id,
        is_active=True,
    ).filter(
        Q(
            userrole__is_active=True,
            userrole__role__is_active=True,
            userrole__role__roleresource__is_active=True,
            userrole__role__roleresource__resource__is_active=True,
            userrole__role__roleresource__resource__key__in=keys,
        )
    )
    return exclude_soft_deleted(queryset.distinct()).order_by("first_name", "last_name", "username")


def user_display_name(user) -> str:
    if user is None:
        return ""
    full = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full or getattr(user, "username", "") or ""
