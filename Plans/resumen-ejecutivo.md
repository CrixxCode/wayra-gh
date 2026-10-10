# Resumen ejecutivo — Auditoría completa Wayra (16 bloques)

Auditoría módulo por módulo del sistema completo (backend + frontend), hecha para identificar
todo lo que debe corregirse antes de poder considerar una versión lista para desplegar. El
detalle completo de cada bloque vive en `Plans/bloque-1-*.md` a `Plans/bloque-16-*.md` y en
`Plans/hallazgo-transversal-orden-mixins.md`. Este documento es solo la lista priorizada de lo
que de verdad importa.

**Estado real del código hoy:** 396/396 tests de backend pasan, build y lint de frontend
pasan limpio, 540/543 tests de frontend pasan (los 3 que fallan son un problema del propio
test, no del producto — ver Bloque 16). El código "funciona" en el sentido de que corre y no
está roto a nivel de compilación. Los problemas de abajo son todos de **lógica de negocio,
seguridad y datos** que los tests actuales no cubren.

---

## Nivel 1 — Seguridad y datos sensibles (corregir antes que nada)

> **Estado 2026-10-07:** ✅ los 7 ítems corregidos con tests de abuso — ver la entrada
> "Auditoría, Nivel 1" en la sección 12 de `AGENTS.md`. El #4 resultó más amplio: el hueco de
> `restore` afectaba también a usuarios, reservas y sus sub-recursos, no solo a `hotel_settings`.

Estos pueden causar daño real a usuarios reales u otros hoteles, no solo errores visibles.

1. **Reset de contraseña con `base_url` no validado → vector de phishing.** Cualquiera puede
   pedir un reset para el email de otra persona y hacer que el correo legítimo de Wayra
   contenga un enlace a un dominio de su elección. (Bloque 1)
2. **Reserva pública puede sobrescribir el perfil de un cliente real ajeno** (nombre, email,
   teléfono) solo conociendo su email o documento, sin verificación de identidad — riesgo de
   secuestrar el email de contacto de un huésped real. (Bloque 14)
3. **El check-in online permite enumerar códigos de reserva válidos**, violando la decisión
   explícita de que el código no fuera enumerable. (Bloque 14)
4. **Cualquier usuario con `hotel_settings.write` puede restaurar y leer la configuración
   completa de cualquier otro hotel borrado lógicamente** (dirección, teléfonos, correos,
   coordenadas) — fuga entre tenants. (Bloque 2)
5. **El esquema completo de la API queda público sin login en producción** (`/api/schema/`,
   `/api/docs/`) por un default de la librería que nadie sobreescribió — cualquiera puede
   descargar el mapa completo de toda la superficie de ataque interna. (Bloque 15)
6. **Con el registro público activado, un usuario autenticado sin permisos puede crear
   usuarios nuevos** saltándose el scope `users.write`. (Bloque 1)
7. **Un usuario con cambio de contraseña obligatorio cuyo hotel se desactive queda bloqueado
   sin salida posible** — no puede ni cambiar su contraseña ni hacer nada. (Bloque 15)

## Nivel 2 — Dinero (integridad de facturación/cobros)

> **Estado 2026-10-07:** ✅ #8, #9, #10, #11, #12 y #13 corregidos con tests — ver la entrada
> "Auditoría, Nivel 2" en la sección 12 de `AGENTS.md`. El #13 resultó en 12 ViewSets
> (`PaymentRefundViewSet` también estaba afectado). ✅ #14 (promociones) implementado con las reglas
> acordadas — ver la decisión 5.27 de `AGENTS.md`.

Estos permiten que la plataforma cobre mal, no cobre, o pierda dinero sin que nadie se entere.

8. **Se puede cerrar cualquier estadía sin cobrar faltantes de inventario reales.** El
   check-out desde la tarjeta de habitación (el camino más usado en el día a día) no envía la
   revisión de inventario, y el backend trata esa ausencia como "sin diferencias" en vez de
   "falta revisar". Confirmado en ambos lados. **Es el hallazgo más grave de todo el
   backend.** (Bloque 6)
