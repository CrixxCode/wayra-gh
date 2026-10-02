# Bloque 3 — Master Data — Hallazgos de auditoría

Aclaración de modelo: `MasterData` NO es un catálogo geográfico jerárquico. Es un catálogo
plano `(group, code, name, description, is_active, sort_order)` con ~28 `group` posibles
(DOCUMENT_TYPE, CLIENT_TYPE, ROOM_STATUS, PAYMENT_METHOD, CHARGE_TYPE, etc.), sin jerarquía
interna. `/master-data` es una única pantalla CRUD genérica (solo visible para admin de
plataforma) que cubre todos los grupos. No hay tests (`apps/master_data/tests.py` no existe —
confirmado: "Ran 0 tests").

## Bugs — grupo ROOM_TYPE zombi (el hallazgo más importante del bloque)

1. **`MasterData.Group.ROOM_TYPE` sigue activo y seleccionable en `/master-data`, pero no hace
   nada.** Los tipos de habitación reales viven en una tabla aparte (`apps.rooms.RoomType`),
   gestionada solo desde `/habitaciones`. Los registros `group=ROOM_TYPE` del catálogo maestro
   fueron borrados por la migración `0014_delete_room_type_records.py`, pero el enum y el
   endpoint `/master-data/groups` siguen ofreciéndolo (el datalist incluso sugiere "Room type").
   **Escenario real:** un admin entra a `/master-data`, crea un valor con grupo `ROOM_TYPE` y
   nombre "Suite", pensando que da de alta un tipo de habitación. El registro se guarda sin
   error y no aparece en ningún lado — ni en `/habitaciones`, ni en los selects de tipo de
   habitación de reservas/tarifas/paquetes. Dato fantasma, confusión garantizada para el
   usuario y para soporte. **bug / inconsistencia — alto.**
2. **Propiedades muertas en el `RoomType` proxy de `master_data`.** `models.py:82-95`:
   `capacity`, `bed_count`, `bed_type` leen `self.metadata`, campo eliminado en la migración
   `0010_remove_masterdata_metadata_...`. Como usan `getattr(..., None) or {}`, nunca lanzan
   error — simplemente siempre devuelven `capacity=1`, `bed_count=1`, `bed_type=None`. Hoy no
   lo usa nadie (confirmado por grep: todo el resto del código importa
   `apps.rooms.models.RoomType`), pero es una trampa latente si alguien lo reutiliza. **bug
   latente, bajo impacto actual.**
3. **`group` es texto libre sin validar contra los grupos reales que consume el resto de la
   app.** El backend (`serializers.py: validate_group`) solo exige no-vacío; el frontend
   permite crear "grupo nuevo" con cualquier texto que matchee `/^[A-Z0-9_]+$/`. Pero **15+
   archivos del frontend** (room-modal.ts, create-reservation.ts, list-services.ts, etc.)
   consumen el grupo como **string literal hardcodeado** (`'CLEANING_TASK_TYPE'`,
   `'PAYMENT_METHOD'`...), sin enum compartido. Un typo al crear un grupo (ej.
   `PAYMENT_METHODS` en vez de `PAYMENT_METHOD`) crea un grupo huérfano: se guarda sin error,
   pero ningún formulario real lo mostrará jamás. Fallo silencioso. **bug — medio-alto.**

## Falta de funcionalidad

4. **Sin UI de restauración pese a que el backend la soporta.** `MasterDataService.
   restoreMasterData()` existe pero no se llama desde ningún componente; la pantalla nunca
   pide `include_deleted=true` ni ofrece filtro "Eliminados". Eliminar un valor de catálogo es
   irreversible desde la UI (aunque el dato sigue en BD) — soporte tendría que restaurarlo a
   mano en el backend.
5. **0% de cobertura de tests** en un catálogo consumido por ~12 pantallas/apps distintas: sin
   red de seguridad para unicidad `(group, code)`, normalización de código a mayúsculas,
   filtros, o manejo de `ProtectedError` en destroy.

## Inconsistencias

6. **Dark mode casi no implementado.** `master-data.css` tiene solo 2 reglas
   `:host-context(.my-app-dark)` (vs. 94 en `hotel-settings.css`, página núcleo comparable).
   Tarjetas de stats, tabla, drawer, toasts y botones quedan con colores claros fijos — la
   pantalla se ve como una "isla clara" dentro del shell oscuro.
7. **Error de `listGroups()` tragado en silencio** (sin toast) en `loadInitialData()`, mientras
   `loadMasterData()` sí avisa. Si falla el endpoint `groups/`, el filtro y el datalist quedan
   vacíos sin explicación.

## Mejoras

8. Sin acción de reordenar en lote (`sort_order`) ni validación de `name` duplicado dentro de
   un mismo `group` (solo `code` es único).
9. El slug/código autogenerado es de solo lectura al crear — si no coincide con lo que otro
   módulo espera, no se puede ajustar manualmente antes de guardar.

## Verificado SIN problema

- Multi-tenancy: correcto que `MasterData` no tenga FK a hotel — es un catálogo global y el
  ViewSet deliberadamente no aplica `TenantScopeMixin` (documentado explícitamente en
  `seed_rbac.py`).
- Scopes `master_data.read`/`write` coherentes entre backend y `seed_rbac.py`.
- No hay botones muertos en la pantalla: todo el CRUD visible (crear grupo/valor, editar,
  eliminar, toggle activo) tiene handler real.
- Invalidación de caché (`ResourceCache.invalidate`) correcta: editar en `/master-data`
  refresca los selects de otras pantallas sin esperar el TTL.
- Sin problema de paginación truncando selects de otros módulos.

---

## Priorización sugerida

**Corregir ya (confunde datos reales de negocio):** 1, 3.
**Corregir pronto:** 4 (falta de restauración), 2 (limpiar código muerto/engañoso).
**Mejorable sin bloquear:** 5, 6, 7, 8, 9.
