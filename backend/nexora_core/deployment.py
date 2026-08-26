import os
from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone


def _configuration_report():
    unsafe_hosts = {"*", "localhost", "127.0.0.1", "[::1]"}
    origins = (*settings.CORS_ALLOWED_ORIGINS, *settings.CSRF_TRUSTED_ORIGINS)
    checks = {
        "debug_disabled": not settings.DEBUG,
        "public_hosts_only": bool(settings.ALLOWED_HOSTS) and not unsafe_hosts.intersection(settings.ALLOWED_HOSTS),
        "https_origins_only": bool(origins) and all(origin.startswith("https://") for origin in origins),
        "csrf_covers_cors": set(settings.CORS_ALLOWED_ORIGINS).issubset(settings.CSRF_TRUSTED_ORIGINS),
        "secure_cookies": settings.SESSION_COOKIE_SECURE and settings.CSRF_COOKIE_SECURE,
        "ssl_redirect": settings.SECURE_SSL_REDIRECT,
        "test_mode_enforced": settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE,
        "razorpay_key_safe": not settings.RAZORPAY_KEY_ID or settings.RAZORPAY_KEY_ID.startswith("rzp_test_"),
        "razorpay_credentials_complete": all((
            settings.RAZORPAY_KEY_ID,
            settings.RAZORPAY_KEY_SECRET,
            settings.RAZORPAY_WEBHOOK_SECRET,
        )),
    }
    return {"ready": all(checks.values()), "checks": checks}


def _database_report():
    executor = MigrationExecutor(connection)
    pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_setting('server_version')")
        postgres_version = cursor.fetchone()[0]
        cursor.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
        vector_row = cursor.fetchone()
        cursor.execute(
            "SELECT indexdef FROM pg_indexes WHERE indexname = %s ORDER BY schemaname LIMIT 1",
            ["product_embedding_hnsw"],
        )
        index_row = cursor.fetchone()
    index_definition = index_row[0].lower() if index_row else ""
    return {
        "connected": True,
        "postgres_version": postgres_version,
        "migrations_current": not pending,
        "pending_migrations": len(pending),
        "pgvector_version": vector_row[0] if vector_row else None,
        "hnsw_index": "using hnsw" in index_definition,
    }


def _scheduler_report():
    from apps.orders.models import ScheduledJobRun

    cutoff = timezone.now() - timedelta(minutes=settings.OPS_SCHEDULER_MAX_AGE_MINUTES)
    jobs = {}
    for job, _label in ScheduledJobRun.Job.choices:
        latest = ScheduledJobRun.objects.filter(job=job).order_by("-started_at").first()
        latest_success = ScheduledJobRun.objects.filter(
            job=job,
            status=ScheduledJobRun.Status.SUCCEEDED,
        ).order_by("-completed_at").first()
        jobs[job.lower()] = {
            "healthy": bool(latest_success and latest_success.completed_at and latest_success.completed_at >= cutoff),
            "latest_status": latest.status if latest else "PENDING",
            "last_success_at": latest_success.completed_at.isoformat() if latest_success else None,
        }
    return {"max_age_minutes": settings.OPS_SCHEDULER_MAX_AGE_MINUTES, "jobs": jobs}


def deployment_report():
    configuration = _configuration_report()
    try:
        database = _database_report()
        schedulers = _scheduler_report()
    except Exception as exc:
        database = {"connected": False, "error_code": type(exc).__name__}
        schedulers = {"max_age_minutes": settings.OPS_SCHEDULER_MAX_AGE_MINUTES, "jobs": {}}
    database_ready = all((
        database.get("connected"),
        database.get("migrations_current"),
        database.get("pgvector_version"),
        database.get("hnsw_index"),
    ))
    return {
        "status": "ready" if configuration["ready"] and database_ready else "not_ready",
        "release": (os.getenv("RENDER_GIT_COMMIT") or os.getenv("NEXORA_RELEASE_SHA") or "unknown")[:64],
        "mode": "razorpay_test_only" if settings.MONEY_REQUIRE_RAZORPAY_TEST_MODE else "unsafe",
        "configuration": configuration,
        "database": database,
        "schedulers": schedulers,
    }
