# Bloque 6 — Reservas — Hallazgos de auditoría

Backend: 74 tests de `apps.reservations.tests` pasan. Multi-tenancy verificada correcta en
depósitos e inventario de check-out (hay test explícito que impide mezclar items de otro
hotel).

## Crítico — el check-out con saldo cero se puede evadir por completo

1. **El backend trata la ausencia de `inventory_review` como "sin diferencias", no como "falta
   revisar".** `validate_checkout_inventory_review_payload` (`services.py:1363-1368`) acepta
   `None`/`""`/`[]` como válido; `create_checkout_inventory_comparison`
   (`services.py:1600-1611`) entonces hace `reviewed_by_key = dict(expected_by_key)` — es decir,
   si no se manda el payload, asume que lo contado coincide exactamente con lo esperado.
   **Basta con omitir `inventory_review` para que el check-out "pase" sin faltantes, sin cargo,
   y sin tocar inventario real.** No hay test que cubra este camino. **bug crítico de control
   interno.**
2. **El frontend activa ese bypass en producción, no por ataque sino por diseño incompleto.**
   Hay DOS caminos de check-out en la UI contra el mismo endpoint:
   - `detail-reservation.ts` → sí envía `inventory_review` con cantidades reales. Funciona bien.
   - `room-check-modal.ts` (usado desde la ficha de reserva activa en la tarjeta de habitación,
     `confirm()` línea ~596) → llama `checkOutReservation(reservationId)` **sin ningún
     payload**. Combinado con el hallazgo #1, **todo check-out hecho desde la tarjeta de
     habitación cierra la estadía sin detectar faltantes ni generar cargo**, aunque el modal
     muestre una lista informativa de "inventario bajo mínimo" (de solo lectura, sin inputs de
     cantidad contada). Un recepcionista que use este camino —probablemente el más natural
     desde el tablero diario— nunca cobra por artículos faltantes reales. **bug crítico,
     confirmado en ambos lados (backend permite el bypass, frontend lo ejercita por defecto).**

## Bugs — prioridad alta

3. **Una reserva "eliminada" sigue bloqueando la habitación para siempre.** El soft-delete de
   `Reservation`/`ReservationRoom` solo crea un `SoftDeleteMarker`, sin disparar signals; las
   queries de disponibilidad (`find_overlapping_reservation_room`,
   `services.py:972-979`) no filtran por `SoftDeleteMarker`, solo por `status__code`. Eliminar
   una reserva activa la quita de los listados pero sus fechas siguen bloqueadas y la
   habitación nunca se libera salvo que otro evento recalcule su estado. **bug.**
4. **Condición de carrera real en la validación de solapamiento de fechas.**
   `find_overlapping_reservation_room` solo hace un SELECT sin `select_for_update`, en los tres
   puntos donde se usa (`ReservationRoom.clean()`, dos serializers). No hay
   `ExclusionConstraint` de PostgreSQL sobre `(room, rango de fechas)` como respaldo. Dos
   requests concurrentes pueden pasar ambos la validación y crear dos reservas para el mismo
   cuarto en fechas superpuestas. El único test de solapamiento es secuencial, no de
   concurrencia. **bug de concurrencia.**
5. **El Django Admin permite saltarse por completo el flujo de check-out con saldo cero.**
   `ReservationAdmin.readonly_fields` no incluye `status`, `real_check_in` ni `real_check_out` —
   son editables directamente. Un usuario con acceso al admin puede poner
   `status=FINALIZADA` sin pasar por la validación de saldo, la revisión de inventario, la
   generación de cargos, `create_post_checkout_cleaning_tasks` ni la emisión de factura. **bug.**
6. **Edición directa de `ReservationInventoryCheckLine` después de un check-out finalizado.**
   `ReservationInventoryCheckLineViewSet`/`ReservationInventoryCheckViewSet` son `ModelViewSet`
   completos sin regla adicional: se puede ajustar `reviewed_quantity` a mano después de que ya
   se generó el `Charge` por faltante (sin signal que lo resincronice), o soft-eliminar el check
   de CHECK_OUT para "limpiar" evidencia. **bug de integridad / falta de inmutabilidad.**
7. **Cargo por faltante con precio $0 silencioso.** `create_inventory_missing_charges_for_
   checkout` (`billing/services.py:222-228`) saca el precio de `item.sale_price`
   (default 0, nunca null) — si el item no tiene precio configurado, el cargo se genera en
   silencio con `unit_price=0`, sin warning ni bloqueo. Si el item no se encuentra, la línea se
   salta sin log. Un faltante real puede terminar costando $0 al huésped sin rastro de la
   omisión. **bug / inconsistencia.**

## Falta de funcionalidad

