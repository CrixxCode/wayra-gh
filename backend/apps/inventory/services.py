from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.inventory.models import InventoryMovement, InventoryRestockAlert, Item, RoomInventory
from apps.master_data.models import MasterData


LOSS_MOVEMENT_CODE = "LOSS"
OUT_MOVEMENT_CODE = "OUT"
LOW_STOCK_REFERENCE_PREFIX = "LOW_STOCK"
COMPLETED_STATUS_CODES = {
    "COMPLETADA",
    "COMPLETADO",
    "COMPLETED",
    "DONE",
    "CERRADA",
    "CERRADO",
}


def _normalize_code(value: Any) -> str:
    return str(value or "").strip().upper()


def is_completed_operation_status(code: Any) -> bool:
    return _normalize_code(code) in COMPLETED_STATUS_CODES


def get_or_create_inventory_movement_type(code: str, name: str, sort_order: int = 0):
    normalized_code = _normalize_code(code)
    if not normalized_code:
        return None

    movement_type, _ = MasterData.objects.get_or_create(
        group=MasterData.Group.INVENTORY_MOVEMENT_TYPE,
        code=normalized_code,
        defaults={
            "name": str(name or normalized_code).strip() or normalized_code,
            "is_active": True,
            "sort_order": int(sort_order or 0),
        },
    )

    fields_to_update: list[str] = []
    if not movement_type.is_active:
        movement_type.is_active = True
        fields_to_update.append("is_active")
    if not movement_type.name:
        movement_type.name = str(name or normalized_code).strip() or normalized_code
        fields_to_update.append("name")
    if fields_to_update:
        movement_type.save(update_fields=fields_to_update)

    return movement_type


