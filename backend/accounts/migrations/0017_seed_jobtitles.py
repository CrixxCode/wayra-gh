from django.db import migrations


def seed_job_titles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    JobTitle = apps.get_model("accounts", "JobTitle")

    catalog = {
        "admin": [
            ("admin-general", "Admin General"),
            ("admin-hotel", "Admin del Hotel"),
            ("admin-sistema", "Administrador del Sistema"),
        ],
        "gerente": [
            ("gerente-general", "Gerente General"),
            ("gerente-operativo", "Gerente Operativo"),
            ("jefe-recepcion", "Jefe de Recepcion"),
        ],
        "recepcion": [
            ("recepcionista", "Recepcionista"),
            ("supervisor-recepcion", "Supervisor de Recepcion"),
        ],
        "auditor": [
            ("auditor-nocturno", "Auditor Nocturno"),
            ("auditor-operativo", "Auditor Operativo"),
        ],
    }

    for role_slug, options in catalog.items():
        role = Role.objects.filter(slug=role_slug).first()
        if role is None:
            continue

        for idx, (slug, name) in enumerate(options, start=1):
            JobTitle.objects.update_or_create(
                role=role,
                slug=slug,
                defaults={
                    "name": name,
                    "description": "",
                    "is_active": True,
                    "sort_order": idx,
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_jobtitle"),
    ]

    operations = [
        migrations.RunPython(seed_job_titles, migrations.RunPython.noop),
    ]
