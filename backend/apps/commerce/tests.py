from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.merchants.models import Merchant, Product, ProductRelationship
from apps.orders.models import Order
from examples.reference_ai_buyer import AgentCommerceClient

from .contracts import CONTRACT_VERSION, CatalogProductContract


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_commerce",
    RAZORPAY_KEY_SECRET="commerce-secret",
    MONEY_REQUIRE_RAZORPAY_TEST_MODE=True,
)
class CommerceContractTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("contract-owner", password="safe-test-password")
        self.buyer = User.objects.create_user(
            "contract-buyer", email="contract-buyer@example.com", password="safe-test-password"
        )
        self.merchant = Merchant.objects.create(
            owner=self.owner,
            name="Contract Merchant",
            email="private-merchant@example.com",
            api_key="private-api-key-that-must-not-leak",
        )
        self.product = Product.objects.create(
            merchant=self.merchant,
            title="External Agent Keyboard",
            description="A structured test product.",
            category="Keyboards",
            price=Decimal("2400.00"),
            stock_quantity=5,
            rating=4.5,
            specifications={"connector": "usb-c"},
            tags=["keyboard", "usb-c"],
        )
        self.addon = Product.objects.create(
            merchant=self.merchant,
            title="Keyboard Sleeve",
            description="Compatible sleeve.",
            category="Accessories",
            price=Decimal("400.00"),
            stock_quantity=2,
            specifications={"material": "neoprene"},
            tags=["sleeve"],
        )
        self.hidden = Product.objects.create(
            merchant=self.merchant,
            title="Hidden Internal Product",
            category="Internal",
            price=Decimal("1.00"),
            stock_quantity=5,
            is_active=False,
        )
        ProductRelationship.objects.create(
            source_product=self.product,
            related_product=self.addon,
            relationship_type=ProductRelationship.Kind.COMPLEMENT,
            compatibility={"source_specs": {"connector": "usb-c"}},
            benefit="Protects the listed keyboard dimensions during travel.",
            trade_off="Adds ₹400 and one line item.",
            offer_label="Travel companion",
        )
        self.client = APIClient()

    def test_capability_openapi_and_product_schema_are_versioned(self):
        capability = self.client.get("/.well-known/nexora-commerce.json")
        self.assertEqual(capability.status_code, 200)
        self.assertEqual(capability.json()["contract_version"], CONTRACT_VERSION)
        self.assertTrue(capability.json()["policies"]["human_approval_required"])
        self.assertEqual(capability.json()["protocol_positioning"]["compliance_claims"], [])
        self.assertEqual(capability["X-Nexora-Contract-Version"], CONTRACT_VERSION)

        openapi = self.client.get("/api/commerce/v1/openapi.json")
        self.assertEqual(openapi.json()["openapi"], "3.1.0")
        self.assertIn("/api/commerce/v1/quotes/", openapi.json()["paths"])
        schema = self.client.get("/api/commerce/v1/schemas/catalog-product.json").json()
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertFalse(schema["additionalProperties"])

    def test_catalog_is_cursor_paginated_schema_valid_and_public_safe(self):
        response = self.client.get("/api/commerce/v1/catalog/products/?page_size=1")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsNotNone(payload["next"])
        item = payload["results"][0]
        CatalogProductContract.model_validate(item)
        serialized = str(payload).lower()
        self.assertNotIn("private-api-key", serialized)
        self.assertNotIn("private-merchant@example.com", serialized)
        self.assertNotIn("buyer", serialized)
        all_titles = []
        next_url = response.json()["next"]
        while next_url:
            page = self.client.get(next_url)
            all_titles.extend(item["title"] for item in page.json()["results"])
            next_url = page.json()["next"]
        all_titles.extend(item["title"] for item in payload["results"])
        self.assertNotIn(self.hidden.title, all_titles)

    def test_catalog_etag_last_modified_and_filter_errors_are_stable(self):
        first = self.client.get("/api/commerce/v1/catalog/products/")
        self.assertIn("ETag", first)
        self.assertIn("Last-Modified", first)
        self.assertEqual(
            self.client.get(
                "/api/commerce/v1/catalog/products/", HTTP_IF_NONE_MATCH=first["ETag"]
            ).status_code,
            304,
        )
        self.assertEqual(
            self.client.get(
                "/api/commerce/v1/catalog/products/",
                HTTP_IF_MODIFIED_SINCE=first["Last-Modified"],
            ).status_code,
            304,
        )
        Product.objects.filter(pk=self.product.pk).update(
            title="Updated External Agent Keyboard", updated_at=timezone.now() + timedelta(seconds=2)
        )
        changed = self.client.get(
            "/api/commerce/v1/catalog/products/", HTTP_IF_NONE_MATCH=first["ETag"]
        )
        self.assertEqual(changed.status_code, 200)
        self.assertNotEqual(changed["ETag"], first["ETag"])
        error = self.client.get("/api/commerce/v1/catalog/products/?private=true")
        self.assertEqual(error.status_code, 400)
        self.assertEqual(error.json()["error"]["code"], "FILTER_NOT_SUPPORTED")

    def test_catalog_mutation_is_not_exposed(self):
        self.assertEqual(
            self.client.post("/api/commerce/v1/catalog/products/", {}, format="json").status_code,
            405,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/commerce/v1/catalog/products/{self.product.pk}/",
                {"price": "0.01"},
                format="json",
            ).status_code,
            405,
        )

    def test_commerce_quote_requires_identity_and_idempotency(self):
        payload = {"intent": "external keyboard", "items": [{"product_id": self.product.pk, "quantity": 1}]}
        unauthenticated = self.client.post(
            "/api/commerce/v1/quotes/", payload, format="json", HTTP_IDEMPOTENCY_KEY="quote-unauth"
        )
        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(unauthenticated.json()["error"]["code"], "AUTHENTICATION_REQUIRED")
        self.client.force_login(self.buyer)
        missing_key = self.client.post("/api/commerce/v1/quotes/", payload, format="json")
        self.assertEqual(missing_key.status_code, 400)
        self.assertEqual(missing_key.json()["error"]["code"], "IDEMPOTENCY_KEY_REQUIRED")

    def test_quote_retry_conflict_and_exact_human_approved_handoff(self):
        self.client.force_login(self.buyer)
        payload = {"intent": "external keyboard", "items": [{"product_id": self.product.pk, "quantity": 1}]}
        first = self.client.post(
            "/api/commerce/v1/quotes/", payload, format="json", HTTP_IDEMPOTENCY_KEY="commerce-quote-1"
        )
        replay = self.client.post(
            "/api/commerce/v1/quotes/", payload, format="json", HTTP_IDEMPOTENCY_KEY="commerce-quote-1"
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 201)
        self.assertTrue(replay.json()["idempotent_replay"])
        self.assertEqual(first.json()["quote_id"], replay.json()["quote_id"])
        conflict = self.client.post(
            "/api/commerce/v1/quotes/",
            {**payload, "items": [{"product_id": self.product.pk, "quantity": 2}]},
            format="json",
            HTTP_IDEMPOTENCY_KEY="commerce-quote-1",
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["error"]["code"], "IDEMPOTENCY_CONFLICT")

        quote_id = first.json()["quote_id"]
        approval = self.client.post(
            f"/api/commerce/v1/quotes/{quote_id}/approve/",
            {"confirmed": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY="commerce-approval-1",
        )
        self.assertEqual(approval.status_code, 201)
        with patch("apps.orders.views.get_razorpay_client", return_value=object()), patch(
            "apps.orders.views.create_razorpay_order",
            return_value={"id": "order_commerce_contract", "amount": 240000, "currency": "INR"},
        ):
            checkout = self.client.post(
                "/api/commerce/v1/checkout-orders/",
                {"quote_id": quote_id, "approval_token": approval.json()["approval_token"]},
                format="json",
                HTTP_IDEMPOTENCY_KEY="commerce-checkout-1",
            )
        self.assertEqual(checkout.status_code, 201)
        self.assertEqual(checkout.json()["status"], Order.Status.PAYMENT_PENDING)
        self.assertEqual(checkout["X-Nexora-Contract-Version"], CONTRACT_VERSION)
        detail = self.client.get(
            f"/api/commerce/v1/orders/{checkout.json()['order_id']}/"
        )
        self.assertEqual(detail.json()["status"], Order.Status.PAYMENT_PENDING)


@override_settings(
    SESSION_COOKIE_SECURE=False,
    CSRF_COOKIE_SECURE=False,
    SECURE_SSL_REDIRECT=False,
    RAZORPAY_KEY_ID="rzp_test_reference",
    RAZORPAY_KEY_SECRET="reference-secret",
)
class ReferenceBuyerEndToEndTests(LiveServerTestCase):
    def _fixture_teardown(self):
        # The optional pgvector table is unmanaged, so Django omits it from the
        # PostgreSQL TRUNCATE set even though it has a foreign key to Product.
        # Dropping it is safe in this disposable test database; Product.save()
        # already treats the semantic index as optional.
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS merchants_product_embedding")
        super()._fixture_teardown()

    def setUp(self):
        User = get_user_model()
        self.username = "reference-buyer"
        self.password = "reference-safe-password"
        self.owner = User.objects.create_user("reference-owner", password="owner-safe-password")
        User.objects.create_user(
            self.username, email="reference@example.com", password=self.password
        )
        merchant = Merchant.objects.create(
            owner=self.owner, name="Reference Merchant", email="reference-merchant@example.com"
        )
        self.product = Product.objects.create(
            merchant=merchant,
            title="Reference External Keyboard",
            description="Discoverable through HTTP only.",
            category="Keyboards",
            price=Decimal("1900.00"),
            stock_quantity=3,
            specifications={"connector": "usb-c"},
            tags=["reference"],
        )

    @patch("apps.orders.views.create_razorpay_order")
    @patch("apps.orders.views.get_razorpay_client")
    def test_reference_client_reaches_human_approved_razorpay_handoff(self, get_client, create_order):
        get_client.return_value = object()
        create_order.return_value = {
            "id": "order_reference_external",
            "amount": 190000,
            "currency": "INR",
        }
        result = AgentCommerceClient(self.live_server_url).run(
            username=self.username,
            password=self.password,
            query="Reference External Keyboard",
            confirm=lambda quote: quote["total_amount"] == "1900.00",
            open_checkout=False,
            poll=False,
        )
        self.assertEqual(result["status"], Order.Status.PAYMENT_PENDING)
        self.assertEqual(result["product"]["id"], self.product.pk)
        self.assertEqual(result["order"]["razorpay_order_id"], "order_reference_external")
        create_order.assert_called_once()