9. **Un reembolso aprobado nunca sale de caja.** Falta el botón/acción para pasarlo a
   "procesado"; queda atascado para siempre, rompiendo el cálculo de "cobrado neto". (Bloque 8)
10. **Dos condiciones de carrera reales con dinero**: se pueden generar dos facturas activas
    para la misma reserva, y dos pagos/reembolsos simultáneos pueden sobrepasar el saldo real
    (sin lock en las validaciones de monto). (Bloque 8)
11. **Se puede registrar un pago sobre una factura ya anulada.** (Bloque 8)
12. **Las notas de crédito no reducen el saldo pendiente de la factura/reserva** (puede seguir
    bloqueando el check-out) aunque sí afectan los reportes financieros — los números no
    cuadran entre pantallas. (Bloque 8, confirmado también en Bloque 9)
13. **Orden de mixins invertido rompe el borrado lógico en 11 ViewSets** (Service, Promotion,
    Package, PackageService, Charge, Invoice, InvoiceCharge, Payment, CreditNote, Expense,
    FinancialStatementSnapshot): un registro "eliminado" o inactivo sigue apareciendo y es
    editable vía API en todos ellos. Bug mecánico (reordenar dos clases base) pero de alto
    impacto porque toca justo los módulos de dinero y catálogo comercial. (hallazgo
    transversal, ver archivo dedicado)
14. **Las promociones no tienen ningún efecto real en la facturación** — se pueden crear,
    publicar y marcar "vigentes", pero nunca descuentan nada en una factura real. (Bloque 7)

## Nivel 3 — Bloqueos operativos (el producto no se puede usar bien)

> **Estado 2026-10-07:** ✅ los 9 ítems corregidos con tests — ver la entrada "Auditoría,
> Nivel 3" en la sección 12 de `AGENTS.md`. #21 (sin cron, al consultar) y #23 (tipo de cliente
> fijable a mano) según decisión del usuario.

Estos no son de seguridad ni de dinero directamente, pero impiden operar el día a día.

15. **Un hotel nuevo no puede terminar de configurarse.** El guard de Angular solo deja
    navegar a `/hotel-config` mientras falte algo, pero el backend exige habitaciones reales
    (creadas en `/habitaciones`) para completar el setup — y esa ruta está fuera de la
    whitelist del guard. Callejón sin salida desde la UI. (Bloque 2)
16. **Reducir habitaciones de un piso da 500 siempre.** (Bloque 2)
17. **"Marcar fuera de servicio" no valida reserva activa ni pide confirmación** — un clic en
    la habitación equivocada deja la reserva corriendo pero la habitación desaparece del
    tablero. (Bloque 4)
18. **Un `PATCH` directo a `Room.status` permite doble check-in sobre la misma habitación**
    (nada valida la transición de estado server-side). (Bloque 4)
19. **Suspender un hotel desde el panel SaaS lo hace desaparecer sin forma de reactivarlo desde
    la UI.** (Bloque 13)
20. **Dos botones de acción clave quedan inalcanzables en Inventario** ("nueva asignación" por
    habitación, "nuevo movimiento") — hoy no se pueden registrar transferencias, pérdidas ni
    ajustes manuales desde la UI dedicada. (Bloque 10)
21. **Los recordatorios de check-in/check-out próximo y el reporte diario nunca se ejecutan**
    — los comandos existen pero no están agendados en ningún cron/Procfile. (Bloque 12, mismo
    patrón que en Finanzas con `sync_operational_alerts`)
22. **El grupo "ROOM_TYPE" en Master Data crea datos fantasma** que un admin puede confundir
    con tipos de habitación reales, sin ningún efecto en el sistema real. (Bloque 3)
23. **El endpoint para forzar el tipo de cliente (VIP/Frecuente) no funciona**: el backend
    siempre lo recalcula automáticamente y pisa el valor que se intente forzar. (Bloque 5)

