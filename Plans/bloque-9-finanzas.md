# Bloque 9 — Finanzas — Hallazgos de auditoría

Backend: 15/15 tests pasan. Los 5 bugs históricos documentados en la bitácora (consolidado
corrido un día, gráficos mock, 13 tarjetas→4 gráficos, umbrales no guardaban, "respuesta
primero") se verificaron **sin regresión** en ambos lados.

## Bug — prioridad alta

1. **Orden de mixins invertido rompe el borrado lógico en 2 de 4 ViewSets.**
   `ExpenseViewSet` y `FinancialStatementSnapshotViewSet` declaran
   `(TenantScopeMixin, LogicalDeleteViewSetMixin, ...)` — orden contrario al patrón estándar
   documentado. Como `TenantScopeMixin.get_queryset()` no llama a `super()`, el
   `get_queryset()` de `LogicalDeleteViewSetMixin` (el que excluye soft-deleted e inactivos)
   queda **inalcanzable** en el MRO (verificado con Python real). `destroy()` sí marca el
   `SoftDeleteMarker` (viene de otro método), pero como `list`/`get_object` usan
   `get_queryset()`, **un egreso o snapshot "eliminado" sigue apareciendo en `GET /expenses/` y
   sigue siendo editable vía `GET/PATCH /expenses/{id}/`**. `FinancialControlConfigViewSet` y
   `OperationalAlertViewSet` tienen el orden correcto. **bug — inconsistencia de patrón con
   efecto funcional real.**

## Bug — cálculo

2. **Notas de crédito distorsionan el simulador "what-if" de finanzas.**
   `net_revenue` resta `credit_notes_total`, pero `room_revenue` (calculado aparte desde
   `Charge`) no resta nada. En `build_what_if_scenario`,
   `base_other_revenue = base_revenue - base_room_revenue` puede volverse **negativo** si una
   nota de crédito grande reduce `net_revenue` por debajo de `room_revenue`, y ese negativo se
   escala por `occupancy_factor` — proyecciones de ingreso distorsionadas. Es un ángulo nuevo y
   propio de `finance/services.py`, distinto del ya documentado en el Bloque 8 (que es sobre
   `pending_balance`/estado de factura).

## Falta de funcionalidad

3. **No hay refresco automático del resumen "Resultado" al registrar/desactivar un egreso.**
   `ListExpenses`/`ListIncomeConsolidated` declaran `@Output() changed` pero ningún método
   llama `.emit()` — hay que pulsar "Actualizar" a mano o recargar la página para ver reflejado
   un egreso nuevo en las cifras agregadas.
4. **No existe edición de un egreso ya creado.** Solo hay "Marcar inactivo/activo"; monto,
   concepto, categoría, fecha, proveedor y referencia quedan inmutables. Un error de tipeo
   obliga a desactivar y duplicar el registro, perdiendo trazabilidad histórica.
5. **Sin cron/Celery-beat en el repo que dispare `sync_operational_alerts` periódicamente.**
   Solo hay signals por evento (crear/borrar Invoice/CreditNote/PaymentRefund); si no hay
   actividad nueva en un día, una alerta `REVENUE_DROP`/`HIGH_REFUNDS` puede quedar
   desactualizada más allá de lo real porque nada recalcula la ventana de tiempo.
6. **Los umbrales operativos no generan una sección de alertas accionables** — el tablero solo
   muestra una lista genérica de razones en texto plano (`financial_traffic_light.reasons`),
   sin botón de "atender"/"descartar" ni estado persistido. A confirmar con producto si alguna
   vez se diseñó ese flujo.

## Inconsistencias

7. **Dos métodos casi idénticos para guardar la configuración financiera** en el frontend
   (`saveConfig`/`saveConfiguration`) — solo uno está enlazado en el HTML; el otro es código
   muerto con riesgo de desincronizarse si se corrige uno y no el otro.
8. **`/control-financiero` tiene su propio selector de fecha, desconectado del periodo
   compartido de `/egresos` y `/consolidado-ingresos`.** Coherente con la decisión 5.22 (libro
   vs. análisis son cosas distintas), pero comparar cifras del mismo mes exige fijar la fecha
   dos veces a mano, sin aviso si quedan desalineadas.
9. Estado vacío de "Egresos" ofrece un atajo ("Ver todo el histórico") que "Consolidado de
   Ingresos" no ofrece — inconsistencia menor entre pantallas hermanas.

## Mejoras / riesgos a confirmar

10. `listExpenses()` no pagina; si el backend algún día activa paginación DRF en ese endpoint,
    la lista quedaría truncada a la primera página sin aviso (no confirmado como bug activo,
    depende del estado real del ViewSet — riesgo latente).
11. Exportación solo a CSV en las tres pantallas de finanzas; sin XLSX ni PDF/impresión
    dedicada.
12. `Expense.clean()` no valida fecha futura (consistente con el resto del sistema, impacto
    bajo).
13. Huecos de test: sin cobertura de API para `ExpenseViewSet`/`FinancialControlConfigViewSet`
    (CRUD, permisos, borrado lógico) — un test básico de `DELETE` seguido de `GET` habría
    detectado el bug #1. Tampoco hay test de que una nota de crédito afecte el simulador
    what-if (bug #2).

## Verificado SIN problema

- Los 5 bugs históricos de este módulo siguen corregidos, sin regresión (backend y frontend).
- Agrupación por fecha en zona horaria local (Bogotá) correcta, sin corrimiento de día.
- Deduplicación/resolución automática de `OperationalAlert` vía `select_for_update` — sin
  riesgo de alertas "pegadas" por lógica propia (solo por falta de disparador periódico, #5).
- Multi-tenancy correcta, con tests dedicados que pasan.
- CRUD de egresos (creación), filtros por fecha/categoría sin corrimiento de huso horario, y
  periodo compartido entre Ingresos/Egresos: todo funciona bien.

---

## Priorización sugerida

**Corregir ya:** 1 (rompe el borrado lógico, patrón de seguridad de datos), 2.
**Corregir pronto:** 3, 4.
**Deuda técnica / mejorable sin bloquear:** 5, 6, 7, 8, 9, 10, 11, 12, 13.
