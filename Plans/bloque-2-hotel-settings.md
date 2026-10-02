# Bloque 2 — Hotel Settings — Hallazgos de auditoría

Backend: suite ejecutada (`python manage.py test apps.hotel_settings` → 53 tests OK). 4 bugs
reproducidos activamente (no solo leídos) contra la BD de test, con rollback explícito.

## Crítico — bloquea el onboarding de cualquier hotel nuevo

1. **Bloqueo circular de setup (frontend).** El guard `hotelSetupChildGuard` solo permite
   navegar a `['hotel-config', 'hotel-setup', 'mi-perfil']` mientras `is_complete=false`. Pero
   el backend exige al menos una `Room` real con tipo y tarifa activos (`setup.py:40-47`) para
   marcar la configuración como completa — y esas Rooms/RoomType/Rate solo se crean en
   `/habitaciones`, que **no está en la whitelist**. La pestaña "Estructura" de `/hotel-config`
   solo edita `HotelFloor.room_count` (un contador desconectado del modelo `Room` real). Un
   hotel nuevo queda atrapado: el guard lo manda siempre a `/hotel-config`, que no puede crear
   habitaciones reales, y el único lugar que sí puede está bloqueado por el mismo guard. **Nunca
   se puede completar el setup por la UI.** `app.routes.ts:168-178` + `setup.py:40-47` +
   `hotel-settings.html:563-676`. **bug crítico.**

2. **`PATCH /api/hotel-floors/{id}/?delete_extra_rooms=true` con room_count menor → 500
   siempre.** `apps/hotel_settings/views.py:609,572-573` llaman `self.perform_destroy(room)`
   pasando una instancia de `Room`, pero `HotelFloorViewSet.perform_destroy` (líneas 639-643)
   espera un `HotelFloor` (`Room.objects.filter(floor=instance)`). Django lanza `ValueError`
   que se propaga como 500. Reproducido. La única prueba existente ejercita el camino de
   *aumentar* habitaciones, nunca el de reducir. **"Reducir habitaciones de un piso" está roto
   en producción.** **bug crítico.**

3. **Fuga multi-tenant vía `restore` de `HotelSettingsViewSet`.** `HotelSettingsViewSet` filtra
   tenant con su propio `get_queryset()` en vez de `TenantScopeMixin`/`get_base_queryset()`. La
   acción genérica `restore` (`accounts/soft_delete.py:50-62`) cae a `super().get_queryset()`
   sin filtro cuando no hay `get_base_queryset`. Reproducido: un usuario del Hotel B con solo
   `hotel_settings.write` de su propio hotel puede hacer `POST
   /api/hotel-settings/<hotel_A>/restore/` y leer/recuperar la configuración completa
   (dirección, razón social, teléfonos, correos, coordenadas) de **cualquier otro hotel**
   soft-deleted. `PATCH` normal sí da 404 correctamente — solo `restore` tiene el hueco.
   **bug crítico de seguridad/multi-tenancy.**

## Bugs — prioridad media

4. **Borrado de habitaciones vía piso/`HotelSettingsViewSet.clear()` no valida reservas
   activas.** `RoomViewSet.perform_destroy` sí bloquea borrar una habitación con reservas
   activas/futuras; `HotelFloorViewSet.perform_destroy` (cascada al borrar un piso) y `clear()`
   no reutilizan esa regla. Reproducido: una habitación con `ReservationRoom` activa puede
   quedar soft-deleted por este camino alterno, dejando la reserva huérfana e invisible en
   recepción. **bug.**
5. **Restaurar un piso no restaura sus habitaciones en cascada.** Al borrar un `HotelFloor` se
   borran también sus habitaciones; `restore` del piso (genérico, sin override) solo quita el
   marcador del piso, no el de sus habitaciones. El piso "recuperado" queda con `room_count`
   desfasado y cero habitaciones reales visibles. **bug** (asimetría borrar/restaurar no
   cubierta por la deuda técnica ya documentada).

## Inconsistencias

6. **Campos obligatorios del backend sin asterisco/validación en frontend.** El backend exige
   `legal_name` y `reservations_email` (`setup.py:12-24`); en el HTML "Razón Social" y "Correo
   de Reservaciones" no tienen asterisco ni se validan en `validateBeforeSave()`. El usuario
   guarda creyendo que completó todo y el banner persistente sigue avisando que falta algo.
7. **Manejo de errores de guardado inconsistente.** `saveSettings()` y `clearAllSettings()` no
   usan `extractApiErrorMessage` (a diferencia de `savePolicy`, fotos, etc.) — un 400 de
   validación siempre muestra el mismo mensaje genérico, sin decir qué campo falló.
8. **Selector de hotel duplicado y no sincronizado.** El selector del header
   (`HotelContextService`, persistido en localStorage) y el selector propio de `/hotel-config`
   son estados independientes; esta vista nunca lee el contexto del header como valor inicial —
   un admin de plataforma tiene que re-elegir hotel al entrar aquí.
9. **Unicidad validada con "check-then-create" sin capturar `IntegrityError`** en
   `HotelFloorSerializer`, `ReservationPolicySerializer`, `PaymentMethodSerializer` — dos
   requests concurrentes con el mismo nombre/número pueden dar 500 en vez de 400 controlado.
   (condición de carrera menor).

## Mejoras / huecos de cobertura

10. Página `/hotel-setup` (fallback para usuarios sin permiso de edición) no lista qué falta,
    a diferencia del banner persistente global que sí lo hace.
11. Botón "Vista previa" de colores (`hotel-settings.html:357`) no tiene `(click)` — es
    decorativo, puede confundir en QA pensando que es interactivo.
12. Sin tests para: reducir `room_count` con `delete_extra_rooms=true` y habitaciones reales de
    más; `restore` cross-tenant en hotel-settings; `restore` de piso con habitaciones; borrado de
    habitación con reserva activa vía piso/clear. Estos 4 huecos son exactamente por qué los
    bugs 2-5 pasaron inadvertidos.

## Verificado SIN problema

- Colores de marca persisten en `HotelSettings` (no localStorage) — sin regresión.
- Vista previa de sitio web y minimapa siguen cableados correctamente.
- Interceptores `hotel_inactive` y `hotel_setup_required` funcionan como se documentó.
- `required_scopes` read/write correctos en los 4 ViewSets.
- Admin global editando cualquier hotel vía `?hotel_settings=<id>` es comportamiento
  intencional, no fuga.
- Orden de middlewares correcto; hotel inactivo bloquea incluso `/api/auth/hotel-setup/` (sin
  alertas confusas cruzadas).

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2, 3 (los tres críticos — el #1 es el más urgente:
sin él, **ningún hotel nuevo puede terminar de configurarse**), 4, 5.
**Corregir en este bloque si hay tiempo:** 6, 7, 8, 9.
**Mejora / deuda técnica nueva, no bloquea:** 10, 11, 12.
