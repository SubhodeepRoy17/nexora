import hashlib
import hmac
import json
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections, transaction
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.test import TestCase, TransactionTestCase
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIClient

from apps.agents.models import AgentSession, RecommendationDecision
from apps.merchants.models import Merchant, Product

from .lifecycle import LifecycleError, expire_stale_checkouts, reserve_order_inventory, transition_order
from .models import (
    ApprovalGrant,
    MoneyActionAudit,
    Order,
    OrderItem,
    Quote,
    StockReservation,
)
from .tokens import issue_decision_token
from .services import amount_to_subunits, create_razorpay_order
from .webhooks import _capture_payment, razorpay_webhook


class OrderRouteTests(SimpleTestCase):
    def test_agent_audit_feed_route_is_available(self):
        match = resolve("/api/orders/audits/")
        self.assertEqual(match.url_name, "audit-list")


class RazorpayOrderServiceTests(SimpleTestCase):
    def test_amount_is_converted_to_paise_without_float_math(self):
        self.assertEqual(amount_to_subunits(Decimal("7999.99")), 799999)

    def test_gateway_payload_uses_server_calculated_order_data(self):
        client = Mock()
        client.order.create.return_value = {"id": "order_test", "amount": 159998}
        order = SimpleNamespace(
            order_id=uuid.UUID("12345678-1234-5678-1234-567812345678"),
            total_amount=Decimal("1599.98"),
            product_id=42,
            buyer_id=7,
            buyer_email="buyer@example.com",
        )

        response = create_razorpay_order(client, order)

        payload = client.order.create.call_args.kwargs["data"]
        self.assertEqual(response["id"], "order_test")
        self.assertEqual(payload["amount"], 159998)
        self.assertEqual(payload["currency"], "INR")
        self.assertEqual(payload["notes"]["item_count"], "1")


