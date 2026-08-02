#!/usr/bin/env python
"""
Script para validar y comparar los recursos RBAC encontrados en el código
con los registrados en la base de datos.

Uso:
    python validate_rbac_resources.py
"""

import os
import sys
import json
from pathlib import Path

# Agregar el path del backend al PYTHONPATH
BACKEND_PATH = Path(__file__).parent / "backend"
sys.path.insert(0, str(BACKEND_PATH))

# Configurar Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django

django.setup()

from accounts.models import Resource


def load_scanned_resources():
    """Carga los recursos del archivo JSON de escaneo"""
    scan_file = Path(__file__).parent / "RBAC_RESOURCES_SCAN.json"
    if not scan_file.exists():
        print(f"❌ Archivo no encontrado: {scan_file}")
        return None
    
    with open(scan_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    scanned_resources = set()
    for scope in data.get("all_resources", {}).get("read_scopes", []):
        scanned_resources.add(scope)
    for scope in data.get("all_resources", {}).get("write_scopes", []):
        scanned_resources.add(scope)
    for scope in data.get("all_resources", {}).get("special_scopes", []):
        scanned_resources.add(scope)
    
    return scanned_resources


def get_db_resources():
    """Obtiene los recursos activos de la base de datos"""
    db_resources = set(
        Resource.objects.filter(is_active=True)
        .values_list("key", flat=True)
        .distinct()
    )
    return db_resources


def main():
    print("\n" + "=" * 80)
    print("🔍 VALIDACIÓN DE RECURSOS RBAC")
    print("=" * 80 + "\n")

    # Cargar recursos escaneados del código
    scanned = load_scanned_resources()
    if scanned is None:
        return 1

    print(f"✅ Recursos encontrados en el código: {len(scanned)}")
    print(f"   {', '.join(sorted(scanned))}\n")

    # Obtener recursos de la base de datos
    db_resources = get_db_resources()
    print(f"✅ Recursos en la base de datos: {len(db_resources)}")
    print(f"   {', '.join(sorted(db_resources))}\n")

    # Comparar
    missing_in_db = scanned - db_resources
    extra_in_db = db_resources - scanned

    print("=" * 80)
    print("📊 COMPARACIÓN")
    print("=" * 80 + "\n")

    if missing_in_db:
        print(f"❌ RECURSOS EN CÓDIGO PERO NO EN BD ({len(missing_in_db)}):")
        for resource in sorted(missing_in_db):
            print(f"   - {resource}")
        print()
    else:
        print("✅ Todos los recursos del código están en la BD\n")

    if extra_in_db:
        print(f"⚠️  RECURSOS EN BD PERO NO EN CÓDIGO ({len(extra_in_db)}):")
        for resource in sorted(extra_in_db):
            print(f"   - {resource}")
        print()
    else:
        print("✅ No hay recursos adicionales en la BD\n")

    # Resumen
    print("=" * 80)
    print("📈 RESUMEN")
    print("=" * 80)
    print(f"Recursos en código:     {len(scanned)}")
    print(f"Recursos en BD:         {len(db_resources)}")
    print(f"Coincidentes:           {len(scanned & db_resources)}")
    print(f"Faltantes en BD:        {len(missing_in_db)}")
    print(f"Extra en BD:            {len(extra_in_db)}")
    print()

    # Sugerencia de acciones
    if missing_in_db:
        print("=" * 80)
        print("💡 ACCIONES SUGERIDAS")
        print("=" * 80)
        print("\n1️⃣  Ejecutar script para agregar los recursos faltantes:")
        print("   python backend/add_notifications_permissions.py\n")
        print("2️⃣  O agregar manualmente los recursos faltantes:")
        for resource in sorted(missing_in_db):
            resource_name = resource.replace(".read", "").replace(".write", "").replace("_", " ").title()
            operation = "Lectura" if ".read" in resource else "Escritura" if ".write" in resource else "Especial"
            print(f"   - {resource_name} ({operation})")
        print()

    # Retornar código de salida
    if missing_in_db or extra_in_db:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
