# Bloque 5 — Clientes — Hallazgos de auditoría

Backend: `python manage.py test apps.clients` → 3/3 OK (cobertura mínima, ver hallazgo 7).

## Bug — prioridad alta

1. **El endpoint `set-client-type` no sirve: el tipo de cliente siempre se sobreescribe
   automáticamente.** `models.py:87-103` (`Client.save()`) recalcula `client_type` desde
   `resolve_client_type_code_by_stay_nights()` y lo asigna sin condición en cada guardado, sin
   importar qué llegó en `validated_data`. Como `total_stay_nights` no es editable vía API,
   todo cliente nuevo queda forzado a `REGULAR` aunque el payload pida `VIP`/`FRECUENTE`.
   Consecuencia: `PATCH /api/clients/{id}/set-client-type/` (`views.py:160-191`) hace
   `client.client_type = ...; client.save(...)`, pero `save()` lo pisa antes del UPDATE — el
   endpoint **nunca persiste el valor solicitado**, sin error ni aviso. Confirmado también que
   `setClientType()` existe en el frontend pero no se llama desde ningún componente (endpoint
   muerto en ambos lados). **bug — funcionalidad rota + código muerto.**

## Inconsistencias

2. **Diseño ambiguo sobre si `client_type` es editable.** La API acepta `client_type` en
   create/update como si fuera un campo normal, pero el modelo lo trata como 100% derivado.
   Debería ser read-only en el serializer de escritura si realmente es automático.
3. **Validación de duplicados case-insensitive en el serializer vs. constraint case-sensitive
   en BD.** `serializers.py:325-333` usa `iexact`, pero el `UniqueConstraint` de
   `models.py:52-55` es exacto. Dos requests concurrentes con "AB123" y "ab123" podrían crear
   2 clientes duplicados pasando ambas validaciones (race condition).
4. **El admin de Django no respeta el borrado lógico.** `ClientAdmin` lista también los
   clientes soft-deleted y borra físicamente desde ahí (no vía `SoftDeleteMarker`), rompiendo
   el patrón del resto del sistema (si el cliente tiene reservas, `PROTECT` sí lo bloquea).
5. **`document_type` hardcodeado en el formulario** (CC/CE/DNI/PASAPORTE) en vez de cargarse
   desde `MasterData` grupo `DOCUMENT_TYPE` — confirma en Clientes el mismo problema ya
   documentado en el Bloque 3 (hardcoding de grupos de MasterData en el frontend).

## Mejoras

6. `setStatus()`/`setClientType()` del frontend son código muerto — deuda técnica, falso
   indicio de funcionalidad disponible.
7. `loadClients()` hace **dos** peticiones completas sin paginar (`include_inactive=true` y
   `+include_deleted=true`) y pagina/filtra todo en el cliente; `OptionalPageNumberPagination`
   existe en backend pero nunca se usa desde este módulo — con cientos/miles de clientes esto
   pesará.
8. Huecos de test: solo 3 tests, todos de validación de serializer. Sin cobertura de ViewSet
   (create/update/delete/restore), `set-status`/`set-client-type`, aislamiento multi-tenant,
   unicidad por hotel, ni `register` público.
9. El registro público de clientes depende de 3 variables de entorno, pero solo
   `ALLOW_PUBLIC_CLIENT_REGISTRATION` tiene default documentado — si se activa sin configurar
   las otras dos, el endpoint queda roto en producción con un error genérico.

## Verificado SIN problema

- Multi-tenancy correcta (`TenantScopeMixin` + validación de hotel en `validate()`); sin fuga
  de datos entre hoteles.
- Unicidad por hotel (documento/email) correcta a nivel de BD + serializer, salvo el edge-case
  de mayúsculas (#3).
- Borrado/restauración vía `SoftDeleteMarker` funcionan y la UI los usa correctamente (botones
  reales, no muertos).
- Relación con Reservas: `Reservation.client` es FK real con `on_delete=PROTECT`; el formulario
  de nueva reserva permite buscar/seleccionar un cliente existente por documento antes de crear
  uno nuevo — **no se detectó duplicación sistemática de clientes** por reservas repetidas
  (se confirmará a fondo en el Bloque 6 — Reservas).
- Formularios de creación/edición con validaciones razonables y manejo de estados de
  guardado/error.

---

## Priorización sugerida

**Corregir ya:** 1 (funcionalidad anunciada que no funciona).
**Corregir pronto:** 3, 4, 5.
**Mejorable sin bloquear:** 2, 6, 7, 8, 9.
