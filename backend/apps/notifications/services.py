from __future__ import annotations

from decimal import Decimal
from typing import Iterable, Sequence

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from accounts.tenancy import is_effective_global_admin
from apps.notifications.models import Notification


User = get_user_model()
DEFAULT_MANAGER_ROLE_SLUGS = ("admin", "manager")


def _normalize_choice(value: str | None, valid_values: set[str], default: str) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in valid_values:
        return normalized
    return default


def _resolve_related_reference(
    *,
    related_object=None,
    related_content_type: ContentType | None = None,
    related_object_id: str | int | None = None,
) -> tuple[ContentType | None, str | None]:
    if related_object is not None:
        content_type = ContentType.objects.get_for_model(
            related_object,
            for_concrete_model=False,
        )
        object_id = str(getattr(related_object, "pk", "") or "").strip() or None
        return content_type, object_id

    if related_content_type is not None and related_object_id not in (None, ""):
        return related_content_type, str(related_object_id).strip()

    return None, None


def _resolve_hotel_settings_from_related(related_object):
    if related_object is None:
        return None

    direct_hotel = getattr(related_object, "hotel_settings", None)
    if direct_hotel is not None:
        return direct_hotel

    room = getattr(related_object, "room", None)
    floor = getattr(room, "floor", None)
    if floor is not None and getattr(floor, "hotel_settings", None) is not None:
        return floor.hotel_settings

    reservation = getattr(related_object, "reservation", None)
    if reservation is not None and getattr(reservation, "hotel_settings", None) is not None:
        return reservation.hotel_settings

    invoice = getattr(related_object, "invoice", None)
    if invoice is not None:
        invoice_reservation = getattr(invoice, "reservation", None)
        if invoice_reservation is not None and getattr(invoice_reservation, "hotel_settings", None) is not None:
            return invoice_reservation.hotel_settings

    payment = getattr(related_object, "payment", None)
    if payment is not None:
        payment_invoice = getattr(payment, "invoice", None)
        if payment_invoice is not None:
            payment_reservation = getattr(payment_invoice, "reservation", None)
            if payment_reservation is not None and getattr(payment_reservation, "hotel_settings", None) is not None:
                return payment_reservation.hotel_settings

    item = getattr(related_object, "item", None)
    if item is not None and getattr(item, "hotel_settings", None) is not None:
        return item.hotel_settings

    return None


def create_notification(
    *,
    user,
    title: str,
    message: str,
    notification_type: str = Notification.NotificationType.SYSTEM,
    priority: str = Notification.Priority.MEDIUM,
    hotel_settings=None,
    action_url: str | None = None,
    related_object=None,
    related_content_type: ContentType | None = None,
    related_object_id: str | int | None = None,
    metadata: dict | None = None,
) -> Notification | None:
    if user is None or not getattr(user, "is_active", False):
        return None

    normalized_title = str(title or "").strip()
    normalized_message = str(message or "").strip()
    if not normalized_title or not normalized_message:
        return None

    normalized_type = _normalize_choice(
        notification_type,
        {choice.value for choice in Notification.NotificationType},
        Notification.NotificationType.SYSTEM,
    )
    normalized_priority = _normalize_choice(
        priority,
        {choice.value for choice in Notification.Priority},
        Notification.Priority.MEDIUM,
    )

    resolved_hotel = hotel_settings or _resolve_hotel_settings_from_related(related_object)
    if resolved_hotel is None and not is_effective_global_admin(user):
        resolved_hotel = getattr(user, "hotel_settings", None)

    if not is_effective_global_admin(user):
        user_hotel_id = getattr(user, "hotel_settings_id", None)
        if user_hotel_id is None:
            return None
        if resolved_hotel is None or getattr(resolved_hotel, "id", None) != user_hotel_id:
            return None

    resolved_content_type, resolved_object_id = _resolve_related_reference(
        related_object=related_object,
        related_content_type=related_content_type,
        related_object_id=related_object_id,
    )

    return Notification.objects.create(
        hotel_settings=resolved_hotel,
        user=user,
        title=normalized_title,
        message=normalized_message,
        notification_type=normalized_type,
        priority=normalized_priority,
        action_url=(str(action_url or "").strip() or None),
        related_content_type=resolved_content_type,
        related_object_id=resolved_object_id,
        metadata=metadata or {},
    )


