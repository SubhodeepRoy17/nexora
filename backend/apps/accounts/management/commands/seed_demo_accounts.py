import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.merchants.models import Merchant


class Command(BaseCommand):
    help = "Idempotently create environment-configured demo buyer and merchant accounts."

    def _required(self, name):
        value = os.getenv(name, "").strip()
        if not value:
            raise CommandError(f"{name} must be set")
        return value

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        buyer_username = self._required("DEMO_BUYER_USERNAME")
        buyer_email = self._required("DEMO_BUYER_EMAIL")
        buyer_password = self._required("DEMO_BUYER_PASSWORD")
        merchant_username = self._required("DEMO_MERCHANT_USERNAME")
        merchant_email = self._required("DEMO_MERCHANT_EMAIL")
        merchant_password = self._required("DEMO_MERCHANT_PASSWORD")
        merchant_name = self._required("DEMO_MERCHANT_NAME")

        buyer, _ = User.objects.get_or_create(username=buyer_username)
        buyer.email = buyer_email
        buyer.set_password(buyer_password)
        buyer.save(update_fields=["email", "password"])

        merchant_user, _ = User.objects.get_or_create(username=merchant_username)
        merchant_user.email = merchant_email
        merchant_user.set_password(merchant_password)
        merchant_user.save(update_fields=["email", "password"])

        merchant = Merchant.objects.filter(owner=merchant_user).first()
        if merchant is None:
            merchant = Merchant.objects.filter(email=merchant_email).first()
        if merchant and merchant.owner_id != merchant_user.pk:
            if merchant.owner.has_usable_password():
                raise CommandError("DEMO_MERCHANT_EMAIL belongs to another active merchant owner")
        if merchant is None:
            merchant = Merchant(owner=merchant_user, email=merchant_email)
        merchant.name = merchant_name
        merchant.email = merchant_email
        merchant.owner = merchant_user
        merchant.save()

        self.stdout.write(self.style.SUCCESS(
            f"Demo accounts ready: buyer={buyer.username}, merchant={merchant_user.username}"
        ))
