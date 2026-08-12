"""Usuarios, Roles, Recursos y Master Data pasan al panel SaaS.

Son pantallas de administracion de la plataforma: definen quien entra al sistema, con
que permisos y sobre que enums opera el codigo. Un hotel no deberia verlas y mucho menos
editarlas para todos los demas.

Lo importante del cambio es la separacion entre **ver la pagina** y **usar la API**:

- Las entradas de menu pasan a ser recursos propios (`saas_*`), asignados solo al rol
  `platform_admin`.
- Los scopes de dominio (`users.*`, `roles.*`, `resources.*`, `master_data.*`) dejan de
  ser menu pero **siguen existiendo**, porque `master_data.read` lo consumen doce
  pantallas de hotel (facturas, limpieza, inventario, reservas...). Quitarselo a los
  roles de hotel las romperia con 403.
"""

from django.db import migrations

SAAS_GROUP_KEY = "saasadmin.button"

# (key, nombre, icono, link, orden)
SAAS_ENTRIES = [
    ("saas_users.read", "Usuarios", "pi pi-users", "/usuarios", 5),
    ("saas_roles.read", "Roles", "pi pi-shield", "/roles", 6),
    ("saas_resources.read", "Recursos", "pi pi-list", "/recursos", 7),
    ("saas_master_data.read", "Master Data", "pi pi-database", "/master-data", 8),
]

# Recursos de dominio que dejan de aparecer en el menu (conservan su rol de scope).
DEMOTED_KEYS = ["users.read", "roles.read", "resources.read", "master_data.read"]

# Scopes que un usuario de hotel ya no necesita ni por API.
PLATFORM_ONLY_PREFIXES = ["users.", "roles.", "resources."]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def move_security_into_saas(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    group = Resource.objects.filter(key=SAAS_GROUP_KEY).first()
    platform_admin = Role.objects.filter(slug="platform_admin").first()

    for key, name, icon, link, order in SAAS_ENTRIES:
        resource, _ = Resource.objects.update_or_create(
            key=key,
            defaults={
                "name": name,
                "description": "Administracion de la plataforma.",
                "icon": icon,
                "link": link,
                "link_backend": "",
                "is_menu": True,
                "order": order,
                "parent": group,
                "is_active": True,
            },
        )

        if platform_admin is not None:
            RoleResource.objects.update_or_create(
                role=platform_admin, resource=resource, defaults={"is_active": True}
            )

    # Los scopes siguen vivos, pero salen del menu lateral.
    Resource.objects.filter(key__in=DEMOTED_KEYS).update(is_menu=False, link="", parent=None)

    # El grupo "Seguridad" se queda sin hijos.
    Resource.objects.filter(key="security").update(is_menu=False, is_active=False)

    # Los roles de hotel pierden la administracion de usuarios y RBAC.
    for prefix in PLATFORM_ONLY_PREFIXES:
        RoleResource.objects.filter(
            role__slug__in=HOTEL_ROLE_SLUGS, resource__key__startswith=prefix
        ).update(is_active=False)


def restore_security_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key__in=[key for key, *_ in SAAS_ENTRIES]).delete()

    group, _ = Resource.objects.update_or_create(
        key="security",
        defaults={
            "name": "Seguridad",
            "description": "Grupo de menu.",
            "icon": "fa-solid fa-shield-halved",
            "link": "",
            "link_backend": "",
            "is_menu": True,
            "order": 14,
            "parent": None,
            "is_active": True,
        },
    )

    previous = [
        ("users.read", "Usuarios", "pi pi-users", "/usuarios", 1),
        ("roles.read", "Roles", "pi pi-shield", "/roles", 2),
        ("resources.read", "Recursos", "pi pi-list", "/recursos", 3),
        ("master_data.read", "Master Data", "pi pi-database", "/master-data", 4),
    ]
    for key, name, icon, link, order in previous:
        Resource.objects.filter(key=key).update(
            is_menu=True, link=link, icon=icon, order=order, parent=group
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0021_saas_global_amenities_menu"),
    ]

    operations = [
        migrations.RunPython(move_security_into_saas, restore_security_menu),
    ]
