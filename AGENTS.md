# Bitácora del Proyecto — Wayra (Sistema de Gestión Hotelera)

> **Documento obligatorio de lectura previa.**
> Cualquier agente de IA (Claude Code, Codex, Copilot, etc.) o desarrollador humano **debe leer este
> archivo completo antes de tocar una sola línea de código**. Aquí está qué hace el sistema, cómo
> está construido, **por qué** se tomó cada decisión, y el registro histórico de todos los cambios.
>
> **Regla de oro:** todo cambio que se haga en el repositorio **debe quedar registrado** en la
> sección [12. Registro de cambios](#12-registro-de-cambios), siguiendo el formato indicado en
> [11. Cómo registrar un cambio](#11-cómo-registrar-un-cambio).

**Última actualización:** 2026-08-13
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

---

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
