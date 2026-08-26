import json

from django.core.management.base import BaseCommand, CommandError

from ...reconciliation import reconcile_stale_orders
from ...models import ScheduledJobRun
from ...operations import finish_job, start_job


class Command(BaseCommand):
    help = "Reconcile stale payment-pending orders against Razorpay without guessing."

    def add_arguments(self, parser):
        parser.add_argument("--stale-minutes", type=int)
        parser.add_argument("--limit", type=int, default=250)

    def handle(self, *args, **options):
        if options["limit"] < 1 or options["limit"] > 5000:
            raise CommandError("--limit must be between 1 and 5000")
        if options["stale_minutes"] is not None and options["stale_minutes"] < 1:
            raise CommandError("--stale-minutes must be positive")
        run = start_job(ScheduledJobRun.Job.RECONCILE_RAZORPAY)
        try:
            result = reconcile_stale_orders(
                stale_minutes=options["stale_minutes"],
                limit=options["limit"],
            )
        except Exception as exc:
            finish_job(run, error=exc)
            raise
        finish_job(run, summary={
            "checked": result["checked"],
            "repaired": result["repaired"],
            "exceptions": len(result["exceptions"]),
        })
        self.stdout.write(json.dumps(result, sort_keys=True))
        if result["exceptions"]:
            self.stderr.write(
                self.style.WARNING(
                    f"{len(result['exceptions'])} reconciliation exception(s) require operator review."
                )
            )
