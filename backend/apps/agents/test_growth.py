from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.analytics.services import merchant_analytics_payload
from apps.merchants.models import Merchant, Product, ProductRelationship
from apps.orders.models import Order
from apps.orders.tokens import (
    issue_decision_token,
    issue_growth_offer_token,
)
from apps.orders.webhooks import _capture_payment

from .models import (
    AgentSession,
    GrowthExperimentAssignment,
    GrowthOffer,
    RecommendationDecision,
)
from .services import BuyerAgentResponse, ProductRecommendation, _attach_growth_suggestions


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_growth",
    RAZORPAY_KEY_SECRET="growth-secret",
    GROWTH_MAX_ADDON_OFFERS=2,
    GROWTH_EXPERIMENT_ENABLED=False,
)
class GrowthLoopTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("growth-owner", password="test-password")
        self.other_owner = User.objects.create_user("growth-other-owner", password="test-password")
        self.buyer = User.objects.create_user(
            "growth-buyer", email="growth-buyer@example.com", password="test-password"
        )
        self.merchant = Merchant.objects.create(
            owner=self.owner, name="Grounded Goods", email="grounded@example.com"
        )
        self.other_merchant = Merchant.objects.create(
            owner=self.other_owner, name="Other Goods", email="other-grounded@example.com"
        )
        self.primary = Product.objects.create(
            merchant=self.merchant,
            title="USB-C Keyboard",
            category="Keyboards",
            price=Decimal("2500.00"),
            stock_quantity=5,
            specifications={"connector": "usb-c"},
        )
        self.addon = Product.objects.create(
            merchant=self.merchant,
            title="USB-C Travel Case",
            category="Accessories",
            price=Decimal("500.00"),
            stock_quantity=5,
            specifications={"fits": "60-percent keyboard"},
        )
        self.other_product = Product.objects.create(
            merchant=self.other_merchant,
            title="Other Cable",
            category="Accessories",
            price=Decimal("200.00"),
            stock_quantity=5,
        )
        self.relationship = ProductRelationship.objects.create(
            source_product=self.primary,
            related_product=self.addon,
            relationship_type=ProductRelationship.Kind.COMPLEMENT,
            compatibility={"source_specs": {"connector": "usb-c"}},
            benefit="Protects the catalog-listed keyboard size during travel.",
            trade_off="Adds one extra item and ₹500 to the basket.",
            offer_label="Travel companion",
            priority=1,
        )
        self.session = AgentSession.objects.create(
            user_request="USB-C keyboard for travel",
            parsed_constraints={"connector": "usb-c"},
            catalog_candidate_ids=[self.primary.pk],
            provider_source=AgentSession.Source.FALLBACK,
            decision_summary="One primary match.",
        )
        self.primary_decision = RecommendationDecision.objects.create(
            session=self.session,
            product=self.primary,
            rank=1,
            explanation="Matches USB-C requirement.",
            trade_offs=[],
            catalog_snapshot={"unit_price": "2500.00"},
        )
        self.addon_decision = RecommendationDecision.objects.create(
            session=self.session,
            product=self.addon,
            rank=101,
            explanation=self.relationship.benefit,
            trade_offs=[self.relationship.trade_off],
            catalog_snapshot={"unit_price": "500.00"},
        )
        self.offer = GrowthOffer.objects.create(
            session=self.session,
            primary_decision=self.primary_decision,
            addon_decision=self.addon_decision,
            relationship=self.relationship,
            product=self.addon,
            explanation=self.relationship.benefit,
            trade_off=self.relationship.trade_off,
            incremental_cost=self.addon.price,
        )
        self.client = APIClient()

    def test_relationship_crud_is_owner_scoped_and_rejects_cross_merchant_links(self):
        self.client.force_login(self.owner)
        listing = self.client.get("/api/merchants/product-relationships/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["results"][0]["id"], self.relationship.id)
        rejected = self.client.post(
            "/api/merchants/product-relationships/",
            {
                "source_product": self.primary.pk,
                "related_product": self.other_product.pk,
                "relationship_type": "ACCESSORY",
                "compatibility": {},
                "benefit": "Unsupported cross-tenant claim.",
                "priority": 2,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        dark_pattern = self.client.post(
            "/api/merchants/product-relationships/",
            {
                "source_product": self.primary.pk,
                "related_product": self.addon.pk,
                "relationship_type": "ACCESSORY",
                "compatibility": {},
                "benefit": "Catalog-defined accessory.",
                "offer_label": "Limited 50% off",
                "priority": 2,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(dark_pattern.status_code, 400)
        self.client.force_login(self.other_owner)
        self.assertEqual(
            self.client.get(f"/api/merchants/product-relationships/{self.relationship.pk}/").status_code,
            404,
        )

    def test_deterministic_service_offers_only_eligible_compatible_products(self):
        response = BuyerAgentResponse(
            thought_process=["Grounded primary result."],
            recommendations=[
                ProductRecommendation(
                    product_id=self.primary.pk,
                    title=self.primary.title,
                    merchant=self.merchant.name,
                    price=2500.0,
                    stock_quantity=5,
                    match_score=90,
                    reason="Matches requested connector.",
                )
            ],
            summary_reasoning="One primary result.",
        )
        enriched = _attach_growth_suggestions(response)
        self.assertEqual(len(enriched.add_on_suggestions), 1)
        self.assertEqual(enriched.add_on_suggestions[0].product_id, self.addon.pk)
        self.assertEqual(enriched.add_on_suggestions[0].incremental_cost, 500.0)

        Product.objects.filter(pk=self.addon.pk).update(stock_quantity=0)
        self.assertEqual(_attach_growth_suggestions(response).add_on_suggestions, [])
        Product.objects.filter(pk=self.addon.pk).update(stock_quantity=5)
        self.assertEqual(
            _attach_growth_suggestions(response, {"max_price": 2900}).add_on_suggestions,
            [],
        )
        Product.objects.filter(pk=self.primary.pk).update(
            specifications={"connector": "bluetooth"}
        )
        self.assertEqual(_attach_growth_suggestions(response).add_on_suggestions, [])

    @patch("apps.agents.views.run_buyer_agent")
    def test_public_search_persists_signed_offer_lineage(self, run_agent):
        run_agent.return_value = {
            "thought_process": ["Grounded catalog comparison."],
            "recommendations": [{
                "product_id": self.primary.pk,
                "title": self.primary.title,
                "merchant": self.merchant.name,
                "price": 2500.0,
                "category": self.primary.category,
                "stock_quantity": 5,
                "rating": 0,
                "match_score": 90,
                "key_specs": self.primary.specifications,
                "reason": "Matches USB-C requirement.",
                "tradeoffs": [],
            }],
            "add_on_suggestions": [{
                "relationship_id": self.relationship.pk,
                "primary_product_id": self.primary.pk,
                "product_id": self.addon.pk,
                "title": self.addon.title,
                "merchant": self.merchant.name,
                "relationship_type": "COMPLEMENT",
                "offer_label": "Travel companion",
                "incremental_cost": 500.0,
                "stock_quantity": 5,
                "key_specs": self.addon.specifications,
                "compatibility": self.relationship.compatibility,
                "constraint_evidence": ["Compatibility rule checked."],
                "benefit": self.relationship.benefit,
                "trade_off": self.relationship.trade_off,
            }],
            "summary_reasoning": "One grounded primary with one compatible option.",
            "_audit_context": {
                "provider_source": "FALLBACK",
                "parsed_constraints": {"connector": "usb-c"},
                "catalog_candidate_ids": [self.primary.pk],
            },
        }
        response = APIClient().post(
            "/api/agents/search/", {"query": "USB-C keyboard for travel"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["add_on_suggestions"]), 1)
        persisted = GrowthOffer.objects.exclude(pk=self.offer.pk).get()
        self.assertEqual(payload["add_on_suggestions"][0]["offer_id"], str(persisted.pk))
        self.assertTrue(payload["add_on_suggestions"][0]["offer_token"])
        self.assertEqual(persisted.primary_decision.product_id, self.primary.pk)

    @override_settings(
        GROWTH_EXPERIMENT_ENABLED=True,
        GROWTH_EXPERIMENT_KEY="growth-holdout-test",
        GROWTH_EXPERIMENT_TREATMENT_BPS=0,
    )
    @patch("apps.agents.views.run_buyer_agent")
    def test_control_assignment_is_persisted_without_rendering_an_offer(self, run_agent):
        run_agent.return_value = {
            "thought_process": ["Grounded catalog comparison."],
            "recommendations": [{
                "product_id": self.primary.pk,
                "title": self.primary.title,
                "merchant": self.merchant.name,
                "price": 2500.0,
                "category": self.primary.category,
                "stock_quantity": 5,
                "rating": 0,
                "match_score": 90,
                "key_specs": self.primary.specifications,
                "reason": "Matches USB-C requirement.",
                "tradeoffs": [],
            }],
            "add_on_suggestions": [{
                "relationship_id": self.relationship.pk,
                "primary_product_id": self.primary.pk,
                "product_id": self.addon.pk,
                "title": self.addon.title,
                "merchant": self.merchant.name,
                "relationship_type": "COMPLEMENT",
                "offer_label": "Travel companion",
                "incremental_cost": 500.0,
                "stock_quantity": 5,
                "key_specs": self.addon.specifications,
                "compatibility": self.relationship.compatibility,
                "constraint_evidence": ["Compatibility rule checked."],
                "benefit": self.relationship.benefit,
                "trade_off": self.relationship.trade_off,
            }],
            "summary_reasoning": "One grounded primary with one compatible option.",
            "_audit_context": {
                "provider_source": "FALLBACK",
                "parsed_constraints": {"connector": "usb-c"},
                "catalog_candidate_ids": [self.primary.pk],
            },
        }
        response = APIClient().post(
            "/api/agents/search/", {"query": "USB-C keyboard for travel"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["add_on_suggestions"], [])
        assignment = GrowthExperimentAssignment.objects.get(
            experiment_key="growth-holdout-test"
        )
        self.assertEqual(assignment.variant, GrowthExperimentAssignment.Variant.CONTROL)
        self.assertEqual(assignment.offers_shown, 0)
        self.assertEqual(assignment.eligible_addon_product_id, self.addon.pk)

    def _respond(self, accepted):
        self.client.force_login(self.buyer)
        return self.client.post(
            f"/api/agents/growth-offers/{self.offer.pk}/respond/",
            {"offer_token": issue_growth_offer_token(self.offer), "accepted": accepted},
            format="json",
        )

    def test_rejection_is_explicit_and_cannot_be_added_to_cart(self):
        response = self._respond(False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["response"], GrowthOffer.Response.REJECTED)
        cart = self.client.post(
            "/api/orders/carts/",
            {"items": [{
                "decision_id": str(self.addon_decision.pk),
                "decision_token": issue_decision_token(self.session, self.addon_decision),
                "growth_offer_id": str(self.offer.pk),
                "quantity": 1,
            }]},
            format="json",
        )
        self.assertEqual(cart.status_code, 400)
        self.assertFalse(Order.objects.exists())

    @patch("apps.orders.views.create_razorpay_order")
    @patch("apps.orders.views.get_razorpay_client")
    def test_paid_buyer_approved_addon_is_attributed_without_causal_claim(self, get_client, create_gateway):
        get_client.return_value = object()
        create_gateway.return_value = {"id": "order_growth_paid", "amount": 300000, "currency": "INR"}
        self.assertEqual(self._respond(True).status_code, 200)
        addon_only = self.client.post(
            "/api/orders/carts/",
            {"items": [{
                "decision_id": str(self.addon_decision.pk),
                "decision_token": issue_decision_token(self.session, self.addon_decision),
                "growth_offer_id": str(self.offer.pk),
                "quantity": 1,
            }]},
            format="json",
        )
        self.assertEqual(addon_only.status_code, 400)
        cart_payload = {
            "items": [
                {
                    "decision_id": str(self.primary_decision.pk),
                    "decision_token": issue_decision_token(self.session, self.primary_decision),
                    "quantity": 1,
                },
                {
                    "decision_id": str(self.addon_decision.pk),
                    "decision_token": issue_decision_token(self.session, self.addon_decision),
                    "growth_offer_id": str(self.offer.pk),
                    "quantity": 1,
                },
            ]
        }
        cart = self.client.post("/api/orders/carts/", cart_payload, format="json")
        self.assertEqual(cart.status_code, 201)
        self.assertEqual(
            self.client.post("/api/orders/carts/", cart_payload, format="json").status_code,
            400,
        )
        quote = self.client.post(
            f"/api/orders/carts/{cart.json()['cart_id']}/quote/", {}, format="json"
        )
        self.assertEqual(quote.status_code, 201)
        self.assertEqual(Decimal(quote.json()["total_amount"]), Decimal("3000.00"))
        quote_id = quote.json()["quote_id"]
        approval = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY="growth-approval",
        )
        order_response = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": approval.json()["approval_token"]},
            format="json",
            HTTP_IDEMPOTENCY_KEY="growth-payment",
        )
        self.assertEqual(order_response.status_code, 201)
        order, processed = _capture_payment(
            {
                "order_id": "order_growth_paid",
                "id": "pay_growth_paid",
                "status": "captured",
                "currency": "INR",
                "amount": 300000,
            },
            "verified-signature",
        )
        self.assertTrue(processed)
        self.assertEqual(order.status, Order.Status.PAID)
        synthetic_session = AgentSession.objects.create(
            user_request="Synthetic scenario",
            parsed_constraints={},
            catalog_candidate_ids=[self.primary.pk],
            provider_source=AgentSession.Source.FALLBACK,
            decision_summary="Synthetic only.",
        )
        synthetic_primary = RecommendationDecision.objects.create(
            session=synthetic_session, product=self.primary, rank=1,
            explanation="Synthetic primary.", trade_offs=[], catalog_snapshot={},
        )
        synthetic_addon = RecommendationDecision.objects.create(
            session=synthetic_session, product=self.addon, rank=101,
            explanation="Synthetic add-on.", trade_offs=[], catalog_snapshot={},
        )
        GrowthOffer.objects.create(
            session=synthetic_session,
            primary_decision=synthetic_primary,
            addon_decision=synthetic_addon,
            relationship=self.relationship,
            product=self.addon,
            explanation="Synthetic add-on.",
            incremental_cost=self.addon.price,
            response=GrowthOffer.Response.REJECTED,
            is_synthetic=True,
        )
        payload = merchant_analytics_payload(self.merchant.pk)
        self.assertEqual(payload["growth"]["real"]["offer_impressions"], 1)
        self.assertEqual(payload["growth"]["synthetic"]["offer_impressions"], 1)
        self.assertEqual(payload["growth"]["real"]["paid_attached_offers"], 1)
        self.assertEqual(
            Decimal(payload["growth"]["real"]["incremental_paid_revenue"]),
            Decimal("500.00"),
        )
        self.assertIn("not a causal lift estimate", payload["growth"]["attribution_note"])

    @override_settings(
        GROWTH_EXPERIMENT_ENABLED=True,
        GROWTH_EXPERIMENT_KEY="analytics-holdout-test",
        GROWTH_EXPERIMENT_MIN_SAMPLE_PER_VARIANT=10,
    )
    def test_experiment_report_keeps_control_sessions_in_the_denominator(self):
        GrowthExperimentAssignment.objects.create(
            session=self.session,
            primary_decision=self.primary_decision,
            merchant=self.merchant,
            eligible_addon_product=self.addon,
            experiment_key="analytics-holdout-test",
            variant=GrowthExperimentAssignment.Variant.TREATMENT,
            assignment_unit_hash="a" * 64,
            eligibility_snapshot={"randomization_unit": "agent_session"},
            offers_shown=1,
        )
        control_session = AgentSession.objects.create(
            user_request="Control eligible search",
            parsed_constraints={},
            catalog_candidate_ids=[self.primary.pk],
            provider_source=AgentSession.Source.FALLBACK,
            decision_summary="Eligible control.",
        )
        control_decision = RecommendationDecision.objects.create(
            session=control_session,
            product=self.primary,
            rank=1,
            explanation="Eligible control.",
            trade_offs=[],
            catalog_snapshot={},
        )
        GrowthExperimentAssignment.objects.create(
            session=control_session,
            primary_decision=control_decision,
            merchant=self.merchant,
            eligible_addon_product=self.addon,
            experiment_key="analytics-holdout-test",
            variant=GrowthExperimentAssignment.Variant.CONTROL,
            assignment_unit_hash="b" * 64,
            eligibility_snapshot={"randomization_unit": "agent_session"},
        )
        experiment = merchant_analytics_payload(self.merchant.pk)["growth"]["experiment"]
        self.assertEqual(experiment["status"], "COLLECTING")
        self.assertEqual(experiment["arms"]["control"]["assigned_sessions"], 1)
        self.assertEqual(experiment["arms"]["control"]["offer_exposures"], 0)
        self.assertEqual(experiment["arms"]["treatment"]["assigned_sessions"], 1)
        self.assertEqual(experiment["arms"]["treatment"]["offer_exposures"], 1)
        self.assertIn("at least 10", experiment["interpretation"])
