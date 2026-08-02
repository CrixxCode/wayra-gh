from django.db import migrations
from django.utils.text import slugify


ROLE_CATALOG: dict[str, list[str]] = {
    "admin": [
        "Administrador del sistema",
        "Administrador general",
        "Superadministrador",
        "Propietario del hotel",
        "Dueño del alojamiento",
        "Director general",
        "Representante legal",
        "Administrador de plataforma",
        "Administrador SaaS",
        "Auditor del sistema",
    ],
    "gerente": [
        "Gerente general",
        "Gerente operativo",
        "Gerente administrativo",
        "Jefe de recepción",
        "Jefe de reservas",
        "Jefe de habitaciones",
        "Jefe de limpieza",
        "Jefe de mantenimiento",
        "Jefe de inventario",
        "Jefe de compras",
        "Jefe financiero",
        "Coordinador de operaciones",
        "Coordinador de servicios",
        "Coordinador de atención al cliente",
        "Supervisor de recepción",
        "Supervisor de habitaciones",
        "Supervisor de limpieza",
        "Supervisor de mantenimiento",
        "Supervisor de turno",
        "Encargado de hotel",
        "Encargado de caja",
        "Responsable de facturación",
        "Responsable de pagos",
        "Responsable de inventario",
        "Responsable de reportes",
    ],
    "staff": [
        "Recepcionista",
        "Auxiliar de recepción",
        "Asistente de reservas",
        "Auxiliar administrativo",
        "Cajero",
        "Auxiliar de caja",
        "Auxiliar de facturación",
        "Camarera de habitaciones",
        "Auxiliar de habitaciones",
        "Ama de llaves",
        "Auxiliar de limpieza",
        "Auxiliar de lavandería",
        "Técnico de mantenimiento",
        "Auxiliar de mantenimiento",
        "Electricista",
        "Plomero",
        "Jardinero",
        "Piscinero",
        "Botones",
        "Portero",
        "Vigilante",
        "Guardia de seguridad",
        "Conductor",
        "Mensajero",
        "Auxiliar de compras",
        "Auxiliar de inventario",
        "Almacenista",
        "Cocinero",
        "Auxiliar de cocina",
        "Mesero",
        "Bartender",
        "Personal de restaurante",
        "Personal de eventos",
        "Guía turístico",
        "Auxiliar de servicios generales",
        "Auxiliar de atención al cliente",
    ],
}


ROLE_MATCHES: dict[str, dict[str, list[str]]] = {
    "admin": {
        "slugs": ["admin"],
        "names": ["administrador", "admin"],
    },
    "gerente": {
        "slugs": ["gerente", "manager"],
        "names": ["gerente", "manager"],
    },
    "staff": {
        "slugs": ["staff", "personal"],
        "names": ["staff", "personal"],
    },
}


def _resolve_role(Role, role_key: str):
    match_config = ROLE_MATCHES.get(role_key, {})
    by_slug = Role.objects.filter(slug__in=match_config.get("slugs", [])).order_by("slug").first()
    if by_slug is not None:
        return by_slug

    normalized_names = set(match_config.get("names", []))
    for role in Role.objects.all():
        role_name = str(getattr(role, "name", "") or "").strip().lower()
        if role_name in normalized_names:
            return role

    return None


def seed_extended_job_titles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    JobTitle = apps.get_model("accounts", "JobTitle")

    for role_key, titles in ROLE_CATALOG.items():
        role = _resolve_role(Role, role_key)
        if role is None:
            continue

        for index, title in enumerate(titles, start=1):
            slug = slugify(title)
            if not slug:
                continue

            JobTitle.objects.update_or_create(
                role=role,
                slug=slug,
                defaults={
                    "name": title,
                    "description": "",
                    "is_active": True,
                    "sort_order": index,
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0017_seed_jobtitles"),
    ]

    operations = [
        migrations.RunPython(seed_extended_job_titles, migrations.RunPython.noop),
    ]
