import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounts.models import Resource, Role

# Recursos de lectura que necesitan ser asignados a roles
# Estos están siendo usados en el código pero nunca fueron asignados
read_permissions_to_assign = {
    # Estos se asignan a los mismos roles que 'reservations.read'
    'charges.read': ['admin', 'manager'],
    'credit-notes.read': ['admin', 'manager'],
    'maintenance_orders.read': ['admin', 'manager'],
    
    # Estos se asignan a los mismos roles que 'reservations.read'
    'reservation_deposits.read': ['admin', 'manager'],
    'reservation_guests.read': ['admin', 'manager'],
    'reservation_inventory_check_lines.read': ['admin', 'manager'],
    'reservation_inventory_checks.read': ['admin', 'manager'],
    'reservation_rooms.read': ['admin', 'manager'],
}

print("=" * 80)
print("ASIGNANDO PERMISOS DE LECTURA FALTANTES A ROLES")
print("=" * 80)

total_assignments = 0

for resource_key, role_slugs in read_permissions_to_assign.items():
    try:
        resource = Resource.objects.get(key=resource_key)
        
        for role_slug in role_slugs:
            role = Role.objects.get(slug=role_slug)
            
            if not role.resources.filter(key=resource_key).exists():
                role.resources.add(resource)
                print(f"✅ {resource_key:35} → {role_slug}")
                total_assignments += 1
            else:
                print(f"⏭️  {resource_key:35} ya en {role_slug}")
                
    except (Resource.DoesNotExist, Role.DoesNotExist) as e:
        print(f"❌ No encontrado: {e}")

print()
print("=" * 80)
print(f"✅ RESUMEN: {total_assignments} permisos asignados")
print("=" * 80)
print()
print("💡 VERIFICACIÓN:")
print("   Ejecutar: python backend/validate_rbac_resources.py")
print("   Para confirmar que todos los recursos están correctamente asignados.")
