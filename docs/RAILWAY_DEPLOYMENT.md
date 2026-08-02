# Despliegue en Railway

Este proyecto se despliega como un solo servicio Docker:

- Angular se compila en el build de Docker.
- Django sirve el API y el `index.html` del frontend.
- PostgreSQL se conecta con las variables `PG*` que Railway expone desde el servicio de base de datos.

## Pasos en Railway

1. Sube estos cambios a GitHub.
2. En Railway, crea un proyecto nuevo desde el repositorio.
3. Agrega un servicio PostgreSQL al mismo proyecto.
4. En el servicio web, confirma que Railway detecte el `Dockerfile` del repositorio.
5. Genera un dominio publico en `Settings > Networking > Public Networking > Generate Domain`.
6. Configura estas variables en el servicio web:

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DB_ENGINE=postgres
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
SECURE_SSL_REDIRECT=False

# Correo por API HTTPS, recomendado en Railway Free/Trial/Hobby
EMAIL_BACKEND=anymail.backends.resend.EmailBackend
RESEND_API_KEY=re_replace-with-resend-api-key
DEFAULT_FROM_EMAIL=Wayra <notificaciones@tu-dominio.com>
SERVER_EMAIL=Wayra <notificaciones@tu-dominio.com>
EMAIL_TIMEOUT=20
```

Si Railway no inyecta `RAILWAY_PUBLIC_DOMAIN` en tu servicio, agrega tambien:

```env
DJANGO_ALLOWED_HOSTS=tu-dominio.up.railway.app
CORS_ALLOWED_ORIGINS=https://tu-dominio.up.railway.app
CSRF_TRUSTED_ORIGINS=https://tu-dominio.up.railway.app
```

## CLI opcional

Si prefieres desplegar desde terminal:

```powershell
npm install -g @railway/cli
railway login
railway init
railway up
```

El servicio ejecuta migraciones y `collectstatic` al arrancar.

## Correos en Railway

El archivo `backend/.env` local no se sube al contenedor Docker ni a Railway. Por eso, aunque el envio funcione en desarrollo, en produccion debes crear las variables `EMAIL_*` en el servicio web de Railway.

Railway bloquea SMTP saliente en planes Free, Trial y Hobby. En esos planes, Gmail SMTP (`smtp.gmail.com:587`) falla desde el contenedor con errores como `Network is unreachable`, aunque la contrasena de aplicacion sea correcta. Usa un proveedor transaccional por API HTTPS, por ejemplo Resend, SendGrid, Mailgun o Postmark.

Para Resend:

1. Crea una cuenta en Resend.
2. Verifica un dominio o usa el remitente de pruebas permitido por Resend.
3. Crea una API key con permiso de envio.
4. Configura en Railway:

```env
EMAIL_BACKEND=anymail.backends.resend.EmailBackend
RESEND_API_KEY=re_replace-with-resend-api-key
DEFAULT_FROM_EMAIL=Wayra <notificaciones@tu-dominio.com>
SERVER_EMAIL=Wayra <notificaciones@tu-dominio.com>
```

Si el workspace esta en Railway Pro o superior, tambien puedes usar SMTP:

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=notificaciones@tu-dominio.com
EMAIL_HOST_PASSWORD=clave-smtp-o-app-password
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=notificaciones@tu-dominio.com
SERVER_EMAIL=notificaciones@tu-dominio.com
EMAIL_TIMEOUT=20
```

Si usas Gmail por SMTP, `EMAIL_HOST_PASSWORD` debe ser una contrasena de aplicacion o una credencial SMTP valida, no la contrasena normal de la cuenta. Tambien verifica que `DEFAULT_FROM_EMAIL` coincida con el remitente autorizado por el proveedor SMTP.

Cuando el sistema muestra `Hotel y primer usuario creados, pero no fue posible enviar el enlace de acceso`, la conversion ya se guardo correctamente, pero Django no pudo ejecutar el envio de correo. Revisa los logs del servicio web en Railway y busca:

```text
Password reset email could not be sent
```

Despues de corregir las variables, redeploy/restart del servicio y usa `Reenviar enlace` en la pantalla de solicitudes demo.

## Notas

- Los archivos en `backend/media` no son persistentes en Railway sin un Volume o almacenamiento externo.
- El primer despliegue puede tardar por la instalacion de dependencias de Node y Python.
