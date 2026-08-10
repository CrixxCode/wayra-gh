"""
Aplana el menu de Habitaciones a una sola entrada.

Tras 0019, el grupo `rooms.view` ("Habitaciones") quedo con un unico hijo visible,
`rooms.read` ("Ver habitaciones"), produciendo un desplegable de un solo elemento.

Se promueve `rooms.read` a entrada de primer nivel, heredando nombre, icono y orden
del grupo, y se saca `rooms.view` del menu.

Por que se promueve el hijo y no se le pone el link al padre: `get_menu()` parte de
los recursos ASIGNADOS al usuario y solo despues arrastra a sus padres. Si el item
visible fuera `rooms.view`, un rol que tenga `rooms.read` pero no `rooms.view` se
quedaria sin la entrada. `rooms.read` es el permiso que realmente habilita la vista,
asi que es el que debe aparecer.

`rooms.view` se mantiene ACTIVO (solo deja de ser menu): sigue siendo el padre de los
recursos de tipos, tarifas y amenidades, y desactivarlo no aporta nada.
"""
from django.db import migrations

GROUP_KEY = "rooms.view"
LEAF_KEY = "rooms.read"

LEAF_MENU_STATE = {
    "name": "Habitaciones",
    "icon": "fa-solid fa-bed",
    "link": "/habitaciones",
    "order": 2,
}

# Estado previo, para revertir.
PREVIOUS_LEAF_STATE = {
    "name": "Ver habitaciones",
    "icon": "",
    "link": "/habitaciones",
    "order": 1,
}


def flatten_rooms_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    leaf = Resource.objects.filter(key=LEAF_KEY).first()
    if leaf is None:
        return

    group = Resource.objects.filter(key=GROUP_KEY).first()

    leaf.parent = None
    leaf.name = LEAF_MENU_STATE["name"]
    leaf.icon = LEAF_MENU_STATE["icon"]
    leaf.link = LEAF_MENU_STATE["link"]
    leaf.order = group.order if group else LEAF_MENU_STATE["order"]
    leaf.is_menu = True
    leaf.save(update_fields=["parent", "name", "icon", "link", "order", "is_menu"])

    if group is not None:
        group.is_menu = False
        group.save(update_fields=["is_menu"])


def restore_rooms_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    group = Resource.objects.filter(key=GROUP_KEY).first()
    if group is not None:
        group.is_menu = True
        group.save(update_fields=["is_menu"])

    leaf = Resource.objects.filter(key=LEAF_KEY).first()
    if leaf is None:
        return

    leaf.parent = group
    leaf.name = PREVIOUS_LEAF_STATE["name"]
    leaf.icon = PREVIOUS_LEAF_STATE["icon"]
    leaf.link = PREVIOUS_LEAF_STATE["link"]
    leaf.order = PREVIOUS_LEAF_STATE["order"]
    leaf.save(update_fields=["parent", "name", "icon", "link", "order"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0019_consolidate_rooms_menu"),
    ]

    operations = [
        migrations.RunPython(flatten_rooms_menu, restore_rooms_menu),
    ]
