"""Servicios, paquetes y promociones pasan a una sola entrada de menu.

Las tres pantallas se consolidaron en `/catalogo-comercial` con pestañas. El menu se
arma desde la base (AGENTS.md 5.6), asi que sin esta migracion el aside seguiria
ofreciendo tres destinos que ahora redirigen.

Se separa **ver la pagina** del **permiso de API**, igual que en 5.17: la entrada nueva
`commercial_catalog.read` es solo de menu, y `services.*`, `packages.*` y `promotions.*`
siguen protegiendo sus endpoints.
"""

from django.db import migrations

MENU_KEY = "commercial_catalog.read"

# Recursos de dominio que dejan de ser entrada de menu (conservan su rol de scope).
DEMOTED_KEYS = ["services.read", "packages.read", "promotions.read"]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def unify_catalog_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    resource, _ = Resource.objects.update_or_create(
        key=MENU_KEY,
        defaults={
            "name": "Catalogo comercial",
            "description": "Servicios, paquetes y promociones en una sola pantalla.",
            "icon": "fa-solid fa-bell-concierge",
            "link": "/catalogo-comercial",
            "link_backend": "",
            "is_menu": True,
            "order": 5,
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

    # El grupo "Paquetes y promociones" se queda sin hijos.
    Resource.objects.filter(key="packages").update(is_menu=False, is_active=False)


def restore_split_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key=MENU_KEY).delete()

    group, _ = Resource.objects.update_or_create(
        key="packages",
        defaults={
            "name": "Paquetes y promociones",
            "description": "Grupo de menu.",
            "icon": "fa-solid fa-box-open",
            "link": "",
            "link_backend": "",
            "is_menu": True,
            "order": 6,
            "parent": None,
            "is_active": True,
        },
    )

    Resource.objects.filter(key="services.read").update(
        is_menu=True,
        link="/catalogo-servicios",
        icon="fa-solid fa-bell-concierge",
        order=5,
        parent=None,
    )
    Resource.objects.filter(key="packages.read").update(
        is_menu=True, link="/catalogo-paquetes", order=1, parent=group
    )
    Resource.objects.filter(key="promotions.read").update(
        is_menu=True, link="/promociones", order=2, parent=group
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0022_security_menu_into_saas"),
    ]

    operations = [
        migrations.RunPython(unify_catalog_menu, restore_split_menu),
    ]
