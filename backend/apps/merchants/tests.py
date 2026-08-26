import os
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.agents.services import AgentServiceError, run_buyer_agent
from apps.merchants.management.commands.seed_track_demo import (
    DEMO_PROMPT,
    NO_RESULT_PROMPT,
)
from apps.merchants.models import Merchant, Product, ProductRelationship


DEMO_ENV = {
    "DEMO_BUYER_USERNAME": "track-demo-buyer",
    "DEMO_BUYER_EMAIL": "track-buyer@example.test",
    "DEMO_BUYER_PASSWORD": "environment-only-track-buyer-pass",
    "DEMO_MERCHANT_USERNAME": "track-demo-merchant",
    "DEMO_MERCHANT_EMAIL": "track-merchant@example.test",
    "DEMO_MERCHANT_PASSWORD": "environment-only-track-merchant-pass",
    "DEMO_MERCHANT_NAME": "Nexora Track Merchant",
}


@patch.dict(os.environ, DEMO_ENV)
class TrackDemoSeedTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(
            "real-owner", "real-owner@example.test", "test-password"
        )
        self.real_merchant = Merchant.objects.create(
            owner=owner,
            name="Real Merchant",
            email="real-merchant@example.test",
        )
        self.real_product = Product.objects.create(
            merchant=self.real_merchant,
            title="Merchant-owned non-demo product",
            category="Keyboards",
            price=Decimal("1234.00"),
            stock_quantity=7,
            is_demo=False,
        )

    def test_seed_is_idempotent_and_preserves_non_demo_data(self):
        call_command("seed_track_demo", verbosity=0)
        first_ids = list(
            Product.objects.filter(
                merchant__owner__username=DEMO_ENV["DEMO_MERCHANT_USERNAME"]
            ).order_by("title").values_list("pk", flat=True)
        )
        call_command("seed_track_demo", verbosity=0)
        second_ids = list(
            Product.objects.filter(
                merchant__owner__username=DEMO_ENV["DEMO_MERCHANT_USERNAME"]
            ).order_by("title").values_list("pk", flat=True)
        )

        self.assertEqual(first_ids, second_ids)
        self.assertEqual(len(second_ids), 6)
        self.assertEqual(
            ProductRelationship.objects.filter(
                source_product__merchant__owner__username=DEMO_ENV["DEMO_MERCHANT_USERNAME"]
            ).count(),
            5,
        )
        self.real_product.refresh_from_db()
        self.assertEqual(self.real_product.price, Decimal("1234.00"))
        self.assertEqual(self.real_product.stock_quantity, 7)
        self.assertFalse(self.real_product.is_demo)

    def test_seed_creates_one_eligible_addon_and_safe_negative_scenarios(self):
        call_command("seed_track_demo", verbosity=0)
        primary = Product.objects.get(title="Nexora Nomad 75")
        case = Product.objects.get(title="Nexora Nomad 75 Travel Case")
        sold_out = Product.objects.get(title="Nexora Nomad Cable Organizer")

        eligible = ProductRelationship.objects.get(
            source_product=primary,
            related_product=case,
            relationship_type=ProductRelationship.Kind.ACCESSORY,
        )
        incompatible = ProductRelationship.objects.get(
            source_product=primary,
            related_product__title="Nexora Full-Size Wrist Rest",
        )
        unavailable = ProductRelationship.objects.get(
            source_product=primary,
            related_product=sold_out,
        )

        self.assertEqual(primary.price + case.price, Decimal("8498.00"))
        self.assertEqual(eligible.compatibility, {"source_specs": {"layout": "75%"}})
        self.assertTrue(eligible.is_active)
        self.assertEqual(incompatible.compatibility, {"source_specs": {"layout": "Full size"}})
        self.assertEqual(sold_out.stock_quantity, 0)
        self.assertFalse(unavailable.is_active)

    @override_settings(GROWTH_MAX_ADDON_OFFERS=2)
    @patch("apps.agents.tools.vector_index_available", return_value=False)
    @patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("offline"))
    def test_demo_prompts_are_deterministic_in_fallback(self, _gemini, _vector):
        call_command("seed_track_demo", verbosity=0)

        result = run_buyer_agent(DEMO_PROMPT)
        self.assertEqual(result["_audit_context"]["provider_source"], "FALLBACK")
        self.assertEqual(result["recommendations"][0]["title"], "Nexora Nomad 75")
        self.assertEqual(
            [item["title"] for item in result["add_on_suggestions"]],
            ["Nexora Nomad 75 Travel Case"],
        )

        no_result = run_buyer_agent(NO_RESULT_PROMPT)
        self.assertEqual(no_result["recommendations"], [])
        self.assertEqual(no_result["add_on_suggestions"], [])

    def test_seed_refuses_to_overwrite_a_colliding_non_demo_product(self):
        call_command("seed_demo_accounts", verbosity=0)
        merchant = Merchant.objects.get(
            owner__username=DEMO_ENV["DEMO_MERCHANT_USERNAME"]
        )
        protected = Product.objects.create(
            merchant=merchant,
            title="Nexora Nomad 75",
            category="Keyboards",
            price=Decimal("1.00"),
            stock_quantity=1,
            is_demo=False,
        )

        with self.assertRaisesMessage(CommandError, "Refusing to overwrite non-demo product"):
            call_command("seed_track_demo", verbosity=0)

        protected.refresh_from_db()
        self.assertEqual(protected.price, Decimal("1.00"))
        self.assertFalse(protected.is_demo)
