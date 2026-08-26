"""Minimal Razorpay API adapter for Nexora's bounded payment operations.

Keeping this adapter small makes the provider boundary explicit and avoids pulling
packaging/build tooling into the runtime dependency graph. Money-state decisions
remain in the order domain; this module only authenticates requests, parses JSON,
and verifies provider signatures.
"""

import hashlib
import hmac
from urllib.parse import quote

import httpx


RAZORPAY_API_BASE_URL = "https://api.razorpay.com"


class RazorpayError(RuntimeError):
    def __init__(self, message, *, status_code=None):
        self.status_code = status_code
        super().__init__(message)


class BadRequestError(RazorpayError):
    pass


class GatewayError(RazorpayError):
    pass


class ServerError(RazorpayError):
    pass


class SignatureVerificationError(RazorpayError):
    pass


class Utility:
    @staticmethod
    def _verify(message, signature, secret):
        if not all(isinstance(value, str) and value for value in (message, signature, secret)):
            raise SignatureVerificationError("Razorpay signature data is incomplete")
        expected = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise SignatureVerificationError("Razorpay signature verification failed")
        return True

    def verify_webhook_signature(self, body, signature, secret):
        return self._verify(body, signature, secret)


class _ClientUtility(Utility):
    def __init__(self, secret):
        self.secret = secret

    def verify_payment_signature(self, attributes):
        try:
            message = f"{attributes['razorpay_order_id']}|{attributes['razorpay_payment_id']}"
            signature = attributes["razorpay_signature"]
        except (KeyError, TypeError) as exc:
            raise SignatureVerificationError("Razorpay payment signature data is incomplete") from exc
        return self._verify(message, signature, self.secret)


def _safe_provider_id(value):
    if not isinstance(value, str) or not value:
        raise BadRequestError("Razorpay resource ID is required")
    return quote(value, safe="")


class _OrderResource:
    def __init__(self, client):
        self.client = client

    def create(self, *, data):
        return self.client.request("POST", "/v1/orders", data=data)

    def fetch(self, order_id):
        return self.client.request("GET", f"/v1/orders/{_safe_provider_id(order_id)}")

    def payments(self, order_id):
        return self.client.request("GET", f"/v1/orders/{_safe_provider_id(order_id)}/payments")


class _PaymentResource:
    def __init__(self, client):
        self.client = client

    def fetch(self, payment_id):
        return self.client.request("GET", f"/v1/payments/{_safe_provider_id(payment_id)}")

    def refund(self, payment_id, *, data):
        return self.client.request("POST", f"/v1/payments/{_safe_provider_id(payment_id)}/refund", data=data)


class RazorpayClient:
    def __init__(self, *, key_id, key_secret, transport=None, timeout=15.0):
        self._http = httpx.Client(
            auth=(key_id, key_secret),
            base_url=RAZORPAY_API_BASE_URL,
            headers={"Accept": "application/json", "User-Agent": "Nexora/1.0"},
            timeout=timeout,
            transport=transport,
        )
        self.order = _OrderResource(self)
        self.payment = _PaymentResource(self)
        self.utility = _ClientUtility(key_secret)

    def request(self, method, path, *, data=None):
        try:
            response = self._http.request(method, path, json=data)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            if status_code >= 500:
                error_type = GatewayError if status_code in {502, 503, 504} else ServerError
            else:
                error_type = BadRequestError
            raise error_type("Razorpay rejected the provider request", status_code=status_code) from exc
        except (httpx.RequestError, ValueError) as exc:
            raise GatewayError("Razorpay did not return a valid provider response") from exc
        if not isinstance(payload, dict):
            raise GatewayError("Razorpay returned an unexpected provider response")
        return payload

    def close(self):
        self._http.close()

