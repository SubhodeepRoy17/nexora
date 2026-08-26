from django.core.management.base import BaseCommand

from apps.orders.lifecycle import expire_stale_checkouts
from apps.orders.models import ScheduledJobRun
from apps.orders.operations import finish_job, start_job


class Command(BaseCommand):
    help = "Expire stale quotes/reservations and return reserved stock exactly once."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)

    def handle(self, *args, **options):
        run = start_job(ScheduledJobRun.Job.EXPIRE_CHECKOUTS)
        try:
            result = expire_stale_checkouts(limit=max(1, min(options["limit"], 5_000)))
        except Exception as exc:
            finish_job(run, error=exc)
            raise
        finish_job(run, summary={
            "expired_quotes": result["expired_quotes"],
            "released_orders": result["released_orders"],
        })
        self.stdout.write(
            self.style.SUCCESS(
                f"Expired quotes: {result['expired_quotes']}; released orders: {result['released_orders']}"
            )
        )