8. **No se pueden editar/anular depósitos ni editar huéspedes después de creada la reserva,
   aunque el backend sí lo permite.** El servicio frontend solo tiene `createReservationDeposit`
   (sin listar/editar/eliminar) y el modal de huéspedes es de solo lectura; `update-reservation`
   no incluye `guest_lines`. `ReservationDepositViewSet` y `ReservationGuestViewSet` son
   `ModelViewSet` completos en el backend, sin equivalente en la UI.
9. **Cancelación no afecta cargos/depósitos/facturas ya generadas.** `cancel()` solo cambia
   `status`; si ya existían cargos o factura emitida, quedan activos/pendientes sin vincularse a
   ninguna reserva operativa.
10. **Estado `NO_SHOW` existe en el dominio pero nunca se usa.** No está en las transiciones
    permitidas ni hay acción para asignarlo; el comando de auto-cancelación de reservas vencidas
    sin check-in las marca como `CANCELADA` en vez de `NO_SHOW`.
11. **Sin huésped "principal" ni mínimo exigido en `ReservationGuest`.** Se pueden borrar todos
    los huéspedes de una reserva ya con check-in o finalizada, sin validación (aunque en la
    práctica hoy no hay ni botón para hacerlo desde la UI — ver #8).

## Inconsistencias

12. **`ReservationDeposit` (modelo) está muerto.** El endpoint real de depósitos opera sobre
    `apps.billing.Payment` vía un serializer de compatibilidad; nada escribe en la tabla
    `reservation_deposit`, y su `clean()` nunca se invoca. Riesgo de que un dev futuro asuma que
    ahí están los depósitos reales.
13. **Mensaje de error de solapamiento de habitación en inglés** ("Room X already has an active
    reservation...", `serializers.py:226-235`), rompiendo la consistencia de idioma español del
    resto de la UI — y el frontend solo detecta colisión contra UNA reserva activa por
    habitación, no contra la 2ª/3ª futura.
14. **El drawer principal de la reserva no se refresca tras un check-out rechazado por saldo
    pendiente.** El modal muestra "Falta cobrar $X" pero al cerrarlo el panel principal sigue
    mostrando el saldo/estado de pago viejos.
15. **`room-check-modal.ts` muestra siempre un mensaje de error genérico** en el check-out
    (ignora `error.error.detail`), a diferencia de `detail-reservation.ts` que sí es específico.
16. **Soft-delete de `ReservationInventoryCheck` deja estado confuso de auditoría**: la fila
    sigue físicamente en la tabla con su constraint única intacta; un nuevo check-out la
    reutiliza/sobreescribe sin limpiar el marcador de borrado.
17. **El campo "Cliente" en crear reserva es un `<select>` nativo de todos los clientes**, sin
    búsqueda por documento — inviable con muchos clientes, contrasta con el buen lookup por
    documento que sí existe para huéspedes en el mismo wizard.

## Mejoras

18. `apply_checkout_consumption_inventory` solo decrementa el stock global del `Item`, nunca
    `RoomInventory.quantity` de la habitación — posiblemente intencional (par fijo vs. almacén),
    pero sin documentación explícita; vale confirmar con negocio. Los `warnings` de descuento
    parcial por stock insuficiente no se persisten ni se muestran, solo se devuelven en un dict
    que la vista ignora.
19. Huecos de test: ninguno cubre (a) check-out sin `inventory_review`, (b) edición directa de
    una línea de inventario tras checkout finalizado, (c) item con `sale_price=0`, (d) el modelo
    muerto `ReservationDeposit`, (e) concurrencia en solapamiento de fechas.

## Verificado SIN problema

- Validación de depósitos (monto > 0, no exceder saldo pendiente, exclusión correcta al editar)
  — robusta.
- El diseño de idempotencia del check-out normal (vía `detail-reservation`) es correcto:
  `automation_key`/`reference` únicos evitan duplicar cargos o movimientos si se reintenta tras
  pagar.
- Fix ya aplicado de `select_for_update` sobre join nullable sigue vigente; se revisaron los
  demás usos en el módulo y ninguno repite el patrón de riesgo.
- Crear, confirmar, check-in, cancelar, eliminar/restaurar reserva: cobertura de UI completa y
  funcional para estas acciones.
- Multi-tenancy correcta en depósitos e inventario de check-out.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2 (el mismo bug, backend+frontend — es el más grave
del bloque: hoy se puede cerrar cualquier estadía sin cobrar faltantes reales), 3, 4, 5.
**Corregir pronto:** 6, 7, 8, 9.
**Deuda técnica nueva, no bloquea:** 10, 11, 12, 13, 14, 15, 16, 17, 18, 19.
