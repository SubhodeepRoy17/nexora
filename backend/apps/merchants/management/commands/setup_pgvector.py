from django.core.management.base import BaseCommand

from apps.merchants.vector_setup import setup_vector_index


class Command(BaseCommand):
    help = "Create and backfill the optional pgvector product index."

    def handle(self, *args, **options):
        if setup_vector_index():
            self.stdout.write(self.style.SUCCESS("pgvector product index is ready."))
        else:
            self.stdout.write(self.style.WARNING("The PostgreSQL server does not provide the vector extension; SQL fallback remains active."))
