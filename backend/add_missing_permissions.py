import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounts.models import Resource

# Recursos faltantes identificados por el análisis
missing_resources = [
    ('charges.read', 'Read Charges'),
    ('charges.write', 'Write Charges'),
    ('cleaning_tasks.write', 'Write Cleaning Tasks'),
    ('credit-notes.read', 'Read Credit Notes'),
    ('credit-notes.write', 'Write Credit Notes'),
    ('inventory-movements.write', 'Write Inventory Movements'),
    ('invoices.write', 'Write Invoices'),
    ('maintenance_orders.read', 'Read Maintenance Orders'),
    ('maintenance_orders.write', 'Write Maintenance Orders'),
    ('payments.write', 'Write Payments'),
    ('rates.write', 'Write Rates'),
    ('reservation_deposits.read', 'Read Reservation Deposits'),
    ('reservation_deposits.write', 'Write Reservation Deposits'),
    ('reservation_guests.read', 'Read Reservation Guests'),
    ('reservation_guests.write', 'Write Reservation Guests'),
    ('reservation_inventory_check_lines.read', 'Read Reservation Inventory Check Lines'),
    ('reservation_inventory_check_lines.write', 'Write Reservation Inventory Check Lines'),
    ('reservation_inventory_checks.read', 'Read Reservation Inventory Checks'),
    ('reservation_inventory_checks.write', 'Write Reservation Inventory Checks'),
    ('reservation_rooms.read', 'Read Reservation Rooms'),
    ('reservation_rooms.write', 'Write Reservation Rooms'),
    ('reservations.write', 'Write Reservations'),
    ('room-inventory.write', 'Write Room Inventory'),
    ('rooms.write', 'Write Rooms'),
]

print("=" * 80)
print("AGREGANDO RECURSOS FALTANTES")
print("=" * 80)

created_count = 0
skipped_count = 0

for key, name in missing_resources:
    resource, created = Resource.objects.get_or_create(
        key=key,
        defaults={
            'name': name,
            'description': f'Permiso para {name.lower()}',
            'is_menu': False,
            'order': 9999,
        }
    )
    
    if created:
        print(f"✅ Creado:  {key:40} ({name})")
        created_count += 1
    else:
        print(f"⏭️  Existe:   {key:40} (ya estaba)")
        skipped_count += 1

print()
print("=" * 80)
print(f"✅ RESUMEN: {created_count} creados, {skipped_count} ya existían")
print("=" * 80)
print()
print("💡 PRÓXIMO PASO:")
print("   Ejecutar: python backend/check_rbac.py")
print("   Para verificar que los recursos se agregaron correctamente.")
