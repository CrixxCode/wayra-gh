# Bloque 15 — Endpoints transversales / auth — Hallazgos de auditoría

## Bug de seguridad — crítico

1. **El esquema OpenAPI completo (`/api/schema/`, `/api/docs/`) queda público sin login,
   también en producción.** `SPECTACULAR_SETTINGS` no sobreescribe `SERVE_PERMISSIONS`, y el
   default de la librería `drf_spectacular` es `AllowAny` — **no hereda**
   `DEFAULT_PERMISSION_CLASSES` de DRF como cabría esperar. Cualquiera puede descargar el
   JSON/YAML completo de la API (todos los endpoints internos de finance, billing, reports,
   inventory, nombres de campos y parámetros) sin cuenta — mapea toda la superficie de ataque
   para un atacante antes de intentar nada más. **bug de configuración, severidad alta.**

## Bug — bloqueo real de usuarios

2. **Un usuario con cambio de contraseña obligatorio (`must_change_password=True`) cuyo hotel
   se desactive queda completamente bloqueado sin salida.** Las listas de rutas exentas de
   `ForcePasswordChangeMiddleware` y `HotelActiveMiddleware` son inconsistentes:
   `ForcePasswordChangeMiddleware` sí exime `password/change/`, `me/update/`, `hotel-setup/`,
   pero `HotelActiveMiddleware` (que corre después) **no exime ninguna de esas rutas** — solo
   `csrf/, login/, logout/, me/, schema/, docs/`. Escenario real: se crea un usuario con
   password temporal, y antes de su primer login la plataforma desactiva el hotel (ej. por
   falta de pago) — ese usuario nunca podrá completar el cambio de contraseña obligatorio ni
   llegar a ningún lado; solo recibe `403 hotel_inactive`. Sin test que combine ambos
   escenarios. **bug alto.**

## Bugs / inconsistencias de seguridad — menores pero reales

3. **Oráculo de enumeración en login vía el código `hotel_inactive`.** La rama "Usuario
   inactivo" en `SessionLoginView` es código muerto (Django ya rechaza esos usuarios dentro de
   `authenticate()`, nunca llega ahí). Pero el chequeo de `hotel_inactive` sí se ejecuta: si las
   credenciales son correctas pero el hotel está desactivado, la respuesta cambia de 401
   genérico a 403 `hotel_inactive` — permitiendo a un atacante confirmar que una contraseña es
   correcta sin poder usarla, solo observando el código de respuesta.
4. **Sin `AUTH_PASSWORD_VALIDATORS` configurados → la validación de fortaleza es un no-op.**
   Tanto el cambio de password como el reset confirm llaman a `validate_password()`, pero sin
   validadores configurados esa llamada no hace nada real — el único control es `min_length=8`.
   Una contraseña como `"12345678"` es aceptada en ambos flujos pese a aparentar validación
   robusta.
5. **`PasswordResetConfirmView` no tiene `throttle_scope="password_reset"`** (a diferencia de
   `PasswordResetRequestView`, que sí lo tiene en 5/min) — queda con el límite más laxo del
   `AnonRateThrottle` global (30/min). El paso crítico de la recuperación (recibir
   `uid+token+new_password`) tiene menos protección contra fuerza bruta que el paso de
   solicitarla, inconsistente con la decisión 5.11 de throttling diferenciado.
6. **`/admin/` de Django sin rate limiting ni lockout.** Usa su propia vista de login clásica,
   fuera de los throttles de DRF — sin `django-axes` ni middleware equivalente, queda expuesto
   a fuerza bruta sin límite de intentos a nivel de aplicación.

## Mejoras

7. Login throttle solo por IP (`ScopedRateThrottle`, 10/min) — protege contra fuerza bruta
   concentrada, pero no contra credential stuffing distribuido (muchas IPs, mismo usuario) ni
   contra un NAT/proxy corporativo compartiendo cuota; sin lockout por cuenta.
8. `/health/` no valida conectividad a DB — Railway podría considerar "sano" un proceso con la
   base de datos caída.
9. `PASSWORD_RESET_COOKIE_MAX_AGE` está definido en settings pero no se usa en ningún archivo
   del proyecto — configuración muerta.

## Huecos de cobertura

10. Sin test que combine `must_change_password=True` + hotel inactivo (habría detectado el
    bug #2); sin test que verifique acceso anónimo a `/api/schema/`/`/api/docs/` (habría
    detectado el bug #1).

## Verificado SIN problema

- Logout invalida la sesión server-side correctamente (no solo borra cookie en cliente).
- `/api/auth/me/` y `me/update/` no permiten escalar rol, hotel ni `is_superuser` — campos
  sensibles correctamente `read_only`.
- Expiración del token de reset de contraseña funciona correctamente (~3 días, vía
  `PasswordResetTokenGenerator` por defecto).
- `/health/` no expone información sensible (sin stack traces, versión ni config).

---

## Priorización sugerida

**Bloquean despliegue / corregir ya:** 1, 2.
**Corregir pronto:** 3, 4, 5, 6.
**Mejorable sin bloquear:** 7, 8, 9, 10.
