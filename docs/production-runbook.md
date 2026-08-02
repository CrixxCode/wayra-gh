# Production Runbook

## 1. Variables de entorno obligatorias

Backend (`backend/.env` en runtime, no versionado):

```env
DJANGO_SECRET_KEY=<secret-largo-aleatorio>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.tu-dominio.com

CORS_ALLOW_ALL_ORIGINS=False
CORS_ALLOWED_ORIGINS=https://app.tu-dominio.com
CSRF_TRUSTED_ORIGINS=https://app.tu-dominio.com

SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=False
SECURE_PROXY_SSL_HEADER_ENABLED=True

# Railway Free/Trial/Hobby: usar API HTTPS de correo transaccional.
EMAIL_BACKEND=anymail.backends.resend.EmailBackend
RESEND_API_KEY=<resend-api-key>
DEFAULT_FROM_EMAIL=Wayra <no-reply@tu-dominio.com>
SERVER_EMAIL=Wayra <no-reply@tu-dominio.com>

# SMTP solo si el proveedor/plan permite salida SMTP.
# EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# EMAIL_HOST=<smtp-host>
# EMAIL_PORT=587
# EMAIL_HOST_USER=<smtp-user>
# EMAIL_HOST_PASSWORD=<smtp-password>

ALLOW_PUBLIC_USER_REGISTRATION=False
ALLOW_PUBLIC_CLIENT_REGISTRATION=False
PUBLIC_USER_REGISTRATION_TOKEN=<token-largo-opcional-si-se-habilita>
PUBLIC_CLIENT_REGISTRATION_TOKEN=<token-largo-opcional-si-se-habilita>
```

## 2. Checklist predeploy

Comando unico (si PowerShell bloquea scripts):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy-check.ps1
```

1. Ejecutar backend tests: `python manage.py test`
2. Validar contrato OpenAPI: `python manage.py spectacular --file schema.yml --validate`
3. Ejecutar frontend lint: `npm run lint`
4. Ejecutar frontend tests: `npm run test:ci`
5. Ejecutar frontend build: `npm run build:ci`
6. Verificar `git status` limpio (sin archivos sensibles/temporales)

## 3. Migraciones

1. Crear release branch.
2. Aplicar migraciones en staging:
   - `python manage.py migrate --noinput`
3. Validar smoke tests funcionales.
4. Aplicar migraciones en producción durante ventana de mantenimiento.

## 4. Backups

### PostgreSQL (recomendado en producción)

Backup:

```bash
pg_dump -h <host> -U <user> -d <db> -Fc -f backup_YYYYMMDD_HHMM.dump
```

Restore:

```bash
pg_restore -h <host> -U <user> -d <db> --clean --if-exists backup_YYYYMMDD_HHMM.dump
```

### Archivos media

1. Comprimir `backend/media/`
2. Guardar artefacto en almacenamiento externo (S3/Blob/NAS)

## 5. Monitoreo mínimo

1. Healthcheck: `GET /health/`
2. Errores 5xx por minuto.
3. Latencia p95 endpoints críticos (auth, reservas, facturación).
4. Job failures (si existen cron/commands).
5. Alertas de disco/CPU/memoria y expiración TLS.

## 6. Rollback

1. Revertir despliegue al artefacto anterior.
2. Restaurar backup DB si hubo migraciones incompatibles.
3. Invalidar caché y reiniciar servicios.
4. Validar healthcheck y flujo de login.

## 7. Rotación de secretos y limpieza de historial Git

Estado esperado:

1. `backend/.env` no debe estar trackeado.
2. `.gitignore` debe excluir `.env`, `db.sqlite3`, `__pycache__`, `*.pyc`.

Pasos de rotación:

1. Rotar `DJANGO_SECRET_KEY`.
2. Rotar credenciales SMTP (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`).
3. Revocar cualquier secreto expuesto previamente.
4. Desplegar con nuevos secretos.

Limpieza de historial:

1. Preferido (`git-filter-repo`):
   - `git filter-repo --invert-paths --path backend/.env`
2. Si `git-filter-repo` no está disponible, usar entorno que sí lo tenga.
3. Force-push controlado y coordinación con todo el equipo:
   - `git push --force --all`
   - `git push --force --tags`
4. Todos los colaboradores deben reclonar o resetear sus ramas locales.

## 8. Política de registro público

Producción:

1. `ALLOW_PUBLIC_USER_REGISTRATION=False`
2. `ALLOW_PUBLIC_CLIENT_REGISTRATION=False`

Si se habilita temporalmente:

1. Mantener ambos flags en `True` solo el tiempo necesario.
2. Exigir token de cabecera `X-Public-Registration-Token`.
3. Registrar auditoría de altas y deshabilitar al finalizar la campaña.