def notify_users(
    users: Iterable,
    *,
    title: str,
    message: str,
    notification_type: str = Notification.NotificationType.SYSTEM,
    priority: str = Notification.Priority.MEDIUM,
    hotel_settings=None,
    action_url: str | None = None,
    related_object=None,
    related_content_type: ContentType | None = None,
    related_object_id: str | int | None = None,
    metadata: dict | None = None,
) -> list[Notification]:
    created: list[Notification] = []
    seen_user_ids: set[str] = set()

    for user in users or []:
        user_id = str(getattr(user, "id", "") or "")
        if not user_id or user_id in seen_user_ids:
            continue
        seen_user_ids.add(user_id)

        notification = create_notification(
            user=user,
            title=title,
            message=message,
            notification_type=notification_type,
            priority=priority,
            hotel_settings=hotel_settings,
            action_url=action_url,
            related_object=related_object,
            related_content_type=related_content_type,
            related_object_id=related_object_id,
            metadata=metadata,
        )
        if notification is not None:
            created.append(notification)

    return created


def _get_hotel_users_by_roles(
    *,
    hotel_settings,
    role_slugs: Sequence[str] | None = None,
):
    if hotel_settings is None:
        return User.objects.none()

    queryset = User.objects.filter(
        is_active=True,
        hotel_settings_id=getattr(hotel_settings, "id", None),
    )

    normalized_slugs = {
        str(slug or "").strip().lower()
        for slug in (role_slugs or [])
        if str(slug or "").strip()
    }
    if not normalized_slugs:
        return queryset.distinct()

    return queryset.filter(
        userrole__is_active=True,
        userrole__role__is_active=True,
        userrole__role__slug__in=normalized_slugs,
    ).distinct()


def notify_roles(
    *,
    hotel_settings,
    role_slugs: Sequence[str],
    title: str,
    message: str,
    notification_type: str = Notification.NotificationType.SYSTEM,
    priority: str = Notification.Priority.MEDIUM,
    action_url: str | None = None,
    related_object=None,
    metadata: dict | None = None,
    fallback_to_hotel_users: bool = True,
) -> list[Notification]:
    recipients = list(
        _get_hotel_users_by_roles(
            hotel_settings=hotel_settings,
            role_slugs=role_slugs,
        )
    )

    if not recipients and fallback_to_hotel_users and hotel_settings is not None:
        recipients = list(
            User.objects.filter(
                is_active=True,
                hotel_settings_id=getattr(hotel_settings, "id", None),
            ).distinct()
        )

    return notify_users(
        recipients,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        hotel_settings=hotel_settings,
        action_url=action_url,
        related_object=related_object,
        metadata=metadata,
    )


def notify_hotel_managers(
    *,
    hotel_settings,
    title: str,
    message: str,
    notification_type: str = Notification.NotificationType.SYSTEM,
    priority: str = Notification.Priority.MEDIUM,
    action_url: str | None = None,
    related_object=None,
    metadata: dict | None = None,
) -> list[Notification]:
    return notify_roles(
        hotel_settings=hotel_settings,
        role_slugs=DEFAULT_MANAGER_ROLE_SLUGS,
        title=title,
        message=message,
        notification_type=notification_type,
        priority=priority,
        action_url=action_url,
        related_object=related_object,
        metadata=metadata,
        fallback_to_hotel_users=True,
    )


def _already_notified_today(
    *,
    user,
    title: str,
    notification_type: str,
    related_object=None,
) -> bool:
    today = timezone.localdate()
    queryset = Notification.objects.filter(
        user=user,
        title=title,
        notification_type=notification_type,
        created_at__date=today,
    )

    if related_object is not None:
        content_type = ContentType.objects.get_for_model(
            related_object,
            for_concrete_model=False,
        )
        object_id = str(getattr(related_object, "pk", "") or "").strip()
        queryset = queryset.filter(
            related_content_type=content_type,
            related_object_id=object_id,
        )

    return queryset.exists()


def _format_decimal(value: Decimal | int | float | None) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(value):.2f}"


def _format_days_until_message(days_until: int) -> str:
    if days_until <= 0:
        return "hoy"
    if days_until == 1:
        return "en 1 dia"
    return f"en {days_until} dias"


def notify_reservation_created(reservation) -> list[Notification]:
    if reservation is None:
        return []
    hotel_settings = getattr(reservation, "hotel_settings", None)
    client_name = getattr(getattr(reservation, "client", None), "full_name", None) or "Cliente"
    message = (
        f"Se registro la reserva #{reservation.id} para {client_name}. "
        f"Check-in: {getattr(reservation, 'expected_check_in', '--')}, "
        f"check-out: {getattr(reservation, 'expected_check_out', '--')}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Nueva reserva registrada",
        message=message,
        notification_type=Notification.NotificationType.RESERVATION,
        priority=Notification.Priority.MEDIUM,
        action_url="/reservas",
        related_object=reservation,
    )


