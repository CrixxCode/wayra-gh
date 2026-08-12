"""Tareas de limpieza y ordenes de mantenimiento pasan a una sola entrada de menu.

Las dos pantallas se consolidaron en `/limpieza-mantenimiento` con pestañas. El menu se
arma desde la base (AGENTS.md 5.6), asi que sin esta migracion el aside seguiria
ofreciendo dos destinos que ahora redirigen.

Misma separacion que en 0023, 0024 y 0025: la entrada nueva `operations_center.read` es
solo de menu, y `cleaning_tasks.*` y `maintenance_orders.*` siguen protegiendo sus
endpoints.
"""

from django.db import migrations

MENU_KEY = "operations_center.read"

DEMOTED_KEYS = ["cleaning_tasks.read", "maintenance_orders.read"]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def unify_operations_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    resource, _ = Resource.objects.update_or_create(
        key=MENU_KEY,
        defaults={
            "name": "Limpieza y mantenimiento",
            "description": "Tareas de limpieza y ordenes de mantenimiento en una sola pantalla.",
            "icon": "fa-solid fa-screwdriver-wrench",
            "link": "/limpieza-mantenimiento",
            "link_backend": "",
            "is_menu": True,
            "order": 10,
            "parent": None,
            "is_active": True,
        },
    )

    roles = Role.objects.filter(
        slug__in=HOTEL_ROLE_SLUGS,
        roleresource__resource__key__in=DEMOTED_KEYS,
        roleresource__is_active=True,
    ).distinct()
    for role in roles:
        RoleResource.objects.update_or_create(
            role=role, resource=resource, defaults={"is_active": True}
        )

    Resource.objects.filter(key__in=DEMOTED_KEYS).update(is_menu=False, link="", parent=None)

    # El grupo "Limpieza y mantenimiento" se queda sin hijos.
    Resource.objects.filter(key="mantenimiento").update(is_menu=False, is_active=False)


def restore_split_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key=MENU_KEY).delete()

    group, _ = Resource.objects.update_or_create(
        key="mantenimiento",
        defaults={
            "name": "Limpieza y mantenimiento",
            "description": "Grupo de menu.",
            "icon": "fa-solid fa-screwdriver-wrench",
            "link": "",
            "link_backend": "",
            "is_menu": True,
            "order": 10,
            "parent": None,
            "is_active": True,
        },
    )

    Resource.objects.filter(key="cleaning_tasks.read").update(
        is_menu=True, link="/tareas-limpieza", order=1, parent=group
    )
    Resource.objects.filter(key="maintenance_orders.read").update(
        is_menu=True, link="/ordenes-mantenimiento", order=2, parent=group
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0025_inventory_center_menu"),
    ]

    operations = [
        migrations.RunPython(unify_operations_menu, restore_split_menu),
    ]
