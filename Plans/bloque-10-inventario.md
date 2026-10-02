# Bloque 10 — Inventario — Hallazgos de auditoría

Backend: 33/33 tests pasan. Orden de mixins verificado correcto en los 3 ViewSets (`Item`,
`InventoryMovement`, `RoomInventory`) — **no se repite aquí** el bug transversal del
Bloque 9/documento `hallazgo-transversal-orden-mixins.md`. Multi-tenancy correcta.

## Bug / falta de funcionalidad — prioridad alta (bloqueante de negocio)

1. **Botón "Nueva asignación" de inventario por habitación es inalcanzable en producción.**
   Todas las rutas (`/inventario-habitaciones`, etc.) solo renderizan los componentes con
   `embedded=true` dentro de `InventoryPage`. `list-room-inventory.html` envuelve el botón
   "Nueva asignación" solo en `*ngIf="!embedded"`, sin el botón de respaldo para `embedded` que
   sí tiene `list-items.html` (ahí alguien ya corrigió este mismo patrón el 2026-08-19 con un
   botón duplicado). **El botón nunca se pinta desde la pestaña dedicada.** Mitigado
   parcialmente porque `room-modal` permite crear/activar `RoomInventory` desde la ficha de la
   habitación — pero eso contradice el propósito de tener una pestaña dedicada.
2. **Botón "Nuevo movimiento" igualmente inalcanzable — tipos `ADJUSTMENT`/`TRANSFER`/`LOSS`
   no se pueden registrar manualmente desde la UI.** Mismo patrón que #1 en
   `list-inventory-movements.html`. El único formulario completo que permite elegir
   item+tipo+cantidad arbitrarios queda inaccesible. Los únicos movimientos que hoy se pueden
   generar desde la UI real son `IN`/`OUT` vía el ajuste rápido o el modal `StockMove` de la
   pestaña Items — nunca un ajuste de inventario físico fuera de "Hacer conteo", ni una
   transferencia, ni una pérdida registrada manualmente.

## Falta de funcionalidad

3. **`InventoryRestockAlert` es una tabla que se llena sola automáticamente pero no tiene
   ningún consumidor.** Tiene un ciclo de vida completo (DRAFT/RESOLVED, señal automática al
   cruzar `minimum_stock`, tests unitarios completos), pero no está registrada en
   `urls.py` — sin ViewSet, sin serializer, sin endpoint. El frontend recalcula "bajo mínimo"
   de forma independiente comparando `stock <= minimum_stock` en el cliente, duplicando la
   lógica sin usar el modelo pensado para eso. No hay forma de atender/descartar una alerta
   desde la UI — solo visible en Django admin. **Trabajo de backend completo sin uso real.**
4. **Navegación cruzada entre pestañas es unidireccional.** `list-items.ts` permite saltar a
   "ver movimientos"/"ver habitaciones" de un item, pero `list-room-inventory.ts` y
   `list-inventory-movements.ts` no tienen el `@Output` equivalente — no se puede volver al
   item ni cruzar entre esas dos pestañas directamente.

## Bugs — backend

5. **Condición de carrera al registrar movimientos de inventario directos.**
   `InventoryMovement.save()` lee `self.item.stock` sin `select_for_update` y luego guarda —
   a diferencia de `RoomInventorySerializer` que sí bloquea la fila. Dos movimientos
   `OUT`/`ADJUSTMENT` concurrentes sobre el mismo item pueden leer el mismo `previous_stock`;
   el segundo en escribir "gana" (lost update) y el stock queda mal aunque cada validación
   individual pasó.
6. **`maximum_stock` no se valida cuando el stock se mueve vía `InventoryMovement`.**
   `Item.clean()` prohíbe `stock > maximum_stock`, pero `InventoryMovement.save()` actualiza el
   stock con `update_fields=["stock","updated_at"]`, que no invoca `clean()`. Una entrada `IN`
   puede dejar el stock por encima del máximo sin ningún error.
7. **`RoomInventory` puede listar/crearse apuntando a un item borrado lógicamente.**
   Ni `RoomInventoryViewSet.get_base_queryset()` ni el serializer excluyen items con
   `SoftDeleteMarker` o `is_active=False` del campo de selección — mismo patrón "fantasma" ya
   visto en otros bloques (datos borrados lógicamente que siguen operativos en pantallas
   reales).

## Verificado SIN problema

- Orden de mixins correcto (no repite el bug transversal de Finanzas/Billing/Catálogo).
- Decisión 5.20 ("una vista con pestañas") sí implementada correctamente.
- `item_purpose` (Habitación/Recepción), buscador y agrupación por categoría funcionan.
- Botón "Nuevo item" sí visible (gracias al fix de 2026-08-19).
- Validación de stock negativo correcta en ambos lados (frontend y backend).
- Historial completo por item vía `?item=<id>` funciona.
- Invalidación de caché compartida tras cada escritura — la UI se actualiza sin recargar.
- Dark mode y responsive consistentes en los tres módulos.
- Multi-tenancy correcta, con tests dedicados.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2 (acciones de negocio anunciadas e inalcanzables).
**Corregir pronto:** 5, 6, 7.
**Deuda técnica, no bloquea:** 3, 4.