def _safe_positive_int(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return parsed if parsed > 0 else 0


def apply_checkout_consumption_inventory(
    reservation,
    *,
    inventory_comparison: dict[str, Any] | None,
) -> dict[str, Any]:
    result = {
        "movements_created": 0,
        "total_discounted_quantity": 0,
        "skipped_lines": 0,
        "warnings": [],
    }

    reservation_id = getattr(reservation, "id", None)
    reservation_hotel_settings_id = getattr(reservation, "hotel_settings_id", None)
    if not reservation_id or not isinstance(inventory_comparison, dict):
        return result
    if reservation_hotel_settings_id is None:
        result["warnings"].append(
            "No se pudo resolver el hotel de la reserva para aplicar consumo de inventario."
        )
        result["skipped_lines"] = len(inventory_comparison.get("lines") or [])
        return result

    lines = inventory_comparison.get("lines")
    if not isinstance(lines, list):
        return result

    check_id = inventory_comparison.get("check_id") or "NA"
    movement_type = get_or_create_inventory_movement_type(
        LOSS_MOVEMENT_CODE,
        "Perdida / Consumo",
        sort_order=3,
    )
    if not movement_type:
        result["warnings"].append("No se pudo resolver el tipo de movimiento LOSS.")
        return result

    for raw_line in lines:
        if not isinstance(raw_line, dict):
            result["skipped_lines"] += 1
            continue

        try:
            difference = int(raw_line.get("difference_quantity") or 0)
        except (TypeError, ValueError):
            result["skipped_lines"] += 1
            continue
        if difference >= 0:
            continue

        room_id = _safe_positive_int(raw_line.get("room_id"))
        item_id = _safe_positive_int(raw_line.get("item_id"))
        requested_quantity = abs(difference)

        if not room_id or not item_id or requested_quantity <= 0:
            result["skipped_lines"] += 1
            continue

        reference = f"ROOM_CONSUMPTION:{check_id}:{room_id}:{item_id}"

        with transaction.atomic():
            movement_exists = InventoryMovement.objects.filter(
                item_id=item_id,
                movement_type_id=movement_type.id,
                reference=reference,
                is_active=True,
                item__hotel_settings_id=reservation_hotel_settings_id,
            ).exists()
            if movement_exists:
                result["skipped_lines"] += 1
                continue

            item = Item.objects.select_for_update().filter(
                id=item_id,
                is_active=True,
                hotel_settings_id=reservation_hotel_settings_id,
            ).first()
            if not item:
                result["warnings"].append(
                    f"No se encontro item activo {item_id} para consumo de reserva #{reservation_id}."
                )
                result["skipped_lines"] += 1
                continue

            available_stock = int(item.stock or 0)
            if available_stock <= 0:
                result["warnings"].append(
                    f"Stock insuficiente para item {item_id} en consumo de reserva #{reservation_id}."
                )
                result["skipped_lines"] += 1
                continue

            discounted_quantity = min(requested_quantity, available_stock)
            room_label = raw_line.get("room_number") or room_id
            item_label = raw_line.get("item_name") or item.name or f"Item {item_id}"
            notes = (
                f"Consumo detectado en habitacion {room_label} para item {item_label} "
                f"durante check-out de reserva #{reservation_id}."
            )
            if discounted_quantity < requested_quantity:
                notes += (
                    f" Descuento parcial: solicitado={requested_quantity}, "
                    f"aplicado={discounted_quantity} (stock disponible)."
                )

            InventoryMovement.objects.create(
                item=item,
                movement_type=movement_type,
                quantity=discounted_quantity,
                reference=reference,
                notes=notes,
                is_active=True,
            )

            result["movements_created"] += 1
            result["total_discounted_quantity"] += discounted_quantity
            if discounted_quantity < requested_quantity:
                result["warnings"].append(
                    f"Consumo parcial para item {item_id} en reserva #{reservation_id}."
                )

    return result


def replenish_room_inventory_on_operation_close(
    *,
    room_id: int | None,
    source_type: str,
    source_id: int | None,
) -> dict[str, Any]:
    result = {
        "movements_created": 0,
        "replenished_lines": 0,
        "total_replenished_quantity": 0,
        "skipped_lines": 0,
        "warnings": [],
    }

    normalized_source = _normalize_code(source_type)
    if not room_id or not source_id or not normalized_source:
        return result

    movement_type = get_or_create_inventory_movement_type(
        OUT_MOVEMENT_CODE,
        "Salida de inventario",
        sort_order=1,
    )
    if not movement_type:
        result["warnings"].append("No se pudo resolver el tipo de movimiento OUT.")
        return result

    room_inventory_ids = list(
        RoomInventory.objects.filter(
            room_id=room_id,
            is_active=True,
            item__hotel_settings_id=F("room__floor__hotel_settings_id"),
        ).values_list("id", flat=True)
    )
    if not room_inventory_ids:
        return result

    for room_inventory_id in room_inventory_ids:
        reference = f"ROOM_REPLENISH:{normalized_source}:{source_id}:{room_inventory_id}"

        with transaction.atomic():
            movement_exists = InventoryMovement.objects.filter(
                reference=reference,
                movement_type_id=movement_type.id,
                is_active=True,
            ).exists()
            if movement_exists:
                result["skipped_lines"] += 1
                continue

            room_inventory = (
                RoomInventory.objects.select_for_update()
                .select_related("room", "item")
                .filter(
                    id=room_inventory_id,
                    is_active=True,
                    item__hotel_settings_id=F("room__floor__hotel_settings_id"),
                )
                .first()
            )
            if not room_inventory:
                result["skipped_lines"] += 1
                continue

            current_quantity = int(room_inventory.quantity or 0)
            minimum_quantity = int(room_inventory.minimum_quantity or 0)
            if minimum_quantity <= current_quantity:
                result["skipped_lines"] += 1
                continue

            room_hotel_settings_id = getattr(
                getattr(getattr(room_inventory, "room", None), "floor", None),
                "hotel_settings_id",
                None,
            )
            item = Item.objects.select_for_update().filter(
                id=room_inventory.item_id,
                is_active=True,
                hotel_settings_id=room_hotel_settings_id,
            ).first()
            if not item:
                result["warnings"].append(
                    f"No se encontro item activo para room_inventory {room_inventory_id}."
                )
                result["skipped_lines"] += 1
                continue

            quantity_required = minimum_quantity - current_quantity
            available_stock = int(item.stock or 0)
            if available_stock <= 0:
                result["warnings"].append(
                    f"Stock insuficiente para reposicion en habitacion {room_inventory.room_id}."
                )
                result["skipped_lines"] += 1
                continue

            quantity_to_replenish = min(quantity_required, available_stock)
            room_label = getattr(getattr(room_inventory, "room", None), "number", None) or room_inventory.room_id
            item_label = getattr(getattr(room_inventory, "item", None), "name", None) or room_inventory.item_id
            notes = (
                f"Reposicion automatica de {item_label} en habitacion {room_label} "
                f"por cierre de {normalized_source} #{source_id}."
            )
            if quantity_to_replenish < quantity_required:
                notes += (
                    f" Reposicion parcial: requerido={quantity_required}, "
                    f"aplicado={quantity_to_replenish}."
                )

            InventoryMovement.objects.create(
                item=item,
                movement_type=movement_type,
                quantity=quantity_to_replenish,
                reference=reference,
                notes=notes,
                is_active=True,
            )

            room_inventory.quantity = current_quantity + quantity_to_replenish
            room_inventory.updated_at = timezone.now()
            room_inventory.save(update_fields=["quantity", "updated_at"])

            result["movements_created"] += 1
            result["replenished_lines"] += 1
            result["total_replenished_quantity"] += quantity_to_replenish
            if quantity_to_replenish < quantity_required:
                result["warnings"].append(
                    f"Reposicion parcial en habitacion {room_label} para item {item_label}."
                )

    return result


def _build_low_stock_reference(item_id: int) -> str:
    return f"{LOW_STOCK_REFERENCE_PREFIX}:{item_id}"


def sync_low_stock_restock_alert_for_item(*, item_id: int | None) -> dict[str, Any]:
    result = {
        "created": 0,
        "updated": 0,
        "resolved": 0,
        "skipped": 0,
    }
    if not item_id:
        result["skipped"] = 1
        return result

    with transaction.atomic():
        item = Item.objects.select_for_update().filter(id=item_id).first()
        if not item:
            result["skipped"] = 1
            return result

        current_stock = int(item.stock or 0)
        minimum_stock = int(item.minimum_stock or 0)
        should_open_alert = item.is_active and minimum_stock > 0 and current_stock < minimum_stock
        shortage = max(minimum_stock - current_stock, 0)

        open_alerts = list(
            InventoryRestockAlert.objects.select_for_update()
            .filter(
                item_id=item.id,
                status=InventoryRestockAlert.Status.DRAFT,
                is_active=True,
            )
            .order_by("-id")
        )

        if should_open_alert:
            now = timezone.now()
            reference = _build_low_stock_reference(item.id)
            if open_alerts:
                primary = open_alerts[0]
                primary.current_stock = current_stock
                primary.minimum_stock = minimum_stock
                primary.suggested_quantity = shortage
                primary.reference = reference
                primary.resolved_at = None
                primary.notes = (
                    f"Stock bajo minimo detectado para {item.name} "
                    f"(actual={current_stock}, minimo={minimum_stock})."
                )
                primary.save(
                    update_fields=[
                        "current_stock",
                        "minimum_stock",
                        "suggested_quantity",
                        "reference",
                        "resolved_at",
                        "notes",
                        "updated_at",
                    ]
                )
                result["updated"] += 1

                duplicated_ids = [alert.id for alert in open_alerts[1:]]
                if duplicated_ids:
                    result["resolved"] += InventoryRestockAlert.objects.filter(id__in=duplicated_ids).update(
                        status=InventoryRestockAlert.Status.RESOLVED,
                        resolved_at=now,
                        current_stock=current_stock,
                        minimum_stock=minimum_stock,
                        suggested_quantity=0,
                        notes="Alerta duplicada cerrada automaticamente por consolidacion.",
                        updated_at=now,
                    )
            else:
                InventoryRestockAlert.objects.create(
                    item=item,
                    status=InventoryRestockAlert.Status.DRAFT,
                    reference=reference,
                    current_stock=current_stock,
                    minimum_stock=minimum_stock,
                    suggested_quantity=shortage,
                    notes=(
                        f"Stock bajo minimo detectado para {item.name} "
                        f"(actual={current_stock}, minimo={minimum_stock})."
                    ),
                    is_active=True,
                )
                result["created"] += 1

            return result

        if open_alerts:
            now = timezone.now()
            open_ids = [alert.id for alert in open_alerts]
            result["resolved"] += InventoryRestockAlert.objects.filter(id__in=open_ids).update(
                status=InventoryRestockAlert.Status.RESOLVED,
                resolved_at=now,
                current_stock=current_stock,
                minimum_stock=minimum_stock,
                suggested_quantity=0,
                notes=(
                    f"Alerta cerrada automaticamente para {item.name}; "
                    f"stock actual={current_stock}, minimo={minimum_stock}."
                ),
                updated_at=now,
            )

        return result