---

## Tanda 4 — "corregir ya" de cada bloque fuera del resumen

> **Estado 2026-10-08:** ✅ corregidos B1 #3-#6, B2 #5, B3 #3, B4 #3-#5, B6 #3-#5 (+#13), B7 #2,
> B9 #2, B12 #2-#4, B14 #3 y B16 #1-#2 — ver la entrada "Auditoría, tanda 4" en la sección 12 de
> `AGENTS.md`. Al probar B1 #3 apareció un bug nuevo: el borrado lógico con PK UUID no excluía nada
> en SQLite (corregido). Quedan los "corregir pronto" y "mejorable" de cada bloque.

## Funcionalidad nueva (una por una)

> **2026-10-10:** ✅ B4 #11-13: responsable, estados validados en el servidor y edición de
> limpieza y mantenimiento. ✅ B11 #6-7 y B9 #11: exportes completos en PDF y Excel. ✅ B3 #8:
> reordenar Master Data y nombres únicos por grupo. ✅ B12 #7: retención de notificaciones (90/180 días).
> **Con esto quedan atendidos todos los hallazgos de la auditoría.**

## Tanda 12 — cobertura de tests

> **Estado 2026-10-10:** ✅ B3 #5, B4 #14, B5 #8, B7 #8, B9 #13, B11 #11, B12 #12, B13 #11 y B15 #10
> (B2 #12, B6 #19 y B8 #13 ya estaban cubiertos). Ver la entrada "Auditoría, tanda 12" en la
> sección 12 de `AGENTS.md`. De la auditoría solo queda la funcionalidad nueva que requiere
> decisión de producto.

## Tanda 11 — limpieza de código muerto

> **Estado 2026-10-09:** ✅ B1 #12, B1 #14, B4 #17, B5 #6, B6 #12 (documentado; la tabla se
> conserva), B8 #10-12, B9 #7, B13 #8 y B15 #9. B12 #6 no aplica (el permiso sí se usa) y B10 #3
> queda documentado. Ver la entrada "Auditoría, tanda 11" en la sección 12 de `AGENTS.md`.

## Tanda 10 — modo oscuro

> **Estado 2026-10-09:** ✅ B3 #6, B8 #9 y B11 #10. Ver la entrada "Auditoría, tanda 10" en la
> sección 12 de `AGENTS.md`.

## Tanda 9 — errores operativos y de UX (parte de "mejorable sin bloquear")

> **Estado 2026-10-09:** ✅ B4 #8 (avisar sin bloquear, decidido), B4 #9, B4 #15, B6 #14, B6 #15 (ya
> estaba), B6 #17, B2 #11, B3 #7, B5 #7 y B9 #8. Ver la entrada "Auditoría, tanda 9" en la sección 12
> de `AGENTS.md`.

## Tanda 8 — privacidad y seguridad (parte de "mejorable sin bloquear")

> **Estado 2026-10-09:** ✅ B14 #4 (acompañantes enmascarados, decidido), B14 #5, B13 #9, B13 #10,
> B15 #7, B15 #8 y B1 #15. Ver la entrada "Auditoría, tanda 8" en la sección 12 de `AGENTS.md`.

## Tanda 7 — mejoras visibles (parte de "mejorable sin bloquear")

> **Estado 2026-10-09:** ✅ B6 #10 (no-show, decidido: abonos retenidos), B6 #11, B6 #13, B13 #5,
> B13 #6 y B10 #4. Ver la entrada "Auditoría, tanda 7" en la sección 12 de `AGENTS.md`. Sigue
> pendiente el resto de "mejorable sin bloquear" y la deuda técnica de cada bloque.

## Tanda 6 — pendientes que eran funcionalidad nueva

