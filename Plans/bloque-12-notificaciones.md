# Bloque 12 — Notificaciones — Hallazgos de auditoría

Backend: 9/9 tests pasan. Multi-tenancy correcta (verificada con test explícito). El orden de
mixins de `NotificationViewSet` no aplica al bug transversal (filtra tenant manualmente, sin
usar `TenantScopeMixin`/`LogicalDeleteViewSetMixin`).

## Aclaración de arquitectura (no es un bug, pero evita confusión futura)

Hay **dos sistemas de "notificación" completamente independientes**, sin relación entre sí a
pesar del nombre compartido:
1. `apps.notifications.Notification` — alimenta la campana del header.
2. `accounts.NotificationReadState` — sistema genérico de "claves leídas" por string
   arbitrario, usado solo en el dashboard (banners/avisos descartables). No tiene relación con
   `Notification`. Vale la pena documentar o renombrar para que no se asuma una integración que
   no existe.

## Falta de funcionalidad — crítico

1. **Los comandos que generan recordatorios de check-in/check-out próximos y el reporte diario
   nunca se ejecutan en producción.** `notify_daily_reports`, `notify_upcoming_checkins`,
   `notify_upcoming_checkouts` no están referenciados en `railway.json`, Procfile, cron ni
   workflow (confirmado por grep en todo el repo) — mismo patrón ya visto con
   `sync_operational_alerts` en el Bloque 9. `services.py`/`signals.py` están completos y
   testeados, pero sin nadie que los dispare, estas notificaciones **nunca llegan a nadie**.
   **falta de funcionalidad crítica — funcionalidad "fantasma".**

## Bugs — prioridad alta

2. **Deep link roto para el destinatario principal de "Rol de usuario actualizado".** La
   notificación se envía al propio usuario afectado y a managers del hotel, pero su
   `action_url` apunta a `/roles`, ruta marcada `platformAdminOnly: true`. Un manager o usuario
   normal que haga clic termina bloqueado por el guard de permisos (403), en vez de llegar a
   algo útil.
3. **El badge de notificaciones no se actualiza en vivo.** Sin polling ni WebSocket; el
   contador solo se carga en `ngOnInit()` y queda congelado durante toda la navegación por la
   SPA, salvo que el usuario abra el dropdown o recargue la página. Grave para alertas
   críticas (mantenimiento urgente, habitación fuera de servicio) que deberían notarse de
   inmediato.
4. **Marcar como leída es optimista y silencia errores de red sin revertir el estado.**
   `markNotificationsAsRead()`/`openNotification()` actualizan la UI antes de confirmar la
   respuesta del backend; si el POST falla, la UI muestra "leída" pero el backend sigue en
   `is_read=False` — al recargar, la notificación "ya leída" reaparece como no leída, sin
   ningún mensaje de error que explique por qué.
5. **Dark mode roto en el dropdown de notificaciones.** El panel usa clases fijas
   (`bg-white`, `text-gray-800`, etc.) sin ninguna variante para modo oscuro — queda blanco e
   ilegible cuando se activa el modo oscuro desde el propio menú del header.

## Falta de funcionalidad

6. **El permiso `notifications.write` es código muerto**: el ViewSet solo tiene
   `List`/`Retrieve`, sin `Create`/`Update`/`Destroy`. No hay forma de enviar un aviso manual
   de plataforma a todos los hoteles salvo entrando directo al Django admin.
7. **Sin purga ni retención.** Los comandos (si algún día se agendan) crean una fila por
   usuario por día indefinidamente; sin `DestroyModelMixin` ni comando de limpieza, la tabla
   `notification` crece sin límite.
8. **Las alertas operativas de Finanzas (`OperationalAlert`) y de Inventario
   (`InventoryRestockAlert`) no llegan a la campana.** Ningún signal las conecta con
   `Notification`. El stock bajo sí genera una notificación, pero por una vía paralela e
   independiente de `InventoryRestockAlert` — dos sistemas de "stock bajo" que pueden divergir
   en umbrales y estado.
9. **Todos los `action_url` apuntan a listados genéricos, nunca al registro concreto.** Clic
   en "Pago registrado para factura FAC-123" lleva a la lista completa de pagos, no a esa
   factura — el usuario debe buscar manualmente en cada caso.
10. **"Ver registro completo" navega a Auditoría, no a un historial de notificaciones.** No
    existe ninguna página dedicada a ver todas las notificaciones — el dropdown solo muestra
    las primeras 20, y el enlace de "ver más" lleva a una feature distinta (trazabilidad de
    acciones del sistema).

## Inconsistencias

11. **La validación de tenant de `Notification.clean()` no se llama automáticamente** (Django
    no invoca `full_clean()` en `save()`). `create_notification()` sí valida manualmente antes
    de crear, pero cualquier código futuro que use `Notification.objects.create()` directo se
    saltaría la validación sin error — hoy no hay fuga porque todo pasa por `services.py`, pero
    es frágil.

## Huecos de cobertura

12. Sin tests para `mark_all_as_read`, `scope=hotel` (vista de managers),
    `notify_user_role_updated`, cancelación de reserva, check-in/check-out próximo, reporte
    diario (lógica de deduplicación `_already_notified_today`), ni los 3 management commands —
    justo las funciones más complejas y las que más fácil se rompen en un refactor.

## Verificado SIN problema

- Multi-tenancy correcta, con test explícito de 404 cross-hotel.
- `Notification` tiene FK `user` obligatoria (no M2M) — cada destinatario tiene su propia fila,
  sin riesgo de notificación compartida "atascada".
- No aplica el bug transversal de orden de mixins.

---

## Priorización sugerida

**Corregir ya:** 1 (agendar los comandos), 2 (deep link roto), 3, 4.
**Corregir pronto:** 5, 8, 9.
**Deuda técnica, no bloquea:** 6, 7, 10, 11, 12.
