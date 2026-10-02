# Plan de auditoría módulo por módulo — Wayra

Objetivo: revisar cada módulo funcional de la plataforma para detectar inconsistencias,
errores, bugs y acciones faltantes (botones/endpoints), corregirlos, y dejar una versión
lista para desplegar. Este archivo vive fuera de git (`Plans/` está en `.gitignore`); los
hallazgos y fixes reales se registran en `AGENTS.md` como exige `CLAUDE.md`.

---

## Metodología por módulo

Para cada módulo se repite el mismo checklist en 4 capas:

1. **Backend (API)**
   - ¿El ViewSet sigue el patrón estándar (`LogicalDeleteViewSetMixin`, `TenantScopeMixin`,
     `HasResourcePermission`, `required_scopes` explícitos)?
   - ¿Existen todas las acciones esperadas para el dominio (crear, editar, eliminar/soft-delete,
     listar con filtros, detalle, acciones de negocio específicas — ej. `confirm`, `check-in`)?
   - ¿Las validaciones de serializer cubren los casos de negocio (unicidad, fechas, estados
     permitidos, `validate_same_tenant` en FKs)?
   - ¿El scoping multi-tenant es correcto (no hay fuga de datos entre hoteles)?
   - ¿Hay tests que cubran las rutas felices y de error? ¿Pasan?

2. **Frontend (UI)**
   - ¿Cada acción que el backend permite tiene un botón/control visible y accesible en la UI?
   - ¿Hay botones que no hacen nada o apuntan a endpoints que ya no existen (botones muertos)?
   - ¿Los estados de carga, vacío y error están manejados (no pantallas en blanco, no errores
     silenciosos)?
   - ¿Los permisos RBAC ocultan/deshabilitan correctamente lo que el usuario no puede hacer?
   - ¿Modo oscuro, responsive (móvil/tablet) y accesibilidad básica (foco, contraste) están bien?

3. **Consistencia cruzada backend↔frontend**
   - ¿Todo lo que el backend expone se usa desde algún lugar de la UI?
   - ¿Los mensajes de error del backend llegan legibles al usuario?
   - ¿Los datos mostrados coinciden con lo que el backend realmente calcula (ver antecedentes de
     bugs de este tipo en la bitácora, ej. gráficos de reportes, consolidado diario)?

4. **Registro**
   - Hallazgos y fixes de cada módulo se documentan en `AGENTS.md` sección 12, formato de
     sección 11. Si algo toca una decisión de arquitectura (sección 5), se actualiza esa sección
     también y se consulta antes con el usuario.

Cada módulo termina con una lista corta de hallazgos clasificados: **bug** (rompe algo),
**falta funcionalidad** (acción esperada sin botón/endpoint), **inconsistencia** (datos o
comportamiento contradictorio), **mejora** (no bloqueante). Solo bug y falta funcionalidad
bloquean el despliegue por defecto.

---

## Orden de auditoría

El orden va de lo más transversal (si falla, afecta a todo lo demás) a lo más periférico.

### Bloque 1 — Fundamentos transversales
1. **Accounts / RBAC** — `User`, `Role`, `Resource`, `UserRole`, `RoleResource`; vistas
   `/usuarios`, `/roles`, `/recursos`, `/mi-perfil`. Incluye login, cambio de contraseña
   obligatorio, recuperación de contraseña, menú lateral dinámico.
2. **Hotel Settings** — `/hotel-config`: pisos, políticas de reserva, colores de marca, setup
   inicial y su bloqueo cuando la configuración está incompleta (deuda técnica conocida: puntos
   10-13 de la sección 13).

### Bloque 2 — Catálogo base
3. **Master Data** — `/master-data` (ojo con la duplicación conocida de `RoomType` vs.
   `apps.rooms.RoomType`, deuda técnica punto 2).
4. **Habitaciones** — `/habitaciones` (tipos, tarifas, amenidades, habitaciones como una sola
   vista con modales), `/saas-amenidades`, `/tareas-limpieza`, `/ordenes-mantenimiento`.

### Bloque 3 — Clientes y reservas
5. **Clientes** — `/clientes`.
6. **Reservas** — `/reservas`: ciclo completo (crear, confirmar, check-in, check-out, huéspedes,
   depósitos, verificación de inventario al check-out). Antecedente de bug grave aquí (500 en
   confirmar/check-in/check-out por `FOR UPDATE` sobre outer join nullable en Postgres).

### Bloque 4 — Catálogo comercial
7. **Servicios, paquetes y promociones** — `/catalogo-servicios`, `/catalogo-paquetes`,
   `/promociones`.

### Bloque 5 — Dinero
8. **Facturación y pagos** — `/facturas`, `/pagos`, `/reembolsos` (cargos, facturas, pagos,
   reembolsos, notas crédito — ciclo de cobro completo).
9. **Finanzas** — `/egresos`, `/control-financiero`, `/consolidado-ingresos`. Antecedente de
   bugs de datos aquí (gráficos que no reflejaban la realidad, consolidado diario corrido un
   día).

