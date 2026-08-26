import json

from django.core.management.base import BaseCommand, CommandError

from nexora_core.deployment import deployment_report


class Command(BaseCommand):
    help = "Verify production configuration, schema, pgvector/HNSW, and scheduler heartbeats."

    def add_arguments(self, parser):
        parser.add_argument("--allow-schedulers-pending", action="store_true")

    def handle(self, *args, **options):
        report = deployment_report()
        self.stdout.write(json.dumps(report, sort_keys=True))
        schedulers_ready = all(
            job["healthy"] for job in report["schedulers"]["jobs"].values()
        )
        if report["status"] != "ready":
            raise CommandError("Deployment readiness checks failed")
        if not options["allow_schedulers_pending"] and not schedulers_ready:
            raise CommandError("Scheduled jobs have no recent successful heartbeat")
