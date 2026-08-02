from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in str(raw).split(",") if item.strip()]


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return default


DEBUG = env_bool("DJANGO_DEBUG", default=False)
RAILWAY_PUBLIC_DOMAIN = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
RAILWAY_PRIVATE_DOMAIN = os.getenv("RAILWAY_PRIVATE_DOMAIN", "").strip()
RAILWAY_PUBLIC_ORIGIN = (
    f"https://{RAILWAY_PUBLIC_DOMAIN}" if RAILWAY_PUBLIC_DOMAIN else ""
)
RAILWAY_ALLOWED_HOSTS = ",".join(
    host
    for host in [
        RAILWAY_PUBLIC_DOMAIN,
        RAILWAY_PRIVATE_DOMAIN,
        "healthcheck.railway.app" if RAILWAY_PUBLIC_DOMAIN else "",
    ]
    if host
)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-secret-key-change-me"
    else:
        raise RuntimeError("DJANGO_SECRET_KEY env var is required when DEBUG=False")
elif not DEBUG and SECRET_KEY in {"CHANGE_ME", "dev-only-secret-key-change-me"}:
    raise RuntimeError("DJANGO_SECRET_KEY is using an insecure placeholder value.")

ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1" if DEBUG else RAILWAY_ALLOWED_HOSTS,
)
if not DEBUG and not ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must not be empty when DEBUG=False")
if not DEBUG and "*" in ALLOWED_HOSTS:
    raise RuntimeError("DJANGO_ALLOWED_HOSTS cannot contain '*' when DEBUG=False")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "anymail",
    "corsheaders",
    "drf_spectacular",
    "django_filters",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "apps.master_data",
    "apps.clients",
    "apps.hotel_settings",
    "apps.rooms",
    "apps.reservations",
    'apps.services',
    'apps.packages',
    'apps.billing',
    'apps.promotions',
    'apps.inventory',
    'apps.finance',
    'apps.reports',
    "apps.notifications",
    "apps.demo_requests",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.middleware.ForcePasswordChangeMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"
WSGI_APPLICATION = "backend.wsgi.application"

# DB: SQLite by default; PostgreSQL when DB_ENGINE=postgres.
if os.getenv("DB_ENGINE", "sqlite") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME") or os.getenv("PGDATABASE", "gestion_hotelera"),
            "USER": os.getenv("DB_USER") or os.getenv("PGUSER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD") or os.getenv("PGPASSWORD", ""),
            "HOST": os.getenv("DB_HOST") or os.getenv("PGHOST", "localhost"),
            "PORT": os.getenv("DB_PORT") or os.getenv("PGPORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / os.getenv("DB_NAME", "db.sqlite3"),
        }
    }

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "es-es"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "America/Bogota")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / os.getenv("DJANGO_STATIC_ROOT", "staticfiles")
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

FRONTEND_DIST_DIR = Path(
    os.getenv("FRONTEND_DIST_DIR", BASE_DIR.parent / "frontend_dist")
)
if FRONTEND_DIST_DIR.exists():
    STATICFILES_DIRS = [FRONTEND_DIST_DIR]
    WHITENOISE_ROOT = FRONTEND_DIST_DIR

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
        "user": "120/min",
        "auth_login": "10/min",
        "password_reset": "5/min",
        "demo_request": "5/min",
    },
    "EXCEPTION_HANDLER": "accounts.exceptions.exception_handler",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Gestion Hotelera API",
    "DESCRIPTION": "Autenticacion y RBAC; endpoints v1.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "TAGS": [
        {"name": "auth", "description": "Autenticacion por sesion"},
        {"name": "users"},
        {"name": "roles"},
        {"name": "resources"},
    ],
}

CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", default=False)
if not DEBUG:
    CORS_ALLOW_ALL_ORIGINS = False

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:4200,http://127.0.0.1:4200" if DEBUG else RAILWAY_PUBLIC_ORIGIN,
)
if not DEBUG and not CORS_ALLOWED_ORIGINS:
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS must be configured with trusted frontend domains when DEBUG=False"
    )
CORS_ALLOW_CREDENTIALS = True

SESSION_COOKIE_NAME = "sessionid"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", default=not DEBUG)
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_AGE = env_int("SESSION_COOKIE_AGE", 60 * 60 * 24 * 7)
SESSION_SAVE_EVERY_REQUEST = True

CSRF_COOKIE_NAME = "csrftoken"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:4200,http://127.0.0.1:4200" if DEBUG else RAILWAY_PUBLIC_ORIGIN,
)
if not DEBUG and not CSRF_TRUSTED_ORIGINS:
    raise RuntimeError(
        "CSRF_TRUSTED_ORIGINS must be configured with trusted frontend domains when DEBUG=False"
    )

USE_X_FORWARDED_HOST = env_bool("USE_X_FORWARDED_HOST", default=not DEBUG)
SECURE_SSL_REDIRECT = env_bool(
    "SECURE_SSL_REDIRECT",
    default=False if RAILWAY_PUBLIC_DOMAIN else not DEBUG,
)
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 31536000 if not DEBUG else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=not DEBUG,
)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", default=False)
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "same-origin")
SECURE_PROXY_SSL_HEADER = (
    ("HTTP_X_FORWARDED_PROTO", "https")
    if env_bool("SECURE_PROXY_SSL_HEADER_ENABLED", default=not DEBUG)
    else None
)

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "no-reply@localhost")
SERVER_EMAIL = os.getenv("SERVER_EMAIL", DEFAULT_FROM_EMAIL)
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", 20)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
ANYMAIL = {
    "RESEND_API_KEY": RESEND_API_KEY,
}

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [
            BASE_DIR / "templates",
            FRONTEND_DIST_DIR,
        ],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

PASSWORD_RESET_COOKIE_MAX_AGE = env_int("PASSWORD_RESET_COOKIE_MAX_AGE", 1800)

DJANGO_LOG_LEVEL = os.getenv("DJANGO_LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": DJANGO_LOG_LEVEL,
    },
}

# Public registration flags (disabled by default).
ALLOW_PUBLIC_USER_REGISTRATION = env_bool("ALLOW_PUBLIC_USER_REGISTRATION", default=False)
ALLOW_PUBLIC_CLIENT_REGISTRATION = env_bool("ALLOW_PUBLIC_CLIENT_REGISTRATION", default=False)
