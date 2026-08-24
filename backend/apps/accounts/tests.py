import os
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.analytics.models import AgentSearchImpression
from apps.agents.models import AgentSession, RecommendationDecision
from apps.merchants.models import Merchant, Product
from apps.orders.models import AgentTransactionAudit, Order
from apps.orders.tokens import issue_decision_token


class IdentityBoundaryTests(TestCase):
    def setUp(self):
        cache.clear()
        User = get_user_model()
        self.owner_a = User.objects.create_user("merchant-a", "a@example.com", "safe-test-pass-a")
        self.owner_b = User.objects.create_user("merchant-b", "b@example.com", "safe-test-pass-b")
        self.buyer_a = User.objects.create_user("buyer-a", "buyer-a@example.com", "safe-test-pass-c")
        self.buyer_b = User.objects.create_user("buyer-b", "buyer-b@example.com", "safe-test-pass-d")
        self.merchant_a = Merchant.objects.create(owner=self.owner_a, name="Merchant A", email="shop-a@example.com")
        self.merchant_b = Merchant.objects.create(owner=self.owner_b, name="Merchant B", email="shop-b@example.com")
        self.product_a = Product.objects.create(
            merchant=self.merchant_a,
            title="Product A",
            category="Keyboards",
            price=Decimal("1000.00"),
            stock_quantity=5,
        )
        self.product_b = Product.objects.create(
            merchant=self.merchant_b,
            title="Product B",
            category="Keyboards",
            price=Decimal("2000.00"),
            stock_quantity=5,
        )
        self.client = APIClient()

    def test_login_requires_csrf_and_bootstraps_verified_session(self):
        client = APIClient(enforce_csrf_checks=True)
        bootstrap = client.get("/api/auth/me/")
        self.assertEqual(bootstrap.status_code, 200)
        token = bootstrap.json()["csrf_token"]

        denied = client.post(
            "/api/auth/login/",
            {"username": "buyer-a", "password": "safe-test-pass-c"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        accepted = client.post(
            "/api/auth/login/",
            {"username": "buyer-a", "password": "safe-test-pass-c"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["user"]["role"], "buyer")
        self.assertEqual(client.get("/api/auth/me/").json()["user"]["id"], self.buyer_a.pk)

        self.assertEqual(client.post("/api/auth/logout/", format="json").status_code, 403)
        logged_out = client.post(
            "/api/auth/logout/",
            format="json",
            HTTP_X_CSRFTOKEN=accepted.json()["csrf_token"],
        )
        self.assertEqual(logged_out.status_code, 200)
        self.assertIsNone(client.get("/api/auth/me/").json()["user"])

    def test_unauthenticated_business_endpoints_return_401(self):
        for path in [
            "/api/merchants/",
            "/api/merchants/products/",
            "/api/merchants/analytics/",
            "/api/orders/",
            "/api/orders/audits/",
        ]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(
            self.client.post("/api/orders/create/", {"product_id": self.product_a.pk, "quantity": 1}).status_code,
            401,
        )

    @patch("apps.agents.views.run_buyer_agent")
    def test_public_buyer_search_remains_available(self, run_agent):
        run_agent.return_value = {"thought_process": [], "recommendations": [], "summary_reasoning": "No match."}
        response = self.client.post("/api/agents/search/", {"query": "keyboard under 3000"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_merchant_catalog_is_owner_scoped_and_merchant_is_server_assigned(self):
        self.client.force_login(self.owner_a)
        listing = self.client.get("/api/merchants/products/")
        self.assertEqual([item["id"] for item in listing.json()["results"]], [self.product_a.pk])
        self.assertEqual(self.client.get(f"/api/merchants/products/{self.product_b.pk}/").status_code, 404)

        created = self.client.post(
            "/api/merchants/products/",
            {
                "merchant": self.merchant_b.pk,
                "title": "Owned Product",
                "category": "Accessories",
                "price": "499.00",
                "stock_quantity": 3,
                "rating": 4.5,
                "is_active": True,
                "specifications": {},
                "tags": [],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(Product.objects.get(pk=created.json()["id"]).merchant_id, self.merchant_a.pk)

    def test_analytics_ignores_client_merchant_scope(self):
        AgentSearchImpression.objects.create(
            merchant=self.merchant_a,
            product=self.product_a,
            product_title=self.product_a.title,
            query="a",
            source=AgentSearchImpression.Source.FALLBACK,
            position=1,
        )
        AgentSearchImpression.objects.create(
            merchant=self.merchant_b,
            product=self.product_b,
            product_title=self.product_b.title,
            query="b",
            source=AgentSearchImpression.Source.FALLBACK,
            position=1,
        )
        self.client.force_login(self.owner_a)
        response = self.client.get(f"/api/merchants/analytics/?merchant={self.merchant_b.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_agent_impressions"], 1)

    def test_audits_and_orders_are_scoped_to_owner_or_buyer(self):
        order_a = Order.objects.create(
            buyer=self.buyer_a,
            product=self.product_a,
            buyer_email=self.buyer_a.email,
            quantity=1,
            total_amount=self.product_a.price,
        )
        order_b = Order.objects.create(
            buyer=self.buyer_b,
            product=self.product_b,
            buyer_email=self.buyer_b.email,
            quantity=1,
            total_amount=self.product_b.price,
        )
        AgentTransactionAudit.objects.create(
            order=order_a,
            merchant=self.merchant_a,
            agent_thought_summary="Approved recommendation.",
            conversion_status=AgentTransactionAudit.ConversionStatus.RECOMMENDED,
        )
        AgentTransactionAudit.objects.create(
            order=order_b,
            merchant=self.merchant_b,
            agent_thought_summary="Approved recommendation.",
            conversion_status=AgentTransactionAudit.ConversionStatus.RECOMMENDED,
        )

        self.client.force_login(self.owner_a)
        audits = self.client.get("/api/orders/audits/").json()["results"]
        self.assertEqual([item["order"] for item in audits], [str(order_a.order_id)])
        self.assertNotIn("buyer_email", audits[0])
        merchant_orders = self.client.get("/api/orders/").json()["results"]
        self.assertEqual([item["order_id"] for item in merchant_orders], [str(order_a.order_id)])

        self.client.force_login(self.buyer_b)
        buyer_orders = self.client.get("/api/orders/").json()["results"]
        self.assertEqual([item["order_id"] for item in buyer_orders], [str(order_b.order_id)])
        self.assertEqual(self.client.get("/api/orders/audits/").status_code, 403)

    @patch("apps.orders.views.create_razorpay_order")
    @patch("apps.orders.views.get_razorpay_client")
    @override_settings(RAZORPAY_KEY_ID="rzp_test_identity", RAZORPAY_KEY_SECRET="test-secret")
    def test_checkout_uses_authenticated_buyer_identity(self, get_client, create_gateway_order):
        get_client.return_value = object()
        create_gateway_order.return_value = {"id": "order_identity_test", "amount": 100000, "currency": "INR"}
        agent_session = AgentSession.objects.create(
            buyer=self.buyer_a,
            user_request="Product A",
            parsed_constraints={},
            catalog_candidate_ids=[self.product_a.pk],
            provider_source=AgentSession.Source.FALLBACK,
            decision_summary="Product A matches the request.",
        )
        decision = RecommendationDecision.objects.create(
            session=agent_session,
            product=self.product_a,
            rank=1,
            explanation="Product A matches the request.",
            trade_offs=[],
            catalog_snapshot={"unit_price": "1000.00"},
        )
        self.client.force_login(self.buyer_a)
        quote_response = self.client.post(
            "/api/orders/quotes/",
            {
                "decision_id": str(decision.decision_id),
                "decision_token": issue_decision_token(agent_session, decision),
                "quantity": 1,
            },
            format="json",
        )
        self.assertEqual(quote_response.status_code, 201)
        quote_id = quote_response.json()["quote_id"]
        approval = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"approval-{quote_id}",
        )
        self.assertEqual(approval.status_code, 201)
        response = self.client.post(
            "/api/orders/create/",
            {
                "quote_id": quote_id,
                "approval_token": approval.json()["approval_token"],
                "buyer_email": "spoofed@example.com",
                "total_amount": "1.00",
                "status": "PAID",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(razorpay_order_id="order_identity_test")
        self.assertEqual(order.buyer_id, self.buyer_a.pk)
        self.assertEqual(order.buyer_email, self.buyer_a.email)

    def test_authentication_scope_is_throttled(self):
        client = APIClient(enforce_csrf_checks=True)
        token = client.get("/api/auth/me/").json()["csrf_token"]
        statuses = [
            client.post(
                "/api/auth/login/",
                {"username": "missing", "password": "incorrect"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            ).status_code
            for _ in range(11)
        ]
        self.assertEqual(statuses[-1], 429)


class DemoAccountSeedTests(TestCase):
    @patch.dict(
        os.environ,
        {
            "DEMO_BUYER_USERNAME": "demo-buyer",
            "DEMO_BUYER_EMAIL": "demo-buyer@example.com",
            "DEMO_BUYER_PASSWORD": "environment-only-buyer-pass",
            "DEMO_MERCHANT_USERNAME": "demo-merchant",
            "DEMO_MERCHANT_EMAIL": "demo-merchant@example.com",
            "DEMO_MERCHANT_PASSWORD": "environment-only-merchant-pass",
            "DEMO_MERCHANT_NAME": "Demo Merchant",
        },
    )
    def test_seed_command_is_idempotent_and_environment_driven(self):
        call_command("seed_demo_accounts", verbosity=0)
        call_command("seed_demo_accounts", verbosity=0)
        User = get_user_model()
        self.assertEqual(User.objects.filter(username__in=["demo-buyer", "demo-merchant"]).count(), 2)
        merchant_user = User.objects.get(username="demo-merchant")
        self.assertEqual(Merchant.objects.filter(owner=merchant_user).count(), 1)
        self.assertTrue(merchant_user.check_password("environment-only-merchant-pass"))
