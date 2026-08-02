# 🎯 LISTA COMPLETA DE RECURSOS RBAC ENCONTRADOS

## Búsqueda Realizada
- **Patrón:** `required_scopes` y `permission_classes = [HasResourcePermission]`
- **Total de Archivos:** 12
- **Total de ViewSets:** 35
- **Recursos Únicos:** 60

---

## 📑 TABLA CONSOLIDADA

### Recursos de LECTURA (.read) - 30 Total

| # | Recurso | Archivo | ViewSet |
|---|---------|---------|---------|
| 1 | `users.read` | accounts/views.py | UserViewSet |
| 2 | `roles.read` | accounts/views.py | RoleViewSet |
| 3 | `resources.read` | accounts/views.py | ResourceViewSet |
| 4 | `clients.read` | apps/clients/views.py | ClientViewSet |
| 5 | `master_data.read` | apps/master_data/views.py | MasterDataViewSet |
| 6 | `hotel_settings.read` | apps/hotel_settings/views.py | HotelSettingsViewSet, HotelFloorViewSet |
| 7 | `reservation-policies.read` | apps/hotel_settings/views.py | ReservationPolicyViewSet |
| 8 | `room_type.read` | apps/rooms/views.py | RoomTypeViewSet |
| 9 | `rates.read` | apps/rooms/views.py | RateViewSet |
| 10 | `amenities.read` | apps/rooms/views.py | AmenityViewSet |
| 11 | `rooms.read` | apps/rooms/views.py | RoomViewSet |
| 12 | `maintenance_orders.read` | apps/rooms/views.py | MaintenanceOrderViewSet |
| 13 | `cleaning_tasks.read` | apps/rooms/views.py | CleaningTaskViewSet |
| 14 | `reservations.read` | apps/reservations/views.py | ReservationViewSet |
| 15 | `reservation_rooms.read` | apps/reservations/views.py | ReservationRoomViewSet |
| 16 | `reservation_guests.read` | apps/reservations/views.py | ReservationGuestViewSet |
| 17 | `reservation_deposits.read` | apps/reservations/views.py | ReservationDepositViewSet |
| 18 | `reservation_inventory_checks.read` | apps/reservations/views.py | ReservationInventoryCheckViewSet |
| 19 | `reservation_inventory_check_lines.read` | apps/reservations/views.py | ReservationInventoryCheckLineViewSet |
| 20 | `charges.read` | apps/billing/views.py | ChargeViewSet |
| 21 | `invoices.read` | apps/billing/views.py | InvoiceViewSet, InvoiceChargeViewSet |
| 22 | `payments.read` | apps/billing/views.py | PaymentViewSet, PaymentRefundViewSet |
| 23 | `credit-notes.read` | apps/billing/views.py | CreditNoteViewSet |
| 24 | `expenses.read` | apps/finance/views.py | ExpenseViewSet |
| 25 | `financial_control.read` | apps/finance/views.py | FinancialControlConfigViewSet, OperationalAlertViewSet |
| 26 | `reports.read` | apps/reports/views.py | ReportsViewSet |
| 27 | `notifications.read` | apps/notifications/views.py | NotificationViewSet |
| 28 | `items.read` | apps/inventory/views.py | ItemViewSet |
| 29 | `inventory-movements.read` | apps/inventory/views.py | InventoryMovementViewSet |
| 30 | `room-inventory.read` | apps/inventory/views.py | RoomInventoryViewSet |

---

### Recursos de ESCRITURA (.write) - 29 Total

