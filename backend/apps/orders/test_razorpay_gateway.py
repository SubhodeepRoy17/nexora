import hashlib
import hmac
import json

import httpx
from django.test import SimpleTestCase

from .razorpay_gateway import (
    BadRequestError,
    GatewayError,
    RazorpayClient,
    SignatureVerificationError,
    Utility,
)


class RazorpayGatewayTests(SimpleTestCase):
    def test_resources_use_authenticated_razorpay_endpoints(self):
        requests = []

        def handler(request):
            requests.append(request)
            if request.url.path.endswith("/refund"):
                return httpx.Response(200, json={"id": "rfnd_1", "payment_id": "pay_1"})
            return httpx.Response(200, json={"id": "order_1", "items": []})

        client = RazorpayClient(
            key_id="rzp_test_key",
            key_secret="provider-secret",
            transport=httpx.MockTransport(handler),
        )
        self.addCleanup(client.close)

        client.order.create(data={"amount": 10000, "currency": "INR"})
        client.order.fetch("order_1")
        client.order.payments("order_1")
        client.payment.fetch("pay_1")
        client.payment.refund("pay_1", data={"amount": 10000})

        self.assertEqual(
            [(request.method, request.url.path) for request in requests],
            [
                ("POST", "/v1/orders"),
                ("GET", "/v1/orders/order_1"),
                ("GET", "/v1/orders/order_1/payments"),
                ("GET", "/v1/payments/pay_1"),
                ("POST", "/v1/payments/pay_1/refund"),
            ],
        )
        self.assertTrue(all(request.headers["Authorization"].startswith("Basic ") for request in requests))
        self.assertEqual(json.loads(requests[0].content), {"amount": 10000, "currency": "INR"})

    def test_signatures_are_constant_time_verified_at_both_boundaries(self):
        secret = "provider-secret"
        body = '{"event":"payment.captured"}'
        webhook_signature = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        self.assertTrue(Utility().verify_webhook_signature(body, webhook_signature, secret))

        client = RazorpayClient(
            key_id="rzp_test_key",
            key_secret=secret,
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json={})),
        )
        self.addCleanup(client.close)
        payment_signature = hmac.new(secret.encode(), b"order_1|pay_1", hashlib.sha256).hexdigest()
        self.assertTrue(client.utility.verify_payment_signature({
            "razorpay_order_id": "order_1",
            "razorpay_payment_id": "pay_1",
            "razorpay_signature": payment_signature,
        }))
        with self.assertRaises(SignatureVerificationError):
            client.utility.verify_payment_signature({
                "razorpay_order_id": "order_1",
                "razorpay_payment_id": "pay_1",
                "razorpay_signature": "tampered",
            })

    def test_provider_failures_are_safely_typed(self):
        def rejected(request):
            return httpx.Response(400, json={"error": {"description": "invalid"}})

        client = RazorpayClient(
            key_id="rzp_test_key",
            key_secret="provider-secret",
            transport=httpx.MockTransport(rejected),
        )
        self.addCleanup(client.close)
        with self.assertRaises(BadRequestError):
            client.order.create(data={"amount": 10000})

        invalid_client = RazorpayClient(
            key_id="rzp_test_key",
            key_secret="provider-secret",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, text="not-json")),
        )
        self.addCleanup(invalid_client.close)
        with self.assertRaises(GatewayError):
            invalid_client.order.fetch("order_1")

    def test_provider_ids_cannot_escape_the_resource_path(self):
        seen_path = None

        def handler(request):
            nonlocal seen_path
            seen_path = request.url.raw_path.decode()
            return httpx.Response(200, json={"id": "order_1"})

        client = RazorpayClient(
            key_id="rzp_test_key",
            key_secret="provider-secret",
            transport=httpx.MockTransport(handler),
        )
        self.addCleanup(client.close)
        client.order.fetch("../payments/pay_1")
        self.assertEqual(seen_path, "/v1/orders/..%2Fpayments%2Fpay_1")

