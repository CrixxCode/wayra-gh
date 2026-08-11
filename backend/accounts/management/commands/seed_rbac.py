"""
Management command: seed_rbac
=============================
Fuente unica y reproducible del RBAC: recursos, menu lateral y roles base.

Antes, este comando sembraba 22 de los ~60 recursos que el codigo exige, y el rol
`admin` -- el que `apps/demo_requests/views.py::convert_request()` asigna al primer
usuario de cada hotel nuevo -- tampoco los tenia. Un hotel recien convertido no podia
abrir `/habitaciones` ni el resto de modulos, y el estado funcional dependia de una base
de datos parcheada a mano con `add_missing_permissions.py` / `assign_missing_permissions_to_roles.py`.

Ahora la lista de dominios de abajo cubre **todos** los `required_scopes` declarados en
los ViewSets, y de cada dominio se derivan sus tres recursos: `<dominio>.read`,
`<dominio>.write` y `<dominio>.read_deleted` (este ultimo lo exige
`HasResourcePermission._append_deleted_read_scopes_if_needed` cuando la vista se consulta
con `?include_deleted=true`).

Uso:
    python manage.py seed_rbac                  # recursos + menu + roles + superusuario demo
    python manage.py seed_rbac --only-resources # solo recursos y menu (no toca roles ni usuarios)
    python manage.py seed_rbac --assign-admin   # asigna los roles de administrador a los superusuarios

Cuidado: `--only-resources` aparte, el comando **reescribe** los recursos de los roles
base (`admin`, `manager`, `staff`, `platform_admin`) para que el resultado sea
reproducible. Los roles creados a mano por un hotel no se tocan.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import JobTitle, Resource, Role, RoleResource

User = get_user_model()


# ---------------------------------------------------------------------------
# 1. Dominios: un ViewSet -> tres recursos (.read / .write / .read_deleted)
# ---------------------------------------------------------------------------
# (prefijo_scope, etiqueta en plural, ruta backend, tiene_escritura)
# La etiqueta se usa para componer los nombres: "Ver X", "Gestionar X",
# "Papelera de X" (en plural y sin concordancia de genero a proposito).

DOMAINS = [
    # accounts
    ("users", "usuarios", "/api/users/", True),
    ("roles", "roles", "/api/roles/", True),
    ("resources", "recursos", "/api/resources/", True),
    # configuracion del hotel
    ("hotel_settings", "configuracion del hotel", "/api/hotel-settings/", True),
    ("reservation-policies", "politicas de reserva", "/api/reservation-policies/", True),
    ("master_data", "datos maestros", "/api/master-data/", True),
    # clientes
    ("clients", "clientes", "/api/clients/", True),
    # habitaciones
    ("rooms", "habitaciones", "/api/rooms/", True),
    ("room_type", "tipos de habitacion", "/api/room-types/", True),
    ("rates", "tarifas", "/api/rates/", True),
    ("amenities", "amenidades", "/api/amenities/", True),
    ("cleaning_tasks", "tareas de limpieza", "/api/cleaning-tasks/", True),
    ("maintenance_orders", "ordenes de mantenimiento", "/api/maintenance-orders/", True),
    # reservas
    ("reservations", "reservas", "/api/reservations/", True),
    ("reservation_rooms", "habitaciones de reserva", "/api/reservation-rooms/", True),
    ("reservation_guests", "huespedes de reserva", "/api/reservation-guests/", True),
    ("reservation_deposits", "abonos de reserva", "/api/reservation-deposits/", True),
    (
        "reservation_inventory_checks",
        "revisiones de inventario de reserva",
        "/api/reservation-inventory-checks/",
        True,
    ),
    (
        "reservation_inventory_check_lines",
        "lineas de revision de inventario",
        "/api/reservation-inventory-check-lines/",
        True,
    ),
    # catalogo comercial
    ("services", "servicios", "/api/services/", True),
    ("packages", "paquetes", "/api/packages/", True),
    ("promotions", "promociones", "/api/promotions/", True),
    # facturacion
    ("charges", "cargos", "/api/charges/", True),
    ("invoices", "facturas", "/api/invoices/", True),
    ("payments", "pagos", "/api/payments/", True),
    ("credit-notes", "notas credito", "/api/credit-notes/", True),
    # finanzas
    ("expenses", "egresos", "/api/expenses/", True),
    ("financial_control", "control financiero", "/api/financial-control/", True),
    # inventario
    ("items", "items", "/api/items/", True),
    ("inventory-movements", "movimientos de inventario", "/api/inventory-movements/", True),
    ("room-inventory", "inventario por habitacion", "/api/room-inventory/", True),
    # transversales
    ("reports", "reportes", "/api/reports/", False),
    ("notifications", "notificaciones", "/api/notifications/", True),
]

DOMAIN_KEYS = {prefix for prefix, _, _, _ in DOMAINS}


# ---------------------------------------------------------------------------
# 1b. Permisos finos que no son un dominio completo
# ---------------------------------------------------------------------------
# (key, nombre, descripcion, ruta backend)

EXTRA_PERMISSIONS = [
    (
        "rooms.read_guest_data",
        "Ver datos del huesped en habitaciones",
        "Documento del huesped y saldo por cobrar dentro de /api/rooms/. Sin este "
        "recurso, esos campos viajan en null.",
        # link_backend vacio a proposito: no debe activar el fallback por path (5.3).
        "",
    ),
]

# Roles que operan la recepcion y por lo tanto necesitan cobrar e identificar huespedes.
GUEST_DATA_ROLE_SLUGS = ["admin", "manager", "staff"]


# ---------------------------------------------------------------------------
# 2. Recursos de navegacion que no corresponden a un ViewSet
# ---------------------------------------------------------------------------
# (key, nombre, descripcion, link_backend)

NAV_RESOURCES = [
    ("dashboard.view", "Dashboard", "Panel de inicio del hotel.", ""),
    ("activity-log.view", "Registro de actividad", "Bitacora de actividad del hotel.", ""),
    ("profile.read", "Mi perfil", "Perfil del usuario autenticado.", "/api/auth/me/"),
    (
        "auth.password.change",
        "Cambiar contrasena",
        "Cambio de contrasena propia.",
        "/api/auth/password/change/",
    ),
    (
        "income_consolidated.read",
        "Consolidado de ingresos",
        "Vista consolidada de ingresos (se sirve desde /api/reports/).",
        "",
    ),
    (
        "payment-refunds.read",
        "Reembolsos",
        "Vista de reembolsos (la API valida con payments.read/write).",
        "",
    ),
    # Panel SaaS. Solo sirven para pintar el menu: el administrador de plataforma es
    # superusuario sin hotel y `HasResourcePermission` lo deja pasar sin consultar RBAC.
    ("saasadmin.button", "SaaS Admin", "Grupo de menu del panel de plataforma.", ""),
    ("saas.panel.read", "Panel SaaS", "Dashboard global de la plataforma.", ""),
    ("saas_hotels.read", "Hoteles", "Listado global de hoteles.", ""),
    ("saas_demo_requests.read", "Solicitudes de demo", "Gestion de solicitudes de demo.", ""),
    ("saas_amenities.read", "Amenidades globales", "Catalogo global de amenidades.", ""),
    # Grupos del menu lateral (contenedores sin ruta propia).
    ("packages", "Paquetes y promociones", "Grupo de menu.", ""),
    ("invoicesandpayment", "Facturas y pagos", "Grupo de menu.", ""),
    ("finance", "Finanzas", "Grupo de menu.", ""),
    ("inventory", "Inventario", "Grupo de menu.", ""),
    ("mantenimiento", "Limpieza y mantenimiento", "Grupo de menu.", ""),
    ("security", "Seguridad", "Grupo de menu.", ""),
]


# ---------------------------------------------------------------------------
# 3. Menu lateral
# ---------------------------------------------------------------------------
# El menu se construye desde los mismos Resource que controlan el acceso (ver
# AGENTS.md 5.6), y `permissionChildGuard` solo autoriza rutas presentes en el menu
# del usuario: si una pagina no aparece aqui, nadie puede entrar.
#
# (key, nombre visible, icono, link, orden, parent_key)

MENU = [
    ("dashboard.view", "Dashboard", "pi pi-home", "/dashboard", 1, None),
    ("reservations.read", "Reservas", "fa-solid fa-calendar", "/reservas", 2, None),
    ("rooms.read", "Habitaciones", "fa-solid fa-bed", "/habitaciones", 3, None),
    ("clients.read", "Clientes y huespedes", "fa-solid fa-users", "/clientes", 4, None),
    (
        "services.read",
        "Catalogo de servicios",
        "fa-solid fa-bell-concierge",
        "/catalogo-servicios",
        5,
        None,
    ),
    ("packages", "Paquetes y promociones", "fa-solid fa-box-open", "", 6, None),
    ("packages.read", "Catalogo de paquetes", "", "/catalogo-paquetes", 1, "packages"),
    ("promotions.read", "Promociones", "", "/promociones", 2, "packages"),
    ("invoicesandpayment", "Facturas y pagos", "fa-solid fa-credit-card", "", 7, None),
    ("invoices.read", "Facturas", "", "/facturas", 1, "invoicesandpayment"),
    ("payments.read", "Pagos", "", "/pagos", 2, "invoicesandpayment"),
    ("payment-refunds.read", "Reembolsos", "", "/reembolsos", 3, "invoicesandpayment"),
    ("finance", "Finanzas", "fa-solid fa-money-bill-transfer", "", 8, None),
    (
        "income_consolidated.read",
        "Consolidado de ingresos",
        "",
        "/consolidado-ingresos",
        1,
        "finance",
    ),
    ("expenses.read", "Egresos", "", "/egresos", 2, "finance"),
    ("financial_control.read", "Control financiero", "", "/control-financiero", 3, "finance"),
    ("inventory", "Inventario", "fa-solid fa-boxes-stacked", "", 9, None),
    ("items.read", "Items", "", "/items", 1, "inventory"),
    (
        "room-inventory.read",
        "Inventario por habitacion",
        "",
        "/inventario-habitaciones",
        2,
        "inventory",
    ),
    (
        "inventory-movements.read",
        "Movimientos de inventario",
        "",
        "/movimientos-inventario",
        3,
        "inventory",
    ),
    ("mantenimiento", "Limpieza y mantenimiento", "fa-solid fa-screwdriver-wrench", "", 10, None),
    ("cleaning_tasks.read", "Tareas de limpieza", "", "/tareas-limpieza", 1, "mantenimiento"),
    (
        "maintenance_orders.read",
        "Ordenes de mantenimiento",
        "",
        "/ordenes-mantenimiento",
        2,
        "mantenimiento",
    ),
    ("reports.read", "Reportes", "fa-solid fa-clipboard-list", "/reportes", 11, None),
    (
        "activity-log.view",
        "Registro de actividad",
        "fa-solid fa-clock-rotate-left",
        "/actividad",
        12,
        None,
    ),
    (
        "hotel_settings.read",
        "Configuracion del hotel",
        "fa-solid fa-gear",
        "/hotel-config",
        13,
        None,
    ),
    ("security", "Seguridad", "fa-solid fa-shield-halved", "", 14, None),
    ("users.read", "Usuarios", "pi pi-users", "/usuarios", 1, "security"),
    ("roles.read", "Roles", "pi pi-shield", "/roles", 2, "security"),
    ("resources.read", "Recursos", "pi pi-list", "/recursos", 3, "security"),
    ("master_data.read", "Master Data", "pi pi-database", "/master-data", 4, "security"),
    ("saasadmin.button", "SaaS Admin", "fa-solid fa-sliders", "", 15, None),
    ("saas.panel.read", "Panel SaaS", "fa-solid fa-chart-line", "/saas-panel", 1, "saasadmin.button"),
    ("saas_hotels.read", "Hoteles", "fa-solid fa-hotel", "/saas-hoteles", 2, "saasadmin.button"),
    (
        "saas_demo_requests.read",
        "Solicitudes de demo",
        "fa-solid fa-envelope-open-text",
        "/saas-solicitudes-demo",
        3,
        "saasadmin.button",
    ),
    (
        "saas_amenities.read",
        "Amenidades globales",
        "fa-solid fa-star",
        "/saas-amenidades",
        4,
        "saasadmin.button",
    ),
]

MENU_KEYS = [key for key, *_ in MENU]
MENU_LEAF_KEYS = [key for key, _, _, link, _, _ in MENU if link]
SAAS_MENU_KEYS = [
    "saasadmin.button",
    "saas.panel.read",
    "saas_hotels.read",
    "saas_demo_requests.read",
    "saas_amenities.read",
]


# ---------------------------------------------------------------------------
# 4. Claves heredadas que se desactivan
# ---------------------------------------------------------------------------
# No se borran: `RoleResource` las referencia y borrarlas perderia el rastro. Se
# desactivan (is_active=False, is_menu=False) para que dejen de conceder permisos y
# desaparezcan del menu.

LEGACY_KEYS = [
    "resources.debug",  # recurso de pruebas
    'maintenance_orders.read"]',  # clave malformada creada por un script suelto
    "amenities.view",  # duplicado de amenities.read
    "hotel-config.read",  # el scope real del ViewSet es hotel_settings.read
    "hotel-config.write",  # idem con hotel_settings.write
    "clientes-huespedes",  # grupo de un solo hijo; clients.read subio a primer nivel
    "services",  # grupo de un solo hijo; services.read subio a primer nivel
    "rooms.view",  # grupo vaciado por accounts/0019 y 0020
]


# ---------------------------------------------------------------------------
# 5. Roles base
# ---------------------------------------------------------------------------

# Dominios que un rol operativo (gerente) gestiona de punta a punta.
MANAGER_WRITE_DOMAINS = [
    "clients",
    "rooms",
    "room_type",
    "rates",
    "cleaning_tasks",
    "maintenance_orders",
    "reservations",
    "reservation_rooms",
    "reservation_guests",
    "reservation_deposits",
    "reservation_inventory_checks",
    "reservation_inventory_check_lines",
    "reservation-policies",
    "services",
    "packages",
    "promotions",
    "charges",
    "invoices",
    "payments",
    "credit-notes",
    "expenses",
    "financial_control",
    "items",
    "inventory-movements",
    "room-inventory",
    "notifications",
    "master_data",
    "hotel_settings",
]

# Recepcion: opera la habitacion, la reserva y el cobro; no toca catalogos ni finanzas.
STAFF_WRITE_DOMAINS = [
    "clients",
    "reservations",
    "reservation_rooms",
    "reservation_guests",
    "reservation_deposits",
    "reservation_inventory_checks",
    "reservation_inventory_check_lines",
    "cleaning_tasks",
    "maintenance_orders",
    "charges",
    "invoices",
    "payments",
    "notifications",
]

STAFF_READ_DOMAINS = STAFF_WRITE_DOMAINS + [
    "rooms",
    "room_type",
    "rates",
    "amenities",
    "items",
    "room-inventory",
    "credit-notes",
    "reservation-policies",
    "hotel_settings",
]

COMMON_KEYS = ["dashboard.view", "profile.read", "auth.password.change"]

GUEST_DATA_KEYS = [key for key, _, _, _ in EXTRA_PERMISSIONS]


def _read(prefix):
    return f"{prefix}.read"


def _write(prefix):
    return f"{prefix}.write"


def _deleted(prefix):
    return f"{prefix}.read_deleted"


def _menu_keys_for(allowed_prefixes, include_saas=False):
    """Entradas de menu que puede ver un rol, segun los dominios que tiene."""
    keys = []
    for key in MENU_LEAF_KEYS:
        if key in SAAS_MENU_KEYS:
            if include_saas:
                keys.append(key)
            continue
        # Las entradas de menu que no son un scope de dominio (dashboard, actividad,
        # consolidado, reembolsos) se conceden aparte segun el rol.
        prefix = key.rsplit(".", 1)[0] if "." in key else key
        if prefix in allowed_prefixes:
            keys.append(key)
    return keys


def _admin_keys():
    keys = list(COMMON_KEYS)
    for prefix, _, _, has_write in DOMAINS:
        keys.append(_read(prefix))
        keys.append(_deleted(prefix))
        # amenities es un catalogo global del panel SaaS: el ViewSet exige
        # administrador de plataforma para escribir, asi que no se asigna a un hotel
        # (AGENTS.md 5.14).
        if has_write and prefix != "amenities":
            keys.append(_write(prefix))
    keys += ["income_consolidated.read", "payment-refunds.read", "activity-log.view"]
    keys += _menu_keys_for(DOMAIN_KEYS)
    return sorted(set(keys))


def _manager_keys():
    keys = list(COMMON_KEYS)
    allowed = set(MANAGER_WRITE_DOMAINS) | {"reports", "amenities", "users", "roles"}
    for prefix in sorted(allowed):
        keys.append(_read(prefix))
    for prefix in MANAGER_WRITE_DOMAINS:
        keys.append(_write(prefix))
    keys += ["income_consolidated.read", "payment-refunds.read", "activity-log.view"]
    keys += _menu_keys_for(allowed)
    return sorted(set(keys))


def _staff_keys():
    keys = list(COMMON_KEYS)
    allowed = set(STAFF_READ_DOMAINS)
    for prefix in sorted(allowed):
        keys.append(_read(prefix))
    for prefix in STAFF_WRITE_DOMAINS:
        keys.append(_write(prefix))
    keys += _menu_keys_for(allowed)
    return sorted(set(keys))


def _with_guest_data(slug, keys):
    """Los roles de recepcion ven documento y saldo; los demas, no."""
    if slug in GUEST_DATA_ROLE_SLUGS:
        return sorted(set(keys) | set(GUEST_DATA_KEYS))
    return keys


ROLES = {
    "admin": {
        "name": "Administrador",
        "description": "Administrador del hotel: acceso total a la operacion y a la configuracion.",
        "keys": _with_guest_data("admin", _admin_keys()),
    },
    "manager": {
        "name": "Gerente",
        "description": "Gestiona la operacion completa del hotel, sin administrar usuarios ni RBAC.",
        "keys": _with_guest_data("manager", _manager_keys()),
    },
    "staff": {
        "name": "Personal",
        "description": "Recepcion: reservas, huespedes, habitaciones y cobros del dia a dia.",
        "keys": _with_guest_data("staff", _staff_keys()),
    },
    "platform_admin": {
        "name": "Administrador de plataforma",
        "description": "Menu del panel SaaS. Se asigna a los superusuarios sin hotel asignado.",
        "keys": sorted(set(COMMON_KEYS + SAAS_MENU_KEYS + ["activity-log.view"])),
    },
}


JOB_TITLE_CATALOG = {
    "admin": [
        "Administrador del sistema",
        "Administrador general",
        "Propietario del hotel",
        "Dueno del alojamiento",
        "Director general",
        "Representante legal",
    ],
    "manager": [
        "Gerente general",
        "Gerente operativo",
        "Gerente administrativo",
        "Jefe de recepcion",
        "Jefe de reservas",
        "Jefe de habitaciones",
        "Jefe de limpieza",
        "Jefe de mantenimiento",
        "Jefe financiero",
        "Coordinador de operaciones",
        "Supervisor de recepcion",
        "Supervisor de turno",
        "Encargado de hotel",
        "Responsable de facturacion",
        "Responsable de inventario",
        "Responsable de reportes",
    ],
    "staff": [
        "Recepcionista",
        "Auxiliar de recepcion",
        "Asistente de reservas",
        "Auxiliar administrativo",
        "Cajero",
        "Auxiliar de caja",
        "Auxiliar de facturacion",
        "Camarera de habitaciones",
        "Auxiliar de habitaciones",
        "Ama de llaves",
        "Auxiliar de limpieza",
        "Auxiliar de lavanderia",
        "Tecnico de mantenimiento",
        "Auxiliar de mantenimiento",
        "Botones",
        "Portero",
        "Vigilante",
        "Auxiliar de compras",
        "Auxiliar de inventario",
        "Almacenista",
        "Cocinero",
        "Auxiliar de cocina",
        "Mesero",
        "Bartender",
        "Personal de restaurante",
        "Personal de eventos",
        "Auxiliar de servicios generales",
        "Auxiliar de atencion al cliente",
    ],
    "platform_admin": [
        "Administrador de plataforma",
        "Administrador SaaS",
        "Auditor del sistema",
    ],
}


class Command(BaseCommand):
    help = "Crea o actualiza los Resources, el menu lateral, los roles base y el superusuario demo."

    def add_arguments(self, parser):
        parser.add_argument(
            "--only-resources",
            action="store_true",
            help="Solo crear/actualizar Resources (no toca roles ni usuarios).",
        )
        parser.add_argument(
            "--assign-admin",
            action="store_true",
            help="Asignar los roles de administrador a los superusuarios existentes.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\nIniciando seed de RBAC...\n"))

        self._seed_resources()
        self._deactivate_legacy_resources()

        if not options["only_resources"]:
            self._seed_roles()
            self._seed_job_titles()
            self._seed_superuser()

        if options["assign_admin"]:
            self._assign_admin_to_superusers()

        self.stdout.write(self.style.SUCCESS("\nSeed de RBAC completado.\n"))

    # -- recursos ----------------------------------------------------------

    def _build_resource_specs(self):
        """Devuelve {key: defaults} con permisos, navegacion y menu ya combinados."""
        specs: dict[str, dict] = {}

        def base(name, description, link_backend):
            return {
                "name": name,
                "description": description,
                "link": "",
                "link_backend": link_backend,
                "icon": "",
                "is_menu": False,
                "order": 0,
                "parent_key": None,
                "is_active": True,
            }

        for prefix, label, api_path, has_write in DOMAINS:
            specs[_read(prefix)] = base(f"Ver {label}", f"Lectura de {label}.", api_path)
            specs[_deleted(prefix)] = base(
                f"Papelera de {label}",
                f"Ver {label} eliminados logicamente (?include_deleted=true).",
                api_path,
            )
            if has_write:
                specs[_write(prefix)] = base(
                    f"Gestionar {label}",
                    f"Crear, editar, eliminar y restaurar {label}.",
                    api_path,
                )

        for key, name, description, link_backend in NAV_RESOURCES + EXTRA_PERMISSIONS:
            specs.setdefault(key, base(name, description, link_backend))

        for key, name, icon, link, order, parent_key in MENU:
            spec = specs.get(key)
            if spec is None:
                raise ValueError(
                    f"La entrada de menu '{key}' no tiene un Resource declarado en DOMAINS ni en NAV_RESOURCES."
                )
            spec.update(
                {
                    "name": name,
                    "icon": icon,
                    "link": link,
                    "is_menu": True,
                    "order": order,
                    "parent_key": parent_key,
                }
            )

        return specs

    def _seed_resources(self):
        self.stdout.write("  Creando/actualizando Resources...")

        specs = self._build_resource_specs()

        # Primera pasada sin parent: garantiza que todos existan antes de enlazarlos.
        created = 0
        for key, spec in specs.items():
            defaults = {k: v for k, v in spec.items() if k != "parent_key"}
            _, was_created = Resource.objects.update_or_create(key=key, defaults=defaults)
            created += int(was_created)

        # Segunda pasada: jerarquia del menu.
        by_key = {r.key: r for r in Resource.objects.filter(key__in=specs.keys())}
        for key, spec in specs.items():
            resource = by_key[key]
            parent = by_key.get(spec["parent_key"]) if spec["parent_key"] else None
            if resource.parent_id != (parent.id if parent else None):
                resource.parent = parent
                resource.save(update_fields=["parent"])

        self.stdout.write(
            f"      {len(specs)} recursos ({created} nuevos), {len(MENU)} entradas de menu."
        )

    def _deactivate_legacy_resources(self):
        legacy = Resource.objects.filter(key__in=LEGACY_KEYS, is_active=True)
        keys = sorted(legacy.values_list("key", flat=True))
        if not keys:
            return

        legacy.update(is_active=False, is_menu=False)
        RoleResource.objects.filter(resource__key__in=keys).update(is_active=False)
        self.stdout.write(f"      Desactivados {len(keys)} recursos heredados: {', '.join(keys)}")

    # -- roles -------------------------------------------------------------

    def _seed_roles(self):
        self.stdout.write("  Creando/actualizando Roles...")

        for slug, data in ROLES.items():
            role, created = Role.objects.update_or_create(
                slug=slug,
                defaults={
                    "name": data["name"],
                    "description": data["description"],
                    "is_active": True,
                },
            )

            resources = list(Resource.objects.filter(key__in=data["keys"], is_active=True))
            found = {resource.key for resource in resources}
            missing = sorted(set(data["keys"]) - found)
            if missing:
                self.stdout.write(
                    self.style.WARNING(f"      {slug}: claves inexistentes -> {', '.join(missing)}")
                )

            RoleResource.objects.filter(role=role).update(is_active=False)
            for resource in resources:
                link, link_created = RoleResource.objects.get_or_create(
                    role=role,
                    resource=resource,
                    defaults={"is_active": True},
                )
                if not link_created and not link.is_active:
                    link.is_active = True
                    link.save(update_fields=["is_active"])

            verb = "CREADO " if created else "actualizado"
            self.stdout.write(f"      {verb} -> {slug} ({len(resources)} recursos)")

    # -- cargos ------------------------------------------------------------

    def _seed_job_titles(self):
        self.stdout.write("  Creando/actualizando cargos...")

        total = 0
        created_total = 0
        for role_slug, titles in JOB_TITLE_CATALOG.items():
            role = Role.objects.filter(slug=role_slug, is_active=True).first()
            if role is None:
                self.stdout.write(
                    self.style.WARNING(f"      No existe el rol activo '{role_slug}' para sembrar cargos.")
                )
                continue

            for index, title in enumerate(titles, start=1):
                _, created = JobTitle.objects.update_or_create(
                    role=role,
                    slug=self._slugify_title(title),
                    defaults={
                        "name": title,
                        "description": "",
                        "is_active": True,
                        "sort_order": index,
                    },
                )
                total += 1
                created_total += int(created)

        self.stdout.write(f"      {total} cargos ({created_total} nuevos).")

    def _slugify_title(self, title):
        from django.utils.text import slugify

        return slugify(title)

    # -- usuarios ----------------------------------------------------------

    def _admin_roles(self, user):
        """Roles de administrador que corresponden a un superusuario.

        El administrador de plataforma es superusuario **sin** hotel (AGENTS.md 5.4):
        ademas del rol `admin` necesita `platform_admin` para ver el menu SaaS.
        """
        slugs = ["admin"]
        if user.hotel_settings_id is None:
            slugs.append("platform_admin")
        return list(Role.objects.filter(slug__in=slugs, is_active=True))

    def _seed_superuser(self):
        self.stdout.write("  Revisando superusuario demo...")

        user = User.objects.filter(username="admin").first()
        if user is None:
            user = User.objects.create_superuser(
                username="admin",
                email="admin@hotel.local",
                password="admin12345",
            )
            self.stdout.write(self.style.SUCCESS("      Superusuario creado -> admin / admin12345"))
            self.stdout.write(self.style.WARNING("      Cambiar esta contrasena en produccion."))

        added = self._ensure_roles(user)
        if added:
            self.stdout.write(f"      Roles asignados a 'admin': {', '.join(added)}")
        else:
            self.stdout.write("      El superusuario 'admin' ya tenia sus roles.")

    def _ensure_roles(self, user):
        added = []
        for role in self._admin_roles(user):
            if not user.roles.filter(pk=role.pk).exists():
                user.roles.add(role)
                added.append(role.slug)
        return added

    def _assign_admin_to_superusers(self):
        self.stdout.write("  Asignando roles de administrador a los superusuarios...")

        if not Role.objects.filter(slug="admin", is_active=True).exists():
            self.stdout.write(
                self.style.ERROR("      No existe el rol 'admin'. Corre el seed completo primero.")
            )
            return

        count = 0
        for user in User.objects.filter(is_superuser=True):
            added = self._ensure_roles(user)
            if added:
                count += 1
                self.stdout.write(f"      {user.username}: {', '.join(added)}")

        if count == 0:
            self.stdout.write("      Todos los superusuarios ya tenian sus roles.")
        else:
            self.stdout.write(self.style.SUCCESS(f"      Actualizados {count} superusuario(s)."))