| # | Recurso | Archivo | ViewSet |
|---|---------|---------|---------|
| 1 | `users.write` | accounts/views.py | UserViewSet |
| 2 | `roles.write` | accounts/views.py | RoleViewSet |
| 3 | `resources.write` | accounts/views.py | ResourceViewSet |
| 4 | `clients.write` | apps/clients/views.py | ClientViewSet |
| 5 | `master_data.write` | apps/master_data/views.py | MasterDataViewSet |
| 6 | `hotel_settings.write` | apps/hotel_settings/views.py | HotelSettingsViewSet, HotelFloorViewSet |
| 7 | `reservation-policies.write` | apps/hotel_settings/views.py | ReservationPolicyViewSet |
| 8 | `room_type.write` | apps/rooms/views.py | RoomTypeViewSet |
| 9 | `rates.write` | apps/rooms/views.py | RateViewSet |
| 10 | `amenities.write` | apps/rooms/views.py | AmenityViewSet |
| 11 | `rooms.write` | apps/rooms/views.py | RoomViewSet |
| 12 | `maintenance_orders.write` | apps/rooms/views.py | MaintenanceOrderViewSet |
| 13 | `cleaning_tasks.write` | apps/rooms/views.py | CleaningTaskViewSet |
| 14 | `reservations.write` | apps/reservations/views.py | ReservationViewSet |
| 15 | `reservation_rooms.write` | apps/reservations/views.py | ReservationRoomViewSet |
| 16 | `reservation_guests.write` | apps/reservations/views.py | ReservationGuestViewSet |
| 17 | `reservation_deposits.write` | apps/reservations/views.py | ReservationDepositViewSet |
| 18 | `reservation_inventory_checks.write` | apps/reservations/views.py | ReservationInventoryCheckViewSet |
| 19 | `reservation_inventory_check_lines.write` | apps/reservations/views.py | ReservationInventoryCheckLineViewSet |
| 20 | `charges.write` | apps/billing/views.py | ChargeViewSet |
| 21 | `invoices.write` | apps/billing/views.py | InvoiceViewSet, InvoiceChargeViewSet |
| 22 | `payments.write` | apps/billing/views.py | PaymentViewSet, PaymentRefundViewSet |
| 23 | `credit-notes.write` | apps/billing/views.py | CreditNoteViewSet |
| 24 | `expenses.write` | apps/finance/views.py | ExpenseViewSet |
| 25 | `financial_control.write` | apps/finance/views.py | FinancialControlConfigViewSet, OperationalAlertViewSet |
| 26 | `notifications.write` | apps/notifications/views.py | NotificationViewSet |
| 27 | `items.write` | apps/inventory/views.py | ItemViewSet |
| 28 | `inventory-movements.write` | apps/inventory/views.py | InventoryMovementViewSet |
| 29 | `room-inventory.write` | apps/inventory/views.py | RoomInventoryViewSet |

---

### Recursos ESPECIALES - 1 Total

| # | Recurso | Descripción | ViewSet |
|---|---------|-------------|---------|
| 1 | `items.read_deleted` | Acceso a items eliminados lógicamente | ItemViewSet |

---

## 🔢 CONTEO FINAL

```
├── LECTURA (.read)
│   └── 30 recursos únicos
│
├── ESCRITURA (.write)
│   └── 29 recursos únicos
│
├── ESPECIALES
│   └── 1 recurso único
│
└── TOTAL
    └── 60 recursos únicos
```

---

## 🗂️ DISTRIBUCIÓN POR MÓDULO

| Módulo | Recursos .read | Recursos .write | Total |
|--------|---|---|---|
| **accounts** | 3 | 3 | 6 |
| **apps.clients** | 1 | 1 | 2 |
| **apps.master_data** | 1 | 1 | 2 |
| **apps.hotel_settings** | 2 | 2 | 4 |
| **apps.rooms** | 6 | 6 | 12 |
| **apps.reservations** | 6 | 6 | 12 |
| **apps.billing** | 4 | 4 | 8 |
| **apps.finance** | 2 | 2 | 4 |
| **apps.reports** | 1 | 0 | 1 |
| **apps.notifications** | 1 | 1 | 2 |
| **apps.inventory** | 3 | 3 | 6 |
| **TOTAL** | **30** | **29** | **59** |
| **+ Especiales** | - | - | **1** |
| **GRAN TOTAL** | - | - | **60** |

---

## 💾 Archivos de Referencia Generados

```
✅ RBAC_RESOURCES_SCAN.md       - Documentación detallada (35 ViewSets)
✅ RBAC_RESOURCES_SCAN.json     - Datos en formato JSON estructurado
✅ RBAC_SUMMARY.md              - Resumen ejecutivo
✅ RBAC_RESOURCES_LIST.md       - Este archivo (lista consolidada)
✅ validate_rbac_resources.py   - Script Python para validación con BD
```

---

## 🚀 Próximos Pasos Recomendados

1. **Revisar si todos los recursos están en BD:**
   ```bash
   python validate_rbac_resources.py
   ```

2. **Si falta alguno, ejecutar script de generación:**
   ```bash
   python backend/add_notifications_permissions.py
   ```

3. **Validar permisos asignados a roles:**
   ```sql
   SELECT r.key, COUNT(rr.id) as roles_count
   FROM accounts_resource r
   LEFT JOIN accounts_roleresource rr ON r.id = rr.resource_id
   WHERE r.is_active = true
   GROUP BY r.id, r.key
   ORDER BY r.key;
   ```

---

*Generado: 4 de Mayo 2026 - Escaneo Automático de RBAC*
