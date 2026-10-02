# Hallazgo transversal — orden de mixins invertido rompe el borrado lógico en 11 ViewSets

**Origen:** detectado primero en el Bloque 9 (Finanzas) en 2 ViewSets. Al generalizar la
búsqueda con un grep del patrón en todo `backend/` y confirmar con el MRO real de Python, el
problema resultó mucho más extendido. Este archivo consolida el hallazgo completo; los
archivos de bloque ya escritos (7, 8, 9) quedan con su versión parcial — este documento es la
versión completa y la referencia a usar al corregir.

## El bug

El patrón estándar documentado en `AGENTS.md` es:

```python
class MiViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
```

`LogicalDeleteViewSetMixin.get_queryset()` (`accounts/soft_delete.py:99-118`) llama a
`super().get_queryset()` y luego excluye los registros con `SoftDeleteMarker` y, si el modelo
tiene `is_active`, filtra por `is_active=True` salvo que se pida `include_inactive`/
`include_deleted` explícitamente.

`TenantScopeMixin.get_queryset()` (`accounts/tenancy.py:71-77`) **no llama a `super()`** — solo
aplica el filtro de tenant y retorna.

Cuando el orden de herencia se invierte a `(TenantScopeMixin, LogicalDeleteViewSetMixin, ...)`,
Python resuelve `get_queryset` desde `TenantScopeMixin` primero en el MRO, y como ese método no
llama a `super()`, **el `get_queryset()` de `LogicalDeleteViewSetMixin` nunca se ejecuta**. El
filtro de borrado lógico y el de `is_active` quedan completamente inalcanzables para `list`,
`retrieve`, `update` — cualquier operación que dependa de `get_queryset()`.

Verificado con el MRO real de Python (no solo por lectura de código):

```
ServiceViewSet                      -> get_queryset resuelto desde: TenantScopeMixin  (bug)
PromotionViewSet                    -> get_queryset resuelto desde: TenantScopeMixin  (bug)
PackageViewSet                      -> get_queryset resuelto desde: TenantScopeMixin  (bug)
PackageServiceViewSet               -> get_queryset resuelto desde: TenantScopeMixin  (bug)
ChargeViewSet                       -> get_queryset resuelto desde: TenantScopeMixin  (bug)
InvoiceViewSet                      -> get_queryset resuelto desde: TenantScopeMixin  (bug)
InvoiceChargeViewSet                -> get_queryset resuelto desde: TenantScopeMixin  (bug)
PaymentViewSet                      -> get_queryset resuelto desde: TenantScopeMixin  (bug)
CreditNoteViewSet                   -> get_queryset resuelto desde: TenantScopeMixin  (bug)
ExpenseViewSet                      -> get_queryset resuelto desde: TenantScopeMixin  (bug)
FinancialStatementSnapshotViewSet   -> get_queryset resuelto desde: TenantScopeMixin  (bug)
PaymentRefundViewSet                -> OK (sobrescribe get_queryset directamente, sin el problema)
```

11 de 24 ViewSets del proyecto que usan ambos mixins tienen el orden invertido.

## Impacto real

Para cada uno de estos 11 recursos, hoy:
- **Un registro "eliminado" (soft-delete) sigue apareciendo en `GET /list/` y `GET /{id}/`**, y
  sigue siendo editable vía `PATCH`/`PUT`, porque el filtro que lo excluiría nunca corre.
- **Un registro con `is_active=False` también sigue apareciendo** por defecto en listados,
  cuando el comportamiento esperado es ocultarlo salvo `include_inactive=true`.
- `restore()` no se ve afectado por este bug específico (usa `get_base_queryset()` +
  `_apply_tenant_scope_if_available()` por separado, no `get_queryset()`), así que no hay fuga
  cross-tenant por esta vía — es un problema de filtrado, no de aislamiento entre hoteles.

## Recursos afectados y su relación con hallazgos ya documentados

- **`Service`, `Promotion`, `Package`, `PackageService`** (Bloque 7): esto **explica y agrava**
  el hallazgo #3 de ese bloque (la acción `target_catalog` no respeta el borrado lógico) — en
  realidad **ningún** endpoint de estos 4 recursos respeta el borrado lógico ni `is_active` en
  sus listados normales, no solo `target_catalog`.
- **`Charge`, `Invoice`, `InvoiceCharge`, `Payment`, `CreditNote`** (Bloque 8): un cargo,
  factura, pago o nota de crédito "anulado"/"eliminado" sigue apareciendo en los listados de
  facturación y sigue siendo editable. Esto se suma a los hallazgos de condición de carrera y
  de pagos sobre facturas anuladas ya documentados ahí — el terreno es aún menos seguro de lo
  que ese informe por sí solo sugiere.
- **`Expense`, `FinancialStatementSnapshot`** (Bloque 9): ya documentado como hallazgo #1 de
  ese bloque; este documento es la versión completa (el bloque 9 solo detectó 2 de los 11).

## Clasificación y prioridad

**Bug — corregir ya.** Es un fix mecánico (reordenar los dos mixins en la declaración de cada
una de las 11 clases) pero de alto impacto porque toca borrado lógico y visibilidad de datos en
los módulos de dinero (billing, finance) y catálogo comercial (services, packages,
promotions). Antes de corregir, verificar con tests que ningún código dependa accidentalmente
del comportamiento actual (ej. algo que hoy "funciona" solo porque ve registros inactivos que
no debería ver).

**Recomendación adicional:** agregar un test genérico (`accounts.tests`, al estilo de
`SeedRbacCoverageTests`) que recorra todos los ViewSets del proyecto y falle si alguno declara
`TenantScopeMixin` antes de `LogicalDeleteViewSetMixin` en su MRO, para que este bug no pueda
reaparecer silenciosamente en un ViewSet futuro.
