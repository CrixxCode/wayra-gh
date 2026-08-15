"""El registro de actividad pasa a ser auditoria.

No es solo un cambio de nombre: lo de antes **reconstruia** una linea de tiempo pidiendo
pagos, movimientos, ordenes y reservas. Ahora hay una tabla propia e inmutable
(`accounts.AuditLog`) que registra toda escritura del sistema con su autor, su origen y
el detalle campo a campo.

`activity-log.view` no se borra: se desactiva y se le quita el enlace. Borrarlo dejaria
huerfanas las asignaciones de rol de quien ya lo tenia, y el rastro de que existio.
"""

from django.db import migrations

OLD_KEY = "activity-log.view"
NEW_KEY = "audit.read"


def rename_to_audit(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")
    Role = apps.get_model("accounts", "Role")
    RoleResource = apps.get_model("accounts", "RoleResource")

    previous = Resource.objects.filter(key=OLD_KEY).first()

    resource, _ = Resource.objects.update_or_create(
        key=NEW_KEY,
        defaults={
            "name": "Auditoria",
            "description": "Rastro de auditoria: quien hizo que, cuando y desde donde.",
            "icon": "fa-solid fa-clock-rotate-left",
            "link": "/auditoria",
            "link_backend": "/api/audit/",
            "is_menu": True,
            "order": previous.order if previous else 12,
            "parent": previous.parent if previous else None,
            "is_active": True,
        },
    )

    # La ve quien ya veia el registro de actividad.
    if previous:
        roles = Role.objects.filter(
            roleresource__resource=previous, roleresource__is_active=True
        ).distinct()
        for role in roles:
            RoleResource.objects.update_or_create(
                role=role, resource=resource, defaults={"is_active": True}
            )

        Resource.objects.filter(key=OLD_KEY).update(
            is_menu=False, link="", parent=None, is_active=False
        )


def restore_activity_log(apps, schema_editor):
    Resource = apps.get_model("accounts", "Resource")

    audit = Resource.objects.filter(key=NEW_KEY).first()
    order = audit.order if audit else 12
    parent = audit.parent if audit else None

    Resource.objects.filter(key=NEW_KEY).delete()
    Resource.objects.filter(key=OLD_KEY).update(
        is_menu=True, link="/actividad", is_active=True, order=order, parent=parent
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0028_auditlog"),
    ]

    operations = [
        migrations.RunPython(rename_to_audit, restore_activity_log),
    ]
