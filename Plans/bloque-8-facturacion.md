# Bloque 8 — Facturación y pagos — Hallazgos de auditoría

Backend: 38/38 tests pasan, pero con huecos de cobertura importantes en los escenarios
críticos de abajo. Multi-tenancy verificada correcta en los 6 ViewSets de billing.

Arquitectura: las decisiones 5.19 (ciclo de cobro en una vista) y 5.16 (métodos de pago por
hotel) **sí se cumplen** y están bien implementadas — `/facturacion` con pestañas, métricas
agregadas, PDF de factura existente. No son hallazgos.

## Crítico — dinero real en riesgo

1. **El ciclo de estados de reembolso está incompleto: un reembolso aprobado nunca sale de
   caja.** El propio código documenta que solo los reembolsos en estado `PROCESADO` cuentan
   como salida real ("Cobrado neto"), pero `processPaymentRefund`/`rejectPaymentRefund`/
   `cancelPaymentRefund` existen en el servicio y **no se llaman desde ningún componente** —
   `list-payment-refunds.ts` solo implementa `approveRefund` (PENDIENTE→APROBADO). Un
   reembolso aprobado queda atascado ahí para siempre; no se puede rechazar ni cancelar uno mal
   solicitado. Esto rompe silenciosamente el cálculo de saldo que la decisión 5.19 promete
   resolver. **bug/falta de funcionalidad — alto impacto.**
2. **Dos condiciones de carrera reales con dinero.** (a) Sin lock ni constraint de BD que
   impida dos facturas activas para la misma reserva: dos peticiones concurrentes en
   `ensure_default_invoice_for_reservation` pueden generar una segunda factura activa huérfana
   (`FAC-...-2`) con subtotal/estado desincronizados del resto del sistema. (b) El chequeo
   "monto ≤ saldo disponible" en `Payment`/`PaymentRefund`/`CreditNote` se hace con un `sum()`
   en Python sin `select_for_update` ni `transaction.atomic()` en la vista — dos cobros o dos
   reembolsos simultáneos pueden pasar ambos la validación y en conjunto sobrepasar el saldo
   real. **bug — doble cobro/reembolso por encima de lo pagado.**
3. **Se puede registrar un pago sobre una factura ya anulada.** `PaymentSerializer.validate`
   solo chequea `invoice.is_active`, nunca `status_code != "ANULADA"`. Como
   `sync_invoice_status` congela el estado al llegar a `ANULADA`, el pago se registra con
   dinero real cobrado pero la factura sigue mostrando "Anulada" — nunca se refleja. **bug.**
4. **Las notas de crédito no afectan el saldo pendiente de la factura/reserva, pero sí los
   reportes financieros.** `get_invoice_reconciliation` y `get_reservation_financials` no
   restan `CreditNote.amount`; `pending_amount` de la reserva (que gatea el check-out) y el
   estado de la factura ignoran la nota de crédito. Pero `apps/finance/services.py` y
   `apps/reports/services.py` sí la restan para `net_revenue`. **Resultado: los reportes
   muestran menos ingreso, pero la factura/reserva sigue bloqueando el check-out con el saldo
   completo** aunque exista una nota de crédito que debería cerrar la diferencia. **bug —
   números que no cuadran entre pantallas.**

## Bugs / falta de funcionalidad

5. **No hay forma de anular una factura desde la UI.** `deleteInvoice`/`restoreInvoice` existen
   en el servicio pero ningún componente los llama; no hay botón "Anular factura" en
   `detail-bill` ni `list-bill`. La única acción destructiva visible hoy es desactivar cargos
   individuales.
6. **`InvoiceCharge` es funcionalmente inútil.** El total de `Invoice` se recalcula siempre
   directo desde `get_reservation_financials`, nunca desde las filas `InvoiceCharge`. Se puede
   crear/borrar `InvoiceCharge` libremente sin ningún efecto real en la factura, y se puede
   "facturar dos veces" el mismo `Charge` sin consecuencia — el modelo de datos sugiere un
   ciclo que no existe en la práctica.
7. **Sin control de transición de estado en `Invoice`.** No hay acción `cancel`/`void` ni guarda
   de transición (a diferencia de `PaymentRefundViewSet`, que exige rol admin). Cualquier
   usuario con `invoices.write` puede hacer `PATCH status=PAGADA` sin relación con pagos reales.

## Inconsistencias

8. **Validaciones de modelo duplicadas y ya divergentes entre `clean()` y `Serializer.validate()`.**
   Ninguna vista llama `full_clean()`; la lógica de negocio vive reimplementada en dos lugares
   que ya difieren sutilmente (ej. `PaymentRefundSerializer` no excluye los mismos estados que
   el modelo). Riesgo de que una regla se actualice en un lado y no en el otro.
9. **Dark mode roto en las dos pantallas más usadas del ciclo de cobro.** `detail-bill.css` y
   `credit-note-form.css` usan 31 colores hardcodeados (0 uso de los tokens `--gh-*`
   compartidos, documentados en 5.15) y casi sin overrides `:host-context(.dark)` — el modal de
   detalle de factura y el formulario de notas de crédito quedan con fondo blanco fijo en modo
   oscuro.

## Mejoras / limpieza

10. Bloques `*ngIf="!embedded"` en `list-payments`, `list-bill`, `list-payment-refunds` son
    código muerto: estos componentes solo se montan embebidos dentro de `BillingPage`, nunca
    standalone.
11. `getSuggestedRefundAmount` en `detail-payment.ts` es un método completo sin usar (la lógica
    se movió a `refund-payment.ts` sin limpiar el original).
12. `this.refreshing = false` asignado dos veces (en `next` y `error`) en `loadRefundsData` —
    inofensivo pero síntoma de copy-paste sin revisar.
13. Huecos de test: ninguno cubre el efecto de `CreditNote` sobre el saldo (coherente con #4,
    porque no hay efecto que probar), ni `InvoiceChargeViewSet` end-to-end (confirmaría #6), ni
    pagos/reembolsos concurrentes (#2), ni pago sobre factura anulada (#3), ni factura duplicada
    por carrera (#2).

## Verificado SIN problema

- Decisión 5.19 y 5.16 cumplidas e implementadas correctamente.
- Multi-tenancy correcta en los 6 ViewSets.
- `PaymentMethod` desactivado conserva correctamente el histórico de pagos (PROTECT + borrado
  lógico).
- Flujo de pago parcial y de reembolso (cálculo de saldo en el momento, tope de monto, vista
  previa) muy bien resueltos en la UI.
- PDF de factura existe y funciona ("Descargar PDF").
- Nota de crédito: CRUD completo con tope sobre el disponible de la factura.

---

## Priorización sugerida

**Bloquean despliegue / corregir ya (dinero real):** 1, 2, 3, 4.
**Corregir pronto:** 5, 7, 6.
**Deuda técnica, no bloquea:** 8, 9, 10, 11, 12, 13.
