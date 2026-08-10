"""
Consolida tipos de habitacion, tarifas y amenidades dentro de la vista Habitaciones.

Esas tres vistas ahora se gestionan con modales desde /habitaciones, por lo que sus
rutas de frontend ya no existen como paginas independientes. Se quitan del menu
lateral y se limpia su `link` para que el aside no ofrezca destinos muertos.

IMPORTANTE: los recursos siguen ACTIVOS a proposito. `is_active` controla el permiso
de API (HasResourcePermission); desactivarlos romperia los modales, que siguen
llamando a /api/amenities/, /api/room-types/ y /api/rates/.
"""
from django.db import migrations

# Claves que dejan de ser entradas de menu (se siguen usando como permisos de API).
DEMOTED_RESOURCE_KEYS = [
    "amenities.read",
    "room_type.read",
    "rates.read",
]

# Estado previo, para poder revertir la migracion.
PREVIOUS_MENU_STATE = {
    "amenities.read": {"link": "/amenidades", "order": 7},
    "room_type.read": {"link": "/tipos-habitacion", "order": 0},
    "rates.read": {"link": "/tarifas-habitacion", "order": 0},
}


def demote_rooms_satellite_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    Resource.objects.filter(key__in=DEMOTED_RESOURCE_KEYS).update(
        is_menu=False,
        link="",
    )


def restore_rooms_satellite_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    for key, previous in PREVIOUS_MENU_STATE.items():
        Resource.objects.filter(key=key).update(
            is_menu=True,
            link=previous["link"],
            order=previous["order"],
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0018_seed_extended_jobtitles"),
    ]

    operations = [
        migrations.RunPython(demote_rooms_satellite_menu, restore_rooms_satellite_menu),
    ]
