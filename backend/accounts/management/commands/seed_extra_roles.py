"""
Management command: seed_extra_roles
======================================
Crea/actualiza roles operativos adicionales a los cuatro roles base que siembra
`seed_rbac` (admin, manager, staff, platform_admin). Se deja como comando
aparte a proposito: `seed_rbac` documenta que solo reescribe esos cuatro roles
y que "los roles creados a mano por un hotel no se tocan" -- estos seis roles
se tratan igual, como roles manuales, para no romper esa garantia ni el
comportamiento reproducible de `seed_rbac`.

Requiere que `seed_rbac` ya se haya corrido antes (usa los Resource y el rol
`staff` que ese comando crea). Si falta algun rol base, el comando se detiene
sin tocar nada.

Roles que crea o actualiza:
- reception       Recepcion       -- exactamente los mismos recursos que `staff`
                                     (recepcion ya es lo que hace `staff` hoy).
- housekeeping    Limpieza        -- lectura/escritura de tareas de limpieza;
                                     lectura de habitaciones para saber que limpiar.
- maintenance     Mantenimiento   -- lectura/escritura de ordenes de mantenimiento
                                     y trabajo recurrente; lectura de habitaciones.
- finance         Finanzas        -- lectura/escritura de facturas, pagos, notas
                                     credito, egresos y control financiero; lectura
                                     de reportes y de reservas/cargos como contexto.
- inventory       Inventario      -- lectura/escritura de items, movimientos e
                                     inventario por habitacion; lectura de habitaciones.
- auditor         Auditor         -- solo lectura de toda la operacion del hotel,
                                     reportes y auditoria. Ningun scope de escritura.

Los roles `platform_admin` (Superadministrador), `manager` (Gerente) y
`admin` (Administrador del hotel) ya existen en `seed_rbac` -- este comando no
crea un slug `hotel_admin` aparte, reusa `admin`.

Uso (desde backend/, o via `railway run` en el servicio de Railway):
    python manage.py seed_extra_roles
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify

from accounts.models import JobTitle, Resource, Role, RoleResource

COMMON_KEYS = ["dashboard.view", "profile.read", "auth.password.change"]

# Roles que ya siembra `seed_rbac` y que este comando necesita encontrar antes
# de correr (para copiar recursos de `staff` y no pisar `admin`/`manager`/`platform_admin`).
EXPECTED_BASE_ROLE_SLUGS = ["admin", "manager", "platform_admin", "staff"]


def _read(prefix):
    return f"{prefix}.read"


def _write(prefix):
    return f"{prefix}.write"


# (slug, nombre, descripcion, dominios propios [lectura+escritura],
#  dominios de solo lectura para dar contexto, claves sueltas extra de navegacion)
ROLE_SPECS = [
    (
        "housekeeping",
        "Limpieza",
        "Maneja tareas de limpieza y estado operativo de habitaciones.",
        ["cleaning_tasks", "notifications"],
        ["rooms", "room_type", "recurring_work"],
        ["operations_center.read"],
    ),
    (
        "maintenance",
        "Mantenimiento",
        "Maneja ordenes de mantenimiento y trabajo recurrente.",
        ["maintenance_orders", "recurring_work", "notifications"],
        ["rooms", "room_type"],
        ["operations_center.read"],
    ),
    (
        "finance",
        "Finanzas",
        "Maneja facturas, pagos, reembolsos, notas credito, egresos, control "
        "financiero y reportes.",
        ["invoices", "payments", "credit-notes", "expenses", "financial_control", "notifications"],
        ["charges", "reservations", "reports"],
        [
            "billing_center.read",
            "finance_center.read",
            "income_consolidated.read",
            "payment-refunds.read",
        ],
    ),
    (
        "inventory",
        "Inventario",
        "Maneja items, movimientos e inventario por habitacion.",
        ["items", "inventory-movements", "room-inventory", "notifications"],
        ["rooms"],
        ["inventory_center.read"],
    ),
]

# Dominios operativos del hotel (excluye users/roles/resources, que son del panel
# SaaS de plataforma, no de la operacion de un hotel).
AUDITOR_READ_DOMAINS = [
    "hotel_settings", "reservation-policies", "master_data", "clients", "rooms",
    "room_type", "rates", "amenities", "cleaning_tasks", "maintenance_orders",
    "recurring_work", "reservations", "reservation_rooms", "reservation_guests",
    "reservation_deposits", "reservation_inventory_checks", "reservation_inventory_check_lines",
    "services", "packages", "promotions", "charges", "invoices", "payments",
    "credit-notes", "expenses", "financial_control", "items", "inventory-movements",
    "room-inventory", "reports",
]
AUDITOR_EXTRA_KEYS = [
    "audit.read", "commercial_catalog.read", "billing_center.read",
    "inventory_center.read", "operations_center.read", "finance_center.read",
    "income_consolidated.read", "payment-refunds.read",
]

JOB_TITLES = {
    "reception": ["Recepcionista", "Auxiliar de recepcion"],
    "housekeeping": ["Camarera de habitaciones", "Ama de llaves", "Auxiliar de limpieza"],
    "maintenance": ["Tecnico de mantenimiento", "Auxiliar de mantenimiento"],
    "finance": ["Auxiliar financiero", "Responsable de facturacion"],
    "inventory": ["Auxiliar de inventario", "Almacenista"],
    "auditor": ["Auditor interno", "Auditor externo"],
}


class Command(BaseCommand):
    help = (
        "Crea/actualiza los roles operativos adicionales: reception, housekeeping, "
        "maintenance, finance, inventory y auditor."
    )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\nSembrando roles adicionales...\n"))

        self._check_base_roles_exist()

        for slug, name, description, keys in self._build_role_key_specs():
            self._upsert_role(slug, name, description, keys)

        self._seed_job_titles()

        self.stdout.write(self.style.SUCCESS("\nRoles adicionales sembrados.\n"))

    def _check_base_roles_exist(self):
        missing = [
            slug for slug in EXPECTED_BASE_ROLE_SLUGS
            if not Role.objects.filter(slug=slug, is_active=True).exists()
        ]
        if missing:
            raise CommandError(
                "Faltan roles base (corre 'python manage.py seed_rbac' primero): "
                + ", ".join(missing)
            )

    def _build_role_key_specs(self):
        specs = []

        staff_role = Role.objects.get(slug="staff", is_active=True)
        staff_keys = sorted(
            RoleResource.objects.filter(role=staff_role, is_active=True)
            .values_list("resource__key", flat=True)
        )
        specs.append((
            "reception",
            "Recepcion",
            "Maneja reservas, huespedes, check-in/check-out, habitaciones, cargos, "
            "facturas y pagos.",
            staff_keys,
        ))

        for slug, name, description, write_domains, read_only_domains, extra_keys in ROLE_SPECS:
            keys = set(COMMON_KEYS) | set(extra_keys)
            for prefix in write_domains:
                keys.add(_read(prefix))
                keys.add(_write(prefix))
            for prefix in read_only_domains:
                keys.add(_read(prefix))
            specs.append((slug, name, description, sorted(keys)))

        auditor_keys = set(COMMON_KEYS) | set(AUDITOR_EXTRA_KEYS)
        for prefix in AUDITOR_READ_DOMAINS:
            auditor_keys.add(_read(prefix))
        specs.append((
            "auditor",
            "Auditor",
            "Solo lectura de operacion, reportes y auditoria del hotel.",
            sorted(auditor_keys),
        ))

        return specs

    def _upsert_role(self, slug, name, description, keys):
        role, created = Role.objects.update_or_create(
            slug=slug,
            defaults={"name": name, "description": description, "is_active": True},
        )

        resources = list(Resource.objects.filter(key__in=keys, is_active=True))
        found = {resource.key for resource in resources}
        missing = sorted(set(keys) - found)
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

    def _seed_job_titles(self):
        self.stdout.write("  Creando/actualizando cargos...")

        total = 0
        created_total = 0
        for role_slug, titles in JOB_TITLES.items():
            role = Role.objects.filter(slug=role_slug, is_active=True).first()
            if role is None:
                continue

            for index, title in enumerate(titles, start=1):
                _, created = JobTitle.objects.update_or_create(
                    role=role,
                    slug=slugify(title),
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
