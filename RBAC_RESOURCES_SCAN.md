# 📋 Escaneo Completo de Recursos RBAC en la Aplicación

**Fecha:** 4 de Mayo 2026  
**Total de Archivos Encontrados:** 12  
**Total de ViewSets/Views:** 35  

---

## 📊 Resumen Ejecutivo

Este documento contiene todos los endpoints que requieren permisos específicos mediante `required_scopes` y la clase `HasResourcePermission`. Cada recurso está mapeado a su operación (READ/WRITE).

---

## 📁 Detalle por Archivo

### 1. **accounts/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `UserViewSet` | `users.read` | `users.write` | ✅ Sí |
| `RoleViewSet` | `roles.read` | `roles.write` | ✅ Sí |
| `ResourceViewSet` | `resources.read` | `resources.write` | ✅ Sí |

---

### 2. **apps/clients/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ClientViewSet` | `clients.read` | `clients.write` | ✅ Sí |

---

### 3. **apps/master_data/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `MasterDataViewSet` | `master_data.read` | `master_data.write` | ✅ Sí |

---

### 4. **apps/hotel_settings/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `HotelSettingsViewSet` | `hotel_settings.read` | `hotel_settings.write` | ✅ Sí |
| `HotelFloorViewSet` | `hotel_settings.read` | `hotel_settings.write` | ✅ Sí |
| `ReservationPolicyViewSet` | `reservation-policies.read` | `reservation-policies.write` | ✅ Sí |

---

### 5. **apps/rooms/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `RoomTypeViewSet` | `room_type.read` | `room_type.write` | ✅ Sí |
| `RateViewSet` | `rates.read` | `rates.write` | ✅ Sí |
| `AmenityViewSet` | `amenities.read` | `amenities.write` | ✅ Sí |
| `RoomViewSet` | `rooms.read` | `rooms.write` | ✅ Sí |
| `MaintenanceOrderViewSet` | `maintenance_orders.read` | `maintenance_orders.write` | ✅ Sí |
| `CleaningTaskViewSet` | `cleaning_tasks.read` | `cleaning_tasks.write` | ✅ Sí |

---

### 6. **apps/reservations/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ReservationViewSet` | `reservations.read` | `reservations.write` | ✅ Sí |
| `ReservationRoomViewSet` | `reservation_rooms.read` | `reservation_rooms.write` | ✅ Sí |
| `ReservationGuestViewSet` | `reservation_guests.read` | `reservation_guests.write` | ✅ Sí |
| `ReservationDepositViewSet` | `reservation_deposits.read` | `reservation_deposits.write` | ✅ Sí |
| `ReservationInventoryCheckViewSet` | `reservation_inventory_checks.read` | `reservation_inventory_checks.write` | ✅ Sí |
| `ReservationInventoryCheckLineViewSet` | `reservation_inventory_check_lines.read` | `reservation_inventory_check_lines.write` | ✅ Sí |

---

### 7. **apps/billing/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ChargeViewSet` | `charges.read` | `charges.write` | ✅ Sí |
| `InvoiceViewSet` | `invoices.read` | `invoices.write` | ✅ Sí |
| `InvoiceChargeViewSet` | `invoices.read` | `invoices.write` | ✅ Sí |
| `PaymentViewSet` | `payments.read` | `payments.write` | ✅ Sí |
| `PaymentRefundViewSet` | `payments.read` | `payments.write` | ✅ Sí |
| `CreditNoteViewSet` | `credit-notes.read` | `credit-notes.write` | ✅ Sí |

---

### 8. **apps/finance/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ExpenseViewSet` | `expenses.read` | `expenses.write` | ✅ Sí |
| `FinancialControlConfigViewSet` | `financial_control.read` | `financial_control.write` | ✅ Sí |
| `OperationalAlertViewSet` | `financial_control.read` | `financial_control.write` | ✅ Sí |

---

### 9. **apps/reports/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ReportsViewSet` | `reports.read` | N/A (solo lectura) | ✅ Sí |

---

### 10. **apps/notifications/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `NotificationViewSet` | `notifications.read` | `notifications.write` | ✅ Sí |

---

