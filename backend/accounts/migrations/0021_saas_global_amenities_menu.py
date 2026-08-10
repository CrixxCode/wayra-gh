from django.db import migrations


def add_saas_global_amenities_resource(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    parent = Resource.objects.filter(key="saasadmin.button").first()

    resource, _ = Resource.objects.update_or_create(
        key="saas_amenities.read",
        defaults={
            "name": "Amenidades globales",
            "description": "Gestion del catalogo global de amenidades.",
            "icon": "fa-solid fa-star",
            "link": "/saas-amenidades",
            "link_backend": "/api/amenities/",
            "is_menu": True,
            "order": 2,
            "parent": parent,
            "is_active": True,
        },
    )

    admin_role = Role.objects.filter(slug="admin").first()
    if admin_role is not None:
        RoleResource.objects.update_or_create(
            role=admin_role,
            resource=resource,
            defaults={"is_active": True},
        )


def remove_saas_global_amenities_resource(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Resource.objects.filter(key="saas_amenities.read").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0020_flatten_rooms_menu"),
    ]

    operations = [
        migrations.RunPython(
            add_saas_global_amenities_resource,
            remove_saas_global_amenities_resource,
        ),
    ]
