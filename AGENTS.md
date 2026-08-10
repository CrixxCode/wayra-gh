# Bitácora del Proyecto — Wayra (Sistema de Gestión Hotelera)

> **Documento obligatorio de lectura previa.**
> Cualquier agente de IA (Claude Code, Codex, Copilot, etc.) o desarrollador humano **debe leer este
> archivo completo antes de tocar una sola línea de código**. Aquí está qué hace el sistema, cómo
> está construido, **por qué** se tomó cada decisión, y el registro histórico de todos los cambios.
>
> **Regla de oro:** todo cambio que se haga en el repositorio **debe quedar registrado** en la
> sección [12. Registro de cambios](#12-registro-de-cambios), siguiendo el formato indicado en
> [11. Cómo registrar un cambio](#11-cómo-registrar-un-cambio).

**Última actualización:** 2026-08-10
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
- **Normalización de separadores:** `users_read` ≡ `users-read` ≡ `users.read`. El motor genera las
  variantes automáticamente; no hace falta duplicar recursos.
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
`gh-panel`, `gh-chip`, `gh-modal-table` y `gh-mbtn*` definidas al final de
[frontend/src/styles.css](frontend/src/styles.css), construidas **exclusivamente con tokens
`--gh-*`**.

**Por qué:** el patrón previo del repositorio era escribir colores fijos en el CSS del componente y
después compensarlos con reglas `:is(.my-app-dark, .dark) app-mi-componente .btn-light { ... }` en
`styles.css`. Ese bloque ya acumulaba ~200 líneas y crecía con cada componente nuevo. Como el modo
oscuro redefine los tokens `--gh-*` en un solo lugar, un componente que solo usa tokens funciona en
ambos temas sin una línea extra.

**Regla al programar:** en CSS nuevo, **no escribir colores literales**. Usar los tokens. Si falta
un token para un caso legítimo, agregarlo a `:root` y a su bloque de modo oscuro, no improvisar un
override por componente.

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
