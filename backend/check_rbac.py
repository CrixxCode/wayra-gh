import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from accounts.models import Role, Resource, RoleResource

User = get_user_model()

print('=== TODOS LOS USUARIOS ===')
for u in User.objects.all().order_by('username'):
    keys = sorted(u.resource_keys())
    roles = list(u.roles.values_list('slug', flat=True))
    print(f'  username={u.username!r:25} | superuser={u.is_superuser} | staff={u.is_staff} | roles={roles}')
    print(f'    resource_keys={keys}')

print()
print('=== ROLES Y SUS RECURSOS ===')
for r in Role.objects.prefetch_related('resources').order_by('slug'):
    keys = sorted(r.resources.values_list('key', flat=True))
    print(f'  {r.slug!r}: {keys}')

print()
print('=== TABLA RoleResource (relaciones actuales) ===')
for rr in RoleResource.objects.select_related('role', 'resource').order_by('role__slug', 'resource__key'):
    print(f'  rol={rr.role.slug!r:15}  resource={rr.resource.key!r}')

print()
print('=== RECURSOS (todos) ===')
for res in Resource.objects.order_by('order', 'key'):
    print(f'  key={res.key!r:30} is_menu={res.is_menu} link={res.link!r}')
