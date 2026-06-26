import os
from datetime import timedelta
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

_SECRET_KEY_DEFAULT = 'django-insecure-dev-only'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', _SECRET_KEY_DEFAULT)
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

# Fail hard in production with a weak or placeholder secret key.
if not DEBUG and (SECRET_KEY == _SECRET_KEY_DEFAULT or len(SECRET_KEY) < 50):
    raise RuntimeError(
        "DJANGO_SECRET_KEY must be a secure random value of 50+ characters when DEBUG=False. "
        "Generate one: python -c \"from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())\""
    )

# Fail hard in production with the known weak default staff password.
_STAFF_PASSWORD = os.getenv('STAFF_PASSWORD', '')
if not DEBUG and _STAFF_PASSWORD in ('staffpass123', '', 'password', 'admin'):
    raise RuntimeError(
        "STAFF_PASSWORD must be set to a strong password when DEBUG=False. "
        "The current value is one of the known insecure defaults."
    )

ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'channels',
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'queue_root.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'queue_root.wsgi.application'
ASGI_APPLICATION = 'queue_root.asgi.application'

DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv('DATABASE_URL', 'postgres://user:password@db:5432/hospital_queue'),
        conn_max_age=600
    )
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [os.getenv('REDIS_URL', 'redis://redis:6379/0')],
        },
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Security headers ────────────────────────────────────────────────────────
# When behind a TLS-terminating reverse proxy (Nginx/Caddy), set
# SECURE_PROXY_SSL_HEADER so Django knows the connection is already encrypted.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# Redirect bare HTTP → HTTPS (let the reverse proxy handle this in prod;
# disable here to avoid double-redirect if the proxy already does it).
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'False') == 'True'
# HSTS — tell browsers to only connect over HTTPS for 1 year.
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))  # set to 31536000 in prod
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
# Prevent browsers from sniffing content-type and from embedding in iframes.
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# ── Structured logging ──────────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            '()': 'django.utils.log.ServerFormatter',
            'format': '%(levelname)s %(asctime)s %(name)s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
        },
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': os.getenv('DJANGO_LOG_LEVEL', 'WARNING')},
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'django.security': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'QueueViews': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'core': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}

CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:5175').split(',')
CSRF_TRUSTED_ORIGINS = os.getenv('DJANGO_CSRF_TRUSTED_ORIGINS', 'http://localhost:5173,http://localhost:5175').split(',')

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        # Reads (lobby display + dashboards) stay public; any state-mutating
        # request requires an authenticated is_staff user. Kiosk registration
        # opts back into AllowAny per-action. See core/permissions.py.
        'core.permissions.IsStaffOrReadOnly',
    ],
    # JWT must come first so authenticated dashboard calls hit the 'user' throttle
    # (600/min) instead of falling through as anonymous and burning the 60/min anon cap.
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.SilentJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv('THROTTLE_ANON', '60/min'),
        'user': os.getenv('THROTTLE_USER', '600/min'),
        'login': os.getenv('THROTTLE_LOGIN', '10/min'),
        'register': os.getenv('THROTTLE_REGISTER', '20/min'),
        'status': os.getenv('THROTTLE_STATUS', '120/min'),
    },
}

SIMPLE_JWT = {
    # Staff console sessions span a shift, so access lives long enough to avoid
    # constant re-login; refresh rotates to bound a stolen token's usefulness.
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=int(os.getenv('JWT_ACCESS_HOURS', '8'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_REFRESH_DAYS', '7'))),
    'ROTATE_REFRESH_TOKENS': True,
}

# Pagination — prevents unbounded query results on large datasets.
# Global pagination intentionally omitted — the frontend expects plain arrays.
# Pagination can be added per-viewset via pagination_class on the viewset class.
