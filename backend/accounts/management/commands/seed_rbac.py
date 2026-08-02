"""
Management command: seed_rbac
=============================
Creates or updates Resources, Roles, and demo superuser.

Usage:
    python manage.py seed_rbac                  # full seed
    python manage.py seed_rbac --only-resources # only resources
    python manage.py seed_rbac --assign-admin   # assign admin role to all superusers
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.models import Resource, Role, RoleResource

User = get_user_model()

# Tuple format:
# (key, name, icon, link, link_backend, is_menu, order, parent_key)
RESOURCES = [
    (
        "dashboard.view",
        "Dashboard",
        "pi pi-home",
        "/dashboard",
        "",
        True,
        1,
        None,
    ),
    (
        "users.read",
        "Usuarios",
        "pi pi-users",
        "/usuarios",
        "/api/users/",
        True,
        2,
        None,
    ),
    (
        "users.write",
        "Gestionar usuarios",
        "",
        "",
        "/api/users/",
        False,
        0,
        None,
    ),
    (
        "clients.read",
        "Clientes y huespedes",
        "pi pi-id-card",
        "/clientes",
        "/api/clients/",
        True,
        3,
        None,
    ),
    (
        "clients.write",
        "Gestionar clientes",
        "",
        "",
        "/api/clients/",
        False,
        0,
        None,
    ),
    (
        "roles.read",
        "Roles",
        "pi pi-shield",
        "/roles",
        "/api/roles/",
        True,
        4,
        None,
    ),
    (
        "roles.write",
        "Gestionar roles",
        "",
        "",
        "/api/roles/",
        False,
        0,
        None,
    ),
    (
        "resources.read",
        "Recursos",
        "pi pi-list",
        "/recursos",
        "/api/resources/",
        True,
        5,
        None,
    ),
    (
        "resources.write",
        "Gestionar recursos",
        "",
        "",
        "/api/resources/",
        False,
        0,
        None,
    ),
    (
        "notifications.read",
        "Notificaciones",
        "pi pi-bell",
        "",
        "/api/notifications/",
        False,
        0,
        None,
    ),
    (
        "notifications.write",
        "Gestionar notificaciones",
        "",
        "",
        "/api/notifications/",
        False,
        0,
        None,
    ),
    (
        "master_data.read",
        "Master Data",
        "pi pi-database",
        "/master-data",
        "/api/master-data/",
        True,
        6,
        None,
    ),
    (
        "master_data.write",
        "Gestionar master data",
        "",
        "",
        "/api/master-data/",
        False,
        0,
        None,
    ),
    (
        "amenities.read",
        "Amenidades",
        "pi pi-star",
        "/amenidades",
        "/api/amenities/",
        True,
        7,
        None,
    ),
    (
        "amenities.write",
        "Gestionar amenidades",
        "",
        "",
        "/api/amenities/",
        False,
        0,
        None,
    ),
    (
        "expenses.read",
        "Egresos",
        "pi pi-wallet",
        "/egresos",
        "/api/expenses/",
        True,
        8,
        None,
    ),
    (
        "expenses.write",
        "Gestionar egresos",
        "",
        "",
        "/api/expenses/",
        False,
        0,
        None,
    ),
    (
        "financial_control.read",
        "Control financiero",
        "pi pi-chart-line",
        "/control-financiero",
        "/api/financial-control/",
        True,
        9,
        None,
    ),
    (
        "financial_control.write",
        "Gestionar control financiero",
        "",
        "",
        "/api/financial-control/",
        False,
        0,
        None,
    ),
    (
        "hotel_settings.read",
        "Configuracion del hotel",
        "pi pi-building",
        "/hotel-config",
        "/api/hotel-settings/",
        True,
        10,
        None,
    ),
    (
        "hotel_settings.write",
        "Gestionar configuracion del hotel",
        "",
        "",
        "/api/hotel-settings/",
        False,
        0,
        None,
    ),
    (
        "auth.password.change",
        "Cambiar contrasena",
        "pi pi-key",
        "",
        "/api/auth/password/change/",
        False,
        0,
        None,
    ),
]

# Role definitions: slug -> metadata + resource keys
ROLES = {
    "admin": {
        "name": "Administrador",
        "description": "Acceso total al sistema.",
        "keys": [
            "dashboard.view",
            "users.read",
            "users.write",
            "clients.read",
            "clients.write",
            "roles.read",
            "roles.write",
            "resources.read",
            "resources.write",
            "notifications.read",
            "notifications.write",
            "master_data.read",
            "master_data.write",
            "amenities.read",
            "amenities.write",
            "expenses.read",
            "expenses.write",
            "financial_control.read",
            "financial_control.write",
            "hotel_settings.read",
            "hotel_settings.write",
            "auth.password.change",
        ],
    },
    "manager": {
        "name": "Gerente",
        "description": "Acceso de lectura y gestion basica.",
        "keys": [
            "dashboard.view",
            "users.read",
            "clients.read",
            "roles.read",
            "resources.read",
            "notifications.read",
            "notifications.write",
            "master_data.read",
            "amenities.read",
            "expenses.read",
            "financial_control.read",
            "hotel_settings.read",
            "auth.password.change",
        ],
    },
    "staff": {
        "name": "Personal",
        "description": "Acceso basico al sistema.",
        "keys": [
            "dashboard.view",
            "clients.read",
            "notifications.read",
            "auth.password.change",
        ],
    },
}


class Command(BaseCommand):
    help = "Creates or updates Resources, Roles and demo superuser."

    def add_arguments(self, parser):
        parser.add_argument(
            "--only-resources",
            action="store_true",
            help="Only create/update Resources (do not touch roles or users).",
        )
        parser.add_argument(
            "--assign-admin",
            action="store_true",
            help="Assign 'admin' role to all existing superusers.",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("\nStarting RBAC seed...\n"))

        self._seed_resources()

        if not options["only_resources"]:
            self._seed_roles()
            self._seed_superuser()

        if options["assign_admin"]:
            self._assign_admin_to_superusers()

        self.stdout.write(self.style.SUCCESS("\nRBAC seed completed.\n"))

    def _seed_resources(self):
        self.stdout.write("  Creating/updating Resources...")

        created_map: dict[str, Resource] = {}

        for key, name, icon, link, link_backend, is_menu, order, parent_key in RESOURCES:
            parent = created_map.get(parent_key) if parent_key else None

            obj, created = Resource.objects.update_or_create(
                key=key,
                defaults={
                    "name": name,
                    "icon": icon,
                    "link": link,
                    "link_backend": link_backend,
                    "is_menu": is_menu,
                    "order": order,
                    "parent": parent,
                    "is_active": True,
                },
            )
            created_map[key] = obj
            verb = "CREATED" if created else "updated"
            self.stdout.write(f"      {verb} -> {key}")

    def _seed_roles(self):
        self.stdout.write("  Creating/updating Roles...")

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

            verb = "CREATED" if created else "updated"
            self.stdout.write(f"      {verb} -> {slug} ({len(resources)} resources)")

    def _seed_superuser(self):
        self.stdout.write("  Checking demo superuser...")

        if not User.objects.filter(username="admin").exists():
            admin_user = User.objects.create_superuser(
                username="admin",
                email="admin@hotel.local",
                password="admin12345",
            )
            admin_role = Role.objects.filter(slug="admin").first()
            if admin_role:
                admin_user.roles.add(admin_role)

            self.stdout.write(self.style.SUCCESS("      Superuser created -> admin / admin12345"))
            self.stdout.write(self.style.WARNING("      Change this password in production."))
        else:
            existing = User.objects.get(username="admin")
            admin_role = Role.objects.filter(slug="admin").first()
            if admin_role and not existing.roles.filter(slug="admin").exists():
                existing.roles.add(admin_role)
                self.stdout.write("      Assigned 'admin' role to existing superuser.")
            else:
                self.stdout.write("      Superuser 'admin' already exists and has role.")

    def _assign_admin_to_superusers(self):
        self.stdout.write("  Assigning 'admin' role to all superusers...")

        admin_role = Role.objects.filter(slug="admin").first()
        if not admin_role:
            self.stdout.write(self.style.ERROR("      Role 'admin' not found. Run full seed first."))
            return

        superusers = User.objects.filter(is_superuser=True)
        count = 0
        for user in superusers:
            if not user.roles.filter(slug="admin").exists():
                user.roles.add(admin_role)
                count += 1
                self.stdout.write(f"      {user.username}")

        if count == 0:
            self.stdout.write("      All superusers already had 'admin' role.")
        else:
            self.stdout.write(self.style.SUCCESS(f"      Updated {count} superuser(s)."))