def notify_reservation_cancelled(reservation) -> list[Notification]:
    if reservation is None:
        return []
    hotel_settings = getattr(reservation, "hotel_settings", None)
    message = f"La reserva #{reservation.id} fue cancelada."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Reserva cancelada",
        message=message,
        notification_type=Notification.NotificationType.RESERVATION,
        priority=Notification.Priority.HIGH,
        action_url="/reservas",
        related_object=reservation,
    )


def notify_reservation_pending_balance(
    reservation,
    *,
    pending_amount: Decimal | int | float | None,
) -> list[Notification]:
    if reservation is None:
        return []
    if Decimal(pending_amount or 0) <= Decimal("0"):
        return []

    hotel_settings = getattr(reservation, "hotel_settings", None)
    message = (
        f"La reserva #{reservation.id} tiene un saldo pendiente de "
        f"${_format_decimal(pending_amount)}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Reserva con saldo pendiente",
        message=message,
        notification_type=Notification.NotificationType.RESERVATION,
        priority=Notification.Priority.HIGH,
        action_url="/reservas",
        related_object=reservation,
    )


def notify_reservation_upcoming_checkin(reservation, *, days_until: int) -> list[Notification]:
    if reservation is None:
        return []

    hotel_settings = getattr(reservation, "hotel_settings", None)
    recipients = list(
        _get_hotel_users_by_roles(
            hotel_settings=hotel_settings,
            role_slugs=DEFAULT_MANAGER_ROLE_SLUGS,
        )
    )
    if not recipients:
        recipients = list(
            User.objects.filter(
                is_active=True,
                hotel_settings_id=getattr(hotel_settings, "id", None),
            ).distinct()
        )

    title = "Reserva proxima al check-in"
    message = (
        f"La reserva #{reservation.id} tiene check-in "
        f"{_format_days_until_message(days_until)}."
    )
    created: list[Notification] = []
    for user in recipients:
        if _already_notified_today(
            user=user,
            title=title,
            notification_type=Notification.NotificationType.RESERVATION,
            related_object=reservation,
        ):
            continue
        notification = create_notification(
            user=user,
            hotel_settings=hotel_settings,
            title=title,
            message=message,
            notification_type=Notification.NotificationType.RESERVATION,
            priority=Notification.Priority.MEDIUM,
            action_url="/reservas",
            related_object=reservation,
        )
        if notification is not None:
            created.append(notification)
    return created


def notify_reservation_upcoming_checkout(reservation, *, days_until: int) -> list[Notification]:
    if reservation is None:
        return []

    hotel_settings = getattr(reservation, "hotel_settings", None)
    recipients = list(
        _get_hotel_users_by_roles(
            hotel_settings=hotel_settings,
            role_slugs=DEFAULT_MANAGER_ROLE_SLUGS,
        )
    )
    if not recipients:
        recipients = list(
            User.objects.filter(
                is_active=True,
                hotel_settings_id=getattr(hotel_settings, "id", None),
            ).distinct()
        )

    title = "Reserva proxima al check-out"
    message = (
        f"La reserva #{reservation.id} tiene check-out "
        f"{_format_days_until_message(days_until)}."
    )
    created: list[Notification] = []
    for user in recipients:
        if _already_notified_today(
            user=user,
            title=title,
            notification_type=Notification.NotificationType.RESERVATION,
            related_object=reservation,
        ):
            continue
        notification = create_notification(
            user=user,
            hotel_settings=hotel_settings,
            title=title,
            message=message,
            notification_type=Notification.NotificationType.RESERVATION,
            priority=Notification.Priority.MEDIUM,
            action_url="/reservas",
            related_object=reservation,
        )
        if notification is not None:
            created.append(notification)
    return created


def notify_room_pending_cleaning(room) -> list[Notification]:
    if room is None:
        return []
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", room.id)
    message = f"La habitacion {room_number} quedo liberada y requiere limpieza."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Habitacion liberada pendiente de limpieza",
        message=message,
        notification_type=Notification.NotificationType.CLEANING,
        priority=Notification.Priority.HIGH,
        action_url="/tareas-limpieza",
        related_object=room,
    )


def notify_cleaning_completed(task) -> list[Notification]:
    if task is None:
        return []
    room = getattr(task, "room", None)
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", getattr(task, "room_id", "--"))
    message = f"La limpieza de la habitacion {room_number} fue completada."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Limpieza completada",
        message=message,
        notification_type=Notification.NotificationType.CLEANING,
        priority=Notification.Priority.MEDIUM,
        action_url="/tareas-limpieza",
        related_object=task,
    )


