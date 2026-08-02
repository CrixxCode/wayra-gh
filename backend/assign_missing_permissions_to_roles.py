import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounts.models import Resource, Role

# Mapeo de permisos de lectura a escritura para asignar a los mismos roles
permission_mapping = {
    # Charges
    'charges.read': 'charges.write',
    # Cleaning Tasks
    'cleaning_tasks.read': 'cleaning_tasks.write',
    # Credit Notes
    'credit-notes.read': 'credit-notes.write',
    # Inventory Movements
    'inventory-movements.read': 'inventory-movements.write',
    # Invoices
    'invoices.read': 'invoices.write',
    # Maintenance Orders
    'maintenance_orders.read': 'maintenance_orders.write',
    # Payments
    'payments.read': 'payments.write',
    # Rates
    'rates.read': 'rates.write',
    # Reservation Deposits
    'reservation_deposits.read': 'reservation_deposits.write',
    # Reservation Guests
    'reservation_guests.read': 'reservation_guests.write',
    # Reservation Inventory Check Lines
    'reservation_inventory_check_lines.read': 'reservation_inventory_check_lines.write',
    # Reservation Inventory Checks
    'reservation_inventory_checks.read': 'reservation_inventory_checks.write',
    # Reservation Rooms
    'reservation_rooms.read': 'reservation_rooms.write',
    # Reservations
    'reservations.read': 'reservations.write',
    # Room Inventory
    'room-inventory.read': 'room-inventory.write',
    # Rooms
    'rooms.read': 'rooms.write',
}

print("=" * 80)
print("ASIGNANDO PERMISOS FALTANTES A ROLES")
print("=" * 80)

total_assignments = 0

for read_perm, write_perm in permission_mapping.items():
    try:
        read_resource = Resource.objects.get(key=read_perm)
        write_resource = Resource.objects.get(key=write_perm)
        
        # Obtener todos los roles que tienen el permiso de lectura
        roles_with_read = Role.objects.filter(resources=read_resource)
        
        if roles_with_read.exists():
            roles_list = ', '.join(roles_with_read.values_list('slug', flat=True))
            
            for role in roles_with_read:
                if not role.resources.filter(key=write_perm).exists():
                    role.resources.add(write_resource)
                    print(f"✅ {write_perm:35} → {role.slug}")
                    total_assignments += 1
                # else:
                #     print(f"⏭️  {write_perm:35} ya en {role.slug}")
        else:
            print(f"⚠️  {read_perm:35} no asignado a ningún rol")
            
    except Resource.DoesNotExist as e:
        print(f"❌ Recurso no encontrado: {e}")

print()
print("=" * 80)
print(f"✅ RESUMEN: {total_assignments} permisos asignados")
print("=" * 80)
print()
print("💡 PRÓXIMO PASO:")
print("   Ejecutar: python backend/validate_rbac_resources.py")
print("   Para verificar que todo está correctamente configurado.")
