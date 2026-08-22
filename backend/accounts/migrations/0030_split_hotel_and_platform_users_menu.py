from django.db import migrations


HOTEL_USERS_KEY = "hotel_users.read"
SAAS_USERS_KEY = "saas_users.read"
HOTEL_ADMIN_KEYS = [
    "users.read",
    "users.write",
    "users.read_deleted",
    "roles.read",
    HOTEL_USERS_KEY,
]


def split_users_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    Resource.objects.update_or_create(
        key=HOTEL_USERS_KEY,
        defaults={
            "name": "Usuarios del hotel",
            "description": (
                "Entrada de menu para administrar solo los usuarios del hotel autenticado. "
                "La API sigue protegida por users.* y aislada por hotel_settings."
            ),
            "link": "/usuarios-hotel",
            "link_backend": "",
            "icon": "pi pi-users",
            "order": 14,
            "is_menu": True,
            "is_active": True,
            "parent": None,
        },
    )

    Resource.objects.filter(key=SAAS_USERS_KEY).update(
        name="Usuarios plataforma",
        description="Gestion global de usuarios desde el panel de plataforma.",
        link="/usuarios",
        order=5,
        is_menu=True,
        is_active=True,
    )

    Resource.objects.filter(key="saasadmin.button").update(order=15)
    Resource.objects.filter(key="users.read").update(is_menu=False, link="", parent=None)

    admin_role = Role.objects.filter(slug="admin").first()
    if admin_role is None:
        return

    resources = Resource.objects.filter(key__in=HOTEL_ADMIN_KEYS, is_active=True)
    for resource in resources:
        RoleResource.objects.update_or_create(
            role=admin_role,
            resource=resource,
            defaults={"is_active": True},
        )


def restore_users_menu(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    hotel_users = Resource.objects.filter(key=HOTEL_USERS_KEY).first()
    if hotel_users is not None:
        RoleResource.objects.filter(resource=hotel_users).delete()
        hotel_users.delete()

    Resource.objects.filter(key=SAAS_USERS_KEY).update(
        name="Usuarios",
        description="Gestion de usuarios desde el panel de plataforma.",
        link="/usuarios",
        order=5,
        is_menu=True,
        is_active=True,
    )
    Resource.objects.filter(key="saasadmin.button").update(order=14)

    admin_role = Role.objects.filter(slug="admin").first()
    if admin_role is not None:
        RoleResource.objects.filter(
            role=admin_role,
            resource__key__in=["users.read", "users.write", "users.read_deleted", "roles.read"],
        ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0029_audit_menu"),
    ]

    operations = [
        migrations.RunPython(split_users_menu, restore_users_menu),
    ]