### Bloque 6 — Inventario y operación
10. **Inventario** — `/items`, `/inventario-habitaciones`, `/movimientos-inventario`.
11. **Reportes y actividad** — `/reportes`, `/actividad` (agrega datos de otras apps; sin
    modelos propios, alto riesgo de mostrar cifras que no corresponden a lo real).
12. **Notificaciones** — campana del header, tareas programadas.

### Bloque 7 — Plataforma SaaS (vista plataforma, no de hotel)
13. **SaaS: panel, hoteles, solicitudes de demo** — `/saas-panel`, `/saas-hoteles`,
    `/saas-solicitudes-demo`. Incluye activar/desactivar hotel y su efecto en cascada sobre los
    usuarios de ese hotel.

### Bloque 8 — Público (sin sesión)
14. **Landing, hoteles aliados, flujo de reserva pública, check-in online público** — alto
    volumen de historial de fixes de UX/responsive en la bitácora; validar que lo ya corregido
    sigue corregido (regresiones) y que el flujo completo (buscar → tarifa → datos →
    confirmación) funciona de punta a punta.

### Bloque 9 — Cierre
15. **Endpoints transversales** — `/health/`, `/api/schema/`, `/api/docs/`, `/admin/`, flujo de
    auth (csrf, login, logout, me, password).
16. **Checklist predeploy completo** — correr `scripts/predeploy-check.ps1`, revisar que CI
    (`.github/workflows/ci.yml`) pase limpio, y repasar el checklist manual de la sección 9 de
    `AGENTS.md`.

---

## Cómo se ejecuta cada sesión de auditoría

- Se trabaja **un módulo (o bloque pequeño) a la vez**, nunca varios en paralelo, para no mezclar
  hallazgos ni fixes.
- Antes de tocar código de un módulo: releer en `AGENTS.md` las entradas de la sección 12 que lo
  mencionen (para no "corregir" algo que ya es una decisión deliberada) y la sección 13 por si
  ese módulo tiene deuda técnica conocida.
- Al terminar un módulo: hallazgos + fixes aplicados (los que el usuario apruebe) + entrada nueva
  en la bitácora + este archivo actualizado marcando el módulo como ✅ revisado.
- Los hallazgos que impliquen cambiar una decisión de arquitectura se consultan con el usuario
  antes de aplicarse (regla no negociable #3 de `CLAUDE.md`).

## Hallazgos transversales (cruzan varios bloques)

- **Orden de mixins invertido rompe el borrado lógico en 11 ViewSets** (Service, Promotion,
  Package, PackageService, Charge, Invoice, InvoiceCharge, Payment, CreditNote, Expense,
  FinancialStatementSnapshot) — ver `hallazgo-transversal-orden-mixins.md`. Detectado al
  generalizar un hallazgo puntual del Bloque 9; amplía y agrava hallazgos ya documentados en
  los Bloques 7, 8 y 9.

## Estado

| # | Módulo | Estado |
|---|---|---|
| 1 | Accounts / RBAC | 🔶 auditado, fixes pendientes (ver `bloque-1-accounts-rbac.md`) |
| 2 | Hotel Settings | 🔶 auditado, fixes pendientes (ver `bloque-2-hotel-settings.md`) |
| 3 | Master Data | 🔶 auditado, fixes pendientes (ver `bloque-3-master-data.md`) |
| 4 | Habitaciones (tipos, tarifas, amenidades, mantenimiento, limpieza) | 🔶 auditado, fixes pendientes (ver `bloque-4-habitaciones.md`) |
| 5 | Clientes | 🔶 auditado, fixes pendientes (ver `bloque-5-clientes.md`) |
| 6 | Reservas | 🔶 auditado, fixes pendientes (ver `bloque-6-reservas.md`) |
| 7 | Servicios / Paquetes / Promociones | 🔶 auditado, fixes pendientes (ver `bloque-7-catalogo-comercial.md`) |
| 8 | Facturación y pagos | 🔶 auditado, fixes pendientes (ver `bloque-8-facturacion.md`) |
| 9 | Finanzas | 🔶 auditado, fixes pendientes (ver `bloque-9-finanzas.md`) |
| 10 | Inventario | 🔶 auditado, fixes pendientes (ver `bloque-10-inventario.md`) |
| 11 | Reportes y actividad | 🔶 auditado, fixes pendientes (ver `bloque-11-reportes-actividad.md`) |
| 12 | Notificaciones | 🔶 auditado, fixes pendientes (ver `bloque-12-notificaciones.md`) |
| 13 | SaaS (plataforma) | 🔶 auditado, fixes pendientes (ver `bloque-13-saas.md`) |
| 14 | Público (landing, reservas, check-in online) | 🔶 auditado, fixes pendientes (ver `bloque-14-publico.md`) |
| 15 | Endpoints transversales / auth | 🔶 auditado, fixes pendientes (ver `bloque-15-endpoints-transversales.md`) |
| 16 | Checklist predeploy | ✅ ejecutado (ver `bloque-16-checklist-predeploy.md`) |
