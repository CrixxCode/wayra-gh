import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import traceback
from accounts.models import User
from accounts.serializers import PasswordResetRequestSerializer
from django.test import RequestFactory

def main():
    req = RequestFactory().post('/api/auth/password/reset/')
    req.build_absolute_uri = lambda *args: 'http://localhost:8000/api/auth/password/reset/'

    errors = 0
    for u in User.objects.filter(is_active=True):
        try:
            ser = PasswordResetRequestSerializer(data={'email': u.email}, context={'request': req})
            ser.is_valid(raise_exception=True)
            ser.save()
            print(f'OK: {u.email}')
            break
        except Exception as e:
            print(f'ERROR with {u.email}: {e}')
            traceback.print_exc()
            errors += 1
            break

    print('Done testing.')
    return errors


if __name__ == '__main__':
    main()
