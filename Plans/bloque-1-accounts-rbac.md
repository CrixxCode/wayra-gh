# Bloque 1 — Accounts / RBAC — Hallazgos de auditoría

Backend: suite completa ejecutada (`python manage.py test accounts` → 62 tests OK, 1 skipped).
Buena cobertura existente de tenancy, scopes, borrado lógico y menú — los huecos están en
flujos sensibles sin test (reset de password, registro) y en algunos endpoints que no siguen
el patrón estándar al 100%.

## Seguridad — prioridad alta

1. **Reset de contraseña con `base_url` no validado (phishing / posible fuga de token).**
   `accounts/views.py:237-241` → `serializers.py:676-690` → `email_utils.py:161-173`. El
   endpoint `POST /api/auth/password/reset/` es `AllowAny` y acepta `base_url` del body sin
   whitelist; el correo real (enviado desde el dominio de Wayra) termina apuntando a cualquier
   dominio que el atacante indique, con `uid`+`token` válidos. **bug de seguridad.**
2. **`UserViewSet.register` bypassa `HasResourcePermission` para usuarios ya autenticados.**
   `accounts/views.py:320-325, 347-359`. Con `ALLOW_PUBLIC_USER_REGISTRATION=True` (opt-in,
   default `False`), un usuario autenticado sin el scope `users.write` puede crear usuarios
   nuevos en su hotel porque `register` solo exige el token público si `not
   request.user.is_authenticated`. **bug de seguridad.**

## Bugs funcionales — prioridad alta/media

3. **Botón "Eliminar" de usuario no hace soft-delete real (frontend).** Llama a `PATCH
   is_active:false` en vez de `DELETE`. "Restaurar" queda muerto en la práctica. **bug.**
4. **Editar usuario borra silenciosamente roles adicionales (frontend + backend).** El PATCH de
   "Editar" siempre manda `role` único; `UserUpdateSerializer.update()`
   (`serializers.py:629-639`) desactiva todos los `UserRole` que no coincidan con ese rol.
   **bug.**
5. **`ResourceSerializer` no valida ciclos en `parent` → recursión infinita.**
   `serializers.py:39-53` + `get_menu().node()`. Un `parent` cíclico (vía `PATCH
   /api/resources/<id>/`) rompe `/api/auth/me/` para cualquier usuario con ese recurso —
   endpoint que usan todos los middlewares de frontend. **bug.**

## Falta de funcionalidad

6. **No hay CRUD de `JobTitle` (ni backend ni frontend).** Solo lectura (`job_titles`,
   `public_job_titles`). Como `job_title_option` es obligatorio al crear/editar usuario, un rol
   nuevo sin cargos previos **bloquea el alta de usuarios** sin acceso a Django admin.
   Confirmado en ambos lados (backend: sin endpoint de escritura; frontend: sin pantalla).
   **falta-funcionalidad — bloqueante para operar.**
7. **Roles y Recursos sin UI de "ver eliminados"/restaurar** (sí existe en Usuarios, pero ni
   siquiera funciona bien ahí — ver #3). Los métodos de servicio `restoreRole`/
   `restoreResource` existen pero no se llaman desde ningún componente.
8. **Sin tests para los dos flujos más sensibles**: reset de contraseña y registro. Los
   hallazgos #1 y #2 se habrían detectado con un test de abuso básico.

## Inconsistencias — prioridad baja

9. `UserViewSet` no hereda `TenantScopeMixin` (reimplementa el filtrado a mano) —
   diverge del patrón documentado sin romper nada hoy.
10. `send_email` exige `is_effective_global_admin` a mano en vez de un scope RBAC dedicado.
11. `assign_resources`/`remove_resources` descartan ids inválidos en silencio (sin
    `rejected_ids` como sí hace `assign_users`/`remove_users`).
12. `RolesService` y `ResourcesService` (frontend) duplican métodos casi idénticos.
13. Menú: "Usuarios del hotel" no se agrupa bajo "Seguridad" como sí pasa con los ítems
    análogos de plataforma.
14. `RoleViewSet.get_required_scopes` tiene una rama de código muerto que además olvida
    `"remove_resources"` en su lista — frágil si cambia el método HTTP de esas acciones.

## Mejoras (no bloqueantes)

15. Sin manejo genérico de sesión expirada (401) fuera de la navegación entre rutas.
16. Botones de icono sin `aria-label` en `user-list.html`/`roles.html`.

---

## Priorización sugerida para corregir

**Bloquean despliegue / corregir ya:** 1, 2, 3, 4, 5, 6.
**Corregir en este bloque si hay tiempo:** 7, 8.
**Quedan en deuda técnica documentada (no bloquean):** 9, 10, 11, 12, 13, 14, 15, 16.