def notify_room_ready_for_assignment(room) -> list[Notification]:
    if room is None:
        return []
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", room.id)
    message = f"La habitacion {room_number} esta lista para ser asignada."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Habitacion lista para asignar",
        message=message,
        notification_type=Notification.NotificationType.ROOM,
        priority=Notification.Priority.MEDIUM,
        action_url="/habitaciones",
        related_object=room,
    )


def notify_maintenance_created(order) -> list[Notification]:
    if order is None:
        return []
    room = getattr(order, "room", None)
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", getattr(order, "room_id", "--"))
    title_text = getattr(order, "title", "Sin titulo")
    message = f"Se creo la orden de mantenimiento '{title_text}' para la habitacion {room_number}."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Nueva orden de mantenimiento creada",
        message=message,
        notification_type=Notification.NotificationType.MAINTENANCE,
        priority=Notification.Priority.MEDIUM,
        action_url="/ordenes-mantenimiento",
        related_object=order,
    )


def notify_maintenance_urgent(order) -> list[Notification]:
    if order is None:
        return []
    room = getattr(order, "room", None)
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", getattr(order, "room_id", "--"))
    priority_code = str(getattr(order, "priority_code", "") or "").upper() or "N/A"
    message = (
        f"La orden #{order.id} para la habitacion {room_number} "
        f"tiene prioridad {priority_code}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Mantenimiento urgente o de prioridad alta",
        message=message,
        notification_type=Notification.NotificationType.MAINTENANCE,
        priority=Notification.Priority.CRITICAL,
        action_url="/ordenes-mantenimiento",
        related_object=order,
    )


def notify_room_out_of_service(room) -> list[Notification]:
    if room is None:
        return []
    hotel_settings = getattr(getattr(room, "floor", None), "hotel_settings", None)
    room_number = getattr(room, "number", room.id)
    message = f"La habitacion {room_number} fue marcada fuera de servicio por mantenimiento."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Habitacion fuera de servicio por mantenimiento",
        message=message,
        notification_type=Notification.NotificationType.MAINTENANCE,
        priority=Notification.Priority.CRITICAL,
        action_url="/habitaciones",
        related_object=room,
    )


def notify_payment_registered(payment) -> list[Notification]:
    if payment is None:
        return []
    invoice = getattr(payment, "invoice", None)
    reservation = getattr(invoice, "reservation", None)
    hotel_settings = getattr(reservation, "hotel_settings", None)
    invoice_number = getattr(invoice, "invoice_number", "--")
    message = (
        f"Se registro un pago de ${_format_decimal(getattr(payment, 'amount', 0))} "
        f"para la factura {invoice_number}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Pago registrado",
        message=message,
        notification_type=Notification.NotificationType.PAYMENT,
        priority=Notification.Priority.MEDIUM,
        action_url="/pagos",
        related_object=payment,
    )


def notify_invoice_generated(invoice) -> list[Notification]:
    if invoice is None:
        return []
    reservation = getattr(invoice, "reservation", None)
    hotel_settings = getattr(reservation, "hotel_settings", None)
    message = f"Se genero la factura {getattr(invoice, 'invoice_number', '--')}."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Factura generada",
        message=message,
        notification_type=Notification.NotificationType.INVOICE,
        priority=Notification.Priority.MEDIUM,
        action_url="/facturas",
        related_object=invoice,
    )


def notify_invoice_pending_payment(
    invoice,
    *,
    pending_balance: Decimal | int | float | None = None,
) -> list[Notification]:
    if invoice is None:
        return []

    if pending_balance is None:
        from apps.billing.services import get_invoice_reconciliation

        snapshot = get_invoice_reconciliation(invoice)
        pending_balance = snapshot.get("pending_balance")

    if Decimal(pending_balance or 0) <= Decimal("0"):
        return []

    reservation = getattr(invoice, "reservation", None)
    hotel_settings = getattr(reservation, "hotel_settings", None)
    message = (
        f"La factura {getattr(invoice, 'invoice_number', '--')} tiene saldo pendiente de "
        f"${_format_decimal(pending_balance)}."
    )
    notifications = notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Factura pendiente de pago",
        message=message,
        notification_type=Notification.NotificationType.INVOICE,
        priority=Notification.Priority.HIGH,
        action_url="/facturas",
        related_object=invoice,
    )

    if reservation is not None:
        notify_reservation_pending_balance(
            reservation,
            pending_amount=Decimal(pending_balance or 0),
        )

    return notifications


