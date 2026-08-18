# Bitácora del Proyecto — Wayra (Sistema de Gestión Hotelera)

> **Documento obligatorio de lectura previa.**
> Cualquier agente de IA (Claude Code, Codex, Copilot, etc.) o desarrollador humano **debe leer este
> archivo completo antes de tocar una sola línea de código**. Aquí está qué hace el sistema, cómo
> está construido, **por qué** se tomó cada decisión, y el registro histórico de todos los cambios.
>
> **Regla de oro:** todo cambio que se haga en el repositorio **debe quedar registrado** en la
> sección [12. Registro de cambios](#12-registro-de-cambios), siguiendo el formato indicado en
> [11. Cómo registrar un cambio](#11-cómo-registrar-un-cambio).

**Última actualización:** 2026-08-17
**Rama principal:** `main`
**Repositorio:** https://github.com/CrixxCode/gestion_hotelera

---

## Índice

1. [Reglas para agentes de IA](#1-reglas-para-agentes-de-ia)
2. [Qué es Wayra](#2-qué-es-wayra)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Estructura del repositorio](#4-estructura-del-repositorio)
5. [Arquitectura y decisiones clave (el "por qué")](#5-arquitectura-y-decisiones-clave-el-por-qué)
6. [Módulos funcionales](#6-módulos-funcionales)
7. [Convenciones de código](#7-convenciones-de-código)
8. [Entorno de desarrollo](#8-entorno-de-desarrollo)
9. [Pruebas y checklist predeploy](#9-pruebas-y-checklist-predeploy)
10. [Despliegue](#10-despliegue)
11. [Cómo registrar un cambio](#11-cómo-registrar-un-cambio)
12. [Registro de cambios](#12-registro-de-cambios)
13. [Deuda técnica y pendientes conocidos](#13-deuda-técnica-y-pendientes-conocidos)

---

## 1. Reglas para agentes de IA

Antes de proponer o ejecutar cualquier cambio:

1. **Leer esta bitácora completa.** Especialmente la sección 5 (decisiones y su justificación) y la
   sección 7 (convenciones). Muchas cosas que parecen "mal hechas" son decisiones deliberadas
   documentadas aquí.
2. **No romper los patrones establecidos.** Si un módulo nuevo se parece a uno existente, se
   implementa igual que el existente (mismo mixin de tenancy, mismo mixin de borrado lógico, misma
   forma de declarar `required_scopes`). La consistencia vale más que la elegancia puntual.
3. **Si una decisión de la sección 5 estorba,** no se cambia en silencio: se propone al usuario,
   se explica el impacto, y si se aprueba **se actualiza la sección 5 junto con el código**.
4. **Todo cambio se registra** en la sección 12 (formato en la sección 11). Un cambio de código sin
   entrada en la bitácora se considera incompleto.
5. **No commitear secretos ni artefactos locales.** `backend/.env`, `db.sqlite3`, `media/`,
   `staticfiles/`, `node_modules/` están en `.gitignore` y deben seguir así.
6. **No inventar endpoints ni permisos.** Cada endpoint nuevo necesita su `Resource` RBAC
   correspondiente (ver 5.3) y su registro en `RBAC_RESOURCES_LIST.md`.
7. **Idioma:** el dominio, los comentarios y la UI están en español; el código (nombres de
   variables, clases, funciones) está en inglés. Mantener esa mezcla tal como está.
8. **Antes de dar por terminado un cambio:** correr las pruebas relevantes (sección 9) y reportar
   el resultado real, incluso si falla.

---

## 2. Qué es Wayra

**Wayra** es una plataforma web de **gestión hotelera multi-hotel (SaaS)**. Cubre la operación
completa de un hotel pequeño/mediano: desde la captación del cliente hasta el cierre financiero.

### Alcance funcional

| Área | Qué resuelve |
|---|---|
| **Landing pública + solicitudes de demo** | Página comercial pública y formulario de solicitud de demo que alimenta el panel SaaS. |
| **Autenticación y RBAC** | Login por sesión, recuperación de contraseña por correo, cambio obligatorio de contraseña en el primer ingreso, roles y permisos granulares por recurso. |
| **Multi-tenant (multi-hotel)** | Cada usuario y cada registro pertenece a un hotel (`HotelSettings`). Un administrador de plataforma ve y administra todos los hoteles. |
| **Clientes y huéspedes** | CRUD de clientes, con borrado lógico y restauración. |
| **Habitaciones** | Habitaciones, tipos de habitación, tarifas, amenidades, pisos. |
| **Reservas** | Reservas con habitaciones, huéspedes, abonos/depósitos, check-in / check-out y chequeos de inventario por reserva. |
| **Servicios, paquetes y promociones** | Catálogo de servicios, armado de paquetes y promociones aplicables. |
| **Facturación y pagos** | Cargos, facturas, pagos, reembolsos y notas crédito. |
| **Finanzas** | Egresos, control financiero, consolidado de ingresos, alertas operativas y snapshots de estados financieros. |
| **Inventario** | Ítems, inventario por habitación, movimientos de inventario y alertas de reposición. |
| **Limpieza y mantenimiento** | Tareas de limpieza y órdenes de mantenimiento asociadas a habitaciones. |
| **Reportes** | Reportes operativos y financieros + bitácora de actividad. |
| **Notificaciones** | Notificaciones internas generadas por eventos del sistema y por tareas programadas. |
| **Panel SaaS** | Dashboard global de la plataforma, listado de hoteles y gestión de solicitudes de demo (solo administrador de plataforma). |

La documentación funcional de cara al usuario final está en
[docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md).

---

## 3. Stack tecnológico

### Backend

- **Python 3.12 / 3.13** — CI usa 3.12, la imagen Docker usa `python:3.13-slim`.
- **Django ≥ 5.0** + **Django REST Framework ≥ 3.15**
- **drf-spectacular** — esquema OpenAPI y Swagger UI en `/api/docs/`
- **django-filter**, **django-cors-headers**, **whitenoise**
- **djangorestframework-simplejwt** — instalado, pero **no** es el método de autenticación por
  defecto (ver 5.1 y 13).
- **django-anymail** (backend Resend) — correo por API HTTPS
- **reportlab** — generación de PDFs
- **psycopg2-binary** — PostgreSQL en producción; SQLite en desarrollo
- **gunicorn** — servidor WSGI en producción

### Frontend

- **Angular 20** (standalone components, lazy loading por ruta)
- **TypeScript 5.9**, **RxJS 7.8**
- **PrimeNG 20** + **@primeuix/themes** — componentes de UI
- **TailwindCSS 4** + **Flowbite** — estilos
- **FontAwesome 7** + **PrimeIcons** — iconografía (los iconos del menú se guardan en base de datos)
- **Chart.js 4** — gráficas del dashboard
- **Swiper 12** — carruseles de la landing
- **Karma + Jasmine** — pruebas unitarias

### Infraestructura

- **Docker** (multi-stage: build de Angular → imagen Python)
- **Railway** — plataforma de despliegue (`railway.json`)
- **GitHub Actions** — CI (`.github/workflows/ci.yml`)

---

## 4. Estructura del repositorio

```
gestion_hotelera/
├── AGENTS.md                    # ESTA BITÁCORA — lectura obligatoria
├── CLAUDE.md                    # Puntero a AGENTS.md para Claude Code
├── Dockerfile                   # Build multi-stage (frontend + backend en una imagen)
├── railway.json                 # Configuración de despliegue en Railway
├── RBAC_RESOURCES_LIST.md       # Lista de recursos RBAC
├── RBAC_RESOURCES_SCAN.md/.json # Escaneo automático de recursos por ViewSet
├── RBAC_SUMMARY.md              # Resumen ejecutivo del escaneo RBAC
├── docs/
│   ├── MANUAL_USUARIO.md        # Manual funcional del usuario final
│   ├── RAILWAY_DEPLOYMENT.md    # Guía de despliegue en Railway
│   └── production-runbook.md    # Runbook: variables, backups, rollback, secretos
├── scripts/
│   ├── predeploy-check.ps1      # Checklist automatizado previo a desplegar
│   └── security/                # Utilidades de seguridad
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── entrypoint.sh            # migrate + collectstatic + gunicorn
│   ├── backend/                 # Proyecto Django (settings, urls, wsgi, asgi)
│   ├── accounts/                # Usuarios, roles, recursos, RBAC, tenancy, soft delete
│   │   ├── models.py            # User, Role, JobTitle, Resource, UserRole, RoleResource…
│   │   ├── permissions.py       # HasResourcePermission (motor de RBAC)
│   │   ├── tenancy.py           # TenantScopeMixin, TenantSerializerMixin
│   │   ├── soft_delete.py       # LogicalDeleteViewSetMixin
│   │   ├── middleware.py        # ForcePasswordChangeMiddleware
│   │   ├── email_utils.py       # Envío de correos (reset de contraseña)
│   │   └── management/commands/seed_rbac.py
│   ├── apps/                    # Módulos de dominio (ver sección 6)
│   ├── templates/               # Plantillas de correo y de reset de contraseña
│   └── media/                   # Archivos subidos (no versionado)
└── frontend/
    ├── angular.json, tailwind.config.js, proxy.conf.json
    ├── public/                  # Assets estáticos servidos en la raíz
    └── src/app/
        ├── app.routes.ts        # Definición de todas las rutas
        ├── components/
        │   ├── auth/            # login, forgot-password, reset-password
        │   ├── layout/          # aside, header, footer, content, layout-main
        │   ├── pages/           # landing, dashboard, roles, recursos, hotel-settings…
        │   └── tutorial/        # Ayuda contextual / onboarding
        ├── modules/             # Un directorio por módulo funcional (ver sección 6)
        ├── services/            # Un servicio HTTP por dominio
        ├── guards/              # auth.guard.ts, permission.guard.ts
        └── interceptors/        # hotel-context.interceptor.ts
```

---

## 5. Arquitectura y decisiones clave (el "por qué")

Esta es la sección más importante del documento. **No cambiar nada de aquí sin consultar.**

### 5.1 Autenticación por sesión con cookies, no por JWT

**Decisión:** `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES` usa únicamente
`SessionAuthentication`. Los endpoints de auth son `/api/auth/csrf/`, `/api/auth/login/`,
`/api/auth/logout/`, `/api/auth/me/`.

**Por qué:**
- El frontend y el backend se sirven **desde el mismo origen** en producción (ver 5.7), por lo que
  la cookie de sesión funciona sin fricción de CORS.
- La cookie de sesión es `HttpOnly`, lo que la hace inmune a robo por XSS — a diferencia de un JWT
  guardado en `localStorage`.
- CSRF se maneja con el token de Django (`csrftoken`, cookie **no** `HttpOnly` para que Angular la
  pueda leer y reenviar).

**Implicaciones al programar:** toda petición mutante desde el frontend debe llevar el header
`X-CSRFToken`. Antes del login hay que llamar a `/api/auth/csrf/` para inicializar la cookie.

**Nota:** `djangorestframework-simplejwt` está en `INSTALLED_APPS` pero no se usa como autenticación
por defecto (ver [deuda técnica](#13-deuda-técnica-y-pendientes-conocidos)).

### 5.2 Cambio obligatorio de contraseña en el primer ingreso

**Decisión:** el modelo `User` tiene `must_change_password` y `password_changed_at`. El middleware
`accounts.middleware.ForcePasswordChangeMiddleware` bloquea la navegación hasta que se cambie.

**Por qué:** los usuarios son creados por un administrador con una contraseña temporal; no hay
autoregistro en producción (ver 5.9). Forzar el cambio evita que queden credenciales conocidas por
el administrador.

**Introducido en:** commit `f7f4f371` (2026-05-03).

### 5.3 RBAC por `Resource.key`, no por permisos nativos de Django

**Decisión:** el control de acceso se basa en un modelo propio:

```
User ──< UserRole >── Role ──< RoleResource >── Resource
```

- `Resource.key` sigue el patrón `<dominio>.<acción>`: `reservations.read`, `invoices.write`,
  `items.read_deleted`.
- Cada ViewSet declara `required_scopes` (estático) y/o `get_required_scopes()` (dinámico según el
  método HTTP: `GET` → `.read`, `POST/PUT/PATCH/DELETE` → `.write`).
- El motor es `accounts.permissions.HasResourcePermission`.

**Por qué no usar el sistema de permisos de Django:** los permisos nativos están atados a modelos y
a operaciones CRUD de base de datos. Aquí se necesitaba (a) permisos por **endpoint/vista**, no por
modelo; (b) que el **menú lateral se construya dinámicamente** desde los mismos recursos que
controlan el acceso — un solo registro `Resource` define a la vez el permiso, la ruta del frontend,
la ruta del backend, el ícono y el orden en el menú.

**Detalles del motor que hay que respetar:**
- **Normalización de separadores:** el motor intercambia **guion y guion bajo**, pero **no el
  punto**. `invoicesandpayment.read_deleted` ≡ `invoicesandpayment.read-deleted`, y
  `users_read` ≡ `users-read`; pero `users_read` **no** equivale a `users.read`. La clave siempre se
  escribe `<dominio>.<accion>` con punto — verificado contra
  `HasResourcePermission._scope_variants` el 2026-08-10.
- **Comodines:** la clave `*` da acceso total; `dominio.*` da acceso a todas las acciones de ese
  dominio.
- **Admin global:** `is_effective_global_admin(user)` (superusuario **sin** `hotel_settings`)
  siempre pasa. Ver 5.4.
- **Fallback por `link_backend`:** si una vista no declara scopes, se compara el path de la petición
  contra `Resource.link_backend`. Existe por retrocompatibilidad con vistas antiguas — **no usarlo
  en código nuevo**, siempre declarar `required_scopes`.
- **`*.read_deleted`:** si la vista expone registros borrados lógicamente (`?include_deleted=true`),
  el motor exige adicionalmente el scope `<dominio>.read_deleted`.

**`seed_rbac` es la fuente única de los recursos y del menú.** El comando
`backend/accounts/management/commands/seed_rbac.py` declara, en un solo archivo:

- `DOMAINS` — un dominio por ViewSet; de cada uno derivan `<dominio>.read`, `<dominio>.write` y
  `<dominio>.read_deleted`.
- `NAV_RESOURCES` — recursos que no corresponden a un ViewSet (dashboard, panel SaaS, grupos del menú).
- `MENU` — el árbol completo del aside: nombre visible, ícono, ruta, orden y padre.
- `LEGACY_KEYS` — claves heredadas que se desactivan (nunca se borran: `RoleResource` las referencia).
- `ROLES` — `admin` (operación completa del hotel), `manager`, `staff` y `platform_admin` (menú SaaS).

**Al agregar un endpoint nuevo:** declarar sus `required_scopes`, agregar el dominio a `DOMAINS`, y
si la página va al menú, agregar su entrada a `MENU`. Actualizar también `RBAC_RESOURCES_LIST.md`.
La prueba `accounts.tests.SeedRbacCoverageTests` recorre las URLs registradas y falla si un scope
declarado por una vista no quedó sembrado o si el rol `admin` no lo cubre — no hace falta acordarse.

El comando es idempotente y **reescribe** los recursos de los cuatro roles base; los roles creados a
mano por un hotel no se tocan. Con `--only-resources` se actualizan recursos y menú sin tocar roles,
y con `--assign-admin` se dan los roles de administrador a los superusuarios existentes.

### 5.4 Multi-tenancy por `hotel_settings`

**Decisión:** casi todos los modelos tienen FK a `hotel_settings.HotelSettings`. El aislamiento se
aplica con dos mixins en `accounts/tenancy.py`:

- **`TenantScopeMixin`** (ViewSets) — filtra el queryset al hotel del usuario autenticado.
- **`TenantSerializerMixin`** (Serializers) — asigna y valida el hotel al crear/editar, y verifica
  que los objetos relacionados pertenezcan al mismo hotel (`validate_same_tenant`).

**Definición de "administrador de plataforma":** `is_effective_global_admin()` = usuario superusuario
**y** con `hotel_settings is None`. Un superusuario que sí tiene hotel asignado **no** es admin
global — se comporta como administrador de su hotel. Esto es deliberado: permite que el dueño de un
hotel tenga privilegios amplios sin ver los datos de otros hoteles.

**Selección de hotel por el admin global:** mediante el query param `?hotel_settings=<id>`. El
frontend lo inyecta con `hotel-context.interceptor.ts`.

**Regla al programar:** ningún ViewSet nuevo debe consultar el modelo directamente sin pasar por
`TenantScopeMixin` (o por `scope_queryset_to_hotel`). Si un usuario no tiene hotel asignado y no es
admin global, el queryset devuelve `none()` — es intencional, no un bug.

### 5.5 Borrado lógico con marcadores genéricos, no con `is_active`

**Decisión:** `LogicalDeleteViewSetMixin` (`accounts/soft_delete.py`) intercepta `DELETE` y en vez de
borrar crea un registro en `SoftDeleteMarker` (tabla genérica con `ContentType` + `object_id`).
Expone además una acción `POST /<recurso>/<id>/restore/`.

**Por qué una tabla genérica y no un campo `deleted_at` por modelo:** evita añadir migraciones y
campos a decenas de modelos, y centraliza la lógica en un solo mixin.

**Distinción crítica que hay que respetar:**
- `is_active` = **estado operativo** (activo / inactivo). Es información de negocio.
- `SoftDeleteMarker` = **eliminado lógicamente**. Es información de ciclo de vida del registro.

**Nunca** usar `is_active=False` como sustituto de "borrado". Son cosas distintas y el código las
trata distinto.

**Query params soportados:** `?include_inactive=true` (incluye inactivos) y `?include_deleted=true`
(incluye eliminados, requiere scope `*.read_deleted`).

**Detalle técnico:** el filtrado castea la PK a texto (`Cast("pk", CharField())`) para que funcione
tanto con PKs enteras como con UUID.

### 5.6 Menú lateral dinámico desde la base de datos

**Decisión:** el modelo `Resource` no solo define permisos: también define el menú. Campos
involucrados: `link` (ruta Angular), `link_backend` (ruta API), `icon` (clase FontAwesome), `order`,
`is_menu`, y `parent` (auto-FK para submenús).

**Por qué:** el menú de cada usuario refleja exactamente sus permisos, sin duplicar la configuración
en el frontend. Agregar una entrada de menú es un registro en base de datos, no un despliegue.

**Implicación:** si agregas una página al frontend y no creas su `Resource`, **no aparecerá en el
menú de nadie** y el `permissionChildGuard` bloqueará el acceso.

### 5.7 El backend sirve el frontend compilado (despliegue de un solo servicio)

**Decisión:** el `Dockerfile` compila Angular en una primera etapa y copia el resultado a
`/app/frontend_dist`. Django lo sirve con:
- **WhiteNoise** para los assets estáticos (`STATICFILES_DIRS` / `WHITENOISE_ROOT` apuntan al dist).
- Una ruta *catch-all* en `backend/urls.py`:
  `re_path(r"^(?!api/|admin/|health/|static/|media/).*$", TemplateView("index.html"))`
  que devuelve la SPA para cualquier ruta que no sea API/admin/health/static/media.

**Por qué:** un solo servicio en Railway (más barato y más simple), mismo origen para frontend y
backend → la autenticación por cookie de sesión funciona sin configuración CORS compleja.

**Cuidado al agregar rutas backend nuevas:** si el prefijo no está en la lista de exclusión del
regex, la SPA se lo va a tragar. Los prefijos reservados son `api/`, `admin/`, `health/`, `static/`,
`media/`.

**El build de producción usa `--deploy-url /static/`** porque los assets se sirven bajo `STATIC_URL`.

### 5.8 Configuración por variables de entorno con validación estricta

**Decisión:** `backend/settings.py` define los helpers `env_bool`, `env_list`, `env_int` y **falla
al arrancar** (`RuntimeError`) si en producción (`DEBUG=False`) falta algo crítico:
- `DJANGO_SECRET_KEY` ausente o con valor placeholder
- `DJANGO_ALLOWED_HOSTS` vacío o con `*`
- `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` vacíos

**Por qué:** es preferible que el despliegue falle ruidosamente a que arranque inseguro.

**Autoconfiguración para Railway:** si existe `RAILWAY_PUBLIC_DOMAIN`, se derivan automáticamente
`ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` y `CSRF_TRUSTED_ORIGINS`. Se agrega `healthcheck.railway.app`
a los hosts permitidos porque el healthcheck de Railway llega con ese `Host` (commit `8366d4f7`).

**`SECURE_SSL_REDIRECT` se desactiva por defecto cuando hay dominio Railway** (commit `2259bc09`):
el proxy de Railway ya termina TLS, y el redirect hacía que el healthcheck interno (HTTP) recibiera
un 301 y fallara. **No reactivar sin verificar el healthcheck.**

**Base de datos:** SQLite por defecto, PostgreSQL con `DB_ENGINE=postgres`. Acepta tanto variables
`DB_*` propias como las `PG*` estándar.

### 5.9 Autoregistro público deshabilitado por defecto

**Decisión:** `ALLOW_PUBLIC_USER_REGISTRATION` y `ALLOW_PUBLIC_CLIENT_REGISTRATION` son `False` por
defecto. Si se habilitan, se exige además el header `X-Public-Registration-Token`.

**Por qué:** es un SaaS B2B — el alta de hoteles pasa por el flujo de solicitud de demo, y el alta
de usuarios la hace el administrador del hotel. Un registro abierto sería un vector de abuso.

### 5.10 Correo transaccional por API HTTPS (Resend), no por SMTP

**Decisión:** en producción se usa `anymail.backends.resend.EmailBackend`. SMTP queda como
alternativa comentada.

**Por qué:** los planes Free/Trial/Hobby de Railway **bloquean la salida SMTP**. La API HTTPS de
Resend funciona en cualquier plan. Es la corrección del commit `b340bddd` ("envío de correo
arreglado").

**Usos del correo:** recuperación de contraseña (`templates/email/password_reset.html`) y
notificaciones del flujo de solicitud de demo.

### 5.11 Throttling diferenciado por endpoint sensible

**Decisión:** tasas configuradas en `REST_FRAMEWORK.DEFAULT_THROTTLE_RATES`:
`anon` 30/min, `user` 120/min, `auth_login` 10/min, `password_reset` 5/min, `demo_request` 5/min.

**Por qué:** los endpoints de login, reset de contraseña y solicitud de demo son los blancos
naturales de fuerza bruta y spam. Usan `ScopedRateThrottle` con esos scopes.

### 5.12 Notificaciones internas por eventos + tareas programadas

**Decisión:** `apps/notifications/services.py` expone funciones de dominio
(`notify_reservation_created`, `notify_reservation_upcoming_checkin`, `notify_room_pending_cleaning`,
`notify_maintenance_created`, …) que se disparan desde signals (`apps/notifications/signals.py`) y
desde management commands programados.

Los destinatarios se resuelven por **rol** dentro del hotel (`notify_roles`,
`notify_hotel_managers`), no por usuario fijo — así la notificación llega a quien corresponda según
el RBAC vigente.

Hay deduplicación diaria (`_already_notified_today`) para no saturar con recordatorios repetidos.

**Comandos programados existentes:**

| Comando | Propósito |
|---|---|
| `notify_upcoming_checkins` | Avisa de check-ins próximos |
| `notify_upcoming_checkouts` | Avisa de check-outs próximos |
| `notify_daily_reports` | Envía el resumen diario |
| `sync_reservation_room_statuses` | Sincroniza estados de habitaciones según reservas |
| `sync_operational_alerts` | Recalcula alertas operativas financieras |

**Estado de lectura:** `NotificationReadState` guarda por usuario qué notificaciones ha leído
(endpoints `/api/auth/notifications/read-state|mark-read|mark-unread/`).

### 5.13 Frontend: standalone components + lazy loading + guards en cascada

**Decisión:**
- Angular **standalone** (sin NgModules). Todas las rutas de módulo usan `loadComponent`.
- Dos guards a nivel de `canActivateChild` en el layout autenticado: `authChildGuard` (sesión) y
  `permissionChildGuard` (RBAC contra los recursos del usuario).
- `hotel-context.interceptor.ts` inyecta el hotel seleccionado en las peticiones del admin global.
- Rutas en **español** como canónicas (`/reservas`, `/facturas`, `/habitaciones`), con **redirects
  desde los nombres en inglés** (`/reservations` → `/reservas`) por retrocompatibilidad con enlaces
  y con recursos RBAC antiguos. **Al agregar una ruta nueva: nombre en español, y redirect en inglés
  si el recurso RBAC lo usa.**
- Rutas exclusivas del admin de plataforma marcadas con `data: { platformAdminOnly: true }`.

**Estructura de un módulo del frontend:** `modules/<dominio>/list-<dominio>/` con los archivos
`.ts`, `.html`, `.css` y opcionalmente `.spec.ts`. El servicio HTTP vive en `services/<dominio>.ts`.

### 5.14 Habitaciones: una sola vista con modales, no cuatro páginas

**Decisión:** el módulo de habitaciones tiene **una única ruta**, `/habitaciones`. Los catálogos por
hotel que antes eran páginas propias (tipos de habitación y tarifas) se gestionan con modales
lanzados desde el encabezado, y toda la gestión de una habitación ocurre en un modal con pestañas.

- **Gestores de catálogo por hotel:** `modules/rooms/managers/{room-types,rates}-manager/`.
  Cada uno es autocontenido (listado + formulario en línea + eliminar/restaurar).
- **Amenidades globales:** `apps.rooms.Amenity` es un catálogo global, sin FK a hotel. Se administra
  solo desde `/saas-amenidades` por el administrador de plataforma. Los hoteles no crean amenidades:
  en cada habitación únicamente activan o desactivan las amenidades globales disponibles.
- **Modal de habitación:** `modules/rooms/room-modal/`, con las pestañas General, Amenidades,
  Tipo y tarifa, Reserva, Limpieza y mantenimiento, e Inventario.
- Las rutas viejas (`/tipos-habitacion`, `/tarifas-habitacion`, `/amenidades` y sus alias en
  inglés) quedan como **redirect** a `/habitaciones`.

**Por qué:** una tarea corriente —crear un tipo, ponerle tarifa y asignarlo a una habitación—
requería tres navegaciones y perder el contexto en cada una. Con la consolidación el operador no
sale nunca de la habitación en la que está trabajando.

**Por qué redirect en vez de borrar las rutas:** el menú lateral se construye desde la base de
datos (5.6). Si un despliegue no ha corrido la migración `accounts/0019`, el aside todavía ofrece
esos destinos; el redirect evita que caigan en un 404.

**Regla al programar:** los recursos RBAC `amenities.read`, `room_type.*` y `rates.*` **siguen
activos y son obligatorios** — la vista consulta `/api/amenities/`, `/api/room-types/` y
`/api/rates/`. `amenities.write` no debe asignarse a roles de hotel: aunque exista por
compatibilidad del endpoint, el ViewSet exige administrador de plataforma para crear, editar,
eliminar o restaurar amenidades globales.

### 5.15 Estilos compartidos por tokens, no por overrides de modo oscuro

**Decisión:** los componentes nuevos usan las clases globales `gh-modal-*`, `gh-tab*`, `gh-field`,
`gh-panel`, `gh-chip`, `gh-modal-table`, `gh-mbtn*` y `gh-cat-*` definidas al final de
[frontend/src/styles.css](frontend/src/styles.css), construidas **exclusivamente con tokens
`--gh-*`**.

**`gh-cat-*` es la anatomía de tarjeta de catálogo** (servicios, paquetes y promociones): franja de
color, placa de icono, título con etiquetas, descripción a dos líneas, metadatos, pie con el dato
comparable —precio o descuento— y barra de acciones. El color de cada categoría **no** se escribe en
el CSS: el componente lo inyecta con `[ngStyle]` en las variables `--cat-tone` y `--cat-tone-soft`,
que la clase consume. Así una tarjeta nueva de catálogo no necesita CSS propio.

**Por qué:** el patrón previo del repositorio era escribir colores fijos en el CSS del componente y
después compensarlos con reglas `:is(.my-app-dark, .dark) app-mi-componente .btn-light { ... }` en
`styles.css`. Ese bloque ya acumulaba ~200 líneas y crecía con cada componente nuevo. Como el modo
oscuro redefine los tokens `--gh-*` en un solo lugar, un componente que solo usa tokens funciona en
ambos temas sin una línea extra.

**Regla al programar:** en CSS nuevo, **no escribir colores literales**. Usar los tokens. Si falta
un token para un caso legítimo, agregarlo a `:root` y a su bloque de modo oscuro, no improvisar un
override por componente.

### 5.16 Métodos de pago por hotel, fuera de `MasterData`

**Decisión:** los métodos de pago viven en `hotel_settings.PaymentMethod`, con FK a
`HotelSettings` y unicidad `(hotel_settings, code)`. Se administran en la pestaña **Métodos de
Pago** de `/hotel-config` y se exponen en `GET /api/payment-methods/`, filtrados por
`TenantScopeMixin`.

**Un método se define con tres cosas:** `name`, `method_type` (`EFECTIVO` o `TRANSFERENCIA`) y
`account_number`. La cuenta **solo aplica a transferencias**: el formulario oculta el campo en
efectivo y tanto el serializer como `PaymentMethod.save()` la descartan, para que no quede un dato
huérfano que después alguien lea como válido. Al cobrar por transferencia, el modal de check-out
muestra la cuenta destino — es el número que recepción le dicta al huésped, y por eso se guarda
junto al método y no en una nota suelta.

**Todo hotel nace con "Efectivo".** Un `post_save` en `apps/hotel_settings/signals.py` siembra el
método al crear el `HotelSettings`. Va en un signal y no en la vista porque los hoteles nacen por
tres caminos —el panel SaaS, `POST /api/hotel-settings/` y
`apps.demo_requests.views.convert_request()`— y sin al menos un método activo el hotel no puede
cobrar ni cerrar un check-out. Usa `get_or_create`, así que es idempotente. El método es un punto de
partida: el hotel puede renombrarlo, desactivarlo o borrarlo.

**`code` no lo escribe el usuario:** se deriva del nombre (`Nequi Bancolombia` → `NEQUI_BANCOLOMBIA`,
sin tildes) en `PaymentMethod.save()`. Existe porque las pantallas de facturación lo usan para
elegir ícono y etiqueta (`payment_method_code`), y porque su unicidad por hotel es lo que impide
dos métodos con el mismo nombre. **Al renombrar un método cambia su código**, así que si en el
futuro alguna lógica llegara a comparar códigos, hay que revisar esto primero.

**Por qué:** antes estaban en `MasterData` con `group='PAYMENT_METHOD'`, una tabla **global sin FK a
hotel** cuyo ViewSet no tiene tenancy. Como `master_data.write` está en los roles `admin` y
`manager`, cualquier administrador de hotel podía renombrar o desactivar un método de pago **para
todos los hoteles de la plataforma**. No era una preferencia de modelado: era una fuga de
multi-tenancy, la misma clase de problema que ya se corrigió con las amenidades (5.14). El síntoma
estaba en los datos: el catálogo global acumulaba duplicados (`CASH` junto a `EFECTIVO`, `CARD`
junto a `TARJETA`) y un typo ya activo, `TRASNFER`.

**La distinción que hay que respetar:** `MasterData` mezcla dos cosas distintas.

- **Enums del sistema** — `ROOM_STATUS`, `RESERVATION_STATUS`, `INVOICE_STATUS`, `CLEANING_STATUS`,
  `MAINTENANCE_STATUS`, `INVENTORY_MOVEMENT_TYPE`. El código compara estos códigos **literalmente**;
  si un hotel los edita, rompe la lógica. Son globales y no deberían ser editables por un hotel.
- **Catálogos de negocio** — configuración que legítimamente varía por hotel.

`PAYMENT_METHOD` era del segundo grupo y por eso salió. **`EXPENSE_CATEGORY`, `CHARGE_TYPE`,
`SERVICE_TYPE` y `MEAL_PLAN` también lo son y siguen en la tabla global**: si alguno estorba, el
camino ya está trazado por este cambio.

**Al programar:**
- Para cobrar o registrar un pago, usar `PaymentMethodService.listPaymentMethods()` en el frontend;
  **nunca** `listMasterData({group: 'PAYMENT_METHOD'})`, que ya no alimenta nada.
- Los tres FK que apuntan al catálogo (`billing.Payment`, `finance.Expense`,
  `reservations.ReservationDeposit`) validan en su serializer que el método pertenezca al hotel del
  registro.
- Un hotel **sin métodos activos no puede cobrar ni cerrar un check-out**. La pestaña lo advierte.

### 5.17 La administración de la plataforma no la ve un hotel

**Decisión:** **Usuarios**, **Roles**, **Recursos** y **Master Data** viven bajo *SaaS Admin* y solo
las ve el administrador de plataforma. Sus rutas (`/usuarios`, `/roles`, `/recursos`,
`/master-data`) están marcadas con `data: { platformAdminOnly: true }`.

**Por qué:** definen **quién entra al sistema, con qué permisos y sobre qué enums opera el código**.
Un hotel que edite `ROOM_STATUS` o `RESERVATION_STATUS` rompe la lógica de todos los demás, porque
`MasterData` es global (ver 5.16).

**La distinción que hay que respetar al programar aquí:** *ver la página* y *usar la API* son cosas
distintas y se controlan por separado.

- Las **entradas de menú** son recursos propios y sin `link_backend`: `saas_users.read`,
  `saas_roles.read`, `saas_resources.read`, `saas_master_data.read`. Solo el rol `platform_admin`
  los tiene.
- Los **scopes de dominio** (`users.*`, `roles.*`, `resources.*`, `master_data.*`) siguen siendo
  quienes protegen la API y ya **no son entradas de menú**.

**`master_data.read` sigue asignado a los roles de hotel**, y no es un descuido: lo consumen doce
pantallas —facturas, limpieza, egresos, inventario, ítems, mantenimiento, promociones, reservas…—
para leer sus catálogos. Quitárselo las rompe con 403. Lo que se les retiró fue `users.*`, `roles.*`
y `resources.*`, que solo usaban esas cuatro páginas.

**Consecuencia operativa:** un administrador de hotel **ya no crea usuarios de su hotel**; eso pasa
a ser trabajo del administrador de plataforma. Si en el futuro se quiere devolver esa capacidad sin
devolver el resto, el camino es un recurso de menú propio (`hotel_users.read`) apuntando a
`/usuarios`, más una vista filtrada por hotel — no reactivar el grupo *Seguridad*.

### 5.18 Catálogo comercial: una vista con pestañas, no tres rutas

**Decisión:** servicios, paquetes y promociones viven en `/catalogo-comercial`, una sola ruta con
tres pestañas. Las rutas viejas (`/catalogo-servicios`, `/catalogo-paquetes`, `/promociones` y sus
alias en inglés) redirigen a la pestaña que corresponde.

**Por qué:** la dependencia entre las tres es **encadenada**, no temática:

```
Service ──< PackageService >── Package
   ▲                              ▲
   └────────  Promotion  ─────────┘
```

Un paquete se arma con servicios y una promoción apunta a un servicio o a un paquete. El cruce ya
existía en el código —`create-package` y `create-promotion` reciben los catálogos ajenos por
`@Input`—, pero obligaba a navegar entre tres pantallas para una sola tarea.

**Por qué pestañas y no modales, a diferencia de 5.14:** en habitaciones había una entidad principal
y tres catálogos accesorios que cabían como gestores modales. Aquí las tres entidades tienen peso
propio (~700–830 líneas de TS cada lista), así que **se conservan enteras** dentro de su pestaña.

**Regla al programar:**
- Cada lista acepta `@Input() embedded`, que oculta su encabezado y sus métricas cuando vive dentro
  del contenedor. Con `embedded = false` sigue funcionando como página suelta; no se borró esa
  capacidad.
- Cada lista emite `@Output() changed` tras cualquier mutación, para que el contenedor recalcule
  sus métricas.
- **Solo se monta la pestaña activa.** Montar las tres dispararía sus peticiones y sus animaciones
  sin que nadie las vea.
- La pestaña activa viaja en la URL (`?tab=packages`).
- La entrada de menú `commercial_catalog.read` es **solo menú**: los endpoints los siguen
  protegiendo `services.*`, `packages.*` y `promotions.*` (misma separación que 5.17).

---

### 5.19 Facturación: el ciclo de cobro completo en una vista

**Decisión:** facturas, pagos y reembolsos viven en `/facturacion`, una sola ruta con tres pestañas.
`/facturas`, `/pagos`, `/reembolsos` y sus alias en inglés redirigen a la pestaña que corresponde.
Es el mismo patrón de 5.18, aplicado a una dependencia todavía más fuerte.

**Por qué:** aquí la relación no es un cruce, es una **cadena estricta del modelo**:

```
Invoice ──< Payment ──< PaymentRefund
```

`Payment.invoice` y `PaymentRefund.payment` son FK obligatorias: un pago no existe sin factura y un
reembolso no existe sin pago. Y **ninguna de las tres se crea en su propia vista** — el pago nace en
el check-out (`room-check-modal`) y el reembolso en el detalle del pago. Las tres eran, ya antes de
unirlas, vistas de **consulta y auditoría del mismo dinero**.

**Lo que aporta el contenedor y no tenía ninguna:** el **saldo por cobrar** real. Vive entre
facturas y pagos, así que hasta ahora había que calcularlo saltando de una vista a otra.

**Cómo se calcula el pendiente, y por qué no es `facturado − cobrado`:** esa resta arrastra el
histórico completo y daría un pendiente falso en cuanto haya una factura anulada. Se calcula solo
sobre las facturas **que siguen esperando cobro** —ni `PAGADA` ni `ANULADA`— y sus pagos, con piso
en cero para que un cobro de más no lo vuelva negativo.

**Frontera con Finanzas:** `/consolidado-ingresos` y `/control-financiero` son **análisis por
periodo**; `/facturacion` es el **libro operativo**, documento a documento. No se mezclan.

**Regla al programar:**
- Mismas reglas de 5.18 (`embedded`, `changed`, solo la pestaña activa montada, `?tab=` en la URL).
- La entrada de menú `billing_center.read` es **solo menú**: los endpoints los siguen protegiendo
  `invoices.*` y `payments.*`.
- **La pestaña de reembolsos se pinta solo con `payment-refunds.read`.** Era la única de las tres
  que recepción no tenía en su menú; al unirlas habría heredado el acceso por la puerta de atrás.
  No es un control de acceso —la API valida aparte— sino conservar el alcance que cada rol ya tenía.
- El cache-aside de `BillingService` usa TTL **operativo** (20 s), no de catálogo: esto es dinero.
  Y **cualquier escritura invalida las tres claves**, porque cada eslabón de la cadena cambia el
  saldo del anterior.

**Un reembolso se registra desde el pago, no desde la pestaña de reembolsos.** `PaymentRefund.payment`
es FK obligatoria y el tope reembolsable, el método y la referencia salen de ese pago; un formulario
suelto tendría que empezar preguntando "¿de qué pago?". Se entra por el botón **Reembolsar** de la
tarjeta de pago o del pie de su detalle. La pestaña de reembolsos **consulta y aprueba**, y lo dice
explícitamente en una nota de origen para que nadie busque ahí un botón "Nuevo" que no puede existir.

**Consultar un pago y reembolsarlo son dos modales distintos** (`DetailPayment` y `RefundPayment`).
La primera intención se repasa, la segunda se decide, y mezclarlas dejaba el formulario apretado
entre datos de solo lectura. `RefundPayment` **recalcula el saldo reembolsable al abrirse** en vez
de heredarlo del listado —otro usuario pudo reembolsar entretanto— y descuenta también los
reembolsos **pendientes de aprobar**: no han salido de caja, pero ya comprometen el saldo.

---

### 5.20 Inventario: el catálogo, su reparto y su bitácora en una vista

**Decisión:** items, dotación por habitación y movimientos viven en `/inventario`, una sola ruta con
tres pestañas. `/items`, `/inventario-habitaciones`, `/movimientos-inventario` y sus alias redirigen
a la pestaña que corresponde. Mismo patrón de 5.18 y 5.19.

**Por qué:** `Item` es el centro de una estrella, no un vecino temático:

```
             InventoryMovement
                    │ item
                    ▼
    RoomInventory ─► Item ◄─ InventoryRestockAlert
         item
```

Y hay algo más fuerte que la FK compartida: **`InventoryMovement` es la bitácora de `Item.stock`**
—guarda `previous_stock` y `new_stock`—, así que Items enseñaba el número actual y Movimientos
enseñaba cómo llegó a serlo, sin forma de pasar de uno al otro. Las otras dos ya cargaban el
catálogo de items para poder pintarse.

**El aviso de bajo mínimo estaba duplicado.** "Bajo mínimo" y "Sin stock" se calculaban en la vista
de items *y* en la de habitaciones, sobre tablas distintas: había que mirar dos pantallas para
responder "¿de qué me estoy quedando sin?". Ahora es una métrica del contenedor.

**Seguimiento entre pestañas (`focus`):** desde un item se salta a **sus** movimientos o a las
habitaciones donde está, y la lista destino se abre acotada por él. La barra de rastro recuerda a
quién se está siguiendo y ofrece los saltos que quedan. Las listas **no navegan por su cuenta**:
emiten `followItem` y el contenedor decide, igual que `navigateTab` en 5.19. El filtro entra por
`@Input() focusItemId` y **no toca los filtros propios** de la lista, que el usuario puede seguir
moviendo por encima.

**Regla al programar:**
- Mismas reglas de 5.18 (`embedded`, `changed`, solo la pestaña activa montada, `?tab=` en la URL).
- La entrada de menú `inventory_center.read` es **solo menú**: los endpoints los siguen protegiendo
  `items.*`, `room-inventory.*` e `inventory-movements.*`.
- Cache-aside con TTL **operativo** (20 s): el stock lo mueve cada consumo y cada check-out, no solo
  quien edita el catálogo. Cualquier escritura invalida las **tres** claves.

**Un movimiento es un asiento: se aplica una vez.** `InventoryMovement.save()` calcula
`previous_stock`/`new_stock` y toca `Item.stock` **solo al crear**. Editar un movimiento —cambiar
su nota, marcarlo inactivo— no vuelve a mover nada, y **desactivarlo no devuelve el stock**: para
revertir hay que registrar el movimiento contrario, que es lo que deja rastro. Ver el fix del
2026-08-12 en el registro: hacerlo en cada `save()` restaba la cantidad otra vez en cada edición.

**Las operaciones masivas viven en el backend, no en un bucle del frontend.** El conteo físico
(`POST /api/inventory-movements/stock-count/`) y la entrada de compra
(`POST /api/inventory-movements/purchase-entry/`) reciben el lote entero y lo asientan en **una
transacción** con una **referencia compartida** (`CONTEO-…` / `COMPRA-…`). Dos razones, y ninguna
es de rendimiento:

1. Un conteo a medias es peor que ninguno: el stock quedaría mezclado entre lo contado y lo viejo
   sin que nadie sepa dónde está el corte.
2. Sin referencia común, un conteo de 80 items queda como 80 ajustes sueltos que nadie puede
   agrupar después para reconstruir "el conteo del 12 de agosto".

El conteo usa `ADJUSTMENT` porque **declara el valor absoluto**; la compra usa `IN` porque **suma
lo que llegó**. El conteo registra **solo las líneas que difieren** — hallar 3 descuadres en 80
items debe dejar 3 movimientos. Y ambas guardan `created_by`: sin autor, un ajuste de inventario
no se le puede preguntar a nadie.


---

### 5.21 Limpieza y mantenimiento: una vista, con la habitación como unidad

**Decisión:** tareas de limpieza y órdenes de mantenimiento viven en `/limpieza-mantenimiento`,
una sola ruta con tres pestañas. `/tareas-limpieza`, `/ordenes-mantenimiento` y sus alias
redirigen. Mismo patrón de 5.18, 5.19 y 5.20.

**Por qué:** son **el mismo objeto**: trabajo pendiente sobre una habitación, con estado,
prioridad y una fecha que se puede incumplir. Tan iguales que `CleaningTask.priority` y
`MaintenanceOrder.priority` apuntan al **mismo catálogo** (`MAINTENANCE_PRIORITY`), y sus dos
pantallas mostraban las **mismas cinco métricas con los mismos rótulos**.

**La pestaña que lo justifica: "Por habitación".** Es la pregunta que no contestaba ninguna de
las dos listas —*¿qué le falta a la 101?*—. Una habitación con limpieza pendiente **y** una avería
abierta no es lo mismo que una con solo una de las dos, y esa diferencia decide si se puede vender
esa noche. Mirando por tipo de trabajo eso no se ve nunca. Es la pestaña por defecto.

**Atrasado significa lo mismo en las dos**, aunque el campo se llame distinto: en limpieza la fecha
es `scheduled_for` (cuándo tocaba) y en mantenimiento `estimated_completed_at` (cuándo se
prometió). Las dos son un compromiso incumplido, y se comparan **por día**, no por instante:
comparar horas produciría atrasos falsos.

**Regla al programar:**
- Mismas reglas de 5.18 (`embedded`, `changed`, solo la pestaña activa montada, `?tab=` en la URL).
- El seguimiento entre pestañas entra por `@Input() focusRoomId`, igual que `focusItemId` en 5.20.
- La entrada de menú `operations_center.read` es **solo menú**: los endpoints los siguen protegiendo
  `cleaning_tasks.*` y `maintenance_orders.*`.

**El trabajo periódico es una regla que produce tareas, no una tarea que se repite.**
`RecurringWork` guarda el ritmo (`frequency`, `interval`, `weekday`/`day_of_month`, ventana de
fechas) y **`next_run_on` como estado**; `apps/rooms/recurring.py` materializa la tarea u orden y
adelanta esa fecha.

**No depende de un cron.** La materialización se dispara **al listar** limpieza, mantenimiento o las
propias reglas (`MaterializeRecurringWorkMixin`), acotada al hotel de quien consulta. Un hotel que
instala Wayra y programa algo espera que funcione, no que funcione *si además* alguien configuró una
tarea diaria en el servidor. El comando `generate_recurring_work` sigue existiendo para quien sí
tenga programador y quiera el trabajo listo a primera hora aunque nadie haya entrado.

Que lo llamen los dos sitios es seguro porque la operación es **idempotente por día** y cada regla se
genera bajo `select_for_update()` con revisión dentro de la transacción: dos peticiones simultáneas
de la misma pantalla no pueden duplicar. Y un fallo al generar **no tumba la lectura** — el usuario
debe ver su trabajo igual; el siguiente listado reintenta. Si la periodicidad viviera en la propia tarea, cerrarla borraría
la programación, cambiar la frecuencia reescribiría el histórico, y no habría forma de contestar
"qué está programado" sin recorrer todo lo hecho.

Tres decisiones del motor que no son obvias:

1. **Una regla sin habitación aplica a todas las del hotel** — es lo que significa "revisión mensual
   de aires". Excluye las dadas de baja lógicamente, que no tienen `is_active` (5.5).
2. **Si el comando no corrió en varios días, se genera una sola vez y se salta el resto.** Cinco
   limpiezas idénticas de lunes a viernes no son trabajo pendiente: son ruido que alguien tendría
   que cerrar a mano.
3. **Sumar un mes al 31 recorta al último día del mes destino.** Es lo que espera quien programa
   "el último día de cada mes" poniendo 31.

La aritmética de calendario vive en `apps/rooms/recurrence.py`, aparte del modelo y del comando: es
la única parte con lógica de fechas y la que hay que poder probar sin base de datos ni reloj.

---

### 5.22 Finanzas: el libro del periodo, separado del análisis

**Decisión:** ingresos y egresos viven en `/finanzas`, una ruta con tres pestañas.
`/consolidado-ingresos`, `/ingresos`, `/egresos` y sus alias redirigen. **`/control-financiero`
sigue siendo su propia ruta.** Mismo patrón de 5.18 a 5.21.

**Por qué se juntan las dos primeras:** son las dos mitades de la misma pregunta, y la resta entre
ellas —**cuánto queda**— no estaba en ninguna de las dos. Era el caso del saldo por cobrar de 5.19:
el número que nadie tenía porque vivía en el hueco entre dos pantallas, y que hasta ahora había que
sacar abriendo dos vistas, anotando dos cifras y restándolas a mano.

**La pestaña que lo justifica: "Resultado".** Es la pestaña por defecto. Da el resultado del
periodo, la **proporción de lo que entra que se va en gastos**, y los dos desgloses enfrentados
—de dónde viene el dinero, en qué se va—. Nada de eso es un dato nuevo del servidor: es la lectura
que ninguna de las dos vistas podía hacer sola.

**Por qué control financiero no entra ahí:** son cosas distintas. `/finanzas` es el **libro del
periodo** —lo que entró y lo que salió, hechos registrados—; `/control-financiero` es **análisis**
—punto de equilibrio, escenarios hipotéticos, estados financieros comparados contra el año
anterior—. Y hay una razón práctica: control financiero tiene cuatro pestañas propias, y meterlas
dentro de una pestaña produce dos barras de pestañas, que es justo la navegación que estas
consolidaciones existen para eliminar.

**El resultado es de caja, no contable.** Ingresos menos egresos del periodo, sin devengos ni
depreciaciones. La utilidad contable vive en el estado de resultados de `/control-financiero`, y
las dos cifras **no tienen por qué coincidir**: no es un error, son dos preguntas distintas.

**Control financiero carga por pestaña.** Antes pedía tablero, escenario y estados **de golpe** en
cada carga y en cada cambio de hotel: tres agregaciones pesadas para mirar una. Ahora cada pestaña
pide lo suyo la primera vez que se abre (`loadedTabs`), y *Actualizar* refresca **solo lo que se
está mirando**. Los estados no dependen del rango de fechas sino de año y mes, así que cambiar el
periodo no los invalida.

**El cache lleva los parámetros en la clave:** el tablero de enero y el de febrero son cosas
distintas y se guardan por separado, así que volver a un periodo ya consultado es gratis. TTL
operativo (20 s) y no de catálogo — son cifras de dinero del día. Guardar la configuración invalida
las cuatro claves: los umbrales alimentan el semáforo y los impuestos el estado de resultados.

---

### 5.23 Auditoría: una tabla propia, inmutable, escrita por señales

**Decisión:** el rastro de auditoría vive en `accounts.AuditLog`, una tabla **append-only** que se
escribe desde señales `post_save`/`post_delete`, con el contexto de la petición (usuario, IP, ruta)
inyectado por `AuditContextMiddleware` a través de un `ContextVar`. Se consulta en `/api/audit/`
—**solo lectura**— y se ve en `/auditoria`.

**Qué había antes:** la pantalla `/actividad` no leía ningún registro. **Reconstruía** una línea de
tiempo pidiendo pagos, movimientos de inventario, órdenes de mantenimiento y reservas, y
mezclándolos. Eso no es auditoría por tres razones, y las tres importan:

1. **Cobertura:** 4 dominios de 43 endpoints. Nada de habitaciones, tarifas, usuarios, roles,
   configuración, egresos ni facturas.
2. **Solo altas.** No había ediciones ni borrados. Si alguien cambiaba el monto de un pago, la
   "actividad" pasaba a contar otra cosa **retroactivamente** y nadie se enteraba.
3. **Sin autor ni origen.** El "quién" era lo que cada modelo guardara por su cuenta —reservas y
   mantenimiento, nada—, y la hora era la del negocio (`payment_date`), no la de la acción.

**Por qué por señales y no por un mixin de viewset:** un mixin habría obligado a tocar los 43
endpoints y solo cubriría lo que entra por la API. Las señales cubren **toda** escritura del ORM,
incluidos comandos de gestión y tareas internas, sin tocar ni un viewset. Lo que las señales no
saben es *quién*; ese hueco lo tapa el middleware. Se usa `ContextVar` y no una global de hilo
porque Django puede servir en contextos asíncronos, donde varias peticiones comparten hilo.

**Una escritura sin petición se registra igual**, como acción del sistema. En una auditoría *"lo
hizo un proceso automático"* es una respuesta; *"no hay registro"* no lo es.

**Tres decisiones que no se ven pero sostienen esto:**

- **Las migraciones de datos no se auditan.** Django las ejecuta con modelos históricos que viven en
  el módulo `__fake__`, y sus escrituras también disparan señales. Sin excluirlas, un `migrate`
  desde cero —lo que hace cualquier despliegue nuevo— reventaba al escribir en una tabla que aún no
  existía.
- **Los campos `auto_now` no cuentan como cambio.** Si no, cada `save()` de cualquier modelo dejaría
  una fila que solo dice "updated_at cambió", y esas esconden los cambios de verdad.
- **El nombre del autor se guarda desnormalizado.** El usuario puede renombrarse o borrarse; el
  rastro tiene que seguir diciendo quién era **entonces**.

**Aislamiento por hotel** mediante una columna `hotel_settings_id` desnormalizada: resolver la
entidad de cada fila para saber de qué hotel es costaría una consulta por fila.

**Sin purga automática**, y con exportación a CSV del periodo filtrado —para entregarle el rastro al
contador o al auditor sin darle acceso al sistema—. Borrar registros de auditoría automáticamente es
justo lo que una auditoría no quiere; si algún día el volumen molesta, se decide entonces.

**`activity-log.view` no se borra:** se desactiva y pierde su enlace, y quien lo tenía recibe
`audit.read`. Borrarlo dejaría huérfanas las asignaciones de rol y el rastro de que existió.

## 6. Módulos funcionales

Mapa backend ↔ frontend ↔ rutas. Los recursos RBAC siguen el patrón `<clave>.read` / `<clave>.write`.

| App backend | Modelos principales | Módulo frontend | Ruta |
|---|---|---|---|
| `accounts` | `User`, `Role`, `JobTitle`, `Resource`, `UserRole`, `RoleResource`, `NotificationReadState`, `SoftDeleteMarker` | `modules/users`, `pages/roles`, `pages/recursos` | `/usuarios`, `/roles`, `/recursos`, `/mi-perfil` |
| `apps.hotel_settings` | `HotelSettings`, `HotelFloor`, `ReservationPolicy` | `pages/hotel-settings` | `/hotel-config` |
| `apps.master_data` | `MasterData`, `RoomType` | `pages/master-data` | `/master-data` |
| `apps.clients` | `Client` | `modules/clients` | `/clientes` |
| `apps.rooms` | `RoomType`, `Rate`, `Amenity`, `Room`, `MaintenanceOrder`, `CleaningTask` | `modules/rooms`, `modules/saas`, `modules/cleaning-tasks`, `modules/maintenance-orders` | `/habitaciones` (tipos y tarifas como modales; amenidades se asignan por habitación), `/saas-amenidades` (catálogo global), `/tareas-limpieza`, `/ordenes-mantenimiento` |
| `apps.reservations` | `Reservation`, `ReservationRoom`, `ReservationGuest`, `ReservationDeposit`, `ReservationInventoryCheck`, `ReservationInventoryCheckLine` | `modules/reservations` | `/reservas` |
| `apps.services` | `Service` | `modules/services` | `/catalogo-servicios` |
| `apps.packages` | `Package`, `PackageService` | `modules/packages` | `/catalogo-paquetes` |
| `apps.promotions` | `Promotion` | `modules/promotions` | `/promociones` |
| `apps.billing` | `Charge`, `Invoice`, `InvoiceCharge`, `Payment`, `PaymentRefund`, `CreditNote` | `modules/billing`, `modules/payments` | `/facturas`, `/pagos`, `/reembolsos` |
| `apps.finance` | `Expense`, `FinancialControlConfig`, `OperationalAlert`, `FinancialStatementSnapshot` | `modules/expenses`, `modules/financial-control`, `modules/income-consolidated` | `/egresos`, `/control-financiero`, `/consolidado-ingresos` |
| `apps.inventory` | `Item`, `InventoryMovement`, `RoomInventory`, `InventoryRestockAlert` | `modules/items`, `modules/room-inventory`, `modules/inventory-movements` | `/items`, `/inventario-habitaciones`, `/movimientos-inventario` |
| `apps.reports` | (sin modelos — agrega datos de otras apps) | `modules/reports` | `/reportes`, `/actividad` |
| `apps.notifications` | `Notification` | `services/notification.ts`, `services/notification-state.ts` | (campana en el header) |
| `apps.demo_requests` | `DemoRequest` | `modules/saas` | `/saas-solicitudes-demo` |
| — | — | `modules/saas` | `/saas-panel`, `/saas-hoteles` |

**Nota sobre `RoomType` duplicado:** existe tanto en `apps.master_data` (heredando de `MasterData`)
como en `apps.rooms`. Es una duplicación conocida — ver [deuda técnica](#13-deuda-técnica-y-pendientes-conocidos).

### Endpoints transversales

| Endpoint | Descripción |
|---|---|
| `GET /health/` | Healthcheck (usado por Railway) |
| `GET /api/schema/` | Esquema OpenAPI |
| `GET /api/docs/` | Swagger UI |
| `GET /admin/` | Django admin |
| `GET /api/auth/csrf/` | Inicializa la cookie CSRF |
| `POST /api/auth/login/` \| `logout/` | Sesión |
| `GET /api/auth/me/` \| `PATCH /api/auth/me/update/` | Perfil del usuario |
| `POST /api/auth/password/change/` \| `reset/` \| `reset/confirm/` | Contraseñas |

---

## 7. Convenciones de código

### Backend (Django)

1. **Todo ViewSet de dominio lleva, en este orden:**
   ```python
   class MiViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
       queryset = MiModelo.objects.all()
       serializer_class = MiSerializer
       permission_classes = [HasResourcePermission]
       required_scopes = ["mi_dominio.read"]

       def get_required_scopes(self):
           if self.request.method in SAFE_METHODS:
               return ["mi_dominio.read"]
           return ["mi_dominio.write"]
   ```
2. **Serializers de dominio heredan `TenantSerializerMixin`** y llaman a `assign_target_tenant()` en
   `create()`, y a `validate_same_tenant()` para cada FK a otro modelo del mismo hotel.
3. **Nombres de clases y campos en inglés**; comentarios, docstrings y mensajes de error al usuario
   **en español**.
4. **PKs:** `accounts.User`, `Role`, `Resource`, `UserRole`, `RoleResource` usan **UUID**. Los
   modelos de dominio usan `BigAutoField`. No cambiar el tipo de PK de un modelo existente.
5. **Errores:** el handler global es `accounts.exceptions.exception_handler`. Los errores de
   validación se devuelven como `{campo: mensaje}`.
6. **Migraciones:** una migración por cambio de modelo, generada con `makemigrations`, nunca editada
   a mano salvo para data migrations conscientes.
7. **Zona horaria:** `America/Bogota`, `USE_TZ=True`. Guardar siempre en UTC, formatear en la capa
   de presentación.

### Frontend (Angular)

1. **Componentes standalone**, sin NgModules.
2. **Rutas de módulo siempre con `loadComponent`** (lazy). Solo las páginas del núcleo (dashboard,
   login, roles, recursos, hotel-settings, master-data) se importan de forma directa.
3. **Un servicio por dominio** en `services/`, con su `.spec.ts` cuando aplique.
4. **Nomenclatura de archivos:** `kebab-case`; componentes de listado como
   `modules/<dominio>/list-<dominio>/list-<dominio>.ts`.
5. **Formato:** Prettier con `printWidth: 100`, `singleQuote: true`, parser `angular` para HTML
   (configurado en `frontend/package.json`).
6. **Estilos:** Tailwind para layout y utilidades; PrimeNG para componentes complejos (tablas,
   diálogos, calendarios). Modo oscuro soportado en toda la UI.
7. **Iconos:** FontAwesome, con la clase completa guardada en `Resource.icon`
   (ej. `fa-solid fa-calendar w-5`).

### Git

- Rama principal: `main`.
- Mensajes de commit en español, descriptivos del cambio funcional.
- **No commitear:** `.env`, `db.sqlite3`, `media/`, `staticfiles/`, `node_modules/`, `backups/`,
  archivos `.pyc`.

---

## 8. Entorno de desarrollo

### Backend

```bash
cd backend
python -m venv env
env\Scripts\activate            # Windows
pip install -r requirements.txt
cp .env.example .env            # y ajustar valores para desarrollo
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_rbac      # carga roles y recursos base
python manage.py runserver
```

Para desarrollo, en `.env`: `DJANGO_DEBUG=True`, `DB_ENGINE=sqlite`. Con `DEBUG=True` no se exigen
las variables de producción y se relajan las cookies seguras.

### Frontend

```bash
cd frontend
npm ci
npm start        # ng serve en :4200 con proxy.conf.json hacia el backend
```

`proxy.conf.json` redirige `/api` al backend en desarrollo, de modo que el navegador siga viendo un
solo origen y la cookie de sesión funcione igual que en producción.

---

## 9. Pruebas y checklist predeploy

### CI (`.github/workflows/ci.yml`)

Se ejecuta en cada PR y en cada push a `main`, con dos jobs:

**Backend** (Python 3.12, SQLite):
- `python manage.py test`
- `python manage.py spectacular --file schema.yml --validate`

**Frontend** (Node 20, Chrome headless):
- `npm run lint` (`tsc --noEmit` sobre `tsconfig.app.json` y `tsconfig.spec.json`)
- `npm run test:ci`
- `npm run build:ci`

### Checklist manual antes de desplegar

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy-check.ps1
```

Equivale a: tests backend → validación OpenAPI → lint frontend → tests frontend → build frontend →
`git status` limpio. Detalle completo en [docs/production-runbook.md](docs/production-runbook.md).

---

## 10. Despliegue

**Plataforma:** Railway, con builder `DOCKERFILE`, healthcheck en `/health/` (timeout 300s), política
de reinicio `ON_FAILURE` con máximo 3 reintentos.

**Proceso de arranque** (`backend/entrypoint.sh`):
```sh
python manage.py migrate --noinput
python manage.py collectstatic --noinput
exec gunicorn backend.wsgi:application --bind 0.0.0.0:${PORT:-8000} \
     --workers ${WEB_CONCURRENCY:-2} --timeout ${GUNICORN_TIMEOUT:-120}
```

**Las migraciones corren en cada arranque.** Una migración destructiva se aplica al desplegar, sin
ventana de mantenimiento explícita. Para cambios de esquema riesgosos, seguir el procedimiento de la
sección 3 del runbook (probar en staging primero).

Guías: [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md) y
[docs/production-runbook.md](docs/production-runbook.md) (variables obligatorias, backups, rollback,
rotación de secretos).

---

## 11. Cómo registrar un cambio

Cada vez que se modifique el repositorio, **agregar una entrada al inicio** de la sección 12
(orden cronológico inverso: lo más reciente arriba), con este formato:

```markdown
### YYYY-MM-DD — Título corto del cambio

- **Autor:** Nombre (o "Claude Code" / "Codex" + quien lo solicitó)
- **Commit(s):** `abc1234`
- **Tipo:** feat | fix | refactor | docs | chore | security | deploy
- **Qué se hizo:** descripción concreta de los cambios.
- **Por qué:** el problema o la necesidad que lo motivó.
- **Archivos/áreas afectadas:** rutas principales.
- **Impacto:** migraciones necesarias, variables de entorno nuevas, cambios de API,
  recursos RBAC nuevos, pasos manuales de despliegue. Escribir "Ninguno" si no hay.
```

**Además, si el cambio modifica una decisión de arquitectura, actualizar también la sección 5** en el
mismo commit. La sección 5 describe el estado actual del sistema; la sección 12 describe la historia.

---

## 12. Registro de cambios

> **Nota sobre el histórico:** las entradas anteriores a la creación de esta bitácora (2026-08-10)
> fueron reconstruidas a partir del historial de Git y del estado del código. Los mensajes de commit
> originales eran breves, por lo que el campo "Por qué" de esas entradas es una reconstrucción
> razonada, no una cita textual del autor. A partir de la creación de esta bitácora, cada entrada
> debe escribirse en el momento del cambio.

---

### 2026-08-18 — Pulido final: ícono de check-in decorativo y fade de errores del modal de demo

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `polish`, cerrando
  las dos notas P3 restantes de la auditoría de motion)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:**
  1. **`online-check-in.html`:** se agregó `aria-hidden="true"` al ícono decorativo
     `<i class="pi pi-check">` dentro de `.online-confirmation > div` (estado final de
     "Check-in preparado"). El encabezado y el párrafo adyacentes ya comunican el mismo mensaje de
     éxito en texto, así que el ícono era redundante para lectores de pantalla — igual al patrón ya
     usado en el ícono equivalente de `/reservar/confirmacion/:reservationId`
     (`allied-booking-confirmation.html`), que ya lo tenía. No se tocó su animación
     (`online-confirmation-icon-enter`, opacity + scale), tamaño, color ni ningún otro atributo.
  2. **`landing.css`:** los mensajes de error de campo (`.field-error`) dentro del formulario de
     "Solicitar demo" aparecían de forma instantánea, a diferencia del mismo tipo de mensaje en el
     flujo de reserva (`.booking-hint-error`) y en check-in online (`.online-field small`), que ya
     tenían un fade de solo opacidad. Se agregó `animation: wayra-modal-fade 0.16s ease-out both;`
     a `.field-error` — reutilizando el keyframe `wayra-modal-fade` (`opacity: 0 → 1`, sin
     `transform`) que ya existía en este mismo archivo para el fondo del modal de demo, en vez de
     declarar uno nuevo. 160ms, dentro del rango de ~150-180ms pedido; sin traslado, sin shake, sin
     animación de layout. `*ngIf`, `[attr.aria-invalid]` y `[attr.aria-describedby]` en el formulario
     de demo no se tocaron — siguen actualizándose de forma síncrona en el template, así que la
     disponibilidad del error para tecnología de asistencia no depende de que la animación termine.
     Bajo `prefers-reduced-motion`, la regla ya existente y sin cambios `.wayra-landing *,
     .wayra-landing *::before, .wayra-landing *::after { animation: none !important; ... }` cubre
     `.field-error` automáticamente por ser un selector universal descendiente — no hizo falta
     tocar el bloque de reduced-motion.
- **Qué NO se tocó, deliberadamente:** el cierre del FAQ vía Web Animations API con `height`, los
  spinners preexistentes (`pi-spin`) que quedan estáticos bajo reduced-motion, y los fondos de líneas
  decorativos del hero en `landing.css`/`allied-hotels.css`/`online-check-in.css` — los tres son
  advisories ya documentados y aceptados en la auditoría de motion previa, y el brief de este pase
  pidió explícitamente no tocarlos.
- **Por qué:** cerrar las dos notas P3 restantes de la auditoría de motion (`2026-08-17`) para dejar
  el sistema de motion público sin inconsistencias pendientes conocidas.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/online-check-in/online-check-in.html`,
  `frontend/src/app/components/pages/landing/landing.css`.
- **Impacto:** sin migraciones, sin cambios de API/RBAC, sin cambios de color, tipografía, copy,
  routing, validación, manejo de foco, tokens compartidos ni dark mode. No se tocaron las otras rutas
  públicas ni ninguna animación existente fuera de este fade puntual. Validado con `tsc --noEmit`
  limpio, `ng build --configuration=development` exitoso, y el detector mecánico de la skill sin
  hallazgos en los dos archivos tocados. Con esto quedan cerrados todos los hallazgos accionables (P2
  y P3) de la auditoría de motion del `2026-08-17`.

---

### 2026-08-18 — Fix de regresión de layout en la confirmación de /check-in-online

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `polish`, corrigiendo
  una regresión visual real reportada tras la entrada anterior de `delight`)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el bloque "Ten a la mano" agregado en la entrada anterior rompía visualmente el
  estado final de confirmación: el título se solapaba con el botón "Volver al inicio", y la
  referencia/hotel/fechas colapsaban en una columna angosta con el texto partido letra por letra,
  desbordando fuera de la tarjeta. Investigado con capturas reales (Chrome headless local,
  `--screenshot` + `--virtual-time-budget` para dejar correr las animaciones antes de capturar, ya
  que no hay `chromium-cli`/Playwright en este entorno) contra un harness HTML aislado que carga los
  mismos `online-check-in.css`/`public-tokens.css` — permitió ver el bug real en vez de adivinar por
  el código.
  - **Causa raíz confirmada:** `.online-confirmation > div` (el ícono de éxito) era un selector por
    combinador de hijo directo, no una clase dedicada. El nuevo `<div class="online-confirmation-
    reminder">` que agregó la entrada anterior **también** es un hijo directo `<div>` de
    `.online-confirmation`, así que ese selector lo capturaba a él también — heredaba el tamaño fijo
    de 46×46px, `display: inline-grid` y el fondo azul sólido del ícono. Eso explica cada síntoma
    reportado: el ancho de 46px forzaba el colapso/wrap letra por letra de todo su contenido, y
    `inline-grid` (en vez de `block`) hacía que ya no forzara un salto de línea, dejando que
    "Volver al inicio" (el siguiente hermano, también inline) se acomodara en la misma fila.
  - **Fix:** se agregó la clase dedicada `.online-confirmation-icon` al `<div>` del ícono en
    `online-check-in.html`, y se renombró el selector en `online-check-in.css` de
    `.online-confirmation > div` a `.online-confirmation-icon` — mismo patrón que ya usaba
    correctamente `/reservar/confirmacion` (`.booking-confirmation-icon`), que nunca tuvo este
    problema porque ya usaba una clase dedicada desde el principio.
  - Aprovechando que ya estaba diagnosticando con capturas reales, se rehizo la estructura interna
    del bloque "Ten a la mano" según el layout que pidió el usuario explícitamente: en vez de tres
    "chips" de igual peso en una sola fila `flex-wrap` (que fue lo que originalmente colapsaba), ahora
    es una pila de filas (`display: grid; gap:...`): una fila "Referencia" (etiqueta arriba, valor +
    botón "Copiar" abajo, con texto visible en el botón en vez de solo ícono) y una fila de contexto
    con hotel/fechas que se envuelven lado a lado cuando hay espacio y se apilan en móvil. Se
    reemplazó `overflow-wrap: anywhere` (que permite cortar entre cualquier par de caracteres) por
    `overflow-wrap: break-word` (corta solo como último recurso, respetando límites de palabra) en
    todos los elementos de texto nuevos, y se agregó `flex: 0 0 auto` a los íconos y al botón de
    copiar para que nunca se encojan. `min-width: 0` se usó donde correspondía (en los contenedores
    flex que necesitan poder encoger para envolver texto), no como sustituto del layout.
  - El bloque sigue **deliberadamente fuera** de la secuencia de animación de entrada (sin
    `animation`, sin delay) — eso no cambió respecto a la entrada anterior.
- **Verificación real, no solo de código:** con el fix aplicado, se volvió a capturar el mismo harness
  HTML con un código de referencia artificialmente largo (`WYR-2458-EXTRALONGCODE`) y un nombre de
  hotel largo (`Hotel Casa Aurora Cartagena Centro Historico`) a 1440px (desktop) y 834px (tablet):
  en ambos, todo el contenido queda contenido dentro de la tarjeta, la referencia se lee completa en
  una línea junto al botón "Copiar", el hotel y las fechas se muestran como filas legibles (no pills
  angostas), "Ten a la mano" es un rótulo horizontal separado con claridad de "Volver al inicio", y
  el CTA queda en su propia zona sin solaparse con nada. A 390px (móvil) apareció un desbordamiento
  horizontal, pero se confirmó reproduciéndolo en un harness de control **sin** el bloque nuevo (solo
  el párrafo y el botón que ya existían antes de la entrada de `delight`) — el mismo desbordamiento
  aparece igual, lo que descarta que lo haya introducido este cambio; es una limitación del harness
  de prueba aislado (le faltan resets/estilos base globales de `styles.css` que la app real sí carga
  siempre), no una regresión real de esta página. No se investigó más a fondo por quedar fuera del
  alcance de esta corrección puntual.
- **Por qué:** corregir una regresión visual real y bloqueante reportada explícitamente por el
  usuario tras la entrada anterior, sin retirar la funcionalidad útil de copiar código que ya se
  había agregado.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/online-check-in/online-check-in.html`,
  `online-check-in.css`. `online-check-in.ts` no cambió en este pase.
- **Impacto:** sin migraciones, sin cambios de API/RBAC, sin cambios de routing ni de las etapas de
  búsqueda/formulario (no tocadas). Se preservó la funcionalidad de copiar código, el feedback
  accesible (`role="status" aria-live="polite"`, siempre presente en el DOM), el manejo de foco, el
  ícono de éxito `aria-hidden`, la animación de entrada existente y el comportamiento de
  `prefers-reduced-motion` (sin cambios en el bloque `@media` correspondiente). Validado con
  `tsc --noEmit` limpio, `ng build --configuration=development` exitoso, el detector mecánico de la
  skill sin hallazgos nuevos, y verificación visual real con capturas de Chrome headless local (no
  solo lectura de código) en desktop y tablet — primera vez en esta serie de tareas que se logró
  verificación visual real, aprovechando un Chrome ya instalado en la máquina que no se había
  detectado como opción hasta ahora.

---

### 2026-08-18 — "Ten a la mano" con copiar código en /check-in-online

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `delight`, acotado a
  1-2 mejoras útiles, no decorativas)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** en el estado final de "Check-in preparado" (después de que
  `OnlineCheckInService.submitOnlineCheckIn` responde con éxito), se agregó un bloque compacto "Ten a
  la mano" con el código de reserva (copiable), el hotel y las fechas — todos datos ya devueltos por
  el propio backend en `this.confirmation` (`OnlineCheckInResponse`: `hotel_name`,
  `expected_check_in`, `expected_check_out`), sin inventar número de habitación, hora de check-in ni
  ningún estado de disponibilidad que el backend no devolvió. Se implementó como un único elemento
  cohesivo (no como dos mejoras separadas) para no duplicar la reafirmación de "próximos pasos" que
  ya existe en el párrafo de arriba, y para no exceder el límite de "máximo 1-2 mejoras" del brief.
  - `online-check-in.ts`: `clipboardSupported` (getter, igual patrón que la entrada anterior de
    `/reservar/confirmacion`), `copyFeedback` y `copyReservationCode()` — copia
    `this.reservationCodeLabel` (el código ya normalizado que el propio párrafo de confirmación ya
    muestra) vía `navigator.clipboard.writeText()`. Éxito → `copyFeedback = 'Código copiado.'`, se
    limpia solo a los 2.5s. Fallo o Clipboard API no disponible → no pasa nada visible, el código
    sigue siendo texto plano seleccionable a mano.
  - `online-check-in.html`: nuevo bloque `.online-confirmation-reminder` dentro de
    `#online-check-in-confirmation` (después del párrafo existente, antes de "Volver al inicio"), con
    tres chips (código + botón copiar, hotel, fechas) y un `<span role="status" aria-live="polite">`
    **siempre presente en el DOM** para el feedback — mismo patrón de accesibilidad ya usado en
    `/reservar/confirmacion` (la región debe existir antes de que cambie su texto para que los
    lectores de pantalla la anuncien de forma confiable). El botón de copiar solo se renderiza si
    `clipboardSupported` es verdadero. El párrafo de reafirmación existente
    ("...Un recepcionista verificará la identidad de cada huésped y confirmará el check-in a su
    llegada.") no se tocó ni una palabra.
  - `online-check-in.css`: el nuevo bloque queda **deliberadamente fuera** de la secuencia de entrada
    de tres pasos ya implementada (ícono → encabezado/copy → acción) — sin `animation`, sin delay,
    aparece junto con el resto del contenido ya asentado, en vez de sumar un cuarto paso a la
    secuencia. El botón de copiar tiene su propio press-feedback (`:active { transform: scale(0.92)
    }`, ya que no hereda nada del sistema compartido `.online-primary`/`.online-secondary`) y su
    hover se agregó al mismo `@media (hover: hover) and (pointer: fine)` ya usado por esos botones en
    esta página. El `<i class="pi pi-check">` del ícono de éxito no se tocó — sigue `aria-hidden`,
    sin anillos, destellos ni efectos repetidos.
- **Por qué:** pedido explícito del usuario de reafirmación útil y específica para el momento en que
  el huésped termina de enviar su check-in online — poder guardar el código con un clic, y ver de un
  vistazo el hotel/fechas ya verificados, es justo el tipo de detalle "considerado" que pedía el
  brief, sin decoración ni animación adicional, y sin implicar que el check-in físico ya quedó hecho.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/online-check-in/online-check-in.html`,
  `online-check-in.ts`, `online-check-in.css` (archivo exclusivo de esta página, sin necesidad de
  scoping entre rutas).
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC, sin cambios de
  routing, validadores, prellenado de huéspedes ni del payload/manejo de respuesta del backend. No se
  agregó ninguna librería (Clipboard API nativa). Validado con `tsc --noEmit` limpio, `ng build
  --configuration=development` exitoso (tras corregir un error real de AOT: el compilador de plantillas
  de Angular sí requiere `confirmation?.` incluso dentro de un `*ngIf` compuesto con `&&` sobre el
  mismo campo — el hint del editor que sugería quitar el `?.` era válido solo como diagnóstico
  extendido, no como lo que el compilador de build exige; se revirtió esa simplificación), y el
  detector mecánico de la skill sin hallazgos nuevos (mismo advisory preexistente del fondo del hero,
  sin relación). No se verificó visualmente en navegador: no hay `chromium-cli`/Playwright
  disponibles en este entorno.

---

### 2026-08-18 — Copiar referencia de reserva en /reservar/confirmacion/:reservationId

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `delight`, acotado a
  1 mejora útil, no decorativa)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** se agregó un botón "Copiar referencia" junto al chip de referencia
  (`Referencia #{{ reservationId }}`) en el estado final de confirmación de la solicitud de reserva.
  - `allied-booking-confirmation.ts`: nuevo método `copyReservationReference()` que escribe
    `this.reservationId` (el id crudo, sin el prefijo `#` que se muestra en pantalla, para que se
    pueda pegar directamente en un correo o formulario) vía `navigator.clipboard.writeText()`. Si
    tiene éxito, `copyFeedback` se llena con "Referencia copiada." y se limpia solo a los 2.5s
    (`setTimeout` con limpieza del temporizador anterior si se hace clic varias veces seguidas). Si
    falla (permiso denegado, contexto no seguro, etc.) no se muestra nada — no hay nada que recuperar
    porque la referencia ya está visible como texto plano de todas formas. Nuevo getter
    `clipboardSupported` que verifica `navigator.clipboard` antes de intentar cualquier cosa.
  - `allied-booking-confirmation.html`: el botón (`<button class="booking-copy-reference"
    [attr.aria-label]="'Copiar referencia ' + reservationId">`) solo se renderiza si
    `clipboardSupported` es verdadero (`*ngIf`) — en navegadores sin la Clipboard API, o en un
    contexto no seguro, el botón simplemente no aparece y la referencia sigue siendo texto plano
    seleccionable a mano, sin depender de JavaScript para seguir siendo útil. El feedback vive en un
    `<span role="status" aria-live="polite">` **siempre presente en el DOM** (nunca envuelto en
    `*ngIf`) con solo su texto interpolado (`{{ copyFeedback }}`) cambiando — necesario para que los
    lectores de pantalla anuncien el cambio de forma confiable, ya que muchos no anuncian una región
    `aria-live` que se inserta en el DOM al mismo tiempo que ya trae contenido. El foco nunca se
    mueve: el botón permanece enfocado después del clic, el `aria-live` solo anuncia, no roba foco.
  - `allied-booking.css`: `.booking-copy-reference` (28×28px, transparente, ícono `pi-copy`
    `aria-hidden`, con press-feedback propio `:active { transform: scale(0.92) }` ya que no hereda
    nada del sistema compartido de botones `.booking-primary`/`.booking-secondary`) y
    `.booking-copy-status` (reserva `min-height: 1.15rem` siempre, para que el texto de feedback no
    empuje las acciones de abajo al aparecer/desaparecer — sin transición, el cambio de texto no se
    anima, tal como pedía el brief). El hover de `.booking-copy-reference` se agregó al mismo
    `@media (hover: hover) and (pointer: fine)` ya usado por el resto de la página. `.booking-page
    *` (reduced-motion, sin cambios) neutraliza su `transition` de la misma forma que el resto de
    la página.
  - No se agregó ninguna secuencia de entrada nueva, ni se tocó la animación existente del ícono de
    éxito, el encabezado, los chips de detalle ni las acciones — la única entrada visible sigue
    siendo la misma de tres pasos (ícono → encabezado/copy → detalles) ya implementada.
- **Por qué:** pedido explícito del usuario de un único detalle de "micro-delight" genuinamente útil
  para el momento de confirmación — copiar la referencia es lo que un huésped haría de inmediato
  para guardarla o reenviarla, y hacerlo un clic en vez de seleccionar texto a mano es justo el tipo
  de detalle "considerado" que pedía el brief, sin decoración ni animación adicional.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.html`,
  `allied-booking-confirmation.ts`, `allied-booking.css` (compartido; las tres clases nuevas —
  `.booking-reference-chip`, `.booking-copy-reference`, `.booking-copy-status` — son exclusivas de
  esta página, verificado con `grep` contra las otras 3 plantillas del flujo).
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC, sin cambios de
  routing ni de copy existente. No se agregó ninguna librería ni dependencia (usa la Clipboard API
  nativa del navegador). El nombre del hotel, la referencia y las fechas siguen siendo exactamente
  los mismos datos ya mostrados — no se inventó ningún estado de disponibilidad, precio ni
  confirmación por parte del hotel. Las otras 3 rutas del flujo no se vieron afectadas (verificado
  con `grep` y por diff — sus archivos no cambiaron en este pase). Validado con `tsc --noEmit`
  limpio, `ng build --configuration=development` exitoso, y el detector mecánico de la skill sin
  hallazgos. No se verificó visualmente en navegador: no hay `chromium-cli`/Playwright disponibles en
  este entorno (mismo motivo que entradas anteriores).

---

### 2026-08-18 — Hover guards pendientes en /hoteles-aliados, el flujo de reserva y /check-in-online

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, pase
  correctivo puntual sobre los hallazgos P2 de "hover sin proteger" de la auditoría de motion previa)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** tres reglas `:hover` con `transform`/color que ya existían antes de esta serie de
  sesiones de `animate` no estaban protegidas con `@media (hover: hover) and (pointer: fine)`, a
  diferencia del patrón que la landing ya seguía correctamente. Sin ese guard, tocar la tarjeta o el
  botón en iOS/iPadOS Safari puede dejarlo visualmente "pegado" en su estado de hover (elevado,
  recoloreado) hasta el siguiente toque en otro lugar. Se movieron las tres, sin cambiar ninguna
  propiedad, duración ni color — solo el lugar donde vive la regla:
  - `.allied-card:hover` (`allied-hotels.css`, antes en la línea 347 suelta): la elevación
    `translateY(-3px)` + `border-color` + `box-shadow` ahora vive junto al zoom de imagen que ya
    estaba protegido (`.allied-card:hover .allied-card-media img`), dentro del mismo
    `@media (hover: hover) and (pointer: fine)`.
  - `.booking-primary:hover`/`.booking-secondary:hover` (`allied-booking.css`, compartida por las 4
    rutas del flujo de reserva): se movieron al `@media (hover: hover) and (pointer: fine)` que ya
    existía para `.booking-result-card`/`.booking-rate-select-card`. `:active`
    (`translateY(0)` al soltar) y `:disabled`/`:disabled:hover` (dim + `cursor: not-allowed`) se
    dejaron exactamente donde estaban, sin guard, porque deben aplicar sin importar el tipo de
    puntero.
  - `.online-primary:hover`/`.online-secondary:hover` (`online-check-in.css`, que no tenía ningún
    bloque `hover: hover` todavía): se creó el bloque y se movieron las tres reglas relacionadas
    (`transform` compartido + los colores/`filter` propios de cada botón) tal cual estaban. El fix de
    contraste WCAG-AA documentado en `.online-primary` (usa `--primary-hover` como color base, no
    `--primary`, para superar 4.5:1) sigue intacto: el hover sigue usando el mismo
    `background: var(--primary-hover)` de base más `filter: brightness(0.92)` para leerse como
    "hovered" pese a que el color base ya es el token "hover".
  - No se tocó ninguna animación de entrada/reveal ya implementada en las 4 rutas del flujo de
    reserva, la landing (que ya seguía el patrón correcto) ni `/check-in-online`; tampoco se tocó
    `prefers-reduced-motion` en ningún archivo — el bloque `@media (prefers-reduced-motion: reduce)`
    de cada hoja ya neutraliza `transition-duration`/`transform` globalmente (`.booking-page *`,
    `.online-checkin-page *`), así que sigue cubriendo estas reglas relocalizadas sin cambios.
  - No se tocó ningún `.html`/`.ts` — fue exclusivamente una corrección de scoping en CSS.
- **Por qué:** hallazgo P2 de la auditoría de motion (`2026-08-17`): `.allied-card:hover` sin
  proteger era una regresión relativa al propio precedente sentado por esta sesión (las tarjetas
  equivalentes del flujo de reserva sí quedaron protegidas), y los botones primarios/secundarios de 3
  de las 4 hojas de estilo públicas repetían el mismo patrón sin proteger, mientras que
  `landing.css` ya lo hacía bien.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `frontend/src/app/components/pages/online-check-in/online-check-in.css`.
- **Impacto:** sin migraciones, sin cambios de API/RBAC, sin cambios de color, tipografía, layout,
  routing, copy ni tokens compartidos. `:focus-visible` (regla global de cada página, no tocada),
  `:disabled`/`:disabled:hover` y `:active` siguen activos independientemente de la capacidad de
  hover del dispositivo. Validado con `tsc --noEmit` limpio, `ng build --configuration=development`
  exitoso, el detector mecánico de la skill sin hallazgos nuevos (los dos advisories preexistentes
  del fondo decorativo del hero siguen ahí, sin relación con este cambio), y una barrida final por
  `grep` confirmando que no queda ninguna copia sin proteger de las tres reglas movidas en ninguno de
  los tres archivos.

---

### 2026-08-18 — Recuperación de navegación fallida al elegir tarifa en /reservar/tarifas/:slug

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `harden`, siguiendo
  el hallazgo P2 de la auditoría de motion de la sesión anterior)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `selectRoomRate()` en `allied-booking-rates.ts` marca `selectingRateId` con el id
  de la tarifa elegida (para mostrar "Abriendo..." y deshabilitar todos los botones "Elegir tarifa"
  mientras se navega a `/reservar/solicitud/:slug/:rateId`) y antes solo lo limpiaba dentro de un
  `.then((navigated) => { if (!navigated) ... })`. Si la promesa de `Router.navigate()` se
  **rechazaba** en vez de resolver en `false` — caso real: el chunk lazy de la siguiente ruta falla
  al descargarse por una caída de red — ese `.then()` nunca corría, `selectingRateId` quedaba fijo
  para siempre, y como `selectRoomRate()` bloquea cualquier clic mientras ese valor no es `null`,
  **todos** los botones "Elegir tarifa" quedaban deshabilitados sin mensaje y sin forma de
  recuperarse salvo recargar la página completa. Se reemplazó la cadena por
  `.catch((error) => { console.error(...); return false; }).finally(() => { this.selectingRateId =
  null; })`: el `catch` evita que el rechazo quede como "unhandled promise rejection" (y lo deja
  registrado en consola para diagnóstico) sin inventar un mensaje visible que le eche la culpa al
  backend o al hotel — es una falla de navegación del cliente, no de datos — y el `finally` garantiza
  que el estado se libere en los tres desenlaces posibles (navegación exitosa, bloqueada por un
  guard, o la falla capturada arriba), así que el usuario siempre puede volver a intentar sin
  recargar. En una navegación exitosa, limpiar la bandera es inofensivo: el router ya está destruyendo
  este componente para cuando la promesa se resuelve, así que no hay parpadeo visible.
- **Por qué:** hallazgo P2 de la auditoría de motion (`2026-08-17`, sección BOOKING FLOW /
  STATE TRANSITIONS): el guard de estado `selectingRateId` agregado durante el pase de animate de
  esta ruta introdujo un punto de fallo silencioso que no existía antes (el código previo a esa
  sesión no tenía ningún guard de estado en este botón).
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.ts` únicamente.
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API. No se tocó la ruta de
  destino, los query params, la lógica de selección de tarifa, los datos/precios/disponibilidad, la
  secuencia de requests, ninguna animación, el comportamiento de `prefers-reduced-motion`, ni el
  hover de las tarjetas (explícitamente fuera de alcance de este pase). No se agregó ningún estado de
  error visible nuevo: el único patrón de error ya existente en este componente
  (`hotelsLoadError`/`hotelsLoadErrorContext`) reemplaza toda la grilla de tarifas, lo cual no encaja
  para una falla de navegación puntual de una tarjeta — forzarlo habría ocultado el resto de tarifas
  ya cargadas que el usuario sí puede seguir eligiendo. Validado con `tsc --noEmit` limpio y
  `ng build --configuration=development` exitoso.

---

### 2026-08-17 — Animación funcional en /check-in-online

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, brief
  detallado enfocado en motion funcional para búsqueda de reserva, progresión del formulario de
  huéspedes, validación, envío y confirmación)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el flujo público de check-in online
  (`frontend/src/app/components/pages/online-check-in/online-check-in.{html,ts,css}`) no tenía
  ninguna transición: la sección de datos de huéspedes aparecía de golpe tras verificar la reserva,
  los mensajes de validación por campo y los errores de búsqueda/envío aparecían sin transición, y la
  confirmación final no tenía ninguna jerarquía visual. A diferencia de las cinco entradas
  anteriores de esta sesión, `online-check-in.css` **no es un archivo compartido** (solo lo usa este
  componente), así que no hizo falta ningún scoping especial ni clases nuevas para evitar tocar otras
  rutas. Cambios:
  - Sección de datos de huésped (`.online-guest-card`, ya tenía esa clase en el `<form
    *ngIf="codeConfirmed">`): entrada única (opacity + `translateY(8px)`, 280ms
    `cubic-bezier(0.16,1,0.3,1)`) cuando la búsqueda de reserva tiene éxito. Todo lo de adentro
    (fieldsets "Datos personales", "Documento de identidad", "Contacto", "Llegada", "Contacto de
    emergencia", "Consentimiento", y cada tarjeta de huésped cuando la reserva tiene varios) viaja
    junto con esa única animación del contenedor — nada se anima individualmente ni con su propio
    delay, tal como pedía explícitamente el brief ("no stagger guest controls/fieldsets/legends/
    hints", "guest cards must never have to wait"). El `scrollIntoView` + `focus({preventScroll:
    true})` ya existentes en `continueWithCode()` siguen disparándose de forma síncrona, sin depender
    de que la animación termine — el contenido es focuseable y queda en el árbol de accesibilidad de
    inmediato porque la animación es solo opacity/transform, nunca `visibility`/`display`.
  - Chip "Reserva verificada" (`.online-reservation-chip`, hotel + fechas): su propio fade sutil
    (mismo keyframe, 260ms, 40ms de delay sobre el contenedor) ya que se monta una sola vez junto con
    el formulario y no se re-anima mientras el huésped edita campos. Las fechas y el nombre del hotel
    son texto plano dentro del chip, no se animan por separado.
  - Errores de campo, de casilla de consentimiento y los dos banners de nivel de formulario
    (`#online-check-in-lookup-error`, `#online-check-in-error`): un solo fade de **solo opacidad**
    (160ms) para los tres casos — es el tratamiento más restringido pedido por la sección de
    VALIDACIÓN del brief (campo por campo), y como "short fade-in"/"fade in quickly" (búsqueda y
    envío) no exigían movimiento, aplicar el mismo tratamiento en todos lados mantiene el flujo
    consistente sin fragmentar el comportamiento entre mensajes de apariencia similar. Los hints
    estáticos (`id` termina en `-hint`) quedaron explícitamente excluidos y siguen sin animar, como
    ya lo distinguía el CSS existente por color/peso. `aria-invalid`/`aria-describedby` se siguen
    actualizando de forma síncrona vía los bindings de Angular ya existentes.
  - Botones "Buscar reserva"/"Enviar check-in"/"Limpiar" (`.online-primary`, `.online-secondary`,
    compartidos solo dentro de esta página): se agregó `opacity` a su `transition` ya existente para
    que el dim de `:disabled` durante una búsqueda o un envío se sienta suavizado en vez de
    instantáneo. Se preservó intacto el fix de contraste ya documentado en el CSS
    (`--primary-hover` en vez de `--primary` para el texto blanco del botón primario). Sin spinner
    nuevo (no existía uno).
  - Confirmación final (`#online-check-in-confirmation`, `*ngIf="submitted"`): secuencia de tres
    pasos igual a la ya usada en `/reservar/confirmacion` — (1) el ícono de check: opacity +
    `scale(0.94→1)`, 280ms, sin delay; (2) encabezado "Check-in preparado" + párrafo, como un grupo:
    mismo fade+`translateY(8px)`, 300ms, delay 50ms; (3) el enlace "Volver al inicio": mismo fade,
    delay 100ms (tope total de stagger en 100ms, dentro del límite de ~100-120ms pedido). Sin
    confeti, bounce, pulso ni loop. El selector del paso 3 se escribió como `.online-confirmation a`
    (no `.online-primary` a secas) porque esa misma clase también es el botón de "Buscar reserva" y
    el de "Enviar check-in" en otras partes de esta página — deben quedar siempre visibles desde la
    carga, sin heredar el delay de esta secuencia.
  - Se agregó el bloque `@media (prefers-reduced-motion: reduce)` que faltaba por completo en este
    archivo (`animation: none`, `transition-duration/delay: 0s`, `scroll-behavior: auto` para todo
    `.online-checkin-page *`), y se hicieron los tres `scrollIntoView({behavior:'smooth'})` ya
    existentes en `online-check-in.ts` (guest section, confirmación, error de envío) sensibles a
    `prefers-reduced-motion` (nuevo método privado `prefersReducedMotion()`), mismo patrón ya usado
    en `landing.ts` y `allied-hotels.ts`.
- **Por qué:** pedido explícito del usuario de motion puramente funcional para este flujo —
  progreso y cambios de estado, nunca decoración — con instrucciones detalladas por zona y la
  restricción explícita de no convertir el formulario en un wizard ni animar campos/fieldsets
  individualmente.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/online-check-in/online-check-in.css`, `online-check-in.ts`.
  `online-check-in.html` no cambió (la clase `.online-guest-card` que se usó para el scoping ya
  existía en el template).
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia la
  lógica de `OnlineCheckInService` (lookup/submit), el payload al backend, la verificación de
  reserva, el prellenado de huéspedes, el comportamiento del `FormArray`, la semántica de
  fieldset/legend, ningún validador, el wiring ARIA, el manejo de foco, el copy en español, ni el
  comportamiento de confirmación-antes-de-reset de `resetFlow()` (que sigue sin animarse, tal como
  pedía el brief). Validado con `tsc --noEmit` limpio, `ng build --configuration=development`
  exitoso, y el detector mecánico de la skill (`detect.mjs`): un único hallazgo advisory
  pre-existente y fuera de alcance (el fondo de líneas decorativo del hero, igual al de las otras
  páginas públicas, no tocado). No se verificó visualmente en navegador: no hay
  `chromium-cli`/Playwright disponibles en este entorno (mismo motivo que entradas anteriores). Con
  esto quedan animadas las 6 rutas públicas de Wayra (landing, hoteles aliados, y las 4 del flujo de
  reserva) más este flujo de check-in online, todas compartiendo el mismo lenguaje visual
  (`fade-in` con `translateY(8px)`, easing `cubic-bezier(0.16,1,0.3,1)`, fades opacity-only para
  errores de campo) sin haberlas tocado en un mismo pase salvo cuando compartían archivo CSS.

---

### 2026-08-17 — Transición de confirmación en /reservar/confirmacion/:reservationId

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, brief
  detallado pidiendo una transición de cierre restringida y tranquilizadora, explícitamente no
  celebratoria)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el paso final del flujo (confirmación de que la solicitud de reserva se envió,
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.{html,ts}`, que
  comparte `allied-booking.css` con las otras 3 rutas del flujo) no tenía ninguna transición: el
  ícono de check, el encabezado/copy y los chips de hotel/referencia/fechas aparecían todos a la vez
  sin ninguna jerarquía visual. A diferencia de las cuatro entradas anteriores, esta vez **no hizo
  falta tocar ni el HTML ni el TS** de la página: `.booking-confirmation-icon`,
  `.booking-confirmation-copy` y `.booking-confirmation-details` ya son clases exclusivas de esta
  página (verificado con `grep` contra los otros 3 templates), así que toda la animación se escribió
  directamente sobre esas reglas ya existentes en `allied-booking.css`, sin necesidad de scoping ni
  de clases nuevas. Cambios:
  - Secuencia de tres pasos (ícono → encabezado/copy → chips de detalle), tal como pedía
    explícitamente la sección "MESSAGE HIERARCHY" del brief, con el delay del último paso en 100ms
    (dentro del tope de ~100-120ms pedido):
    1. `.booking-confirmation-icon`: reveal de una sola vez, opacity 0→1 + `scale(0.94→1)` (nuevo
       keyframe `booking-confirmation-icon-enter`), 280ms, sin delay. Sin bounce, spring, pulso,
       confeti ni loop. El ícono (`<i class="pi pi-check" aria-hidden="true">`) sigue siendo
       puramente decorativo y `aria-hidden`, sin cambios ahí.
    2. `.booking-confirmation-copy` (kicker "Próximos pasos" + encabezado "El hotel revisará tu
       solicitud" + párrafo explicativo, como un solo bloque — representan juntos el "encabezado
       principal" del brief): reutiliza el keyframe `booking-fade-in` ya definido para el resto del
       flujo (opacity + `translateY(8px)`), 320ms, delay 50ms.
    3. `.booking-confirmation-details` (chips de hotel/referencia/fechas, `*ngIf="hasConfirmation
       Details"`): mismo `booking-fade-in`, 300ms, delay 100ms. Los chips se animan como **un solo
       grupo**, no individualmente; el número de referencia dentro del chip no se anima por
       separado (sin count-up ni efecto de tipeo).
  - No se tocó `.booking-confirmation-page` (la tarjeta contenedora) en sí: queda visible de
    inmediato con su borde/sombra/fondo — solo su contenido hace el cascade de tres pasos descrito
    arriba, que ya cumple con "la región principal entra con un fade + translateY pequeño" sin
    duplicar la animación en dos capas (tarjeta completa + contenido) ni arriesgar el efecto de
    opacidad compuesta que eso generaría.
  - No se tocaron `.booking-primary`/`.booking-secondary` (botones "Buscar otro alojamiento"/"Ver
    hoteles aliados"): el brief pedía el mismo feedback de hover/focus/press "ya establecido en otras
    partes", y esas reglas compartidas ya lo tienen (hover con elevación, active, foco visible vía
    `.booking-page :focus-visible`, min-height 48px ≥ 44px) — no había nada que agregar sin tocar
    las otras 3 rutas que también usan esas clases.
  - No se tocó `ngAfterViewInit()` (el foco programático en `#confirmationRegion`) ni el
    `aria-live="polite"` del `<section>`: el foco y el anuncio al lector de pantalla ocurren de
    inmediato como antes, independientes de que el contenido visual todavía esté a mitad de su
    fade — las animaciones son puramente de opacidad/transform en CSS, nunca `visibility:hidden` ni
    `display:none`, así que nunca ocultan el contenido del árbol de accesibilidad.
  - No se tocó el bloque `@media (prefers-reduced-motion: reduce)`: ya cubre todo `.booking-page *`
    desde dos entradas atrás, así que neutraliza automáticamente el scale del ícono, los `translateY`
    y los tres delays de esta entrada sin cambios adicionales.
- **Por qué:** pedido explícito del usuario de una transición de cierre profesional y tranquilizadora
  que refuerce que la SOLICITUD fue enviada (sin insinuar que el hotel ya confirmó la reserva), sin
  nada celebratorio/gamificado, y con la restricción explícita de no modificar `/reservar`,
  `/reservar/tarifas` ni `/reservar/solicitud` en este pase.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-booking/allied-booking.css`
  (compartido; las tres clases tocadas son exclusivas de esta página, ver nota arriba).
  `allied-booking-confirmation.html` y `.ts` no cambiaron.
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia el copy
  ("Solicitud enviada" / "El hotel revisará tu solicitud"), el nombre del hotel, la referencia de la
  solicitud, las fechas, el manejo de foco, las acciones ni su routing. Las otras 3 rutas del flujo
  no deberían verse afectadas: se verificó con `grep` que `.booking-confirmation-icon`,
  `.booking-confirmation-copy` y `.booking-confirmation-details` no aparecen en ninguna otra
  plantilla, y que `allied-booking.html`, `allied-booking-rates.*` y `allied-booking-request.*`
  quedaron intactos en este pase. Validado con `tsc --noEmit` limpio, `ng build
  --configuration=development` exitoso, y el detector mecánico de la skill (`detect.mjs`) sin
  hallazgos. No se verificó visualmente en navegador: no hay `chromium-cli`/Playwright disponibles en
  este entorno (mismo motivo que entradas anteriores). Con esto quedan animadas las 4 rutas del flujo
  completo de reserva de hoteles aliados (`/reservar`, `/reservar/tarifas/:slug`,
  `/reservar/solicitud/:slug/:rateId`, `/reservar/confirmacion/:reservationId`), todas compartiendo
  el mismo lenguaje visual (`booking-fade-in`, `booking-hint-in`, easing
  `cubic-bezier(0.16,1,0.3,1)`, mismo bloque de `prefers-reduced-motion`) sin haberse modificado dos
  rutas en el mismo pase.

---

### 2026-08-17 — Animación funcional en /reservar/solicitud/:slug/:rateId

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, brief
  detallado enfocado en motion funcional para feedback de formulario, validación, resumen de
  contexto y envío)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el paso 3 del flujo de reserva (formulario de solicitud,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.{html,ts}`, que comparte
  `allied-booking.css` con las otras 3 rutas del flujo) no tenía transición en los mensajes de
  validación por campo, en el resumen de contexto (hotel/tarifa/fechas/huéspedes), en los estados de
  carga/error, ni en el error de envío del formulario. A diferencia de las dos entradas anteriores, el
  brief fue explícito en que el formulario en sí **no** debía animarse: nada de entrada por campo,
  nada de stagger, foco de teclado siempre inmediato e independiente de cualquier motion. Se aplicó el
  mismo criterio de scoping ya usado dos veces en esta sesión: `.booking-context-summary`,
  `.booking-hotel-card`, `.booking-form`, `.booking-inline-warning` son exclusivas de esta página
  (verificado con `grep` contra los otros 3 templates) y se tocaron directo; `.booking-empty`,
  `.booking-hint-error` y `.booking-primary` son compartidas, así que sus reglas nuevas se anidaron
  bajo un ancestro exclusivo (`.booking-form`) o detrás de una clase nueva agregada solo aquí
  (`booking-request-results`, `booking-request-submit`). Todos los keyframes reutilizan los ya
  definidos en las dos entradas anteriores (`booking-fade-in`, `booking-hint-in`) — mismo lenguaje
  visual en los tres pasos del flujo, cero CSS nuevo duplicado. Cambios:
  - Mensajes de validación por campo (`.booking-form .booking-hint-error`, nombre/correo/teléfono/
    tipo y número de documento): fade-in de **solo opacidad** (`booking-hint-in`, 160ms) — sin
    `translateY`, sin shake, sin movimiento horizontal, tal como pedía el brief para esta zona
    específicamente. `aria-invalid` y `aria-describedby` siguen actualizándose de forma síncrona vía
    los bindings de Angular ya existentes (`isInvalid()`); la animación es puramente visual sobre el
    `<small>`, no retrasa nada de accesibilidad.
  - Resumen de contexto: tanto los chips móviles/tablet (`.booking-context-summary`) como la tarjeta
    sticky de escritorio (`.booking-hotel-card`) — ambos representan el mismo "hotel/rate/date/guest
    context" que menciona el brief, solo en breakpoints distintos — usan `booking-fade-in` (opacity +
    `translateY(8px)`, 240ms). Ninguno de los dos se re-crea mientras el huésped edita campos
    posteriores del formulario (el `*ngIf` del `<section>` padre solo cambia cuando cargan los datos,
    no por cada tecla), así que la entrada se reproduce una sola vez por visita a este paso, nunca en
    cada edición.
  - Estados de carga/error/solicitud-incompleta (`.booking-request-results .booking-empty`, nueva
    clase agregada solo en los 3 wrappers `*ngIf` de esta página): mismo `booking-fade-in`.
  - Error de envío (`.booking-inline-warning`, ya tenía `role="alert"`): mismo `booking-fade-in`. Sin
    shake del formulario. El mensaje sigue siendo anunciado de inmediato por el lector de pantalla vía
    `role="alert"`, sin depender de que la animación termine.
  - Botón "Enviar solicitud de reserva" (nueva clase `booking-request-submit`, además de
    `booking-primary`): se le agregó `opacity` a su `transition` (mismo arreglo aplicado en las dos
    entradas anteriores a `.booking-search-submit`/`.booking-rate-select-cta`), para que el paso a
    `[disabled]="saving"` se sienta suavizado en vez de instantáneo. No se tocó `allied-booking-
    request.ts`: el estado `saving` que gatea el botón y el texto ("Enviando solicitud..." /
    "Enviar solicitud de reserva") ya existían y ya envuelven la petición HTTP real
    (`webReservationService.createWebReservation`), así que no hizo falta agregar lógica nueva. Sin
    spinner (no existía uno en este botón). No se agregó ningún retraso artificial: la navegación a
    `/reservar/confirmacion/:reservationId` en el `next` del `subscribe` sigue disparándose en cuanto
    la petición real resuelve, sin tocar esa rama de código.
  - No se tocó el bloque `@media (prefers-reduced-motion: reduce)`: ya quedó ampliado a todo
    `.booking-page *` dos entradas atrás, y esta página comparte esa misma raíz, así que ya cubre
    todas las animaciones nuevas de esta entrada sin cambios adicionales.
- **Por qué:** pedido explícito del usuario de motion puramente funcional para este paso —
  explicación de validación, envío y cambios de estado, nunca decoración — con instrucciones
  detalladas por zona del formulario y la restricción explícita de no modificar `/reservar`,
  `/reservar/tarifas` ni `/reservar/confirmacion` en este pase.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`,
  `allied-booking.css` (compartido; ver nota de scoping arriba). `allied-booking-request.ts` no
  cambió.
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia
  validadores de teléfono/documento, la validación dependiente del tipo de documento, los ids/
  bindings de `aria-invalid`/`aria-describedby`, el contexto de hotel/tarifa/fechas/huéspedes, el
  comportamiento sticky de escritorio, la lógica de envío, ni el routing a
  `/reservar/confirmacion/:reservationId`. Las otras 3 rutas del flujo no deberían verse afectadas: se
  verificó con `grep` que `booking-request-results` y `booking-request-submit` no aparecen en ninguna
  otra plantilla, que `.booking-context-summary`/`.booking-hotel-card`/`.booking-form`/
  `.booking-inline-warning` son exclusivas de esta página, y que `allied-booking.html`,
  `allied-booking-rates.*` y `allied-booking-confirmation.*` quedaron intactos en este pase (solo
  cambiaron en las dos entradas anteriores de esta misma sesión). Validado con `tsc --noEmit` limpio,
  `ng build --configuration=development` exitoso, y el detector mecánico de la skill (`detect.mjs`)
  sobre los archivos tocados sin hallazgos. No se verificó visualmente en navegador: no hay
  `chromium-cli`/Playwright disponibles en este entorno (mismo motivo que entradas anteriores).

---

### 2026-08-17 — Animación funcional en /reservar/tarifas/:slug

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, brief
  detallado enfocado en motion funcional, no decorativo)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el paso 2 del flujo de reserva (elegir habitación/tarifa,
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.{html,ts}`, que comparte
  `allied-booking.css` con las otras 3 rutas del flujo) tenía las mismas carencias que ya se habían
  corregido en el paso de búsqueda (ver entrada anterior): tarjetas de tarifa sin animación de
  entrada, hover sin proteger contra iOS/Safari, estados de carga/error sin transición, y el CTA de
  selección sin feedback de "en curso". Se aplicó el mismo criterio de scoping que en la entrada
  anterior: `.booking-rate-select-card`, `.booking-rate-select-cta` y `.booking-rates` son clases
  exclusivas de esta página (verificado con `grep` contra los otros 3 templates del flujo) y se
  pudieron tocar directamente; `.booking-empty` y `.booking-results-header > span` sí son
  compartidas, así que su fade-in se anidó bajo el ancestro exclusivo `.booking-rates` en vez de
  escribirse contra la clase compartida directamente. Cambios:
  - Tarjetas de tarifa (`.booking-rate-select-card`): entrada reutilizando el mismo keyframe
    `booking-result-enter` (opacity + `translateY(14px)`, 300ms `cubic-bezier(0.16,1,0.3,1)`) que ya
    se había definido para las tarjetas de hotel del paso 1 — mismo lenguaje visual entre los dos
    pasos del flujo — con el mismo stagger por `nth-child` (0/35/70/105/140ms, tope 140ms). Como
    `trackByIndex` remonta la lista completa cada vez que cambian las tarifas (nueva búsqueda o
    reintento), la entrada se reproduce en cada aparición real de resultados, no en renders menores.
  - Hover de tarjeta: `.booking-rate-select-card:hover` (elevación +3px, ya existía) estaba sin
    proteger — se movió, junto al mismo arreglo ya hecho para `.booking-result-card` en la entrada
    anterior, dentro de `@media (hover: hover) and (pointer: fine)`, y se agregó zoom sutil de imagen
    (`scale(1.03)`, 400ms) en el mismo hover, contenido por el `overflow: hidden` ya existente del
    contenedor (sin overflow ni layout shift). El ícono de fallback (cuando no hay foto de la
    habitación) no se tocó — sigue estático, sin loop.
  - CTA "Elegir tarifa" (`.booking-rate-select-cta`): se agregó `opacity` a su `transition` (la regla
    compartida `.booking-primary` no la incluye) para que el estado deshabilitado se sienta suave. Se
    agregó un campo nuevo `selectingRateId` en el componente: al hacer clic, se marca la tarifa en
    curso, se deshabilitan todos los botones del grid (evita una segunda navegación mientras la
    primera está en camino — la carga del chunk lazy de `/reservar/solicitud` no es instantánea) y el
    botón clickeado cambia su texto a "Abriendo..." hasta que `Router.navigate` resuelve; si la
    promesa resuelve en `false` (navegación cancelada, p. ej. por un guard) se libera el estado para
    permitir reintentar. Sin spinner: se mantiene el mismo criterio del paso 1 de preferir una
    transición de texto/opacidad corta en vez de motion continuo. La ruta de destino
    (`/reservar/solicitud/:slug/:rateId`) y sus query params no cambiaron.
  - Estados de carga/reintento/error/vacío y el contador de tarifas
    (`.booking-rates .booking-empty`, `.booking-rates .booking-results-header > span`): fade-in
    `booking-fade-in` (reutilizado del paso 1, opacity + `translateY(8px)`, 240ms) en cada cambio de
    estado. Ningún "shake" en los contenedores de error.
  - No se tocó el bloque `@media (prefers-reduced-motion: reduce)`: ya quedó ampliado a todo
    `.booking-page *` en la entrada anterior, y esta página comparte esa misma raíz `.booking-page`,
    así que ya cubre estas animaciones nuevas sin cambios adicionales.
- **Por qué:** pedido explícito del usuario de motion funcional para este paso, con instrucciones
  detalladas de duración/easing/stagger por zona y la restricción explícita de no modificar
  `/reservar`, `/reservar/solicitud` ni `/reservar/confirmacion` en este pase.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.html`,
  `allied-booking-rates.ts`, `allied-booking.css` (compartido; ver nota de scoping arriba).
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia los
  datos de hotel/tarifa, la lógica de disponibilidad/precio, el fallback honesto de disponibilidad,
  ni el routing a `/reservar/solicitud/:slug/:rateId` (mismo destino y query params, solo se agregó
  un guard contra doble clic). Las otras 3 rutas del flujo no deberían verse afectadas: se verificó
  con `grep` que `.booking-rate-select-card`, `.booking-rate-select-cta` y `.booking-rates` no
  aparecen en ninguna otra plantilla, y que ninguna otra plantilla ni componente fue tocado en este
  pase (`allied-booking.html`/`.ts`, `allied-booking-request.*` y `allied-booking-confirmation.*`
  quedaron intactos). Validado con `tsc --noEmit` limpio, `ng build --configuration=development`
  exitoso, y el detector mecánico de la skill (`detect.mjs`) sobre los archivos tocados sin
  hallazgos. No se verificó visualmente en navegador: no hay `chromium-cli`/Playwright disponibles en
  este entorno (mismo motivo que entradas anteriores).

---

### 2026-08-17 — Animación funcional en el paso de búsqueda de /reservar

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`, brief
  detallado enfocado en motion funcional, no decorativo)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el paso de búsqueda de hoteles aliados (`/reservar`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.{html,ts}`) no tenía transición
  en el panel de destino, en los estados de carga/error/vacío de resultados, ni en la aparición de
  las tarjetas de resultado, y su hover de tarjeta no estaba protegido contra iOS/Safari.
  **Complicación clave de esta página:** `allied-booking.css` es un archivo compartido — lo
  referencian también `allied-booking-rates.ts`, `allied-booking-request.ts` y
  `allied-booking-confirmation.ts` (las otras rutas del flujo de reserva), y varias clases
  (`.booking-empty`, `.booking-results`, `.booking-results-header`, `.booking-primary`,
  `.booking-hint-error`, `.booking-field`) se reutilizan literalmente en esas otras plantillas. El
  pedido del usuario fue explícito en no tocar esas otras rutas en este pase, así que cualquier
  regla nueva sobre una clase compartida se escribió anidada bajo un ancestro exclusivo de esta
  página (`.booking-search`, o una clase nueva agregada solo aquí,
  `.booking-search-results`/`.booking-search-submit`) en vez de modificar la regla compartida
  directamente; las clases que ya eran exclusivas de esta página (`.booking-destination-panel`,
  `.booking-result-card` y sus hijos, los selectores `:host ::ng-deep .booking-date-range-*` del
  datepicker) se pudieron tocar sin anidar porque ningún otro componente de la carpeta las renderiza.
  Cambios (todos en `allied-booking.css`, más dos clases nuevas agregadas en `allied-booking.html`):
  - Panel de destino (`.booking-destination-panel`, montado por `*ngIf` en cada apertura): entrada
    con `animation: booking-destination-panel-enter` (opacity + `translateY(-6px)`, 180ms
    `cubic-bezier(0.16,1,0.3,1)`). Sin cierre animado — el brief lo dejaba condicionado a no romper
    accesibilidad/teclado, y una salida animada habría requerido retrasar el `*ngIf`/`destinationPanelOpen`
    con temporizadores nuevos en el componente, con riesgo real sobre el manejo de foco de
    `onDestinationFocusOut`/Escape; se optó por no tocar esa lógica. Las opciones son interactivas
    de inmediato: la animación no bloquea `pointer-events` ni el foco.
  - Mensajes de validación (`.booking-search .booking-hint-error`, destino y rango de fechas):
    fade-in de solo opacidad (`booking-hint-in`, 160ms) — sin `translateY`, para que el mensaje de
    error sea legible de inmediato en vez de "entrar deslizándose".
  - Botón de búsqueda (nueva clase `booking-search-submit` en el `<button type="submit">`, además
    de `booking-primary`): se agregó `opacity` a su lista de `transition` (la regla compartida
    `.booking-primary` no la incluye), así que pasar a `[disabled]` cuando arranca la búsqueda se ve
    como un cambio de estado suavizado en vez de un corte instantáneo. Sin spinner nuevo: ya existe
    uno (`pi-spin pi-spinner`) en el botón "Mi ubicación", pero el brief pedía preferir una
    transición de estado corta para el botón principal en vez de motion continuo.
  - Tarjetas de resultado (`.booking-result-card`, exclusiva de esta página): entrada
    `booking-result-enter` (opacity + `translateY(14px)`, 300ms) con stagger por `nth-child` (0/35/
    70/105/140ms, tope en 140ms — dentro del rango ~120–150ms pedido). Como `*ngFor` usa
    `trackByHotel` (por `slug`), solo se anima una tarjeta cuando su nodo DOM se crea de nuevo
    (primeros resultados de una búsqueda), no en cada re-render menor. Se anima la tarjeta completa
    como una unidad, no cada pieza de contenido por separado.
  - Hover de tarjeta de resultado: la regla `.booking-result-card:hover` (elevación +3px) ya
    existía pero sin proteger contra hover "pegado" en touch — se movió dentro de
    `@media (hover: hover) and (pointer: fine)`, junto con un zoom sutil nuevo de la imagen
    (`scale(1.03)`, 400ms) en el mismo hover. El foco por teclado sigue usando la regla ya existente
    y siempre activa `.booking-page :focus-visible`, independiente de este hover.
  - Estados de carga/error/vacío de resultados y el contador de resultados
    (`.booking-search-results .booking-empty`, `.booking-search-results .booking-results-header >
    span` — nueva clase `booking-search-results` agregada solo en la `<section>` de resultados de
    esta página): fade-in `booking-fade-in` (opacity + `translateY(8px)`, 240ms) en cada cambio de
    estado. Nada de "shake" en los contenedores de error.
  - Se extendió el bloque `@media (prefers-reduced-motion: reduce)` ya existente (antes solo
    neutralizaba el `transform` de cuatro hovers) para desactivar `animation`, `transition-duration`,
    `transition-delay` y `scroll-behavior` en todo `.booking-page *`. Como los overlays internos del
    `p-datepicker` de PrimeNG se montan fuera del DOM de `.booking-page` (vía overlay/CDK), este
    bloque no toca sus animaciones internas — se preserva el comportamiento nativo del date-picker
    tal como pedía el brief, sin necesidad de una excepción manual.
- **Por qué:** pedido explícito del usuario de una animación puramente funcional para este paso —
  feedback de estado, no decoración — con instrucciones detalladas de duración/easing/alcance por
  cada zona del formulario y del resultado de búsqueda, y la restricción explícita de no modificar
  las otras rutas del flujo de reserva pese a que comparten el mismo archivo CSS.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `allied-booking.html`. `allied-booking.ts` no cambió (ninguna animación nueva requirió lógica de
  componente).
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia la
  lógica de búsqueda, la validación del formulario, el manejo de ARIA del combobox de destino, el
  comportamiento del date-picker, ni el routing a `/reservar/tarifas/:slug`. Las otras tres rutas
  del flujo (`/reservar/tarifas/:slug`, `/reservar/solicitud/:slug/:rateId`,
  `/reservar/confirmacion/:id`) no deberían verse afectadas visualmente: se verificó con `grep` que
  ninguna de sus plantillas usa las clases nuevas (`booking-search-submit`, `booking-search-results`)
  y que toda regla nueva sobre una clase compartida quedó anidada bajo un ancestro exclusivo de esta
  página. Validado con `tsc --noEmit` limpio, `ng build --configuration=development` exitoso, y el
  detector mecánico de la skill (`detect.mjs`) sobre los archivos tocados sin hallazgos. No se
  verificó visualmente en navegador: no hay `chromium-cli`/Playwright disponibles en este entorno
  (mismo motivo que entradas anteriores).

---

### 2026-08-17 — Animación sutil en /hoteles-aliados

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la página pública de directorio de hoteles aliados
  (`frontend/src/app/components/pages/allied-hotels/`) no tenía ningún movimiento (ni siquiera un
  bloque `prefers-reduced-motion`, a diferencia de la landing), pese a que ya tenía transiciones de
  hover en tarjetas/botones/enlaces. Se trató como directorio de búsqueda (modo Operate: la motion
  debe explicar feedback y cambios de estado, no ser una entrada coreografiada), así que el foco fue
  distinto al de la landing (modo Persuade): menos "momento autoral" y más continuidad de estado.
  Cambios:
  - Se agregó una animación de entrada por CSS (`allied-card-enter`, 300ms
    `cubic-bezier(0.16,1,0.3,1)`, fade + `translateY(14px)`) directamente en `.allied-card`, con un
    stagger acotado vía `nth-child` (0/35/70/105ms, tope en el quinto ítem en adelante). Como el
    `*ngFor` de la grilla usa `trackByHotel` (por `slug`), Angular solo crea un nodo DOM nuevo para
    una tarjeta cuando aparece por primera vez o cuando vuelve a calzar con el filtro después de
    haber sido excluida — así que la animación de CSS (que se dispara al insertarse el elemento, no
    por JS/IntersectionObserver) cubre tanto la carga inicial como cada cambio de búsqueda/tipo sin
    re-disparar en tarjetas que ya estaban visibles y sin necesitar lógica adicional en el
    componente.
  - Se agregó un fade-in sutil (`allied-fade-in`, 220–280ms) a `.allied-result-count` (texto de
    "Cargando..." / conteo de resultados), `.allied-error-state` y `.allied-empty`, que ya aparecían
    y desaparecían por `*ngIf` pero sin transición.
  - Se agregó zoom sutil de imagen en hover de tarjeta (`.allied-card:hover .allied-card-media img
    { transform: scale(1.03) }`, 400ms), igual al patrón ya usado en `wayra-image-card` de la
    landing, protegido con `@media (hover: hover) and (pointer: fine)` para que un tap en iOS/
    iPadOS Safari no deje la imagen "pegada" en zoom.
  - Se agregó el bloque `@media (prefers-reduced-motion: reduce)` que faltaba en esta página
    (desactiva `animation`/`transition`/`scroll-behavior` para todo `.allied-hotels-page *`), y se
    corrigió `scrollToFragment()` en `allied-hotels.ts` para usar `behavior: 'auto'` en vez de
    `'smooth'` cuando el usuario tiene movimiento reducido activado (mismo patrón que
    `scrollToSection` en `landing.ts`).
- **Por qué:** pedido explícito del usuario de animar esta ruta; el comando `animate` de la skill
  `impeccable` exige que toda animación tenga una ruta de `prefers-reduced-motion`, y esta página no
  tenía ninguna, a diferencia de la landing (ver entrada anterior).
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`,
  `allied-hotels.ts`.
- **Impacto:** sin migraciones, sin variables de entorno, sin cambios de API/RBAC. No cambia el
  comportamiento funcional de la búsqueda, el filtro ni la navegación por fragmento. Validado con
  `tsc --noEmit` limpio, `ng build --configuration=development` exitoso, y el detector mecánico de la
  skill (`detect.mjs`) sobre los archivos tocados: un único hallazgo advisory pre-existente y fuera de
  alcance (el fondo de líneas decorativo del hero, ya presente antes de este cambio, igual al de la
  landing). No se verificó visualmente en navegador: no hay `chromium-cli`/Playwright disponibles en
  este entorno (mismo motivo que entradas anteriores).

---

### 2026-08-17 — Animación sutil en la landing pública

- **Autor:** Claude Code, a solicitud del usuario (skill `impeccable` / comando `animate`)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la landing pública (`frontend/src/app/components/pages/landing/`) ya tenía un
  sistema de scroll-reveal (`.wayra-reveal` + `IntersectionObserver`, con fallback estático y
  `prefers-reduced-motion`) y transiciones de hover en botones/tarjetas, pero varios encabezados de
  sección no estaban envueltos en él, los grupos de tarjetas/ítems (pasos del flujo operativo,
  tarjetas de audiencia, preguntas del FAQ) aparecían todos a la vez en vez de con un stagger
  pequeño, el FAQ (`<details>`/`<summary>`) abría/cerraba de forma instantánea (comportamiento nativo
  del navegador, sin transición), y el menú móvil aparecía sin transición de entrada. Cambios:
  - Se agregó la clase `wayra-reveal` a los encabezados de las secciones "Operación", "Evidencia de
    producto", "Para quién" y "FAQ", y al bloque de copy del hero (no a la imagen de producto del
    hero, que tiene `fetchpriority="high"` y es candidata a LCP, para no retrasar su pintado).
  - Se movió `wayra-reveal` del `<ol>` de pasos operativos a cada `<li>` individual, y se agregó un
    método `revealDelay(index)` (`Math.min(index, 3) * 50` ms, tope de 150ms) usado como
    `transition-delay` inline en los pasos del flujo, las tarjetas de audiencia y los ítems del FAQ,
    para que cada grupo entre con un stagger pequeño y acotado en vez de simultáneo.
  - Se reemplazó el toggle nativo del FAQ (`[open]`/`(toggle)`) por un manejador de click en
    `<summary>` (`onFaqSummaryClick`) que hace `preventDefault()` y anima la altura del `<details>`
    con la Web Animations API (`expandFaqItem`/`collapseFaqItem`, 260ms abrir / 220ms cerrar,
    `cubic-bezier(0.16, 1, 0.3, 1)`, mismo easing que el resto de la página), cerrando también el
    ítem previamente abierto cuando se abre uno nuevo (acordeón exclusivo). Con
    `prefers-reduced-motion: reduce` se salta la animación y solo se alterna el atributo `open`.
  - Se agregó una animación de entrada (`wayra-mobile-panel-enter`, 0.2s) al panel del menú móvil, y
    un estado `:hover` para los botones del stepper del modal de demo (`.wayra-demo-step`), que no lo
    tenían.
  - Se bajó la duración de `.wayra-reveal` de 0.55s a 0.5s para respetar el tope de "hasta ~500ms
    para reveals de sección" pedido, y se agregó `transition-delay: 0s !important` al bloque
    `prefers-reduced-motion` existente (el `transition-duration: 0s` ya presente no anulaba el delay
    del stagger nuevo, lo que habría dejado una pausa perceptible antes de mostrar contenido con
    movimiento reducido activado).
- **Por qué:** pedido explícito del usuario de agregar movimiento sutil y con propósito a la landing
  pública (jerarquía, orientación y feedback), sin rediseñar secciones, cambiar copy/colores/
  tipografía ni tokens públicos, respetando `prefers-reduced-motion` y sin depender de librerías de
  animación nuevas (el proyecto no usa `@angular/animations`, así que todo se hizo con CSS
  transitions/keyframes y la Web Animations API nativa del navegador).
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.html`, `.ts`,
  `.css`.
- **Impacto:** sin migraciones, sin variables de entorno nuevas, sin cambios de API ni de recursos
  RBAC. No cambia el comportamiento funcional del FAQ (sigue siendo un acordeón exclusivo,
  navegable por teclado vía `<summary>`, con el atributo `open` reflejado correctamente para
  lectores de pantalla) ni el de ningún CTA. Validado con `tsc --noEmit` limpio y `ng build
  --configuration=development` exitoso. No se verificó visualmente en navegador: no hay
  `chromium-cli`/Playwright disponibles en este entorno (mismo motivo que entradas anteriores) y no
  se instalaron por ser una verificación puntual, no una necesidad recurrente del proyecto.

---

### 2026-08-17 — Check-in online publico pide los datos de todos los huespedes de la reserva

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la primera version del backend de check-in online (entrada inmediatamente
  siguiente en esta bitacora) solo pedia los datos del huesped titular, aunque la reserva fuera
  para varias personas. El usuario pidio explicitamente que si la reserva es para N huespedes, el
  formulario pida los datos de los N. Cambios:
  - Nuevo endpoint publico `POST /api/online-check-in/lookup/` (mismo `ViewSet`, `@action`
    `detail=False`): recibe codigo de reserva + documento del titular (mismo criterio de
    verificacion que el envio), NO escribe nada, y devuelve `total_guests` (la propiedad ya
    existente `Reservation.total_guests`, suma de adultos+niños de `rooms_detail`), elegibilidad
    (`eligible`/`eligible_reason`, sin filtrar detalles de la reserva a quien no demuestre conocer
    el documento) y los huespedes ya enviados antes (`existing_guests`, para precargar el
    formulario en un reenvio). A diferencia del endpoint de envio, si el documento coincide pero la
    reserva no es elegible (pendiente, cancelada, etc.) responde `200` con `eligible: false` en vez
    de un error 400 — es una consulta, no una escritura, y ya se probo que quien pregunta conoce el
    documento del titular.
  - El endpoint de envio (`POST /api/online-check-in/`) cambio de un huesped plano a
    `guests: [...]` (lista, `OnlineCheckInGuestSerializer` anidado, alias `firstName/lastName/
    documentType/documentNumber/birthDate/nationality` igual que antes). Reglas nuevas en
    `online_check_in.py`: el titular (mismo documento verificado) debe estar presente en algun
    elemento de la lista (no necesariamente el primero); la cantidad de huespedes enviados debe
    coincidir exactamente con `reservation.total_guests`; no se permite repetir el mismo documento
    dentro del mismo envio. Los campos de contacto/logistica (email, telefono, hora de llegada,
    contacto de emergencia, notas, consentimiento de datos) siguen siendo unicos para toda la
    reserva, no por huesped — se replican en cada fila de `ReservationGuest` al guardar. El *upsert*
    sigue siendo idempotente por huesped (mismo `reservation`+`document_type`+`document_number`),
    ahora dentro de un bucle sobre la lista, todavia protegido con `select_for_update()` sobre la
    reserva para requests simultaneos. La notificacion a recepcion (`notify_online_check_in_submitted`)
    ahora resume cuantos huespedes completaron el check-in y solo se dispara si alguno de ellos era
    su primer envio.
  - Frontend: se agrego el paso de documento del titular al formulario del paso 1 (necesario para
    la consulta de elegibilidad), y el paso 2 ahora renderiza un `FormArray` (`guestLines`) con un
    bloque de identidad por huesped — cantidad fijada por `total_guests` de la respuesta del
    backend, no editable por el usuario (a diferencia del `guest_lines` interno de
    `create-reservation.ts`, que si permite agregar/quitar porque ahi el personal define cuantos
    huespedes hay; aqui la cantidad ya la define la reserva). El primer bloque siempre es el titular
    y se precarga con el documento ya escrito en el paso 1; si el huesped reenvia el formulario, los
    demas bloques se precargan con los datos que ya habia mandado antes (via `existing_guests` del
    lookup). Los campos compartidos (correo, telefono, hora de llegada, contacto de emergencia,
    notas, consentimiento) se piden una sola vez, no por huesped.
- **Por qué:** pedido explicito del usuario tras revisar la primera version ("necesito que si la
  reserva es para dos huespedes, el front pida la informacion de esos dos huespedes"). El modelo
  `ReservationGuest` ya soportaba multiples filas por reserva (es como se modelan los huespedes en
  todo el resto del sistema); la limitacion era solo del contrato publico nuevo, que se corrigio
  para reflejar el dominio real en vez de asumir una reserva de un solo huesped.
- **Archivos/áreas afectadas:** `backend/apps/reservations/online_check_in.py`,
  `backend/apps/reservations/serializers.py`, `backend/apps/reservations/views.py`,
  `backend/apps/reservations/tests.py`, `backend/apps/notifications/services.py`,
  `frontend/src/app/services/online-check-in.ts`,
  `frontend/src/app/components/pages/online-check-in/online-check-in.ts`, `.html`, `.css`.
- **Impacto:** sin migraciones nuevas (reutiliza las columnas de `ReservationGuest` agregadas en la
  entrada anterior); sin variables de entorno nuevas; comparte el throttle `online_check_in`
  existente entre `lookup` y el envio (no se agrego un scope nuevo). **Rompe el contrato del
  endpoint de envio** definido horas antes en esta misma sesion (huesped plano → `guests: [...]`) —
  aceptable porque ese contrato nunca llego a un commit ni a produccion. Validado con 16 tests en
  verde en `OnlineCheckInPublicApiTests` (los 9 anteriores mas 7 nuevos: dos huespedes en una
  reserva, cantidad de huespedes que no coincide, documento repetido en el mismo envio, y los 4
  casos del endpoint de lookup) mas la suite completa de `apps.reservations` y `apps.notifications`
  (69 tests) y `manage.py check`, todos en verde; `ng build` y `tsc --noEmit` limpios. Probado con
  `curl` end-to-end (lookup + envio con 1 huesped rechazado por cantidad, envio con 2 huespedes
  aceptado, lookup posterior mostrando el prefill) contra un backend propio y a traves del proxy
  del dev server de Angular ya en ejecucion. No se verifico visualmente en navegador (mismo motivo
  que la entrada anterior: sin `chromium-cli`/Playwright en este entorno).

---

### 2026-08-17 — Backend real para el check-in online publico (pre-check-in, sin tocar el flujo interno)

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la vista publica `/check-in-online` (ver entrada del 2026-08-13) era 100%
  frontend: no llamaba a ningun backend y el boton "Enviar check-in" solo mostraba un mensaje
  local. Se implemento el flujo completo de extremo a extremo siguiendo el mismo patron ya usado
  para `/reservar` (`WebReservationViewSet` + `public_booking.py` + `web-reservation.ts`):
  - Nuevo endpoint publico `POST /api/online-check-in/` (`AllowAny`, sin RBAC, throttle
    `online_check_in: 8/min`), registrado en `apps/reservations/urls.py` junto a
    `web-reservations`.
  - Nueva capa de negocio `apps/reservations/online_check_in.py` (mismo patron que
    `public_booking.py`): resuelve el ID de reserva a partir del "codigo" publico reutilizando el
    parseo de sufijo numerico ya usado para `hotel_slug` en `_resolve_hotel`, exige que el numero
    de documento enviado coincida con el titular (`reservation.client.document_number`) como
    segundo factor de identificacion (un ID de reserva consecutivo por si solo es adivinable), y
    aplica reglas de elegibilidad reutilizando los helpers existentes de
    `apps/reservations/services.py` (`is_reservation_status_*`, `real_check_in`,
    `real_check_out`): solo procede si la reserva esta `CONFIRMADA`, no tiene check-in presencial
    registrado, no fue cancelada/finalizada y su periodo no vencio.
  - El envio hace *upsert* idempotente sobre `ReservationGuest` (mismo `reservation` +
    `document_type` + `document_number`): reenviar el formulario (doble clic, retry tras timeout)
    actualiza el mismo registro en vez de duplicarlo, protegido con
    `select_for_update()` sobre la reserva para requests simultaneos.
  - Migracion `0012_reservationguest_online_check_in_fields`: se agregaron a `ReservationGuest`
    los campos que el formulario ya pedia y que no existian en el modelo (`email`, `phone`,
    `arrival_time_window`, `notes`, `accepts_data_policy`, `online_check_in_submitted_at`),
    expuestos tambien en `ReservationGuestSerializer` para que recepcion los vea en la ficha
    interna de la reserva.
  - `notify_online_check_in_submitted` (nueva, en `apps/notifications/services.py`, mismo patron
    que `notify_reservation_created`) avisa una sola vez (en el primer envio, no en reenvios) a
    los managers del hotel via `notify_hotel_managers`.
  - Frontend: `frontend/src/app/services/online-check-in.ts` (mismo patron que
    `web-reservation.ts`) conectado desde `online-check-in.ts`/`.html`: estado de
    envio/error/confirmacion real, boton deshabilitado mientras envia, mensaje de error del
    backend mostrado en el formulario, y confirmacion final con datos reales de la reserva
    (nombre del hotel) en vez de un mensaje generico. Se corrigio ademas el valor de "Pasaporte"
    de `'PASSPORT'` a `'PASAPORTE'` para que coincida con el codigo real sembrado en
    `MasterData` (`DOCUMENT_TYPE`), igual que ya lo usa `/reservar`.
- **Por qué:** la decision del 2026-08-13 fue deliberada y se mantiene intacta: el check-in
  online de huespedes **sigue sin ejecutar** el endpoint interno `POST
  /api/reservations/{id}/check-in/` ni sus reglas (RBAC, disponibilidad de habitacion, ventana de
  check-in del hotel), que existen especificamente para forzar verificacion de identidad
  presencial por parte de recepcion (ver entrada del 2026-08-10, "Fase 10: verificacion
  obligatoria en check-in y check-out"). Lo que faltaba no era saltarse esa verificacion sino
  darle a recepcion los datos que el huesped ya diligencio *antes* de llegar: por eso el nuevo
  endpoint crea un **pre-check-in** (guarda los datos, no cambia `status` ni `real_check_in`) que
  el personal sigue confirmando en persona, ahora con la ficha ya precargada.
- **Archivos/áreas afectadas:** `backend/apps/reservations/online_check_in.py` (nuevo),
  `backend/apps/reservations/migrations/0012_reservationguest_online_check_in_fields.py` (nuevo),
  `backend/apps/reservations/models.py`, `serializers.py`, `views.py`, `urls.py`, `tests.py`,
  `backend/apps/notifications/services.py`, `backend/backend/settings.py` (throttle rate),
  `frontend/src/app/services/online-check-in.ts` (nuevo),
  `frontend/src/app/components/pages/online-check-in/online-check-in.ts` y `.html`.
- **Impacto:** requiere migracion (`0012_reservationguest_online_check_in_fields`, ya aplicada y
  verificada contra la base de datos local); no agrega variables de entorno nuevas; no agrega
  recursos RBAC (el endpoint es publico como `web-reservations`, mismo precedente, no aparece en
  `RBAC_RESOURCES_LIST.md`); no cambia ningun contrato existente. Validado con 9 tests nuevos
  (`OnlineCheckInPublicApiTests`: happy path, documento que no coincide, codigo inexistente,
  reserva pendiente/cancelada/ya-con-check-in, reenvio idempotente con una sola notificacion,
  consentimiento de datos obligatorio, ventana de llegada invalida) mas la suite completa de
  `apps.reservations` (53 tests) y `apps.notifications` (9 tests), todos en verde; `manage.py
  check` sin problemas; `ng build` y `tsc --noEmit` limpios. Se probo el flujo real end-to-end con
  `curl` contra el backend (`manage.py runserver`, en un puerto propio) y a traves del proxy del
  dev server de Angular ya en ejecucion (`/api` → Django), confirmando que el bundle servido
  incluye el nuevo servicio y que el proxy persiste correctamente los datos en la base de datos de
  desarrollo. No se verifico visualmente en navegador (sin `chromium-cli`/Playwright disponibles
  en este entorno Windows) — pendiente de que el usuario confirme el flujo clic a clic.

---

### 2026-08-17 — Consistencia del pie de tarjeta sin precio en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable polish /hoteles-aliados`, acotado a
  consistencia visual final e integracion, tras el pase de `shape`→build, `$impeccable adapt` y
  `$impeccable clarify` anteriores de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** revision de jerarquia, espaciado y consistencia tarjeta-a-tarjeta pedida por el
  usuario (imagen presente/ausente, descripciones de distinto largo, precio ausente, cantidad de
  highlights distinta). La mayoria verifico limpio ya sea por diseño deliberado ya confirmado en
  pases anteriores o por precedente ya establecido en el codebase: el espaciado ajustado de 0.55rem
  entre el nombre del hotel y la ubicacion replica exactamente el mismo patron ya usado en
  `.booking-result-location` de `allied-booking.css` (agrupacion titulo+subtitulo, no una
  inconsistencia); un `<ul>` de highlights vacio o una descripcion ausente no rompen el layout porque
  ambos estan detras de `*ngIf` y no dejan espacio fantasma; y se verifico con un script que
  compara cada selector de `allied-hotels.css` contra el HTML que **ninguna regla CSS quedo sin
  uso** tras el rediseño de la tarjeta (la unica que sí quedo muerta, `.allied-badge`, ya se habia
  eliminado en el pase de `shape`→build anterior) — no se borro nada mas porque no habia nada mas
  que borrar, verificado, no asumido.
  Se encontro y corrigio un problema real de consistencia: `.allied-card-footer` usaba
  `justify-content: space-between` para separar el precio (izquierda) del boton "Reservar"
  (derecha) — pero cuando `hotel.nightlyRateFrom` no es un valor real, el `*ngIf` del precio saca el
  `<span>` del DOM por completo, dejando un solo hijo flex en el contenedor. Con un unico hijo,
  `space-between` lo coloca al **inicio** de la fila en vez de al final — el boton "Reservar" saltaba
  de estar alineado a la derecha (con precio) a estar alineado a la izquierda (sin precio),
  exactamente la inconsistencia tarjeta-a-tarjeta que el usuario pidio revisar. Se cambio
  `justify-content` del contenedor a `flex-end` y se agrego `margin-right: auto` a
  `.allied-card-price` — con el margen automatico presente, el precio empuja el resto del espacio
  disponible hacia la derecha (mismo resultado visual de antes cuando hay precio); sin el precio en
  el DOM, `justify-content: flex-end` por si solo deja "Reservar" en el mismo lugar de siempre. Se
  verifico que este cambio no afecta el apilado a `flex-direction: column` en movil (`@media
  (max-width: 640px)`, sin tocar): `.allied-card-price` es un `<span>` sin borde ni fondo visibles,
  asi que estirarse a ancho completo (comportamiento previo por `align-items: stretch`) o encogerse
  al contenido (comportamiento nuevo por el margen automatico en el eje transversal) no produce
  ninguna diferencia visual observable para texto plano alineado a la izquierda.
- **Por qué:** hallazgo verificado explicitamente pedido por el usuario ("Check card-to-card
  consistency when:... price is absent") — el mismo tipo de revision sistematica que ya se aplico a
  los otros ejes de consistencia de esta misma tarjeta en pases anteriores de esta sesion.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`, `AGENTS.md`.
- **Impacto:** Ninguno en la logica de filtrado, la memoizacion del pase de `optimize` anterior, el
  routing, los datos reales de hotel, el significado del copy, las correcciones de accesibilidad, el
  comportamiento responsivo del pase de `adapt` anterior (el `flex-wrap: wrap` del pie se preservo
  sin cambios), el touch target de 44px del CTA, ni los estados de carga/error/reintento/vacio (sin
  tocar, ni en comportamiento ni en estilo). No se tocaron tokens compartidos, modo oscuro ni ninguna
  otra pagina publica. Verificado con el detector mecanico de Impeccable con `--scope layout` (0
  hallazgos, en modo degradado por dependencias de parseo HTML no disponibles en este entorno) y
  confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verifico
  visualmente en navegador (la posicion real del boton "Reservar" en una tarjeta sin precio, en los
  tres anchos de breakpoint) por no tener disponible una herramienta de automatizacion en esta
  sesion.

---

### 2026-08-17 — Pluralizacion natural en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable clarify /hoteles-aliados`, acotado a
  consistencia de copy y claridad de contenido menor, tras `$impeccable critique`/`audit` de esta
  misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** revision completa del copy visible de la pagina (kicker, hero, estadisticas,
  toolbar, estados de carga/error/vacio, tarjeta) contra el resto del flujo publico de reserva.
  Casi todo ya estaba correcto y no se toco: el mensaje de error de carga
  ("No fue posible cargar los hoteles aliados activos.") ya es identico byte a byte al usado en las
  otras 3 paginas del flujo de reserva (verificado por `grep`); la convencion de escribir el copy
  publico sin tildes ("informacion", "sesion", "estadia", etc.) ya es consistente en toda esta pagina
  y en el resto del flujo — se confirmo que es un estilo deliberado y NO se agregaron tildes en
  ningun punto, porque hacerlo habria roto esa consistencia en vez de mejorarla. El texto del CTA
  "Reservar" tampoco se toco: el usuario lo protegio explicitamente ("Preserve... hotel-card CTA").
  Se encontraron y corrigieron 3 instancias reales de pluralizacion mecanica o fija, las 3 en
  `allied-hotels.html`:
  - "{{ hotels.length }} alojamientos encontrados" (siempre plural, incluso con 1 resultado) →
    `{{ hotels.length === 1 ? 'alojamiento encontrado' : 'alojamientos encontrados' }}`.
  - "{{ totalRooms }} habitaciones registradas" (siempre plural) →
    `{{ totalRooms === 1 ? 'habitacion registrada' : 'habitaciones registradas' }}`.
  - "{{ filteredHotels.length }} alojamiento(s) encontrados" (el sufijo mecanico "(s)" que nombro el
    usuario explicitamente) →
    `{{ filteredHotels.length === 1 ? 'alojamiento encontrado' : 'alojamientos encontrados' }}`.
  Las 3 correcciones replican exactamente el mismo patron ternario que ya usaba correctamente
  `hotelTypeCount` una linea mas abajo en el mismo bloque de estadisticas, en vez de inventar un
  patron nuevo.
- **Por qué:** hallazgo menor de `$impeccable critique /hoteles-aliados` de esta misma sesion
  (pluralizacion mecanica inconsistente con el patron correcto ya usado en el mismo bloque), mas dos
  instancias adicionales del mismo problema (siempre-plural sin importar el conteo) que el critique
  no habia señalado especificamente pero que el usuario pidio cubrir de forma general
  ("Fix mechanical pluralization... based on the actual result count", no solo el ejemplo literal
  citado).
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`, `AGENTS.md`.
- **Impacto:** Ninguno en la estructura de la tarjeta, las imagenes, los precios, las descripciones,
  los highlights, el routing, la logica de filtrado o la memoizacion del pase de `optimize` anterior,
  el comportamiento responsivo, las correcciones de accesibilidad, el hero, el header o el layout de
  la pagina — solo texto interpolado en 3 lineas. No se tocaron tokens compartidos, modo oscuro ni
  ninguna otra pagina publica. Verificado con `npx tsc --noEmit` (sin errores, aunque no se toco
  ningun `.ts`), el detector mecanico de Impeccable (0 hallazgos, en modo degradado por dependencias
  de parseo HTML no disponibles en este entorno) y confirmando que el dev server sigue sirviendo la
  ruta con HTTP 200 tras el cambio.

---

### 2026-08-17 — Memoizacion de `filteredHotels` en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable optimize /hoteles-aliados`, acotado
  a la implementacion del filtrado de la lista de hoteles, cerrando el ultimo hallazgo P2 abierto de
  `$impeccable audit` de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `filteredHotels` era un getter (`allied-hotels.ts`) que recalculaba `.filter()` +
  `normalize()` (descomposicion Unicode NFD + regex) para cada hotel en cada ciclo de deteccion de
  cambios, invocado desde dos bindings de plantilla distintos (`{{ filteredHotels.length }}` y
  `*ngFor="let hotel of filteredHotels"`) — sin memoizar, sin relacion con si `search`/`typeFilter`
  realmente habian cambiado. Se convirtio en una propiedad plana (`filteredHotels: AlliedHotel[] =
  []`) recalculada una sola vez por cambio relevante, en vez de en cada CD:
  - `search`/`typeFilter` pasaron de propiedades publicas planas a pares get/set sobre campos
    privados (`_search`/`_typeFilter`); el setter llama a un nuevo metodo privado
    `recomputeFilteredHotels()`. Como `[(ngModel)]` en Angular ya funciona de forma transparente con
    accesores get/set, **la plantilla no necesito ningun cambio** — `[(ngModel)]="search"` sigue
    exactamente igual, verificado que las tres referencias a `filteredHotels` en
    `allied-hotels.html` (el conteo de resultados, el `*ngFor` de la grilla, y la condicion del
    estado vacio) siguen funcionando sin modificacion porque Angular no distingue entre una propiedad
    y un getter en las expresiones de plantilla.
  - Se agrego una llamada a `recomputeFilteredHotels()` en el callback de `subscribe()` de
    `loadHotels()`, justo despues de asignar `this.hotels`, cubriendo el tercer disparador pedido
    (la coleccion de hoteles cambia).
  - `clearFilters()` se reescribio para asignar directamente los campos privados
    (`_search`/`_typeFilter`) y llamar `recomputeFilteredHotels()` una sola vez, en vez de pasar por
    los setters publicos (lo que habria disparado dos recalculos redundantes por un solo click en
    "Limpiar").
  - La logica de filtrado en si —normalizacion, coincidencia de busqueda, coincidencia de tipo, orden
    del resultado (via `Array.prototype.filter`, que preserva el orden original)— se copio sin
    ningun cambio dentro de `recomputeFilteredHotels()`; ninguna semantica de filtrado se alteró.
  - No se agrego debounce: cada pulsacion de tecla sigue re-filtrando de forma sincrona, exactamente
    igual que antes — el cambio elimina trabajo redundante por ciclo de deteccion de cambios, no
    introduce ningun retraso nuevo en la experiencia de busqueda.
- **Por qué:** hallazgo P2 verificado en `$impeccable audit /hoteles-aliados` de esta misma sesion
  ("Render performance: unnecessary re-renders, missing memoization" — el propio criterio del
  checklist de auditoria de Impeccable), el ultimo item tecnico que quedaba abierto en esa ruta.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.ts`, `AGENTS.md`.
- **Impacto:** Ninguno en la UX de busqueda, los filtros visibles, el estado de la URL, el orden de
  resultados, las tarjetas, la logica de imagenes, los precios, los estilos responsivos, los estados
  de error/reintento, el routing, la accesibilidad o el copy — `allied-hotels.html` no se toco en
  absoluto. `trackByHotel` sigue exactamente igual. No se tocaron tokens compartidos, modo oscuro ni
  ninguna otra pagina publica. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico
  de Impeccable sobre el archivo `.ts` (0 hallazgos, ejecucion limpia sin modo degradado porque este
  escaneo no involucra parseo de HTML/CSS) y confirmando que el dev server sigue sirviendo la ruta
  con HTTP 200 tras el cambio. No se midio el impacto real en rendimiento (Chrome DevTools
  Performance panel, Lighthouse) por no tener disponible una herramienta de navegador en esta sesion
  — el cambio se verifico por lectura de codigo y compilacion, no por medicion antes/despues.

---

### 2026-08-17 — Verificacion responsive de la tarjeta de hotel en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable adapt /hoteles-aliados`, acotado al
  comportamiento responsivo de la tarjeta de hotel implementada en el pase de `shape`→build anterior
  de esta misma sesion)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** auditoria por calculo desde el codigo fuente (sin navegador disponible en esta
  sesion) de `.allied-card-media`, `.allied-location`, `.allied-card-footer` y el breakpoint de 3
  columnas contra la lista de puntos que pidio el usuario. La mayoria verifico limpio por
  construccion CSS: el bloque de medios usa `aspect-ratio` + `overflow: hidden` + `object-fit: cover`
  en el `<img>`, una combinacion que nunca permite overflow sin importar las dimensiones reales de la
  imagen; el fallback usa `place-items: center`, centrado independiente de la resolucion; y
  `min-height: 320px` en `.allied-card` quedo verificado como un piso ya irrelevante (el contenido
  real hoy suma ~540px en el ancho mas angosto de 3 columnas, muy por encima del piso, sin crear
  espacio vacio). Se encontro y corrigio un problema real:
  - **Aprieto del pie de tarjeta en el breakpoint de 3 columnas:** a 1080px, cada tarjeta tiene
    ~292px de ancho de contenido disponible (calculado: contenedor 1048px, 3 columnas con gaps de
    1.35rem, menos el padding de la tarjeta). Un precio mas largo que el de los datos de muestra
    (p. ej. "Desde $1.250.000 por noche") mas el boton "Reservar" superan ese ancho. Sin
    `flex-wrap` en `.allied-card-footer`, el comportamiento por defecto (`nowrap`) habria forzado el
    texto del precio a envolver de forma apretada dentro de un elemento flex comprimido, en vez de
    que el precio y el CTA bajen a su propia linea — exactamente el "squeezing" que el usuario pidio
    evitar explicitamente. Se agrego `flex-wrap: wrap` a `.allied-card-footer`, que ya tenia
    `justify-content: space-between`, asi que el envoltorio a una nueva linea ya cae de forma natural
    cuando no cabe.
  - Se agrego `overflow-wrap: anywhere` y `max-width: 100%` a `.allied-card-price` y a
    `.allied-location` como proteccion defensiva explicita para el precio y las etiquetas de
    ciudad/departamento/pais, replicando el mismo patron ya usado en `allied-booking.css` en un pase
    de `adapt` anterior de esta misma sesion sobre otra ruta.
- **Por qué:** verificacion explicita pedida por el usuario tras el pase de `shape`→build anterior
  de esta misma sesion que agrego la imagen, el precio y el fallback de ubicacion a la tarjeta —
  cubriendo especificamente el breakpoint de 3 columnas, que ese pase no habia verificado por
  calculo.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`, `AGENTS.md`.
- **Impacto:** Ninguno en la logica de imagen/fallback, los datos reales del hotel, el routing, los
  filtros, los estados de error/reintento, las correcciones de accesibilidad del pase de `harden`, el
  hero, el header, el tratamiento de sangrado de la imagen hasta el borde, el radio de la tarjeta, el
  limite de 3 highlights ni el indicador "+N mas" — todos preservados sin cambios. No se tocaron
  tokens compartidos, modo oscuro ni ninguna otra pagina publica. Verificado con el detector mecanico
  de Impeccable con `--scope layout` (0 hallazgos, en modo degradado por dependencias de parseo HTML
  no disponibles en este entorno) y confirmando que el dev server sigue sirviendo la ruta con HTTP
  200 tras el cambio. **Limitacion de este pase:** toda la verificacion fue matematica sobre el CSS
  fuente (anchos de contenedor, anchos de columna, estimaciones de texto), no una prueba visual en
  navegador real ni en emulador de dispositivo — no hay herramienta de automatizacion de navegador
  disponible en esta sesion.

---

### 2026-08-17 — Rediseño de la tarjeta de hotel en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable shape` seguido de `$impeccable
  overdrive`-style "Go, implementa el brief confirmado" — flujo shape→build acotado a la tarjeta de
  hotel, tras `$impeccable critique`/`audit`/`harden` de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** implementacion exacta del brief de `shape` confirmado en esta misma sesion — solo
  la tarjeta `.allied-card`, ningun otro elemento de la pagina:
  - **Imagen/fallback:** nuevo bloque `.allied-card-media` (16:10, sangrado hasta el borde de la
    tarjeta via margen negativo igual al padding, en vez de reestructurar el modelo de caja con un
    div envolvente nuevo) al inicio de la tarjeta. Con `hotel.imageUrl` real muestra `<img
    loading="lazy">` con manejador `(error)`; sin imagen o con una URL invalida (verificado con el
    manejador de error, no solo con la ausencia del campo) muestra el mismo tratamiento de fallback
    ya usado en `allied-booking.css` (`.booking-result-media-fallback`: fondo `--ink` con resplandor
    radial `--primary`, icono en circulo, etiqueta del tipo) — reutilizado, no reinventado. El icono
    por tipo reutiliza `getHotelTypeIcon()`, ya exportado desde `allied-booking-flow.ts`, importado
    directamente en `allied-hotels.ts` en vez de duplicar el mapa de iconos.
  - **Precio:** nuevo `<span class="allied-card-price">` en el pie, solo cuando
    `hotel.nightlyRateFrom > 0`, con el texto "Desde {{ precio }} por noche" — reutiliza
    `formatBookingCurrency()` (mismo formateador COP ya usado en todo el flujo de reserva) en vez de
    inventar un formato de numero nuevo. El texto "{{ hotel.rooms }} habitaciones" que antes ocupaba
    ese mismo espacio se retiro (no estaba en la jerarquia de 6 puntos que pidio el usuario).
  - **Descripcion:** `hotel.description` ahora se renderiza cuando no esta vacia (antes su CSS
    `.allied-description` existia pero ningun elemento del HTML la usaba), con
    `-webkit-line-clamp: 2` para mantener la tarjeta escaneable.
  - **Insignia "Aliado Wayra":** eliminada por completo (HTML y la regla CSS `.allied-badge`, que
    quedo sin ningun uso tras el cambio) — el titulo y la URL de la pagina ya establecen una sola vez
    que son hoteles aliados; repetirlo identico en cada tarjeta no agregaba informacion.
  - **Ubicacion:** nuevo metodo `locationLabel(hotel)` en `allied-hotels.ts` extiende el fallback de
    `hotel.city` a `hotel.department` y despues `hotel.country` antes de caer solo en `hotel.type`,
    en vez de perder silenciosamente el contexto de ubicacion cuando falta la ciudad.
  - Se agregaron los tokens locales `--primary-rgb` y `--white-rgb` al bloque raiz de
    `allied-hotels.css` (mismos valores exactos que ya usa `allied-booking.css`) porque el patron de
    fallback reutilizado los necesita para el degradado radial y el circulo del icono — adicion de
    tokens de pagina, no una extraccion de tokens compartidos entre paginas (fuera de alcance,
    explicitamente pedido no tocar).
- **Por qué:** brief de `$impeccable shape` confirmado explicitamente por el usuario en esta misma
  sesion ("Go. Implementa el brief confirmado del hotel-card exactamente como se describio"), que a
  su vez resolvia hallazgos de `$impeccable critique` (P1: sin foto ni precio pese a existir en el
  modelo de datos; P1: CSS muerta de `.allied-description`; minor: insignia redundante en cada
  tarjeta; minor: perdida silenciosa de ubicacion sin `city`).
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.ts`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`, `AGENTS.md`.
- **Impacto:** Ninguno en el hero, el header, los filtros, los estados de carga/error/reintento/
  vacio, los breakpoints responsivos existentes, el comportamiento de "Reservar" (mismo
  `routerLink`/`queryParams` de siempre), los tokens compartidos entre paginas, el modo oscuro, u
  otras paginas publicas. Los 3 highlights maximos y el indicador "+N mas" del pase de `harden`
  anterior se preservaron sin cambios; todos los `aria-hidden` y los touch targets de 44px de ese
  mismo pase siguen intactos, y el nuevo `<img>`/icono de fallback recibieron el mismo tratamiento de
  accesibilidad (`alt` real en la imagen, `aria-hidden="true"` en el icono decorativo). No se
  agregaron calificaciones, reseñas, amenidades, descuentos ni disponibilidad — todo el contenido
  nuevo viene de campos que ya existian en `AlliedHotel`. Verificado con `npx tsc --noEmit` (sin
  errores) y el detector mecanico de Impeccable (0 hallazgos nuevos; el unico hallazgo reportado,
  `codex-grid-background` sobre el overlay decorativo del hero, es preexistente y no fue tocado por
  este cambio) y confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio.
  No se verifico visualmente en navegador (el aspecto real del sangrado de la imagen, el fallback por
  tipo de hotel, o el ajuste del precio en la fila del pie a 3 columnas) por no tener disponible una
  herramienta de automatizacion en esta sesion.

---

### 2026-08-17 — Recuperacion de errores, contraste y touch targets en `/hoteles-aliados`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /hoteles-aliados`, acotado a
  recuperacion de errores, accesibilidad y comportamiento defensivo, tras `$impeccable critique` y
  `$impeccable audit` de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** seis hallazgos verificados (1 P0 y 2 P1 de `critique`, 3 P1 de `audit`) sobre
  `AlliedHotelsPage`, corregidos exactamente en el alcance pedido:
  - **Error vs. vacio genuino:** el estado vacio (`allied-hotels.html`) pasa de
    `*ngIf="!loading && filteredHotels.length === 0"` a
    `*ngIf="!loading && !loadError && filteredHotels.length === 0"`, para que un fallo de API
    (`hotels = []` en `catchError`) deje de mostrarse simultaneamente como "No hay hoteles con esos
    filtros" con un boton "Ver todos" que no soluciona nada. El estado de error gana su propio boton
    "Reintentar" que llama a un nuevo `retryLoadHotels()` publico en `allied-hotels.ts` (guardado por
    `if (this.loading) return;`, replicando el mismo patron de `retryLoadHotels()`/
    `retrySearchAvailability()` ya usado en `allied-booking-rates.ts` en una entrada anterior de esta
    misma bitacora). `search`/`typeFilter` no se tocan en ningun punto de `loadHotels()`, asi que se
    preservan automaticamente al reintentar — no hizo falta codigo adicional para ese requisito.
  - **Contraste (3 fallos verificados en `$impeccable audit` de esta misma sesion):** se agrego el
    token `--primary-text: #2369c5` (mismo valor exacto ya usado por `allied-booking.css`) al bloque
    raiz de `allied-hotels.css`, y se aplico a `.allied-badge` y `.allied-nav-secondary` — ambos sobre
    fondo claro `--accent`, subiendo de 3.77:1 a 4.90:1. **El kicker del hero fue una excepcion
    deliberada al pedido explicito de "reusar --primary-text":** verificado por calculo antes de
    tocar el CSS que `--primary-text` (#2369c5) es mas oscuro que `--primary` (#2c7be5), y sobre el
    fondo oscuro del hero (`--ink`, #111827) eso habria empeorado el contraste de 4.28:1 a 3.29:1 —
    el arreglo contrario al pedido. En su lugar se uso `var(--accent)` (#edf5ff, ya definido en este
    mismo archivo, misma familia de azules) para `.allied-kicker`, que sobre `--ink` calcula 16.14:1.
    No se cambio el color de marca global `--primary` en ningun punto.
  - **Touch targets (3 fallos verificados en `audit`):** `.allied-nav a` paso de 42px a 44px;
    `.allied-view-back` (enlace "Volver") paso de 32px a 44px; `.allied-card-footer a` (CTA
    "Reservar") paso de 40px a 44px. El crecimiento de `.allied-view-back` habria hecho que su borde
    inferior invadiera 8px el texto del kicker en movil (`top: -2.25rem` + `min-height: 44px` supera
    el borde superior del contenedor) — se ajusto tambien `top: -2.25rem` a `top: -3rem` en el
    `@media (max-width: 640px)` correspondiente para conservar exactamente el mismo margen de
    separacion que tenia antes del cambio, verificado con la misma aritmetica usada para detectar el
    problema.
  - **Iconos decorativos:** `pi-arrow-left` (Volver), `pi-sparkles` (insignia), `pi-map-marker`
    (ubicacion), `pi-check` (cada highlight) y `pi-search` (estado vacio) ganan `aria-hidden="true"`
    — el texto adyacente ya comunica el significado en cada caso, mismo patron ya aplicado al icono
    de check de `/reservar/confirmacion/:reservationId` en un pase anterior de esta misma sesion.
  - **Highlights sin limite:** `*ngFor` de cada tarjeta paso de iterar `hotel.highlights` completo a
    `hotel.highlights.slice(0, 3)`, con un `<li class="allied-card-more">` condicional
    (`*ngIf="hotel.highlights.length > 3"`) mostrando "+N mas" cuando corresponde — la informacion no
    se pierde, solo se resume. Es una limitacion puramente de plantilla; el modelo de datos y el
    filtrado no cambiaron.
- **Por qué:** hallazgos verificados de `$impeccable critique` y `$impeccable audit` de esta misma
  sesion sobre esta misma ruta — la colision error/vacio (P0), tres fallos de contraste computados
  contra los valores reales de los tokens, y tres touch targets por debajo del minimo de 44px ya
  establecido de forma consistente en el resto del sitio publico.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.ts`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`, `AGENTS.md`.
- **Impacto:** Ninguno en el comportamiento de filtrado, el routing, el layout de tarjetas, el layout
  del hero o los breakpoints responsivos existentes — no se agregaron fotos ni precios, no se
  rediseñaron las tarjetas, no se extrajeron tokens compartidos ni se toco el modo oscuro, y ninguna
  otra pagina publica se modifico. El detector mecanico de Impeccable si reporto un hallazgo
  (`codex-grid-background`, severidad advisory) sobre el overlay de rejilla decorativo del hero
  (`allied-hotels.css:128`) — es codigo preexistente, no tocado por este cambio, y fuera del alcance
  pedido ("preserve... hero layout"), asi que se deja documentado para un pase futuro en vez de
  corregirse aqui. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico de
  Impeccable (0 hallazgos nuevos propios de este cambio; el hallazgo de rejilla es preexistente) y
  confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verifico
  visualmente en navegador (el aspecto real del boton de reintento, el indicador "+N mas", o el
  espaciado del enlace "Volver" en movil) por no tener disponible una herramienta de automatizacion
  en esta sesion.

---

### 2026-08-17 — Escala tipografica y proteccion de chips en `/reservar/confirmacion/:reservationId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable polish /reservar/confirmacion/:id`,
  acotado a consistencia visual final e integracion del contenido de confirmacion, tras los pases de
  `critique`/`audit`/`harden`/`clarify` anteriores de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** dos hallazgos verificados en `allied-booking.css`, ambos consecuencia directa de
  cambios anteriores de esta sesion sobre esta misma ruta:
  - `.booking-confirmation-copy h2` tenia `font-size: clamp(2rem, 4vw, 3.1rem)` — una escala
    calibrada para el texto corto de 2 palabras que tenia antes del pase de `clarify` ("Reserva
    registrada"). Con el nuevo `h2` de oracion completa ("El hotel revisara tu solicitud"), esa
    escala casi de tamaño hero producia un peso visual que competia con el `h1` del hero y sonaba mas
    "gritado" de lo que corresponde a un mensaje que es explicitamente secundario y pendiente, no la
    confirmacion final. Se redujo a `clamp(1.5rem, 3vw, 2rem)` — en la misma familia de escala que
    `.booking-hotel-card h2`/`.booking-form-header h2` (1.35–1.4rem) ya usada en este mismo archivo
    para encabezados secundarios de tarjeta, sin tocar ningun color ni token.
  - `.booking-confirmation-details span` (los chips de hotel/referencia/fechas agregados en el pase
    de `harden` anterior de esta sesion) no tenia ninguna proteccion de ajuste de texto — a
    diferencia de los chips equivalentes en `/reservar/solicitud/:slug/:rateId`
    (`.booking-summary`/`.booking-context-summary`), que ya habian recibido `overflow-wrap: anywhere`
    en el pase de `$impeccable adapt` de esta misma sesion. El riesgo es mas concreto aqui: un numero
    de referencia como "RQ-2026-000482" es un solo token sin espacios, sin ningun punto natural de
    corte, a diferencia de un nombre de hotel que normalmente si tiene espacios. Se agrego
    `overflow-wrap: anywhere` y `max-width: 100%`, y se ajusto el padding de `0 0.85rem` a
    `0.3rem 0.85rem` con `line-height: 1.3` (mismo ajuste ya aplicado a los chips del paso anterior)
    para que un chip que efectivamente necesite envolver a 2 lineas no quede con el texto apretado
    contra el borde superior/inferior de la pildora.
- **Por qué:** ambos hallazgos son consecuencia directa de ediciones de esta misma sesion sobre esta
  misma ruta (el `h2` mas largo del pase de `clarify`, los chips nuevos del pase de `harden`) — el
  polish cierra el ciclo verificando que esos cambios se integran visualmente bien entre si, tal como
  pidio el usuario explicitamente ("hierarchy between the hero, card, and chips"; "long hotel names
  and long reservation IDs").
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en el significado del copy, la gestion de foco, el routing, el wiring de
  accesibilidad, la estructura responsiva, las acciones, los estilos compartidos, los tokens, el modo
  oscuro u otros pasos del flujo — `.booking-confirmation-copy h2` y `.booking-confirmation-details
  span` son selectores exclusivos de esta pagina (verificado por `grep`, sin uso en las otras tres
  paginas que comparten `allied-booking.css`). Verificado con `npx tsc --noEmit` (sin errores, aunque
  no se toco ningun `.ts`), el detector mecanico de Impeccable con `--scope layout` (0 hallazgos, en
  modo degradado por dependencias de parseo HTML no disponibles en este entorno) y confirmando que el
  dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verifico visualmente en
  navegador (el ajuste real de una referencia larga sin espacios, o el tamaño final del `h2` en
  pantalla) por no tener disponible una herramienta de automatizacion en esta sesion.

---

### 2026-08-17 — Copy sin contradiccion y sin duplicado en `/reservar/confirmacion/:reservationId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable clarify /reservar/confirmacion/:id`,
  acotado a copy y jerarquia de mensajes de la pagina de confirmacion, tras `$impeccable critique`
  de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** hallazgo P1 verificado de `$impeccable critique` de esta misma sesion (el `h1`
  "Reserva registrada" contradecia, en la misma pantalla, el kicker de la tarjeta "Solicitud enviada
  al hotel" — y reintroducia la misma confusion de "reserva ya en firme" que el pase de `clarify`
  anterior sobre `/reservar/solicitud/:slug/:rateId` habia corregido un paso antes), resuelto
  dandole a cada bloque un rol distinto en vez de solo cambiar sinonimos:
  - **Hero** (`allied-booking-confirmation.html:48-59`): kicker "Confirmacion" → "Solicitud enviada";
    `h1` "Reserva registrada" → "Tu solicitud fue enviada"; el lead deja de repetir la promesa de
    correo (que ahora vive solo en la tarjeta) y en su lugar da el mensaje de agradecimiento y
    confirma que el hotel aliado revisara la solicitud — la pieza de "anuncio de estado", una sola
    vez.
  - **Tarjeta** (`allied-booking-confirmation.html:80-93`): kicker "Solicitud enviada al hotel" →
    "Proximos pasos"; `h2` "Reserva registrada" → "El hotel revisara tu solicitud" (cumple el
    requisito explicito de dejar el siguiente paso explicito: el hotel revisa, despues llega la
    confirmacion); el parrafo deja de ser una copia literal del lead del hero y pasa a introducir los
    chips de detalle que ya estaban ahi ("Mientras tanto, estos son los datos de tu solicitud:") —
    la pieza de "que sigue + contexto de los chips", con un proposito distinto al del hero en vez de
    repetir la misma oracion dos veces.
  - `app.routes.ts:126`: el `title` de la ruta (el titulo de pestaña del navegador) tambien decia
    "Reserva Registrada" — la misma frase que se estaba corrigiendo en la pagina — asi que se
    actualizo a "Solicitud Enviada" para no dejar la contradiccion viva en un lugar visible que el
    resto del cambio no habria tocado.
- **Por qué:** hallazgo P1 verificado de `$impeccable critique /reservar/confirmacion/:id` de esta
  misma sesion, con requisitos explicitos del usuario (resolver la contradiccion, no repetir la
  misma oracion, dejar explicito el siguiente paso) que esta entrada implementa uno a uno.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.html`,
  `frontend/src/app/app.routes.ts`, `AGENTS.md`.
- **Impacto:** Ninguno en el layout, la gestion de foco (pase de `harden` anterior de esta misma
  sesion, sin tocar), el routing, los chips de hotel/referencia/fechas (mismo `*ngIf`, mismo
  contenido, solo el texto que los introduce cambio), las acciones del pie, el comportamiento
  responsivo o los estilos compartidos — cambio acotado a 6 nodos de texto y un `title` de ruta.
  Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico de Impeccable (0 hallazgos,
  en modo degradado por dependencias de parseo HTML no disponibles en este entorno) y confirmando
  que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verifico visualmente
  en navegador por no tener disponible una herramienta de automatizacion en esta sesion.

---

### 2026-08-17 — Wiring de datos y accesibilidad en `/reservar/confirmacion/:reservationId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar/confirmacion/:id`,
  acotado a wiring de datos y accesibilidad de la pagina de confirmacion, tras `$impeccable
  critique` y `$impeccable audit` de esta misma sesion sobre esta misma ruta)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** tres hallazgos verificados (2 P0 de `critique`, 2 P1 de `audit`, uno compartido)
  sobre `AlliedBookingConfirmationPage`, corregidos exactamente en el alcance pedido:
  - El componente ya leia `checkIn`/`checkOut` desde `queryParamMap` pero nunca leia `hotel` (query
    param que `allied-booking-request.ts` ya envia en su `router.navigate(['/reservar/confirmacion',
    reservation.id], { queryParams: { hotel: reservation.hotel_name, ... } })`) ni el propio
    `:reservationId` de la ruta (confirmado el nombre exacto del parametro en `app.routes.ts`:
    `path: 'reservar/confirmacion/:reservationId'`, no `:id` a secas). Se agregaron
    `readonly hotelName` (de `queryParamMap`) y `readonly reservationId` (de
    `paramMap.get('reservationId')`) en `allied-booking-confirmation.ts`.
  - En `allied-booking-confirmation.html`, el bloque `.booking-confirmation-details` (ya existente,
    reutilizado sin inventar ningun patron nuevo) gana dos chips nuevos con el mismo estilo de pildora
    que ya tenia el chip de fechas: nombre del hotel (icono `pi-building`, ya usado en
    `allied-booking.html`/`allied-booking-rates.html` en este mismo flujo) y "Referencia
    #{{ reservationId }}" (icono `pi-ticket`, ya usado en `online-check-in.html` — se evito
    `pi-hashtag` por no tener evidencia de que exista en el set de iconos instalado). El `*ngIf` del
    contenedor paso de `hasStayDates` a un nuevo getter `hasConfirmationDetails` (hotel O referencia
    O fechas) para que el contenedor no desaparezca si faltan fechas pero si hay hotel/referencia.
  - `tabindex="-1"` en la region de confirmacion (`allied-booking-confirmation.html`) estaba puesto
    desde antes de esta sesion pero sin ningun `.focus()` que lo usara — confirmado por `audit` como
    hallazgo P1. Se agrego una referencia de plantilla `#confirmationRegion`, un `@ViewChild` en el
    componente (que ahora implementa `AfterViewInit`), y `ngAfterViewInit()` llama
    `.nativeElement.focus()` sobre esa region — el patron estandar de gestion de foco tras una
    navegacion de SPA. No se toco el orden de tabulacion de los enlaces existentes: al no estar en el
    flujo de tabulacion (`tabindex="-1"`), Tab desde ahi cae naturalmente al primer enlace enfocable
    del DOM, sin logica adicional.
  - El icono de check (`pi-check` dentro de `.booking-confirmation-icon`) queda marcado
    `aria-hidden="true"` en vez de tocar su color: `$impeccable audit` de esta misma sesion habia
    calculado su contraste real (blanco sobre el circulo `--primary`) en 4.14:1, por debajo del
    minimo de texto 4.5:1 — pero el encabezado adyacente ("Reserva registrada") ya comunica el exito
    en palabras, asi que el icono es decorativo por definicion y la resolucion correcta es sacarlo
    del arbol de accesibilidad, no perseguir un color distinto para el circulo primario (que ademas
    el usuario pidio explicitamente no tocar).
- **Por qué:** hallazgos verificados de `$impeccable critique` (2 P0: nombre de hotel y numero de
  referencia nunca mostrados pese a estar disponibles) y `$impeccable audit` (2 P1: contraste
  insuficiente del icono, `tabindex` sin usar) sobre esta misma ruta en esta misma sesion.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.html`, `AGENTS.md`.
- **Impacto:** Ninguno en las fechas ya mostradas, las acciones del pie, el comportamiento
  responsivo, los estilos compartidos del flujo, el routing, el copy de la pagina (deliberadamente
  sin tocar, incluida la contradiccion "Reserva registrada"/"Solicitud enviada" que sigue pendiente),
  ni los tokens o el modo oscuro. Cambio acotado a lectura de datos ya disponibles, dos chips nuevos
  reutilizando el componente de pildora existente, gestion de foco, y un atributo `aria-hidden` en un
  icono decorativo. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico de
  Impeccable (0 hallazgos, en modo degradado por dependencias de parseo HTML no disponibles en este
  entorno) y confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se
  verifico interactivamente en navegador (que el foco realmente se mueva a la region de confirmacion
  al cargar, o que los chips nuevos envuelvan bien nombres de hotel largos) por no tener disponible
  una herramienta de automatizacion en esta sesion.

---

### 2026-08-17 — Validacion de formato para telefono y numero de documento en `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar/solicitud/:slug/:rateId`,
  acotado esta vez a la validacion de `guestPhone` y `guestDocumentNumber` — el ultimo hallazgo P1
  que quedaba abierto de `$impeccable audit` de esta misma sesion, deliberadamente fuera de alcance
  en los cinco pases anteriores)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:**
  - Se agregaron dos validadores puros nuevos en `allied-booking-flow.ts` (junto al resto de
    funciones puras del archivo, mismo estilo): `phoneFormatValidator` acepta digitos opcionalmente
    precedidos de `+` y separados por espacios, guiones o parentesis, y exige entre 7 y 15 digitos
    reales tras descartar el formato (rango E.164, no asume un solo pais) — reemplaza
    `Validators.minLength(7)`, que aceptaba cualquier caracter. `documentNumberFormatValidator` lee
    el tipo de documento actual desde `control.parent?.get('guestDocumentType')` y aplica un patron
    distinto por tipo: solo digitos (5 a 15) para CC/CE/DNI, alfanumerico (5 a 15) para PASAPORTE —
    reemplaza `Validators.minLength(4)`, que tampoco distinguia tipos ni exigia formato real. Ningun
    validador rechaza el campo vacio (`Validators.required` ya cubre ese caso por separado, el mismo
    patron que ya usa `Validators.email` en este mismo formulario).
  - En `allied-booking-request.ts`, `ngOnInit()` ahora suscribe `guestDocumentType.valueChanges` para
    llamar `guestDocumentNumber.updateValueAndValidity()` cada vez que el usuario cambia el tipo de
    documento — sin esto, cambiar de CC a Pasaporte (o viceversa) no habria revalidado un numero ya
    escrito contra el patron del nuevo tipo.
  - Los dos mensajes de error en `allied-booking-request.html` se actualizaron para reflejar el
    nuevo criterio real ("Ingresa un telefono valido (7 a 15 digitos)." /
    "Ingresa un numero de documento valido para el tipo seleccionado."), manteniendo exactamente el
    mismo `id`, el mismo `*ngIf="isInvalid(...)"`, la misma clase `booking-hint-error` y el mismo
    wiring `aria-invalid`/`aria-describedby`/`input-error` ya establecido en los pases de `harden` y
    `polish` anteriores — no se toco ninguna otra parte del patron de accesibilidad.
  - Verificado con casos de prueba manuales fuera de Angular (numeros colombianos con y sin
    indicativo, formato con parentesis/guiones, texto con letras, cedulas numericas, pasaporte
    alfanumerico, y los limites de 7/15 digitos y 5/15 caracteres) antes de dar el cambio por
    correcto, no solo por compilar.
- **Por qué:** hallazgo P1 verificado en dos auditorias de esta misma sesion
  (`$impeccable audit`, antes y despues de los pases de `harden`/`clarify`/`layout`/`adapt`/
  `polish`) — `minLength` nunca fue una validacion de formato real, y el usuario pidio explicitamente
  no depender solo de esa; ademas pidio explicitamente NO aplicar "solo digitos" de forma global,
  porque Pasaporte puede incluir letras.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-flow.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`, `AGENTS.md`.
- **Impacto:** Ninguno en layout, comportamiento responsivo, copy del resto de la pagina, wiring de
  accesibilidad existente (aria-invalid/aria-describedby/booking-hint-error/input-error, todos
  preservados sin cambios estructurales), sticky del resumen, logica de creacion de la solicitud,
  tokens, dark mode u otros pasos del flujo — cambio acotado a las reglas de validacion de 2 campos y
  los 2 mensajes de error que las describen. Verificado con `npx tsc --noEmit` (sin errores), el
  detector mecanico de Impeccable (0 hallazgos, en modo degradado por dependencias de parseo HTML no
  disponibles en este entorno), pruebas manuales de los validadores contra casos representativos
  (telefonos con/sin indicativo, formato con simbolos, cedulas numericas, pasaporte alfanumerico,
  limites de longitud) y confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el
  cambio. No se verifico interactivamente en navegador (p. ej. que cambiar el tipo de documento
  revalide en vivo un numero ya escrito) por no tener disponible una herramienta de automatizacion
  en esta sesion.

---

### 2026-08-17 — Borde de error en campos invalidos de `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable polish /reservar/solicitud/:slug/:rateId`,
  acotado a consistencia visual final tras los pases de `critique`/`audit`/`harden`/`clarify`/
  `layout`/`adapt` anteriores de esta misma sesion)
- **Qué se hizo:** revision de la lista de puntos que pidio el usuario (espaciado del formulario,
  chips de contexto, sticky de escritorio, grupo de confirmacion, mensaje de garantia, CTA
  principal, estados de error de campo, bordes/sombras/divisores, estados hover/focus/active/
  disabled, jerarquia tipografica, consistencia con los pasos anteriores del flujo) contra el
  estado actual del codigo, ya refinado por los cinco pases previos de esta sesion. La mayoria de
  los puntos ya estaban resueltos por esos pases (espaciado, chips, sticky, grupo de confirmacion,
  copy del CTA, wiring de accesibilidad de errores) y no se tocaron de nuevo. Se encontro y corrigio
  un solo hallazgo real, verificado por `grep` antes de tocar codigo: `allied-booking.html` (paso 1
  del mismo flujo) ya le da a su campo invalido (`destination`) un borde rojo via
  `[class.input-error]="isSearchInvalid('destination')"`, usando una clase ya definida en
  `allied-booking.css` (`.input-error` con su propio estado `:focus`) — pero `allied-booking-request.html`
  (este paso, el ultimo antes de enviar datos personales) nunca la usaba; sus campos invalidos solo
  mostraban el texto de ayuda en rojo (agregado en el pase de `$impeccable harden` anterior de esta
  sesion), sin ningun cambio en el borde del campo mismo. Se agrego
  `[class.input-error]="isInvalid('<campo>')"` a los 5 controles con validadores
  (`guestName`, `guestEmail`, `guestPhone`, `guestDocumentType`, `guestDocumentNumber`) replicando
  exactamente el mismo patron ya probado en el paso 1, sin crear ninguna clase ni logica nueva. El
  campo `notes` (sin validadores, nunca invalido) se dejo sin cambios a proposito.
- **Por qué:** hallazgo de consistencia entre pasos del mismo flujo, exactamente el tipo de revision
  que pidio el usuario ("consistency with the previous booking steps", "field error states",
  "borders") — el paso con el dato mas sensible del flujo (documento de identidad, telefono, correo)
  era el unico que no reforzaba visualmente sus errores con el borde rojo que el resto del flujo ya
  usa.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`, `AGENTS.md`.
- **Impacto:** Ninguno en layout, comportamiento responsivo, copy, validaciones, logica de reserva,
  comportamiento sticky, contenido del resumen o tokens/paleta — no se toco ningun otro paso del
  flujo (`allied-booking.html`/`allied-booking-rates.html`/`allied-booking-confirmation.html`
  permanecen intactos). Cambio acotado a 5 bindings de clase que reutilizan una regla CSS que ya
  existia sin modificarla. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico de
  Impeccable (0 hallazgos, en modo degradado por dependencias de parseo HTML no disponibles en este
  entorno) y confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se
  verifico visualmente en navegador por no tener disponible una herramienta de automatizacion en
  esta sesion.

---

### 2026-08-17 — Verificacion responsive del resumen de contexto en `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable adapt /reservar/solicitud/:slug/:rateId`,
  acotado a movil y tablet para el chip de contexto, el formulario y el sticky de escritorio
  introducidos en el pase de `$impeccable layout` anterior de esta misma sesion)
- **Qué se hizo:** auditoria por calculo desde el codigo fuente (sin navegador disponible en esta
  sesion) de `.booking-context-summary`, `.booking-confirm-group` y el sticky de
  `.booking-hotel-card` contra la lista de puntos que pidio el usuario (320/375/390px, tablet
  700-1039px, landscape corto, touch targets, solapamiento del sticky con el header). La mayoria
  verifico limpio por matematica de layout: los chips ya envolvian texto largo correctamente (nunca
  tuvieron `white-space: nowrap`), los campos del formulario mantienen ancho comodo en las tres
  franjas (~256px en una columna a 320px, ~305px por campo a 700px en 2 columnas, ~280px por campo a
  1040px con el sidebar sticky activo), los touch targets ya cumplian 44px+ en toda la pagina, y el
  offset del sticky (`top: 6rem`) ya dejaba ~27px de separacion real contra el header sticky de
  ~69px de alto — sin solapamiento. Se corrigieron dos problemas reales que si aparecieron:
  - **Espaciado duplicado alrededor de `.booking-context-summary`:** tenia `margin-bottom: 1.25rem`
    propio Y el `.booking-grid` que le sigue ya trae su propio `margin-top: 1.25rem` — la separacion
    real hacia los campos quedaba en ~2.5rem (doble conteo) mientras que hacia arriba, contra el
    borde inferior de `.booking-form-header`, quedaba en 0 (sin ningun margen). Se removio el
    `margin-bottom` duplicado y se agrego `margin-top: 1rem` en su lugar, replicando el mismo patron
    ya usado en este archivo (`padding-bottom` + borde antes, `margin-top` en el siguiente bloque
    despues) en vez de inventar un valor nuevo.
  - **Sin red de seguridad para una palabra suelta muy larga:** `.booking-summary span` y
    `.booking-context-summary span` ya envolvian texto multi-palabra correctamente, pero no tenian
    ninguna proteccion si un solo token sin espacios fuera excepcionalmente largo. Se agrego
    `overflow-wrap: anywhere` y `max-width: 100%` a ambos selectores (compartidos via el mismo
    selector combinado que ya existia) como endurecimiento defensivo, sin cambiar la apariencia en
    el caso normal.
  - Se agrego `scrollbar-gutter: stable` a `.booking-hotel-card` dentro del breakpoint de escritorio
    (≥1040px) para que la aparicion de su propio scroll interno en viewports cortos no desplace el
    contenido de la tarjeta ni cause un salto visual — mismo mecanismo de scroll acotado ya
    verificado matematicamente seguro (`max-height: calc(100vh - 8rem)` deja ~2rem de aire abajo en
    cualquier alto de viewport, con scroll propio si el contenido no cabe, nunca contenido
    atrapado sin salida).
- **Por qué:** verificacion explicita pedida por el usuario tras el pase de `$impeccable layout`
  anterior de esta misma sesion, cubriendo especificamente los puntos que ese pase no habia
  verificado por calculo (ancho de campo por breakpoint, wrapping de texto largo, offset del sticky
  contra el header, touch targets) mas dos correcciones reales que la auditoria encontro.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en copy, validaciones, wiring de accesibilidad, mensaje solicitud-vs-
  confirmacion, logica de reserva, tokens, tipografia o estructura del formulario — cambio acotado a
  tres ajustes de CSS puramente responsive/defensivos. Verificado con el detector mecanico de
  Impeccable con `--scope layout` (0 hallazgos, en modo degradado por dependencias de parseo HTML no
  disponibles en este entorno) y confirmando que el dev server sigue sirviendo la ruta con HTTP 200
  tras el cambio. **Limitacion importante de este pase:** toda la verificacion en los tres anchos
  pedidos (320/375/390px), tablet 700-1039px, landscape corto y el comportamiento real del sticky en
  viewports cortos fue matematica sobre el CSS fuente, no una prueba visual en navegador real ni en
  emulador de dispositivo — no hay herramienta de automatizacion de navegador disponible en esta
  sesion. Se recomienda una verificacion visual real antes de considerar este pase
  definitivamente cerrado.

---

### 2026-08-17 — Relacion visual entre el resumen de hotel/tarifa y el formulario en `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable layout /reservar/solicitud/:slug/:rateId`,
  acotado a la relacion entre el resumen de hotel/tarifa y el formulario de datos del huesped)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** hallazgo P2 verificado de `$impeccable critique`/`audit` de esta misma sesion
  ("el contexto de hotel/tarifa no es sticky y desaparece al llenar el formulario"), resuelto con un
  tratamiento distinto por tamaño de viewport en vez de una sola solucion generica:
  - **Escritorio (≥1040px, donde `.booking-layout` ya era de 2 columnas):** `.booking-hotel-card`
    gana `position: sticky; top: 6rem; max-height: calc(100vh - 8rem); overflow-y: auto;` dentro del
    breakpoint existente — queda visible mientras se llena el formulario, con altura acotada y
    scroll propio si el contenido (highlights variables del hotel) fuera inusualmente largo, y sin
    invadir el contenido debajo de `.booking-layout` porque el sticky queda contenido por su propia
    fila de grid. No se toco el marcado ni el estilo de la tarjeta en si — la tarjeta sigue siendo
    exactamente la misma, solo cambia su comportamiento de scroll.
  - **Movil y tablet (<1040px, donde el layout ya era una sola columna apilada — se preservo esa
    decision explicitamente sin forzar 2 columnas a tablet, que habria comprimido el formulario):**
    en vez de un sticky grande (explicitamente pedido en contra), se agrego `.booking-context-summary`
    — una fila compacta de chips (hotel, tipo de habitacion + tarifa, fechas, huespedes) al inicio
    del formulario, justo debajo de "Datos del huesped" y antes de la grilla de campos, oculta en
    escritorio via el mismo breakpoint de 1040px (donde el sticky ya cumple ese rol, evitando
    contenido duplicado). Reutiliza exactamente el mismo estilo de pildora que ya usaba
    `.booking-summary` (mismos tokens `--accent`/`--primary-text`/`--primary-border-soft`, mismo
    radio 999px) via un selector combinado, en vez de inventar un lenguaje visual nuevo.
  - Se agrego un getter `dateRangeLabel` en `allied-booking-request.ts` (usa
    `Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })` sobre `criteria.dateRange`,
    ya cargado por el componente) porque las fechas eran el unico dato de la lista que pidio el
    usuario recordar ("hotel, habitacion/tarifa, fechas, huespedes, total estimado") que no tenia
    ninguna representacion textual en ningun punto de esta pagina — no se agrego ninguna dependencia
    nueva, es la API `Intl` nativa del navegador.
  - Los chips de resumen del final del formulario (`.booking-summary`: noches/habitaciones/
    huespedes/total) y el parrafo de garantia (`.booking-form-reassurance`, agregado en el pase de
    `$impeccable clarify` anterior de esta sesion) se envolvieron en un nuevo contenedor
    `.booking-confirm-group` (borde + fondo `var(--surface)` + radio 14px — mismos tokens que ya usan
    `.booking-search`/`.booking-results`/`.booking-rates`, ningun color nuevo) para que se lean como
    un solo bloque de confirmacion justo antes del boton de envio, en vez de dos elementos sueltos
    con margenes independientes.
- **Por qué:** hallazgo priorizado por el usuario tras los pases de `critique`/`audit`/`harden`/
  `clarify` anteriores de esta misma sesion, con requisitos explicitos y diferenciados por viewport
  (sticky acotado en escritorio, nada de sticky grande en movil, tablet sin comprimir el formulario)
  que esta entrada implementa uno a uno.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en los campos del formulario, copy, validaciones, wiring de accesibilidad,
  comportamiento de envio o logica de reserva — ni en el marcado o estilo propio de las tarjetas de
  hotel/tarifa, que no se rediseñaron. `.booking-context-summary` es una clase nueva usada solo en
  esta plantilla (verificado por `grep` que ninguna de las otras tres paginas que comparten
  `allied-booking.css` la usa), por lo que no afecta `allied-booking.html` ni
  `allied-booking-rates.html`. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico
  de Impeccable con `--scope layout` (0 hallazgos, en modo degradado por dependencias de parseo HTML
  no disponibles en este entorno) y confirmando que el dev server sigue sirviendo la ruta con HTTP
  200 tras el cambio. No se verifico visualmente en navegador (comportamiento sticky, ruptura de
  chips con nombres de hotel largos, o solapamiento en pantallas cortas) por no tener disponible una
  herramienta de automatizacion en esta sesion — es el riesgo residual mas relevante de este pase.

---

### 2026-08-17 — Copy de solicitud vs. reserva confirmada en `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable clarify /reservar/solicitud/:slug/:rateId`,
  acotado a copy de cara al usuario, claridad solicitud-vs-confirmacion, etiquetado
  requerido/opcional y mensajes de confianza)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** hallazgo P0 verificado de `$impeccable critique /reservar/solicitud/:slug/:rateId`
  de esta misma sesión ("Reserva vs. solicitud mismatch" — el copy sonaba a reserva ya confirmada
  antes de que el huesped enviara nada), corregido exactamente en el alcance pedido:
  - El parrafo de introduccion (`booking-lead`) deja de decir "registra la reserva directamente con
    el hotel aliado" y pasa a explicar que se envia una solicitud que el hotel revisara y confirmara
    antes de que la reserva quede en firme. El `h1` ("Completa tu solicitud de reserva") ya usaba la
    palabra correcta y no se toco.
  - El boton principal cambia de "Registrar reserva" / "Registrando..." a "Enviar solicitud de
    reserva" / "Enviando solicitud...", siguiendo textualmente la redaccion que pidio el usuario.
  - Se agrego un parrafo `.booking-form-reassurance` (icono `pi-shield`, ya usado en
    `landing.html` — no se invento un icono nuevo) justo antes del bloque de error/acciones,
    repitiendo en el punto de mayor friccion (justo antes del boton de envio) que el hotel debe
    confirmar disponibilidad antes de que la reserva sea definitiva.
  - El campo "Numero de documento" gana un `<small>` persistente (no condicionado a error, a
    diferencia del resto de hints de este formulario) explicando por que se pide: identificacion
    ante el hotel al momento del check-in — termino ya usado en `online-check-in.html` en este mismo
    proyecto. Su `id` se agrega al `aria-describedby` del campo junto al id de error existente
    (`'guestDocumentNumber-hint guestDocumentNumber-error'` cuando el campo es invalido, o solo el
    hint cuando es valido), sin tocar el wiring aria de los otros 5 campos que ya quedo resuelto en
    el pase de `$impeccable harden` anterior de esta sesion.
  - La etiqueta de "Comentarios" pasa a "Comentarios (opcional)" — el unico campo del formulario sin
    `Validators.required`, y el unico que el usuario pidio marcar explicitamente.
  - `resetRequest()` en `allied-booking-request.ts` se elimino en vez de exponerse como boton
    "Cancelar": el metodo limpiaba las 6 respuestas del formulario en un solo clic, sin
    confirmacion ni deshacer, y agregar una confirmacion modal habria sido una pieza de UI nueva
    fuera del alcance de un pase de copy. Se verifico por `grep` que seguia sin ninguna referencia
    en la plantilla antes de borrarlo.
- **Por qué:** hallazgos priorizados por el usuario tras `$impeccable critique` de esta misma
  sesion — el mismatch "reserva" vs. "solicitud" (P0), la ausencia de contexto sobre por que se
  pide el numero de documento, y el metodo `resetRequest()` sin usar que el pase de `$impeccable
  audit` ya habia marcado como codigo muerto en vez de una accion "Cancelar" real.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en estructura del formulario, validaciones, wiring de accesibilidad ya
  existente, tarjeta de resumen, comportamiento responsivo o logica de reserva — cambio acotado a
  texto visible, un parrafo nuevo con estilos aditivos (`.booking-form-reassurance`, reutiliza
  tokens `--muted`/`--primary` existentes, ningun color nuevo) y la eliminacion de un metodo sin
  referencias. Verificado con `npx tsc --noEmit` (sin errores), el detector mecanico de Impeccable
  (0 hallazgos, en modo degradado por dependencias de parseo HTML no disponibles en este entorno) y
  confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verifico
  visualmente en navegador por no tener disponible una herramienta de automatizacion en esta sesion.

---

### 2026-08-17 — Accesibilidad de formulario y jerarquía de encabezados en `/reservar/solicitud/:slug/:rateId`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar/solicitud/:slug/:rateId`,
  acotado a accesibilidad de formulario, feedback de validación y semántica de encabezados)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** hallazgos P0/P2 verificados de `$impeccable audit /reservar/solicitud/:slug/:rateId`
  de esta misma sesión, corregidos exactamente en el alcance pedido:
  - Los 6 controles del formulario de `AlliedBookingRequestPage` (`guestName`, `guestEmail`,
    `guestPhone`, `guestDocumentType`, `guestDocumentNumber`) ganan `[attr.aria-invalid]` y
    `[attr.aria-describedby]` atados a `isInvalid()`, replicando el patrón `aria-describedby` que
    `allied-booking.html` (paso 1 del mismo flujo) ya usaba correctamente y que este paso 3 —
    el que pide más datos personales — nunca tuvo.
  - Cada mensaje de error (`<small>`) gana un `id` estable (`<campo>-error`) que el `aria-describedby`
    de su control referencia, y la clase `booking-hint-error` — definida en `allied-booking.css` desde
    antes de esta sesión pero sin ningún uso real en esta plantilla — para que el error sea
    visualmente distinguible (color `--danger`) y no solo textual.
  - Los tres encabezados de estado (`Cargando solicitud`, `No fue posible cargar hoteles`,
    `Solicitud incompleta`) pasan de `h3` a `h2`: cada uno es el único encabezado bajo el `h1` de la
    página en su rama de `*ngIf` (loading / error / criterios incompletos son mutuamente
    excluyentes con la sección del formulario, que sí trae sus propios `h2`), así que no había ningún
    `h2` intermedio y el salto de nivel era real, no un patrón intencional.
  - `allied-booking.css` gana el selector `.booking-empty h2, .booking-empty h3 { ... }` — aditivo,
    no un reemplazo — para que los nuevos `h2` conserven exactamente el mismo tratamiento visual que
    tenían como `h3`, sin tocar el `h3` que siguen usando sin cambios los estados vacíos de
    `allied-booking.html` y `allied-booking-rates.html`, que comparten el mismo archivo de estilos.
- **Por qué:** hallazgos P0 ("Sin `aria-invalid`/`aria-describedby` en los 6 controles") y P2
  ("regla `.booking-hint-error` definida pero nunca aplicada" + "salto de encabezados h1→h3") de
  `$impeccable audit /reservar/solicitud/:slug/:rateId` de esta misma sesión — verificados con
  `grep` antes de tocar código (cero coincidencias de `booking-hint-error` y de `aria-describedby`
  en esta plantilla, a diferencia de `allied-booking.html`).
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en layout, copy, lógica de reserva, comportamiento responsivo, tokens,
  tarjeta de resumen o comportamiento de envío — el componente `.ts` no se tocó. Cambio acotado a
  atributos ARIA (invisibles salvo para tecnología de asistencia), a la aparición del color de error
  ya existente solo cuando un campo es inválido (antes se veía en gris neutro), y al nivel semántico
  de tres encabezados que ya se veían igual pero se anunciaban con el nivel incorrecto. Verificado
  con `npx tsc --noEmit` (sin errores, aunque el `.ts` no cambió), el detector mecánico de Impeccable
  (0 hallazgos, en modo degradado por dependencias de parseo HTML no disponibles en este entorno) y
  confirmando que el dev server sigue sirviendo la ruta con HTTP 200 tras el cambio. No se verificó
  visualmente en navegador por no tener disponible una herramienta de automatización en esta sesión.

---

### 2026-08-16 — Proteger `/reservar/tarifas/:slug` contra solicitudes en carrera

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar/tarifas/:slug`,
  acotado a concurrencia de solicitudes y seguridad de reintento)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `AlliedBookingRatesPage` nunca tuvo protección contra solicitudes en carrera —
  ni siquiera antes de esta sesión —, a diferencia de `searchAvailability()` en `/reservar`, que ya
  descarta respuestas obsoletas con un `availabilityRequestId` incremental (verificado por `grep`
  en `$impeccable audit /reservar/tarifas/:slug` de esta misma sesión: cero coincidencias de
  "requestId" en todo el archivo). Se replicó exactamente el mismo patrón y el mismo estilo de
  código ya usado en `/reservar`:
  - `requestId: number` privado, incrementado al inicio de cada intento (`loadHotels()` y
    `retrySearchAvailability()`), propagado explícitamente a `loadAvailableRates()` como segundo
    parámetro en vez de leerlo implícitamente — así una llamada encadenada desde `loadHotels()`
    conserva el mismo id que su intento padre, mientras que una reintentona directa de
    disponibilidad (`retrySearchAvailability()`) obtiene un id nuevo y propio.
  - Cada `subscribe()` y cada `catchError()` verifica `requestId === this.requestId` antes de
    aplicar su resultado — si una solicitud más nueva ya se disparó mientras la anterior seguía en
    vuelo, la respuesta obsoleta se descarta en silencio en vez de sobrescribir el estado con datos
    viejos.
  - `retryLoadHotels()` y `retrySearchAvailability()` ganan una guarda `if (this.loadingHotels)
    return;` al inicio, como defensa adicional a nivel de estado (no depende del DOM ni del ciclo
    de detección de cambios de Angular).
  - Los dos botones "Reintentar" ganan `[disabled]="loadingHotels"`, tal como pidió explícitamente
    el usuario. Al revisar el estado `:disabled` existente se encontró que solo `.booking-primary`
    tenía una regla `:disabled` explícita (opacidad + `cursor: not-allowed`) — `.booking-secondary`
    (la clase de estos botones) no tenía ninguna, así que sin agregarla el atributo `disabled`
    habría quedado con la apariencia por defecto del navegador en vez de un estado visual
    intencional y coherente con el resto del sistema. Se agregó `.booking-secondary:disabled`
    reutilizando exactamente los mismos valores que ya usa `.booking-primary:disabled` — una
    corrección aditiva y compartida que no cambia nada del estado no-deshabilitado en ningún botón
    secundario existente en las cuatro páginas del flujo.
- **Por qué:** hallazgo P2 verificado de `$impeccable audit /reservar/tarifas/:slug` de esta misma
  sesión — el mismo patrón de protección que ya existía en `/reservar`, nunca implementado aquí, ni
  siquiera antes de que esta sesión agregara los botones de reintento que lo hacían más fácil de
  disparar.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno en la interfaz visible, copy, tarjetas de tarifa, comportamiento responsivo,
  etiquetado de disponibilidad, query params o mensajes de reintento existentes — cambio acotado a
  lógica de concurrencia y al nuevo estado `:disabled` (invisible salvo cuando un botón secundario
  está efectivamente deshabilitado en cualquier página del flujo). Verificado con
  `npx tsc --noEmit` (sin errores), el detector mecánico de Impeccable (sin hallazgos), confirmando
  por `grep` que el guardado por `requestId` cubre las cuatro rutas de código que antes no lo
  tenían, y que el bundle servido por el dev server compiló el cambio sin marcadores de error. No
  se verificó visualmente en navegador por no tener disponible una herramienta de automatización en
  esta sesión.

---

### 2026-08-16 — Pulido final de las tarjetas de tarifa de `/reservar/tarifas/:slug`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable polish /reservar/tarifas/:slug`,
  acotado a consistencia visual final de las tarjetas de habitación/tarifa)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** comparación exhaustiva, propiedad por propiedad, entre `.booking-rate-select-*`
  (tarjetas de tarifa) y `.booking-result-*` (tarjetas de hotel de `/reservar`, ya pulidas en
  pasadas anteriores) contra cada punto que pidió el usuario: espaciado, jerarquía tipográfica,
  prominencia del precio, estados del CTA, bordes/divisores/sombras, presentación de
  imagen/respaldo, y estados de interacción. El resultado: la tarjeta de tarifa ya coincidía
  byte a byte con la de hotel en prácticamente todas las propiedades compartidas (tarjeta, media,
  ícono de respaldo, insignia, cuerpo, `h3`, precio, CTA, divisores por breakpoint) — un resultado
  esperado, ya que las pasadas de `bolder` y `adapt` de esta misma sesión construyeron la tarjeta
  de tarifa reutilizando deliberadamente esos mismos valores. Las diferencias encontradas (precio
  de tarifa sin la línea "Desde" que sí tiene el de hotel; disponibilidad/capacidad como lista con
  íconos en vez de una sola píldora) están justificadas por diferencias reales en el contenido —
  precio de tarifa es un valor exacto, no un "desde"; hay tres datos de meta información en vez de
  uno — y se dejaron como están en vez de forzar una uniformidad superficial que habría ido en
  contra de la propia jerarquía. Estados de hover/focus/active/disabled del CTA y de la tarjeta ya
  estaban cubiertos por las reglas compartidas (`.booking-primary`, `.booking-page :focus-visible`)
  corregidas en pasadas anteriores de esta sesión.
  - **Limpieza de código muerto**: se eliminó `.booking-option-description`, una regla sin ningún
    uso en el proyecto (verificado por `grep`, cero coincidencias en cualquier plantilla) que
    llevaba ahí desde antes de esta sesión, ubicada justo en medio del bloque de
    `.booking-rate-select-*` que se ha estado modificando activamente — su nombre, muy parecido al
    de `.booking-rate-select-description` que está justo al lado, generaba una confusión real sobre
    si estaba relacionada.
- **Por qué:** pasada final de pulido pedida explícitamente por el usuario, centrada en verificar
  que las tarjetas de tarifa recién rediseñadas sostuvieran el mismo nivel de consistencia visual
  que ya tienen las tarjetas de hotel de `/reservar`.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno visual ni funcional — la única modificación fue eliminar una regla CSS ya
  huérfana. Verificado con `npx tsc --noEmit` (sin errores), el detector mecánico de Impeccable
  (sin hallazgos), y confirmando por HTTP que las cuatro rutas del flujo de reserva
  (`/reservar`, `/reservar/tarifas/:slug`, `/reservar/solicitud/:slug/:rateId`,
  `/reservar/confirmacion/:id`) siguen sirviendo `200` tras el cambio al archivo de estilos
  compartido. No se verificó visualmente en navegador por no tener disponible una herramienta de
  automatización en esta sesión.

---

### 2026-08-16 — Verificar y corregir móvil/tablet en las tarjetas de `/reservar/tarifas/:slug`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable adapt /reservar/tarifas/:slug for
  mobile and tablet`, centrado en las tarjetas de habitación/tarifa recién rediseñadas)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** verificación por aritmética (sin navegador disponible en esta sesión) de las
  tarjetas `.booking-rate-select-card` en los anchos explícitamente pedidos por el usuario —
  320px, 375px y 390px de móvil, el rango de tablet 700–1039px, y móvil en horizontal con poca
  altura — recalculando ancho de contenedor menos gutters, padding de `.booking-rates`, columnas
  de la tarjeta y ancho disponible para texto en cada caso. El patrón ya estaba probado (es el
  mismo que `$impeccable adapt` verificó y corrigió para las tarjetas de hotel de `/reservar`), así
  que la mayoría de los puntos ya sostenían: objetivos táctiles (heredados de `.booking-primary`,
  ya en 48px), espaciado entre tarjetas (`.booking-rate-grid` ya en `gap: 1.25rem`, igual que
  `.booking-options`), la franja de horizontal-con-poca-altura (ya cubierta por la regla compartida
  del hero, y `.booking-rate-select-media` ya tenía su propio `max-height: 150px` desde la pasada
  de `bolder`), y el ancho de precio/CTA en las tres configuraciones responsivas.
  - **Hallazgo real y corregido**: `.booking-rate-select-media-fallback` no tenía relleno
    horizontal (`padding`), a diferencia de que el texto que muestra (`rate.roomType`) es texto
    libre y mucho más largo y variable que el `type` de hotel del panel equivalente de
    `/reservar` (p. ej. "Cama en habitación compartida", 30 caracteres, frente a un máximo de 22
    en los tipos de hotel). A 320px de ancho de viewport (256px de ancho de tarjeta calculado), el
    texto podía llegar a tocar los bordes de la tarjeta sin ningún margen. Se agregó
    `padding: 0 1.25rem`, la misma unidad de espaciado horizontal ya usada en el resto de la
    tarjeta (`.booking-rate-select-body`, `.booking-rate-select-side`).
  - Se revisó pero **no se tocó** el panel equivalente de `/reservar`
    (`.booking-result-media-fallback`), que comparte la misma carencia de relleno: los valores de
    `hotel.type` son un conjunto cerrado y corto (máximo 22 caracteres, verificado que no desborda
    a 320px), y tocar ese archivo habría sido rediseñar "otro paso de reserva", fuera del alcance
    explícito de esta pasada.
- **Por qué:** el usuario pidió verificar y mejorar específicamente las tarjetas rediseñadas de
  esta misma sesión en móvil y tablet, en los anchos exactos que detalló.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno funcional; una sola propiedad `padding` agregada a una regla ya introducida
  en la pasada de `bolder` de esta misma tarjeta. Verificado con `npx tsc --noEmit` (sin errores),
  el detector mecánico de Impeccable en modo `--scope layout` y escaneo completo (ambos sin
  hallazgos), y confirmando que el bundle servido por el dev server compiló el cambio sin
  marcadores de error. Los cálculos de ancho a 320/375/390px y en el rango de tablet se verificaron
  por aritmética sobre los valores reales de `--container`, `padding` y `grid-template-columns`,
  no por captura de pantalla — no había disponible una herramienta de automatización de navegador
  en esta sesión, igual que en todas las corridas anteriores.

---

### 2026-08-16 — Rediseñar las tarjetas de tarifa de `/reservar/tarifas/:slug` con imagen y jerarquía

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable bolder /reservar/tarifas/:slug`,
  acotado explícitamente a las tarjetas de habitación/tarifa)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** rediseño acotado a las tarjetas de tarifa (`.booking-rate-card` →
  `.booking-rate-select-card`), aplicando exactamente el mismo sistema visual que
  `$impeccable bolder` ya construyó para las tarjetas de hotel de `/reservar`, sin tocar el
  encabezado/hero compartido, los query params, la lógica de reintento ni las correcciones de
  idioma de la pasada anterior:
  - `AlliedRoomRate` (`shared/allied-hotels.ts`) gana un campo opcional `imageUrl?: string`,
    reflejando exactamente el mismo campo ya agregado a `AlliedHotel`. Ningún dato de ejemplo
    actual lo define — es infraestructura lista para fotos reales de habitaciones específicas,
    igual que en el paso anterior.
  - Para el caso sin foto (el único caso real hoy), el panel de respaldo reutiliza textualmente el
    mismo degradado radial sobre `var(--ink)` que ya usa la tarjeta de hotel — misma intención de
    consistencia visual entre pasos que pidió el usuario — con un ícono según el tipo de
    habitación. Se agregó `getRoomTypeIcon()` en `allied-booking-flow.ts`: como `roomType` es texto
    libre (a diferencia del tipo de hotel, que es un conjunto cerrado), se resolvió con reglas por
    palabra clave sobre el texto normalizado (sin tildes): "suite"→`pi-star`, "cabana"→`pi-home`,
    "compartid"→`pi-users`, "apartamento"→`pi-building`, con `pi-building` como respaldo para
    "estándar", "superior", "ejecutiva" y cualquier tipo no reconocido.
  - La insignia de `rate.rateName` (p. ej. "Flexible", "No reembolsable", "Con desayuno") ahora
    flota sobre la imagen/panel como insignia de política — es el campo más cercano a "condición de
    cancelación/reembolso" que existe en el modelo de datos actual (no hay un campo estructurado
    separado para eso), así que se le dio prominencia visual clara en vez de inventar una nueva
    taxonomía de políticas no respaldada por los datos.
  - Jerarquía reforzada dentro de la tarjeta: nombre de habitación (`h3`, `1.35rem`/900, antes
    `1.12rem`), descripción, capacidad, disponibilidad (con la etiqueta "Disponibilidad estimada"
    de la pasada de `clarify` anterior intacta), precio (`1.85rem`/900, antes `1.15rem`) y el CTA
    "Elegir tarifa" ahora en `.booking-primary` a ancho completo de su columna — la misma jerarquía
    y el mismo lenguaje visual que ya tienen las tarjetas de hotel.
  - Precio y CTA vuelven a vivir en una columna lateral consistente (`.booking-rate-select-side`)
    en las tres mismas configuraciones responsivas que las tarjetas de hotel: apilado en móvil,
    imagen a la izquierda + contenido apilado en tablet (`700–1039px`), y tres columnas en
    escritorio (`≥1040px`) — así que comparar precio entre varias tarifas al desplazarse por la
    lista siempre encuentra el precio en la misma posición visual, en cualquier ancho de pantalla.
  - Como `.booking-rate-card`/`.booking-rate-price`/`.booking-rate-grid`/`.booking-rate-selected`
    solo se usaban en este archivo (verificado por `grep` antes de tocar nada — a diferencia de
    `.booking-badge`, que sigue intacto y compartido), se retiraron por completo en vez de
    mantenerse en paralelo; `.booking-rate-selected` ya era una clase muerta (nunca se aplicaba
    dinámicamente en ningún template) y no se volvió a crear su equivalente.
- **Por qué:** el usuario pidió explícitamente que la experiencia de selección de tarifa se
  sintiera como una reserva de hotel real en vez de una lista administrativa, replicando
  exactamente el sistema ya construido para `/reservar`, manteniendo comparables precio y CTA entre
  opciones y preservando la etiqueta de honestidad de disponibilidad ya implementada.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-flow.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `frontend/src/app/shared/allied-hotels.ts`, `AGENTS.md`.
- **Impacto:** Ninguna migración ni cambio de API — `imageUrl` en `AlliedRoomRate` es opcional y
  compatible hacia atrás. No se tocó el encabezado/hero compartido, los query params, la lógica de
  reintento (`retryLoadHotels`/`retrySearchAvailability`) ni las correcciones de idioma de la
  pasada de `clarify` anterior, todas verificadas intactas tras el cambio. Verificado con
  `npx tsc --noEmit` (sin errores), el detector mecánico de Impeccable (sin hallazgos), confirmando
  por `grep` que las clases CSS retiradas no dejaron ninguna referencia huérfana en ningún archivo
  del directorio, y que el bundle servido por el dev server compiló el cambio sin marcadores de
  error en los cuatro chunks del flujo de reserva. No se verificó visualmente en navegador por no
  tener disponible una herramienta de automatización en esta sesión.

---

### 2026-08-16 — Corregir idioma y honestidad de disponibilidad en `/reservar/tarifas/:slug`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable clarify /reservar/tarifas/:slug`,
  acotado a corrección del español, pluralización y honestidad de disponibilidad)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:**
  - Se restauraron las tildes faltantes en todo el texto visible de `allied-booking-rates.html`
    ("Navegacion"→"Navegación", "sesion"→"sesión", "habitacion"→"habitación" ×3, "busqueda"→
    "búsqueda" ×3, "huesped(es)"→"huéspedes", "esta activo"→"está activo") — verificado con `grep`
    exhaustivo antes y después del cambio, cero coincidencias restantes.
  - Se reemplazaron las tres pluralizaciones literales por texto condicional correcto: "tarifa(s)"
    → `{{ n === 1 ? 'tarifa' : 'tarifas' }}`, "huesped(es)" → `{{ maxGuests === 1 ? 'huésped' :
    'huéspedes' }}`, "disponible(s)" → ver el punto siguiente (se resolvió junto con la honestidad
    de disponibilidad, ya que ambos afectaban la misma línea).
  - **Honestidad de disponibilidad de tarifa**: `getAvailableRoomRateCount(rate)` cae en el mismo
    patrón de estimación por hash que ya tenía `getAvailableRoomCount(hotel)` en `/reservar` cuando
    `rate.availableRooms` no viene en los datos (que es siempre el caso hoy — ningún dato de
    ejemplo lo define). Antes se mostraba como "{{n}} disponible(s)" sin ninguna distinción. Se
    agregó `isAvailableRoomRateCountEstimated(rate)` en `allied-booking-flow.ts` — el mismo patrón
    exacto que `isAvailableRoomCountEstimated(hotel)` ya usa en `/reservar`, aplicado al nivel de
    tarifa en vez de al nivel de hotel — y el template ahora bifurca en dos `<li>` (con
    pluralización correcta en ambas ramas): "Disponibilidad estimada: N habitación(es)" cuando el
    dato es estimado, o "N habitación(es) disponible(s)" cuando es un valor real.
- **Por qué:** el usuario pidió explícitamente reflejar en esta página el mismo patrón de
  honestidad ya implementado en `/reservar`, más la corrección general de acentos y pluralización
  ya identificada como hallazgo P1/P2 en `$impeccable audit /reservar/tarifas/:slug` de esta misma
  sesión.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-flow.ts`, `AGENTS.md`.
- **Impacto:** Ninguno en layout, estructura de las tarjetas de tarifa, lógica de reintento, query
  params, precios o estilos — cambio acotado a texto y a un nuevo getter derivado de datos ya
  existentes (sin nuevos campos, migraciones ni cambios de API). Verificado con
  `npx tsc --noEmit` (sin errores), el detector mecánico de Impeccable (sin hallazgos), un barrido
  exhaustivo por `grep` confirmando cero acentos faltantes y cero patrones `(s)`/`(es)` restantes
  en el archivo, y confirmando que el bundle servido por el dev server compiló el cambio sin
  marcadores de error y que la ruta sigue sirviendo `200`. No se verificó visualmente en navegador
  por no tener disponible una herramienta de automatización en esta sesión.

---

### 2026-08-16 — Añadir recuperación de errores en `/reservar/tarifas/:slug`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar/tarifas/:slug`,
  acotado a recuperación de errores)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `AlliedBookingRatesPage` (paso 2 del flujo de reserva) tenía el mismo callejón
  sin salida que `AlliedBookingPage` (paso 1) tenía antes de la pasada de `harden` de esta misma
  sesión: si la carga inicial de hoteles o la consulta de disponibilidad fallaban, el mensaje
  describía el problema pero no ofrecía ninguna acción de recuperación — solo una recarga completa
  de la página. Se replicó exactamente el mismo patrón ya implementado en `/reservar`:
  - `hotelsLoadErrorContext: 'initial' | 'availability'` distingue cuál de las dos llamadas falló
    (`loadHotels()` vs `loadAvailableRates()`), igual que en `allied-booking.ts`.
  - `retryLoadHotels()` reinvoca `loadHotels()`. `retrySearchAvailability()` reinvoca
    `loadAvailableRates()` con el slug del hotel (promovido de constante local a campo privado
    `hotelSlug` para que la reintentona pueda acceder a él), pero primero restablece
    `loadingHotels = true` y limpia `hotelsLoadError` — `loadAvailableRates()` en sí no gestiona su
    propio estado de carga (siempre se invocaba justo después de que `loadHotels()` ya lo hubiera
    hecho), así que sin ese paso el botón de reintentar habría disparado la consulta en segundo
    plano sin ninguna señal visual de que algo estaba pasando.
  - El bloque único `*ngIf="!loadingHotels && hotelsLoadError"` se dividió en dos, uno por
    contexto, cada uno con su propio botón "Reintentar" — misma estructura, mismas clases
    (`.booking-empty`, `.booking-secondary`, ícono `pi-refresh`) que ya usa `/reservar`. El
    encabezado del caso de disponibilidad ("No fue posible consultar disponibilidad") no existía
    antes en esta página porque el bloque único nunca distinguía los dos casos; se tomó
    textualmente del mismo encabezado que ya usa `/reservar` para ese mismo escenario.
- **Por qué:** hallazgo P1 verificado de `$impeccable audit /reservar/tarifas/:slug` en esta misma
  sesión — el mismo defecto que `harden` ya había corregido un paso antes en el flujo, nunca
  propagado aquí.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-rates.html`, `AGENTS.md`.
- **Impacto:** Ninguno en el layout de las tarjetas de tarifa, copy existente, lógica de
  disponibilidad, estilos o comportamiento de query params — no se agregó CSS nueva, se
  reutilizaron íntegramente `.booking-empty`/`.booking-secondary`, ya definidas en el archivo de
  estilos compartido. No se tocó ningún otro paso del flujo de reserva. Verificado con
  `npx tsc --noEmit` (sin errores), el detector mecánico de Impeccable (sin hallazgos) y
  confirmando que el bundle servido por el dev server compiló `retryLoadHotels`/
  `retrySearchAvailability` sin marcadores de error y que la ruta sigue sirviendo `200`. No se
  verificó visualmente en navegador por no tener disponible una herramienta de automatización en
  esta sesión.

---

### 2026-08-16 — Pulido final de `/reservar`: contraste AA del azul primario y estados de botón

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable polish /reservar`, acotado a
  consistencia visual, contraste, estados de botón, detalle de tarjetas, bordes, sombras y
  tipografía)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:**
  - **Contraste AA del texto en azul primario sobre fondos claros**: `critique` y `audit` ya habían
    señalado que `--primary` (`#2c7be5`) sobre blanco computa ~4.14:1, bajo el mínimo de 4.5:1 que
    exige WCAG AA (1.4.3) para texto normal. Verificado por cálculo de luminancia relativa
    (fórmula WCAG), no por herramienta externa. Se agregó `--primary-text: #2369c5` — el mismo
    valor hexadecimal que ya existía como `--primary-hover`, reutilizado (no inventado) porque ya
    cumple 5.39:1 sobre blanco y 4.90:1 sobre `--accent`, ambos por encima del mínimo — y se aplicó
    únicamente a los usos de `--primary` como **color de texto** sobre fondo claro: el enlace de
    navegación "Hoteles aliados", la píldora de "N resultados", la insignia "Aliado Wayra", los
    chips de `.booking-summary` y `.booking-confirmation-details`, y `.booking-kicker` en su
    contexto de tarjeta blanca (encabezado de resultados, copy de confirmación). El botón primario
    (`background: var(--primary)`, texto blanco) **no se tocó** — se dejó exactamente como estaba,
    por instrucción explícita del usuario, aunque comparte la misma relación de contraste
    (~4.14:1) que el texto que sí se corrigió; ese hallazgo relacionado se deja documentado aquí,
    no resuelto.
  - **Caso especial — `.booking-kicker` en el hero**: esta clase se usa en 8 lugares de las cuatro
    páginas del flujo de reserva; en 6 de esos 8 sitios el fondo es una tarjeta blanca, pero en 2
    (el kicker "Paso N de 3" dentro del hero oscuro) el fondo es `var(--ink)`. Cambiar el color
    base habría corregido los 6 casos blancos pero empeorado el contraste en el hero (un azul más
    oscuro sobre un fondo ya oscuro reduce el contraste, no lo mejora). Se agregó una regla más
    específica `.booking-hero .booking-kicker { color: var(--primary); }` que restaura el color
    original solo ahí — el hero queda exactamente igual que antes de este cambio, sin tocarlo, tal
    como pidió el usuario ("small text on white backgrounds").
  - **Estados de botón faltantes**: `.booking-primary`, `.booking-secondary` y
    `.booking-destination-option` no tenían ningún estado `:active` (retroceso táctil al soltar el
    clic) en todo el archivo — verificado por búsqueda exhaustiva, cero coincidencias. Se agregó
    `transform: translateY(0)` en el press de los botones principales y un fondo `--accent` en el
    press de las opciones de destino, reutilizando la misma transición ya declarada en la regla
    base (sin nueva propiedad de animación).
  - Los botones "Cancelar"/"Aceptar" del selector de rango de fechas (`::ng-deep
    .booking-date-range-cancel/-accept`) no tenían **ningún** estado interactivo — ni `:hover` ni
    transición — a diferencia de `.booking-primary`/`.booking-secondary`, cuyo lenguaje visual
    imitan. Se agregó `transition`, `:hover` (reutilizando exactamente los mismos tokens y valores
    que sus equivalentes `.booking-primary`/`.booking-secondary`) y `:active`.
- **Hallazgos verificados pero dejados fuera de alcance, documentados para una pasada futura**:
  - El botón primario comparte la misma relación de contraste ~4.14:1 que el texto corregido en
    este cambio, pero el usuario pidió explícitamente no tocar el color del botón primario.
  - `allied-booking.css` usa `font-weight: 850` y `900` en 21 declaraciones, pero
    `frontend/src/styles.css` solo carga las fuentes variables Manrope (peso `200 800`) y Sora
    (peso `100 800`) — cualquier peso por encima de 800 se recorta silenciosamente al máximo
    disponible del archivo de fuente (800), sin error visible. Verificado leyendo las declaraciones
    `@font-face` reales, no por renderizado. Es un patrón preexistente y de todo el sitio —
    `landing.css` y `allied-hotels.css` usan el mismo rango 700–900 — por lo que corregirlo solo en
    `allied-booking.css` dejaría el código fuente inconsistente con sus páginas hermanas sin
    ningún cambio visible (el resultado renderizado ya es idéntico en los tres archivos, recortado
    a 800 en los tres). Corregirlo bien requiere una pasada a nivel de sitio, fuera del alcance de
    `polish /reservar`.
- **Por qué:** el usuario pidió esta pasada final centrada explícitamente en consistencia visual,
  contraste de accesibilidad, estados de botón, detalle de las tarjetas de hotel, bordes, sombras y
  tipografía, preservando layout, comportamiento responsivo, copy, lógica de reserva, el sistema de
  imagen de respaldo y la estructura de tokens — con atención especial al azul primario como texto
  pequeño sobre fondos blancos, sin cambiar el color del botón primario.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguna migración, variable de entorno ni cambio de API. Cambio de color acotado
  exclusivamente a usos de texto (nunca a fondos de botón) más adición de estados `:active`/`:hover`
  que no existían. Verificado con `npx tsc --noEmit` (sin errores), el detector mecánico de
  Impeccable (sin hallazgos) y confirmando por HTTP que las cuatro rutas del flujo de reserva
  siguen sirviendo `200` con el nuevo token compilado en sus cuatro chunks. Los cálculos de
  contraste se verificaron aplicando la fórmula de luminancia relativa de WCAG a mano sobre los
  valores hexadecimales reales, no con una herramienta de contraste ni una captura de pantalla — no
  había disponible una herramienta de automatización de navegador en esta sesión, igual que en
  todas las corridas anteriores sobre este mismo objetivo.

---

### 2026-08-16 — Consolidar los colores repetidos de `allied-booking.css` en tokens

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable extract /reservar`, acotado
  explícitamente a tokens de color en `allied-booking.css`)
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** un inventario exhaustivo (`grep` de todos los `rgba()`/hex del archivo, no solo
  lectura manual) encontró 16 usos de `rgba(44, 123, 229, …)` (el RGB de `--primary` repetido en
  literal), 5 usos de `rgba(255, 255, 255, …)`, 4 de `rgba(17, 24, 39, …)` (el RGB de `--ink`,
  incluyendo dentro de las propias definiciones de `--shadow-card`/`--shadow-elevated`), 2 de
  `rgba(220, 38, 38, …)` (el RGB de `--danger`) y 2 del hexadecimal suelto `#b9c4d2`. Se agregaron
  al bloque de tokens de `.booking-page`:
  - Primitivos de canal RGB: `--primary-rgb`, `--ink-rgb`, `--white-rgb`, `--danger-rgb` — cada uno
    es literalmente los mismos tres números que ya estaban repetidos por todo el archivo, ahora
    declarados una sola vez.
  - Tokens semánticos derivados, para los valores que se repetían 2–5 veces con la misma intención:
    `--primary-border-soft` (alpha 0.18 × 5, bordes de píldoras/tarjetas con tinte primario),
    `--primary-border-strong` (alpha 0.28 × 3, borde de hover de tarjetas y anillo de foco),
    `--primary-focus-glow` (alpha 0.16 × 2, resplandor de foco en inputs) e `--input-hover` (el
    hexadecimal `#b9c4d2` × 2, borde de hover en inputs de texto y el date-picker).
  - Los usos que compartían el mismo canal RGB pero con un alpha que NO se repetía en otro lugar
    (por ejemplo el resplandor del hero a 0.22, el del panel de respaldo de la tarjeta a 0.32, el
    hover del botón secundario a 0.34) se dejaron con su alpha literal exacto, solo cambiando el
    canal de color a `rgba(var(--primary-rgb), X)` — se resistió la tentación de forzarlos a
    compartir un token con otro uso solo porque el número de alpha coincidía por casualidad; un
    borde, un resplandor de gradiente y una sombra de botón no son la misma decisión de diseño
    aunque compartan opacidad.
  - Se dejaron intactos, sin tokenizar, los colores hexadecimal que aparecen una sola vez en todo
    el archivo (`#fff7f7`, `#f8fbff`): no hay repetición que consolidar ahí, y la propia guía de
    `extract` advierte explícitamente contra crear tokens para valores usados una sola vez.
- **Por qué:** el usuario pidió consolidar específicamente los `rgba(44, 123, 229, …)` repetidos y
  los colores sueltos recurrentes, preservando la apariencia renderizada exactamente. Este mismo
  hallazgo ya lo había señalado `$impeccable audit` como P2 ("Token drift") varias pasadas atrás en
  esta sesión.
- **Compatibilidad con el resto del flujo de reserva:** `allied-booking.css` es el `styleUrl`
  compartido por `allied-booking.ts`, `-rates.ts`, `-request.ts` y `-confirmation.ts`. La técnica
  usada (`rgba(var(--x-rgb), alpha)`) es matemáticamente idéntica en su color computado al literal
  `rgba(r, g, b, alpha)` que reemplaza — no es una aproximación ni un ajuste de tono, así que no
  hay riesgo de que el color visible cambie en ninguna de las cuatro páginas. Se confirmó
  descargando los cuatro chunks JS compilados que sirve el dev server para estas rutas y
  verificando que ninguno conserva ya un triplete de color sin tokenizar.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno visual ni funcional — cambio puramente de origen del valor (literal → token
  matemáticamente equivalente), sin tocar markup, layout, espaciado, tipografía, comportamiento
  responsivo ni lógica. Verificado con `npx tsc --noEmit` (sin errores), el detector mecánico de
  Impeccable (sin hallazgos) y confirmando por HTTP que las cuatro rutas del flujo de reserva
  siguen sirviendo `200`. No se verificó visualmente en navegador por no tener disponible una
  herramienta de automatización en esta sesión; la equivalencia de color se sostiene en la
  semántica garantizada por la especificación de CSS Custom Properties, no en una captura de
  pantalla.

---

### 2026-08-16 — Adaptar `/reservar` a móvil, tablet y orientación horizontal corta

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable adapt /reservar for mobile and
  tablet`)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:**
  - **Objetivos táctiles**: `.booking-header nav a` pasó de `min-height: 40px` a `44px`, y
    `.booking-view-back` (el enlace "Volver" sobre el hero) de `32px` a `44px` — ambos por debajo
    de la guía de 44×44px para móvil que `$impeccable audit` ya había señalado como P3. El offset
    vertical de `.booking-view-back` (`top: -3.55rem`) no cambió: con la altura nueva sigue
    quedando dentro del padding del hero sin solaparse con el kicker/h1 de abajo (verificado por
    cálculo, sin renderizado en vivo disponible).
  - **Tarjetas de resultado en tablet** (`768–1023px` es el rango de tablet estándar; este proyecto
    ya usa `700–1039px` como su propio rango de tablet establecido, así que se mantuvo esa
    convención): antes de este cambio, las tarjetas de `$impeccable bolder` solo tenían dos
    estados — apiladas (imagen arriba a `aspect-ratio: 16/10`) por debajo de `1040px`, o el
    diseño de tres columnas de escritorio a partir de `1040px`. En una tablet en vertical
    (`768–834px` típico), eso significaba una imagen de hasta ~520px de alto solo para la foto,
    antes de siquiera llegar al nombre del hotel. Se agregó un nivel intermedio propio de tablet
    (`700–1039px`, rango acotado para no heredar nada del nivel de escritorio): imagen a la
    izquierda (`minmax(200px, 38%)`) y nombre/ubicación + disponibilidad/precio/CTA apilados a la
    derecha, con un divisor horizontal (`border-top`) entre ambos bloques en vez del divisor
    vertical que usa escritorio. Es el patrón de "layout de dos columnas" que la propia guía de
    `adapt` recomienda para tablet, distinto tanto del apilado de móvil como de las tres columnas
    de escritorio.
  - **Móvil en horizontal con poca altura** (p. ej. un iPhone acostado, ~375–430px de alto): se
    agregó `@media (orientation: landscape) and (max-height: 500px)` que reduce el padding vertical
    del hero (`4.5rem/3rem` → `2rem/1.5rem`), reajusta el offset de `.booking-view-back` a `-1rem`
    para que seguir cabiendo dentro del padding reducido sin solaparse, y limita la imagen de la
    tarjeta de resultado a `max-height: 150px` en vez de dejarla a `aspect-ratio: 16/10` (que en un
    teléfono acostado de ~690px de ancho ocuparía ~430px de alto, es decir, más que la altura
    completa de la pantalla). Es exactamente el caso que la guía de `adapt` marca como error común
    ("Forget landscape orientation on mobile/tablet").
- **Por qué:** el usuario pidió adaptar `/reservar` para móvil y tablet. La página ya había pasado
  por `critique`, `audit`, `harden`, `clarify`, `layout`, `bolder` y `distill` en esta misma sesión,
  pero ninguna de esas pasadas había revisado tablet como nivel intermedio propio ni el caso de
  móvil en horizontal con poca altura — ambos señalados explícitamente en la guía de `adapt` como
  puntos que no hay que olvidar.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno funcional; solo CSS responsivo nuevo o ajustado, sin tocar markup, lógica ni
  copy. Verificado con `npx tsc --noEmit` (sin errores), con el detector mecánico de Impeccable en
  modo `--scope layout` y escaneo completo (ambos sin hallazgos) y confirmando que el bundle
  servido por el dev server compiló el nuevo CSS sin marcadores de error. Los cálculos de offset
  vertical del enlace "Volver" en ambos contextos (tablet/desktop existente y el nuevo caso de
  horizontal con poca altura) se verificaron por aritmética sobre los valores de padding y posición
  absoluta, no por captura de pantalla — no había disponible una herramienta de automatización de
  navegador en esta sesión, igual que en las corridas previas sobre este mismo objetivo.

---

### 2026-08-16 — Quitar el fondo de cuadrícula decorativa del hero de `/reservar`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable distill /reservar`, acotado
  explícitamente al hero)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se eliminaron dos reglas de `allied-booking.css`:
  - `.booking-hero::before` — el pseudo-elemento con dos capas de `linear-gradient` en cruz
    formando una cuadrícula de líneas de 56×56px sobre el hero. Era el mismo hallazgo advisorio
    (`codex-grid-background`) que el detector mecánico de Impeccable venía marcando en cada corrida
    de `critique`, `audit` y `bolder` de esta sesión sobre esta página; ahora el escaneo del
    directorio da limpio (`[]`) por primera vez en toda la sesión.
  - `.booking-hero > * { position: relative; z-index: 1; }` — regla auxiliar que existía solo para
    levantar el contenido del hero por encima de la cuadrícula eliminada. Sin la cuadrícula, esta
    regla no tenía ya ningún propósito, así que se retiró junto con ella en vez de dejarla como CSS
    huérfano.
  - Se dejó intacto todo lo demás del hero: el degradado radial sobre `var(--ink)` (color ya
    existente, no se tocó), el copy, el enlace "Volver", el kicker "Paso 1 de 3", la tipografía y
    el `position: relative` de `.booking-container` (sigue siendo necesario para posicionar
    `.booking-view-back`, que no depende de la cuadrícula).
- **Hallazgo relevante para el alcance:** `allied-booking-rates.ts`, `allied-booking-request.ts` y
  `allied-booking-confirmation.ts` declaran `styleUrl: './allied-booking.css'` — comparten el mismo
  archivo de estilos que `AlliedBookingPage`, no uno propio. La clase `.booking-hero` y su
  cuadrícula decorativa venían renderizándose igual en los cuatro pasos del flujo de reserva, no
  solo en `/reservar`. El pedido del usuario fue explícito sobre quitar la cuadrícula y acotado a
  "el hero"; dado que las cuatro páginas comparten literalmente la misma regla CSS, no había forma
  de quitarla solo de una sin inventar una clase nueva por página (una abstracción no solicitada).
  Se optó por quitarla del archivo compartido, lo que corrige el mismo patrón ya señalado por el
  detector en los cuatro pasos por igual, en vez de dejar tres de los cuatro con el patrón genérico
  todavía presente. Se verificó que las cuatro rutas (`/reservar`, `/reservar/tarifas/:slug`,
  `/reservar/solicitud/:slug/:rateId`, `/reservar/confirmacion/:id`) siguen respondiendo `200` tras
  el cambio.
- **Por qué:** el usuario pidió explícitamente quitar el fondo de cuadrícula genérico del hero y
  simplificarlo para que se sintiera específico de una experiencia de reserva hotelera, preservando
  copy, buscador, tarjetas de resultado, funcionalidad, colores y tipografía — y sin deshacer las
  mejoras de accesibilidad, layout o tarjetas de pasadas anteriores en esta misma sesión.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno funcional. Cambio puramente de eliminación de CSS decorativo, sin tocar
  markup, lógica ni copy. Verificado con `npx tsc --noEmit` (sin errores), con el detector mecánico
  de Impeccable (pasó de 1 hallazgo advisorio a 0), y confirmando por HTTP que las cuatro rutas del
  flujo de reserva siguen sirviendo `200` tras el cambio al archivo de estilos compartido. No se
  verificó visualmente en navegador por no tener disponible una herramienta de automatización de
  navegador en esta sesión, igual que en las corridas previas sobre este mismo objetivo.

---

### 2026-08-16 — Rediseñar las tarjetas de resultados de `/reservar` con imagen y jerarquía fuerte

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable bolder /reservar`, acotado
  explícitamente a los resultados y tarjetas de hotel)
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** rediseño acotado a las tarjetas de resultados de `AlliedBookingPage`
  (`.booking-options`/`.booking-option` → `.booking-result-card`), sin tocar el encabezado, el
  formulario de búsqueda, los estados vacíos ni las páginas de tarifas/solicitud/confirmación:
  - `AlliedHotel` (`shared/allied-hotels.ts`) gana un campo opcional `imageUrl?: string`. Cuando un
    hotel lo trae, la tarjeta muestra una foto real (`object-fit: cover`, `loading="lazy"`, área
    reservada con `aspect-ratio` para no producir salto de layout). Ningún hotel de los datos de
    ejemplo actuales define `imageUrl` — es infraestructura lista para fotos reales, no una
    afirmación de que ya existen.
  - Para el caso sin foto (el único caso real hoy), se construyó un panel de respaldo deliberado en
    vez de un hueco gris: reutiliza el mismo motivo visual ya establecido en el hero de esta misma
    página (`radial-gradient(circle at 82% 14%, rgba(44,123,229,.32), transparent 34%)` sobre
    `var(--ink)`) con un ícono grande según el tipo de alojamiento (`getHotelTypeIcon()` en
    `allied-booking-flow.ts`: Hotel/Apartahotel→`pi-building`, Hostal→`pi-home`, Alojamiento
    turístico→`pi-compass`) y el tipo en texto grande. Se evitó deliberadamente reutilizar el
    patrón de líneas de cuadrícula del hero (`.booking-hero::before`), ya que el detector mecánico
    de Impeccable lo tiene marcado como firma de "UI genérica" en un hallazgo previo de esta misma
    sesión.
  - La insignia "Aliado Wayra" (`.booking-badge`, clase compartida con las páginas de tarifas y
    solicitud — **sin modificar su regla base**) ahora flota sobre la imagen/panel mediante una
    clase adicional exclusiva de esta tarjeta (`.booking-result-badge`, `position: absolute`).
  - El nombre del hotel pasó de `1.12rem` a `1.35rem` en Sora 900, y el precio principal de
    `1.15rem` a `1.85rem` — la jerarquía tipográfica ahora hace evidente en un vistazo cuál es el
    dato más importante de la tarjeta.
  - El botón "Ver tarifas" pasó de `.booking-secondary` (contorno, sin relleno — el mismo estilo
    que un botón secundario/de cancelar) a `.booking-primary` (relleno, el mismo lenguaje visual ya
    usado en el botón de búsqueda del formulario), a ancho completo de su columna. Era la única
    acción de cada tarjeta y estaba vestida como si fuera secundaria.
  - En escritorio (`≥1040px`) la tarjeta pasó de dos columnas (contenido | precio) a tres
    (imagen `300px` | contenido | precio `230px`, con un separador `1px solid var(--border)` entre
    contenido y precio). En móvil, la imagen ocupa el ancho completo arriba (`aspect-ratio: 16/10`)
    y el resto se apila debajo, igual que antes.
  - Se retiraron las reglas CSS de `.booking-option`/`.booking-option-side`/
    `.booking-option-selected` (huérfanas tras el cambio de clase) de los selectores combinados que
    compartían con `.booking-rate-card`/`.booking-rate-price`/`.booking-rate-selected`, dejando
    estas últimas intactas para las páginas de tarifas y solicitud, que no se tocaron.
- **Por qué:** el usuario pidió explícitamente que los resultados dejaran de sentirse como "una
  lista administrativa" y se sintieran como una experiencia real de reserva hotelera, con imagen
  como elemento primario, jerarquía fuerte en nombre/ubicación/tipo/precio/disponibilidad, y la
  acción principal claramente dominante — acotado sin tocar encabezado, buscador ni el resto del
  flujo de reserva.
- **Decisión de diseño sin confirmar con el usuario (declarada aquí por transparencia):** no
  existen fotos reales de los hoteles aliados ni un campo de imagen en el modelo de datos previo.
  En vez de simular fotos falsas para hoteles específicos (lo cual habría sido engañoso) o detener
  el trabajo a esperar confirmación, se optó por construir la infraestructura real
  (`imageUrl`) más un panel de respaldo con identidad visual fuerte y honesta, dejando explícito en
  el resumen de la sesión que el usuario puede sustituirlo por fotos reales cuando existan. Esta
  sesión ya había recibido una pregunta de aclaración rechazada por el usuario durante
  `$impeccable critique`, lo que indicó preferencia por ejecución autónoma en vez de pausas.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-flow.ts`,
  `frontend/src/app/shared/allied-hotels.ts`, `AGENTS.md`.
- **Impacto:** Ninguna migración ni cambio de API — `imageUrl` es un campo opcional, compatible
  hacia atrás con los datos de ejemplo actuales y con cualquier otro consumidor de `AlliedHotel`
  (`allied-booking-rates.ts`, `allied-booking-request.ts`, que no lo usan y no se ven afectados).
  Verificado con `npx tsc --noEmit` (sin errores), releyendo el bundle servido por el dev server
  (el chunk de la página contiene `.booking-result-card` y `getHotelTypeIcon` sin marcadores de
  error de compilación) y con el detector mecánico de Impeccable (mismo único hallazgo advisorio
  preexistente de antes de este cambio, sin hallazgos nuevos — confirma que el nuevo panel de
  respaldo no reprodujo el patrón de cuadrícula ya señalado). Se verificó por lectura de código que
  las clases compartidas con las páginas de tarifas/solicitud (`.booking-badge`, `.booking-rate-card`,
  `.booking-rate-price`, `.booking-rate-selected`) conservan sus reglas base sin cambios. No se
  verificó visualmente en navegador por no tener disponible una herramienta de automatización de
  navegador en esta sesión, igual que en las corridas previas sobre este mismo objetivo.

---

### 2026-08-16 — Agrupar habitaciones y huéspedes en la búsqueda de `/reservar`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable layout /reservar`)
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** ajuste estructural sobre el formulario de búsqueda de `AlliedBookingPage`
  (`allied-booking.html`/`.css`), sin tocar el resto de la página:
  - Los campos "Habitaciones" y "Huéspedes" dejaron de ser dos columnas independientes con el
    mismo peso visual que "Destino" y "Fechas" (cinco unidades de decisión en una sola fila, por
    encima del límite de cuatro que ya había señalado `$impeccable critique` en su evaluación de
    carga cognitiva). Ahora comparten un contenedor `.booking-field-group` que ocupa una sola
    columna de la fila en escritorio (`≥1040px`, `grid-template-columns` pasó de cinco pistas a
    cuatro) y se dividen internamente en una sub-cuadrícula de dos columnas con `gap: 0.65rem`,
    frente al `gap: 1.05rem` que separa los grupos de nivel superior — el contraste entre espaciado
    ajustado y generoso es lo que comunica visualmente "estos dos campos van juntos" sin agregar
    bordes, fondo ni sombra (se evitó deliberadamente una tarjeta anidada dentro de la tarjeta de
    búsqueda).
  - Efecto secundario positivo en el punto de quiebre intermedio (`700–1039px`): antes, cinco
    campos en una cuadrícula de dos columnas dejaban el botón de búsqueda solo en una tercera fila
    con una columna vacía a su lado; con cuatro unidades, el botón ahora empareja limpiamente con
    el grupo de ocupación en la segunda fila.
  - En móvil (una sola columna implícita), "Habitaciones" y "Huéspedes" pasaron de ocupar dos filas
    completas apiladas a compartir una sola fila de dos columnas, reduciendo el desplazamiento
    vertical para un ajuste que es, en esencia, una sola decisión de ocupación.
  - Se intentó primero agregar un encabezado compartido "Ocupación" sobre ambos campos, pero se
    descartó: introducía una tercera fila de etiqueta que no existe en "Destino" ni "Fechas",
    rompiendo la alineación de altura entre columnas de la misma fila (`align-items: end` en
    `.booking-search`). La agrupación final se apoya solo en proximidad y contraste de espaciado,
    como indica la skill ("Group by meaning. Use proximity before adding containers or
    decoration").
- **Por qué:** `$impeccable layout /reservar`, a solicitud del usuario, tras las pasadas previas de
  `critique`, `audit`, `harden` y `clarify` sobre la misma página. `critique` ya había señalado
  este hallazgo específico en su lista de verificación de carga cognitiva ("Chunking (≤4/group):
  the search form presents 5 parallel decision units in one row... Rooms+guests should collapse
  into one 'occupancy' control").
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno funcional; los `formControlName` de "rooms" y "guests" no cambiaron, solo su
  agrupación visual y de espaciado. No hay migraciones, variables de entorno ni cambios de API.
  Verificado con `npx tsc --noEmit` (sin errores), releyendo el bundle servido por el dev server
  (el chunk de la página contiene la nueva clase `.booking-field-group` sin marcadores de error de
  compilación) y con el escaneo mecánico de Impeccable en modo `--scope layout` (sin hallazgos). No
  se verificó visualmente en navegador por no tener disponible una herramienta de automatización de
  navegador en esta sesión, igual que en las corridas previas sobre este mismo objetivo; el orden
  de tabulación por teclado no cambió (sigue el orden del documento: destino → fechas →
  habitaciones → huéspedes → buscar), solo el agrupamiento visual.

---

### 2026-08-16 — Corregir y clarificar el texto de la búsqueda de `/reservar`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable clarify /reservar`)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** pasada de redacción sobre la misma página pública de búsqueda de hoteles
  aliados (`AlliedBookingPage`, ruta `/reservar`) y sus dependencias directas:
  - Se restauraron las tildes faltantes en todo el texto visible de
    `allied-booking.html`/`.ts` (`"pais"→"país"`, `"ubicacion"→"ubicación"`,
    `"huespedes"→"huéspedes"`, `"sesion"→"sesión"`, `"ocupacion"→"ocupación"`,
    `"busqueda"→"búsqueda"`, etc.) y en el archivo de datos de ejemplo que comparten todas las
    páginas de hoteles aliados (`shared/allied-hotels.ts`: nombres de ciudad, departamento, tipo
    de alojamiento y descripciones — p. ej. `"Bogota"→"Bogotá"`, `"turistico"→"turístico"`,
    `"montana"→"montaña"`). No se tocó ninguna lógica de comparación: la búsqueda ya normaliza
    tildes con `normalizeText()`, así que el emparejamiento no cambia.
  - El placeholder del selector de fechas pasó de `"Check-in - Check-out"` (inglés) a
    `"Llegada - Salida"` para que coincida con el término que ya usaba el propio mensaje de
    validación del mismo campo (`"Selecciona llegada y salida."`) — eran dos términos distintos
    para el mismo concepto dentro del mismo campo.
  - `"La salida debe ser posterior."` pasó a `"La salida debe ser posterior a la llegada."`: el
    mensaje original no decía posterior a qué.
  - `"Escribe un pais o ciudad aliado."` pasó a `"Escribe un país o ciudad con hoteles
    aliados."` (además de la tilde, el adjetivo "aliado" no concordaba en género con "ciudad").
  - La disponibilidad de habitaciones en cada tarjeta de resultado dejó de mostrarse siempre
    como `"{{n}} disponibles"` sin aclarar de qué (¿habitaciones? ¿algo más?) ni si el número es
    exacto o estimado. Se agregó `isAvailableRoomCountEstimated()` en `allied-booking-flow.ts`
    (deriva de si `hotel.availableRooms` viene o no de datos reales) y el template ahora muestra
    `"Disponibilidad estimada: N habitaciones"` cuando el dato viene del cálculo de respaldo, o
    `"N habitaciones disponibles"` cuando es un valor real — el mismo estándar de honestidad que
    ya aplicaba `"Total estimado:"` para el precio, pero que antes no cubría el conteo de
    habitaciones (con los datos de ejemplo actuales, siempre cae en la rama estimada).
  - El precio por noche pasó de una única línea ambigua `"Desde por noche"` bajo el precio a una
    estructura de tres líneas `"Desde" / precio / "Por noche"`, gramaticalmente completa.
  - Los mensajes de error de geolocalización (`shared/current-location-destination.ts`) ahora
    terminan todos con la misma acción de recuperación explícita ("Escribe tu destino
    manualmente"), y el caso de permiso denegado por el navegador ya no se colapsa en un mensaje
    genérico: se distingue de otros fallos de geolocalización usando el código de error real que
    entrega la API (`GeolocationPositionError.code`), que antes se descartaba sin usar.
- **Por qué:** `$impeccable clarify /reservar`, a solicitud del usuario, tras las pasadas previas
  de `critique`, `audit` y `harden` sobre la misma página. La falta sistemática de tildes y la
  inconsistencia terminológica del selector de fechas se detectaron al leer el flujo completo de
  interacción, como indica la guía de la skill. La etiqueta honesta de disponibilidad resuelve
  directamente el hallazgo P1 de `critique` sobre el conteo de habitaciones mostrado con la misma
  autoridad visual que un dato real sin serlo siempre.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-flow.ts`,
  `frontend/src/app/shared/allied-hotels.ts`,
  `frontend/src/app/shared/current-location-destination.ts`, `AGENTS.md`.
- **Impacto:** Ninguno funcional; solo texto y una etiqueta derivada de datos ya existentes (sin
  nuevos campos, migraciones, variables de entorno ni cambios de API). El archivo de datos de
  ejemplo (`allied-hotels.ts`) es compartido por otras páginas de hoteles aliados, que se
  benefician igual de la corrección ortográfica sin cambio de comportamiento. Verificado con
  `npx tsc --noEmit` (sin errores) y releyendo el bundle servido por el dev server (el chunk de la
  página contiene el nuevo texto y el nuevo método sin marcadores de error de compilación). Se
  re-ejecutó el detector mecánico de Impeccable: mismo único hallazgo advisorio preexistente
  (`codex-grid-background`, fuera de alcance), sin hallazgos nuevos. No se verificó visualmente en
  navegador por no tener disponible una herramienta de automatización de navegador en esta sesión,
  igual que en las corridas previas de `critique`/`audit`/`harden` sobre este mismo objetivo.

---

### 2026-08-16 — Endurecer accesibilidad y recuperación de errores en la búsqueda de `/reservar`

- **Autor:** Claude Code, a solicitud del usuario (`$impeccable harden /reservar`)
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** correcciones de robustez sobre la página pública de búsqueda de hoteles aliados
  (`AlliedBookingPage`, ruta `/reservar`), identificadas previamente por `$impeccable critique` y
  `$impeccable audit` sobre el mismo objetivo:
  - El combobox de destino (`allied-booking.html`) dejó de anidar los botones del panel de
    sugerencias dentro del `<label>` del campo de texto (nesting inválido que podía causar
    comportamiento inconsistente en lectores de pantalla). El input ahora expone
    `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded` y `aria-controls`; el panel de
    sugerencias es `role="listbox"` con cada opción como `role="option"`.
  - El cierre del panel de destino dejó de depender de un `setTimeout(120ms)` en el evento `blur`
    del input (`allied-booking.ts`), que podía cerrar el panel debajo del foco de un usuario de
    teclado navegando hacia el botón "Mi ubicación" con Tab. Ahora usa `(focusout)` en el
    contenedor con verificación de `event.relatedTarget` (`onDestinationFocusOut`): el panel solo
    se cierra si el nuevo foco cae fuera del contenedor. Se agregó cierre con `Escape`.
  - El estado `hotelsLoadError` (carga inicial de hoteles vs. consulta de disponibilidad) ahora
    distingue su origen (`hotelsLoadErrorContext: 'initial' | 'availability'`) y cada caso muestra
    un botón "Reintentar" que reinvoca la acción que falló (`retryLoadHotels()` /
    `retrySearchAvailability()`), en vez de ser un callejón sin salida que solo se resolvía
    recargando la página completa.
  - `searchAvailability()` gana una guarda de reentrada (`if (this.searchingAvailability) return;`)
    como defensa adicional contra doble envío, además de la que ya daba el botón deshabilitado.
  - Los campos "Habitaciones" y "Huéspedes" muestran de forma permanente el rango válido
    (`Entre 1 y 4 habitaciones` / `Entre 1 y 8 huéspedes`) en vez de solo mostrarlo como error
    después de que el campo pierde el foco, con `aria-describedby` enlazando el input al hint.
  - Se agregó un bloque `@media (prefers-reduced-motion: reduce)` que anula el desplazamiento
    `translateY` en el hover de tarjetas y botones, conservando la retroalimentación de color y
    sombra para quienes prefieren menos movimiento.
- **Por qué:** `$impeccable critique /reservar` y `$impeccable audit /reservar` (dos pasadas
  independientes, con sub-agentes aislados para diseño y detector) identificaron el combobox de
  destino como hallazgo P0 (bloqueo real de accesibilidad, no cosmético) y el callejón sin salida
  de `hotelsLoadError` como P1; ambos quedaron etiquetados explícitamente para `$impeccable
  harden`. El usuario ejecutó ese comando a continuación sobre el mismo objetivo.
- **Archivos/áreas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`, `AGENTS.md`.
- **Impacto:** Ninguno funcional fuera de esta página; no hay migraciones, variables de entorno,
  cambios de API ni recursos RBAC nuevos. Verificado con `npx tsc --noEmit` (sin errores) y
  releyendo el bundle servido por el dev server (`chunk-IFFASTAW.js` contiene los nuevos métodos y
  atributos ARIA sin marcadores de error de compilación). Se re-ejecutó el detector mecánico de
  Impeccable sobre el directorio del componente: mismo único hallazgo advisorio preexistente
  (`codex-grid-background`, fuera de alcance de este cambio), sin hallazgos nuevos. No se pudo
  verificar visualmente en navegador porque esta sesión no tenía una herramienta de automatización
  de navegador disponible (Playwright/Puppeteer/computer-use); esto se declaró explícitamente en
  las corridas de `critique` y `audit` previas y sigue aplicando aquí.

---

### 2026-08-16 — Quitar la línea conectora y centrar la flecha entre icono y número en "Operación"

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** tercer ajuste puntual sobre la misma sección "Operación", sin tocar el resto de
  la landing: se quitó por completo el pseudo-elemento `.wayra-flow-step::before` (la línea de 1px
  con degradado introducida en el cambio anterior para conectar cada icono con el siguiente número).
  El glifo de flecha (`.wayra-flow-step::after`, solo `≥1024px`) se mantiene, pero ahora se posiciona
  con `left: calc((var(--flow-head-width) + 100% + var(--flow-gap)) / 2)` — el punto medio exacto
  entre el borde derecho del icono del paso actual y el borde izquierdo del número del siguiente
  paso — más `transform: translate(-50%, -50%)` para centrar el propio glifo sobre ese punto en
  ambos ejes. El resultado es una única flecha flotando centrada entre cada icono y el número
  siguiente, sin línea que los una.
- **Por qué:** el usuario pidió explícitamente borrar la línea del cambio anterior y, en su lugar,
  centrar el icono de la flecha entre cada icono y número.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.css`,
  `AGENTS.md`.
- **Impacto:** Ninguno. Cambio puramente visual acotado a esta sección; no hay migraciones,
  variables de entorno, cambios de API ni recursos RBAC nuevos. Verificado con `tsc --noEmit` (sin
  errores) y capturas de pantalla reales (Playwright headless, dev server local) en 1024px, 1280px
  y 1440px: la flecha queda centrada entre cada icono y el número siguiente, sin línea visible, y
  sin overflow horizontal en ningún ancho probado.

---

### 2026-08-16 — Alargar el conector entre pasos y ampliar el espacio antes de la fila en "Operación"

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** segundo ajuste puntual sobre la misma sección "Operación", sin tocar el resto de
  la landing:
  - El margen superior de la fila de tres pasos (`<ol class="wayra-flow-steps">`) subió de
    `mt-20 sm:mt-24 lg:mt-28` a `mt-24 sm:mt-28 lg:mt-32`, para separar más el párrafo introductorio
    del bloque de número + icono de cada paso.
  - El conector horizontal entre pasos (`≥1024px`) dejó de ser un único glifo de flecha centrado en
    el angosto `column-gap` entre columnas (que quedaba flotando, sin tocar visualmente ni el icono
    del paso anterior ni el número del siguiente) y pasó a ser una línea continua
    (`.wayra-flow-step::before`, `height: 1px`, degradado sutil) que arranca justo después del icono
    del paso actual y cruza todo el resto de la columna más el `column-gap`, terminando con la punta
    de flecha (`.wayra-flow-step::after`, mismo glifo de antes) a un `1rem` del número del siguiente
    paso. El punto de arranque usa una nueva variable `--flow-head-width: 7.5rem` (ancho aproximado
    del bloque número + gap + icono) declarada en `.wayra-flow-step`; el punto de llegada usa
    `right: calc(-1 * (var(--flow-gap) - 1rem))`, es decir, se ancla al borde derecho de la columna
    actual y se proyecta hacia la siguiente sin necesidad de calcular anchos absolutos por paso. El
    resultado se lee como una sola línea que va de número a número, no como una flecha suelta en el
    espacio vacío entre columnas.
- **Por qué:** el usuario pidió más aire entre los iconos/números y el párrafo de arriba, y que la
  flecha entre pasos fuera más larga, de modo que conectara visualmente un número con el siguiente
  en vez de quedar aislada en el hueco entre columnas.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** Ninguno. Cambio puramente visual acotado a esta sección; no hay migraciones,
  variables de entorno, cambios de API ni recursos RBAC nuevos. Verificado con `tsc --noEmit` (sin
  errores) y capturas de pantalla reales (Playwright headless, dev server local) en 375px, 1024px,
  1280px y 1440px: la línea conecta el icono de cada paso con el número del siguiente en desktop, el
  flujo vertical de móvil queda intacto (la regla nueva solo aplica desde `1024px`), y no hay
  overflow horizontal en ningún ancho probado.

---

### 2026-08-16 — Agrupar número + icono y ampliar espaciado vertical en "Operación"

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** ajuste puntual sobre la sección "Operación" (fondo oscuro, `id="producto"`,
  encabezado "Del check-in al cierre de caja..."), sin tocar ninguna otra sección:
  - `.wayra-flow-top` (la fila que contiene el número y el icono de cada paso) pasó de
    `justify-content: space-between` a `justify-content: flex-start` con `gap: 0.85rem` (antes
    `1rem`). Con `space-between`, en columnas anchas de escritorio el número quedaba pegado al
    borde izquierdo y el icono al borde derecho de la columna, separados por decenas de píxeles de
    aire — parecían dos elementos sueltos en vez de una sola unidad "número de paso + icono". Con
    `flex-start` ambos quedan agrupados y pegados a la izquierda, leyéndose de inmediato como una
    misma pieza (`01` + icono de calendario, `02` + icono de edificio, `03` + icono de billetera).
  - Se aumentó el espacio vertical entre el título, el párrafo y la fila de pasos: el párrafo pasó
    de `mt-4` a `mt-5 sm:mt-6`, y la fila de los tres pasos (`<ol class="wayra-flow-steps">`) pasó
    de `mt-16 sm:mt-20 lg:mt-24` a `mt-20 sm:mt-24 lg:mt-28`.
- **Por qué:** el usuario reportó, tras el rediseño anterior, que el número y el icono de cada paso
  no se percibían como una sola unidad visual (quedaban en extremos opuestos de la fila) y que el
  párrafo bajo el título seguía sintiéndose pegado a la fila de pasos.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** Ninguno. Cambio puramente visual acotado a esta sección; no hay migraciones,
  variables de entorno, cambios de API ni recursos RBAC nuevos. Verificado con `tsc --noEmit` (sin
  errores) y capturas de pantalla reales (Playwright headless, dev server local) en 320px, 375px,
  768px, 1024px, 1280px y 1440px: número e icono agrupados como una sola unidad en los tres pasos,
  jerarquía título → párrafo → fila de pasos con más aire, conector entre pasos alineado, y sin
  overflow horizontal en ningún ancho.

---

### 2026-08-16 — Rediseño de jerarquía y layout en "Operación" y "Evidencia de producto" (sin la skill `impeccable`)

- **Autor:** Claude Code, a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** nuevo rediseño acotado a las mismas dos secciones de la landing pública (`/`)
  que las dos entradas anteriores, esta vez implementado directamente (sin invocar `impeccable` ni
  ninguna skill, a pedido explícito del usuario), sin tocar el resto de la página:
  - **Sección "Operación" (fondo oscuro, `id="producto"`)**: el número decorativo de cada paso dejó
    de ser un elemento `position: absolute` superpuesto en la esquina (que quedaba parcialmente
    tapado por el icono) y pasó a vivir en el flujo normal, en una fila propia (`.wayra-flow-top`,
    `display: flex; justify-content: space-between`) junto al icono, ambos alineados y sin
    solaparse. El número ahora se formatea con dos dígitos (`{{ i + 1 | number: '2.0-0' }}` → "01",
    "02", "03") en vez de "1", "2", "3". El conector entre pasos (flecha) se reposicionó para
    alinearse verticalmente con el centro de esa fila superior en vez de con el número; en
    escritorio (`≥1024px`) su ancho ahora usa la misma variable CSS (`--flow-gap`) que el
    `column-gap` del grid, así el conector siempre ocupa exactamente el espacio entre columnas sin
    valores mágicos duplicados. Se aumentó el margen entre la intro y la fila de pasos
    (`mt-16 sm:mt-20 lg:mt-24`, antes `mt-20 sm:mt-24`) para que la sección respire mejor a lo
    ancho de las pantallas grandes.
  - **Sección "Evidencia de producto" (fondo claro, "Lo que queda registrado en Wayra")**: el
    problema principal no era el tamaño de la captura de producto en sí, sino que todo el bloque
    (captura + los 4 puntos + la fila de confianza) vivía centrado en una columna angosta de
    `max-width: 820px` dentro de un contenedor de hasta 1472px, dejando franjas enormes de espacio
    en blanco a los lados. Se cambió `.wayra-proof-wrap` a un grid de 2 columnas en escritorio
    (`≥1024px`, `minmax(0,1.55fr) minmax(0,1fr)`, ~58/42): la captura (`.wayra-proof-media`) ocupa
    la columna izquierda a su ancho natural (ya no se le impone un `max-width` fijo) y los 4 puntos
    (`.wayra-proof-panel` → `.wayra-proof-chain`) pasan de ser tarjetas pequeñas con borde propio a
    una lista vertical sin chrome, con divisores sutiles (`border-top`) entre filas, icono más
    grande (52px) y tipografía con más presencia — se siente como una lista asociada a la captura,
    no como tarjetas sueltas. En `<1024px` (tablet y móvil) el grid cae a una sola columna:
    captura arriba, lista debajo, sin recortes. La fila "Base operativa segura"
    (`.wayra-proof-footer` → `.wayra-proof-trust`) dejó de ser una línea delgada de texto centrado
    bajo un simple `border-top`, y pasó a ser un bloque diferenciado con borde, fondo `var(--surface)`
    y radio 18px, con un icono (`pi-shield`) y la etiqueta en mayúsculas a la izquierda y los 5
    checks en fila a la derecha (con `flex-wrap` para que se apilen solos en pantallas angostas, sin
    media query dedicada). Se aumentó el padding vertical de la sección
    (`py-20 sm:py-24 lg:py-28`, antes `py-16 sm:py-20`) para que el bloque use mejor el alto
    disponible.
- **Por qué:** el usuario reportó que, pese a los ajustes previos, el contenido seguía sintiéndose
  pequeño dentro de espacios muy grandes en ambas secciones: los números de los pasos quedaban mal
  posicionados/escondidos detrás de los iconos, y en la sección de evidencia la captura y las 4
  tarjetas quedaban comprimidas en una franja angosta central con demasiado espacio muerto alrededor,
  mientras "Base operativa segura" se sentía como un footer accidental. Pidió explícitamente no usar
  la skill `impeccable` esta vez y trabajar directamente sobre el HTML/CSS existente.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** Ninguno. Cambio puramente visual/estructural en la landing pública; no hay
  migraciones, variables de entorno, cambios de API ni recursos RBAC nuevos. Verificado con
  `tsc --noEmit` (sin errores), `ng build` de producción completo, y capturas de pantalla reales
  (Playwright headless, dev server local) en 320px, 375px, 390px, 768px, 1024px, 1280px, 1440px y
  1920px: sin overflow horizontal en ningún ancho, números "01/02/03" visibles y sin solaparse con
  los iconos, conector alineado en desktop y mobile, captura de producto con protagonismo junto a
  la lista de 4 puntos en desktop y apilada arriba en mobile/tablet, y "Base operativa segura"
  renderizando como panel diferenciado (borde y fondo sutiles, visibles al hacer zoom sobre la
  captura) en todos los anchos probados.

---

### 2026-08-16 — Refinamiento de espaciado y jerarquía en "Operación" y "Evidencia de producto"

- **Autor:** Claude Code (skill `impeccable`), a solicitud del usuario
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Qué se hizo:** refinamiento visual acotado a las dos secciones de la landing pública (`/`)
  descritas en la entrada anterior, sin tocar el resto de la página:
  - **Sección "Operación" (fondo oscuro, `id="producto"`)**: se aumentó el padding vertical de la
    sección (de `py-20 sm:py-28` a `pt-28 pb-20 sm:pt-36 sm:pb-28`, con más énfasis en el top) y el
    margen entre el bloque de intro y la fila de pasos (de `mt-16` a `mt-20 sm:mt-24`). El número
    decorativo de cada paso (antes en línea junto al icono, dentro de `.wayra-flow-head`, compitiendo
    por espacio horizontal) se sacó del `head` y se reposicionó con `position: absolute` en la
    esquina superior derecha de cada `<li>` (más grande, 4.5rem, opacidad reducida a modo de
    marca de agua), dejando el icono como único elemento en el flujo normal del `head`. Esto evita
    que el número se vea apretado o tapado por el icono. Se recalculó el offset horizontal del
    conector (flecha) móvil (de `left: 66px` a `left: 28px`) para que siga alineado al nuevo icono,
    que ahora empieza en el borde izquierdo del `<li>`.
  - **Sección "Evidencia de producto" (fondo claro, "Lo que queda registrado en Wayra")**: se quitó
    el borde/fondo/sombra compartidos que envolvían a la vez la captura, los 4 bloques y la fila de
    confianza (`.wayra-proof-panel` → renombrada a `.wayra-proof-wrap`, ahora sin chrome propio,
    solo layout). La captura de producto (`.wayra-proof-hero`) redujo su ancho máximo en escritorio
    de 900px a 820px para cederle protagonismo a los 4 bloques. Los 4 bloques (Reserva, Habitación,
    Caja, Gerencia), antes una lista con borde superior/izquierdo fino y sin icono, pasaron a ser
    tarjetas individuales (`.wayra-proof-chain li`: borde, radio 16px, fondo `var(--surface)`) con
    un icono propio arriba (`.wayra-proof-icon`, mismo tratamiento visual que `.wayra-simple-point`
    de la sección "Problema") y la etiqueta en `.wayra-proof-label`. Se agregó el campo `icon` a la
    interfaz `ProofItem` y a los 4 registros de `proofItems` en `landing.ts` (`pi-calendar-plus`,
    `pi-home`, `pi-wallet`, `pi-chart-line`). El grid pasa de apilado (móvil) a 2×2 (`sm:`, ≥640px,
    breakpoint nuevo) a 4 columnas (`lg:`, ≥1024px). La fila de confianza "Base operativa segura" se
    centró y su etiqueta pasó a mayúsculas con tracking, para diferenciarla visualmente de las
    tarjetas de arriba.
- **Por qué:** el usuario reportó que la sección de pasos operativos se sentía apretada arriba y que
  los números grandes quedaban tapados/cortados por los iconos, y que la sección de evidencia se
  veía desbalanceada porque la captura dominaba visualmente sobre los 4 bloques que explican qué
  centraliza Wayra.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`,
  `frontend/src/app/components/pages/landing/landing.ts`.
- **Impacto:** Ninguno. Cambio puramente visual/estructural en la landing pública; no hay
  migraciones, variables de entorno, cambios de API ni recursos RBAC nuevos. Verificado en
  navegador (Playwright headless) en anchos de escritorio (1440px), tablet (800px) y móvil (390px);
  el detector mecánico de `impeccable` corrió en modo degradado (sin parser HTML disponible) y no
  arrojó hallazgos.

---

### 2026-08-16 - Division en dos secciones: flujo operativo y evidencia de producto

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Que se hizo:** a pedido explicito del usuario, se dividio la seccion "Operacion" (rediseñada
  en el paso anterior) en dos secciones `<section>` independientes en `/`, sin tocar ninguna otra
  parte de la landing:
  - **Seccion 1 (fondo oscuro, `id="producto"` sin cambios)**: se quito por completo el panel de
    producto (`landing-5.png`, la cadena Reserva/Habitación/Caja/Gerencia, "Base operativa
    segura"); ahora solo contiene el encabezado+parrafo y los 3 pasos operativos. Se aumento la
    jerarquia visual de cada paso: el icono paso de 48px a 56px y se agrego un numero grande (2.75rem,
    tipografia Sora, blanco al 18% de opacidad) al lado del icono en vez del badge pequeño
    superpuesto de la version anterior -- mas legible y mas simple de posicionar. Los titulos
    subieron de `text-lg` a `text-xl`/`sm:text-2xl`. Las descripciones de cada paso se acortaron
    aun mas (de una oracion con dos clausulas a una sola clausula concisa, ejemplo: "Recepción
    confirma reserva, huésped y horario en un mismo registro."), sin agregar ningun dato nuevo.
    El conector entre pasos (flecha abajo en movil/tablet, flecha derecha en desktop) se mantuvo,
    recalculando su posicion para el nuevo tamaño de icono.
  - **Seccion 2 (nueva, fondo claro `bg-white`)**: seccion nueva inmediatamente despues, con la
    misma anatomia de intro centrada que ya usan "Publico" y "FAQ" (encabezado + una oracion de
    apoyo nueva: "Reservas, habitaciones, pagos y actividad operativa quedan conectados en un
    mismo lugar."). El encabezado "Lo que queda registrado en Wayra" paso de ser un `<h3>` dentro
    del panel a ser el `<h2>` propio de la seccion. Debajo, el mismo panel de producto de antes
    (captura real `landing-5.png` grande y prominente, cadena Reserva/Habitación/Caja/Gerencia,
    fila compacta de "Base operativa segura") ahora vive solo en esta seccion clara. Como el
    panel paso de flotar sobre un fondo oscuro a vivir dentro de una seccion ya blanca, se cambio
    su fondo de `var(--card)` (blanco puro, se habria confundido con el fondo de la seccion) a
    `var(--surface)` -- el mismo token que ya usa `.wayra-image-card` para tarjetas sobre fondo
    blanco en el resto de la pagina, no un valor nuevo.
  - Limpieza: se elimino la regla `.wayra-operation-section .wayra-proof-panel p` (quedo huerfana
    al mover el panel fuera de la seccion oscura) y los `!important` que solo existian para ganarle
    a esa regla en `.wayra-proof-caption`, `.wayra-proof-chain p` y `.wayra-proof-footer li`.
- **Por que:** el usuario pidio explicitamente que el flujo operativo (como progresa la operacion)
  y la evidencia de producto (que queda centralizado en Wayra) se sintieran como dos mensajes
  visualmente independientes, con una seccion clara despues de la oscura como separacion fuerte,
  en vez de convivir dentro de una sola seccion como en el paso anterior.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.ts`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** solo esta parte de la landing publica; sin migraciones, variables nuevas, cambios
  de API ni recursos RBAC. Verificado con `tsc --noEmit`, el detector de Impeccable (cero
  hallazgos) y un build de produccion completo, confirmando en el bundle final las dos secciones,
  el nuevo copy de apoyo y el token `--surface` en el panel. **Sin acceso a navegador en esta
  sesion**, sigue sin verificarse visualmente el resultado renderizado (el contraste real entre
  las dos secciones, la posicion exacta del conector junto al numero grande, la densidad final
  del panel claro) -- documentado aqui para revision en pantalla antes de darlo por definitivo.

---

### 2026-08-16 - Rediseno de la seccion "Del check-in al cierre de caja"

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Que se hizo:** a pedido explicito y detallado del usuario, se rediseño solo la seccion
  "Operacion" (`id="producto"`, encabezado "Del check-in al cierre de caja...") de `/`, sin tocar
  ninguna otra seccion, marca, color, tipografia ni tono de copy:
  - Se elimino la imagen grande de portada (`landing-3.png`) y su bloque de 2 columnas; el
    encabezado+parrafo ahora es una intro centrada (mismo patron ya usado en "Publico"/"FAQ").
    Como la imagen quedo sin ninguna referencia en el proyecto, se borraron tambien
    `landing-3.png`, `landing-3.webp` y `landing-3-960w.webp` de `frontend/public/landing/`.
  - `turnMoments` ("Antes del check-in", "Durante la estadía", "Al cierre de caja") se convirtio
    en un flujo de 3 pasos numerados (numero + icono + titulo + una sola explicacion). Se
    eliminaron las etiquetas de "evidencia" (`Reserva`/`Huéspedes`/`Abonos`, etc.) y la linea de
    "resultado" separada; su contenido se fusiono en una sola oracion concisa por paso (nueva
    propiedad `summary` en `TurnMoment`, reemplazando `description`+`evidence`+`outcome`) sin
    agregar ningun dato nuevo. Tambien se quito el fondo de tarjeta individual de cada paso
    (bordes + relleno) para evitar tarjetas anidadas, dejando solo el numero+icono+texto sobre el
    fondo de la seccion. En escritorio (1024px+) los 3 pasos se conectan en fila con una flecha
    (`pi-arrow-right`) entre cada par; en movil y tablet se apilan verticalmente conectados por
    una flecha hacia abajo (`pi-arrow-down`) -- mismo umbral de 1024px ya usado hoy para este
    tipo de contenido, para no repetir el aprieto de tablet-portrait que se corrigio en el pase de
    adapt de esta tarde.
  - El panel de prueba ("Lo que queda registrado en Wayra") se simplifico de una grilla de 3
    columnas (imagen 380px + lista + aside separado) a un panel de una sola columna donde la
    captura real de producto (`landing-5.png`, la misma imagen ya aprobada, sin cambiar el
    archivo) lidera a ancho casi completo (hasta 900px en desktop). Reserva/Habitación/Caja/
    Gerencia pasaron de una lista vertical con borde inferior por item a una fila conectada por
    divisores (borde superior apilado en movil, bordes laterales en fila de 4 columnas en
    desktop) para que se lean como una jerarquia conectada, no una lista suelta.
  - "Base operativa segura" dejo de ser un aside grande con encabezado propio, parrafo y lista
    vertical de 5 items; ahora es una etiqueta pequeña + fila compacta de tags con check dentro
    del mismo panel del producto, no un bloque separado.
  - Limpieza de CSS: se eliminaron por completo las clases que quedaron sin ningun uso
    (`.wayra-turn-flow`, `.wayra-turn-icon`, `.wayra-turn-evidence`, `.wayra-turn-body strong`,
    `.wayra-proof-list`, `.wayra-proof-trust` y sus variantes, `.wayra-trust-list` y sus
    variantes) en vez de dejarlas huerfanas.
- **Por que:** el usuario aporto un brief detallado pidiendo simplificar esta seccion especifica,
  quitar la imagen de portada generica, convertir los 3 momentos en un flujo conectado, reducir
  pildoras/badges/tarjetas anidadas, y hacer del panel de producto la prueba visual principal con
  "Base operativa segura" integrada como fila compacta -- sin rediseñar el resto de la landing ni
  cambiar marca/colores/tipografia/copy.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.ts`,
  `frontend/src/app/components/pages/landing/landing.css`,
  `frontend/public/landing/landing-3.png` (eliminado), `AGENTS.md`.
- **Impacto:** solo la seccion "Operacion" de la landing publica; sin migraciones, variables
  nuevas, cambios de API ni recursos RBAC. Verificado con `tsc --noEmit`, el detector de
  Impeccable (cero hallazgos) y un build de produccion completo, confirmando en el bundle final
  que las reglas de conexion (flecha abajo en movil/tablet, flecha derecha en desktop) y la
  grilla de 4 columnas del panel de prueba compilaron correctamente, y que `landing-3` ya no
  aparece en ningun bundle. **Sin acceso a navegador en esta sesion**, no se pudo verificar
  visualmente el resultado renderizado (proporciones exactas del conector, alineacion optica del
  numero sobre el icono, densidad final del panel) -- se documenta aqui explicitamente para que
  se revise en pantalla antes de darlo por definitivo.

---

### 2026-08-16 - Identidad hotelera en el hero de la landing (reemplazo de la grilla generica)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** design
- **Que se hizo:** a pedido explicito del usuario, se reemplazo el fondo decorativo del hero
  (`.wayra-hero::before`), la grilla de lineas uniformes de 56x56px que tanto la critica como el
  detector de Impeccable venian marcando como un patron generico de SaaS ("recurring generated-UI
  signature"), por dos elementos conectados a la operacion hotelera, sin tocar nada mas de la
  seccion ni de la pagina:
  - Las lineas de la grilla se reemplazaron por un patron de particiones asimetricas (ancho de
    "habitaciones" desigual: 42/35/52px en vez de una celda uniforme) mas una linea horizontal
    mas espaciada representando un "pasillo" -- un plano de planta abstracto, no una grilla de
    papel cuadriculado. Esto tambien cumple la regla propia del detector de Impeccable para fondos
    de grilla: necesitan un plano, mapa o instrumento de medicion real detras, no una grilla suelta.
  - Se agrego un `::after` con un unico glifo `pi-key` (ya parte de PrimeIcons, la libreria de
    iconos que la pagina usa en otros 21 lugares) a escala muy grande (26rem), rotado y con
    opacidad muy baja (5%), como marca de agua ambiental en la esquina inferior izquierda del
    hero -- una senal de hospitalidad inequivoca (una llave = una habitacion) que no depende de
    que el visitante interprete correctamente un patron abstracto de lineas.
  - No se toco ningun color nuevo (solo `var(--ink-foreground)` y el mismo `rgba(255,255,255,α)`
    que ya usaba la grilla original), ninguna fuente nueva, ninguna copia, la jerarquia de los CTA
    ("Solicitar demo para mi hotel" / "Ver cómo funciona"), ni el mockup de producto
    (`.wayra-product-hero`) -- exactamente el alcance que pidio el usuario. El resplandor radial
    azul existente (`--primary` al 22%) tambien se dejo sin tocar: no era el patron senalado por
    la critica ni por el detector, y el usuario pidio preservar la paleta.
- **Por que:** la critica y la auditoria de Impeccable de esta tarde habian senalado
  repetidamente este mismo hallazgo (verdicto de especificidad de diseño: "el copy es especifico
  del hotel, el fondo visual no") sin actuar sobre el, remitiendolo siempre a una decision de
  diseno deliberada. El usuario pidio resolverlo directamente, con restricciones explicitas de
  alcance (paleta, tipografia, copy, jerarquia de CTA y screenshot intactos; solo el hero; sin
  rediseñar el resto).
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.css`,
  `AGENTS.md`.
- **Impacto:** solo el fondo decorativo del hero de la landing publica; sin migraciones,
  variables nuevas, cambios de API ni recursos RBAC. Verificado con `tsc --noEmit`, el detector de
  Impeccable (el hallazgo `codex-grid-background` que senalaba la grilla generica ya no aparece,
  cero hallazgos en total) y un build de produccion completo, confirmando byte a byte en el bundle
  final que el patron de particiones y el glifo de llave (codepoint `\e981`, el mismo que usa
  `pi-key` en el resto de la aplicacion) llegaron intactos. Sin acceso a navegador en esta sesion,
  no se pudo verificar visualmente el resultado renderizado; el razonamiento de opacidad,
  contraste y posicionamiento (con `overflow: hidden` en `.wayra-hero` como red de seguridad
  contra cualquier desbordamiento) esta documentado arriba para que se revise visualmente antes de
  darlo por definitivo.

---

### 2026-08-16 - Polish: tokens de color faltantes en la landing

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, polish
- **Que se hizo:** `$impeccable polish` sobre `/`, dirigido al unico item de deriva de diseño que
  cada pasada de hoy (audit, harden, optimize, layout, typeset, adapt) veniá senalando y
  deliberadamente dejando para esta. Se agregaron 5 tokens nuevos al bloque `:root`-equivalente de
  `landing.css` (`--border-hover`, `--secondary-hover`, `--input-hover`, `--disabled-surface`,
  `--disabled-foreground`) y se reemplazaron los 16 valores hex sueltos que quedaban fuera del
  sistema de tokens: los que coincidian con un token ya existente en significado (`#ffffff` en
  variantes de "texto/fondo sobre --ink" -> `var(--ink-foreground)`, o "superficie clara" ->
  `var(--card)`, o "contenido sobre --primary" -> `var(--primary-foreground)`) se reescribieron
  con ese token; los que formaban un rol reconocible pero sin token (bordes en hover, superficie
  deshabilitada) recibieron uno de los 5 tokens nuevos; y se corrigio el rojo de error duplicado
  (`.field-error` usaba `#b91c1c` en vez de `var(--danger)` `#dc2626`, dos rojos distintos para el
  mismo significado). Se dejo sin tocar, a proposito, el unico valor verdaderamente unico de la
  pagina: el `#0e1626` de `.wayra-product-hero`, un tono deliberadamente mas oscuro que `--ink`
  para dar profundidad al marco del mockup de producto -- promoverlo a token seria inventar una
  abstraccion para un solo uso, exactamente lo que la guia de polish pide evitar.
- **Por que:** era el unico hallazgo que sobrevivio sin resolver a los seis comandos de Impeccable
  corridos hoy sobre esta pagina (todos lo señalaron y lo remitieron aqui explicitamente); cerrarlo
  no cambia ningun pixel renderizado (todos los valores de reemplazo son identicos byte a byte a
  los que reemplazan), solo elimina la duplicidad para que un cambio de marca futuro no tenga que
  encontrar y actualizar 16 lugares sueltos.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.css`,
  `AGENTS.md`.
- **Impacto:** solo landing publica; sin cambios visuales (mismos valores, ahora nombrados); sin
  migraciones, variables nuevas de entorno, cambios de API ni recursos RBAC. Verificado con
  `tsc --noEmit`, el detector de Impeccable (mismo unico hallazgo advisory de siempre, sin
  cambios) y un build de produccion completo.

---

### 2026-08-16 - Adaptacion movil/tablet: hover atascado en touch y turno operativo en tablet

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** pasada de `$impeccable adapt` sobre `/`, con alcance explicito a movil y
  tablet:
  - **15 reglas `:hover` sin ninguna guarda de input.** `landing.css` tenia 15 bloques de estilos
    `:hover` (elevacion de tarjetas, zoom de imagenes, cambios de color/fondo en botones y
    enlaces) sin `@media (hover: hover)`. En iOS/iPadOS Safari, un toque puede dejar esos estilos
    "atascados" hasta el siguiente toque en otro lugar, porque WebKit simula el hover en el primer
    tap sobre pantallas tactiles. Se extrajeron los 15 bloques a un unico
    `@media (hover: hover) and (pointer: fine)` consolidado (seccion nueva al final de
    `landing.css`, junto a los demas breakpoints), preservando con cuidado los casos donde un
    selector de hover venia mezclado con un estado que debe seguir siendo incondicional: el menu
    de accesos para huespedes abierto (`[open]`), el foco de teclado en el menu movil
    (`:focus-visible`) y el item de FAQ abierto (`[open]`) se separaron para que sigan
    funcionando igual sin importar el dispositivo.
  - **El flujo de "turno operativo" (3 pasos) saltaba a 3 columnas en el primer breakpoint de
    tablet (768px), no en desktop.** Con contenido real (icono + titulo + descripcion + 3
    etiquetas de evidencia + resultado) cada columna quedaba en apenas ~230px en un iPad en
    vertical -- justo el rango que la guia de adaptacion pide resolver con menos columnas, no
    mas, en tablet. Se movio la regla `grid-template-columns: repeat(3, ...)` del breakpoint de
    768px al de 1024px, de modo que tablet en vertical (768-1023px, todos los modelos de iPad
    caen ahi) reciba el flujo apilado en una columna, con espacio real para el contenido, y solo
    tablet en horizontal / desktop (1024px+, donde ya caen todos los iPads en horizontal) reciba
    las 3 columnas lado a lado -- el comportamiento "adaptativo por orientacion" que la guia pide
    para tablets.
  - Se revisaron y descartaron, con evidencia, otros dos puntos de la lista de verificacion:
    `env(safe-area-inset-*)`/`viewport-fit=cover` (el sitio no intenta contenido a sangre completa
    cerca de los bordes, asi que agregarlo resolveria un problema que no existe hoy) y orientacion
    horizontal en telefono (sin señal concreta de ruptura en el codigo). Los tamaños de objetivo
    tactil ya se habian verificado y corregido en la auditoria y en la pasada de layout de esta
    misma tarde.
- **Por que:** el usuario pidio explicitamente `$impeccable adapt` con alcance a movil y tablet;
  la propia guia de Impeccable para este comando nombra el patron de hover atascado en touch como
  algo "critico" y pide breakpoints de contenido en vez de saltar directo de movil a desktop.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.css`,
  `AGENTS.md`.
- **Impacto:** solo landing publica; sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC. Verificado con `tsc --noEmit`, el detector de Impeccable (sin hallazgos nuevos) y un build
  de produccion completo, confirmando en el bundle final que los 15 estilos de hover quedaron
  dentro de `@media (hover: hover) and (pointer: fine)`, que los 3 estados que debian seguir
  siendo incondicionales (`[open]` x2, `:focus-visible`) sobrevivieron la separacion intactos, y
  que la regla de 3 columnas del turno operativo quedo dentro de `@media (min-width: 1024px)` y
  ya no en el de 768px.

---

### 2026-08-16 - Entrega real de las tipografias de marca (Manrope y Sora)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** hallazgo original de la auditoria de esta misma tarde, deliberadamente
  diferido a `$impeccable typeset`: `landing.css` (y las hojas de estilo de
  `hoteles-aliados`, `reservar` y `check-in-online`) declaran `font-family: 'Manrope', ...` y
  `'Sora', ...` para todo el texto y los encabezados, pero el proyecto nunca cargaba esas
  fuentes -- sin `@font-face`, ningun link a Google Fonts y ningun archivo local, el navegador
  caia en silencio al *fallback* del sistema (`Segoe UI`/sans-serif) en las 4 paginas publicas,
  siempre, sin que nadie lo notara. Se autohospedaron ambas familias como fuentes variables
  (`font-weight: 200 800` Manrope, `100 800` Sora -- se verifico que cubren exactamente el rango
  650-900 que el propio CSS ya usaba en `font-weight` sueltos, evidencia de que las fuentes
  variables eran la entrega originalmente prevista) en subconjuntos latin + latin-ext (suficiente
  para español), descargadas de Google Fonts (`fonts.gstatic.com`) como 4 archivos `.woff2` en
  `frontend/public/fonts/` (~89 KB combinados) y declaradas con `@font-face`/`font-display: swap`
  en `frontend/src/styles.css` (hoja global: un `@font-face` no tiene selector que Angular pueda
  encapsular por componente, asi que su lugar correcto es el global; se confirmo antes que
  ninguna clase del dashboard interno referencia 'Manrope'/'Sora', por lo que esto no cambia nada
  fuera de las 4 paginas publicas). Verificado con un build de produccion real
  (`ng build --configuration production`): los 4 `.woff2` llegan a `dist/frontend/browser/fonts/`
  y las 4 URLs aparecen correctamente en el CSS minificado.
  - De paso, dos parrafos de prosa sin limite de medida (el de "Problema" y el de "Operación",
    ninguno tenia `max-w-*`, a diferencia del parrafo del hero que si lo tiene) podian superar
    las 100 caracteres por linea en anchos de tablet/desktop sin breakpoint de columnas; se les
    agrego `max-w-[65ch]`. Se aplico el mismo limite (`max-width: 65ch`) a las respuestas del
    FAQ, que tampoco tenian ninguno y llegaban a rondar 108 caracteres por linea en desktop.
- **Por que:** es el hallazgo de "Delivery" mas señalado de la sesion: la propia hoja de estilos
  ya declaraba una identidad tipografica especifica (dos familias con nombre, no un generico
  `sans-serif`), asi que renderizar por fin esas fuentes es continuar una decision ya tomada, no
  reemplazar una identidad -- corresponde a `$impeccable typeset` en modo "mejorar el uso de lo
  ya establecido", no a `new-work`.
- **Archivos/areas afectadas:** `frontend/src/styles.css`,
  `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `frontend/public/fonts/*.woff2`
  (4 archivos nuevos), `AGENTS.md`.
- **Impacto:** activa Manrope/Sora en las 4 paginas publicas (landing, hoteles-aliados, reservar,
  check-in-online), no solo en `/`; no toca ninguna pantalla del dashboard interno. Sin
  migraciones, variables nuevas, cambios de API ni recursos RBAC. Verificado con `tsc --noEmit`,
  el detector de Impeccable (`--scope type`, sin hallazgos) y un build de produccion completo.

---

### 2026-08-16 - Correcciones estructurales de layout en la landing

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, a11y
- **Que se hizo:** pasada de `$impeccable layout` sobre `/`, con una evaluacion estructural
  aislada delegada a un sub-agente (sin ver el scan mecanico) y `detect.mjs --scope layout` como
  segunda pasada independiente, sintetizadas y verificadas contra el codigo real antes de tocar
  nada:
  - **Bug de scroll con doble offset.** El ancla `#operacion` (`landing.html`, dentro de la
    seccion "Operacion") tenia `class="wayra-section-anchor"` con `position: relative; top:
    -88px` en CSS para simular el offset del header. Pero `scrollToSection()`
    (`landing.ts:635-686`) ya calcula su propio offset con
    `getBoundingClientRect().top + scrollY - headerOffset - 12`, y `getBoundingClientRect` ya
    refleja el corrimiento CSS -- el offset del header se aplicaba dos veces. Cualquier clic en
    "Como funciona" (nav del header o boton secundario del hero) sobrescrolleaba ~150-170px de
    mas, aterrizando dentro del encabezado/imagen en vez de en el bloque de "turno operativo". Se
    elimino el hack de CSS; el calculo de `scrollToSection` (y `scrollToCurrentHash`) queda como
    unica fuente de verdad del offset.
  - **Tarjetas de "Para quien" sin division visible.** El contenedor de las 4 tarjetas de
    audiencia usaba `bg-slate-200` como fondo para simular lineas divisorias entre tarjetas (un
    patron comun de Tailwind), pero le faltaba `gap-px`: sin espacio entre tarjetas el fondo
    nunca se asomaba, asi que las 4 tarjetas quedaban visualmente pegadas sin ninguna separacion
    hasta el hover. Se agrego `gap-px` al contenedor.
  - **Orden DOM/visual invertido en la seccion "Problema".** `.wayra-problem-section` usaba
    `order: 1` / `order: 2` en CSS (declarado sin media query, o sea aplicado en todos los
    anchos, mas una segunda declaracion identica y redundante dentro de `@media
    (min-width:1024px)`) para que el texto se leyera visualmente antes que la imagen, pero el DOM
    seguia siendo `<figure>` (imagen) antes que `<article>` (texto). Un lector de pantalla o
    usuario de teclado llegaba primero a la imagen (con su alt text largo) en cualquier ancho de
    pantalla, no solo en desktop. Se invirtio el orden real en el HTML (`<article>` antes que
    `<figure>`) y se eliminaron ambas reglas `order` en CSS, ya innecesarias.
  - **Ritmo de espaciado plano entre secciones de contenido muy distinto.** Las 4 secciones
    posteriores al hero (Problema, Operacion, Publico, FAQ) usaban el mismo `py-16 sm:py-20` sin
    importar que Operacion concentra muchisimo mas contenido (encabezado+imagen, un flujo de 3
    pasos con evidencia y resultado cada uno, mas un panel de prueba de 3 partes) que, por
    ejemplo, Publico (una intro y 4 tarjetas cortas). Se le dio a Operacion mas aire
    (`py-20 sm:py-28`) y se separo mas su bloque de "turno operativo" del panel de prueba
    (`mt-12` -> `mt-16`) para diferenciar el ritmo macro de las demas secciones.
  - **Enlaces del footer con objetivo de toque chico.** Los enlaces de navegacion del footer
    usaban `min-h-9` (36px) mientras el resto de la pagina usa 40-46px como minimo (menu movil,
    menu de accesos para huespedes). Se subio a `min-h-11` (44px) para igualar el resto de la
    pagina en la ultima superficie de conversion antes de salir del sitio.
- **Por que:** el objetivo era resolver problemas estructurales reales (jerarquia de lectura,
  agrupacion, ritmo, orden DOM/visual), no solo estetica. Cada hallazgo se verifico linea por
  linea contra el codigo actual antes de aplicarse; ninguno se acepto solo porque lo dijo el
  sub-agente.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** solo landing publica; sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC. Verificado con `tsc --noEmit` (sin errores) y con el detector de Impeccable en modo
  `--scope layout` (sin hallazgos) y en modo completo (sin hallazgos nuevos frente a la pasada
  anterior).

---

### 2026-08-16 - Claridad de copy en la landing (CTA, confirmacion, FAQ, campos opcionales)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, copy
- **Que se hizo:** pasada de `$impeccable clarify` sobre `/`, leyendo el flujo completo (no strings
  sueltos) para encontrar donde el texto prometia algo distinto de lo que el propio sitio ya
  explicaba en otro lado:
  - El CTA "Ver demo para mi hotel" aparecia en 6 lugares (header, menu movil, hero, CTA final,
    footer) prometiendo ver una demo de inmediato, cuando en realidad abre un formulario de 4
    pasos y el propio modal ("Primero coordinamos contigo...") y la FAQ ("Solicitas una demo...
    el equipo se comunica contigo para coordinar el acceso") ya describian el flujo real como una
    solicitud con seguimiento posterior. Se cambio a "Solicitar demo para mi hotel" en los 6
    lugares para que la etiqueta describa lo que realmente pasa al hacer clic.
  - La pantalla de confirmacion ("Recibimos la información de {hotel} y del contacto de demo del
    hotel. El equipo de Wayra revisará los datos para coordinar la demostración.") tenia una
    redaccion confusa y usaba una terminologia distinta a la de la FAQ para describir el mismo
    paso siguiente; se reescribio para que confirme el hecho (solicitud recibida) y el proximo
    paso (el equipo se pondra en contacto) con el mismo lenguaje que ya usa la FAQ.
  - La respuesta de la FAQ "¿Qué puedo gestionar desde Wayra?" era una sola oracion con 11
    sustantivos en una lista plana; se reagrupo en 4 bloques tematicos (reservas/huespedes,
    pagos/facturas, inventario/limpieza/mantenimiento, reportes) para que se pueda escanear.
  - Se corrigieron dos erratas de tilde en copy visible: "Gestion hotelera SaaS" -> "Gestión
    hotelera SaaS" (footer) y "Proceso o modulo..." -> "Proceso o módulo..." (placeholder del
    campo de comentarios).
  - Los 3 campos realmente opcionales del formulario (sitio web, usuario de prueba, comentarios)
    no indicaban su condicion de forma consistente: el campo de usuario decia "Opcional" solo en
    el placeholder (que no es una etiqueta persistente) y los otros dos no decian nada. Se movio
    "(opcional)" a la etiqueta visible de los 3 campos y se dejo el placeholder del campo de
    usuario solo con el ejemplo/razon de uso.
  - Se reviso tambien el copy de reintentar que se agrego en el hardening de esta misma tarde: el
    error de cargos tenia el boton "reintentar" en minuscula encadenado dentro de la oracion,
    mientras que el error de ubicacion usaba un boton "Reintentar" en mayuscula separado. Se
    unifico al patron de boton "Reintentar" independiente en ambos casos.
- **Por que:** la critica y la auditoria de Impeccable de hoy ya habian marcado el desajuste entre
  el CTA "Ver demo" y el formulario real de 15 campos como el hallazgo P1 mas importante de toda
  la landing, y ambas sugerian `$impeccable clarify` como el comando indicado para resolverlo.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.ts`, `AGENTS.md`.
- **Impacto:** solo copy de landing publica; sin migraciones, variables nuevas, cambios de API ni
  recursos RBAC. Verificado con `tsc --noEmit` (sin errores), con el detector de Impeccable (sin
  hallazgos nuevos) y con un grep dirigido para confirmar que no quedan mas instancias de "Ver
  demo" ni otras erratas de tilde del mismo patron en el archivo.

---

### 2026-08-16 - Optimizacion de imagenes y layout-thrash en la landing

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, perf
- **Que se hizo:** el mayor cuello de botella medido en `/` eran las 4 imagenes de producto
  (`landing-1/2/3/5.png`, todas 1672x941): 6.49 MB en PNG sin comprimir, servidas sin ancho/alto
  (causando CLS) y sin ninguna variante responsiva. Se generaron versiones WebP en dos niveles
  (960w y resolucion nativa 1672w, calidad 82) con Python/Pillow -- la unica herramienta de
  conversion de imagenes disponible en esta maquina (no hay cwebp/magick/ffmpeg/sharp instalados) --
  quedando en 0.35 MB combinadas en el nivel 1672w (-94.6%) y aun menos en el nivel 960w. Se
  envolvio cada `<img>` en `<picture>` con `<source type="image/webp" srcset="... 960w, ... 1672w">`
  y se dejo el PNG original como fallback de `<img>` (con `width`/`height` reales para reservar el
  espacio y evitar el layout shift). La imagen del hero (LCP de la pagina) ademas recibio
  `fetchpriority="high"`. Se corrigio tambien el layout-thrash que el detector de Impeccable venia
  marcando en `.wayra-demo-progress-bar` (`transition: width` en `landing.css:731`): se cambio a
  `transform: scaleX()` con `transform-origin: left`, actualizando el binding en `landing.html` de
  `[style.width.%]` a `[style.transform]`.
- **Por que:** la auditoria tecnica de Impeccable sobre `/` (13/20) ya habia marcado el
  layout-thrash del detector y la falta de dimensiones en las imagenes como hallazgos P2/P3, pero
  al pedir `$impeccable optimize` se midio el peso real de los archivos de imagen (no solo se leyo
  el markup) y resulto ser, por lejos, el cuello de botella mas grande de la pagina -- muy por
  encima del hallazgo de CSS que ya se conocia.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`, `frontend/public/landing/*.webp`
  (8 archivos nuevos), `AGENTS.md`.
- **Impacto:** solo landing publica; sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC. Verificado con `tsc --noEmit` (sin errores) y con el detector de Impeccable (el hallazgo
  `layout-transition` ya no aparece). Nota para una futura pasada: esta es una SPA sin SSR/prerender
  (`@angular/build:application` sin `server`/`prerender` en `angular.json`), asi que ninguna imagen
  puede empezar a descargarse hasta que el bundle de Angular termine de arrancar; eso es un techo
  de LCP mas grande que el peso de las imagenes, pero migrar a SSR es un cambio de arquitectura que
  requiere aprobacion explicita (afecta el despliegue en Railway) y no se toco en esta pasada.

---

### 2026-08-16 - Hardening de accesibilidad y resiliencia en el formulario de demo de la landing

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, a11y
- **Que se hizo:** tras una critica y una auditoria tecnica de Impeccable sobre la landing publica
  (`/`), se aplicaron los hallazgos P1/P2 mas criticos del formulario de solicitud de demo
  (`landing.html`/`landing.ts`/`landing.css`):
  - El campo "Cargo" (`jobTitle`, requerido) dependia de `rolesService.publicJobTitles()` sin
    ninguna opcion de respaldo: si la llamada fallaba, el select quedaba vacio y el usuario no
    podia avanzar del paso 1 nunca. Se agrego una opcion fija "Otro" (solo si el backend no la
    trae ya, via el getter `jobTitlesIncludeOtro`) y un boton "reintentar" junto al mensaje de
    error que vuelve a llamar `loadDemoJobTitles()` (antes privado, ahora publico para el
    template).
  - Se aplico el mismo patron de resiliencia a la carga de paises/departamentos/ciudades
    (`country-state-city` via import dinamico): se agregaron los estados
    `locationCountriesLoading`/`locationLoadError`, manejo de `try/catch` en
    `onDemoCountryChange`/`onDemoStateChange`/`loadDemoCountries`, un indicador "Cargando
    paises..." en el select y un boton de reintento.
  - Los 12 mensajes de error de validacion del formulario (`field-error`) no tenian ninguna
    asociacion accesible: se agrego `id` a cada `<small>`, `role="alert"`, y
    `[attr.aria-invalid]`/`[attr.aria-describedby]` en cada input/select correspondiente, ademas
    de `role="alert"` en los banners dinamicos (desajuste de horarios, error de envio).
  - El clic en el fondo del modal (`(click)="closeDemoModal()"`) reseteaba el formulario de 4
    pasos sin ninguna confirmacion. Se agrego `closeDemoModalWithConfirm()`, que pide confirmacion
    nativa solo si el formulario tiene datos sin guardar (`demoForm.dirty`) y la solicitud no se
    envio ya; se conecto al clic de fondo, la tecla Escape y el boton X del encabezado (el boton
    "Cancelar" explicito se dejo sin cambios, ya que su propio texto ya comunica la intencion de
    descartar).
  - Se agrego un limite superior (`Validators.max(2000)`, `max="2000"`) al campo "Numero de
    habitaciones", que solo tenia minimo.
  - Se agrego `aria-hidden="true"` a los 28 iconos decorativos `pi pi-*` de la pagina, que no
    llevaban ninguno salvo un caso existente.
- **Por que:** la critica Impeccable de hoy (31/40, Good) y la auditoria tecnica (13/20,
  Acceptable) del target `/` identificaron el campo "Cargo" sin respaldo como el unico hallazgo
  que puede bloquear el 100% de una sesion de conversion ante un fallo de red, ademas de la falta
  de anuncio accesible en los errores del formulario principal del sitio y la perdida silenciosa
  de datos al hacer clic fuera del modal.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.ts`,
  `frontend/src/app/components/pages/landing/landing.css`, `AGENTS.md`.
- **Impacto:** solo landing publica y su formulario de solicitud de demo; sin migraciones,
  variables nuevas, cambios de API ni recursos RBAC. Verificado con `tsc --noEmit` (sin errores) y
  con el detector de Impeccable (`detect.mjs`) antes y despues del cambio, sin nuevos hallazgos
  introducidos.

---

### 2026-08-16 - Fixes de UX en /reservar (enlace Volver y overflow del buscador)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** revision dirigida del flujo `/reservar` (busqueda, tarifas, solicitud,
  confirmacion; los 4 pasos comparten `allied-booking.css`). Se corrigio `.booking-view-back`
  (mismo bug que en `/hoteles-aliados`: `left: -4.25rem` lo recortaba fuera del hero en casi todo
  el rango de escritorio/tablet), afectando los 4 pasos. Se corrigio `.booking-search`: a partir de
  1040px el grid de 5 columnas usaba minimos fijos (`300/320/150/150/230px`, suma 1150px) que
  superaban el ancho disponible del contenedor en ese punto de quiebre (~900px), rompiendo el
  layout del buscador entre ~1040px y ~1289px de ancho; se redujeron los minimos
  (`240/240/100/100/170px`) para que quepan con margen. Ambos hallazgos se verificaron con
  medicion exacta de `getBoundingClientRect`/`scrollWidth` via Chrome DevTools Protocol antes y
  despues del fix, en 390/820/1040/1100/1200/1440px, y con capturas reales del buscador y del
  paso de tarifas con datos reales (Hotel Arimaca) en el rango antes roto.
- **Por que:** continuacion del pedido de mejorar las vistas publicas de hoteles aliados con
  Impeccable; se aplico el mismo criterio de priorizar hallazgos verificables sobre corridas
  formales de cada comando.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `AGENTS.md`.
- **Impacto:** solo el flujo publico de reserva con hoteles aliados; sin migraciones, variables
  nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-16 - Fixes de UX en /hoteles-aliados (enlace Volver, plural, dato vacio, a11y)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix, ux
- **Que se hizo:** revision dirigida de `/hoteles-aliados` (critique/audit/adapt/harden segun
  hallazgos, no los seis comandos sugeridos). Se corrigio el enlace "Volver" del hero, que estaba
  posicionado con `left: -4.25rem` respecto a un contenedor con mucho menos margen propio: quedaba
  recortado por el `overflow: hidden` del hero en casi todos los anchos de escritorio y tablet
  (solo escapaba en monitores ultra anchos), verificado con mediciones exactas de
  `getBoundingClientRect` via Chrome DevTools Protocol. Se corrigio el plural de "1 tipos de
  alojamiento" -> "1 tipo de alojamiento" con un getter `hotelTypeCount`. Se corrigio el separador
  huerfano "· Hotel" cuando `hotel.city` viene vacio. Se agrego `aria-live="polite"` a los mensajes
  de conteo/carga/error, y se corrigio que el contador de resultados se mostrara simultaneo al
  mensaje de carga (le faltaba `*ngIf="!loading"`). Tambien se ajusto `.allied-nav a` en movil
  (`min-width: 0`, `white-space: normal`) como endurecimiento defensivo, aunque la sospecha inicial
  de overflow horizontal en movil resulto ser un falso positivo de la herramienta de captura usada
  para diagnosticar (el escalado de pantalla de Windows distorsionaba el ancho de layout); se
  descarto tras medir el viewport real con el protocolo DevTools sin el flag de captura.
- **Por que:** el usuario pidio mejorar `/hoteles-aliados` citando los comandos
  critique/audit/layout/adapt/harden/polish de Impeccable, aclarando que no hacia falta usarlos
  todos. Se priorizaron los hallazgos verificables sobre corridas formales de cada comando.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.ts`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`, `AGENTS.md`.
- **Impacto:** solo la vista publica de hoteles aliados; sin migraciones, variables nuevas, cambios
  de API ni recursos RBAC. Verificado con capturas via Chrome DevTools Protocol
  (`Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`) en 390/820/1440px, mas
  medicion directa de `scrollWidth`/`getBoundingClientRect` para descartar overflow.

---

### 2026-08-16 - Peso visual de confianza, FAQ y contraste del panel de prueba

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux, fix
- **Que se hizo:** se le dio a "Base operativa segura" una tarjeta propia con fondo de acento en
  lugar de un simple borde divisor, siguiendo la observacion de la critica de que el bloque
  necesitaba mas peso visual para el gerente/dueno del hotel. En el FAQ se agrego la pregunta
  "¿Puedo empezar con pocas habitaciones?" y se amplio la respuesta de "¿Como funciona la
  solicitud de demo?" para aclarar que pasa despues de enviarla. Tras revision del usuario se
  detecto que el texto dentro de esa tarjeta (y de "Lo que queda registrado en Wayra") era casi
  ilegible: la regla `.wayra-operation-section p { color: var(--ink-muted) !important; }`,
  pensada para el fondo oscuro de toda la seccion "Operacion", se aplicaba tambien a las tarjetas
  claras anidadas dentro de `.wayra-proof-panel`. Se agrego
  `.wayra-operation-section .wayra-proof-panel p { color: var(--muted) !important; }` con mayor
  especificidad para restaurar el contraste correcto en ambas tarjetas.
- **Por que:** la critica Impeccable del 2026-08-16T08:15:53Z (23/32) dejaba dos observaciones
  menores sin resolver: el panel de confianza se leia como nota al pie y el FAQ no cubria que
  pasa tras enviar la solicitud ni si el producto sirve para hoteles pequenos. El bug de contraste
  lo reporto el usuario tras ver la tarjeta ya renderizada.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.css`,
  `frontend/src/app/components/pages/landing/landing.ts`, `AGENTS.md`.
- **Impacto:** solo landing publica; sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC. Verificado con capturas headless (Edge `--headless=new`) del hero, panel de prueba/confianza
  y FAQ contra el `ng serve` local, incluyendo un recorte ampliado de la tarjeta para confirmar el
  contraste tras el fix.

---

### 2026-08-16 - Distill Impeccable de la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se ejecuto `impeccable distill landing` sobre la landing publica. El tramo medio
  quedo reducido a una narrativa central de producto, tres momentos de turno y un bloque de prueba
  operativa; se retiraron secciones redundantes de beneficios/funcionalidades y se simplificaron
  labels, CTAs y microcopy del wizard de demo.
- **Por que:** la ultima critica marco que la landing aun repetia la misma promesa en demasiados
  bloques y necesitaba una lectura mas sobria, directa y centrada en operacion hotelera.
- **Impacto:** solo afecta la landing publica y la solicitud de demo en el frontend. No cambia APIs,
  modelos, migraciones ni recursos RBAC.
- **Pruebas:** `npm run lint`, `npm run build`, `impeccable detect` en modo degradado sin hallazgos,
  `git diff --check` y capturas headless de escritorio/movil con Edge.

### 2026-08-16 - Critica Impeccable tras demo compacta

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Que se hizo:** se ejecuto `impeccable critique landing` despues de compactar el formulario de
  demo, fusionar "Producto en accion" con "Como funciona" y ajustar contraste. La evaluacion dual
  quedo guardada en
  `.impeccable/critique/2026-08-16T08-15-53Z__tend-src-app-components-pages-landing-landing-html.md`
  con puntuacion 23/32. El detector CLI no reporto hallazgos, pero corrio en modo degradado por
  dependencias de parseo ausentes; no hubo overlay runtime porque el subagente no tuvo navegador
  controlable.
- **Por que:** hacia falta medir el estado posterior a los P1 aplicados y definir el siguiente foco:
  promesa principal mas especifica, prueba de credibilidad sin testimonios y menor repeticion en el
  tramo medio.
- **Archivos/areas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentacion y artefactos de revision sin migraciones, variables nuevas, cambios de
  API ni recursos RBAC.

---

### 2026-08-16 - Demo compacta y contraste de landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** el primer paso de la solicitud de demo quedo reducido a cuatro datos visibles
  (nombre de contacto, cargo, correo y telefono). El usuario sugerido y los comentarios pasaron al
  cierre como campos opcionales, mientras nombre, apellido y usuario requeridos por el backend se
  derivan automaticamente para conservar el payload existente. Tambien se compacto "Producto en
  accion" con el flujo de "Como funciona" y se oscurecieron tokens/clases de color con contraste
  bajo.
- **Por que:** tras la critica Impeccable, el usuario eligio reducir la friccion inicial del
  formulario, corregir contraste runtime y compactar el tramo medio de la landing para evitar
  repeticion entre producto y funcionamiento.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC; la API de solicitudes de demo recibe los mismos campos que antes.

---

### 2026-08-16 - Critica Impeccable tras jornada operativa y demo reordenada

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Que se hizo:** se ejecuto `impeccable critique landing` despues de reordenar el wizard de demo
  y reemplazar los tabs por la jornada operativa. La evaluacion dual quedo guardada en
  `.impeccable/critique/2026-08-16T07-55-23Z__tend-src-app-components-pages-landing-landing-html.md`
  con puntuacion 28/36. El detector CLI no reporto hallazgos, pero corrio en modo degradado; la
  inyeccion runtime en Chrome headless reporto principalmente contraste bajo y una transicion de
  layout.
- **Por que:** hacia falta medir si los dos P1 anteriores mejoraron y actualizar el backlog de
  decisiones con los nuevos riesgos prioritarios: friccion residual en el primer paso del formulario
  y contraste runtime.
- **Archivos/areas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentacion y artefactos de revision sin migraciones, variables nuevas, cambios de
  API ni recursos RBAC.

---

### 2026-08-16 - Demo con menos friccion y jornada operativa en landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se reordeno el wizard de demo para empezar por el contacto y dejar hotel,
  ubicacion y horarios como contexto posterior de personalizacion. Tambien se reemplazo la seccion
  de funcionalidades con tabs por un recorrido visible de jornada operativa que conecta reservas,
  habitaciones, huespedes, operacion, finanzas y reportes en una misma linea de trabajo.
- **Por que:** en la critica Impeccable el usuario priorizo los dos P1: reducir la confianza que
  exige el formulario al inicio y transformar el tramo medio para que deje de sentirse como catalogo
  repetido de modulos. La direccion visual elegida fue mas premium e identificable para hoteleria.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC; el payload de solicitud de demo se mantiene igual.

---

### 2026-08-16 - Critica dual Impeccable posterior al ajuste de confianza

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Que se hizo:** se ejecuto `impeccable critique landing` con evaluacion dual: un subagente para
  revision de diseno y otro para evidencia deterministica/browser. El snapshot quedo guardado en
  `.impeccable/critique/2026-08-16T07-23-45Z__tend-src-app-components-pages-landing-landing-html.md`
  con puntuacion 27/36. El detector CLI no reporto hallazgos, pero corrio en modo degradado; la
  inyeccion runtime en Chrome headless reporto principalmente hallazgos de contraste bajo.
- **Por que:** tras corregir el bloque `Base operativa segura`, hacia falta medir de nuevo la
  landing y definir el siguiente foco de mejora con evidencia separada de criterio visual y
  detector.
- **Archivos/areas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentacion y artefactos de revision sin migraciones, variables nuevas, cambios de
  API ni recursos RBAC.

---

### 2026-08-16 - Checklist compacto en bloque de operacion y confianza

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** se ajusto el bloque `Base operativa segura` dentro de la seccion `Operacion y
  confianza`: la lista de confianza dejo de renderizarse como tarjetas en grid y paso a un
  checklist vertical compacto con separador de columna en desktop.
- **Por que:** en la version fusionada las tarjetas internas partian el texto y competian
  visualmente dentro del panel, produciendo una tarjeta dentro de tarjeta y peor lectura.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-16 - Destilado de secciones repetidas en landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se fusionaron las secciones separadas de beneficios, resultados y confianza en
  un solo bloque `Operacion y confianza`, manteniendo los mensajes de turno, reportes y trazabilidad
  en una composicion mas corta. Tambien se renombraron los CTAs de demo a `Preparar demo
  personalizada` y el encabezado del modal a `Prepara tu demo de Wayra`.
- **Por que:** la critica final de Impeccable senalo que la landing ya era clara, pero demasiado
  larga para la persuasion adicional que agregaban las secciones intermedias. El usuario eligio
  compactar secciones y mantener el formulario completo enmarcandolo como preparacion de demo.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-16 - Critica final Impeccable de la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Que se hizo:** se ejecuto una nueva `impeccable critique landing` tras corregir el menu movil y
  pulir el copy operativo. La evaluacion dual quedo archivada en `.impeccable/critique/` con
  puntuacion 28/36, detector sin hallazgos en modo degradado y prioridades restantes centradas en
  reducir longitud/repeticion de secciones y aclarar la expectativa del formulario de demo.
- **Por que:** hacia falta cerrar la ronda de mejora con una medicion posterior a los fixes para
  confirmar que el problema de mobile ya no era el principal riesgo y dejar backlog claro para una
  futura simplificacion.
- **Archivos/areas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentacion sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-16 - Contraste del menu movil en landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** se reemplazo la dependencia del menu movil en utilidades genericas de fondo por
  clases propias `wayra-mobile-panel` y `wayra-mobile-link`, con fondo, borde, sombra, color y
  estados de foco/hover definidos desde los tokens de la landing.
- **Por que:** en movil el panel del menu se veia transparente y las opciones se confundian con el
  fondo de la landing. El menu necesitaba una superficie opaca y contraste propio para mantener la
  navegacion legible.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-16 - Copy operativo y accesos de huespedes en landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se aplicaron las decisiones posteriores a la segunda critica Impeccable: el copy
  de la landing se hizo mas concreto con escenas de recepcion, limpieza, caja y gerencia; el
  formulario de demo conserva sus cuatro pasos, pero ahora explica por que se solicita cada grupo
  de datos; y los accesos publicos `Hoteles aliados` y `Check-in online` se agruparon bajo
  `Accesos para huespedes` para bajar su peso frente al CTA de demo.
- **Por que:** el siguiente riesgo de conversion no era la mezcla de audiencias sino la falta de
  especificidad operativa y la percepcion de friccion del formulario. Mantener el formulario
  completo requeria justificar su utilidad antes de que el usuario lo complete.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-16 - Segunda critica Impeccable de la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Que se hizo:** se ejecuto nuevamente `impeccable critique landing` sobre la landing ya enfocada
  en operacion hotelera. La evaluacion dual dejo un nuevo snapshot en `.impeccable/critique/` con
  puntuacion 22/32, dos hallazgos P1 y prioridades centradas en responsive movil, friccion del
  formulario de demo y especificidad del copy operativo.
- **Por que:** despues del primer pulido era necesario verificar si la separacion de audiencias
  habia mejorado y detectar los siguientes riesgos antes de continuar con otro ajuste visual.
- **Archivos/areas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentacion sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-16 - Landing enfocada en operacion hotelera

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se pulio la landing publica con enfoque principal en personal de hotel: se
  retiraron el buscador de alojamiento, el bloque de check-in para huespedes y el directorio de
  hoteles aliados de la pagina principal; esos flujos quedan como accesos publicos desde el header.
  Tambien se limpio el TypeScript/CSS asociado y se ajusto el copy para explicar la operacion
  centralizada desde reservas hasta pagos, limpieza, inventario y reportes.
- **Por que:** la critica Impeccable detecto que la landing mezclaba dos audiencias con la misma
  jerarquia visual. Separar el mensaje B2B del acceso publico para huespedes deja mas claro que
  Wayra es una plataforma operativa para hoteles, sin ocultar las rutas de reserva y check-in
  online.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`, `AGENTS.md`.
- **Impacto:** cambios de frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-16 - Critica Impeccable de la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Qué se hizo:** se ejecutó `impeccable critique landing` con evaluación dual: revisión de diseño
  y detector técnico. Se archivó el reporte en `.impeccable/critique/` con una puntuación de
  22/32 y prioridades para un futuro pulido de la landing.
- **Por qué:** antes de rediseñar o pulir la landing, hacía falta identificar los problemas de
  jerarquía, audiencias, copy y estructura sin inventar pruebas comerciales no confirmadas.
- **Archivos/áreas afectadas:** `.impeccable/critique/`, `AGENTS.md`.
- **Impacto:** documentación sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-16 - Contexto de producto para Impeccable

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Qué se hizo:** se agregó `PRODUCT.md` con el contexto durable del producto para la skill
  Impeccable: plataforma web, usuarios principales, propósito, posicionamiento, capacidades,
  restricciones de marketing y evidencia disponible. También se registró `code-first` como flujo
  por defecto de nuevas superficies en `.impeccable/config.json`.
- **Por qué:** la skill necesitaba una fuente de verdad de producto antes de mejorar la landing sin
  inventar testimonios, clientes, precios ni promesas no confirmadas.
- **Archivos/áreas afectadas:** `PRODUCT.md`, `.impeccable/config.json`, `AGENTS.md`.
- **Impacto:** documentación sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-15 - Botón único de sesión en el header público

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** se retiró la etiqueta "Sesión iniciada" del header y del menú móvil de la
  landing. Cuando hay sesión activa queda únicamente el botón "Ir al panel", con texto forzado a una
  sola línea.
- **Por qué:** el estado adicional en el header agregaba ruido visual; la acción correcta para un
  usuario autenticado es entrar directamente al panel.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-15 - Estado de sesión en el header de landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** `AuthService` ahora recuerda en `localStorage` si la sesión está autenticada y
  refresca esa marca al iniciar sesión, cerrar sesión, consultar `/api/auth/me/` o validar sesión.
  La landing lee ese estado cacheado, lo valida contra el backend al cargar y cambia el header
  público de "Iniciar sesión" a "Ir al panel" cuando ya existe una sesión activa.
- **Por qué:** el header público seguía invitando a iniciar sesión aunque el usuario ya estuviera
  autenticado, lo que causaba confusión al volver a la landing.
- **Archivos/areas afectadas:** `frontend/src/app/services/auth/auth.ts`,
  `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

---

### 2026-08-15 - Aviso emergente de configuracion inicial del hotel

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** el layout autenticado ahora evalua el estado real de `HotelSettings` y muestra un
  modal cuando falta informacion inicial del hotel, con accion directa a `/hotel-config`. El
  dashboard dejo de mostrar el mensaje tecnico "No hay datos del backend" cuando un hotel nuevo aun
  no tiene operacion. Al convertir una solicitud de demo se crean tambien las habitaciones reales
  del primer piso usando el numero de habitaciones suministrado.
- **Por que:** un hotel creado desde demo puede quedar con campos de configuracion pendientes; el
  sistema debe guiar al usuario a completarlos sin presentar la ausencia de datos como error
  interno.
- **Archivos/areas afectadas:** `frontend/src/app/services/hotel-setup-status.ts`,
  `frontend/src/app/components/layout/layout-main/`,
  `frontend/src/app/components/pages/dashboard/dashboard.ts`,
  `frontend/src/app/components/auth/login/login.ts`,
  `backend/apps/demo_requests/views.py`, `backend/apps/demo_requests/tests.py`.
- **Impacto:** sin migraciones, variables nuevas ni recursos RBAC nuevos. La conversion de demo
  requiere que exista el catalogo `ROOM_STATUS:DISPONIBLE`, ya sembrado por migraciones de
  `master_data`.

---

### 2026-08-15 - Merge de migraciones de configuracion del hotel

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** se agrego una migracion merge `0009` en `hotel_settings` para unir las dos hojas
  `0008_hotelsettings_is_active` y `0008_hotelsettings_latitude_hotelsettings_longitude`.
- **Por que:** `makemigrations` fallaba con migraciones conflictivas porque ambos cambios partian de
  `0007_payment_method_type_and_account`.
- **Archivos/areas afectadas:** `backend/apps/hotel_settings/migrations/`.
- **Impacto:** no modifica tablas por si misma; permite continuar con `makemigrations` y `migrate`.

### 2026-08-15 - Opcion Mi ubicacion en buscador publico

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se agrego la opcion `Mi ubicacion` al selector de destino en `/reservar` y en
  el buscador del landing. La opcion usa la geolocalizacion del navegador, resuelve ciudad/pais y
  selecciona el destino aliado que coincida con la ubicacion actual.
- **Por que:** el huesped debe poder consultar rapidamente alojamientos disponibles cerca de donde
  se encuentra sin escribir manualmente ciudad o pais.
- **Archivos/areas afectadas:** `frontend/src/app/shared/current-location-destination.ts`,
  `frontend/src/app/components/pages/allied-booking/`,
  `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC. La opcion depende del permiso de ubicacion del navegador y de reverse geocoding publico para
  resolver ciudad/pais.

---

### 2026-08-15 - Disponibilidad real en resultados de reserva publica

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** `/api/allied-hotels/` ahora acepta `checkIn`, `checkOut`, `rooms` y `guests` para
  calcular disponibilidad real por tarifa. El endpoint excluye tarifas sin habitaciones libres para
  las fechas indicadas y oculta hoteles sin tarifas disponibles. El flujo publico de reserva usa esa
  consulta en la busqueda, la vista de tarifas y la solicitud.
- **Por que:** los resultados no debian mostrar alojamientos o tarifas que luego fallaban al
  registrar la reserva por falta de habitaciones disponibles.
- **Archivos/areas afectadas:**
  `backend/apps/hotel_settings/services.py`, `backend/apps/hotel_settings/views.py`,
  `backend/apps/hotel_settings/serializers.py`, `backend/apps/hotel_settings/tests.py`,
  `frontend/src/app/services/allied-hotels.ts`, `frontend/src/app/shared/allied-hotels.ts`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio compatible del endpoint publico; sin migraciones ni recursos RBAC nuevos.

---

### 2026-08-15 — Rediseño de confirmacion de reserva publica

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la vista `/reservar/confirmacion/:reservationId` se rediseño como una pagina de
  cierre con icono destacado, mensaje principal y acciones alineadas. Se elimino el texto que
  repetia el numero de reserva y el hotel dentro del cuerpo.
- **Por que:** la confirmacion anterior se veia como una alerta embebida y repetia informacion que
  ensuciaba la vista publica.
- **Archivos/areas afectadas:**
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-15 — Confirmacion de reserva publica en vista separada

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se agrego la ruta publica `/reservar/confirmacion/:reservationId` para mostrar
  la confirmacion de una reserva web registrada. El formulario de solicitud ahora navega a esa vista
  despues de recibir la respuesta del backend, en vez de mostrar la confirmacion dentro del mismo
  formulario.
- **Por que:** la confirmacion de reserva debia sentirse como un cierre de flujo independiente y
  dejar claro que el hotel fue notificado y que el huesped recibira un correo con los datos y
  proximos pasos.
- **Archivos/areas afectadas:** `frontend/src/app/app.routes.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-request.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking-confirmation.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-15 — Confirmacion manual del calendario publico

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** los calendarios de fechas en `/reservar` y en la landing ahora usan un rango
  temporal y botones `Cancelar` / `Aceptar` dentro del panel. Las fechas solo pasan al formulario de
  busqueda cuando el usuario confirma el rango completo.
- **Por que:** el usuario necesitaba seleccionar llegada y salida y confirmar explicitamente antes
  de que esas fechas quedaran escogidas para buscar alojamiento.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-booking/allied-booking.ts`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.css`,
  `frontend/src/app/components/pages/landing/landing.ts`,
  `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/landing/landing.css`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

---

### 2026-08-15 — Reservas web registradas en backend

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Que se hizo:** se agrego el endpoint publico `POST /api/web-reservations/` y el servicio
  `create_web_reservation()` para convertir una solicitud del sitio web en una reserva real del
  hotel. El flujo crea o actualiza el cliente del hotel, valida tarifa y disponibilidad, asigna
  habitaciones, registra el huesped principal y marca la reserva con origen `WEB`.
- **Por que:** las reservas hechas desde la web debian quedar dentro de la operacion del hotel y no
  como un correo o solicitud externa sin trazabilidad.
- **Archivos/areas afectadas:** `backend/apps/reservations/`,
  `backend/apps/notifications/services.py`, `backend/backend/settings.py`,
  `frontend/src/app/services/web-reservation.ts`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** agrega la migracion `reservations.0011_reservation_web_source`, nuevos campos de
  trazabilidad en `Reservation` (`source_channel`, `source_detail`, `source_url`,
  `source_referrer`, `source_metadata`), el throttle `web_reservation` y el endpoint publico
  `POST /api/web-reservations/`. Requiere catalogos activos `RESERVATION_ORIGIN:WEB`,
  `RESERVATION_STATUS:PENDIENTE`, `DOCUMENT_TYPE`, `CLIENT_TYPE:REGULAR`, `CLIENT_STATUS:ACTIVO`
  y habitaciones disponibles para la tarifa seleccionada. No agrega recursos RBAC porque el endpoint
  es publico y usa `AllowAny`.

---

### 2026-08-15 — Booking publico separado por vistas

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** el flujo publico de `/reservar` quedo dividido en tres rutas: busqueda y
  seleccion de hotel, seleccion de tarifa en `/reservar/tarifas/:hotelSlug`, y solicitud del huesped
  en `/reservar/solicitud/:hotelSlug/:rateId`. Los criterios de busqueda viajan por query params
  para poder avanzar, volver o recargar sin perder fechas, habitaciones ni huespedes.
- **Por que:** seleccionar hotel, elegir tarifa y preparar la reserva en una sola vista hacia la
  pantalla demasiado larga y mezclaba decisiones distintas del huesped.
- **Archivos/areas afectadas:** `frontend/src/app/app.routes.ts`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-14 — Hoteles aliados sin opacidad inicial

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** las tarjetas de hoteles aliados de la landing dejaron de usar la clase
  `wayra-reveal`, por lo que ya no arrancan con `opacity: 0`.
- **Por que:** al ser contenido cargado dinamicamente desde el backend, la animacion de entrada podia
  dejar cards invisibles si el `IntersectionObserver` no las alcanzaba a marcar como visibles.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-14 — Ocultar descripcion tecnica en hoteles aliados

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** las vistas publicas de hoteles aliados dejaron de mostrar `HotelSettings.description`
  en la landing, el directorio y el flujo de reserva aliado; el directorio tampoco usa ese campo en
  el texto buscable.
- **Por que:** algunos hoteles creados desde solicitud de demo tienen una descripcion tecnica como
  "Creado desde solicitud de demo. Tipo de alojamiento: Hotel.", que no debe mostrarse al publico.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.html`,
  `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/allied-booking.html`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-14 — Tarjetas dinamicas visibles en landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** la landing vuelve a registrar las animaciones de entrada despues de cargar los
  hoteles aliados activos desde el backend.
- **Por que:** las tarjetas de hoteles aliados se renderizan despues de la llamada HTTP y quedaban
  con `opacity: 0` porque el `IntersectionObserver` se habia inicializado antes de que existieran en
  el DOM.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.ts`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-14 — Landing con seis hoteles aliados

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la landing ahora muestra hasta seis hoteles aliados activos en la seccion
  publica de hoteles aliados.
- **Por que:** el endpoint publico ya devuelve los hoteles aliados activos de Wayra, pero la landing
  seguia limitando la vista destacada a tres tarjetas.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.ts`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API; si hay menos de seis hoteles
  activos, se muestran solo los disponibles.

### 2026-08-14 — Hoteles aliados activos desde backend

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Que se hizo:** se agrego `is_active` a `HotelSettings`, el servicio backend que arma el
  directorio publico de hoteles aliados activos y el endpoint `GET /api/allied-hotels/`. La landing,
  el directorio de hoteles aliados y la busqueda publica de alojamiento ahora consumen ese endpoint
  en vez del catalogo estatico del frontend.
- **Por que:** los hoteles aliados visibles al publico deben salir de los hoteles reales activos
  dentro de Wayra, no de una lista fija ni de hoteles desactivados por la plataforma.
- **Archivos/areas afectadas:** `backend/apps/hotel_settings/models.py`,
  `backend/apps/hotel_settings/services.py`, `backend/apps/hotel_settings/views.py`,
  `backend/apps/hotel_settings/serializers.py`, `backend/apps/hotel_settings/urls.py`,
  `backend/apps/hotel_settings/tests.py`, `frontend/src/app/services/allied-hotels.ts`,
  `frontend/src/app/components/pages/{landing,allied-hotels,allied-booking}/`.
- **Impacto:** requiere migracion `hotel_settings.0008_hotelsettings_is_active`; agrega el endpoint
  publico `GET /api/allied-hotels/` sin variables de entorno nuevas.

### 2026-08-13 — Migraciones de metodos de pago compatibles con PostgreSQL

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** deploy
- **Que se hizo:** las migraciones que repuntan metodos de pago desde `MasterData` hacia
  `hotel_settings.PaymentMethod` ahora se ejecutan sin transaccion global, y la migracion que elimina
  `description` y `sort_order` de `PaymentMethod` espera explicitamente a que billing, finance y
  reservas terminen de migrar sus referencias.
- **Por que:** el deploy de Railway fallaba en `billing.0007_payment_hotel_payment_method` con
  `cannot ALTER TABLE "payment_method" because it has pending trigger events`; PostgreSQL no permite
  mezclar esos cambios de datos y esquema sobre tablas con triggers FK pendientes en una sola
  transaccion.
- **Archivos/areas afectadas:** `backend/apps/billing/migrations/0007_payment_hotel_payment_method.py`,
  `backend/apps/finance/migrations/0005_expense_hotel_payment_method.py`,
  `backend/apps/reservations/migrations/0010_deposit_hotel_payment_method.py`,
  `backend/apps/hotel_settings/migrations/0007_payment_method_type_and_account.py`.
- **Impacto:** requiere redeploy; no agrega migraciones nuevas ni variables de entorno.

### 2026-08-13 — Check-in online publico separado del modulo interno

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Que se hizo:** se creo la ruta publica `/check-in-online` con una vista independiente para que
  el huesped principal ingrese el codigo de reserva y complete sus datos de check-in. Tambien se
  agregaron alias publicos (`/online-check-in`, `/checkin-online`) y se cambiaron todos los enlaces
  publicos de la landing que antes apuntaban a `/reservas?action=CHECKIN`.
- **Por que:** el check-in online de huespedes no debe llevar al flujo operativo que usa recepcion o
  un usuario autenticado de la app de gestion hotelera.
- **Archivos/areas afectadas:** `frontend/src/app/app.routes.ts`,
  `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/components/pages/online-check-in/`.
- **Impacto:** cambio frontend publico sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC; el flujo no ejecuta el endpoint interno de check-in de reservas.

### 2026-08-13 — Botones de volver mas hacia la izquierda

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se aumento el desplazamiento horizontal del boton interno de volver en
  `/hoteles-aliados` y `/reservar` para acercarlo mas a la esquina izquierda del hero en escritorio.
- **Por que:** el ajuste anterior todavia quedaba demasiado cerca del eje central del contenido.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Botones de volver en esquina superior izquierda

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se posiciono el enlace interno de volver de `/hoteles-aliados` y `/reservar`
  como accion absoluta en la esquina superior izquierda del hero, sin ocupar espacio en el bloque de
  texto central y conservando una posicion contenida en movil.
- **Por que:** el control debia quedar mas cercano a la esquina superior izquierda y menos integrado
  al encabezado central de cada vista.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Botones de volver mas sutiles

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se hizo mas discreto el boton interno de volver en `/hoteles-aliados` y
  `/reservar`, eliminando el fondo fijo, reduciendo altura y padding, bajando contraste por defecto
  y desplazandolo mas hacia la izquierda en escritorio. En movil vuelve al borde normal del
  contenedor para evitar recortes.
- **Por que:** el boton de regreso debia estar disponible sin competir visualmente con el titulo del
  hero ni sentirse intrusivo.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Botones de volver mas pegados al borde

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se desplazo levemente hacia la izquierda el boton interno de volver en
  `/hoteles-aliados` y `/reservar`.
- **Por que:** el boton ya estaba lateral, pero necesitaba quedar un poco mas cercano al borde
  visual del contenido.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Botones de volver alineados al lateral

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se ajustaron los botones internos de volver en `/hoteles-aliados` y `/reservar`
  para que queden alineados al lateral del contenedor del hero, no centrados con el texto principal.
- **Por que:** el boton de regreso debia funcionar como accion contextual de navegacion y no como
  parte del bloque central del encabezado.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Botones de volver en vistas publicas alternas

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se agrego un boton interno de volver en el hero de `/hoteles-aliados` y otro en
  el hero de `/reservar`, sin mover acciones al header. El primero vuelve al inicio y el segundo al
  directorio de hoteles aliados.
- **Por que:** las vistas publicas alternas necesitaban una salida visible dentro del contenido,
  independiente de la navegacion superior.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual/navegacion frontend sin migraciones, variables nuevas, cambios de API
  ni recursos RBAC.

### 2026-08-13 — Header de hoteles aliados alineado a la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se reorganizo el header de `/hoteles-aliados` con una navegacion publica mas
  completa, agregando acceso a busqueda de alojamiento y aplicando proporciones, ancho, sombra,
  botones y comportamiento responsive coherentes con la landing.
- **Por que:** la vista de hoteles aliados tenia un header mas angosto y simple que se sentia
  desconectado del resto de las paginas publicas.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-hotels/`.
- **Impacto:** cambio visual/navegacion frontend sin migraciones, variables nuevas, cambios de API
  ni recursos RBAC.

### 2026-08-13 — Header de landing en orden secuencial

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se reordeno la navegacion principal de la landing para que sus enlaces sigan el
  orden vertical real de las secciones: buscar alojamiento, hoteles aliados, producto,
  funcionalidades, operacion, publico y FAQ.
- **Por que:** el header hacia saltos hacia abajo y hacia arriba porque los enlaces no seguian el
  orden del contenido.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/landing.ts`.
- **Impacto:** cambio visual/navegacion frontend sin migraciones, variables nuevas, cambios de API
  ni recursos RBAC.

### 2026-08-13 — Landing menos estrecha en escritorio

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se amplio el ancho maximo base de los contenedores principales de la landing y
  se dio mas ancho al texto descriptivo del hero.
- **Por que:** la landing se percibia demasiado estrecha en pantallas de escritorio.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Card de busqueda en reservar alineado a landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se ajusto el card de busqueda de `/reservar` para que use proporciones,
  espaciado, campos, labels con iconos y boton similares al buscador de la landing. Tambien se
  elevo el apilamiento visual del buscador y sus paneles para que el calendario aparezca por encima
  de las cards inferiores.
- **Por que:** el flujo de reserva publica debia verse consistente con el buscador inicial de la
  landing.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Buscador sin nota de limite

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se elimino del buscador de alojamiento en la landing la nota visual de busqueda
  limitada y la etiqueta de noches que aparecian encima del boton.
- **Por que:** el bloque agregaba ruido visual y el usuario pidio retirarlo del card.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-13 — Buscador con destino y rango unificados

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se unificaron pais y ciudad en un solo campo de destino con sugerencias para
  buscar por pais o ciudad, y se reemplazaron los campos separados de check-in/check-out por un
  calendario de rango con `DatePicker` de PrimeNG. El destino ahora abre un panel filtrable con
  ciudad y pais en dos lineas, y el calendario se redujo a un mes para aparecer mas compacto debajo
  del campo. Tambien se ajusto el texto visible para mostrar plurales reales (`1 noche`, `17
  noches`) en lugar de etiquetas con parentesis. El flujo publico de `/reservar` conserva
  compatibilidad con URLs antiguas que envian `country` y `city`.
- **Por que:** el buscador necesitaba menos campos visibles y una seleccion de fechas mas natural
  para el usuario.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC;
  no se instalo ninguna libreria porque PrimeNG ya estaba disponible.

### 2026-08-13 — Buscador de alojamiento mas ancho

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** se aumento el ancho maximo del contenedor del buscador de alojamiento en la
  landing y se ajustaron las columnas del card para dar mas espacio a pais, ciudad y fechas.
- **Por que:** los campos del formulario se veian demasiado angostos en escritorio.
- **Archivos/areas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-12 — Estética del buscador de alojamiento

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** se centró el encabezado de la sección de búsqueda de alojamiento, se agregaron
  iconos a los títulos de país, ciudad, check-in, check-out, habitaciones y huéspedes, y se
  aumentaron altura, separación y ancho útil de los controles para que la barra no se vea apiñada.
- **Por qué:** la primera versión horizontal resolvía la dirección del layout, pero visualmente se
  sentía comprimida y poco pulida dentro de la landing.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-12 — Buscador de alojamiento horizontal

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** se ajustó la sección de búsqueda de alojamiento en la landing para que el
  formulario use una barra horizontal de ancho completo en escritorio, con los campos en una sola
  fila y el botón de búsqueda al costado. En tablet se reorganiza en varias columnas y en móvil se
  apila para mantener legibilidad.
- **Por qué:** el buscador debía sentirse como una barra de booking alargada, no como una tarjeta
  cuadrada dentro de la landing.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`.
- **Impacto:** cambio visual frontend sin migraciones, variables nuevas, cambios de API ni recursos
  RBAC.

### 2026-08-12 — Buscador de alojamiento en la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** se agregó una sección pública en la landing para buscar alojamiento por país,
  ciudad, check-in, check-out, habitaciones y huéspedes. El formulario redirige a `/reservar` con
  los criterios seleccionados, y la vista de booking precarga esos datos y ejecuta la búsqueda si la
  URL trae una consulta completa.
- **Por qué:** el usuario debe poder iniciar la búsqueda de alojamiento desde la landing sin entrar
  primero al listado completo; la selección de hotel, habitación/tarifa y datos personales se mantiene
  en el flujo público de booking.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/components/pages/allied-booking/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC;
  la búsqueda sigue limitada al catálogo público de hoteles aliados.

### 2026-08-12 — Booking por pasos: hotel, habitación/tarifa y datos

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** el booking público ahora sigue el flujo: buscar país, ciudad, fechas,
  habitaciones y huéspedes; seleccionar un hotel disponible; seleccionar una habitación/tarifa; y
  solo después mostrar el formulario de datos del huésped. Se añadieron opciones `roomRates` al
  catálogo de hoteles aliados para mostrar tarifas disponibles y totales estimados.
- **Por qué:** el formulario de datos no debía aparecer apenas existieran resultados; el huésped
  primero debe elegir hotel y luego la opción de habitación/tarifa que quiere solicitar.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-booking/`,
  `frontend/src/app/shared/allied-hotels.ts`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC;
  las habitaciones/tarifas y disponibilidad siguen siendo datos públicos simulados en frontend.

### 2026-08-12 — Booking con búsqueda de destino y opciones disponibles

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la vista pública `/reservar` ahora inicia con un buscador por país, ciudad,
  check-in, check-out, habitaciones y huéspedes; después muestra opciones disponibles únicamente
  dentro de `ALLIED_HOTELS`, con disponibilidad estimada, tarifa desde y total estimado. El formulario
  de datos del huésped aparece solo después de elegir una opción disponible.
- **Por qué:** el flujo debía parecerse a un booking real: primero consultar destino y fechas, luego
  seleccionar una alternativa y finalmente preparar la solicitud.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-booking/`,
  `frontend/src/app/shared/allied-hotels.ts`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC;
  la disponibilidad es estimada en frontend hasta que exista un endpoint público de reservas.

### 2026-08-12 — Booking público limitado a hoteles aliados

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** se creó la ruta pública `/reservar` con una vista de solicitud preliminar de
  reserva limitada al catálogo `ALLIED_HOTELS`; el botón "Reservar" del directorio de hoteles
  aliados abre esa vista con el hotel preseleccionado. También se agregó el alias `/booking`.
- **Por qué:** los huéspedes necesitaban iniciar una reserva solo para alojamientos asociados, sin
  exponer el módulo interno de reservas ni inventar un endpoint público con implicaciones de
  multi-tenancy y RBAC.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-booking/`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`,
  `frontend/src/app/app.routes.ts`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC;
  la solicitud se prepara como correo al contacto del hotel aliado.

### 2026-08-12 — Directorio de hoteles aliados alineado a la landing

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** se corrigió el CSS de `/hoteles-aliados` para usar los mismos tokens, sombras,
  bordes, botones, hero oscuro y superficies claras de la landing de Wayra, eliminando la paleta
  adicional verde/ámbar/rosa y estilos ajenos a esa página.
- **Por qué:** la vista completa debía verse como una extensión de la landing existente, no como un
  diseño nuevo con colores externos.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-hotels/allied-hotels.css`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

### 2026-08-12 — Directorio de hoteles aliados con paleta clara

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** la vista pública `/hoteles-aliados` dejó de usar un fondo completamente oscuro y
  pasó a una composición clara con header blanco, hero azul/verde/ámbar suave, filtros en tarjeta
  blanca y cards con acentos rotativos de color.
- **Por qué:** el directorio completo debía sentirse conectado con la variedad visual de la landing,
  no como una pantalla oscura independiente.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/allied-hotels/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

### 2026-08-12 — Ajuste de acciones en Hoteles Aliados

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** se quitaron los botones "Ver detalles" de las tarjetas destacadas de Hoteles
  Aliados en la landing, y en la vista completa el botón de cada hotel cambió de "Contactar" a
  "Reservar".
- **Por qué:** la landing debía quedar como una vista resumida sin acciones por tarjeta, mientras
  que el directorio completo debía orientar la acción principal hacia la reserva.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/components/pages/allied-hotels/allied-hotels.html`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

### 2026-08-12 — Landing con Hoteles Aliados y vista pública de directorio

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** se agregó una sección de Hoteles Aliados en la landing con tarjetas destacadas y
  botón "Ver más"; además se creó la ruta pública `/hoteles-aliados` para consultar el directorio
  completo con búsqueda y filtro por tipo de alojamiento.
- **Por qué:** los huéspedes necesitan ubicar rápidamente alojamientos que trabajan con Wayra y
  acceder desde la landing a un listado más completo.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/components/pages/allied-hotels/`, `frontend/src/app/shared/allied-hotels.ts`,
  `frontend/src/app/app.routes.ts`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas, cambios de API ni recursos RBAC.

### 2026-08-12 — Botón del header para colapsar el menú lateral

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** el botón del header que abre el menú lateral ahora permanece visible también en
  escritorio, recibe el estado real del aside y cambia su icono, `aria-label`, `title` y
  `aria-expanded` para indicar si va a colapsar, expandir, abrir o cerrar el menú.
- **Por qué:** en escritorio el botón existía pero estaba oculto por CSS, así que el usuario no
  tenía una acción disponible para liberar espacio horizontal colapsando el aside.
- **Archivos/áreas afectadas:** `frontend/src/app/components/layout/header/`,
  `frontend/src/app/components/layout/layout-main/layout-main.html`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-15 — Vista previa del sitio web en Configuración del Hotel

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el campo **Sitio Web** en Configuración del Hotel ahora muestra una tarjeta de verificación con favicon, URL normalizada y dominio detectado. La comprobación real se hace con **Abrir sitio**, en pestaña nueva segura, y al confirmar se guarda la URL con esquema `https://`.
- **Por qué:** el usuario necesita verificar que está escribiendo el enlace correcto del hotel, especialmente cuando pega dominios sin `https://`. Se descartó el iframe porque sitios públicos como Facebook bloquean ser embebidos y mostraban un error del navegador aunque la URL estuviera bien.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/hotel-settings/hotel-settings.ts`, `frontend/src/app/components/pages/hotel-settings/hotel-settings.html`, `frontend/src/app/components/shared/site-preview/`.
- **Impacto:** cambio frontend sin migraciones, variables nuevas ni cambios de API.

### 2026-08-15 — Minimapa en configuración del hotel: el punto exacto, no solo la calle

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Decisión de arquitectura:** ninguna nueva. Se añade **Leaflet** + **OpenStreetMap/Nominatim**:
  sin llave de API ni costo, a diferencia de Google Maps.
- **Por qué hace falta el punto y no basta la dirección:** "carrera 14a # 27b 28" se geocodifica a
  media cuadra de distancia, y en un pueblo pequeño a varias. Por eso el mapa **propone** un punto y
  después deja moverlo —clic para saltar, arrastrar para afinar—, y lo que se guarda es lo último
  que dejó el usuario, no lo que dijo el geocodificador.
- **Tres caminos, según dónde esté quien configura:**
  1. **Buscar por dirección** — arma la consulta con dirección + ciudad + departamento + país (con
     "Colombia" a secas saldría el centro del país). Es explícito y no al teclear: Nominatim admite
     una petición por segundo, y además mover el mapa bajo los dedos es hostil.
  2. **Usar mi ubicación** — toma el GPS y **rellena la dirección hacia atrás**. Estando en el
     hotel es el camino más corto: no hay que escribir nada, solo revisar. El punto del GPS manda
     sobre la dirección deducida: el aparato sabe dónde está mejor de lo que el geocodificador sabe
     redactar la calle.
  3. **Clic en el mapa** — siempre disponible, y es lo que se ofrece cuando cualquiera de los otros
     dos falla.
- **La cascada no se pisa a ciegas.** País, departamento y ciudad son desplegables con catálogo. Lo
  que el geocodificador nombre de otra forma **se queda como estaba**: asignar un valor que el
  desplegable no reconoce dejaría el campo en blanco, que es peor. La comparación ignora mayúsculas
  y acentos —"Bogota" y "Bogotá" son el mismo sitio—.
- **`Decimal` y no `Float`** para las coordenadas: es un dato que se compara y se muestra, y el
  binario flotante arrastra error al guardarse y releerse. Seis decimales ≈ 11 cm, de sobra para
  señalar una puerta.
- **Efecto secundario que vale la pena:** `hotel-config` era una ruta **eager** —una pantalla de
  1.800 líneas viajando en el paquete inicial de toda la aplicación—. Al hacerla perezosa para que
  el mapa no engordara el arranque, el paquete inicial bajó a **1,98 MB**: por primera vez en la
  sesión, **por debajo de su presupuesto**. El aviso de `build:ci` que llevaba semanas ahí,
  desapareció.
- **Cinco fallos del mapa, corregidos tras verlo en pantalla** (no se veían leyendo el código):
  0. **El de fondo: el CSS de Leaflet estaba encapsulado.** Angular marca los estilos de componente
     con un atributo de ámbito que **solo llevan los elementos del template**. Leaflet crea sus
     paneles, teselas y marcadores en tiempo de ejecución, sin ese atributo, así que importar
     `leaflet.css` dentro del componente dejaba sus reglas sin alcanzarlos: los paneles se quedaban
     en `position: static` y las teselas fluían por el documento en vez de colocarse — el mosaico
     partido, y el marcador sin sitio. Ahora vive en `styles.css`, global a propósito; todas sus
     clases van prefijadas `.leaflet-`, así que no colisiona con nada.
     **Se diagnosticó midiendo**, no leyendo: una prueba que compara `getComputedStyle` sobre
     `.leaflet-container` (que sí recibía estilo, por ser el `div` del template) contra
     `.leaflet-pane` (que no). Esa comparación es ahora una prueba de regresión, y se comprobó que
     **falla** al quitar el import.
  1. **Interoperabilidad CommonJS.** Leaflet no es ESM: según cómo lo empaquete el bundler,
     `import()` entrega el módulo directamente o envuelto en `.default`. Con la forma equivocada,
     `leaflet.map` era `undefined` y el mapa moría en silencio dentro del `catch`. Ahora se aceptan
     las dos formas.
  2. **Teselas descuadradas.** Leaflet calcula cuántas pedir al montarse, y aquí nace dentro de una
     pestaña y una tarjeta que todavía se están maquetando: se medía más pequeño de lo que acaba
     siendo. Se resuelve con `invalidateSize()` en el siguiente cuadro y un `ResizeObserver`, que
     además lo arregla solo al cambiar de pestaña o redimensionar.
  3. **Marcador invisible.** El icono por defecto son tres PNG que Leaflet resuelve por la URL de su
     CSS; con el empaquetador de Angular esa ruta no existe. El punto quedaba fijado pero no se veía
     dónde. Ahora es un `divIcon` dibujado con CSS: no depende de ningún archivo y usa los tonos del
     sistema.
  4. **Dos mapas en el mismo contenedor.** `initMap` espera a que llegue Leaflet y durante esa
     espera `this.map` sigue en `null`; Angular dispara `ngOnChanges` una vez por entrada que
     cambia, y aquí son seis. Ahora un candado garantiza un solo montaje.
- **La tarjeta de resumen del pie decía "integración con mapa disponible próximamente".** Ahora el
  mapa existe, así que dice lo que de verdad importa: si el punto exacto está puesto —con sus
  coordenadas— o si todavía falta señalarlo, con un distintivo de *ubicación completa / incompleta*.
- **Pruebas:** 508 frontend (25 nuevas: consulta compuesta, redondeo, permiso denegado, ciudad en
  campos distintos según el país, que el punto sobrevive aunque falle la geocodificación inversa, las tres
  regresiones del montaje, las dos de estilos y las de la cascada de desplegables) y 65 backend
  de las apps tocadas.

---

### 2026-08-15 — El registro de actividad no registraba nada: ahora hay auditoría de verdad

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat + fix
- **Decisión de arquitectura:** **sí** — nueva sección **5.23**, consultada antes con el usuario
  (alcance: toda escritura de la API con diff campo a campo; retención: sin purga, con exportación
  a CSV).
- **El hallazgo:** `/actividad` no leía ninguna tabla de auditoría porque **no existía**.
  Reconstruía una línea de tiempo con pagos, movimientos, órdenes y reservas. Cubría 4 dominios de
  43, solo mostraba altas, y cambiaba retroactivamente al editarse cualquier registro.
- **Lo que hay ahora:** `accounts.AuditLog` —append-only— con autor, nombre desnormalizado, hotel,
  acción, entidad, registro, **diff campo a campo**, IP, ruta, método y cliente. Se escribe por
  señales; el usuario y la IP llegan por `AuditContextMiddleware`. El detalle y el porqué, en 5.23.
- **Dos fallos que aparecieron al probarlo, no al leerlo:**
  - Las señales se disparan **dentro de las migraciones de datos**, donde la tabla puede no existir
    todavía: reventaba un `migrate` desde cero, o sea cualquier despliegue nuevo.
  - Los campos `auto_now` hacían que **cada `save()`** dejara una fila diciendo solo "updated_at
    cambió".
- **Un tercero, en una prueba existente:** `SeedRbacCoverageTests` daba por hecho que toda lectura
  deriva `<scope>_deleted`, cuando `HasResourcePermission` solo lo hace si la vista sabe resolver
  `include_deleted`. Exigía sembrar un permiso inexistente; la prueba ahora comprueba lo que el
  permiso hace de verdad, y sigue protegiendo el caso real.
- **La pantalla:** renombrada a **Auditoría** en `/auditoria` (los enlaces viejos redirigen). Cada
  fila se despliega en su sitio con la tabla *campo · antes · después*, y debajo el origen —IP,
  ruta, cliente—. Filtros por acción, entidad, usuario y rango de fechas, poblados **solo con lo
  que de verdad aparece**, más exportación a CSV.
- **Pruebas:** 280 backend (12 nuevas, incluidas aislamiento por hotel y que el rastro **no se
  puede escribir** por la API) y 483 frontend.

---

### 2026-08-15 — Reportes: los gráficos mentían, y ahora son gráficos de verdad

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix + refactor
- **Decisión de arquitectura:** ninguna. Chart.js vía `p-chart`, igual que el dashboard y control
  financiero: las tres pantallas de análisis quedan con el mismo motor y el mismo lenguaje visual.
- **El fallo de fondo: los gráficos mentían.** Las líneas eran SVG a mano con
  `preserveAspectRatio="none"`, que **estira el trazo de forma no uniforme**: la pendiente que se
  veía no era la de los datos, y el grosor del trazo variaba con el ancho de la ventana. No es un
  problema de gusto —es un gráfico que dice algo distinto de lo que pasó—. Eran tres: ingresos vs
  utilidad, utilidad neta mensual y tasa de ocupación.
- **Y las barras no eran barras:** `div`s con `height` en porcentaje, sin eje, sin valor y sin nada
  al pasar el cursor. Había cinco así.
- **Los anillos pasan a barras.** Métodos de pago y origen de huéspedes se dibujaban con
  `conic-gradient` y una leyenda de seis colores que había que descifrar. Comparar longitudes es
  más fácil que comparar arcos, y con el nombre en el eje sobra la leyenda de colores. La lista de
  debajo se queda, pero ya no como leyenda: es el acceso al detalle de cada fila.
- **Un eje que no miente:** la tasa de ocupación va fija de **0 a 100**. Escalada al máximo de la
  serie, un mes flojo llenaba la gráfica y parecía un lleno total.
- **Dónde sí hace falta leyenda:** ingresos vs utilidad e ingresos vs gastos llevan dos series, y
  dos series nunca se distinguen solo por color. Además el verde `#1baf7a` queda por debajo de 3:1
  de contraste sobre blanco, y la etiqueta visible es el alivio que esa regla exige —no es opcional—.
- **Paleta validada, no elegida a ojo:** azul `#2a78d6`, verde `#1baf7a`, rojo `#e34948`,
  comprobados con el validador contra el fondo real (`#ffffff`).
- **Además:** la pestaña vive en la URL (`?tab=`) como en el resto del sistema, y hay animación de
  entrada por `MotionService`.
- **Limpieza:** diez métodos que solo existían para dibujar a mano (`getAreaPath`, `getLinePath`,
  `getDonutGradient`, `getChartPoints`…) y 27 bloques de CSS, eliminados. El componente baja de
  ~53 kB a ~49 kB y su hoja de estilos de 12,8 kB a 11,4 kB.
- **Pruebas:** 483 frontend (11 nuevas), `build:ci` limpio salvo el aviso de presupuesto ya
  existente.

---

### 2026-08-15 — El tablero pasa de trece tarjetas de cifras a cuatro gráficos

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Decisión de arquitectura:** ninguna. Se usa **Chart.js vía `p-chart` de PrimeNG**, que ya era
  dependencia y ya se usaba en el dashboard principal: cero librerías nuevas.
- **La forma sale del trabajo que hace cada dato**, no del gusto:
  - *Composición del periodo* (ingresos, costos, gastos, utilidad) → **barras**. No un anillo:
    la utilidad puede ser **negativa**, y una composición con una parte negativa no significa nada.
  - *Comparativo interanual* → **barras divergentes desde cero**, que es lo que pide la polaridad.
  - *Provisiones* (renta, ICA, FONTUR) → **barras**: tres partidas comparables entre sí.
  - *RevPAR de 12 meses* → **línea**: es cambio en el tiempo.
- **Un solo eje por gráfico.** La variación de ocupación viene en **puntos** y las otras tres en
  **porcentaje**: son unidades distintas, así que la ocupación se sale del gráfico y queda como
  cifra al lado, con su aclaración. Meterlas en el mismo eje habría sido comparar peras con
  manzanas.
- **La paleta se validó, no se eligió a ojo.** Azul `#2a78d6` / rojo `#e34948`, comprobados con el
  validador contra el fondo real de la tarjeta (`#ffffff`): pasan banda de luminosidad, croma,
  separación para daltonismo (ΔE 21,6 protan) y contraste. El color solo distingue donde aporta —el
  signo de la utilidad y de cada variación—; donde hay una sola serie, el eje ya nombra cada barra
  y todas van del mismo color.
- **Las cifras exactas siguen a la vista**, al pie de cada gráfico. El tooltip es una comodidad, no
  la única vía de leer un número.
- **Los datos se recalculan al llegar la respuesta, no en un getter:** Chart.js redibuja ante cada
  cambio de referencia, y un getter le daría un objeto nuevo en cada ciclo de detección.
- **Limpieza:** el cambio dejó 31 bloques de CSS sin usar (`.stat-card`, `.metric-block`,
  `.trend-chart`…), eliminados.
- **Pruebas:** 472 frontend (7 nuevas sobre el armado de las series). Ojo: `setup()` reinicia los
  espías, así que la respuesta simulada tiene que entrar **por** `setup()` y no antes —así falló la
  primera versión de estas pruebas.

---

### 2026-08-15 — Umbrales: de rejilla de tarjetas a pantalla de ajustes

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Decisión de arquitectura:** ninguna.
- **Por qué se veía mal.** Era una **rejilla de tres tarjetas**. Con una sección de ocho campos y
  otras de dos, la fila entera crecía hasta la más alta y las cortas quedaban medio vacías; un
  `min-height: 252px` remataba el efecto. Encima, cada campo llevaba su microetiqueta en
  versalitas y su frase de ayuda debajo: un muro de letra pequeña.
- **Ahora es una columna de secciones**, que es como se lee una pantalla de ajustes: la explicación
  a la izquierda —con su icono— y los campos a la derecha. El texto de ayuda deja de colarse entre
  campo y campo.
- **Se quedaba todo pegado a la izquierda:** un `max-width: 1080px` que solo tenía esta pestaña,
  mientras la tarjeta de filtros de arriba ocupa el ancho completo. Fuera. Los campos usan
  `auto-fill` **con tope**, así que a pantalla ancha mantienen un ancho legible y se alinean a la
  izquierda en vez de estirarse hasta el absurdo.
- **Las casillas pasan a interruptores**, con el campo que dependen al lado en la misma fila —así el
  formulario no salta al pulsarlos— y la fila se tiñe cuando están encendidos.
- **La barra de guardar es pegajosa.** Con el formulario largo, el botón quedaba fuera de pantalla
  justo mientras se editaba. Ahora acompaña, y trae *Descartar cambios*, que ya existía en el
  componente sin estar enchufado a nada.
- **Limpieza:** el rediseño del tablero dejó 22 bloques de CSS sin usar (`.insight-card`,
  `.progress-track`, `.tone-badge`…). Eliminarlos devolvió la hoja por debajo de su presupuesto,
  que se había pasado.

---

### 2026-08-15 — Control financiero: la respuesta primero, y la pestaña que no se podía guardar

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat + fix
- **Decisión de arquitectura:** ninguna; continúa lo empezado en 5.22.
- **El fallo que impedía usar la pestaña Umbrales.** Los cuatro umbrales operativos exigen ser
  mayores que cero al guardar, pero la lectura convierte los ausentes en **0** (`getNumber` devuelve
  0 por defecto). El formulario cargaba ese 0 y el propio guardado lo rechazaba: cualquier hotel al
  que le faltara uno **no podía guardar nada** desde esa pestaña, y el error hablaba de un campo que
  el usuario nunca tocó. Ahora 0 se lee como *"sin configurar"*. Apareció al escribir la prueba del
  guardado de tarifas, no leyendo el código.
- **Las tarifas de impuestos ahora se pueden editar.** Distrito, renta, ley de turismo, IVA, ICA y
  FONTUR se guardaban en la configuración pero **no había dónde tocarlas**: el tablero calculaba
  provisiones con valores que nadie podía revisar. Es el mismo hueco que ya se tapó con los umbrales
  del punto de equilibrio.
- **Tablero: la respuesta primero.** Abría con trece tarjetas del mismo peso y el semáforo —que es
  *la* respuesta— enterrado en la mitad. Ahora arranca con un **veredicto**: cómo va el periodo, por
  qué, y un medidor del punto de equilibrio **con la meta marcada** (sin la marca del 100%, la barra
  no dice contra qué). El subtítulo prefiere lo accionable —*"faltan $X por facturar"*— sobre
  repetir el color con otras palabras.
- **La jerga, traducida.** RevPAR, CPHO, ICA, FONTUR: media pantalla eran siglas que el hotelero no
  tiene por qué saberse. Cada tarjeta lleva ahora una línea en cristiano, y los bloques se titulan
  por la pregunta que contestan (*"Qué cuesta llenar una habitación"*, *"Contra el año pasado"*,
  *"Lo que hay que apartar para impuestos"*) en vez de por su origen técnico.
- **La tendencia de RevPAR pasa de tabla a barras.** Doce filas de cifras no dejan ver una
  tendencia; doce barras sí, con el mejor mes señalado y los meses escritos `ago 26` y no `2026-08`.
- **Escenarios: el resultado en una frase.** Devolvía tres columnas de cuatro tarjetas —base,
  proyectado, delta—; para saber lo único que importa había que buscar "utilidad" en dos columnas y
  restar de cabeza. Ahora encabeza *"La utilidad sube $X"*, con el de-cuánto-a-cuánto debajo. Y si
  el escenario **mejora pero sigue en pérdida**, lo dice: las dos cosas son ciertas y la segunda
  importa más.
- **Estados: dirección, no juicio.** Cada variación lleva flecha para poder barrer una columna sin
  leer las cifras. La flecha marca dirección y no bondad, porque en un estado financiero que algo
  suba no siempre es bueno —que suban los gastos, no lo es—.
- **Pruebas:** 465 frontend (28 nuevas), `build:ci` limpio salvo el aviso de presupuesto ya
  existente.

---

### 2026-08-15 — El detalle de un egreso: menos casillas, más jerarquía, y en español

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix + refactor
- **Decisión de arquitectura:** ninguna.
- **Palabras en inglés sueltas en la interfaz.** El panel mostraba *"Operating cost"* y *"Fixed"*:
  las opciones del modelo (`apps/finance/models.py`) están rotuladas en inglés y el serializador las
  manda tal cual en `*_label`, que el frontend **prefería** sobre su propio mapeo al español —que ya
  existía y estaba bien—. Ahora manda el mapeo local y la etiqueta remota queda de respaldo para
  valores que aún no conozca. Se arregla en el frontend y no en el modelo porque cambiar los
  `choices` toca el contrato de la API y necesita migración, para un problema que es de
  presentación.
- **Fuera el identificador.** El encabezado decía **"EGRESO 4"**. Ese 4 es la clave primaria y no
  significa nada para quien lo lee; ahora el antetítulo es la **categoría**, con el punto de color
  que ya usa la fila del listado.
- **El monto manda.** Compartía una caja de dos columnas con la fecha, los dos del mismo tamaño,
  mientras el rojo del encabezado se llevaba toda la atención. Ahora el monto es la cifra grande y
  la fecha lo acompaña debajo.
- **El degradado rojo a plena altura, fuera.** Un egreso corriente no es una alarma. El encabezado
  queda sobrio y el color pasa a una línea del **tono de la categoría** —el mismo que la fila del
  listado, derivado del nombre— para que abrir el detalle no cambie el color bajo los pies.
- **Un dato que no existe no puede ocupar lo mismo que uno que sí.** Había tres casillas diciendo
  *"Sin proveedor"*, *"Sin referencia"* y un bloque entero para *"Sin descripción"*. Los campos
  vacíos salen de la rejilla y lo que falta se resume en **una línea al final**, con la concordancia
  bien (*"Sin descripción registrada."* / *"Sin proveedor, referencia ni descripción."*).
- **Trazabilidad honesta:** si nunca se editó, *creado* y *última actualización* son la misma fecha;
  repetirla hacía pensar en un cambio que no hubo. Ahora se dice una vez, y la segunda línea solo
  aparece si de verdad se editó después (con un segundo de margen, porque el alta escribe las dos
  marcas casi a la vez).
- **Y el hueco vacío** del final: el cuerpo estiraba con `flex: 1` y dejaba media pantalla en
  blanco bajo el contenido.
- **Pruebas:** 447 frontend (12 nuevas). Ojo al escribirlas: este panel carga desde `ngOnChanges`,
  así que en pruebas hay que usar `fixture.componentRef.setInput(...)` — asignar la propiedad a mano
  no dispara nada y deja el detalle en null.

---

### 2026-08-15 — El consolidado diario venía corrido un día para lo cobrado de noche

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Decisión de arquitectura:** ninguna nueva.
- **El fallo de fondo, que el modal destapó:** `_coerce_to_date` en `apps/reports/services.py`
  hacía `.date()` sobre el instante **consciente**, o sea el día en **UTC**. Con `America/Bogota`
  (UTC−5) eso adelanta un día todo lo que pasa a partir de las 7 de la tarde: un cobro de las 9 de
  la noche del 12 se contaba como del 13. En un hotel cobrar de noche es media jornada, así que el
  **consolidado diario venía corrido** para esos pagos — y nadie lo había notado porque la cifra
  del periodo sí cuadraba; lo que estaba mal era el reparto entre días.
  - Peor: **este mismo módulo ya filtraba por `payment_date__date`**, lookup que Django sí convierte
    a hora local. Agrupaba en UTC y filtraba en local, contradiciéndose consigo mismo.
  - Ahora convierte a hora local antes de tomar el día. Los datetime ingenuos pasan tal cual, porque
    `localtime` exige uno consciente.
- **Por eso el modal salía vacío.** El detalle pedía la fecha local y la fila venía de la fecha UTC:
  para los días con cobros nocturnos buscaba en el día equivocado. No era el filtro nuevo el que
  estaba mal, sino la agrupación contra la que se comparaba.
- **Y no se comportaba como modal:** usé `gh-modal-backdrop`, clase que **no existe** —la del
  sistema compartido es `gh-modal-overlay`—, así que sin `position: fixed` se pintaba en el flujo de
  la página, debajo de la lista. Corregido, más cierre con `Escape`.
- **El aviso de descuadre salía sobre cero cobros**, encima del "no hay cobros registrados". Sin
  nada que comparar no hay descuadre: el getter ahora lo dice.
- **Pruebas:** 435 frontend, 268 backend (5 nuevas sobre el día local, incluida la del cobro de las
  9 de la noche que es exactamente el caso que fallaba).

---

### 2026-08-13 — Un solo periodo para las tres pestañas, y el detalle de cada día

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat + fix
- **Decisión de arquitectura:** cierra la nota abierta en **5.22** sobre los periodos divergentes.
- **El periodo sube al contenedor.** `/finanzas` tiene un único selector —este mes, mes pasado,
  últimos 30 días, este año, todo, y **entre dos fechas**— que baja a las dos listas por
  `@Input() rangeFrom/rangeTo` y manda sobre el selector propio de cada una, que se oculta cuando
  está empotrada. Dos selectores para lo mismo es exactamente como se acaba mirando dos cifras que
  no cuadran. Resuelve la divergencia que quedó anotada ayer: el encabezado sumaba todo el
  histórico mientras las pestañas arrancaban en el mes.
  - **Empotrado sin rango es "todo el histórico"**, no "vuelve a tu mes por defecto": si el
    contenedor dice *todo*, la pestaña no puede filtrar por su cuenta.
  - **Entre dos fechas no consulta hasta tener las dos** —filtrar a medias es peor que no filtrar—
    y si vienen invertidas las endereza, porque eso es un error de tecleo y no una orden.
- **El detalle de un día.** Pulsar una fila del consolidado abre un modal con **cada cobro** de esa
  jornada: factura, método, hora, referencia, quién lo registró y las notas. Es la pregunta que
  siempre sigue a la anterior —*"entraron 200.000, sí, ¿pero de quién?"*— y hasta ahora obligaba a
  irse a la pantalla de pagos y filtrar a mano. Los **anulados se muestran** —tachados— porque son
  justo lo que explica que un día cuadre o no.
  - Si el total del detalle no coincide con la fila **lo dice**: pasa cuando la lista está filtrada
    por método o por búsqueda y el detalle no. Dos cifras distintas sin explicación es peor.
- **Backend: `PaymentFilterSet`** con `payment_date_after`/`payment_date_before`. `payment_date` es
  un `DateTimeField`, así que filtra por `date__gte`/`date__lte` y **no por instante**: un
  `payment_date__lte=2026-08-12` recortaría el día a su primer segundo y el modal enseñaría menos
  de lo que dice el consolidado. Es el mismo criterio con el que el informe agrupa por día, y tiene
  que serlo o los cobros de la noche caerían en días distintos según dónde se miren.
- **Un fallo que destapó una prueba:** `todayKey()` en el contenedor salía de `toISOString()` —día
  en **UTC**— mientras el rango del periodo se calcula en local. De noche en Colombia (UTC−5) eso
  ya es el día siguiente, así que "el movimiento de hoy" caía a cero mientras el resto de la
  pantalla seguía en el día correcto. Las dos fechas salen ahora del mismo reloj.
- **Pruebas:** 433 frontend (20 nuevas), 263 backend (4 nuevas sobre el filtro de fechas, una de
  ellas para el cobro de las 11 de la noche), `build:ci` limpio salvo el aviso de presupuesto ya
  existente.

---

### 2026-08-13 — Egresos: el filtro por fecha que faltaba, y un segmentado que no cabía

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat + fix
- **Decisión de arquitectura:** ninguna; amplía el sistema compartido de 5.15 con `.gh-seg`.
- **Regresión propia, corregida:** al rediseñar egresos e ingresos les puse etiqueta de texto a los
  botones de cambio de vista, pero `.gh-view-toggle` es un **cuadrado de 36 px de solo icono** con
  `!important`, así que el texto se desbordaba encima del resto de la vista. Se añade `.gh-seg` al
  sistema compartido —segmentado **con etiqueta**, hermano de `.gh-view-toggle`, no reemplazo— y lo
  usan las dos pantallas. Sobreescribir a la fuerza el original habría roto las demás vistas que sí
  lo quieren cuadrado.
- **El filtro que faltaba: por periodo.** Egresos dejaba filtrar por estado, categoría y método pero
  **no por fecha**, así que la pregunta más común sobre un gasto —*"cuánto llevo gastado este mes"*—
  no tenía respuesta en su propia pantalla; había que sumar la lista a ojo. Ahora hay periodo (este
  mes por defecto, mes pasado, últimos 30 días, este año, todo) y la cifra grande **dice de qué
  periodo habla**, que si no es una cifra sin sujeto.
- **Y orden**, que tampoco había: por fecha se lee el diario, por monto se encuentra el gasto gordo.
- **Las fechas se comparan como texto**, no como `Date`. El egreso guarda un día suelto
  (`YYYY-MM-DD`) sin hora: parsearlo lo correría un día según el huso y un gasto del día 1 se
  saldría del mes. Es la misma decisión de 5.21 con las tareas atrasadas.
- **Vacío con salida.** Con el periodo por defecto, una lista vacía puede significar que no hay
  gastos **o** que el filtro los tapa. El mensaje ofrece ver todo el histórico en vez de dejar al
  usuario adivinando cuál de las dos.
- **Rejillas de ancho fijo → que se acomoden solas.** Los filtros eran cuatro columnas fijas; con
  seis campos y una ventana estrecha desbordaban. También se borraron las reglas huérfanas de
  `.expense-grid` y `.method-grid`, que ya no existen.
- **Nota para quien siga:** ~~el contenedor `/finanzas` calcula sus métricas sobre **todo** el
  histórico, mientras que las pestañas de ingresos y egresos arrancan en el mes en curso~~ —
  resuelto al día siguiente: el periodo subió al contenedor y las tres pestañas miran el mismo
  rango.
- **Pruebas:** 413 frontend (10 nuevas de periodo y orden), `build:ci` limpio salvo el aviso de
  presupuesto inicial ya existente.

---

### 2026-08-12 — Ingresos y egresos rediseñados, y el pipe de moneda que fallaba en silencio

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix + refactor
- **Decisión de arquitectura:** ninguna nueva; ejecuta 5.22.
- **El fallo que estaba a la vista y nadie veía:** las columnas de dinero del consolidado de
  ingresos salían **en blanco**. `| currency: 'COP':'symbol':'1.0-0':'es-CO'` lanza
  `NG0701: Missing locale data` porque **nunca se registró el locale**, y la celda queda vacía sin
  error visible. Se registra `es-CO` una vez en `main.ts` — arreglaba también `pos-bar`, el otro
  sitio que usa el pipe y tenía el mismo fallo. Verificado ejecutando el pipe, no leyéndolo.
- **La lentitud:** el buscador del consolidado llevaba `(input)="applyFilters()"`, y `applyFilters`
  **consulta la API**. Escribir "Juan" eran cuatro agregaciones sobre todos los pagos del periodo.
  Ahora hay antirrebote de 350 ms; los selectores siguen disparando al instante porque un clic no
  es una racha. Además se quitó un `requestAnimationFrame` **anidado** que retrasaba el pintado dos
  cuadros por consulta sin comprar nada, y toda recarga dejó de blanquear la vista: si ya hay datos
  se atenúan (`refreshing`), como en el resto del sistema.
- **El rediseño, que es el mismo en las dos pantallas:** eran una tabla de 8 columnas y otra de 10,
  más rejillas de tarjetas que repetían exactamente los mismos campos. Comparar cifras alineadas a
  ojo era trabajo del usuario. Ahora cada fila lleva **una barra**: en ingresos el día que más entró
  marca el 100% y el resto se compara con él; en egresos lo hace el gasto más grande. Encima, una
  lectura del periodo en una línea —cuánto entró, el mejor día, por qué método; cuánto salió, en qué
  categoría y repartido en cuántas—.
- **Se fueron los códigos.** "MET-1" en los métodos de pago y "EGR-0042" encabezando cada egreso: son
  identificadores internos disfrazados de dato, justo lo que se acordó quitar de toda la interfaz.
  El egreso ahora empieza por su concepto.
- **Los dos modos de vista dejaron de ser el mismo dato dos veces.** En egresos eran `tabla` y
  `rejilla` con idénticos campos; ahora son *"cada egreso"* y *"en qué se va"* (desglose por
  categoría), que son dos preguntas distintas. El color de cada categoría se deriva de su **nombre**
  y no de su posición, para que cambiar un filtro no repinte la vista entera.
- **Un fallo propio, corregido:** el desglose "de dónde viene" de `/finanzas` leía `collected` en las
  filas de método, cuando el campo del consolidado es `total_amount` — el panel salía siempre vacío.
  Ahora usa `total_amount` y prefiere el `share_percent` que ya manda el backend.
- **Pruebas:** 403 frontend (25 nuevas entre `list-income-consolidated.spec.ts` y
  `list-expenses.spec.ts`), `build:ci` limpio salvo el aviso de presupuesto inicial ya existente
  (sube ~4,5 kB por los datos del locale).

---

### 2026-08-12 — Finanzas en una vista, y control financiero revisado pestaña a pestaña

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Decisión de arquitectura:** nueva sección **5.22**.
- **Qué se hizo:**
  1. **`/finanzas`** reúne ingresos y egresos en tres pestañas, con **Resultado** como pestaña por
     defecto: lo que queda, qué proporción de lo que entra se va en gastos, y los dos desgloses
     enfrentados. Migración `accounts/0027_finance_center_menu` para la entrada de menú
     `finance_center.read`; `income_consolidated.read` y `expenses.read` dejan de ser menú pero
     **siguen protegiendo sus endpoints**. `financial_control.read` no se toca.
  2. **Cache-aside** en `expense.ts`, `reports.ts` y `financial-control.ts`. Un egreso nuevo
     invalida también `reports`: el resultado del periodo cambia. `reports` es solo lectura —lo
     invalida quien mueve dinero, no él mismo—, y por eso `LEDGER_KEYS` de facturación ahora lo
     incluye: el ingreso se calcula desde los pagos.
  3. **Control financiero deja de pedirlo todo de golpe.** Tres agregaciones pesadas por carga
     bajan a una: cada pestaña pide lo suyo cuando se abre, y *Actualizar* refresca solo lo que se
     está mirando. Es el mismo problema que produjo el 429 de inventario, antes de que produjera
     otro.
- **Lo que más cambia el uso, por pestaña:**
  - **Filtros según la pestaña.** Salían los cinco a la vez —hotel, dos fechas, año y mes— con dos
    botones de aplicar, cuando el rango es del tablero y del escenario, y el año/mes solo de los
    estados. Ahora se muestra lo que la pestaña usa, más **atajos de periodo** (este mes, mes
    pasado, últimos 30 días, este año): teclear dos fechas para ver el mes en curso no tenía sentido.
  - **Escenarios: deslizadores y escenarios típicos.** Eran cuatro cajas de números partiendo de
    cero. Un simulador se explora, no se teclea. Los escenarios mueven **varias palancas a la vez**
    porque en la realidad van juntas —subir la tarifa cuesta ocupación—, y el escenario se lee en
    una frase (*"Si la tarifa sube 10%, la ocupación baja 5%..."*) en vez de en cuatro controles.
  - **Estados: exportar a CSV.** Un estado financiero termina en una hoja de cálculo o en manos del
    contador; copiarlo fila por fila era el único camino. Se genera en el navegador con lo que ya
    está en pantalla —pedir un endpoint sería hacer al servidor repetir un cálculo que ya hizo—,
    con `;` y BOM, que es lo que Excel en español abre sin preguntar. Y la cabecera ahora dice
    contra qué compara: el mismo mes del año anterior.
  - **Tablero: el punto de equilibrio dice qué falta, en pesos.** Mostraba un avance en porcentaje
    y el estado crudo del backend (`WARNING`, `CRITICAL`). Un porcentaje no le dice a nadie qué
    hacer; *"faltan $2.500.000 por facturar para cubrir los costos del periodo"* sí, y se deriva de
    lo que la respuesta ya trae.
  - **Umbrales: los del punto de equilibrio, que decidían el semáforo y no eran editables.** El
    formulario prometía "configuración de alertas" y no exponía los dos números que ponen el tablero
    en amarillo o en rojo. El backend ya los validaba.
  - Pestañas en pastilla como el resto de vistas consolidadas, `?tab=` en la URL y GSAP por
    `MotionService`.
- **Pruebas:** 378 frontend (41 nuevas entre `finance-page.spec.ts` y
  `list-financial-control.spec.ts`), 259 backend, `build:ci` limpio salvo el aviso de presupuesto
  inicial ya existente.
- **Riesgos:** ninguno en datos —todo es lectura salvo la configuración, que ya existía—. El cambio
  de menú es reversible: la migración tiene su `reverse`.

---

### 2026-08-12 — Trabajo periódico: reglas que generan limpiezas y órdenes solas

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Decisión de arquitectura:** amplía la sección **5.21**.
- **Qué se hizo:** se puede programar trabajo que se repite —"la limpieza profunda de los lunes",
  "la revisión de aires del día 1"— y el sistema lo genera solo.
  1. **`RecurringWork`**: la regla. Guarda el ritmo y **`next_run_on` como estado**, que contesta
     "cuándo vuelve a tocar" sin recalcular nada. Modelada como *regla que produce tareas*, no como
     tarea que se repite — el porqué está en 5.21.
  2. **`generate_recurring_work`**, comando diario como los de 5.12. **Idempotente por día**:
     volver a correrlo no duplica nada porque `next_run_on` ya quedó por delante. Tiene `--dry-run`.
  3. **`apps/rooms/recurrence.py`**, la aritmética de calendario aparte: es la única parte con
     lógica de fechas y la única que se puede probar sin base de datos ni reloj.
  4. **Cuarta pestaña "Programado"** en `/limpieza-mantenimiento`, con su propia métrica en el
     resumen que avisa cuántas reglas generan trabajo hoy o mañana.
- **El detalle de diseño que más importa:** el formulario **escribe la regla en castellano** antes
  de guardarla —*"Cada 2 semanas, los viernes · en todas las habitaciones"*—. Comprobar eso leyendo
  tres selectores sueltos es justo lo que hace que se programe mal, y el error no se descubre hasta
  que el trabajo no aparece.
- **Y en la lista**, cada regla dice **cuánto falta** (*"Genera mañana"*), no una fecha suelta que
  hay que comparar con hoy. Se puede **pausar** sin borrar, que es lo que se necesita en temporada
  baja.
- **Los paneles de alta, rediseñados:** los dos traían ~260 líneas de CSS con una **paleta propia de
  alias** (`--drawer-*` apuntando a `--gh-*`) y sus propios bloques de modo oscuro — justo lo que
  5.15 existe para evitar. Y una cabecera con degradado de 130 px para un título, con el formulario
  flotando en un panel de alto completo. Ahora: cabecera compacta con el tipo de trabajo como
  etiqueta, alto natural, pie pegado para que *Guardar* no se pierda al hacer scroll, y solo tokens.
  Además **se quitó el campo "Fecha de finalización"**, que salía deshabilitado explicando por qué
  no servía: ahora aparece únicamente si la tarea nace ya completada.
- **Archivos/áreas afectadas:** `backend/apps/rooms/{models,serializers,views,urls,recurrence,tests}.py`,
  `backend/apps/rooms/management/commands/generate_recurring_work.py`,
  `backend/apps/rooms/migrations/0013_recurringwork.py`,
  `backend/accounts/management/commands/seed_rbac.py`,
  `frontend/src/app/services/recurring-work.ts`,
  `frontend/src/app/modules/operations/{recurring-work-model.ts,recurring-work/}`,
  `frontend/src/app/modules/operations/operations-page/*`,
  los dos `create-*` de limpieza y mantenimiento.
- **No hace falta programar nada en el despliegue.** La materialización corre **al listar**
  limpieza, mantenimiento o las reglas, acotada al hotel de quien consulta. El comando queda como
  opción para quien tenga cron y quiera el trabajo listo antes de que nadie entre. Los dos caminos
  conviven porque la operación es idempotente por día y cada regla se genera bajo
  `select_for_update()` con revisión dentro de la transacción.
- **Dónde se crea:** un botón **"Programar periódica"** en la cabecera, junto a *Nueva tarea* y
  *Nueva orden*, con las dos opciones. Una pestaña llamada *Programado* dice dónde se **ve** lo
  programado, no dónde se **crea**: quien busca "cada 6 meses revisar los aires" mira los botones de
  arriba.
- **Impacto:** **requiere `migrate` y `seed_rbac`** (dominio nuevo `recurring_work`: escritura para
  admin y gerencia, lectura para recepción, que necesita saber qué trabajo va a caer).
- **Verificación:** backend `manage.py test` completo en verde (**259** pruebas, 17 nuevas: ocho de
  aritmética de calendario —incluido el recorte del 31 a febrero y el salto de ocurrencias
  perdidas—, seis del comando y tres de que listar genere lo vencido sin cron, sin duplicar y sin
  cruzar hoteles). Frontend `npm run lint`, `npm run test:ci` (**337** pruebas, 17 nuevas) y
  `npm run build:ci` en verde.

### 2026-08-12 — Se puede volver a generar trabajo desde limpieza y mantenimiento

- **Autor:** Claude Code, reportado por rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (regresión) / feat
- **Síntoma:** desde `/limpieza-mantenimiento` no había forma de crear una tarea ni una orden.
- **Causa:** regresión propia. Al embeber las listas se envolvió su `page-header` en
  `*ngIf="!embedded"`, y con el encabezado se fue el botón **Nueva tarea** / **Nueva orden**.
- **Qué se hizo:** el alta **sube al contenedor**, que es donde el usuario ya mira para actuar, en
  vez de devolver dos encabezados a la pantalla. Los dos botones están disponibles **desde cualquier
  pestaña**: si la lista que registra no está montada —vive tras el `*ngIf` de su pestaña—, se
  cambia de pestaña y se abre el formulario en el ciclo siguiente. Los formularios de alta no se
  tocaron: son los que ya existían.
- **De paso, la cola deja de esconderse tras el histórico:** las dos listas abren filtradas a
  **"Solo pendientes"**. Antes mostraban todo, así que la pestaña decía *Limpieza 0* mientras
  debajo se veían seis tarjetas "Completada" — el contador iba de trabajo abierto y la lista de
  todo. Ahora coinciden, y el histórico sigue a un clic en el filtro.
- **Sobre asignar el trabajo a una persona:** se descartó a indicación de rastor65. El trabajo no
  se asigna: aparecerá en las vistas propias de aseadora y técnico, que filtrarán por **tipo de
  trabajo**, no por destinatario. Se revirtió el campo `assigned_to` que se había empezado a añadir
  a `CleaningTask` y `MaintenanceOrder`, con su migración.
- **El ciclo de estados ya existía y no se tocó:** el botón de la tarjeta avanza *Iniciar →
  Completar*, que es lo que usará quien haga el trabajo.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/operations/operations-page/*.{ts,html,css,spec.ts}`,
  `frontend/src/app/modules/{cleaning-tasks/list-cleaning-tasks,maintenance-orders/list-maintenance-orders}/*.ts`.
- **Impacto:** solo frontend. Sin cambios de API ni migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**320** pruebas, 2 nuevas del alta desde el
  contenedor) y `npm run build:ci` en verde; backend completo en verde (242).

### 2026-08-12 — Bug: unos pocos ajustes de stock seguidos dejaban la vista vacía (429)

- **Autor:** Claude Code, reportado por rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (rendimiento y corrección)
- **Síntoma:** restando o sumando stock varias veces seguidas, la vista de inventario se quedaba
  sin items y decía *"Hay 37 item(s) eliminados lógicamente"*. Había que recargar y cambiar de
  pestaña para recuperarla.
- **Causa raíz:** **cada clic disparaba 10 peticiones** y el límite de la API es `120/min` por
  usuario (`DEFAULT_THROTTLE_RATES`). Doce clics agotaban el minuto y la API devolvía 429.
  1. **1** el POST del movimiento.
  2. **3** del contenedor (`loadSummary` con `force`).
  3. **6** de la lista: items, la papelera, **tres consultas de master data** y la configuración
     del hotel — todas catálogos que no cambian al sumar una unidad.
- **Cuatro arreglos, por orden de impacto:**
  1. **Cache-aside en `MasterDataService` y `HotelSettingsService`** con TTL de catálogo (5 min).
     Quita 4 peticiones por clic **y beneficia a toda la aplicación**: esas consultas las hacen
     casi todas las pantallas al cargar y al refrescar.
  2. **La recarga posterior a una acción deja de forzar el caché.** Esto era lo más sutil: la
     escritura **ya invalida** las claves desde el servicio, así que la recarga va al servidor
     igual — pero `forceRefresh` **salta también la deduplicación de peticiones en vuelo** del
     `ResourceCache`, y entonces el contenedor y la lista pedían lo mismo dos veces. `force` queda
     **solo** para el botón *Actualizar*, que es una petición explícita de datos frescos.
  3. **Una racha de ajustes rápidos produce una sola recarga** (700 ms). La tarjeta ya se pinta con
     el stock que devuelve el asiento, así que la recarga solo pone al día las métricas.
  4. **La papelera no se vuelve a pedir en una recarga silenciosa**: solo cambia al eliminar o
     restaurar.
- **Y un bug de corrección que el 429 destapó:** `catchError(() => of([]))` **fabricaba un éxito
  vacío**. Con `items` caído y `allItems` respondiendo, la vista concluía que los 37 items estaban
  eliminados — parecía pérdida de información. Ahora el fallo devuelve `null`, se **conserva el
  listado anterior** y se avisa *"se muestra la última versión cargada"*.
- **Resultado:** de **10 peticiones por clic a 4**, y una racha de veinte clics ya no pasa de un
  puñado.
- **Archivos/áreas afectadas:** `frontend/src/app/services/{master-data.service,hotel-settings}.ts`,
  los siete `list-*` con `refresh*(force = false)`, los cuatro contenedores
  (`catalog|billing|inventory|operations-page`), `frontend/src/app/modules/items/list-items/*`.
- **Impacto:** solo frontend. Sin cambios de API ni migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**318** pruebas, 5 nuevas: que el fallo
  conserve el listado y no invente papelera, que solo el botón fuerce el caché, y que la papelera
  no se pida en recargas silenciosas) y `npm run build:ci` en verde; backend completo en verde.
  Se actualizaron las cuatro pruebas de contenedor que afirmaban el contrato viejo (`forceRefresh:
  true`) al nuevo.

### 2026-08-12 — Limpieza y mantenimiento en una vista, con la habitación como unidad

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Decisión de arquitectura:** consultada y aprobada por rastor65. Se agrega la sección **5.21**.
- **Qué se hizo:** las dos pantallas se consolidaron en **`/limpieza-mantenimiento`** con tres
  pestañas.
  1. **"Por habitación" es la pestaña por defecto** y el aporte real: agrupa el trabajo abierto por
     habitación, ordenado por atraso y luego por carga. Cada tarjeta enseña **los dos frentes por
     separado** —limpieza y mantenimiento son dos equipos distintos—, una vista previa de la cola,
     y salta a la pestaña correspondiente ya filtrada por esa habitación.
  2. **Métricas que cruzan las dos**: habitaciones con trabajo (avisando cuántas necesitan las dos
     cosas), atrasadas, sin empezar y cerradas hoy.
  3. **Cache-aside** en los dos servicios con TTL operativo, invalidando ambas claves en cualquier
     escritura: cerrar una tarea cambia lo que la otra pestaña dice de esa misma habitación.
  4. **GSAP** una vez, recargas silenciosas, seguimiento entre pestañas por `focusRoomId`.
- **Las tarjetas, rehechas sobre `.gh-task-*`:** las dos enseñaban el **estado tres veces** —en la
  portada, en una fila de "progreso" y otra vez en el pie— y ninguna decía lo único accionable: si
  la fecha ya pasó. Ahora el estado se dice una vez, **la habitación (o la avería) titula**, y la
  fecha se expresa como consecuencia: *"venció hace 2 días"*, *"programada para hoy"* — en vez de
  una fecha que hay que comparar con hoy en la cabeza. El color sale de la **urgencia**, no del tipo.
  Y el botón de avanzar estado **lleva su nombre** (*Iniciar*, *Completar*): un icono suelto obligaba
  a adivinar en qué estado quedaba la tarea al pulsarlo.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/operations/` (nuevo, con
  `operations-page/` y `room-workload/`), `frontend/src/styles.css` (bloque `.gh-task-*`),
  `frontend/src/app/modules/{cleaning-tasks/list-cleaning-tasks,maintenance-orders/list-maintenance-orders}/*`,
  `frontend/src/app/services/{cleaning-task,maintenance-order}.ts`,
  `frontend/src/app/app.routes.ts`, `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/migrations/0026_operations_center_menu.py`, `backend/accounts/tests.py`.
- **Impacto:** **requiere `migrate` y `seed_rbac`**. El menú pasa de un grupo con dos hijos a una
  entrada (`operations_center.read`); el grupo se desactiva y se suma a `LEGACY_KEYS`. Sin
  migraciones de esquema.
- **Verificación:** backend `manage.py test` completo en verde (242 pruebas; `HOTEL_ROUTES`
  actualizado). Frontend `npm run lint`, `npm run test:ci` (**313** pruebas, 24 nuevas entre el
  contenedor y el tablero por habitación) y `npm run build:ci` en verde. El chunk `operations-page`
  pesa 24,1 kB transferidos y sustituye a los dos anteriores. Backup en
  `backend/db.before-operations-menu.*.sqlite3`.

### 2026-08-12 — La lista de compra se descuadraba bajo las métricas

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (UI)
- **Síntoma:** la pestaña quedaba encajonada a la izquierda, ocupando ~1.100 px bajo unas métricas
  y unas pestañas que sí usaban todo el ancho.
- **Causa:** yo mismo le había puesto `max-width: 1180px` buscando un ancho de lectura. En una
  pantalla que ocupa todo, eso no se lee como una medida tipográfica: se lee como un fallo de
  maquetación.
- **Arreglo:** ancho completo, y el espacio sobrante repartido en **columnas que dicen algo** en vez
  de hueco: *Falta* (la carencia, sola, que es el motivo por el que la línea está ahí), *En bodega*
  con su barra, *A comprar*, *Queda en* —la consecuencia de lo pedido, comparable entre líneas—,
  *Unitario* y *Total línea*. En pantallas medianas se sacrifica el unitario primero, que es el dato
  menos consultado al revisar un pedido.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/inventory/shopping-list/*.{html,css}`.
- **Impacto:** solo presentación.
- **Verificación:** `npm run lint`, `npm run test:ci` (289) y `npm run build:ci` en verde.

### 2026-08-12 — La lista de compra pasa a leerse como un pedido

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Qué estaba mal:**
  1. **Filas de 1.900 px**: el nombre a la izquierda y el precio al otro extremo dejaban de leerse
     como una lista y pasaban a ser dos columnas sin relación.
  2. **La cabecera con un hueco muerto en medio**: el costo pegado a un borde y dos contadores al
     otro.
  3. **`quedan 3 de 10 Unidad`** — cifras sin jerarquía, y ninguna señal de que una línea estuviera
     peor que otra: dos carencias muy distintas se veían idénticas.
  4. **Cuatro iconos sin rótulo** en la barra de herramientas, y *Exportar* repetido en el pie.
  5. **La cantidad sugerida no se explicaba**: 77 aparecía sin decir de dónde salía, así que no se
     podía corregir con criterio.
- **Qué se hizo:**
  1. **Ancho de lectura** (1.180 px) y **tabla con columnas alineadas y encabezado** —item, en
     bodega, a comprar, costo—, que es lo que hace comparable un pedido.
  2. **Cabecera compacta**: el costo como titular, y a su lado items / unidades / agotados. A la
     derecha, una frase que dice si **el pedido resuelve el problema**: *"con este pedido todos
     quedan sobre su mínimo"* o *"algunos seguirán bajo su mínimo"*.
  3. **Barra de cobertura por línea** (stock frente a su mínimo), en el mismo lenguaje visual de
     las tarjetas y del conteo. Y el texto pasa a decir **cuánto falta** —"faltan 7 para el
     mínimo"— en vez de dos cifras sueltas.
  4. Cada cantidad muestra **en cuánto queda el item** si se compra, y el costo lleva el unitario
     debajo.
  5. Herramientas **con rótulo** (Todo / Nada / Sugerido) y el botón de sugerencia **explica su
     criterio** en el tooltip: *"llena hasta el máximo (80)"* / *"deja el doble del mínimo (20)"*.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/inventory/shopping-list/*.{ts,html,css,spec.ts}`.
- **Impacto:** presentación y cuatro helpers de lectura. No cambia la API ni el flujo de ingreso.
- **Verificación:** `npm run lint`, `npm run test:ci` (**289** pruebas, 6 nuevas: carencia,
  cobertura por línea, stock resultante, criterio de la sugerencia y las dos de cobertura del
  pedido) y `npm run build:ci` en verde.

### 2026-08-12 — El detalle de un item enseña su bitácora, no un enlace a ella

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el drawer del item muestra sus **últimos movimientos** directamente. Cada línea
  lleva el salto con signo (`+4`, `−5`) coloreado por dirección, el tipo, el `antes → después`, la
  fecha, **quién lo hizo** y el motivo.
- **Por qué:** "¿por qué el stock está como está?" es la pregunta que trae a cualquiera a esta
  pantalla, y estaba a un salto de pestaña — es decir, lejos. El botón *Ver sus movimientos*
  resolvía el caso de querer el histórico completo, no el de querer entender el número que se está
  mirando.
- **Detalles:**
  - **La dirección sale del salto de stock, no del tipo**: un `ADJUSTMENT` puede subir o bajar, y
    lo que importa es hacia dónde se movió.
  - **Se recortan a los 6 últimos**, con un pie que ofrece *"ver los N restantes"* y salta a la
    pestaña de movimientos filtrada por el item. El histórico completo vive ahí, con sus filtros y
    su exportación.
  - **Se pide acotada al item** con `?item=<id>` (nuevo filtro del ViewSet, igual que `?room=` en
    dotación): traer el histórico entero del hotel para filtrarlo en el navegador no escala.
  - Un item sin movimientos lo dice explícitamente —"su stock es el que se cargó al crearlo"— en
    vez de dejar un hueco.
- **Archivos/áreas afectadas:** `backend/apps/inventory/{views,tests}.py`,
  `frontend/src/app/modules/items/detail-item/*.{ts,html,css,spec.ts}`,
  `frontend/src/app/modules/inventory-movements/inventory-movement-model.ts`,
  `frontend/src/app/services/inventory-movement.ts`.
- **Impacto:** un filtro nuevo de solo lectura en la API. Sin migraciones.
- **Verificación:** backend `manage.py test` completo en verde (**242** pruebas, 3 nuevas del
  filtro `?item=`). Frontend `npm run lint`, `npm run test:ci` (**283** pruebas, 7 nuevas de la
  bitácora) y `npm run build:ci` en verde.

### 2026-08-12 — Conteo físico, lista de compra y ajuste rápido de stock

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Decisión de arquitectura:** amplía la sección **5.20** (operaciones masivas y `created_by`).
- **Qué se hizo:** tres funciones que convierten el inventario de una vista de consulta en una de
  trabajo.
  1. **Movimiento desde la tarjeta**: `−` y `+` resuelven la unidad suelta con un clic, y los
     botones **Entrada** / **Salida** abren `StockMove`, un modal de una sola cifra con atajos
     (1, 5, 10, 25, y *Todo* en las salidas) que **enseña en cuánto queda el stock antes de
     confirmar** —pulsar `+5` cuatro veces y esperar haber contado bien no es lo mismo—. Avisa si
     una salida deja el item bajo su mínimo, pero **no lo bloquea**: puede ser legítimo. El asiento
     se registra igual, con su rastro: atajo no significa saltarse la bitácora.
  2. **Conteo físico** (`StockCount`), en su propio modal porque es una sesión de trabajo sobre
     todo el inventario, no una acción de una pestaña. Arranca con lo que dice el sistema —contar
     es confirmar o corregir, no teclear ochenta cifras desde cero—, lleva **avance de lo revisado**,
     filtros *sin revisar* / *con diferencia*, un atajo **"dar por bueno el resto"** y calcula la
     diferencia por línea, el sobrante, el faltante y **cuánto cuesta el descuadre**: un faltante de
     cinco toallas no es lo mismo que uno de cinco botellas de vino.
  3. **Lista de compra**, como **cuarta pestaña** —a petición de rastor65— y no como modal, para
     poder entrar de un clic. Trae lo que está en el mínimo o por debajo, **agotados primero**, con
     la cantidad sugerida ya puesta (hasta el máximo si lo hay; si no, el doble del mínimo menos lo
     que queda), el costo por línea y el **costo total del pedido**. Se puede marcar y desmarcar,
     ajustar cantidades, volver a la sugerencia, **exportar a CSV** y **registrar la entrada** cuando
     la compra llega, con la referencia de la factura del proveedor.
- **Backend:** `InventoryMovement.created_by` (migración `inventory/0007`), rellenado desde la
  sesión en el serializer, y dos acciones nuevas del ViewSet —`stock-count/` y `purchase-entry/`—
  resueltas en `services.py` dentro de una transacción y con referencia compartida. El porqué de
  que sean endpoints y no un bucle de `POST` está en 5.20.
- **Detalle de la lista de compra:** se reconstruye conservando lo que el usuario ya ajustó. Se
  recalcula tras cada ingreso, y perder las cantidades tecleadas en ese momento sería exasperante.
- **Archivos/áreas afectadas:** `backend/apps/inventory/{models,serializers,services,views,tests}.py`,
  `backend/apps/inventory/migrations/0007_inventorymovement_created_by.py`,
  `frontend/src/app/modules/inventory/{stock-count,shopping-list}/` (nuevos),
  `frontend/src/app/modules/items/stock-move/` (nuevo),
  `frontend/src/app/modules/inventory/inventory-page/*`,
  `frontend/src/app/modules/items/list-items/*`, `frontend/src/app/services/inventory-movement.ts`.
- **Impacto:** **requiere `migrate`**. Sin cambios de RBAC: las dos acciones nuevas exigen
  `inventory-movements.write`, que ya tenían los roles que registran movimientos.
- **Verificación:** backend `manage.py test` completo en verde (**239** pruebas, 9 nuevas: que el
  conteo registre solo lo que difiere, que fije el valor absoluto en ambas direcciones, que guarde
  autor y lo que tenía el sistema, que todo el lote comparta referencia, que ignore items de otro
  hotel, y las cuatro de la entrada de compra). Frontend `npm run lint`, `npm run test:ci`
  (**276** pruebas, 44 nuevas entre conteo, lista de compra y el modal de entrada/salida) y
  `npm run build:ci` en verde.

### 2026-08-12 — Bug: marcar un movimiento como inactivo volvía a mover el stock

- **Autor:** Claude Code, encontrado al rediseñar el detalle de movimientos
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (corrupción silenciosa de datos)
- **Síntoma:** pulsar **"Marcar inactivo"** en el detalle de un movimiento volvía a aplicar su
  cantidad al stock. Un `OUT` de 1 unidad restaba **otra** unidad cada vez que se tocaba el
  registro. Verificado antes de tocar nada: stock 10 → registrar OUT de 1 → 9 → marcar inactivo →
  **8**.
- **Causa:** `InventoryMovement.save()` recalculaba `previous_stock`/`new_stock` desde el stock del
  momento y se lo aplicaba al item **en cada guardado**, no solo al crear. Cualquier `PATCH`
  —cambiar `is_active`, corregir una nota— pasaba por ahí. Además el propio movimiento quedaba
  reescrito con un antes/después que nunca ocurrió, así que la bitácora dejaba de cuadrar.
- **Arreglo:** un movimiento es un **asiento**: se aplica una vez, al registrarlo. `save()` sale
  temprano si `not self._state.adding`. La validación de `clean()` que compara la cantidad contra
  el stock también se limita a la creación, porque un movimiento ya asentado no puede validarse
  contra unas existencias que él mismo cambió.
- **Lo que NO se hizo, a propósito:** desactivar un movimiento sigue **sin** devolver el stock, y
  no debe hacerlo desde aquí. Lo correcto es registrar el movimiento contrario, que es lo que deja
  rastro. El detalle ahora lo dice explícitamente cuando el movimiento está inactivo.
- **Archivos/áreas afectadas:** `backend/apps/inventory/models.py`, `backend/apps/inventory/tests.py`.
- **Impacto:** **los stocks ya desviados por este bug no se corrigen solos.** Si algún item tiene
  un stock que no cuadra con su bitácora, hay que ajustarlo con un movimiento de tipo `ADJUSTMENT`,
  que fija el valor absoluto. Sin migraciones.
- **Verificación:** `manage.py test` completo en verde (**230** pruebas, 3 nuevas: que el
  movimiento aplique el stock al crearse, que desactivarlo no lo vuelva a mover, y que editarlo
  conserve el antes/después original).

### 2026-08-12 — Fuera los ids internos de la interfaz

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Qué se hizo:** se retiraron los identificadores internos de base de datos de toda la interfaz.
  No identifican nada para quien opera y ocupan el sitio de un dato que sí.
  - **Campos "ID"** en los detalles de servicio, paquete, tarea de limpieza y orden de
    mantenimiento; **"ID movimiento"** en el detalle de movimiento; `ID #n` en el listado de
    clientes y en el de hoteles del panel SaaS.
  - **Chips `#id`** que yo mismo había puesto en las tarjetas de pago, reembolso y movimiento.
  - **Títulos** `Pago #15` en los modales de detalle y de reembolso.
  - **Fallbacks** del tipo `Item #4`, `Habitacion #7`, `Servicio #12`, `Metodo #3`: cuando el
    serializer no manda el nombre, ahora se dice *"sin nombre"* en vez de enseñar el id.
- **Lo que hubo que resolver:** el chip `#id` de la tarjeta de pago estaba puesto **para distinguir
  dos pagos de la misma factura**. Quitarlo sin más habría devuelto ese problema, así que:
  - En **pagos**, el discriminador pasa a ser la fecha con hora, que ya se mostraba.
  - En **reembolsos**, `PaymentRefundSerializer` expone ahora `payment_amount` y `payment_date`, y
    la tarjeta dice *"Pago de $42.000 del 11 ago"* en vez de *"Pago #31"*. El buscador indexa esa
    misma etiqueta.
  - En **clientes**, el identificador pasa a ser el **documento**, que es lo que se pide en
    recepción.
- **Excepción consciente:** el origen de un movimiento automático sigue mostrando *"reserva #29"*.
  Ahí el número **es** la referencia de negocio que trae el movimiento, y sin él no se puede
  rastrear de qué estancia salió el consumo.
- **Archivos/áreas afectadas:** `backend/apps/billing/serializers.py`,
  `frontend/src/app/modules/billing/billing-model.ts`, y ~15 plantillas y componentes.
- **Impacto:** solo presentación, salvo dos campos nuevos de solo lectura en el serializer de
  reembolsos. Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (232) y `npm run build:ci` en verde; backend
  completo en verde.

### 2026-08-12 — El detalle de un movimiento decía lo mismo tres veces

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Qué estaba mal:**
  1. **La dirección, tres veces**: en el sobretítulo, en "Tipo" y en "Dirección".
  2. **La cantidad, dos veces**: como "Cantidad" y otra vez como "Variación stock", presentadas
     como si fueran dos datos distintos.
  3. **El estado, dos veces**: chip del título y "Resumen".
  4. **"Stock previo 10" y "Stock nuevo 9" separados**, cuando la transición `10 → 9` **es** el
     movimiento.
  5. **Tres fechas** en "Trazabilidad" que son el mismo instante, porque un movimiento no se edita.
  6. La referencia automática (`ROOM-101-29-1786502652708:2`) en crudo y partida en dos líneas,
     como si fuera un dato de lectura.
- **Qué se hizo:** el **salto de stock** pasa a ser el titular —antes, cantidad con signo, después—
  con la fecha debajo. Todo lo demás se agrupa bajo una sola pregunta, *por qué ocurrió*: el origen
  traducido (*"Habitacion 101 - reserva #29"*), las notas, y la referencia cruda al final en
  pequeño, que es lo único para lo que sirve —cotejar con otro sistema. Y si el movimiento está
  inactivo, un aviso explica que eso **no** devuelve el stock.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/inventory-movements/detail-inventory-movement/*.{ts,html,css}`.
- **Impacto:** solo presentación. El CSS deja de traer su propia paleta (5.15). Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (232) y `npm run build:ci` en verde.

### 2026-08-12 — El detalle de un item deja de repetirse tres veces

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Síntoma:** el detalle de un item no se entendía a simple vista: seis paneles apilados que había
  que leer enteros.
- **Qué estaba mal:**
  1. **El mismo dato, tres veces.** "Stock actual" en la tarjeta superior *y* en "Stock y alertas";
     "Estado" en el chip del título *y* en "Resumen"; el tipo en el sobretítulo *y* debajo.
  2. **Lo importante eran tres cifras sueltas**: 18, mínimo 6, máximo 35, en dos paneles distintos,
     para que el usuario las comparara mentalmente. El mismo problema que ya se arregló en las
     tarjetas y en la dotación de habitación.
  3. **`ID #38` y `Hotel`** como campos de la ficha: el id interno no le sirve a quien opera, y el
     hotel es siempre el propio (el sistema es multi-tenant).
  4. **Margen en pesos y sin porcentaje**, que es justamente lo que se compara entre items.
  5. Las dos únicas acciones eran destructivas.
- **Qué se hizo:**
  1. **El medidor como titular**, con la marca del mínimo y una frase que dice **qué hacer**:
     *"Faltan 4 unidad para el mínimo"*, *"Agotado: hay que reponer"*, *"12 unidad por encima del
     mínimo"*. Reemplaza a los dos paneles de stock.
  2. **Seis paneles pasan a dos**, agrupados por para qué sirven: *Cuánto vale y cuánto deja*
     —valor en bodega, venta potencial y margen, cada cifra con la cuenta que la produce debajo— y
     *Ficha*, con la descripción integrada.
  3. **Margen también en porcentaje** sobre el costo, con guarda de división por cero.
  4. **Los dos saltos del contenedor** —ver sus movimientos, ver en qué habitaciones está— entran
     también desde aquí; el drawer se cierra al saltar.
  5. Tipo, uso y SKU se funden en el sobretítulo, y el chip de estado duplicado desaparece.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/items/detail-item/*.{ts,html,css,spec.ts}`,
  `frontend/src/app/modules/items/list-items/list-items.html`.
- **Impacto:** solo presentación y dos atajos de navegación. No cambia la API. El CSS deja de traer
  su propia paleta (5.15). Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**232** pruebas, 11 nuevas del drawer:
  escala del medidor con y sin máximo, los cuatro estados de stock, valoración, margen porcentual
  con su guarda, y los saltos) y `npm run build:ci` en verde.

### 2026-08-12 — La dotación de una habitación pasa de mirarse a resolverse

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI) / feat
- **Síntoma:** el detalle de una habitación obligaba a **leerlo entero** para entenderlo, y al
  terminar no dejaba hacer nada útil.
- **Qué estaba mal, en concreto:**
  1. **Cuatro contadores + un bloque "Resumen"** que repetía uno de ellos (Items 1 / Items activos
     1), y ninguno respondía la pregunta real: ¿está completa esta habitación?
  2. **Cada línea eran tres recuadros rotulados** —Cantidad / Mínimo / Estado— que había que juntar
     mentalmente. "0 unid" junto a "0 unid" no dice si falta algo.
  3. **Orden alfabético.** En una habitación con veinte líneas, lo urgente queda enterrado.
  4. **Las dos únicas acciones eran destructivas** (inactivar, eliminar). La acción corriente al
     descubrir que falta algo —ajustar la cantidad— no existía: había que salir a la lista general
     y buscar el registro.
  5. Cabecera de 145 px con degradado para un título, y media pantalla vacía debajo.
- **Qué se hizo:**
  1. **Una barra de cobertura** como titular: el porcentaje de la dotación completa, con el
     desglose en una línea (`3 completos · 1 bajo mínimo · 1 sin stock · 12 unidades`). Sustituye a
     los cuatro contadores y al bloque "Resumen".
  2. **Cada línea con su propia barra**, midiendo la cantidad contra **su** mínimo. Sin mínimo
     definido no hay contra qué medir, así que la barra se llena si hay existencias.
  3. **Ordenadas por urgencia**: sin stock, bajo mínimo, y después el resto.
  4. **Cantidad editable en la línea**, con `−`/`+`, un atajo **"Completar al mínimo"** y guardado
     explícito (Descartar / Guardar). Solo se bloquea la línea que se está guardando, no el drawer.
  5. Las destructivas pasan a iconos discretos, para que no compitan con la acción útil.
  6. El drawer toma su alto natural y la cabecera baja a lo que ocupa el título.
- **Por qué el guardado es explícito y no al teclear:** son existencias, y un `+` accidental o un
  dígito de más no deberían viajar al servidor. El borrador vive en el componente y solo se envía
  lo que cambió.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/room-inventory/detail-room-inventory/*.{ts,html,css,spec.ts}`,
  `frontend/src/app/modules/room-inventory/list-room-inventory/*.{ts,html}`.
- **Impacto:** solo frontend; usa el `PATCH /api/room-inventory/{id}/` que ya existía. El CSS del
  drawer baja de 330 a 297 líneas y deja de traer su propia paleta. Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**221** pruebas, 13 nuevas del drawer: orden
  por urgencia, porcentaje de cobertura, titular por gravedad, barra contra el mínimo propio, y el
  ciclo completo del ajuste de cantidad) y `npm run build:ci` en verde.

### 2026-08-12 — Inventario: catálogo, reparto y bitácora en una sola vista

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Decisión de arquitectura:** consultada y aprobada por rastor65. Se agrega la sección **5.20**.
- **Qué se hizo:** las tres pantallas se consolidaron en **`/inventario`**, con el patrón de 5.18 y
  5.19 más dos cosas nuevas.
  1. **Contenedor** `modules/inventory/inventory-page/`, con cuatro métricas que cruzan las tres:
     items en catálogo con su valor al costo, **bajo mínimo** —que antes se calculaba en dos
     pantallas distintas—, habitaciones con la dotación incompleta y movimientos de hoy.
  2. **Seguimiento de un item entre pestañas.** Desde la tarjeta de un item se salta a **sus**
     movimientos o a las habitaciones donde está, y la lista destino se abre ya acotada por él. Es
     la pregunta que se hace mirando un item —"¿por qué bajó este stock?"— y hasta ahora obligaba a
     cambiar de pantalla y buscarlo otra vez a mano. Una barra de rastro recuerda a quién se sigue.
  3. **Tarjetas rehechas sobre `.gh-inv-*`**, con la **barra de stock** como centro (ver abajo).
  4. **Cache-aside** con TTL operativo en los tres servicios, invalidando las tres claves en
     cualquier escritura: un movimiento cambia el stock del item y una asignación lo reparte.
  5. **GSAP** una vez, y recargas silenciosas —la cuadrícula se atenúa en vez de desmontarse.
- **Las tarjetas:** las tres contestaban "¿cuánto hay frente a cuánto debería haber?" **con texto**
  (`Minimo: 5 | Maximo: 20`), obligando a comparar números mentalmente en cada tarjeta de la
  cuadrícula, y las tres traían la portada decorativa de siempre. Ahora:
  - **Barra con marca del mínimo.** El relleno es el stock y la marca es el mínimo: sin ella la
    barra solo diría "hay algo", no "hay poco". El color lo inyecta el componente en `--inv-tone`
    según el estado de existencias, no según la categoría.
  - La misma anatomía sirve para las otras dos: en habitación la barra es el **% de dotación
    completa**, y en movimiento la sustituye el **salto de stock** (`12 → 18`), que es lo que un
    movimiento significa y estaba enterrado en una línea de texto.
  - El SKU sube a la cabecera como chip monoespaciado, y costo/venta/margen pasan a metadatos con
    etiqueta.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/inventory/inventory-page/` (nuevo),
  `frontend/src/styles.css` (bloque `.gh-inv-*`),
  `frontend/src/app/modules/{items/list-items,room-inventory/list-room-inventory,inventory-movements/list-inventory-movements}/*.{ts,html,css}`,
  `frontend/src/app/services/{item,room-inventory,inventory-movement}.ts`,
  `frontend/src/app/app.routes.ts`, `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/migrations/0025_inventory_center_menu.py`, `backend/accounts/tests.py`.
- **Impacto:** **requiere `migrate` y `seed_rbac`**. El menú pasa de un grupo con tres hijos a una
  entrada (`inventory_center.read`); el grupo *Inventario* se desactiva y se suma a `LEGACY_KEYS`.
  Las rutas viejas redirigen a su pestaña. Sin migraciones de esquema.
- **Verificación:** backend `manage.py test` completo en verde (227 pruebas; `HOTEL_ROUTES`
  actualizado a `/inventario`). Frontend `npm run lint`, `npm run test:ci` (**208** pruebas, 15
  nuevas del contenedor: métricas, habitación contada una sola vez, valoración al costo,
  seguimiento entre pestañas y recarga sin parpadeo) y `npm run build:ci` en verde. El chunk
  `inventory-page` pesa 31,1 kB transferidos y sustituye a los tres anteriores. Backup en
  `backend/db.before-inventory-menu.*.sqlite3`.

### 2026-08-12 — Consultar un pago y reembolsarlo pasan a ser dos modales

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Qué se hizo:** el detalle del pago era **un solo modal de 1080 px con tres columnas**, y la
  tercera era el formulario de reembolso encajado entre datos de solo lectura. Se separó en dos.
  1. **`RefundPayment` (nuevo, 560 px).** Solo decidir: el **saldo reembolsable** grande arriba,
     el monto con atajo *Todo*, el motivo con contador, y referencia y notas debajo. Se cierra al
     registrar — la confirmación es que el reembolso ya aparece en el listado, no un cartel dentro
     de un formulario vacío.
  2. **Anticipa la consecuencia:** al teclear el monto dice si es reembolso total o cuánto quedará
     reembolsable después, en vez de dejar la resta al usuario.
  3. **Recalcula el tope al abrirse**, no lo hereda del listado: entre que se abrió la pantalla y
     se pulsa el botón, otro usuario pudo registrar un reembolso. Y descuenta **también los
     pendientes de aprobar** — todavía no salieron de caja, pero ya comprometen el saldo, y sin
     contarlos se podría pedir dos veces el mismo dinero.
  4. **Cuando no hay nada que hacer lo dice** (pago anulado / sin saldo) en vez de mostrar un
     formulario muerto, que es lo que pasaba antes.
  5. **El detalle queda como vista de consulta**, con el botón *Reembolsar* en el pie que emite
     `refundRequested`; la lista cierra el detalle y abre el otro modal, sin apilar capas.
- **De paso, el detalle se migró a `gh-modal-*`:** traía **521 líneas de CSS con su propia paleta
  en hexadecimal** y una cabecera azul marino que no se parecía a ningún otro modal del sistema —
  una violación de 5.15 que ya estaba ahí. Ahora son 267 líneas, solo tokens. Además el monto del
  pago pasa a titular el panel, y el resumen de factura se lee como un extracto: los reembolsos
  restan en rojo y las dos líneas de cierre —neto aplicado y saldo pendiente— pesan más que los
  sumandos.
- **Por qué separarlos:** consultar y devolver dinero son dos intenciones distintas —la primera se
  repasa, la segunda se decide— y mezclarlas dejaba el formulario con tres cifras apretadas en un
  recuadro y sin espacio para lo que de verdad hace falta al decidir. Separarlos no mueve el
  reembolso de sitio: sigue naciendo de un pago concreto (5.19), solo que en su propia superficie.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/payments/refund-payment/` (nuevo),
  `frontend/src/app/modules/payments/detail-payment/*.{ts,html,css,spec.ts}`,
  `frontend/src/app/modules/payments/list-payments/*.{ts,html,spec.ts}`.
- **Impacto:** solo frontend. El endpoint, el payload y las validaciones del reembolso no cambian.
  Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**193** pruebas, 13 nuevas: saldo con
  pendientes y rechazados, tope excedido, previsión de parcial, bloqueos, payload enviado, error
  del backend, y que el detalle pida el modal en vez de registrar) y `npm run build:ci` en verde.

### 2026-08-12 — Una sola anatomía de tarjeta para factura, pago y reembolso

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI) / feat
- **Qué se hizo:** las tres tarjetas se rehicieron sobre `.gh-doc-*`, definido una vez en
  `styles.css`. Es el equivalente de `.gh-cat-*` para documentos de cobro, con una diferencia
  deliberada: **el color no identifica la categoría sino el estado**, que es lo que se escanea en
  un listado de dinero.
  1. **El pago ya no se confunde con su factura.** Las tres titulaban con el número de factura, así
     que **dos pagos de la misma factura se veían idénticos**. Ahora el título va acompañado del
     consecutivo propio (`#29`) en un chip.
  2. **Chips de estado que dicen algo.** El pago mostraba "Activo" —lo son todos—; ahora dice
     *Registrado* / *Anulado*. La factura conserva Pagada/Emitida/Borrador, que sí informa.
  3. **Metadatos con etiqueta**, en rejilla de dos columnas. Antes era una lista de iconos sin
     rótulo donde "Activa" junto a un icono de documento no significaba nada y además **duplicaba
     el chip de estado**. En su lugar el pago muestra ahora **quién lo registró** (`created_by`).
  4. **Reembolso con contraparte real.** Tenía un avatar de iniciales derivado del número de
     factura —un avatar para un pago no significa nada— y titulaba con la factura. Ahora la
     contraparte es *"Devuelve el pago #N"* y el motivo tiene su propio espacio a dos líneas.
  5. **Pie único**: etiqueta + importe en cifras tabulares y la barra de acciones. El pie del
     reembolso ya no queda vacío ni con un "Sin acción" de relleno.
  6. Los documentos anulados se atenúan (`.is-void`) en vez de desaparecer: siguen ahí por
     trazabilidad, pero no compiten.
- **Botón de reembolso:** se añadió **"Reembolsar"** en la tarjeta de pago, que abre el detalle y
  **desplaza y enfoca el panel de reembolso** (`focusRefund`). El formulario **no se movió**: sigue
  en `detail-payment`, que es donde debe estar (ver decisión abajo).
- **Decisión — por qué el formulario no va en la pestaña de reembolsos:** `PaymentRefund.payment` es
  FK obligatoria, y el tope reembolsable, el método y la referencia salen del pago. Un formulario
  suelto tendría que empezar preguntando "¿de qué pago?" con un buscador sobre cientos de registros,
  y volver a cargar ese pago para validar el tope. Lo que faltaba no era otro formulario sino una
  **puerta visible**. Para cerrar el hueco, la pestaña de reembolsos lleva una nota de origen que
  explica de dónde nace un reembolso y un botón que salta a Pagos (`@Output() navigateTab`, para no
  acoplar la lista al contenedor).
- **CSS muerto eliminado:** `invoice/payment/refund-card`, `-head`, `-body`, `-foot`, `guest-block`,
  `guest-avatar`, `refund-avatar`, `refund-title-block`, `meta-list`, `invoice-number`,
  `inactive-card` y sus reglas en media queries. `.status-chip`, `.row-btn` y `.row-note` **se
  conservan**: los usa la vista de tabla, que no se tocó.
- **Archivos/áreas afectadas:** `frontend/src/styles.css` (bloque `.gh-doc-*`, nuevo),
  `frontend/src/app/modules/billing/list-bill/*.{html,css}`,
  `frontend/src/app/modules/payments/list-{payments,payment-refunds}/*.{ts,html,css}`,
  `frontend/src/app/modules/payments/detail-payment/detail-payment.ts`,
  `frontend/src/app/modules/billing/billing-page/billing-page.html`.
- **Impacto:** presentación y un atajo de navegación. No cambia el backend, ni el flujo de creación
  del reembolso, ni sus validaciones. Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (**180** pruebas, 5 nuevas: el atajo al panel
  de reembolso, que el detalle normal no lo pida, el salto de pestaña y que ninguna de las dos
  listas se desmonte al recargar) y `npm run build:ci` en verde.

### 2026-08-12 — Facturación: facturas, pagos y reembolsos en una sola vista

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Decisión de arquitectura:** consultada y aprobada por rastor65. Se agrega la sección **5.19**.
- **Qué se hizo:** las tres pantallas se consolidaron en **`/facturacion`**, con el mismo patrón de
  5.18 pero sobre una dependencia más fuerte.
  1. **Contenedor nuevo** `modules/billing/billing-page/`, con encabezado propio, cuatro métricas
     que cruzan las tres entidades y barra de pestañas con conteos.
  2. **Las tres listas se conservan enteras** (`@Input() embedded`, `@Output() changed`). No se
     reescribió ninguna de las ~4.500 líneas de los tres módulos.
  3. **Métrica que no existía: "Por cobrar".** Vive entre facturas y pagos, así que hasta ahora
     había que calcularla a mano saltando de una vista a otra. Se calcula sobre las facturas que
     siguen esperando cobro, no como `facturado − cobrado` (ver 5.19).
  4. **"Cobrado neto"** descuenta los reembolsos **procesados**; los pendientes todavía no salieron
     de caja. Y **"Reembolsos por aprobar"** es lo único del resumen que exige una decisión.
  5. **Cache-aside** en `BillingService` con TTL operativo (20 s) y invalidación de las **tres**
     claves en cualquier escritura, porque cada eslabón cambia el saldo del anterior.
  6. **GSAP** para la entrada escalonada, una sola vez.
  7. Las recargas tras una acción son **silenciosas**, como en el catálogo: la tabla se atenúa en
     vez de desmontarse.
- **Por qué:** la relación no es un cruce temático sino una **cadena del modelo** —`Payment.invoice`
  y `PaymentRefund.payment` son FK obligatorias— y ninguna de las tres se crea en su propia vista:
  el pago nace en el check-out y el reembolso en el detalle del pago. Eran ya tres cortes de
  consulta del mismo dinero.
- **Detalle de permisos que había que resolver:** `payment-refunds.read` no estaba en el rol
  `staff`, así que recepción **no veía reembolsos**. Unir las vistas se lo habría regalado. La
  pestaña y su métrica se pintan solo con ese scope (`BillingPage.canSeeRefunds`), y si la URL pide
  `?tab=refunds` sin permiso, cae a facturas. `staff` recibe `billing_center.read` para no perder
  facturas ni pagos, que sí operaba.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/billing/billing-page/` (nuevo),
  `frontend/src/app/modules/billing/list-bill/`,
  `frontend/src/app/modules/payments/list-{payments,payment-refunds}/`,
  `frontend/src/app/services/billing.ts` (caché), `frontend/src/app/app.routes.ts`,
  `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/migrations/0024_billing_center_menu.py`, `backend/accounts/tests.py`.
- **Impacto:** **requiere `migrate` y `seed_rbac`**. El menú pasa de un grupo con tres hijos a una
  entrada (`billing_center.read`); el grupo *Facturas y pagos* se desactiva y se suma a
  `LEGACY_KEYS`. Las rutas viejas redirigen a su pestaña. Sin migraciones de esquema.
- **Verificación:** backend `manage.py test` completo en verde (227 pruebas; se actualizó
  `HOTEL_ROUTES` a `/facturacion`). Frontend `npm run lint`, `npm run test:ci` (**175** pruebas, 16
  nuevas del contenedor: métricas, alcance por rol y recarga sin parpadeo) y `npm run build:ci` en
  verde. El chunk `billing-page` pesa 35,9 kB transferidos y sustituye a los tres anteriores.
  Backup en `backend/db.before-billing-menu.*.sqlite3`.

### 2026-08-12 — Activar o eliminar en el catálogo ya no parece recargar la página

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (UX)
- **Síntoma:** cualquier acción de tarjeta —activar, desactivar, eliminar, restaurar,
  publicar/ocultar— hacía que la pantalla entera desapareciera y volviera a aparecer.
- **Causa, que eran tres cosas sumadas:**
  1. **La lista se vaciaba a sí misma.** Toda acción llamaba a `refresh*()` → `loadCatalogData()`,
     que ponía `loading = true`. La cuadrícula vive dentro de un `*ngIf="!loading && …"`, así que se
     **desmontaba entera** y en su lugar salía "Cargando catálogo…". Al colapsar la altura, el
     scroll saltaba arriba. Eso es, literalmente, lo que se ve al recargar una página.
  2. **El contenedor volvía a animar todo.** `changed` → `onCatalogChanged()` →
     `loadSummary(true)` → `scheduleReveal()`, que re-ejecutaba la entrada GSAP (fundido +
     desplazamiento) de métricas, pestañas **y el panel completo** en cada clic.
  3. **Nada se actualizaba hasta el final.** El estado de la tarjeta no cambiaba hasta que volvían
     las 4–7 peticiones del `forkJoin` de la lista más las 3 del contenedor.
- **Qué se hizo:**
  1. `loading` pasa a significar **solo la primera carga**; las recargas posteriores usan
     `refreshing`, que **no** desmonta nada. `loadCatalogData({ silent: true })` y
     `loadSummary(force, silent)`. Como `refresh*()` solo se invoca después de una acción del
     usuario, siempre es silenciosa.
  2. La recarga se comunica en el sitio donde el usuario ya la busca: el botón **Actualizar** gira
     y se deshabilita, y la cuadrícula se atenúa (`.catalog-sections.is-refreshing`) sin moverse.
  3. **La entrada animada se ejecuta una vez** (`revealed`), no en cada recarga. Sigue corriendo al
     cambiar de pestaña, que sí es un cambio real de contenido.
  4. Los cuatro *toggles* (activo en servicios, paquetes y promociones; público/interno en
     promociones) **pintan el estado con la respuesta del PATCH** y llaman a `applyFilters()`, así
     que la tarjeta cambia al instante y la recarga solo confirma y actualiza contadores.
- **Por qué así y no con menos peticiones:** la recarga completa **se conserva** a propósito.
  Eliminar mueve el elemento a la papelera, restaurar lo devuelve, y desactivar cambia contadores,
  pestañas de filtro y las métricas del contenedor. Recargar es correcto; lo que estaba mal era
  **desmontar la vista mientras se recarga**.
- **Archivos/áreas afectadas:**
  `frontend/src/app/modules/{services/list-services,packages/list-packages,promotions/list-promotions}/*.{ts,html,css}`,
  `frontend/src/app/modules/catalog/catalog-page/catalog-page.{ts,html}`.
- **Impacto:** solo frontend. Sin cambios de API ni de datos.
- **Verificación:** `npm run lint`, `npm run test:ci` (**159** pruebas; 3 nuevas: que una recarga no
  active `loading` en la lista ni en el contenedor, y que el *toggle* pinte el estado sin esperar) y
  `npm run build:ci` en verde.

### 2026-08-12 — Una sola anatomía de tarjeta para los tres catálogos

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (UI)
- **Qué se hizo:** las tarjetas de servicio, paquete y promoción se rehicieron sobre un sistema de
  clases compartido, `.gh-cat-*`, definido una sola vez en `styles.css` (sección 5.15).
  1. **Fuera la portada decorativa.** Ocupaba 124 px de una tarjeta de 368 px en servicios y
     paquetes —un tercio— y en promociones se comía el **36% del ancho**. Solo mostraba un degradado
     y un icono de marca de agua: cero información. La identidad por color se conserva en una
     **placa de icono de 46 px** y una franja superior de 4 px, ambas teñidas con el color de la
     categoría que el componente inyecta por `[ngStyle]` en `--cat-tone` / `--cat-tone-soft`.
  2. **El dato que se compara sube al pie.** Precio en servicios y paquetes, **descuento** en
     promociones —que antes iba en letra pequeña debajo del panel de color—, siempre en la misma
     posición y con el estado enfrente.
  3. **Una sola barra de acciones.** Las tres tenían las mismas cuatro acciones (Ver / editar /
     activar / eliminar; promociones suma visibilidad) con **tres tratamientos distintos**. Ahora
     comparten `.gh-cat-btn`, con "Ver" como acción primaria que ocupa el ancho sobrante.
  4. **Descripción a dos líneas fijas** (`line-clamp`) para que la cuadrícula quede alineada sin
     imponer alturas mínimas a ojo.
  5. **Promociones pasa de 2 a 3 columnas**, como las otras dos: al no haber panel lateral la
     tarjeta cabe, y las tres pestañas se ven como la misma pantalla.
- **Por qué:** consolidar las tres vistas en pestañas (entrada siguiente) dejó a la vista que eran
  tres diseños distintos para la misma clase de objeto. Cambiar de pestaña obligaba a reaprender
  dónde está cada dato, que es justo lo que la consolidación pretendía evitar.
- **Alturas resultantes:** 368 → 262 px (servicios), 430 → 330 px (paquetes), 314 → 286 px
  (promociones). Caben ~40% más tarjetas por pantalla sin perder ningún dato.
- **CSS muerto eliminado:** `*-cover`, `cover-symbol`, `cover-badges`, `cover-type`, `validity-chip`,
  `price-row`, `price-wrap`, `discount-wrap`, `card-foot`, `card-actions`, `chips-column`,
  `status-chip`, `status-dot`, `service-tags`, `meta-row` y los modificadores `.row-btn.danger` /
  `.row-btn.primary-action` en los tres componentes, más sus reglas en media queries. `.row-btn`
  base **se conserva**: lo sigue usando el botón "Restaurar" de la papelera.
- **Archivos/áreas afectadas:** `frontend/src/styles.css` (bloque `.gh-cat-*`, nuevo),
  `frontend/src/app/modules/{services/list-services,packages/list-packages,promotions/list-promotions}/*.{html,css}`.
- **Impacto:** solo presentación. No cambia ningún método de componente, ningún servicio ni el
  backend. Sin migraciones.
- **Verificación:** `npm run lint`, `npm run test:ci` (156 pruebas en verde) y `npm run build:ci` en
  verde. El aviso de presupuesto del bundle inicial (64 kB) es previo a este cambio.

### 2026-08-12 — Catálogo comercial: una sola vista con pestañas, caché y animación

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Decisión de arquitectura:** consultada y aprobada por rastor65. Se agrega la sección **5.18**.
- **Qué se hizo:** `/catalogo-servicios`, `/catalogo-paquetes` y `/promociones` se consolidaron en
  **`/catalogo-comercial`**.
  1. **Contenedor nuevo** `modules/catalog/catalog-page/` con encabezado propio, cuatro métricas
     que cruzan los tres catálogos y una barra de pestañas con conteos.
  2. **Las tres listas se conservan enteras.** Cada una recibió `@Input() embedded`, que oculta su
     encabezado y sus métricas cuando vive dentro del contenedor; con `embedded = false` siguen
     funcionando solas. **No se reescribió ninguna de las ~6.000 líneas** de los tres módulos.
  3. **Solo se monta la pestaña activa.** Montar las tres dispararía sus peticiones y sus
     animaciones sin que nadie las vea.
  4. **La pestaña viaja en la URL** (`?tab=packages`), así que un enlace compartido abre donde
     corresponde y el botón "atrás" del navegador funciona.
  5. **Métricas accionables, no conteos.** Servicios activos, paquetes activos, promociones
     vigentes —con aviso de las que vencen en 7 días— y **servicios que no están en ningún
     paquete**, que es catálogo que no se está aprovechando. Cada tarjeta lleva a su pestaña.
  6. **Cache-aside** en `ServicesService`, `PackagesService` y `PromotionsService`, igual que en
     `RoomService`. Editar un servicio invalida además paquetes y promociones, porque muestran su
     nombre. Efecto secundario útil: el resumen del contenedor y la lista de la primera pestaña
     comparten la misma respuesta cacheada, así que abrir la pantalla no duplica el tráfico.
  7. **GSAP** para la entrada escalonada de métricas, pestañas y panel, con el `MotionService` que
     ya respeta `prefers-reduced-motion`.
- **Por qué:** la dependencia entre las tres es encadenada, no temática: un paquete se arma con
  servicios y una promoción apunta a un servicio o a un paquete. `create-package` y
  `create-promotion` ya recibían los catálogos ajenos por `@Input`, es decir, el cruce existía pero
  obligaba a navegar. Es la misma situación que motivó consolidar habitaciones (5.14).
- **Diferencia deliberada con habitaciones:** allá había una entidad principal y tres catálogos
  accesorios que cupieron como modales. Aquí las tres tienen peso propio (688, 823 y 833 líneas de
  TS), así que se optó por **pestañas**, no por disolverlas.
- **Detalle que costó encontrar:** `redirectTo` en forma de texto trata el valor como una **ruta**,
  así que `'catalogo-comercial?tab=services'` habría creado un segmento con el `?` dentro en vez de
  un query param. Se usó la forma **funcional** de `redirectTo` (Angular 18+), que devuelve un
  `UrlTree` y sí admite query params.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/catalog/catalog-page/` (nuevo),
  `frontend/src/app/modules/{services,packages,promotions}/list-*` (`embedded` + `changed`),
  `frontend/src/app/services/{service,package,promotion}.ts` (caché),
  `frontend/src/app/app.routes.ts`,
  `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/migrations/0023_commercial_catalog_menu.py`, `backend/accounts/tests.py`.
- **Impacto:** **requiere `migrate` y `seed_rbac`**. El menú pasa de tres entradas a una
  (`commercial_catalog.read`), y el grupo *Paquetes y promociones* se desactiva. Como en 5.17, la
  entrada de menú es **solo menú**: `services.*`, `packages.*` y `promotions.*` siguen protegiendo
  sus endpoints y no se tocaron en ningún rol. Las rutas viejas redirigen a su pestaña. Sin
  migraciones de esquema.
- **Verificación:** backend `manage.py test` completo en verde (227 pruebas). Frontend
  `npm run lint`, `npm run test:ci` (156 pruebas, 12 nuevas del contenedor) y `npm run build:ci` en
  verde. El chunk `catalog-page` pesa 29,6 kB transferidos y sustituye a los tres anteriores.
  Backup en `backend/db.before-catalog-menu.*.sqlite3`.

### 2026-08-12 — Se puede editar una promoción (el componente estaba vacío)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `UpdatePromotion` existía como **componente vacío** —11 líneas de TypeScript sin
  lógica, 1 de HTML— y nadie lo importaba. En `/promociones` se podía crear, ver, activar,
  desactivar, hacer pública/privada, eliminar y restaurar; **no editar**. Corregir un descuento, una
  fecha o un código obligaba a borrar la promoción y crearla de nuevo, con el riesgo que eso tiene
  si ya se usó en reservas.
- **Cómo:** el formulario se derivó del de creación para que ambos validen **igual** —alcance,
  rango de fechas y tope de 100% en descuentos porcentuales—, en vez de mantener dos reglas para la
  misma entidad. El alcance (general / servicio / paquete) no se guarda en el modelo: **se deduce**
  de a qué apunta la promoción al abrirla.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/promotions/update-promotion/`
  (`.ts`, `.html`, `.css`, `.spec.ts`),
  `frontend/src/app/modules/promotions/list-promotions/` (`.ts`, `.html`).
- **Impacto:** ninguno en backend — `PUT/PATCH /api/promotions/<id>/` ya existía y estaba sin usar.
- **Verificación:** frontend `npm run lint` y `npm run test:ci` (7 pruebas nuevas: carga del
  formulario, deducción del alcance, guardado, limpieza del objetivo al cambiar de alcance,
  validaciones heredadas y error del backend).

### 2026-08-12 — La ficha del check-in/out muestra la habitación, no el id de reserva

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor (usabilidad)
- **Qué se hizo:** la fila *Reserva #29 · En curso* se reemplazó por **Habitación**, con número,
  piso y tipo (`Habitacion 101 · Piso 1 · Standard`).
- **Por qué:** el número de reserva es un id interno de la base de datos; a quien está en el
  mostrador no le dice nada. La habitación sí es el lenguaje con el que trabaja recepción.
- **Detalle:** `roomLabel` arma la etiqueta descartando los datos vacíos, para no dejar separadores
  sueltos (`Habitacion 101 · ·`) cuando la habitación no tiene piso o tipo asignado. Hay una prueba
  para ese caso.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-check-modal/`
  (`.ts`, `.html`, `.spec.ts`).
- **Impacto:** ninguno en backend. Requiere recargar el frontend.
- **Verificación:** frontend `npm run lint`, `npm run test:ci` (138 pruebas, 2 nuevas) y
  `npm run build:ci` en verde.

### 2026-08-12 — Cada pago guarda quién lo registró

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / security
- **Qué se hizo:** `billing.Payment` gana `created_by`, el dato que faltaba para cerrar la
  trazabilidad del historial de cobros.
  1. **Modelo:** FK al usuario, `null=True` porque los pagos anteriores no tienen autor, y
     `on_delete=SET_NULL` para que dar de baja a un empleado no borre el pago. Misma convención que
     `Reservation.created_by`.
  2. **Migración `billing/0008`**, aditiva y sin datos que rellenar.
  3. **El autor sale de la sesión, no del cuerpo de la petición.** `PaymentViewSet.perform_create`
     hace `serializer.save(created_by=self.request.user)` y el campo es `read_only` en el
     serializer, así que **no se puede registrar un cobro a nombre de otro** — hay una prueba que
     manda `created_by` en el JSON y comprueba que se ignora.
  4. **El abono inicial de una reserva también queda con autor.** `ReservationDepositSerializer`
     crea un `Payment` por su cuenta; si solo se hubiera tocado el ViewSet, ese camino habría
     seguido sin autor.
  5. **Se expone `created_by_username`** y el historial del check-out muestra *"· por cajera"*.
- **Por qué importa:** es el dato que se busca primero cuando hay un descuadre de caja. Sin él, el
  historial responde *qué, cuándo y con qué*, pero no *quién*.
- **Archivos/áreas afectadas:** `backend/apps/billing/models.py`,
  `backend/apps/billing/migrations/0008_payment_created_by.py`, `backend/apps/billing/serializers.py`,
  `backend/apps/billing/views.py`, `backend/apps/billing/tests.py`,
  `backend/apps/reservations/serializers.py`,
  `frontend/src/app/modules/billing/billing-model.ts`,
  `frontend/src/app/modules/rooms/room-check-modal/` (`.ts`, `.html`, `.spec.ts`).
- **Impacto:** **requiere `python manage.py migrate`**. `GET /api/payments/` gana `created_by` y
  `created_by_username` (aditivo). **Los pagos históricos quedan sin autor** y se muestran sin la
  línea "por…" — no hay forma de reconstruirlo, así que la trazabilidad empieza desde esta fecha.
- **Verificación:** backend `manage.py test` completo en verde (227 pruebas, 2 nuevas) y
  `makemigrations --check` sin cambios pendientes. Frontend `npm run lint`, `npm run test:ci`
  (136 pruebas) y `npm run build:ci` en verde. Backup en
  `backend/db.before-payment-author.*.sqlite3`.

### 2026-08-12 — Historial de pagos en el check-out

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el modal de salida muestra, encima del panel de cobro, el **historial de
  movimientos de dinero** de la estadía: fecha y hora, método, referencia y monto de cada pago, con
  el neto al lado del título. Se refresca solo al registrar un cobro, así que el recepcionista ve el
  suyo sin recargar.
- **Por qué incluye reembolsos y no solo pagos:** el total *Pagado* que muestra la reserva ya
  descuenta los reembolsos aprobados (`get_reservation_financials`). Un historial de solo pagos
  sumaría más que esa cifra en cuanto existiera una devolución, y el recepcionista no sabría a cuál
  creerle. Los reembolsos aparecen como movimiento negativo, con borde rojo, y el neto del historial
  cuadra con *Pagado*.
- **Lo anulado y lo pendiente también se muestran**, en borde punteado y atenuados, pero **no
  suman**: un pago dado de baja o un reembolso sin aprobar no movieron el saldo. Para auditar
  importa que la solicitud exista, no solo lo que quedó en pie — por eso los pagos se piden con
  `include_inactive`.
- **Limitación resuelta el mismo día:** el historial nació sin autor porque `billing.Payment` no
  tenía `created_by`. Se agregó en la entrada siguiente.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-check-modal/`
  (`.ts`, `.html`, `.css`, `.spec.ts`).
- **Impacto:** sin cambios de backend, sin migraciones y sin recursos RBAC nuevos — reutiliza
  `GET /api/payments/` y `GET /api/payment-refunds/`. El bloque respeta
  `rooms.read_guest_data`: quien no puede ver el saldo tampoco ve el historial. Requiere recargar el
  frontend.
- **Verificación:** frontend `npm run lint`, `npm run test:ci` (136 pruebas, 5 nuevas: pagos
  listados, sin pagos, reembolso restando, anulados que no suman y orden cronológico) y
  `npm run build:ci` en verde.

### 2026-08-12 — Todo hotel nuevo nace con el método de pago en efectivo

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** un `post_save` sobre `HotelSettings` (`apps/hotel_settings/signals.py`) crea el
  método **Efectivo** al nacer el hotel. Se documentó en la sección 5.16.
- **Por qué en un signal y no en la vista:** los hoteles nacen por **tres caminos** —el panel SaaS,
  `POST /api/hotel-settings/` y `apps.demo_requests.views.convert_request()`—. Resolverlo en una
  vista habría dejado los otros dos sin el método, y desde el cambio del check-out **un hotel sin
  método activo no puede cobrar ni cerrar una salida**: nacería bloqueado.
- **Idempotente:** usa `get_or_create` contra `(hotel_settings, code)`, así que reguardar el hotel o
  restaurar uno borrado no duplica ni rompe la unicidad. Hay una prueba para cada caso.
- **El método es un punto de partida, no una imposición:** el hotel puede renombrarlo —el `code` se
  regenera—, desactivarlo o eliminarlo desde la pestaña Métodos de Pago.
- **Efecto en las pruebas existentes:** seis fixtures creaban su propio "EFECTIVO" después de crear
  el hotel y chocaban con la unicidad. Se cambiaron a `get_or_create`, que devuelve el sembrado por
  el signal. La prueba se lee igual y ya no depende de quién creó el método.
- **Archivos/áreas afectadas:** `backend/apps/hotel_settings/signals.py` (nuevo),
  `backend/apps/hotel_settings/apps.py`, `backend/apps/hotel_settings/tests.py`, y las fixtures de
  `billing`, `finance`, `notifications`, `reservations` y `rooms`.
- **Impacto:** sin migraciones ni cambios de API. **Solo aplica a hoteles creados de aquí en
  adelante**; los nueve existentes ya tienen sus métodos de la migración `hotel_settings/0006`.
- **Verificación:** backend `manage.py test` completo en verde (225 pruebas, 4 nuevas) y
  `makemigrations --check` sin cambios pendientes. Comprobado además contra el endpoint real:
  `POST /api/hotel-settings/` devuelve 201 y el hotel nuevo ya trae `Efectivo`.

### 2026-08-12 — Seguridad pasa a SaaS Admin (nueva sección 5.17)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** security
- **Decisión de arquitectura:** solicitada explícitamente por rastor65. Se agrega la sección 5.17.
- **Qué se hizo:** el grupo **Seguridad** (Usuarios, Roles, Recursos, Master Data) desapareció del
  menú de hotel y sus cuatro páginas quedaron bajo **SaaS Admin**.
  1. **Entradas de menú nuevas y separadas del scope:** `saas_users.read`, `saas_roles.read`,
     `saas_resources.read` y `saas_master_data.read`, sin `link_backend`, asignadas solo a
     `platform_admin`. Los recursos de dominio dejaron de ser menú pero **siguen protegiendo la API**.
  2. **Doble cerrojo en las rutas:** además del menú, `/usuarios`, `/roles`, `/recursos` y
     `/master-data` llevan `platformAdminOnly: true`, que valida contra superusuario sin hotel (5.4)
     y no depende del RBAC.
  3. **Los roles de hotel perdieron** `users.*`, `roles.*` y `resources.*`.
  4. **El grupo `security` quedó desactivado** vía `LEGACY_KEYS`.
  5. **Migración `accounts/0022`** para aplicarlo a bases existentes, reversible.
- **Lo que NO se tocó, y es lo importante:** **`master_data.read` sigue asignado a los roles de
  hotel.** Antes de mover nada se verificó qué consume cada endpoint: `listMasterData` aparece en
  **doce pantallas de hotel** (facturas, limpieza, egresos, inventario, ítems, mantenimiento,
  promociones, reservas…), que lo usan para leer sus catálogos. Quitarlo habría dejado media
  aplicación en 403 — el efecto de confundir "ver la página" con "usar la API".
- **Consecuencia operativa que conviene tener presente:** un administrador de hotel **ya no puede
  crear usuarios de su propio hotel**; pasa a ser trabajo del administrador de plataforma. Si se
  quiere devolver solo esa capacidad, 5.17 explica el camino.
- **Archivos/áreas afectadas:** `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/migrations/0022_security_menu_into_saas.py`, `backend/accounts/tests.py`,
  `frontend/src/app/app.routes.ts`, `AGENTS.md`.
- **Impacto:** **requiere `python manage.py migrate` y `python manage.py seed_rbac`**. Sin
  migraciones de esquema. Resultado en la base local: `admin` y `manager` con 21 rutas de menú y
  ninguna de seguridad; `platform_admin` con 10, incluidas las cuatro.
- **Verificación:** backend `manage.py test` completo en verde (221 pruebas; la de cobertura de
  menú se actualizó para exigir que las cuatro rutas estén **fuera** del menú de hotel y **dentro**
  del de plataforma). Frontend `npm run lint`, `npm run test:ci` (131 pruebas) y `npm run build:ci`
  en verde. Backup de la base en `backend/db.before-security-menu.*.sqlite3`.

### 2026-08-11 — Configuración del Hotel: decir por qué está bloqueada

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix (usabilidad)
- **Síntoma reportado:** con el usuario `admin`, `/hotel-config` no dejaba editar nada.
- **Diagnóstico:** **no había ningún fallo de permisos ni de backend.** Se verificó que el usuario
  tiene `hotel_settings.write`, que `canEdit` se resuelve en `true`, que `GET /api/hotel-settings/`
  devuelve los hoteles y que `PATCH /api/hotel-settings/<id>/` responde 200. Lo que ocurría es que
  `admin` es **administrador de plataforma** (superusuario sin hotel, ver 5.4) y el formulario se
  bloquea hasta que elige *qué* hotel configurar — algo correcto, porque si no editaría un hotel al
  azar. El problema era que **eso no se decía en ninguna parte**: la única pista era un texto gris
  pequeño a la derecha del selector, y el resultado parecía una pantalla rota o una falta de
  permisos.
- **Qué se hizo:**
  1. **Aviso explícito** cuando falta elegir hotel: *"Eres administrador de plataforma: elige
     primero el hotel que quieres configurar. Hasta entonces los campos están bloqueados para no
     editar el hotel equivocado."* Se muestra con el getter nuevo `mustSelectHotel`.
  2. **Preselección automática** cuando el administrador solo gestiona **un** hotel: ahí elegir no
     es una decisión, y dejaba la pantalla bloqueada sin motivo.
  3. **Cinco pruebas** que fijan la matriz de bloqueo: sin hotel elegido, con hotel elegido,
     creando un hotel, siendo administrador de hotel (que nunca debe elegir nada) y sin permiso de
     escritura.
- **De paso se confirmó** que el selector solo lista 4 de los 9 hoteles porque los otros 5 están
  **borrados lógicamente**. Es el comportamiento correcto de 5.5, no un filtro que falte.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/hotel-settings/`
  (`.ts`, `.html`, `.spec.ts`).
- **Impacto:** ninguno en backend ni en API. Requiere recargar el frontend.
- **Verificación:** frontend `npm run lint`, `npm run test:ci` (131 pruebas, 5 nuevas) y
  `npm run build:ci` en verde.

### 2026-08-11 — Un método de pago: nombre, tipo y número de cuenta

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** el modelo recién creado tenía código, descripción y orden — campos que el usuario
  tenía que llenar sin que aportaran nada a la operación. Se redujo a lo que un método de pago
  realmente es.
  1. **Campos nuevos:** `method_type` (`EFECTIVO` / `TRANSFERENCIA`) y `account_number`.
  2. **Campos retirados:** `description` y `sort_order`. La lista ahora se ordena por nombre.
  3. **El número de cuenta solo aparece en transferencias.** El formulario oculta el campo, y tanto
     el serializer como `save()` lo descartan si el método es en efectivo, para no dejar un dato
     huérfano que después alguien lea como válido.
  4. **`code` pasó a derivarse del nombre** y salió del formulario. Se conservó porque
     `payment_method_code` alimenta íconos y etiquetas en seis lugares de facturación, y porque su
     unicidad por hotel es lo que impide dos métodos con el mismo nombre — el mensaje de error ahora
     habla de nombres, no de códigos.
  5. **La cuenta destino se muestra al cobrar.** Si el método elegido en el check-out es una
     transferencia, el panel de cobro muestra el número de cuenta.
  6. **Clasificación de lo existente.** `hotel_settings/0007` marca como transferencia los métodos
     cuyo nombre o código sugiere movimiento bancario (`TRANSFER`, `NEQUI`, `PSE`, `QR`, `BANCO`…) y
     el resto como efectivo. Es una heurística, y por eso **quedan sin número de cuenta a
     propósito**: obliga al hotel a completarlo y de paso a revisar la clasificación.
- **Por qué:** un catálogo se llena una vez y se consulta todos los días; cada campo que no sirve
  para cobrar es fricción en el alta y ruido en el selector.
- **Consecuencia a tener presente:** los códigos históricos se conservaron tal cual (`CASH`,
  `TRASNFER`…), pero cualquier método que se **edite** desde ahora regenerará su código desde el
  nombre. En un hotel con nombres duplicados —la base local tiene dos "Efectivo", herencia del
  catálogo global— editar uno choca con el otro y el serializer lo rechaza con "Ya existe un metodo
  de pago con ese nombre". Es el comportamiento correcto y además hace visible el duplicado, pero
  conviene limpiarlos.
- **Archivos/áreas afectadas:** `backend/apps/hotel_settings/` (`models.py`, `serializers.py`,
  `views.py`, `admin.py`, `tests.py`, migración `0007`),
  `frontend/src/app/services/payment-method.ts`,
  `frontend/src/app/components/pages/hotel-settings/` (`.ts`, `.html`),
  `frontend/src/app/modules/rooms/room-check-modal/` (`.ts`, `.html`, `.css`),
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`.
- **Impacto:** **requiere `python manage.py migrate`**. Cambio de contrato de API:
  `/api/payment-methods/` pierde `description` y `sort_order`, y gana `method_type`,
  `method_type_label` y `account_number`; `code` pasa a ser de solo lectura. Requiere recargar el
  frontend.
- **Verificación:** backend `manage.py test` completo en verde (220 pruebas, 4 nuevas sobre tipo y
  cuenta). Frontend `npm run lint`, `npm run test:ci` (126 pruebas) y `npm run build:ci` en verde.

### 2026-08-11 — Métodos de pago propios de cada hotel (nueva sección 5.16)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / security
- **Decisión de arquitectura:** consultada y aprobada por rastor65 antes de implementar. Se agrega
  la sección **5.16**; el detalle del porqué está allí.
- **Qué se hizo:**
  1. **Modelo nuevo `hotel_settings.PaymentMethod`** con FK a hotel y unicidad
     `(hotel_settings, code)`, registrado en el admin de Django.
  2. **Migración de datos en cinco pasos.** `hotel_settings/0006` copia a cada hotel los métodos
     **activos** del catálogo global, preservando código, nombre y orden. Después, una migración por
     app (`billing/0007`, `finance/0005`, `reservations/0010`) repunta su FK con el patrón
     *agregar campo anulable → mapear → borrar el viejo → renombrar*, y el mapeo usa `get_or_create`
     para no perder registros históricos que apunten a métodos que estaban inactivos. Resultado en
     la base local: **46 métodos en 9 hoteles, cero nulos y cero referencias cruzadas entre hoteles**.
  3. **API `/api/payment-methods/`** con `TenantScopeMixin` y borrado lógico. Comparte los scopes
     `hotel_settings.read/write`: es configuración del hotel y se administra en la misma pantalla,
     así que **no hace falta correr `seed_rbac`** ni crear recursos RBAC nuevos.
  4. **Pestaña "Métodos de Pago"** en `/hotel-config`: alta, edición, activar/desactivar y eliminar,
     con aviso explícito cuando el hotel no tiene ninguno.
  5. **Los seis consumidores del frontend** (facturas, egresos, pagos, reservas, modal de habitación
     y modal de check-in/check-out) pasaron al catálogo del hotel, junto con los cuatro componentes
     hijos que reciben la lista por `@Input`.
  6. **Validación de tenancy** en los serializers de `Payment`, `Expense` y `ReservationDeposit`:
     cobrar con el método de otro hotel devuelve 400.
- **Detalle que costó encontrar:** DRF deduce un `UniqueTogetherValidator` de la `UniqueConstraint`
  del modelo, y ese validador vuelve **obligatorio** `hotel_settings` en el cuerpo de la petición —
  justo el campo que `TenantSerializerMixin` resuelve solo. Se desactiva con `validators = []` en el
  `Meta` y el duplicado se valida a mano contra el hotel ya resuelto. Cualquier modelo nuevo con
  unicidad que incluya el tenant se va a topar con lo mismo.
- **Archivos/áreas afectadas:** `backend/apps/hotel_settings/` (`models.py`, `serializers.py`,
  `views.py`, `urls.py`, `admin.py`, `tests.py`, migraciones `0005`–`0006`),
  `backend/apps/billing/`, `backend/apps/finance/`, `backend/apps/reservations/` (modelo, serializer,
  migración y fixtures de prueba), `frontend/src/app/services/payment-method.ts` (nuevo),
  `frontend/src/app/components/pages/hotel-settings/`, y los seis módulos consumidores.
- **Impacto:**
  - **Requiere `python manage.py migrate`.** Las migraciones son reversibles: el `reverse` devuelve
    los FK al catálogo global. Aun así, como en Railway corren solas al desplegar (sección 10),
    conviene respaldar antes.
  - **Los métodos globales de `MasterData` quedan huérfanos**: ya no alimentan ninguna pantalla. No
    se borran en esta entrada; conviene limpiarlos por separado, ya sin prisa.
  - Un hotel **sin métodos activos no puede cobrar ni cerrar un check-out**.
  - Los duplicados y el typo `TRASNFER` **se copiaron tal cual** a cada hotel: los códigos solo se
    muestran, nunca se comparan en lógica, y reescribirlos habría cambiado datos históricos sin
    pedirlo. Ahora cada hotel puede corregir los suyos desde la pestaña.
- **Verificación:** backend `manage.py test` completo en verde (216 pruebas, 4 nuevas de aislamiento
  entre hoteles). Frontend `npm run lint`, `npm run test:ci` (126 pruebas) y `npm run build:ci` en
  verde. Migraciones aplicadas a la base local con backup en
  `backend/db.before-payment-methods.*.sqlite3`.

### 2026-08-10 — El check-out cobra: no se cierra la estadía con saldo pendiente

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el modal de salida tenía una casilla de "confirmo que el saldo quedó gestionado",
  que es una declaración de intenciones, no un cobro. Se reemplazó por un cobro real.
  1. **Panel de cobro.** Método de pago (desde `MasterData.PAYMENT_METHOD`), monto —precargado con
     el saldo completo, con botón *Todo*— y referencia opcional. El pago se registra contra la
     factura por defecto de la reserva, por el mismo camino que ya usa el cobro inmediato de un
     consumo en el modal de habitación.
  2. **El cierre se bloquea hasta que el saldo esté en cero.** `blockingReason` pasó a decir
     *"Falta cobrar $X antes de cerrar la estadía"*. Tras cada pago se relee la reserva, así que
     `pending_amount` baja hasta cero y ahí se habilita *Confirmar salida*. Se admiten abonos
     parciales: el panel avisa cuánto quedaría por cobrar.
  3. **Detalle de consumos** debajo del saldo: qué consumió el huésped, con cantidad × precio
     unitario y total. **Excluye los cargos automáticos** (estadía y paquete), que ya están en el
     saldo y no son "lo que consumió".
  4. **Fuente del saldo.** Se dejó de leer `operations.reservation_pending` de la tarjeta y se pasó
     a `reservation.pending_amount`, que es el mismo número pero **se puede releer** después de cada
     pago. La tarjeta es una foto; aquí hace falta el valor vivo.
  5. **Errores del backend a la vista.** Si el pago se rechaza (por ejemplo, monto mayor al saldo de
     la factura), se muestra el mensaje del servidor en vez de un fallo genérico.
- **Por qué:** una casilla de confirmación no cobra nada. El saldo olvidado en la salida es la
  pérdida más común de recepción, y el sistema tenía toda la información para impedirlo.
- **Suposición verificada antes de construir:** `Payment.clean()` limita el monto al saldo de la
  **factura**, mientras que el modal muestra el saldo de la **reserva**. Si esos dos números se
  separaran, el panel pediría cobrar algo que el backend rechazaría. Los signals de
  `apps/billing/signals.py` mantienen `invoice.subtotal` igual al total de la reserva, así que
  coinciden — y se agregó `test_full_payment_of_the_reservation_balance_is_accepted` para que siga
  siendo cierto.
- **Archivos/áreas afectadas:** `backend/apps/rooms/tests.py`,
  `frontend/src/app/modules/rooms/room-check-modal/` (`.ts`, `.html`, `.css`, `.spec.ts`).
- **Impacto:** sin migraciones ni cambios de API. **Requiere métodos de pago configurados** en
  Master Data (`PAYMENT_METHOD`); si no hay ninguno, el panel lo dice y no se puede cobrar ni
  cerrar. Sin `rooms.read_guest_data` el saldo no es visible y el cierre **no** se bloquea: queda a
  cargo de quien tenga acceso a facturación. Requiere recargar el frontend.
- **Verificación:** backend `manage.py test` completo en verde (212 pruebas, 1 nueva). Frontend
  `npm run lint`, `npm run test:ci` (126 pruebas, 6 nuevas) y `npm run build:ci` en verde.

### 2026-08-10 — Se quita el panel de estado de la tarjeta de habitación

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** se eliminó el bloque `room-signal` de la tarjeta —la caja con ícono, título y
  frase del tipo *"Lista para vender · Tipo y tarifa configurados"* o *"Configuracion pendiente ·
  Asigna tipo y tarifa antes de reservar"*—. Se borraron sus seis métodos
  (`getCardSignalIcon/Title/Text/Class/Style` y `getCardSignalTone`) y sus estilos.
- **Por qué:** repetía lo que la tarjeta ya decía. El estado sale en el chip de la cabecera y en el
  color del borde superior; los pendientes concretos salen en los indicadores compactos de la
  Fase 3. El panel ocupaba una franja por tarjeta para no aportar información nueva, y en una
  cuadrícula de habitaciones esa franja se multiplica por cada unidad.
- **Qué NO se perdió:** el aviso de configuración incompleta sigue a nivel de página
  (`setup-hint`, *"N habitación(es) sin configuración completa"*), y el estado *Sin configurar*
  sigue teniendo su chip, su color y su filtro.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/list-rooms/`
  (`.ts`, `.html`, `.css`).
- **Impacto:** ninguno en backend ni en API. La tarjeta queda más corta, que ayuda a la densidad
  que buscaba la Fase 9. Requiere recargar el frontend.
- **Verificación:** frontend `npm run lint`, `npm run test:ci` (120 pruebas) y `npm run build:ci`
  en verde.

### 2026-08-10 — Cache-aside de lecturas y animaciones con GSAP en habitaciones

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / perf
- **Qué se hizo:** dos cosas independientes que pidió el usuario para `/habitaciones`.

  **1. Cache-aside (`frontend/src/app/services/resource-cache.ts`).**
  - `ResourceCache.get(key, loader, ttl, forceRefresh)` implementa el patrón clásico: el
    llamador consulta el caché; si falla, va al servidor y **el llamador** rellena la entrada.
    El caché no sabe cargar nada por su cuenta.
  - **Agrupa peticiones en vuelo**: si tres componentes piden lo mismo antes de que llegue la
    respuesta, se hace una sola petición. Abrir habitaciones disparaba los mismos catálogos desde
    el listado y desde el modal.
  - **Invalidación por prefijo**: `invalidate('rates')` tira también `rates:room_type=3`.
  - **TTL por naturaleza del dato**: catálogos (tipos, tarifas, amenidades, pisos) 5 minutos,
    porque solo cambian cuando alguien los edita; habitaciones 20 segundos, porque recepción no
    puede ver un estado viejo. El TTL es la red de seguridad, no el mecanismo principal: **las 17
    escrituras de `RoomService` invalidan lo que corresponde** en cuanto responden.
  - Un cambio de catálogo invalida además el listado, porque la tarjeta muestra el nombre del tipo
    y el precio de la tarifa.
  - El botón de actualizar usa `forceRefresh`, que salta el caché **y lo repuebla**, para no
    dejarlo desincronizado.

  **2. Animaciones con GSAP (`frontend/src/app/services/motion.ts`).**
  - `MotionService.reveal()` hace la entrada escalonada; `pulse()` resalta un valor que cambió.
  - **Un solo lugar respeta `prefers-reduced-motion`.** Si el sistema pide menos movimiento no se
    anima nada y los elementos quedan visibles — el riesgo real de saltarse una animación es dejar
    el contenido en `opacity: 0`, y hay una prueba para eso.
  - En el listado la entrada se dispara **cuando cambia el contenido** (carga, cambio de vista,
    cambio de filtro), nunca en cada tecla del buscador: animar mientras se escribe se siente como
    parpadeo, no como fluidez.
  - Corre con `runOutsideAngular`: GSAP anima con `requestAnimationFrame` y dentro de la zona
    dispararía una detección de cambios por frame.
  - `clearProps` al terminar, para no dejar transformaciones pegadas que peleen con el CSS.
- **Por qué:** la vista pedía cinco recursos cada vez que se entraba, aunque los catálogos no
  hubieran cambiado en horas. Y la carga aparecía de golpe, sin jerarquía visual.
- **Hueco de caché que hubo que cerrar:** las acciones rápidas y el check-in/check-out los ejecutan
  otros servicios (reservas, limpieza), así que el caché del listado no se enteraba y seguía
  sirviendo el estado anterior hasta que venciera el TTL. Se expuso
  `RoomService.invalidateRoomsCache()` y se llama tras cada acción. Hay una prueba que lo fija.
- **Archivos/áreas afectadas:** `frontend/package.json` (dependencia `gsap`),
  `frontend/src/app/services/resource-cache.ts` y `.spec.ts` (nuevos),
  `frontend/src/app/services/motion.ts` y `.spec.ts` (nuevos),
  `frontend/src/app/services/room.ts`,
  `frontend/src/app/modules/rooms/list-rooms/` (`.ts`, `.html`, `.spec.ts`).
- **Impacto:** sin cambios de backend. **Dependencia nueva: `gsap` ^3.15** — cubierta por su
  licencia estándar sin costo. Como `/habitaciones` es una ruta *lazy*, GSAP cae casi entero en su
  propio chunk: el bundle inicial pasó de 36.55 kB a 39.37 kB por encima del presupuesto (+2.8 kB);
  quien nunca abre habitaciones no la descarga.
- **Nota sobre el caché:** es **por pestaña y en memoria**; se pierde al recargar. No hay
  invalidación entre usuarios: si otro recepcionista cambia una habitación, este cliente puede ver
  el estado anterior hasta 20 segundos. Se eligió a conciencia frente a un caché persistente, que
  en una consola de recepción es más peligroso que útil.
- **Verificación:** frontend `npm run lint`, `npm run test:ci` (120 pruebas, 14 nuevas) y
  `npm run build:ci` en verde. Backend `manage.py test` completo en verde (211 pruebas), sin
  cambios.
- **Nota de proceso:** se corrió Prettier 3 sobre `room.ts` y metió ~90 líneas de comas finales que
  el resto del repositorio no usa. Se revirtió y se reaplicó el cambio a mano. **Prettier no está en
  `devDependencies` y su configuración en `package.json` no fija `trailingComma`**, así que
  ejecutarlo hoy reformatea archivos enteros. Conviene fijarlo antes de usarlo.

### 2026-08-10 — Fase 10: verificación obligatoria en check-in y check-out

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** hasta ahora el ingreso y la salida se ejecutaban **con un clic**, tanto desde la
  tarjeta como desde el modal de habitación. Un check-in de un clic deja entrar huéspedes sin
  contrastar documentos; un check-out de un clic cierra la estadía sin mirar saldo ni inventario.
  Se agregó un paso de verificación obligatorio.
  1. **Componente nuevo `modules/rooms/room-check-modal/`**, con dos modos.
  2. **Check-in — verificación de identidad.** Muestra la ficha de la reserva (titular, documento
     del titular, estadía, noches, número y estado) y **la lista de huéspedes que ingresan**, cada
     uno con su tipo y número de documento, nacionalidad y una casilla de verificado. El botón de
     confirmar **no se habilita** hasta marcar a todos. Si la reserva no tiene huéspedes
     registrados, se bloquea con instrucción explícita; si alguno no tiene documento, se avisa
     aparte y su fila se marca en ámbar.
  3. **Check-out — revisión de cierre.** Muestra saldo de la reserva, consumos sin facturar,
     inventario por debajo del mínimo (con el detalle de ítems y su cantidad vs. mínimo) y el aviso
     de que se creará la tarea de limpieza de salida. Si hay dinero pendiente, exige marcar una
     casilla haciéndose cargo de que quedó gestionado.
  4. **Las dos vías pasan por aquí.** Se conectó tanto en la acción rápida de la tarjeta como en la
     pestaña *Reserva* del modal de habitación. Si solo se hubiera cambiado la tarjeta, bastaría
     con abrir la habitación para saltarse el control.
  5. **Confirmar una reserva pendiente sigue siendo directo:** no mueve huéspedes ni dinero.
- **Por qué:** son los dos momentos donde recepción compromete al hotel. La verificación de
  documentos en el ingreso es además un requisito de registro de huéspedes, y el saldo olvidado en
  la salida es la pérdida más común y más difícil de recuperar.
- **Cambio menor de API:** `RoomInventoryViewSet` acepta `?room=<id>`. La revisión de salida
  necesita el inventario de una habitación y el endpoint solo sabía devolver el del hotel entero.
  Se resolvió con el mismo filtrado manual por query param que ya usa `RoomViewSet`.
- **Archivos/áreas afectadas:** `backend/apps/inventory/views.py`, `backend/apps/inventory/tests.py`,
  `frontend/src/app/services/room-inventory.ts`,
  `frontend/src/app/modules/rooms/room-check-modal/` (nuevo: `.ts`, `.html`, `.css`, `.spec.ts`),
  `frontend/src/app/modules/rooms/list-rooms/` (`.ts`, `.html`, `.spec.ts`),
  `frontend/src/app/modules/rooms/room-modal/` (`.ts`, `.html`).
- **Impacto:** sin migraciones ni recursos RBAC nuevos. El modal reutiliza
  `GET /api/reservations/<id>/`, que ya traía los huéspedes. Si el usuario no tiene
  `rooms.read_guest_data`, el check-out avisa que no puede ver el saldo en vez de mostrar cero, y no
  exige la casilla. Requiere recargar el frontend.
- **Verificación:** backend `manage.py test` completo en verde (211 pruebas, 3 nuevas). Frontend
  `npm run lint`, `npm run test:ci` (106 pruebas, 12 nuevas) y `npm run build:ci` en verde. Entre
  las pruebas nuevas hay tres que fijan que la acción rápida **ya no llama** a `checkInReservation`
  ni a `checkOutReservation` directamente.

### 2026-08-10 — Fase 8: consumos en la tarjeta y saldo consistente con el modal

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / fix
- **Qué se hizo:** octava fase del rediseño de `/habitaciones`. Al ir a mostrar los consumos
  aparecieron **dos defectos de las fases anteriores**, y esta entrada es sobre todo su corrección.
  1. **La tarjeta y el modal mostraban saldos distintos.** El modal usa
     `Reservation.pending_amount` (estadía + paquete + cargos − descuentos − abonos) y la tarjeta
     usaba el saldo de *facturación* (facturas emitidas sin pagar + cargos sin facturar). En la base
     local, la habitación 37 mostraba **$300.000 en la tarjeta y $150.000 en el modal**, y la 34
     mostraba $450.000 contra $0. Ahora `operations` expone **`reservation_pending`**, calculado con
     el mismo `apps.reservations.services.get_reservation_financials` que alimenta el modal, y la
     tarjeta usa ese. Los tres campos de facturación siguen en la respuesta, documentados como la
     mirada desde facturación.
  2. **`unbilled_charges` contaba las noches como consumos.** La consulta tomaba todos los cargos
     sin factura, incluidos los `is_automatic` —que son la estadía y el paquete—. El indicador
     habría dicho "Consumos $245.000" cuando el minibar eran $45.000. Se excluyen los automáticos,
     con el mismo criterio que `additional_charges_total`.
  3. **Indicador de consumos, ya sí.** La tarjeta separa dos chips: **saldo de la reserva** (rojo) y
     **`Consumos $45.000`** (ámbar). Son cosas distintas: el saldo es lo que debe; los consumos sin
     facturar son la sorpresa clásica del check-out, porque el huésped no los ha visto en ninguna
     factura. Una reserva puede estar saldada y aun así arrastrar consumos por cobrar.
  4. **Resumen y filtro.** La tarjeta *Con saldo* pasó a llamarse **Por cobrar**, su nota separa
     `$X de saldo · $Y en consumos`, y el filtro incluye las habitaciones que solo tienen consumos
     sin facturar.
  5. **Eficiencia.** `get_reservation_financials` respeta el caché de prefetch, así que se
     precargan `rooms_detail`, `charges` e `invoices→payments→refunds` en la consulta de reservas
     activas. El listado pasó de 13 a 21 consultas para 36 habitaciones: sigue siendo constante.
- **Por qué:** antes de un check-out, recepción necesita ver lo que falta cobrar y, sobre todo, lo
  que todavía no se ha facturado. Y dos cifras distintas para la misma habitación erosionan la
  confianza en la pantalla más rápido que no mostrar nada.
- **Archivos/áreas afectadas:** `backend/apps/rooms/operations.py`,
  `backend/apps/rooms/serializers.py`, `backend/apps/rooms/tests.py`,
  `frontend/src/app/modules/rooms/room-model.ts`,
  `frontend/src/app/modules/rooms/list-rooms/` (`.ts`, `.spec.ts`).
- **Impacto:** sin migraciones. `GET /api/rooms/` gana `operations.reservation_pending` (aditivo, y
  sujeto a `rooms.read_guest_data`). **Cambio de significado:** `operations.unbilled_charges` ya no
  incluye cargos automáticos; si algún cliente lo usaba como "total sin facturar", ahora devuelve
  menos. Requiere recargar el frontend.
- **Verificación:** backend `manage.py test` completo en verde (208 pruebas, 2 nuevas, incluida una
  que amarra el saldo de la tarjeta al de la reserva para que no vuelvan a divergir). Frontend
  `npm run lint`, `npm run test:ci` (94 pruebas, 2 nuevas) y `npm run build:ci` en verde.
  
### 2026-08-10 — Scope propio para los datos del huésped (`rooms.read_guest_data`)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** security
- **Qué se hizo:** las Fases 2 y 6 pusieron el **saldo por cobrar** y el **documento del huésped**
  dentro de `/api/rooms/`, o sea al alcance de cualquier rol con `rooms.read` —incluido uno de
  limpieza que solo debería ver el estado de la habitación—. Se separaron detrás de un recurso
  propio.
  1. **Recurso nuevo `rooms.read_guest_data`.** Sin él, `/api/rooms/` devuelve
     `active_reservation.client_document` y los tres montos de `operations` en **`null`**.
     Se eligió `null` y no `"0.00"` a propósito: cero significa "no debe nada", que es una
     afirmación distinta a "no te corresponde saberlo".
  2. **También en el modal.** `RoomPanelSerializer` aplica el mismo criterio a
     `client.document_number`; si no, bastaba con abrir la habitación para esquivar la restricción.
  3. **Helper reutilizable.** `accounts.permissions.user_has_scopes(user, scopes)` permite decidir
     dentro de un serializer sin duplicar la normalización de separadores ni los comodines del
     motor RBAC. Es la primera vez que se consulta un scope fuera de `HasResourcePermission`.
  4. **`seed_rbac`.** Se agregó la lista `EXTRA_PERMISSIONS` para permisos finos que no son un
     dominio completo, y el recurso se asigna a `admin`, `manager` y `staff` —los tres roles que
     operan recepción—, así que **ningún rol base pierde nada**. La capacidad de retirarlo queda
     disponible para roles nuevos.
  5. **Frontend.** `hasResourceScope()` en `services/auth/auth.ts` replica el motor del backend
     para *no pintar* controles que no traerían datos: sin el scope desaparecen el filtro
     *Con saldo* y su tarjeta del resumen, y el indicador de saldo no se dibuja. **No es un control
     de acceso** —ese lo hace el backend—, es evitar mostrar un cero engañoso.
- **Por qué:** es información personal y financiera del huésped. Que viajara con `rooms.read` fue
  un efecto lateral de las fases anteriores, no una decisión.
- **Corrección incluida:** `user_has_scopes` consultaba `user.resource_keys()` una vez por
  habitación y por campo, reintroduciendo el N+1 que `build_room_operations_map` evita. La prueba
  `test_signals_are_resolved_in_bulk` lo detectó (40 consultas contra un límite de 40) y se
  memorizó la decisión en el contexto del serializer, que es el mismo para toda la petición.
- **Corrección de la bitácora:** la sección 5.3 afirmaba que `users_read` ≡ `users-read` ≡
  `users.read`. Es falso: `HasResourcePermission._scope_variants` intercambia guion y guion bajo,
  pero **no el punto**. Verificado ejecutando el motor. La sección quedó corregida.
- **Archivos/áreas afectadas:** `backend/accounts/permissions.py`,
  `backend/accounts/management/commands/seed_rbac.py`, `backend/apps/rooms/serializers.py`,
  `backend/apps/rooms/tests.py`, `frontend/src/app/services/auth/auth.ts`,
  `frontend/src/app/modules/rooms/room-model.ts`,
  `frontend/src/app/modules/rooms/list-rooms/` (`.ts`, `.html`, `.spec.ts`), `AGENTS.md`.
- **Impacto:** **hay que correr `python manage.py seed_rbac`** para crear el recurso y asignarlo.
  Sin eso, los roles existentes dejan de ver saldo y documento en el tablero (el resto sigue igual).
  Sin migraciones. Cambio de contrato de API: los tres montos de `operations` y
  `client_document` pasan a ser anulables.
- **Verificación:** backend `manage.py test` completo en verde (206 pruebas, 3 nuevas). Frontend
  `npm run lint`, `npm run test:ci` (92 pruebas, 4 nuevas) y `npm run build:ci` en verde. Se aplicó
  `seed_rbac` a la base local: 116 recursos, `admin` 104 / `manager` 67 / `staff` 39.

### 2026-08-10 — `seed_rbac` completo y reproducible (deuda técnica 9)

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix / refactor
- **Qué se hizo:** se reescribió `backend/accounts/management/commands/seed_rbac.py` para que sea la
  fuente única del RBAC:
  1. **Cobertura completa.** La lista `DOMAINS` declara los 33 dominios de la API y de cada uno
     deriva sus recursos `.read`, `.write` y `.read_deleted`. Los 66 scopes que los ViewSets exigen
     hoy quedan sembrados (antes se sembraban 22 recursos en total).
  2. **Menú explícito.** La lista `MENU` define el árbol del aside completo, con las 25 rutas del
     hotel más las 4 del panel SaaS. Se agregó el recurso faltante `saas_demo_requests.read`, sin el
     cual `/saas-solicitudes-demo` no aparecía en el menú de nadie. Se eliminaron los desplegables
     de un solo hijo (`clientes-huespedes`, `services`) promoviendo su hijo a primer nivel, y
     Usuarios / Roles / Recursos / Master Data pasaron a colgar del grupo "Seguridad" que ya existía.
  3. **Rol nuevo `platform_admin`.** El menú SaaS salió del rol `admin` y quedó en un rol propio. El
     rol `admin` es el que `convert_request()` asigna al primer usuario de un hotel; darle entradas
     SaaS le mostraba un menú que `platformAdminOnly` después le negaba con un 403. `seed_rbac`
     asigna `platform_admin` a los superusuarios **sin** hotel, que son los administradores de
     plataforma (ver 5.4).
  4. **Roles base con sentido.** `admin` = toda la operación del hotel (103 recursos);
     `manager` = operación sin administración de usuarios ni RBAC (66); `staff` = recepción, con
     reservas, huéspedes, habitaciones, limpieza y cobros (38, antes 4).
  5. **Limpieza de claves heredadas.** `LEGACY_KEYS` desactiva (no borra) `resources.debug`, la
     clave malformada `maintenance_orders.read"]`, `amenities.view`, `hotel-config.read` /
     `hotel-config.write` (el scope real del ViewSet es `hotel_settings.*`), y los grupos vaciados
     `clientes-huespedes`, `services` y `rooms.view`.
  6. **Prueba de regresión.** `accounts.tests.SeedRbacCoverageTests` recorre el resolver de URLs,
     interroga a cada vista por sus `required_scopes` en los cinco métodos HTTP y falla si algún
     scope no está sembrado o si el rol `admin` no lo cubre. También verifica que un usuario nuevo
     con rol `admin` vea las 24 rutas de hotel y ninguna del panel SaaS.
- **Por qué:** era la deuda técnica 9 y el bloqueante más grave del onboarding. `seed_rbac` sembraba
  22 de los ~60 recursos que el código exige y el rol `admin` tampoco los tenía, así que un hotel
  recién convertido desde una solicitud de demo no podía abrir `/habitaciones` ni el resto de los
  módulos: `permissionChildGuard` solo autoriza rutas presentes en el menú del usuario. El estado
  funcional dependía de una base de datos parcheada a mano con `backend/add_missing_permissions.py` y
  `backend/assign_missing_permissions_to_roles.py`, es decir, no era reproducible desde el código.
- **Archivos/áreas afectadas:** `backend/accounts/management/commands/seed_rbac.py`,
  `backend/accounts/tests.py`, `AGENTS.md`.
- **Impacto:**
  - **Hay que correr `python manage.py seed_rbac`** en cada entorno. El comando es idempotente.
  - **Reescribe los recursos de los roles base** `admin`, `manager`, `staff` y `platform_admin`.
    Los roles creados a mano por un hotel no se tocan. Con `--only-resources` se actualizan recursos
    y menú sin tocar roles.
  - Los superusuarios que ya existían necesitan `seed_rbac --assign-admin` para recibir
    `platform_admin` y no perder el menú SaaS.
  - `amenities.write` **no** se asigna a ningún rol, según 5.14.
  - Sin migraciones ni cambios de API. Los scripts sueltos `backend/add_missing_permissions.py` y
    `backend/assign_missing_permissions_to_roles.py` quedan obsoletos (deuda técnica 4).
- **Verificación:** `manage.py test` completo en verde (197 pruebas, 5 nuevas). Se aplicó el seed a
  la base local dejando backup en `backend/db.before-seed-rbac.*.sqlite3`.

### 2026-08-10 — Orden de la bitácora y artefactos locales ignorados

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs / chore
- **Qué se hizo:** 13 entradas del registro de cambios habían quedado pegadas **después** de la
  sección 13 ("Deuda técnica"), fuera de la sección 12 y sin separadores, rompiendo el orden
  cronológico inverso del documento. Se movieron a la sección 12, ordenadas de más reciente a más
  antigua, y la sección 13 vuelve a cerrar el archivo. Se verificó que las 88 entradas y todas las
  líneas de contenido siguen presentes. Además se agregaron `backend/*.err`, `frontend/*.log` y
  `frontend/*.err` al `.gitignore`.
- **Por qué:** el documento se lee de arriba hacia abajo como historial; con las entradas al final,
  después de la deuda técnica, el orden dejaba de significar nada. Los archivos `*.err` / `*.log` que
  generan los servidores de desarrollo aparecían como archivos sin trackear listos para commitear.
- **Archivos/áreas afectadas:** `AGENTS.md`, `.gitignore`.
- **Impacto:** ninguno sobre el código.
- **Nota:** las 13 entradas movidas se colocaron debajo de "Refresco de limpieza tras checkout y
  header por estado" porque esa entrada refina el comportamiento que introducen. El orden relativo
  exacto entre ellas y las entradas del wizard de reservas es una reconstrucción: se escribieron por
  *append* al final del archivo y no hay marca de tiempo más fina que la fecha.

---

### 2026-08-10 — Refresco de limpieza tras checkout y header por estado

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el modal de habitación ahora refresca la habitación, el panel y las listas de
  limpieza/mantenimiento/inventario después de ejecutar acciones de reserva; tras un check-out abre
  automáticamente la pestaña de limpieza y mantenimiento para mostrar la tarea creada. Además, el
  header del modal cambia de color según el estado operativo de la habitación.
- **Por qué:** las tareas de limpieza creadas por check-out no se veían hasta recargar la página, y
  el usuario necesitaba reconocer el estado de la habitación de forma inmediata al abrir el modal.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Pestañas limpias en modal alto de habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la barra de pestañas del modal de habitacion ahora oculta el scrollbar horizontal y evita que el scroll del contenido degrade la apariencia de los tabs cuando el modal tiene mucho contenido.
- **Por que:** en habitaciones con listas largas, la pestaña de Limpieza y mantenimiento mostraba un scrollbar junto a los tabs y los botones se veian desprolijos.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.
### 2026-08-10 - Consumos y cargos desde la reserva de habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** funcional
- **Que se hizo:** la pestaña Reserva del modal de habitacion ahora muestra los consumos/cargos asociados a la reserva activa y permite agregar productos de recepcion o cargos manuales. Los productos de recepcion usan el endpoint POS existente para crear el cargo en la reserva y descontar inventario; los cargos manuales crean un `Charge` directo. En ambos casos se puede marcar `Cobrar ahora` para registrar un pago inmediato contra la factura activa, o dejar el cargo pendiente para checkout.
- **Por que:** las compras en recepcion, consumos y cargos extra de habitacion deben quedar relacionados con la reserva para poder cobrarlos o auditarlos sin salir del flujo de gestion de la habitacion.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/billing/pos-bar/pos-bar.ts`, `frontend/src/styles.css`.
- **Impacto:** cambio frontend sin migraciones; reutiliza `/api/charges/pos-batch/`, `/api/charges/`, `/api/invoices/` y `/api/payments/`.
### 2026-08-10 - Ticket multiple para productos de recepcion en reserva

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** el modal de `Agregar consumo` ahora maneja productos de recepcion como un ticket de varias lineas: se pueden seleccionar varios productos, cambiar la cantidad por producto y calcular el total usando el `sale_price` ya definido en inventario. La descripcion, cantidad general y valor unitario quedaron solo para `Cargo manual`; se elimino el campo de notas del flujo.
- **Por que:** vender productos de recepcion debe ser rapido y parecido a una caja/POS; pedir descripcion, precio y notas por producto duplicaba informacion y hacia el flujo mas lento.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/styles.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Separacion visual de botones de operaciones

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** los botones de nueva limpieza/nuevo mantenimiento y ver modulo se separaron en una barra de acciones propia dentro de cada panel de operaciones.
- **Por que:** los botones estaban pegados al titulo y entre si, especialmente en mantenimiento, haciendo que el encabezado se viera apretado.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Formularios de operaciones en submodales

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** los formularios de nueva limpieza y nuevo mantenimiento dejaron de mostrarse siempre abiertos en la pestana del modal de habitacion; ahora cada seccion tiene su boton de creacion y abre un submodal dedicado.
- **Por que:** los formularios permanentes cargaban visualmente la pestana y ocupaban espacio innecesario cuando el usuario solo queria revisar tareas u ordenes existentes.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Rediseño compacto de operaciones de habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la pestana Limpieza y mantenimiento del modal de habitacion se reorganizo con una franja superior de creacion rapida y un historial separado para limpiezas y mantenimientos, reduciendo el peso visual de los formularios.
- **Por que:** el diseno anterior se veia cargado y poco elegante porque mezclaba dos formularios grandes con listas dentro de columnas pesadas.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Creacion rapida de limpieza y mantenimiento desde habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la pestana Limpieza y mantenimiento del modal de habitacion ahora permite crear tareas de limpieza y ordenes de mantenimiento directamente desde la habitacion, usando los catalogos de master data existentes y refrescando la informacion del modal/panel tras cada alta.
- **Por que:** limpieza y mantenimiento no ocurren solo por check-out; recepcion y operacion necesitan registrar solicitudes puntuales sin cambiar de vista.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Contador de tiempo restante para check-out

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** las habitaciones con reserva activa ahora muestran un contador de tiempo restante para la salida tanto en el card del panel como en la pestaña Reserva del modal. El backend expone la hora estándar de check-out del hotel en `active_reservation.expected_check_out_time`, y el frontend actualiza el contador cada minuto.
- **Por qué:** recepción necesita identificar rápidamente cuándo una salida está próxima a vencer para avisar al huésped sin abrir otras vistas.
- **Archivos/áreas afectadas:** `backend/apps/rooms/serializers.py`, `frontend/src/app/modules/rooms/room-model.ts`, `frontend/src/app/modules/rooms/list-rooms/`, `frontend/src/app/modules/rooms/room-modal/`.
- **Impacto:** cambio compatible de API; no requiere migraciones.

### 2026-08-10 — Ficha compacta para reserva activa en modal de habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** la pestaña Reserva del modal de habitación se rediseñó como una ficha única con cabecera del huésped, estado en chip, contacto en etiquetas, estadía con dos puntos conectados y acciones en footer.
- **Por qué:** la versión anterior seguía viéndose fragmentada y rara por tener el estado y las fechas en cajas separadas sin una jerarquía clara.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Cambio de tipo desde la pestaña Tipo y tarifa

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** la pestaña Tipo y tarifa del modal de habitación ahora muestra los tipos como tarjetas seleccionables y permite cambiar el tipo de habitación desde esa misma pestaña; guardar selección persiste tipo y tarifa juntos.
- **Por qué:** el bloque anterior era solo informativo y obligaba a volver a General para cambiar el tipo, rompiendo el flujo natural de configuración.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Colores de tarjeta de habitación por estado

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** los cards de habitaciones ahora colorean tanto el borde superior como el chip de estado desde clases CSS por estado visual, diferenciando disponible, reservada, ocupada, por salir hoy, limpieza, mantenimiento, sin configurar y fuera de servicio.
- **Por qué:** el color del borde y el fondo del estado no comunicaban claramente el estado operativo de la habitación.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.css`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Rediseño de la pestaña Reserva del modal de habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** la pestaña Reserva del modal de habitación se reorganizó con un bloque principal para el huésped, estado destacado, tarjetas de entrada/salida y acciones separadas visualmente.
- **Por qué:** la presentación anterior era una grilla plana y se veía desbalanceada dentro del modal.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Pestaña inicial inteligente en modal de habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Qué se hizo:** el modal de habitación ahora abre por defecto en la pestaña Reserva cuando la habitación ya tiene tipo y tarifa configurados; si falta configuración, abre en Tipo y tarifa.
- **Por qué:** una vez configurada la habitación, el flujo más frecuente del usuario es crear reserva, hacer check-in o revisar la reserva activa.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Estado visual de habitación basado en reserva activa

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** la vista de habitaciones y el header del modal ahora calculan el estado visible usando la reserva activa: reservas pendientes/confirmadas se muestran como reservadas, reservas en curso como ocupadas y salidas de hoy como por salir hoy.
- **Por qué:** una habitación con reserva vigente podía seguir apareciendo como disponible porque la UI leía solo `room.status` e ignoraba `active_reservation`.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.ts`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Refresco puntual de habitación tras acciones del modal

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** al recibir cambios desde el modal de habitación, la vista principal ahora consulta de nuevo la habitación por id y reemplaza la tarjeta con la versión fresca del servidor, descartando overrides locales antiguos.
- **Por qué:** después de hacer check-out el estado real de la habitación cambiaba en backend, pero la tarjeta del panel seguía mostrando el estado anterior hasta recargar la página.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`.
- **Impacto:** ninguno; cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 — Copia de base local desde el repo anterior

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** chore
- **Qué se hizo:** se copió `gestion_hotelera/backend/db.sqlite3` sobre
  `wayra-gh/backend/db.sqlite3`, dejando un backup previo de la base nueva, se aplicaron migraciones
  pendientes y se restauró el usuario `admin` como superadmin con contraseña de prueba.
- **Por qué:** los hoteles y datos de prueba estaban en la base local del repo anterior y el repo
  nuevo tenía una base vacía.
- **Archivos/áreas afectadas:** `backend/db.sqlite3` local no versionado.
- **Impacto:** entorno local solamente; backup creado como `backend/db.before-old-copy.*.sqlite3`.

### 2026-08-10 — Proxy local para aislar repo nuevo

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se agregó `frontend/proxy.4201.conf.json` para correr el frontend del repo nuevo
  en `4201` contra un backend del mismo repo en `8001`, sin depender del puerto `8000`.
- **Por qué:** el puerto `8000` tenía procesos activos del repo viejo y del repo nuevo mezclados,
  provocando que el navegador siguiera recibiendo respuestas CSRF antiguas aunque el código ya
  confiara en `localhost:4201`.
- **Archivos/áreas afectadas:** `frontend/proxy.4201.conf.json`.
- **Impacto:** entorno local solamente; para esta sesión usar frontend `4201` y backend `8001`.

### 2026-08-10 — CSRF local para frontend alterno en 4201

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se agregaron `http://localhost:4201` y `http://127.0.0.1:4201` a los orígenes
  locales permitidos por CORS y CSRF cuando `DEBUG=True`.
- **Por qué:** al correr el repo nuevo en `4201` porque `4200` estaba ocupado por una instancia del
  repo viejo, Django rechazaba las peticiones mutantes del wizard de reservas con `CSRF Failed:
  Origin checking failed`.
- **Archivos/áreas afectadas:** `backend/backend/settings.py`.
- **Impacto:** requiere reiniciar el backend local; no afecta producción porque solo aplica al
  valor por defecto de desarrollo con `DEBUG=True`.

### 2026-08-10 — Separación visual de huéspedes en reserva

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se rediseñó el bloque repetible de huéspedes del wizard de reservas para mostrar
  cada huésped como una tarjeta independiente con cabecera, número de huésped, nombre resumido y
  acción de eliminar integrada.
- **Por qué:** cuando había más de un huésped, el borde y el espaciado anterior no dejaban claro
  dónde terminaba un huésped y empezaba el siguiente.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/`.
- **Impacto:** ninguno; cambio visual sin cambios de API ni migraciones.

### 2026-08-10 — Países compartidos desde el helper de ubicación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** se reutilizó `loadHotelCountries()` de `shared/hotel-location-options.ts`, el
  mismo helper usado por la solicitud de demo, para alimentar los selectores de país/nacionalidad en
  reservas, clientes, edición de clientes y creación de hotel desde usuarios; la configuración del
  hotel ya usaba ese mismo helper y se preservó.
- **Por qué:** el sistema ya tenía un método único basado en `country-state-city`; reutilizarlo evita
  retrabajo y listas parciales por pantalla.
- **Archivos/áreas afectadas:** `frontend/src/app/shared/hotel-location-options.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`,
  `frontend/src/app/modules/clients/create-client/create-client.ts`,
  `frontend/src/app/modules/clients/create-client/create-client.html`,
  `frontend/src/app/modules/clients/update-client/update-client.ts`,
  `frontend/src/app/modules/clients/update-client/update-client.html`,
  `frontend/src/app/modules/users/register/register.ts`,
  `frontend/src/app/modules/users/register/register.html`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Limpieza de sugerencias tras seleccionar huésped

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** al seleccionar una coincidencia de cliente o huésped histórico en el paso de
  huéspedes, la lista de sugerencias se oculta inmediatamente y se conserva solo el mensaje de datos
  completados.
- **Por qué:** dejar las opciones visibles después de elegir una coincidencia generaba ruido visual
  y hacía parecer que aún había una acción pendiente.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Selector de nacionalidad para huéspedes

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el campo de nacionalidad del paso de huéspedes en el wizard de reservas dejó de
  ser texto libre y ahora usa un selector alimentado con países ya presentes en clientes y en las
  líneas de huéspedes, manteniendo `Colombia` como opción base; el autocompletado desde cliente
  también copia el país hacia la nacionalidad del huésped.
- **Por qué:** la nacionalidad debe seleccionarse de valores conocidos para evitar capturas
  inconsistentes y aprovechar datos ya usados por el sistema.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Selector para grupo sanguíneo de huéspedes

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el campo de grupo sanguíneo del paso de huéspedes en el wizard de reservas dejó
  de ser texto libre y ahora usa un selector con opciones estándar (`O+`, `O-`, `A+`, `A-`, `B+`,
  `B-`, `AB+`, `AB-`).
- **Por qué:** el grupo sanguíneo es un conjunto cerrado de valores y un input permitía capturas
  inconsistentes.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Búsqueda en vivo de huéspedes por documento

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el campo documento del paso de huéspedes ahora busca mientras el usuario escribe,
  muestra estado de búsqueda y lista coincidencias de clientes y huéspedes históricos para
  seleccionarlas sin salir del input; Enter mantiene la aplicación automática cuando hay coincidencia
  exacta.
- **Por qué:** la búsqueda solo se ejecutaba al perder foco, lo que hacía lento y poco claro el
  autocompletado de datos ya guardados.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.css`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Autocompletado de huéspedes por documento

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** en el paso de huéspedes del wizard de reservas, al salir del campo documento o
  presionar Enter se busca primero en clientes cargados y luego en huéspedes históricos por número
  de documento; si existe coincidencia, se completan tipo de documento, nombres, apellidos y datos
  complementarios disponibles.
- **Por qué:** el documento identifica de forma única al cliente/huésped y permite ahorrar captura
  manual repetida durante reservas y check-in.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.css`,
  `frontend/src/app/services/reservation.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Wizard guiado para crear reservas

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** el formulario de creación de reservas ahora funciona como un asistente por pasos:
  datos base, habitación, huéspedes y cierre con abono/políticas; cada avance valida solo el bloque
  correspondiente y el guardado final mantiene la validación completa existente.
- **Por qué:** el formulario completo en una sola pantalla era extenso y podía confundir durante la
  creación de reservas o check-in directo desde una habitación.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/reservations/create-reservation/create-reservation.ts`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.html`,
  `frontend/src/app/modules/reservations/create-reservation/create-reservation.css`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Crear reserva desde el modal de habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** la pestaña `Reserva` del modal de habitación ahora abre el formulario de creación
  de reserva dentro del mismo flujo, precargando la habitación seleccionada; `Check-In directo`
  abre el mismo formulario en modo de check-in con fechas desde hoy.
- **Por qué:** gestionar una habitación no debe obligar al usuario a salir hacia la vista general
  de reservas para crear una reserva o iniciar un ingreso.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`,
  `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Estado visual para habitaciones sin configurar

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** la vista de habitaciones ahora muestra `Sin configurar` cuando una habitación no
  tiene tipo o tarifa asignada; esas habitaciones ya no cuentan como `Disponibles` en tarjetas,
  filtros ni conteos visuales.
- **Por qué:** una habitación incompleta no debe verse lista para reservarse aunque su estado
  operativo base sea `DISPONIBLE`.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`,
  `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`,
  `frontend/src/app/modules/rooms/list-rooms/list-rooms.css`,
  `frontend/src/app/modules/rooms/room-model.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend para tomar el bundle nuevo; no requiere migración.

---

### 2026-08-10 — Eliminación de falso error al guardar tarifa

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el modal de habitación dejó de mostrar error cuando el `PATCH` guarda correctamente pero la respuesta no trae la tarifa con el formato esperado; ahora actualiza el estado local con la tarifa elegida y sus datos del catálogo.
- **Por qué:** la base de datos sí persistía la tarifa, pero el frontend mostraba "La tarifa no fue confirmada" por una validación de respuesta demasiado estricta.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar/reiniciar el frontend para tomar el bundle nuevo.

---

### 2026-08-10 — Verificación por lectura fresca tras guardar tarifa

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** después de guardar la tarifa de una habitación, el frontend consulta de nuevo la habitación por ID y confirma contra esa lectura fresca.
- **Por qué:** algunas respuestas de `PATCH` pueden no incluir todos los campos esperados; confirmar contra `GET /api/rooms/<id>/` evita falsos errores cuando el guardado sí persistió.
- **Archivos/áreas afectadas:** `frontend/src/app/services/room.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend; mantiene el backend existente con `PATCH /api/rooms/<id>/`.

---

### 2026-08-10 — Confirmación real de tarifa persistida

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el modal ahora exige que la respuesta del servidor confirme la tarifa guardada antes de mostrar éxito, y el panel principal usa `rate_price` del listado cuando está disponible.
- **Por qué:** se estaba mostrando una selección optimista aunque el backend no hubiera persistido realmente el cambio, lo que hacía que al refrescar la página la tarifa desapareciera.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `backend/apps/rooms/tests.py`, `AGENTS.md`.
- **Impacto:** si el backend corre una versión vieja del serializer, el modal mostrará error en vez de falso éxito; requiere reiniciar backend y recargar frontend.

---

### 2026-08-10 — Guardado de tarifa por PATCH existente

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el frontend dejó de depender de la acción nueva `/api/rooms/<id>/rate/` y ahora guarda la tarifa con `PATCH /api/rooms/<id>/` enviando solo `{ rate }`.
- **Por qué:** en desarrollo el backend puede seguir corriendo sin la ruta nueva y responder 404, mientras que el endpoint de actualización parcial ya existe y soporta actualizar un campo.
- **Archivos/áreas afectadas:** `frontend/src/app/services/room.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend; no requiere una ruta backend nueva para guardar la tarifa.

---

### 2026-08-10 — Guardado explícito de tarifa por habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se agregó la acción `POST /api/rooms/<id>/rate/` para persistir únicamente la tarifa seleccionada de una habitación y se eliminó del panel el fallback que tomaba la última tarifa activa del tipo.
- **Por qué:** la tarifa de una habitación debe ser una asignación explícita y persistida, no un cálculo implícito basado en el tipo de habitación.
- **Archivos/áreas afectadas:** `backend/apps/rooms/views.py`, `backend/apps/rooms/tests.py`, `frontend/src/app/services/room.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `AGENTS.md`.
- **Impacto:** requiere reiniciar backend y recargar frontend; las habitaciones sin tarifa asignada mostrarán `-- / noche` aunque su tipo tenga tarifas.

---

### 2026-08-10 — Reflejo inmediato de tarifa en panel de habitaciones

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** el modal de habitación ahora emite la habitación actualizada al guardar y el listado principal actualiza la tarjeta inmediatamente, conservando la última versión local durante el refresco.
- **Por qué:** la tarifa seleccionada podía guardarse en el modal pero la tarjeta del panel seguía mostrando el precio anterior hasta un recargue completo o podía ser pisada por una respuesta incompleta.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`, `AGENTS.md`.
- **Impacto:** requiere recompilar/recargar el frontend.

---

### 2026-08-10 — Persistencia visual de tarifa seleccionada

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** se ajustó el modal de habitación para re-sincronizar la tarifa seleccionada cuando la habitación se refresca desde el listado y para conservar el valor enviado si la respuesta del API llega parcial.
- **Por qué:** al guardar una tarifa en la pestaña "Tipo y tarifa", la selección podía desaparecer visualmente aunque el guardado terminara correctamente.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `AGENTS.md`.
- **Impacto:** requiere recargar el frontend; si el backend está corriendo con `--noreload`, también conviene reiniciarlo para asegurar que el campo `rate` esté activo en la API.

---

### 2026-08-10 — Selección de tarifa por habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat
- **Qué se hizo:** se agregó una tarifa seleccionable directamente en cada habitación, con listado de tarifas activas filtradas por el tipo de habitación en el modal de habitaciones.
- **Por qué:** una habitación debe tener una sola tarifa activa elegida explícitamente, en vez de heredar automáticamente la tarifa más reciente del tipo.
- **Archivos/áreas afectadas:** `backend/apps/rooms/models.py`, `backend/apps/rooms/serializers.py`, `backend/apps/rooms/views.py`, `backend/apps/rooms/migrations/0012_room_rate.py`, `backend/apps/rooms/tests.py`, `frontend/src/app/modules/rooms/room-modal/*`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/room-model.ts`, `frontend/src/app/services/room.ts`.
- **Impacto:** requiere migración `rooms.0012_room_rate`; la migración asigna a habitaciones existentes la tarifa activa más reciente de su tipo cuando exista.

---

### 2026-08-10 — Header oscuro profesional en modal de habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** se rediseñó el header del modal de habitación con fondo `#111827`, icono de
  habitación, título en alto contraste, subtítulo suavizado, chip de estado integrado y botón de
  cierre translúcido. Las pestañas inferiores se separaron visualmente para mantener una lectura
  limpia.
- **Por qué:** el encabezado anterior se veía plano frente al resto del modal; el nuevo tratamiento
  da más jerarquía, presencia y acabado profesional.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`,
  `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** sin migraciones ni cambios de API.

---

### 2026-08-10 — Mejora visual de selección de amenidades por habitación

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** refactor
- **Qué se hizo:** se rediseñaron los controles de amenidades dentro del modal de habitación: las
  opciones ahora se muestran como tarjetas seleccionables con icono, descripción, estado activo y
  feedback visual de selección. También se actualizó el mensaje vacío para apuntar al catálogo global
  de SaaS Admin.
- **Por qué:** los controles anteriores parecían botones simples de formulario y no comunicaban bien
  qué amenidades estaban activadas para la habitación.
- **Archivos/áreas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.html`,
  `frontend/src/app/modules/rooms/room-modal/room-modal.css`.
- **Impacto:** sin migraciones ni cambios de API.

---

### 2026-08-10 — Amenidades globales administradas por SaaS

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Qué se hizo:** `Amenity` dejó de pertenecer a cada hotel y pasó a ser un catálogo global. La
  migración `rooms/0011_global_amenities.py` deduplica amenidades existentes por nombre, repunta las
  habitaciones al registro global y elimina la FK `hotel_settings`. La pantalla `/habitaciones`
  conserva solo la asignación de amenidades por habitación, y la administración del catálogo se movió
  a `/saas-amenidades`, dentro del panel SaaS. El backend permite lectura global de amenidades a los
  hoteles, pero restringe crear/editar/eliminar/restaurar al administrador de plataforma.
- **Por qué:** evitar que cada hotel tenga que crear el mismo catálogo de amenidades una por una,
  reducir duplicación de filas por tenant y simplificar la operación: cada habitación solo activa o
  desactiva amenidades del catálogo compartido.
- **Archivos/áreas afectadas:** `backend/apps/rooms/models.py`, `backend/apps/rooms/serializers.py`,
  `backend/apps/rooms/views.py`, `backend/apps/rooms/migrations/0011_global_amenities.py`,
  `backend/apps/rooms/tests.py`, `backend/accounts/migrations/0021_saas_global_amenities_menu.py`,
  `backend/accounts/management/commands/seed_rbac.py`,
  `frontend/src/app/app.routes.ts`, `frontend/src/app/modules/rooms/`,
  `frontend/src/app/modules/saas/list-global-amenities/`.
- **Impacto:** requiere `python manage.py migrate rooms accounts`. Cambio de datos: amenidades con
  el mismo nombre quedan consolidadas en una sola fila global. Se agrega la entrada de menú
  `/saas-amenidades` bajo SaaS Admin. `amenities.write` ya no debe asignarse a roles de hotel; el
  endpoint lo bloquea igualmente si el usuario no es administrador de plataforma.

---

### 2026-08-10 — Corrección de creación de catálogos con hotel seleccionado

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Qué se hizo:** `TenantSerializerMixin` ahora, para administradores globales, usa el
  `hotel_settings` recibido por query param cuando el cuerpo de una petición de escritura no trae el
  hotel explícitamente. Se agregó una prueba que crea una amenidad como admin global con
  `?hotel_settings=<id>`.
- **Por qué:** el frontend inyecta el hotel seleccionado en la URL mediante
  `hotel-context.interceptor.ts`; al crear amenidades desde el modal, el backend ignoraba ese query
  param y devolvía `400` con "Este registro debe pertenecer a un hotel."
- **Archivos/áreas afectadas:** `backend/accounts/tenancy.py`, `backend/apps/rooms/tests.py`.
- **Impacto:** sin migraciones ni cambios de API. Corrige también otros serializers que usan
  `TenantSerializerMixin` y permiten seleccionar hotel desde el contexto global.

---

### 2026-08-10 — Consolidación del módulo Habitaciones en una sola vista

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** feat / refactor
- **Qué se hizo:** las cuatro vistas del módulo (Ver habitaciones, Tipos de habitación, Tarifas,
  Amenidades) se consolidaron en una sola pantalla `/habitaciones`.
  1. **Tres modales gestores** (`modules/rooms/managers/`): `amenities-manager`,
     `room-types-manager` y `rates-manager`, con CRUD completo, activar/desactivar, eliminar y
     restaurar. Se abren desde los botones del encabezado. El gestor de tipos puede saltar al de
     tarifas ya filtrado por ese tipo.
  2. **`room-modal`**: modal con seis pestañas que reemplaza a `room-detail` y `update-room`.
     *General* (número, piso, tipo, estado, notas) y *Amenidades* son editables y guardan con
     `PATCH /api/rooms/:id/`. *Tipo y tarifa* muestra la configuración vigente y abre los gestores.
     *Reserva* concentra huésped, fechas y las acciones de confirmar / check-in / check-out /
     marcar disponible. *Limpieza y mantenimiento* e *Inventario* listan los registros de esa
     habitación con acciones rápidas (completar tarea u orden, ajustar cantidad ±1).
  3. **Vista `/habitaciones` rehecha**: tarjetas agrupadas por piso con contador y rango, aviso
     cuando el hotel no tiene pisos, y aviso de habitaciones sin tipo asignado.
  4. **Estilos**: se agregó a `styles.css` un bloque reutilizable de modal, pestañas, formularios,
     tablas y botones (`gh-modal-*`, `gh-tab*`, `gh-field`, `gh-mbtn*`) construido **solo con
     tokens `--gh-*`**. Se reescribieron `list-rooms.css` y `create-room.css` con tokens, y
     `create-room` pasó de drawer lateral a modal centrado.
  5. **Limpieza**: se eliminaron `list-room-types`, `list-rates`, `amenities`, `room-detail`,
     `update-room`, `create-room-type`, `update-room-type`, `detail-room-type`, `create-rate`,
     `update-rate` y `detail-rate`. Sus rutas quedaron como *redirect* a `/habitaciones`.
  6. **RBAC**: migración `accounts/0019_consolidate_rooms_menu.py` que marca `is_menu=False` y
     limpia el `link` de `amenities.read`, `room_type.read` y `rates.read`. Se ajustó `seed_rbac`
     para que no vuelva a crear la entrada de menú de amenidades.
  7. **Menú Habitaciones plano**: migración `accounts/0020_flatten_rooms_menu.py` que promueve
     `rooms.read` a entrada superior "Habitaciones" y saca `rooms.view` del menú para evitar el
     desplegable redundante "Habitaciones > Ver habitaciones".
- **Por qué:** las cuatro vistas obligaban a saltar de pantalla para una sola tarea (crear un tipo,
  tarifarlo y asignarlo a una habitación eran tres navegaciones). Consolidarlas reduce el módulo a
  un único punto de entrada y hace que toda la gestión de una habitación ocurra sin salir de ella.
  Los estilos se rehicieron con tokens porque el patrón vigente en el repositorio —overrides
  `:is(.my-app-dark,.dark) app-x .btn-light` en `styles.css`— ya acumulaba ~200 líneas y había que
  ampliarlo con cada componente nuevo; con tokens el modo oscuro sale gratis.
- **Archivos/áreas afectadas:** `frontend/src/styles.css`, `frontend/src/app/app.routes.ts`,
  `frontend/src/app/modules/rooms/` (completo), `backend/accounts/migrations/0019_consolidate_rooms_menu.py`,
  `backend/accounts/migrations/0020_flatten_rooms_menu.py`,
  `backend/accounts/management/commands/seed_rbac.py`.
- **Impacto:**
  - **Requiere migración**: `python manage.py migrate accounts`. Sin ella el menú lateral seguiría
    mostrando Tipos / Tarifas / Amenidades apuntando a rutas que ahora redirigen, o el desplegable
    redundante "Habitaciones > Ver habitaciones" si solo se aplicó `0019`.
  - Los recursos RBAC `amenities.*`, `room_type.*` y `rates.*` **siguen activos y son necesarios**:
    los modales llaman a `/api/amenities/`, `/api/room-types/` y `/api/rates/`. Desactivarlos
    rompería la vista. La migración solo los saca del menú.
  - El `permissionChildGuard` autoriza rutas según el menú del usuario, así que el acceso a
    `/habitaciones` sigue dependiendo de que `rooms.read` esté en el menú (ver deuda técnica 9).
  - Sin cambios de API ni de modelos.
- **Verificación:** `npm run lint`, `npm run test:ci` (59 pruebas) y `npm run build:ci` en verde;
  backend `manage.py test accounts apps.rooms apps.hotel_settings` (38 pruebas) en verde y
  `makemigrations --check` sin cambios pendientes. El aviso de *bundle budget* del build ya existía
  antes (971 bytes de exceso); el bloque de estilos compartidos lo llevó a ~8 kB de exceso.

---

### 2026-08-10 — Creación de la bitácora del proyecto

- **Autor:** Claude Code, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** docs
- **Qué se hizo:** se creó `AGENTS.md` en la raíz como bitácora única del proyecto, con la
  descripción funcional completa de Wayra, el stack, la estructura del repositorio, las decisiones
  de arquitectura con su justificación, el mapa de módulos, las convenciones de código, los flujos
  de desarrollo/pruebas/despliegue, el histórico de cambios reconstruido desde Git, y las reglas de
  registro obligatorio. Se creó `CLAUDE.md` como puntero a `AGENTS.md` para que Claude Code lo cargue
  automáticamente.
- **Por qué:** el proyecto no tenía documentación central. Los agentes de IA y los desarrolladores
  nuevos tomaban decisiones sin conocer los patrones ya establecidos (RBAC por recursos, tenancy,
  borrado lógico, restricciones de Railway), lo que generaba trabajo inconsistente y riesgo de
  romper decisiones deliberadas. La bitácora hace explícito el "por qué" y obliga a dejar rastro de
  cada cambio.
- **Archivos/áreas afectadas:** `AGENTS.md`, `CLAUDE.md` (nuevos, raíz del proyecto).
- **Impacto:** ninguno sobre el código en ejecución. Cambio de proceso: toda IA o desarrollador debe
  leer `AGENTS.md` antes de trabajar y registrar aquí sus cambios.

---

### 2026-07-31 — Corrección del envío de correo

- **Autor:** Cristian Ramirez
- **Commit(s):** `b340bddd`
- **Tipo:** fix
- **Qué se hizo:** se migró el envío de correo transaccional a la API HTTPS de Resend mediante
  `django-anymail` (`anymail.backends.resend.EmailBackend`), dejando SMTP como alternativa
  comentada.
- **Por qué:** los planes Free/Trial/Hobby de Railway bloquean la salida SMTP, por lo que la
  recuperación de contraseña y los correos de solicitud de demo no llegaban.
- **Archivos/áreas afectadas:** `backend/backend/settings.py`, `backend/accounts/email_utils.py`,
  `backend/requirements.txt`, `docs/production-runbook.md`.
- **Impacto:** requiere las variables `EMAIL_BACKEND=anymail.backends.resend.EmailBackend`,
  `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL` y `SERVER_EMAIL` en producción.

### 2026-07-31 — Botón de ayuda / tutorial

- **Autor:** Cristian Ramirez
- **Commit(s):** `f828b77d`
- **Tipo:** feat
- **Qué se hizo:** se agregó un componente de ayuda contextual accesible desde la interfaz.
- **Por qué:** facilitar la adopción del sistema por parte de personal operativo sin capacitación
  previa, complementando el manual de usuario.
- **Archivos/áreas afectadas:** `frontend/src/app/components/tutorial/`, layout.
- **Impacto:** ninguno.

### 2026-07-31 — Flujo de solicitud de demo

- **Autor:** Cristian Ramirez
- **Commit(s):** `70d9ec32`, `79200406`
- **Tipo:** feat
- **Qué se hizo:** se creó la app `apps.demo_requests` con el modelo `DemoRequest` (datos del hotel,
  datos del solicitante, estados `NEW`/`CONTACTED`/`CONVERTED`/`DISCARDED` y trazabilidad de
  conversión a hotel + usuario), el formulario público en la landing y la vista de gestión en el
  panel SaaS. Se agregaron los backups locales de base de datos al `.gitignore`.
- **Por qué:** cerrar el ciclo comercial del SaaS: captar prospectos desde la landing pública y
  convertirlos en hoteles operativos sin proceso manual fuera del sistema. La conversión queda
  registrada (`converted_hotel_settings`, `converted_user`, `converted_at`) para auditoría.
- **Archivos/áreas afectadas:** `backend/apps/demo_requests/`, `backend/backend/settings.py`,
  `backend/backend/urls.py`, `frontend/src/app/modules/saas/list-demo-requests/`,
  `frontend/src/app/services/demo-request.ts`, `.gitignore`.
- **Impacto:** migraciones nuevas. Throttle scope `demo_request` (5/min). Ruta
  `/saas-solicitudes-demo`, solo admin de plataforma.

### 2026-07-30 — Preparación del despliegue en Railway

- **Autor:** Cristian Ramirez
- **Commit(s):** `84cecf8c`, `8366d4f7`, `2259bc09`, `c879ecca`
- **Tipo:** deploy
- **Qué se hizo:**
  1. `84cecf8c` — se agregaron `Dockerfile` multi-stage, `railway.json`, `.dockerignore` y
     `backend/entrypoint.sh`; se parametrizó `settings.py` con validación estricta de variables de
     entorno y autoconfiguración desde `RAILWAY_PUBLIC_DOMAIN`.
  2. `8366d4f7` — se agregó `healthcheck.railway.app` a `ALLOWED_HOSTS`.
  3. `2259bc09` — `SECURE_SSL_REDIRECT` pasa a `False` por defecto cuando hay dominio Railway.
  4. `c879ecca` — se sirven los assets de `frontend/public/` en la raíz del dominio.
- **Por qué:** llevar el sistema a producción como **un solo servicio** (frontend compilado servido
  por Django con WhiteNoise + catch-all SPA), lo que abarata el hosting y mantiene el mismo origen
  para que funcione la autenticación por cookie de sesión. Los tres commits siguientes al inicial
  corrigen fallos reales del healthcheck de Railway: llegaba con `Host: healthcheck.railway.app`
  (rechazado por `ALLOWED_HOSTS`) y por HTTP (respondido con un 301 por `SECURE_SSL_REDIRECT`).
- **Archivos/áreas afectadas:** `Dockerfile`, `railway.json`, `.dockerignore`,
  `backend/entrypoint.sh`, `backend/backend/settings.py`, `backend/backend/urls.py`,
  `docs/RAILWAY_DEPLOYMENT.md`, `docs/production-runbook.md`, `scripts/predeploy-check.ps1`.
- **Impacto:** ver la lista de variables obligatorias en el runbook. **No reactivar
  `SECURE_SSL_REDIRECT` en Railway sin verificar que el healthcheck siga pasando.**

### 2026-07-25 — Cambios estéticos

- **Autor:** Cristian Ramirez
- **Commit(s):** `4c09944f`
- **Tipo:** refactor
- **Qué se hizo:** ajustes visuales generales de la interfaz.
- **Por qué:** homogeneizar la presentación antes de exponer el producto públicamente.
- **Archivos/áreas afectadas:** frontend (estilos y plantillas).
- **Impacto:** ninguno.

### 2026-05-12 — Escaneo y consolidación de RBAC

- **Autor:** Cristian Ramirez
- **Commit(s):** `e837eb61`
- **Tipo:** security / docs
- **Qué se hizo:** se generaron `RBAC_RESOURCES_SCAN.md`, `RBAC_RESOURCES_SCAN.json`,
  `RBAC_RESOURCES_LIST.md` y `RBAC_SUMMARY.md`, documentando 35 ViewSets y 60 recursos únicos
  (30 `.read`, 29 `.write`, 1 especial `items.read_deleted`). Se añadieron los scripts de
  verificación y asignación de permisos (`check_rbac.py`, `add_missing_permissions.py`,
  `assign_missing_permissions_to_roles.py`, `assign_read_permissions.py`,
  `add_notifications_permissions.py`).
- **Por qué:** al crecer el número de módulos era imposible verificar a mano que cada endpoint
  tuviera su recurso RBAC registrado y asignado a los roles correctos. El escaneo automatizado
  detecta desfases entre el código y la base de datos.
- **Archivos/áreas afectadas:** raíz del proyecto (documentos RBAC), `backend/*.py` (scripts).
- **Impacto:** al agregar un endpoint hay que ejecutar el escaneo y actualizar estos documentos.

### 2026-05-03 — Cambio obligatorio de contraseña en el primer ingreso

- **Autor:** Cristian Ramirez
- **Commit(s):** `f7f4f371`
- **Tipo:** security
- **Qué se hizo:** se agregaron los campos `must_change_password` y `password_changed_at` a `User`,
  y el middleware `ForcePasswordChangeMiddleware` que bloquea la navegación hasta el cambio.
- **Por qué:** los usuarios son creados por un administrador con contraseña temporal. Sin forzar el
  cambio, quedaban credenciales conocidas por terceros.
- **Archivos/áreas afectadas:** `backend/accounts/models.py`, `backend/accounts/middleware.py`,
  `backend/accounts/views.py`, `backend/backend/settings.py`, frontend (flujo de login).
- **Impacto:** migración de base de datos.

### 2026-05-01 — Servicio de notificaciones

- **Autor:** Cristian Ramirez
- **Commit(s):** `c21ec68d`, `c47ef5d6`
- **Tipo:** feat / chore
- **Qué se hizo:** se creó `apps.notifications` con el modelo `Notification`, la capa de servicios
  (`services.py`), signals de dominio y los management commands `notify_upcoming_checkins`,
  `notify_upcoming_checkouts` y `notify_daily_reports`. Se agregó `NotificationReadState` en
  `accounts` con sus endpoints de lectura/marcado. Se eliminaron del repositorio los `.pyc` y la
  base de datos SQLite versionada.
- **Por qué:** el personal necesitaba enterarse de eventos operativos (check-ins próximos,
  habitaciones pendientes de limpieza, mantenimientos) sin revisar cada módulo manualmente. Los
  destinatarios se resuelven **por rol** para que la notificación siga al RBAC y no a usuarios
  fijos; hay deduplicación diaria para no saturar.
- **Archivos/áreas afectadas:** `backend/apps/notifications/`, `backend/accounts/models.py`,
  `backend/accounts/views.py`, `backend/backend/urls.py`, `frontend/src/app/services/notification*.ts`.
- **Impacto:** migraciones nuevas. Requiere programar los comandos como tareas periódicas. Recursos
  RBAC `notifications.read` / `notifications.write`.

### 2026-04-25 — Landing page pública

- **Autor:** Cristian Ramirez
- **Commit(s):** `df4985ca`
- **Tipo:** feat
- **Qué se hizo:** se agregó la página de aterrizaje con estadísticas, módulos, pasos, arquitectura
  y preguntas frecuentes, como ruta raíz `/`.
- **Por qué:** dar presencia comercial al producto y servir de punto de entrada para el flujo de
  solicitud de demo.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/landing/`,
  `frontend/src/app/app.routes.ts`.
- **Impacto:** la ruta `/` deja de redirigir al login y muestra la landing.

### 2026-04-11 / 2026-04-13 — Dashboard, perfil, modo oscuro, automatizaciones y migraciones

- **Autor:** Cristian Ramirez
- **Commit(s):** `3bff91d3`, `eeb62610`, `bc4ff5b5`, `95163e50`
- **Tipo:** feat
- **Qué se hizo:** dashboard con gráficas (Chart.js) y página "Mi Perfil"; soporte de modo oscuro en
  toda la UI; automatizaciones de backend (`sync_reservation_room_statuses`,
  `sync_operational_alerts`); consolidación del set de migraciones.
- **Por qué:** el dashboard concentra los indicadores operativos que antes obligaban a recorrer
  varios módulos. Las automatizaciones evitan que los estados de habitaciones y las alertas
  financieras dependan de que alguien los actualice a mano.
- **Archivos/áreas afectadas:** `frontend/src/app/components/pages/dashboard/`,
  `frontend/src/app/modules/users/my-profile/`, estilos globales,
  `backend/apps/reservations/management/commands/`, `backend/apps/finance/management/commands/`.
- **Impacto:** los comandos deben programarse periódicamente.

### 2026-04-09 — Inventario, limpieza, mantenimiento y reportes

- **Autor:** Cristian Ramirez
- **Commit(s):** `a1cb8c58`
- **Tipo:** feat
- **Qué se hizo:** app `apps.inventory` (`Item`, `InventoryMovement`, `RoomInventory`,
  `InventoryRestockAlert`), modelos `CleaningTask` y `MaintenanceOrder` en `apps.rooms`, y app
  `apps.reports`. Módulos frontend correspondientes.
- **Por qué:** cerrar la operación de piso (housekeeping y mantenimiento) y el control de insumos por
  habitación, que hasta entonces quedaba fuera del sistema. El scope especial `items.read_deleted`
  nació aquí, para permitir auditar ítems eliminados sin darle ese acceso a todos los roles.
- **Archivos/áreas afectadas:** `backend/apps/inventory/`, `backend/apps/rooms/`,
  `backend/apps/reports/`, `frontend/src/app/modules/{items,room-inventory,inventory-movements,cleaning-tasks,maintenance-orders,reports}/`.
- **Impacto:** migraciones y recursos RBAC nuevos.

### 2026-04-05 — Módulo de facturación

- **Autor:** Cristian Ramirez
- **Commit(s):** `b4231094`
- **Tipo:** feat
- **Qué se hizo:** app `apps.billing` con `Charge`, `Invoice`, `InvoiceCharge`, `Payment`,
  `PaymentRefund` y `CreditNote`; módulos frontend de facturas, pagos y reembolsos. Generación de
  PDFs con `reportlab`.
- **Por qué:** el ciclo de cobro es el cierre natural de la reserva; los cargos se acumulan durante
  la estadía (consumos, servicios) y se consolidan en factura. `CreditNote` existe para no borrar ni
  editar facturas emitidas — corrección por documento, no por modificación.
- **Archivos/áreas afectadas:** `backend/apps/billing/`, `frontend/src/app/modules/{billing,payments}/`.
- **Impacto:** migraciones y recursos RBAC nuevos (`charges`, `invoices`, `payments`,
  `credit-notes`).

### 2026-04-04 — Servicios y paquetes

- **Autor:** Cristian Ramirez
- **Commit(s):** `de8025cf`
- **Tipo:** feat
- **Qué se hizo:** apps `apps.services` (`Service`) y `apps.packages` (`Package`, `PackageService`),
  con sus módulos frontend.
- **Por qué:** permitir vender servicios sueltos y agruparlos en paquetes reutilizables al armar una
  reserva.
- **Archivos/áreas afectadas:** `backend/apps/services/`, `backend/apps/packages/`,
  `frontend/src/app/modules/{services,packages}/`.
- **Impacto:** migraciones y recursos RBAC nuevos.

### 2026-04-02 — Módulo de reservas

- **Autor:** Cristian Ramirez
- **Commit(s):** `bebdb431`
- **Tipo:** feat
- **Qué se hizo:** app `apps.reservations` con `Reservation`, `ReservationRoom`, `ReservationGuest`,
  `ReservationDeposit`, `ReservationInventoryCheck` y `ReservationInventoryCheckLine`. Módulo
  frontend con vistas de tabla, tarjetas y calendario. Ajustes generales de interfaces.
- **Por qué:** es el núcleo del negocio. El modelo se separó en entidades porque una reserva puede
  abarcar varias habitaciones, varios huéspedes y varios abonos parciales, y porque el chequeo de
  inventario al check-in/check-out debe quedar registrado línea por línea para poder cobrar faltantes.
- **Archivos/áreas afectadas:** `backend/apps/reservations/`,
  `frontend/src/app/modules/reservations/`.
- **Impacto:** migraciones y recursos RBAC nuevos.

### 2026-03-20 / 2026-03-27 — Habitaciones, tabla maestra y amenidades

- **Autor:** Cristian Ramirez, rastor65
- **Commit(s):** `b5acd5f9`, `4d5c1603`, `3cce714e`, `db28ac8a`, `7d4e3014`, `125cb9b3`, `56f63c6b`
- **Tipo:** feat / refactor
- **Qué se hizo:** app `apps.rooms` (`RoomType`, `Rate`, `Amenity`, `Room`) y app `apps.master_data`
  (`MasterData` como catálogo genérico, con `RoomType` heredando de él). CRUD de amenidades, mejora
  de las vistas de roles y recursos, y homogeneización del estilo de todas las páginas.
- **Por qué:** `MasterData` centraliza los catálogos de valores configurables para no crear una tabla
  por cada lista desplegable. La homogeneización de estilos vino de tener páginas construidas en
  momentos distintos con criterios distintos.
- **Archivos/áreas afectadas:** `backend/apps/rooms/`, `backend/apps/master_data/`,
  `frontend/src/app/modules/rooms/`, `frontend/src/app/components/pages/{roles,recursos,master-data}/`.
- **Impacto:** migraciones y recursos RBAC nuevos. Quedó una duplicación de `RoomType` entre
  `master_data` y `rooms` (ver deuda técnica).

### 2026-03-11 — Clientes y configuración del hotel

- **Autor:** Cristian Ramirez
- **Commit(s):** `69df3018`, `30d43549`
- **Tipo:** feat
- **Qué se hizo:** app `apps.clients` (`Client`) y app `apps.hotel_settings` (`HotelSettings`,
  `HotelFloor`, `ReservationPolicy`), con sus módulos frontend.
- **Por qué:** `HotelSettings` no es solo una pantalla de configuración: **es la entidad tenant** del
  sistema. Todo modelo de dominio apunta a ella, y el usuario también. Esta es la base de la
  arquitectura multi-hotel descrita en 5.4.
- **Archivos/áreas afectadas:** `backend/apps/clients/`, `backend/apps/hotel_settings/`,
  `frontend/src/app/modules/clients/`, `frontend/src/app/components/pages/hotel-settings/`.
- **Impacto:** migraciones. A partir de aquí, todo usuario no superadministrador debe tener
  `hotel_settings` asignado (validado en `User.clean()`).

### 2026-03-02 / 2026-03-04 — RBAC completo: roles, recursos y menú dinámico

- **Autor:** Cristian Ramirez, rastor65
- **Commit(s):** `189e3070`, `53c93084`, `3d131f90`, `20235493`, `300173e9`, `c793283f`
- **Tipo:** feat
- **Qué se hizo:** se implementó el sistema RBAC completo: modelos `Role`, `JobTitle`, `Resource`,
  `UserRole`, `RoleResource`; el motor `HasResourcePermission`; el menú lateral generado
  dinámicamente desde `Resource`; el módulo de gestión de usuarios y las páginas de roles y recursos.
- **Por qué:** un hotel tiene perfiles muy distintos (recepción, housekeeping, mantenimiento,
  administración, gerencia) y cada uno debe ver solo lo suyo. Se descartó el sistema de permisos
  nativo de Django porque estaba atado a modelos, mientras que aquí se necesitaba permisos por
  endpoint **y** reutilizar la misma definición para construir el menú (razonamiento completo en
  5.3 y 5.6).
- **Archivos/áreas afectadas:** `backend/accounts/` completo,
  `frontend/src/app/components/pages/{roles,recursos}/`, `frontend/src/app/modules/users/`,
  `frontend/src/app/guards/permission.guard.ts`, `frontend/src/app/components/layout/aside/`.
- **Impacto:** base de todo el control de acceso posterior. `seed_rbac` carga los roles y recursos
  iniciales.

### 2025-10-15 / 2025-10-30 — Autenticación y gestión de usuarios

- **Autor:** Cristian Ramirez, rastor65
- **Commit(s):** `8d43e473`, `ac26e78f`, `4a3ee145`, `1112e1cf`, `bfd21e1f`, `7c1c395c`, `4b1fbdc7`,
  `f858101b`, `a5a3f0fd`, `d30444ab`, `8a686dce`
- **Tipo:** feat
- **Qué se hizo:** app `accounts` con `User` personalizado (PK UUID, `job_title`, `avatar`); login y
  logout por sesión; recuperación de contraseña por correo con plantillas HTML; dashboard responsivo;
  módulo de usuarios (listado, registro, actualización con carga de avatar); refactor del componente
  aside.
- **Por qué:** se eligió autenticación por sesión con cookie `HttpOnly` en vez de JWT en
  `localStorage` por seguridad frente a XSS, aprovechando que frontend y backend comparten origen
  (razonamiento completo en 5.1). El `User` usa UUID como PK para no exponer identificadores
  secuenciales en las URLs.
- **Archivos/áreas afectadas:** `backend/accounts/`, `backend/templates/`,
  `frontend/src/app/components/auth/`, `frontend/src/app/components/layout/`,
  `frontend/src/app/modules/users/`, `frontend/src/app/services/auth/`.
- **Impacto:** `AUTH_USER_MODEL = "accounts.User"`. Requiere configuración de correo saliente.

### 2025-10-03 — Commit inicial

- **Autor:** Cristian Ramirez
- **Commit(s):** `65739849`, `2eebc40f`
- **Tipo:** chore
- **Qué se hizo:** estructura inicial del proyecto (backend Django + frontend Angular) y componente
  de breadcrumb.
- **Por qué:** arranque del proyecto.
- **Impacto:** ninguno.

---

## 13. Deuda técnica y pendientes conocidos

Puntos identificados al construir esta bitácora. **No son tareas asignadas** — están documentados
para que nadie los "descubra" y los cambie sin contexto.

1. **`djangorestframework-simplejwt` instalado pero sin uso.** Está en `INSTALLED_APPS` junto con
   `token_blacklist`, pero `DEFAULT_AUTHENTICATION_CLASSES` solo tiene `SessionAuthentication`.
   Probablemente sea un remanente de una exploración inicial. Antes de quitarlo, verificar que no
   haya migraciones o endpoints que dependan de él.
2. **`RoomType` duplicado** entre `apps.master_data` (heredando de `MasterData`) y `apps.rooms`
   (modelo propio). Convive por evolución histórica; unificar requiere migración de datos.
3. **Fallback de permisos por `link_backend`** en `HasResourcePermission`. Es retrocompatibilidad:
   una vista sin `required_scopes` autoriza por coincidencia de prefijo de path, lo cual es más laxo
   de lo deseable. Todo código nuevo debe declarar `required_scopes` explícitamente.
4. **Scripts sueltos en `backend/`** (`add_missing_permissions.py`, `assign_read_permissions.py`,
   `check_rbac.py`, `test_http.py`, `test_reset.py`, `rbac_report*.txt`) — utilidades operativas que
   deberían ser management commands o moverse a `scripts/`. Los de RBAC quedaron **obsoletos** al
   completarse `seed_rbac` (2026-08-10): ya no hay nada que parchear a mano y volver a correrlos
   puede reintroducir las claves basura que `LEGACY_KEYS` desactiva. Se pueden borrar.
5. **`a=4.py` en la raíz** (commit `5959164e`) — archivo sin propósito aparente en el proyecto.
6. **`backend/db.sqlite3` y `backend/db_test_tmp.sqlite3` presentes en el árbol de trabajo.** Están
   en `.gitignore`, pero conviene verificar que no queden restos versionados en el historial.
7. **Las migraciones corren automáticamente en cada arranque** (`entrypoint.sh`). Cómodo, pero
   riesgoso ante migraciones destructivas. Ver sección 10.
8. **`docs/MANUAL_USUARIO.md` y los documentos RBAC pueden desactualizarse** respecto al código.
   Al cambiar un módulo, revisar si corresponde actualizarlos.
9. ~~**`seed_rbac` está obsoleto: siembra 22 recursos de los 60 documentados.**~~ **RESUELTO el
   2026-08-10.** `seed_rbac` cubre los 66 scopes que declaran las vistas, el menú completo y cuatro
   roles base, y `accounts.tests.SeedRbacCoverageTests` impide que la cobertura se vuelva a quedar
   atrás. Un hotel convertido desde una solicitud de demo ya abre todos sus módulos sin parches
   manuales. Ver la entrada del registro de cambios para el detalle y los pasos de despliegue.
10. **Un hotel nuevo no puede crear su primera habitación sin pisos.** `convert_request()` crea
    solo `HotelSettings` + usuario: sin pisos, tipos, amenidades ni tarifas. El campo `floor` es
    obligatorio, así que el formulario nunca valida. La vista `/habitaciones` ya avisa de esto y
    deshabilita el botón, pero el arranque sigue siendo manual.
11. **Las habitaciones borradas lógicamente bloquean la autogeneración.**
    `HotelFloorViewSet._create_missing_rooms()` usa `Room.objects.filter(...)`, el manager crudo,
    que no filtra `SoftDeleteMarker` (el borrado lógico solo se aplica en la capa API). Una
    habitación borrada cuenta como existente y nunca se recrea; y si otro piso genera el mismo
    número, el error nombra una habitación que el usuario no puede ver.
12. **Dos reglas de unicidad en conflicto para el número de habitación.** La base de datos tiene
    `UniqueConstraint(floor, number)`, así que el alta manual permite dos "101" en pisos distintos
    del mismo hotel; pero `_create_missing_rooms` exige unicidad a nivel de hotel y falla si se da
    ese caso.
13. **`HotelFloor.room_count` no se recalcula** al crear o borrar habitaciones fuera de la
    autogeneración, por lo que `range_display` y los totales de Configuración del Hotel quedan
    desfasados. La vista `/habitaciones` calcula su propio rango desde las habitaciones reales
    para no propagar el dato incorrecto.
### 2026-08-10 - Inventario por uso de item y asignacion desde habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** funcional
- **Que se hizo:** los items de inventario ahora tienen un uso operativo (`Habitacion` o `Recepcion`). La vista de items pregunta ese uso al crear, permite filtrarlo y lo muestra en tarjetas, tabla y detalle. La pestaña Inventario del modal de habitacion carga solo items marcados como `Habitacion` y permite activarlos/desactivarlos para la habitacion con cantidad y minimo desde el mismo modal.
- **Por que:** los productos de dotacion de habitacion y los productos de recepcion son procesos distintos; mezclarlos hacia que la asignacion de inventario por habitacion fuera confusa y dependiera del modulo general.
- **Archivos/areas afectadas:** `backend/apps/inventory/models.py`, `backend/apps/inventory/serializers.py`, `backend/apps/inventory/views.py`, `backend/apps/inventory/admin.py`, `backend/apps/inventory/tests.py`, `backend/apps/inventory/migrations/0006_item_item_purpose.py`, `frontend/src/app/modules/items/`, `frontend/src/app/services/item.ts`, `frontend/src/app/modules/rooms/room-modal/`, `frontend/src/styles.css`.
- **Impacto:** requiere migracion `inventory.0006_item_item_purpose`; los items ya asignados a habitaciones se marcan automaticamente como `Habitacion` y los demas quedan como `Recepcion`.
### 2026-08-10 - Buscador en inventario de habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la pestaña Inventario del modal de habitacion ahora incluye un buscador instantaneo por nombre, SKU, descripcion, tipo y unidad; tambien filtra en frontend para renderizar solo items marcados como `Habitacion`.
- **Por que:** al tener muchos items de inventario, encontrar rapidamente una dotacion especifica desde el modal se volvia incomodo.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/styles.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.
### 2026-08-10 - Fallback de items sin proposito en inventario de habitacion

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** fix
- **Que se hizo:** la pestaña Inventario del modal de habitacion ya no descarta items cuando el backend aun devuelve registros sin `item_purpose`; mantiene el filtro de habitacion cuando el campo existe y evita que la lista quede vacia tras agregar el buscador.
- **Por que:** si el backend en ejecucion no se habia reiniciado con el serializer nuevo, los items llegaban sin el campo de uso y el frontend los filtraba todos.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.
### 2026-08-10 - Inventario de habitacion organizado por categoria

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** la pestaña Inventario del modal de habitacion ahora ordena los items por categoria y muestra un encabezado visual por cada categoria; el campo `Minimo` se renombro a `Min. reposicion` para explicar mejor su funcion.
- **Por que:** con muchos items era dificil ubicar rapidamente una dotacion concreta, y la etiqueta `Minimo` no comunicaba que es el umbral para alertar reposicion.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/room-modal/room-modal.ts`, `frontend/src/app/modules/rooms/room-modal/room-modal.html`, `frontend/src/styles.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Acciones rapidas por estado en tarjetas de habitaciones

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** las tarjetas de habitaciones ahora muestran una accion principal contextual segun el estado: confirmar reserva pendiente, hacer check-in, hacer check-out o completar la primera limpieza abierta. Cuando hay una accion operativa, se mantiene un boton secundario para abrir la gestion completa de la habitacion.
- **Por que:** recepcion necesita resolver acciones frecuentes desde el tablero sin abrir el modal completo para cada operacion simple.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API; las acciones reutilizan los endpoints existentes de reservas y limpieza.

### 2026-08-10 - Prioridades operativas en tablero de habitaciones

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** el tablero de habitaciones incorpora filtros de prioridad para ver rapidamente habitaciones que requieren accion, check-in listo, salida proxima, limpieza y habitaciones sin configurar. El buscador tambien considera el nombre del huesped activo y se agrego una accion para limpiar filtros combinados.
- **Por que:** cuando el hotel tiene muchas habitaciones, filtrar solo por estado obliga a revisar demasiado; las prioridades guian el trabajo diario de recepcion.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.

### 2026-08-10 - Resumen operativo en tarjetas de habitaciones

- **Autor:** Codex, a solicitud de rastor65
- **Commit(s):** _(pendiente)_
- **Tipo:** ux
- **Que se hizo:** cada tarjeta de habitacion muestra un bloque compacto con la senal operativa principal: configuracion pendiente, reserva pendiente, check-in listo, salida proxima, limpieza, mantenimiento o lista para vender. La senal usa icono, titulo y texto breve con colores segun prioridad.
- **Por que:** el usuario debe entender que pasa con una habitacion sin abrir el modal ni interpretar solo el color del borde o la etiqueta de estado.
- **Archivos/areas afectadas:** `frontend/src/app/modules/rooms/list-rooms/list-rooms.ts`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.html`, `frontend/src/app/modules/rooms/list-rooms/list-rooms.css`.
- **Impacto:** cambio frontend sin migraciones ni cambios de API.
