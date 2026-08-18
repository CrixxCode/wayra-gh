#!/usr/bin/env python
"""Corrige los recursos RBAC del sistema.

Wrapper de `python manage.py seed_rbac` para poder invocarlo con un solo
archivo (`python fix_resources.py`), local o en Railway
(`railway ssh --service wayra-gh -- python fix_resources.py`).

Util despues de eliminar o combinar vistas del frontend que antes estaban
sueltas (p.ej. commercial_catalog, billing_center, inventory_center,
operations_center, finance_center): `seed_rbac` crea/actualiza los recursos
segun el estado actual del codigo y desactiva (sin borrar) las claves
heredadas de las vistas que ya no existen (`LEGACY_KEYS`). Idempotente: se
puede correr las veces que haga falta.
"""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line([sys.argv[0], "seed_rbac"])


if __name__ == "__main__":
    main()
