import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounts.models import Resource, Role

# Crear los recursos de notificaciones si no existen
read_resource, created_read = Resource.objects.get_or_create(
    key='notifications.read',
    defaults={
        'name': 'Read Notifications',
        'description': 'Permiso para leer notificaciones',
        'is_menu': False,
        'order': 9999,
    }
)
print(f"Resource 'notifications.read': {'created' if created_read else 'already exists'}")

write_resource, created_write = Resource.objects.get_or_create(
    key='notifications.write',
    defaults={
        'name': 'Write Notifications',
        'description': 'Permiso para modificar notificaciones',
        'is_menu': False,
        'order': 9999,
    }
)
print(f"Resource 'notifications.write': {'created' if created_write else 'already exists'}")

# Asignar a roles
roles_to_update = ['admin', 'manager', 'staff']

for role_slug in roles_to_update:
    try:
        role = Role.objects.get(slug=role_slug)
        
        # Agregar permisos de lectura a todos los roles
        if not role.resources.filter(key='notifications.read').exists():
            role.resources.add(read_resource)
            print(f"✓ Agregado 'notifications.read' a rol '{role_slug}'")
        else:
            print(f"  'notifications.read' ya está en rol '{role_slug}'")
        
        # Agregar permiso de escritura solo a admin y manager
        if role_slug in ['admin', 'manager']:
            if not role.resources.filter(key='notifications.write').exists():
                role.resources.add(write_resource)
                print(f"✓ Agregado 'notifications.write' a rol '{role_slug}'")
            else:
                print(f"  'notifications.write' ya está en rol '{role_slug}'")
    except Role.DoesNotExist:
        print(f"✗ Rol '{role_slug}' no encontrado")

print("\n✓ Permisos de notificaciones configurados correctamente")
