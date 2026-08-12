"""Items, dotacion por habitacion y movimientos pasan a una sola entrada de menu.

Las tres pantallas se consolidaron en `/inventario` con pestañas. El menu se arma desde
la base (AGENTS.md 5.6), asi que sin esta migracion el aside seguiria ofreciendo tres
destinos que ahora redirigen.

Misma separacion que en 0023 y 0024: la entrada nueva `inventory_center.read` es solo de
menu, y `items.*`, `room-inventory.*` e `inventory-movements.*` siguen protegiendo sus
endpoints.
"""

from django.db import migrations

MENU_KEY = "inventory_center.read"

# Recursos que dejan de ser entrada de menu (conservan su rol de scope).
DEMOTED_KEYS = ["items.read", "room-inventory.read", "inventory-movements.read"]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def unify_inventory_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    resource, _ = Resource.objects.update_or_create(
        key=MENU_KEY,
        defaults={
            "name": "Inventario",
            "description": "Items, dotacion por habitacion y movimientos en una sola pantalla.",
            "icon": "fa-solid fa-boxes-stacked",
            "link": "/inventario",
            "link_backend": "",
            "is_menu": True,
            "order": 9,
            "parent": None,
            "is_active": True,
        },
    )

    # La ve quien ya veia cualquiera de las tres pantallas.
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

    # El grupo "Inventario" se queda sin hijos.
    Resource.objects.filter(key="inventory").update(is_menu=False, is_active=False)


def restore_split_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key=MENU_KEY).delete()

    group, _ = Resource.objects.update_or_create(
        key="inventory",
        defaults={
            "name": "Inventario",
            "description": "Grupo de menu.",
            "icon": "fa-solid fa-boxes-stacked",
            "link": "",
            "link_backend": "",
            "is_menu": True,
            "order": 9,
            "parent": None,
            "is_active": True,
        },
    )

    Resource.objects.filter(key="items.read").update(
        is_menu=True, link="/items", order=1, parent=group
    )
    Resource.objects.filter(key="room-inventory.read").update(
        is_menu=True, link="/inventario-habitaciones", order=2, parent=group
    )
    Resource.objects.filter(key="inventory-movements.read").update(
        is_menu=True, link="/movimientos-inventario", order=3, parent=group
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0024_billing_center_menu"),
    ]

    operations = [
        migrations.RunPython(unify_inventory_menu, restore_split_menu),
    ]
