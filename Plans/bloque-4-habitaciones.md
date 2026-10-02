# Bloque 4 — Habitaciones (tipos, tarifas, amenidades, mantenimiento, limpieza)

Backend: 58 tests de `apps.rooms` pasan. Multi-tenancy confirmada correcta en todo el módulo
(restore de RoomType/Rate/Amenity sí aplica el mismo scoping que Room — no hay fuga cross-tenant
como la de Hotel Settings).

## Bugs — prioridad alta

1. **"Marcar fuera de servicio" no valida reserva activa ni pide confirmación (frontend).**
   `room-modal.ts:870-883` se ejecuta con un solo clic, sin el diálogo de dos pasos que sí tiene
   "Eliminar" y sin chequear `activeReservation`. Si se pulsa por error en una habitación
   ocupada, la reserva sigue corriendo pero la habitación desaparece operativamente del tablero
   (deja de verse como ocupada/con huésped). **bug alto.**
2. **Un PATCH directo a `Room.status` puede poner "Disponible" una habitación realmente
   ocupada, habilitando doble check-in.** `RoomSerializer.validate()` no valida transición de
   estado; el único mecanismo que mantiene el estado correcto es el sync automático que solo se
   dispara ante eventos de reserva/limpieza, no ante un PATCH directo. Y
   `_reservation_rooms_available_for_check_in` usa literalmente `room.status.code !=
   DISPONIBLE` como gate — permite iniciar el check-in de una **segunda** reserva sobre una
   habitación que sigue físicamente ocupada. **bug — brecha real rooms↔reservations.**
3. **Borrar (lógicamente) un `RoomType`/`Rate` con habitaciones activas no se bloquea.**
   `RoomTypeViewSet`/`RateViewSet` no sobreescriben `perform_destroy` (a diferencia de
   `RoomViewSet`, que sí valida reservas activas). El tipo/tarifa "borrado" desaparece de los
   modales de `/habitaciones` pero `Room.room_type_id`/`rate_id` siguen apuntando ahí — la
   habitación sigue funcionando con normalidad, y `hotel_settings/setup.py` sigue considerando
   el hotel "operable" porque el borrado lógico no cambia `is_active`. Estado fantasma, no
   detectable salvo abriendo el combo de edición. **bug / inconsistencia.**
4. **Restaurar una `CleaningTask`/`MaintenanceOrder` eliminada no re-sincroniza el estado de la
   habitación.** El `restore()` genérico solo borra el `SoftDeleteMarker`, sin `.save()`/signals.
   `RoomViewSet.restore` sí re-sincroniza; `CleaningTaskViewSet`/`MaintenanceOrderViewSet` no lo
   sobreescriben. Si se restaura una tarea de limpieza abierta por error, la habitación puede
   quedar "Disponible" aunque la limpieza pendiente volvió a estar activa. **bug.**
5. **Precios negativos en `Rate` sin validación.** `Rate.price` no tiene `MinValueValidator` ni
   chequeo en `validate()`. El cálculo de reserva sí clampa a 0, así que el efecto visible es
   peor: la UI muestra "-50.00" pero la factura cobra "0.00" — desconfianza en los datos. **bug
   / falta de validación.**
6. **RoomType/Rate/Amenity desactivados dejan habitaciones mostrando "sin configurar" aunque sí
   tienen datos (frontend).** `list-rooms.ts` carga catálogo solo activo (`listRoomTypes()`/
   `listRates()` sin `include_inactive`); si se desactiva (no elimina) un tipo/tarifa/amenidad
   que una habitación ya usa, el modal muestra "Sin tipo asignado"/"Sin tarifa seleccionada" y
   pierde la opción del select, aunque la habitación conserva el FK y sigue "configurada" para
   el sistema. Mismo problema con amenidades en el grid de selección. **bug / inconsistencia.**
