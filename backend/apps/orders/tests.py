import hashlib
import hmac
import json
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import resolve

from .services import amount_to_subunits, create_razorpay_order
from .webhooks import razorpay_webhook


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
            buyer_email="buyer@example.com",
        )

        response = create_razorpay_order(client, order)

        payload = client.order.create.call_args.kwargs["data"]
        self.assertEqual(response["id"], "order_test")
        self.assertEqual(payload["amount"], 159998)
        self.assertEqual(payload["currency"], "INR")
        self.assertEqual(payload["notes"]["product_id"], "42")


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