@override_settings(RAZORPAY_WEBHOOK_SECRET="unit-test-webhook-secret")
class RazorpayWebhookVerificationTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def _signature(self, body: bytes) -> str:
        return hmac.new(b"unit-test-webhook-secret", body, hashlib.sha256).hexdigest()

    def test_rejects_invalid_signature_before_processing(self):
        body = json.dumps({"event": "payment.captured"}).encode()
        request = self.factory.post(
            "/api/orders/webhook/razorpay/",
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE="invalid",
        )

        response = razorpay_webhook(request)

        self.assertEqual(response.status_code, 400)

    def test_accepts_valid_signature_for_ignored_event(self):
        body = json.dumps({"event": "subscription.activated"}, separators=(",", ":")).encode()
        request = self.factory.post(
            "/api/orders/webhook/razorpay/",
            data=body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=self._signature(body),
        )

        response = razorpay_webhook(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)["status"], "ignored")


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_phase7",
    RAZORPAY_KEY_SECRET="phase7-secret",
    MONEY_MAX_ITEM_QUANTITY=5,
    MONEY_MAX_ORDER_VALUE=Decimal("100000.00"),
    MONEY_REQUIRE_RAZORPAY_TEST_MODE=True,
)
class ApprovalGatedMoneyActionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("phase7-merchant", "owner@example.com", "safe-test-pass")
        self.other_owner = User.objects.create_user("other-merchant", "other-owner@example.com", "safe-test-pass")
        self.buyer = User.objects.create_user("phase7-buyer", "buyer@example.com", "safe-test-pass")
        self.other_buyer = User.objects.create_user("other-buyer", "other@example.com", "safe-test-pass")
        self.merchant = Merchant.objects.create(owner=self.owner, name="Phase 7 Shop", email="shop@example.com")
        self.other_merchant = Merchant.objects.create(
            owner=self.other_owner, name="Other Shop", email="other-shop@example.com"
        )
        self.product = Product.objects.create(
            merchant=self.merchant,
            title="Bounded Keyboard",
            category="Keyboards",
            price=Decimal("2500.00"),
            stock_quantity=5,
        )
        self.session = AgentSession.objects.create(
            buyer=self.buyer,
            user_request="A quiet keyboard under 3000",
            parsed_constraints={"max_price": 3000},
            catalog_candidate_ids=[self.product.pk],
            provider_source=AgentSession.Source.FALLBACK,
            decision_summary="One grounded match was found.",
        )
        self.decision = RecommendationDecision.objects.create(
            session=self.session,
            product=self.product,
            rank=1,
            explanation="Within budget, active, and in stock.",
            trade_offs=["No wireless connection."],
            catalog_snapshot={"unit_price": "2500.00", "currency": "INR"},
        )
        self.decision_token = issue_decision_token(self.session, self.decision)
        self.client = APIClient()
        self.client.force_login(self.buyer)

    def create_quote(self, quantity=1):
        response = self.client.post(
            "/api/orders/quotes/",
            {
                "decision_id": str(self.decision.decision_id),
                "decision_token": self.decision_token,
                "quantity": quantity,
            },
            format="json",
        )
        return response

    def approve_quote(self):
        quote_response = self.create_quote()
        self.assertEqual(quote_response.status_code, 201)
        quote_id = quote_response.json()["quote_id"]
        approval = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"approval-{quote_id}",
        )
        self.assertEqual(approval.status_code, 201)
        return quote_id, approval.json()["approval_token"]

    def create_pending_order(self, gateway_id="order_lifecycle"):
        quote_id, approval_token = self.approve_quote()
        with patch("apps.orders.views.get_razorpay_client", return_value=object()), patch(
            "apps.orders.views.create_razorpay_order",
            return_value={"id": gateway_id, "amount": 250000, "currency": "INR"},
        ):
            response = self.client.post(
                "/api/orders/create/",
                {"quote_id": quote_id, "approval_token": approval_token},
                format="json",
                HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
            )
        self.assertEqual(response.status_code, 201)
        return Order.objects.prefetch_related("items", "reservations").get(pk=response.json()["order_id"])

    def test_policy_limit_is_blocked_and_audited_without_side_effects(self):
        response = self.create_quote(quantity=6)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["reason_code"], "QUANTITY_LIMIT_EXCEEDED")
        self.assertEqual(Order.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 5)
        self.assertTrue(MoneyActionAudit.objects.filter(reason_code="QUANTITY_LIMIT_EXCEEDED").exists())

    def test_order_value_and_live_mode_policy_limits_are_deterministic(self):
        with self.settings(MONEY_MAX_ORDER_VALUE=Decimal("100.00")):
            over_value = self.create_quote()
        self.assertEqual(over_value.status_code, 409)
        self.assertEqual(over_value.json()["reason_code"], "ORDER_VALUE_LIMIT_EXCEEDED")

        with self.settings(RAZORPAY_KEY_ID="rzp_live_forbidden"):
            live_mode = self.create_quote()
        self.assertEqual(live_mode.status_code, 409)
        self.assertEqual(live_mode.json()["reason_code"], "TEST_MODE_REQUIRED")
        self.assertFalse(Order.objects.exists())

    def test_expired_quote_is_blocked_before_approval(self):
        quote_id = self.create_quote().json()["quote_id"]
        Quote.objects.filter(pk=quote_id).update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/", {"confirmed": True}, format="json",
            HTTP_IDEMPOTENCY_KEY=f"approval-{quote_id}",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["reason_code"], "QUOTE_EXPIRED")
        self.assertFalse(ApprovalGrant.objects.exists())
        self.assertFalse(Order.objects.exists())

    def test_tampered_approval_is_rejected_and_audited(self):
        quote_id, approval_token = self.approve_quote()
        response = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": f"{approval_token}altered"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["reason_code"], "APPROVAL_TAMPERED")
        self.assertFalse(Order.objects.exists())
        self.assertTrue(MoneyActionAudit.objects.filter(reason_code="APPROVAL_TAMPERED").exists())

    def test_missing_approval_is_rejected_and_audited(self):
        quote_id = self.create_quote().json()["quote_id"]
        response = self.client.post(
            "/api/orders/create/", {"quote_id": quote_id}, format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["reason_code"], "APPROVAL_REQUIRED")
        self.assertFalse(Order.objects.exists())
        self.assertTrue(MoneyActionAudit.objects.filter(reason_code="APPROVAL_REQUIRED").exists())

    @patch("apps.orders.views.create_razorpay_order")
    @patch("apps.orders.views.get_razorpay_client")
    def test_approval_is_single_use_and_browser_amount_is_ignored(self, get_client, create_gateway_order):
        get_client.return_value = object()
        create_gateway_order.return_value = {"id": "order_phase7", "amount": 250000, "currency": "INR"}
        quote_id, approval_token = self.approve_quote()
        payload = {
            "quote_id": quote_id,
            "approval_token": approval_token,
            "total_amount": "1.00",
            "status": "PAID",
            "merchant": self.other_merchant.pk,
        }
        first = self.client.post(
            "/api/orders/create/", payload, format="json", HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}"
        )
        second = self.client.post(
            "/api/orders/create/", payload, format="json", HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}"
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertTrue(second.json()["idempotent_replay"])
        create_gateway_order.assert_called_once()
        order = Order.objects.get()
        self.assertEqual(order.total_amount, Decimal("2500.00"))
        self.assertEqual(order.product.merchant_id, self.merchant.pk)
        self.assertEqual(order.status, Order.Status.PAYMENT_PENDING)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 4)

    def test_expired_approval_and_cross_buyer_use_are_rejected(self):
        quote_id, approval_token = self.approve_quote()
        grant = ApprovalGrant.objects.get()
        ApprovalGrant.objects.filter(pk=grant.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        expired = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": approval_token},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(expired.status_code, 409)
        self.assertEqual(expired.json()["reason_code"], "APPROVAL_EXPIRED")
        self.client.force_login(self.other_buyer)
        cross_buyer = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": approval_token},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"cross-payment-{quote_id}",
        )
        self.assertEqual(cross_buyer.status_code, 404)
        self.assertFalse(Order.objects.exists())

    def test_price_and_stock_are_revalidated_immediately_before_order(self):
        quote_id, approval_token = self.approve_quote()
        Product.objects.filter(pk=self.product.pk).update(price=Decimal("2600.00"))
        changed_price = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": approval_token},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(changed_price.status_code, 409)
        self.assertEqual(changed_price.json()["reason_code"], "PRICE_CHANGED")
        self.assertFalse(Order.objects.exists())

        Product.objects.filter(pk=self.product.pk).update(price=Decimal("2500.00"), stock_quantity=5)
        self.decision = RecommendationDecision.objects.create(
            session=AgentSession.objects.create(
                buyer=self.buyer, user_request="second intent", parsed_constraints={},
                catalog_candidate_ids=[self.product.pk], provider_source=AgentSession.Source.FALLBACK,
                decision_summary="second decision",
            ),
            product=self.product, rank=1, explanation="still suitable", trade_offs=[], catalog_snapshot={},
        )
        self.session = self.decision.session
        self.decision_token = issue_decision_token(self.session, self.decision)
        quote_id, approval_token = self.approve_quote()
        Product.objects.filter(pk=self.product.pk).update(stock_quantity=0)
        changed_stock = self.client.post(
            "/api/orders/create/",
            {"quote_id": quote_id, "approval_token": approval_token},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
        )
        self.assertEqual(changed_stock.status_code, 409)
        self.assertEqual(changed_stock.json()["reason_code"], "OUT_OF_STOCK")
        self.assertFalse(Order.objects.exists())

    def test_money_audit_is_immutable_and_scoped_to_buyer_or_merchant(self):
        self.create_quote()
        audit = MoneyActionAudit.objects.get()
        audit.summary = "attempted overwrite"
        with self.assertRaises(ValueError):
            audit.save()

        buyer_results = self.client.get("/api/orders/money-audits/").json()["results"]
        self.assertEqual(len(buyer_results), 1)
        self.assertNotIn("email", json.dumps(buyer_results).lower())
        self.client.force_login(self.owner)
        self.assertEqual(len(self.client.get("/api/orders/money-audits/").json()["results"]), 1)
        self.client.force_login(self.other_owner)
        self.assertEqual(self.client.get("/api/orders/money-audits/").json()["results"], [])

    def test_expiry_and_cancellation_release_stock_exactly_once(self):
        order = self.create_pending_order("order_expiry")
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock_quantity, 4)
        past = timezone.now() - timedelta(seconds=1)
        Order.objects.filter(pk=order.pk).update(reservation_expires_at=past)
        StockReservation.objects.filter(order=order).update(expires_at=past)
        first = expire_stale_checkouts(now=timezone.now())
        second = expire_stale_checkouts(now=timezone.now())
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.EXPIRED)
        self.assertEqual(first["released_orders"], 1)
        self.assertEqual(second["released_orders"], 0)
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock_quantity, 5)

        self.decision = RecommendationDecision.objects.create(
            session=AgentSession.objects.create(
                buyer=self.buyer, user_request="cancel intent", parsed_constraints={},
                catalog_candidate_ids=[self.product.pk], provider_source=AgentSession.Source.FALLBACK,
                decision_summary="cancel decision",
            ),
            product=self.product, rank=1, explanation="suitable", trade_offs=[], catalog_snapshot={},
        )
        self.session = self.decision.session
        self.decision_token = issue_decision_token(self.session, self.decision)
        cancellable = self.create_pending_order("order_cancel")
        first_cancel = self.client.post(f"/api/orders/{cancellable.pk}/cancel/", format="json")
        second_cancel = self.client.post(f"/api/orders/{cancellable.pk}/cancel/", format="json")
        self.assertEqual(first_cancel.status_code, 200)
        self.assertEqual(second_cancel.status_code, 200)
        self.assertEqual(second_cancel.json()["status"], Order.Status.CANCELLED)
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock_quantity, 5)

    def test_webhook_retry_consumes_reservation_without_second_stock_deduction(self):
        order = self.create_pending_order("order_capture")
        payment = {
            "order_id": "order_capture",
            "id": "pay_capture",
            "status": "captured",
            "currency": "INR",
            "amount": 250000,
        }
        first_order, first_processed = _capture_payment(payment, "verified-signature")
        second_order, second_processed = _capture_payment(payment, "verified-signature")
        self.assertTrue(first_processed)
        self.assertFalse(second_processed)
        self.assertEqual(first_order.status, Order.Status.PAID)
        self.assertEqual(second_order.status, Order.Status.PAID)
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock_quantity, 4)
        self.assertEqual(
            StockReservation.objects.get(order=order).status, StockReservation.Status.CONSUMED
        )
        self.assertEqual(
            MoneyActionAudit.objects.filter(
                order=order, action=MoneyActionAudit.Action.PAYMENT_CAPTURED
            ).count(),
            1,
        )

    def test_multiline_cart_preserves_historical_prices_and_authoritative_status(self):
        second_product = Product.objects.create(
            merchant=self.other_merchant,
            title="Mouse",
            category="Accessories",
            price=Decimal("500.00"),
            stock_quantity=3,
        )
        second_decision = RecommendationDecision.objects.create(
            session=self.session,
            product=second_product,
            rank=2,
            explanation="Complements the keyboard.",
            trade_offs=[],
            catalog_snapshot={"unit_price": "500.00"},
        )
        cart_response = self.client.post(
            "/api/orders/carts/",
            {
                "items": [
                    {
                        "decision_id": str(self.decision.pk),
                        "decision_token": self.decision_token,
                        "quantity": 2,
                    },
                    {
                        "decision_id": str(second_decision.pk),
                        "decision_token": issue_decision_token(self.session, second_decision),
                        "quantity": 1,
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(cart_response.status_code, 201)
        quote_response = self.client.post(
            f"/api/orders/carts/{cart_response.json()['cart_id']}/quote/", format="json"
        )
        self.assertEqual(quote_response.status_code, 201)
        self.assertEqual(len(quote_response.json()["items"]), 2)
        self.assertEqual(Decimal(quote_response.json()["total_amount"]), Decimal("5500.00"))
        quote_id = quote_response.json()["quote_id"]
        approval = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"approval-{quote_id}",
        )
        with patch("apps.orders.views.get_razorpay_client", return_value=object()), patch(
            "apps.orders.views.create_razorpay_order",
            return_value={"id": "order_multi", "amount": 550000, "currency": "INR"},
        ):
            created = self.client.post(
                "/api/orders/create/",
                {"quote_id": quote_id, "approval_token": approval.json()["approval_token"]},
                format="json",
                HTTP_IDEMPOTENCY_KEY=f"payment-{quote_id}",
            )
        self.assertEqual(created.status_code, 201)
        order = Order.objects.get(pk=created.json()["order_id"])
        Product.objects.filter(pk=self.product.pk).update(price=Decimal("9999.00"))
        Product.objects.filter(pk=second_product.pk).update(price=Decimal("999.00"))
        snapshots = list(order.items.order_by("unit_price").values_list("unit_price", "line_total"))
        self.assertEqual(snapshots, [(Decimal("500.00"), Decimal("500.00")), (Decimal("2500.00"), Decimal("5000.00"))])
        detail = self.client.get(f"/api/orders/{order.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["status"], Order.Status.PAYMENT_PENDING)
        self.assertEqual(len(detail.json()["items"]), 2)

    def test_idempotency_conflict_and_illegal_transition_are_rejected(self):
        quote_id = self.create_quote().json()["quote_id"]
        key = "approval-shared-key"
        first = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True}, format="json", HTTP_IDEMPOTENCY_KEY=key,
        )
        retry = self.client.post(
            f"/api/orders/quotes/{quote_id}/approve/",
            {"confirmed": True}, format="json", HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(first.json()["approval_token"], retry.json()["approval_token"])
        self.assertTrue(retry.json()["idempotent_replay"])

        other_quote_id = self.create_quote().json()["quote_id"]
        conflict = self.client.post(
            f"/api/orders/quotes/{other_quote_id}/approve/",
            {"confirmed": True}, format="json", HTTP_IDEMPOTENCY_KEY=key,
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["reason_code"], "IDEMPOTENCY_CONFLICT")

        order = Order.objects.create(
            buyer=self.buyer, product=self.product, buyer_email=self.buyer.email,
            quantity=1, total_amount=self.product.price, status=Order.Status.PAYMENT_PENDING,
        )
        with self.assertRaises(LifecycleError):
            transition_order(order, Order.Status.DRAFT)


@override_settings(ORDER_RESERVATION_TTL_SECONDS=900)
class ReservationConcurrencyTests(TransactionTestCase):
    def _fixture_teardown(self):
        # The optional unmanaged pgvector table has a real FK and is intentionally
        # absent from Django's SQL flush list. This one-test class drops the whole
        # test database immediately afterward, so closing worker connections is
        # the correct isolation boundary.
        connections.close_all()

    def setUp(self):
        User = get_user_model()
        owner = User.objects.create_user("concurrent-owner", "owner-concurrent@example.com", "pass")
        self.buyer = User.objects.create_user("concurrent-buyer", "buyer-concurrent@example.com", "pass")
        merchant = Merchant.objects.create(owner=owner, name="Concurrency Shop", email="concurrency@example.com")
        self.product = Product.objects.create(
            merchant=merchant, title="Last Unit", category="Test", price=Decimal("10.00"), stock_quantity=1
        )
        self.orders = []
        for index in range(2):
            order = Order.objects.create(
                buyer=self.buyer, product=self.product, buyer_email=self.buyer.email,
                quantity=1, total_amount=Decimal("10.00"), status=Order.Status.PAYMENT_PENDING,
            )
            OrderItem.objects.create(
                order=order, product=self.product, merchant=merchant, product_title=self.product.title,
                merchant_name=merchant.name, unit_price=Decimal("10.00"), quantity=1,
                line_total=Decimal("10.00"),
            )
            self.orders.append(order.pk)

    def test_competing_reservations_cannot_oversell(self):
        barrier = threading.Barrier(2)

        def attempt(order_id):
            close_old_connections()
            barrier.wait()
            try:
                with transaction.atomic():
                    order = Order.objects.select_for_update().get(pk=order_id)
                    reserve_order_inventory(
                        order, expires_at=timezone.now() + timedelta(minutes=15)
                    )
                return "reserved"
            except LifecycleError as exc:
                return exc.reason_code
            finally:
                connections["default"].close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt, self.orders))
        self.assertEqual(results.count("reserved"), 1)
        self.assertEqual(results.count("INSUFFICIENT_STOCK"), 1)
        self.assertEqual(Product.objects.get(pk=self.product.pk).stock_quantity, 0)
        self.assertEqual(StockReservation.objects.filter(status=StockReservation.Status.ACTIVE).count(), 1)
