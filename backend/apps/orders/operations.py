import logging
import os

from django.utils import timezone

from .models import ScheduledJobRun


logger = logging.getLogger("nexora.operations")


def start_job(job):
    return ScheduledJobRun.objects.create(
        job=job,
        release_sha=(os.getenv("RENDER_GIT_COMMIT") or os.getenv("NEXORA_RELEASE_SHA", ""))[:64],
    )


def finish_job(run, *, summary=None, error=None):
    run.status = ScheduledJobRun.Status.FAILED if error else ScheduledJobRun.Status.SUCCEEDED
    run.summary = summary or {}
    # Persist only the exception class, never a provider response or secret-bearing message.
    run.error_code = type(error).__name__[:80] if error else ""
    run.completed_at = timezone.now()
    run.save(update_fields=["status", "summary", "error_code", "completed_at"])
    logger.log(
        logging.ERROR if error else logging.INFO,
        "scheduled_job_finished",
        extra={"security_event": {
            "event": "scheduled_job_finished",
            "job": run.job,
            "status": run.status,
            "error_code": run.error_code,
            "summary": run.summary,
            "run_id": str(run.run_id),
        }},
    )
