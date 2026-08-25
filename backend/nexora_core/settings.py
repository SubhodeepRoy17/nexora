import os
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote, urlparse

from corsheaders.defaults import default_headers
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_list(name: str, default: str = "") -> list[str]:
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-before-deployment")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() in {"1", "true", "yes", "on"}
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.postgres",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "apps.accounts.apps.AccountsConfig",
    "apps.merchants.apps.MerchantsConfig",
    "apps.agents.apps.AgentsConfig",
    "apps.orders.apps.OrdersConfig",
    "apps.analytics.apps.AnalyticsConfig",
    "apps.commerce.apps.CommerceConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "nexora_core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "nexora_core.wsgi.application"
ASGI_APPLICATION = "nexora_core.asgi.application"

database_options = {"connect_timeout": 5}
if os.getenv("POSTGRES_SSLMODE"):
    database_options["sslmode"] = os.environ["POSTGRES_SSLMODE"]

database_url = os.getenv("DATABASE_URL")
if database_url:
    parsed_database_url = urlparse(database_url)
    database_config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed_database_url.path.lstrip("/")),
        "USER": unquote(parsed_database_url.username or ""),
        "PASSWORD": unquote(parsed_database_url.password or ""),
        "HOST": parsed_database_url.hostname or "localhost",
        "PORT": parsed_database_url.port or 5432,
        "CONN_MAX_AGE": 60,
        "OPTIONS": database_options,
    }
else:
    database_config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "nexora"),
        "USER": os.getenv("POSTGRES_USER", "nexora"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
        "OPTIONS": database_options,
    }

DATABASES = {"default": database_config}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "idempotency-key")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", ",".join(CORS_ALLOWED_ORIGINS))

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_SSL_REDIRECT = os.getenv("DJANGO_SECURE_SSL_REDIRECT", "False").lower() in {"1", "true", "yes", "on"}
SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = SECURE_HSTS_SECONDS > 0

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.SessionAuthentication401"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "nexora_core.pagination.BoundedPageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON_RATE", "120/hour"),
        "user": os.getenv("THROTTLE_USER_RATE", "1000/hour"),
        "auth": os.getenv("THROTTLE_AUTH_RATE", "10/minute"),
        "auth_read": os.getenv("THROTTLE_AUTH_READ_RATE", "60/minute"),
        "agent_search": os.getenv("THROTTLE_AGENT_SEARCH_RATE", "30/minute"),
        "order_create": os.getenv("THROTTLE_ORDER_CREATE_RATE", "10/minute"),
        "health": os.getenv("THROTTLE_HEALTH_RATE", "120/minute"),
        "commerce_catalog": os.getenv("THROTTLE_COMMERCE_CATALOG_RATE", "120/minute"),
    },
}

DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv("DATA_UPLOAD_MAX_MEMORY_SIZE", str(1_048_576)))
CSRF_FAILURE_VIEW = "apps.accounts.csrf.csrf_failure"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = os.getenv("CSRF_COOKIE_SAMESITE", "Lax")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"security_json": {"()": "nexora_core.logging.JsonSecurityFormatter"}},
    "handlers": {"security_console": {"class": "logging.StreamHandler", "formatter": "security_json"}},
    "loggers": {
        "nexora.security": {"handlers": ["security_console"], "level": "INFO", "propagate": False},
        "nexora.payments": {"handlers": ["security_console"], "level": "INFO", "propagate": False},
    },
}

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_WEBHOOK_ALERT_ATTEMPTS = max(2, int(os.getenv("RAZORPAY_WEBHOOK_ALERT_ATTEMPTS", "3")))
RAZORPAY_RECONCILIATION_STALE_MINUTES = max(
    1, int(os.getenv("RAZORPAY_RECONCILIATION_STALE_MINUTES", "10"))
)
RAZORPAY_REFUND_MAX_AMOUNT = Decimal(os.getenv("RAZORPAY_REFUND_MAX_AMOUNT", "100000.00"))

# Phase 7 money-action guardrails. These conservative limits are shown to the
# buyer with every quote and are enforced again at approval and order creation.
MONEY_SUPPORTED_CURRENCY = os.getenv("MONEY_SUPPORTED_CURRENCY", "INR").upper()
MONEY_MAX_ITEM_QUANTITY = int(os.getenv("MONEY_MAX_ITEM_QUANTITY", "5"))
MONEY_MAX_ORDER_VALUE = Decimal(os.getenv("MONEY_MAX_ORDER_VALUE", "100000.00"))
MONEY_QUOTE_TTL_SECONDS = int(os.getenv("MONEY_QUOTE_TTL_SECONDS", "600"))
MONEY_APPROVAL_TTL_SECONDS = int(os.getenv("MONEY_APPROVAL_TTL_SECONDS", "300"))
MONEY_DECISION_TOKEN_TTL_SECONDS = int(os.getenv("MONEY_DECISION_TOKEN_TTL_SECONDS", "1800"))
MONEY_REQUIRE_RAZORPAY_TEST_MODE = os.getenv(
    "MONEY_REQUIRE_RAZORPAY_TEST_MODE", "True"
).lower() in {"1", "true", "yes", "on"}
ORDER_RESERVATION_TTL_SECONDS = int(os.getenv("ORDER_RESERVATION_TTL_SECONDS", "900"))
ORDER_MAX_CART_ITEMS = int(os.getenv("ORDER_MAX_CART_ITEMS", "10"))
GROWTH_MAX_ADDON_OFFERS = min(3, max(0, int(os.getenv("GROWTH_MAX_ADDON_OFFERS", "2"))))
CHAT_ANONYMOUS_TOKEN_TTL_SECONDS = max(
    300, min(86_400, int(os.getenv("CHAT_ANONYMOUS_TOKEN_TTL_SECONDS", "43200")))
)