7. **Cambiar el "Tipo de cobro" (`billing_mode`) de un RoomType desincroniza la tarifa
   "vigente" mostrada.** El gestor de tipos calcula la tarifa vigente sin filtrar por
   `billing_mode`; el modal de habitación sí exige que coincida. Resultado: el gestor dice
   "tiene tarifa vigente $X" pero esa tarifa no aparece como opción real en ninguna habitación
   de ese tipo. **bug.**
8. **Órdenes de mantenimiento nunca afectan `Room.status`.** Una orden urgente abierta puede
   coexistir con habitación "Disponible" — solo hay un badge informativo, nada bloquea rentarla
   ni fuerza "Fuera de servicio". **inconsistencia (de diseño, pero sin aviso suficiente).**
9. **Dos definiciones distintas de "mantenimiento abierto" en backend.**
   `RoomPanelSerializer.get_active_maintenance` usa allowlist fija; `build_room_operations_map`
   usa denylist. Si se agrega un estado intermedio nuevo en MasterData, una vista deja de
   contarlo mientras la otra sí — desincronización visual entre pantallas. **inconsistencia.**

## Falta de funcionalidad

10. **No hay forma de ver ni restaurar una habitación eliminada desde la UI.**
    `restoreRoom()` existe en el servicio pero no se llama desde ningún componente;
    `list-rooms` no tiene toggle "ver eliminadas" (sí lo tienen los managers de tipos/tarifas/
    amenidades).
11. **Ningún modelo de limpieza/mantenimiento tiene campo de asignación a responsable**, ni en
    backend ni en UI (sin selector "asignar a").
12. **Sin máquina de estados server-side para limpieza/mantenimiento.** El frontend simula la
    secuencia con botones, pero un PATCH directo puede saltar de PENDIENTE a COMPLETADA o
    reabrir sin control.
13. **Sin edición post-creación de tareas de limpieza/órdenes de mantenimiento en el
    frontend** — las vistas de detalle son solo lectura + avanzar estado o eliminar; un error al
    crear obliga a eliminar y recrear.
14. **Sin tests dedicados a `CleaningTaskViewSet`/`MaintenanceOrderViewSet`** (CRUD, scopes,
    multi-tenant, restore) — el bug #4 se habría detectado con un test básico de restore.

## Inconsistencias menores / mejoras

15. "Fuera de servicio" y "Disponible" usan fuentes de datos distintas al guardar (uno mezcla
    cambios sin guardar del formulario, el otro solo datos persistidos) — comportamiento
    impredecible si hay ediciones pendientes sin guardar.
16. `RoomType.capacity`/`bed_count` permiten `0` (solo `PositiveIntegerField`, sin mínimo 1 en
    serializer); el código consumidor lo parchea disperso con `or 1` en vez de validar en el
    origen.
17. Campo duplicado con typo `florr_number` junto a `floor_number`, expuesto en la API pública y
    consumido en frontend — ruido de contrato permanente.
18. Doble cálculo de `sync_room_status_for_room_ids` en cada escritura de `CleaningTask` (se
    llama explícito en el ViewSet y de nuevo vía signal) — consultas redundantes, no es un bug
    funcional.

## Verificado SIN problema

- Multi-tenancy correcta en todo el módulo (incluido `restore`).
- Cobro por habitación vs. por persona: `RoomType.save()`/`Rate.save()` sincronizan
  `billing_mode` consistentemente; no se puede dejar una `Rate` con `billing_mode` distinto a su
  tipo.
- `copy_configuration` no copia número ni estado ni huésped actual — solo tipo, tarifa,
  amenidades, notas e inventario, con confirmación explícita en el diálogo.
- El borrado en dos pasos de `Room` (vía `/habitaciones`) funciona bien y tiene buen copy.
- Check-out → creación de tareas de limpieza post-checkout: funciona y está testeado.
- 58/58 tests de `apps.rooms` pasan.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2, 3, 4 (bugs de datos/estado que confunden operación
real), 5.
**Corregir pronto:** 6, 7, 10.
**Deuda técnica nueva, no bloquea:** 8, 9, 11, 12, 13, 14, 15, 16, 17, 18.
