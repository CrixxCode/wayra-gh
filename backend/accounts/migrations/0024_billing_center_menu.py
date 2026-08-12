"""Facturas, pagos y reembolsos pasan a una sola entrada de menu.

Las tres pantallas se consolidaron en `/facturacion` con pestañas. El menu se arma desde
la base (AGENTS.md 5.6), asi que sin esta migracion el aside seguiria ofreciendo tres
destinos que ahora redirigen.

Se separa **ver la pagina** del **permiso de API**, igual que en 5.17 y en la migracion
0023: la entrada nueva `billing_center.read` es solo de menu, y `invoices.*` y
`payments.*` siguen protegiendo sus endpoints.

`payment-refunds.read` se conserva en los roles que ya lo tenian: dejo de ser una entrada
de menu, pero `BillingPage` lo usa para decidir si pinta la pestaña de reembolsos. Sin el,
recepcion habria heredado un acceso que hoy no tiene.
"""

from django.db import migrations

MENU_KEY = "billing_center.read"

# Recursos que dejan de ser entrada de menu (conservan su rol de scope).
DEMOTED_KEYS = ["invoices.read", "payments.read", "payment-refunds.read"]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def unify_billing_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    resource, _ = Resource.objects.update_or_create(
        key=MENU_KEY,
        defaults={
            "name": "Facturas y pagos",
            "description": "Facturas, pagos y reembolsos en una sola pantalla.",
            "icon": "fa-solid fa-credit-card",
            "link": "/facturacion",
            "link_backend": "",
            "is_menu": True,
            "order": 7,
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

    # El grupo "Facturas y pagos" se queda sin hijos.
    Resource.objects.filter(key="invoicesandpayment").update(is_menu=False, is_active=False)


def restore_split_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key=MENU_KEY).delete()

    group, _ = Resource.objects.update_or_create(
        key="invoicesandpayment",
        defaults={
            "name": "Facturas y pagos",
            "description": "Grupo de menu.",
            "icon": "fa-solid fa-credit-card",
            "link": "",
            "link_backend": "",
            "is_menu": True,
            "order": 7,
            "parent": None,
            "is_active": True,
        },
    )

    Resource.objects.filter(key="invoices.read").update(
        is_menu=True, link="/facturas", order=1, parent=group
    )
    Resource.objects.filter(key="payments.read").update(
        is_menu=True, link="/pagos", order=2, parent=group
    )
    Resource.objects.filter(key="payment-refunds.read").update(
        is_menu=True, link="/reembolsos", order=3, parent=group
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0023_commercial_catalog_menu"),
    ]

    operations = [
        migrations.RunPython(unify_billing_menu, restore_split_menu),
    ]