def notify_stock_low(item) -> list[Notification]:
    if item is None:
        return []
    hotel_settings = getattr(item, "hotel_settings", None)
    message = (
        f"El item {getattr(item, 'name', '--')} llego al nivel de stock bajo "
        f"({getattr(item, 'stock', 0)} unidades)."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Stock bajo",
        message=message,
        notification_type=Notification.NotificationType.INVENTORY,
        priority=Notification.Priority.HIGH,
        action_url="/items",
        related_object=item,
    )


def notify_product_out_of_stock(item) -> list[Notification]:
    if item is None:
        return []
    hotel_settings = getattr(item, "hotel_settings", None)
    message = f"El item {getattr(item, 'name', '--')} se encuentra agotado."
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Producto agotado",
        message=message,
        notification_type=Notification.NotificationType.INVENTORY,
        priority=Notification.Priority.CRITICAL,
        action_url="/items",
        related_object=item,
    )


def notify_user_created(user) -> list[Notification]:
    if user is None or is_effective_global_admin(user):
        return []
    hotel_settings = getattr(user, "hotel_settings", None)
    if hotel_settings is None:
        return []
    message = (
        f"Se creo el usuario {getattr(user, 'username', '--')} "
        f"en el hotel {getattr(hotel_settings, 'hotel_name', '--')}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Nuevo usuario creado",
        message=message,
        notification_type=Notification.NotificationType.USER,
        priority=Notification.Priority.MEDIUM,
        action_url="/usuarios",
        related_object=user,
    )


def notify_user_role_updated(
    *,
    user,
    role_name: str,
    action_label: str = "actualizado",
) -> list[Notification]:
    if user is None:
        return []
    hotel_settings = getattr(user, "hotel_settings", None)
    if hotel_settings is None:
        return []

    message = (
        f"El rol de {getattr(user, 'username', '--')} fue {action_label}: "
        f"{str(role_name or 'Sin rol')}."
    )
    recipients = list(
        _get_hotel_users_by_roles(
            hotel_settings=hotel_settings,
            role_slugs=DEFAULT_MANAGER_ROLE_SLUGS,
        )
    )
    if getattr(user, "is_active", False):
        recipients.append(user)

    return notify_users(
        recipients,
        hotel_settings=hotel_settings,
        title="Rol de usuario actualizado",
        message=message,
        notification_type=Notification.NotificationType.USER,
        priority=Notification.Priority.HIGH,
        action_url="/roles",
        related_object=user,
    )


def notify_expense_registered(expense) -> list[Notification]:
    if expense is None:
        return []
    hotel_settings = getattr(expense, "hotel_settings", None)
    message = (
        f"Se registro el egreso '{getattr(expense, 'concept', '--')}' "
        f"por ${_format_decimal(getattr(expense, 'amount', 0))}."
    )
    return notify_hotel_managers(
        hotel_settings=hotel_settings,
        title="Egreso registrado",
        message=message,
        notification_type=Notification.NotificationType.FINANCE,
        priority=Notification.Priority.MEDIUM,
        action_url="/egresos",
        related_object=expense,
    )


def notify_daily_report_available(*, hotel_settings, report_date=None) -> list[Notification]:
    if hotel_settings is None:
        return []

    target_date = report_date or timezone.localdate()
    title = "Reporte diario disponible"
    message = (
        f"El reporte diario del {target_date:%Y-%m-%d} "
        f"ya se encuentra disponible."
    )

    recipients = list(
        _get_hotel_users_by_roles(
            hotel_settings=hotel_settings,
            role_slugs=DEFAULT_MANAGER_ROLE_SLUGS,
        )
    )
    if not recipients:
        recipients = list(
            User.objects.filter(
                is_active=True,
                hotel_settings_id=getattr(hotel_settings, "id", None),
            ).distinct()
        )

    created: list[Notification] = []
    for user in recipients:
        if _already_notified_today(
            user=user,
            title=title,
            notification_type=Notification.NotificationType.REPORT,
            related_object=hotel_settings,
        ):
            continue
        notification = create_notification(
            user=user,
            hotel_settings=hotel_settings,
            title=title,
            message=message,
            notification_type=Notification.NotificationType.REPORT,
            priority=Notification.Priority.MEDIUM,
            action_url="/reportes",
            related_object=hotel_settings,
            metadata={"report_date": target_date.isoformat()},
        )
        if notification is not None:
            created.append(notification)

    return created