### 11. **apps/inventory/views.py**
| Clase | Scopes READ | Scopes WRITE | Método `get_required_scopes()` |
|-------|------------|-------------|------|
| `ItemViewSet` | `items.read` | `items.write` | ✅ Sí |
| `InventoryMovementViewSet` | `inventory-movements.read` | `inventory-movements.write` | ✅ Sí |
| `RoomInventoryViewSet` | `room-inventory.read` | `room-inventory.write` | ✅ Sí |

---

### 12. **accounts/permissions.py**
**Clase Utilitaria:** `HasResourcePermission` (Implementa la lógica de validación RBAC)
- ✅ Implementa `get_required_scopes()` en validación
- ✅ Soporta wildcard scopes (`*`)
- ✅ Soporte para variantes normalizadas (snake_case ↔ kebab-case)
- ✅ Soporte para scopes adicionales en lecturas con deleted records

---

## 🎯 Lista Completa de Recursos Únicos

### 📖 Recursos de LECTURA (READ)
```
1. users.read
2. roles.read
3. resources.read
4. clients.read
5. master_data.read
6. hotel_settings.read
7. reservation-policies.read
8. room_type.read
9. rates.read
10. amenities.read
11. rooms.read
12. maintenance_orders.read
13. cleaning_tasks.read
14. reservations.read
15. reservation_rooms.read
16. reservation_guests.read
17. reservation_deposits.read
18. reservation_inventory_checks.read
19. reservation_inventory_check_lines.read
20. charges.read
21. invoices.read
22. payments.read
23. credit-notes.read
24. expenses.read
25. financial_control.read
26. reports.read
27. notifications.read
28. items.read
29. inventory-movements.read
30. room-inventory.read
```

### ✏️ Recursos de ESCRITURA (WRITE)
```
1. users.write
2. roles.write
3. resources.write
4. clients.write
5. master_data.write
6. hotel_settings.write
7. reservation-policies.write
8. room_type.write
9. rates.write
10. amenities.write
11. rooms.write
12. maintenance_orders.write
13. cleaning_tasks.write
14. reservations.write
15. reservation_rooms.write
16. reservation_guests.write
17. reservation_deposits.write
18. reservation_inventory_checks.write
19. reservation_inventory_check_lines.write
20. charges.write
21. invoices.write
22. payments.write
23. credit-notes.write
24. expenses.write
25. financial_control.write
26. notifications.write
27. items.write
28. inventory-movements.write
29. room-inventory.write
```

### ⭐ Recursos Especiales
```
- items.read_deleted (usado en ItemViewSet para operaciones con registros eliminados)
```

---

## 📊 Estadísticas

| Categoría | Cantidad |
|-----------|----------|
| Total de ViewSets/Views | 35 |
| Archivos con RBAC | 12 |
| Recursos de LECTURA únicos | 30 |
| Recursos de ESCRITURA únicos | 29 |
| Recursos especiales | 1 |
| **TOTAL RECURSOS ÚNICOS** | **60** |

---

## ✅ Patrón de Implementación Estándar

Todos los ViewSets siguen este patrón:

```python
class [ViewSet]ViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [HasResourcePermission]
    required_scopes = ["[resource].read"]
    
    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["[resource].write"]
        return self.required_scopes
    
    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
```

---

## 🔍 Notas Importantes

1. **Normalización de Scopes:** La clase `HasResourcePermission` normaliza automáticamente:
   - `users_read` → `users.read` (snake_case ↔ kebab-case)
   - Variantes con guiones: `room-type` ↔ `room_type`

2. **Wildcard Support:** Los usuarios pueden tener scope `*` que les da acceso a TODOS los recursos

3. **Deleted Records:** Algunos ViewSets (como ItemViewSet) añaden automáticamente `.read_deleted` cuando se requiere acceso a registros eliminados

4. **Admin Bypass:** Global admins tienen acceso a todos los recursos sin validación de scopes

5. **Métodos Dinámicos:** Cada ViewSet implementa `get_required_scopes()` para cambiar dinámicamente los scopes según el método HTTP

---

## 🔗 Comparación con Base de Datos

Para verificar que todos los recursos estén registrados en la BD:

```sql
-- Contar recursos en BD
SELECT COUNT(DISTINCT key) FROM accounts_resource WHERE is_active=true;

-- Comparar con lista anterior
SELECT key FROM accounts_resource WHERE is_active=true ORDER BY key;
```

**Recursos faltantes en BD:** Ejecutar `backend/add_notifications_permissions.py`

---