> **Estado 2026-10-09:** ✅ resueltos B6 #8 (editar huéspedes y abonos), B12 #8 (alertas en la
> campana), B12 #9 (enlaces al registro), B13 #3 (estructura en el wizard SaaS) y B14 #10
> (confirmación pública verificada), más B13 #7. Ver la entrada "Auditoría, tanda 6" en la
> sección 12 de `AGENTS.md`.

## Tanda 5 — "corregir pronto" de cada bloque

> **Estado 2026-10-09:** ✅ corregidos los "corregir pronto" de los bloques 1-15 salvo cinco que son
> funcionalidad nueva (B6 #8, B12 #8, B12 #9, B13 #3, B14 #10), documentados en la sección 13 de
> `AGENTS.md`. Ver la entrada "Auditoría, tanda 5" en la sección 12. Quedan los "mejorable sin
> bloquear".

## Resumen por bloque (para navegar al detalle)

| Bloque | Hallazgo más grave | Archivo |
|---|---|---|
| 1 — Accounts/RBAC | Reset de password con `base_url` sin validar (phishing) | `bloque-1-accounts-rbac.md` |
| 2 — Hotel Settings | Bloqueo circular de onboarding + fuga cross-tenant en restore | `bloque-2-hotel-settings.md` |
| 3 — Master Data | Grupo ROOM_TYPE fantasma confunde datos reales | `bloque-3-master-data.md` |
| 4 — Habitaciones | "Fuera de servicio" sin validar reserva activa; doble check-in | `bloque-4-habitaciones.md` |
| 5 — Clientes | `set-client-type` no funciona (código muerto) | `bloque-5-clientes.md` |
| 6 — Reservas | Check-out evade el cobro de faltantes de inventario | `bloque-6-reservas.md` |
| 7 — Catálogo comercial | Promociones sin efecto real en facturación | `bloque-7-catalogo-comercial.md` |
| 8 — Facturación y pagos | Reembolsos atascados + condiciones de carrera con dinero | `bloque-8-facturacion.md` |
| 9 — Finanzas | Orden de mixins rompe borrado lógico de Expense/Snapshot | `bloque-9-finanzas.md` |
| 10 — Inventario | Botones de acción inalcanzables en 2 de 3 pestañas | `bloque-10-inventario.md` |
| 11 — Reportes/Actividad | `/actividad` sin límite puede devolver todo el histórico | `bloque-11-reportes-actividad.md` |
| 12 — Notificaciones | Recordatorios programados nunca se ejecutan | `bloque-12-notificaciones.md` |
| 13 — SaaS | Suspender hotel lo hace desaparecer sin reactivación posible | `bloque-13-saas.md` |
| 14 — Público | Reserva pública puede sobrescribir perfil de cliente ajeno | `bloque-14-publico.md` |
| 15 — Transversales/auth | Esquema de API público sin login en producción | `bloque-15-endpoints-transversales.md` |
| 16 — Checklist predeploy | Script de predeploy apunta a un venv que no existe | `bloque-16-checklist-predeploy.md` |
| Transversal | Orden de mixins invertido en 11 ViewSets | `hallazgo-transversal-orden-mixins.md` |

---

## Recomendación de secuencia de corrección

1. **Nivel 1 completo** (7 ítems) — son los que más daño real pueden causar, y varios son
   fixes acotados (una validación, un orden de middleware, una config de librería).
2. **Nivel 2 completo** (7 ítems) — dinero. El #8 (check-out sin cobrar faltantes) es el más
   urgente de todos los 23 ítems de este documento por su frecuencia de uso diario.
3. **El fix transversal de mixins** (#13) de una sola vez para los 11 ViewSets — es mecánico y
   destraba varios hallazgos de los Bloques 7, 8 y 9 a la vez.
4. **Nivel 3** en el orden que prefieras — son bloqueos operativos reales pero no exponen datos
   ni dinero.
5. El resto de hallazgos de cada bloque (inconsistencias UX, mejoras, huecos de test) quedan
   documentados en cada archivo — no bloquean el despliegue pero conviene revisarlos con calma
   después.
