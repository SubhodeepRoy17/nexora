from django.core.management.base import BaseCommand

from apps.orders.lifecycle import expire_stale_checkouts


class Command(BaseCommand):
    help = "Expire stale quotes/reservations and return reserved stock exactly once."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)

    def handle(self, *args, **options):
        result = expire_stale_checkouts(limit=max(1, min(options["limit"], 5_000)))
        self.stdout.write(
            self.style.SUCCESS(
                f"Expired quotes: {result['expired_quotes']}; released orders: {result['released_orders']}"
            )
        )
