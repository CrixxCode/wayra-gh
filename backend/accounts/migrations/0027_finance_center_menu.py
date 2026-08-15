"""Consolidado de ingresos y egresos pasan a una sola entrada de menu.

Las dos pantallas se consolidaron en `/finanzas` con pestañas, y el contenedor aporta el
**resultado** --ingresos menos egresos--, que no estaba en ninguna de las dos.

`financial_control.read` **no se toca**: control financiero es analisis (tablero,
escenarios, estados) y sigue siendo su propia entrada. Se queda como segundo hijo del
grupo *Finanzas*, que por eso no se desactiva aqui.
"""

from django.db import migrations

MENU_KEY = "finance_center.read"

DEMOTED_KEYS = ["income_consolidated.read", "expenses.read"]

HOTEL_ROLE_SLUGS = ["admin", "manager", "staff"]


def unify_finance_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    group = Resource.objects.filter(key="finance").first()

    resource, _ = Resource.objects.update_or_create(
        key=MENU_KEY,
        defaults={
            "name": "Ingresos y egresos",
            "description": "Consolidado de ingresos y egresos con el resultado del periodo.",
            "icon": "",
            "link": "/finanzas",
            "link_backend": "",
            "is_menu": True,
            "order": 1,
            "parent": group,
            "is_active": True,
        },
    )

    # La ve quien ya veia cualquiera de las dos pantallas.
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

    # Control financiero sube a segundo hijo del grupo.
    Resource.objects.filter(key="financial_control.read").update(order=2)


def restore_split_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key=MENU_KEY).delete()

    group = Resource.objects.filter(key="finance").first()

    Resource.objects.filter(key="income_consolidated.read").update(
        is_menu=True, link="/consolidado-ingresos", order=1, parent=group
    )
    Resource.objects.filter(key="expenses.read").update(
        is_menu=True, link="/egresos", order=2, parent=group
    )
    Resource.objects.filter(key="financial_control.read").update(order=3)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0026_operations_center_menu"),
    ]

    operations = [
        migrations.RunPython(unify_finance_menu, restore_split_menu),
    ]
