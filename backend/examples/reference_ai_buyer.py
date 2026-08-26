"""Reference external buyer for the Nexora commerce v1 HTTP contract.

This module intentionally imports no Django model or internal service. It uses
only the published capability document and HTTP endpoints.
"""

import argparse
import http.cookiejar
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from decimal import Decimal
from pathlib import Path


class CommerceAPIError(RuntimeError):
    def __init__(self, status, payload):
        self.status = status
        self.payload = payload
        code = payload.get("error", {}).get("code") or payload.get("reason_code") or "HTTP_ERROR"
        message = payload.get("error", {}).get("message") or payload.get("detail") or str(payload)
        super().__init__(f"{status} {code}: {message}")


class AgentCommerceClient:
    def __init__(self, base_url, *, timeout=30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf_token = ""
        self.capability = None

    def _request(self, method, url, payload=None, *, headers=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request_headers = {"Accept": "application/json", **(headers or {})}
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        if self.csrf_token and method not in {"GET", "HEAD", "OPTIONS"}:
            request_headers["X-CSRFToken"] = self.csrf_token
            request_headers["Referer"] = self.base_url + "/"
        request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                error_payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                error_payload = {"detail": raw.decode("utf-8", errors="replace")}
            raise CommerceAPIError(exc.code, error_payload) from exc

    def discover_capability(self):
        self.capability = self._request(
            "GET", f"{self.base_url}/.well-known/nexora-commerce.json"
        )
        return self.capability

    def authenticate(self, username, password):
        capability = self.capability or self.discover_capability()
        bootstrap = self._request("GET", capability["authentication"]["bootstrap_url"])
        self.csrf_token = bootstrap["csrf_token"]
        logged_in = self._request(
            "POST",
            capability["authentication"]["login_url"],
            {"username": username, "password": password},
        )
        self.csrf_token = logged_in["csrf_token"]
        return logged_in["user"]

    def discover_products(self, *, query="", category="", max_price=None, page_size=10):
        capability = self.capability or self.discover_capability()
        params = {"page_size": min(50, max(1, page_size))}
        if query:
            params["q"] = query
        if category:
            params["category"] = category
        if max_price is not None:
            params["max_price"] = str(max_price)
        url = capability["catalog"]["products_url"] + "?" + urllib.parse.urlencode(params)
        return self._request("GET", url)

    def create_quote(self, product_id, *, quantity=1, intent="External AI buyer selection"):
        capability = self.capability or self.discover_capability()
        return self._request(
            "POST",
            capability["transaction"]["quote_url"],
            {"intent": intent, "items": [{"product_id": product_id, "quantity": quantity}]},
            headers={"Idempotency-Key": f"reference-quote-{uuid.uuid4()}"},
        )

    def approve_quote(self, quote):
        url = urllib.parse.unquote(
            self.capability["transaction"]["approve_url_template"]
        ).replace(
            "{quote_id}", quote["quote_id"]
        )
        return self._request(
            "POST",
            url,
            {"confirmed": True},
            headers={"Idempotency-Key": f"reference-approval-{uuid.uuid4()}"},
        )

    def create_checkout(self, quote, approval):
        return self._request(
            "POST",
            self.capability["transaction"]["checkout_url"],
            {"quote_id": quote["quote_id"], "approval_token": approval["approval_token"]},
            headers={"Idempotency-Key": f"reference-checkout-{uuid.uuid4()}"},
        )

    def get_order(self, order_id):
        url = urllib.parse.unquote(
            self.capability["transaction"]["order_status_url_template"]
        ).replace(
            "{order_id}", order_id
        )
        return self._request("GET", url)

    def open_razorpay_handoff(self, order):
        values = {
            "key": order["key"],
            "amount": order["amount"],
            "currency": order["currency"],
            "order_id": order["razorpay_order_id"],
        }
        html = f"""<!doctype html><meta charset=\"utf-8\"><title>Nexora Razorpay handoff</title>
<script src=\"https://checkout.razorpay.com/v1/checkout.js\"></script>
<body><p id=\"status\">Opening Razorpay test checkout…</p><script>
const options = {json.dumps(values)};
options.name = 'Nexora';
options.description = 'Human-approved agent commerce checkout';
options.handler = () => document.getElementById('status').textContent =
  'Browser authorization received. Settlement remains pending until verified backend confirmation.';
const checkout = new Razorpay(options);
checkout.on('payment.failed', () => document.getElementById('status').textContent =
  'Payment failed. The backend remains authoritative.');
checkout.open();
</script></body>"""
        handle = tempfile.NamedTemporaryFile(
            mode="w", suffix=".html", prefix="nexora-checkout-", delete=False, encoding="utf-8"
        )
        with handle:
            handle.write(html)
        path = Path(handle.name).resolve()
        webbrowser.open(path.as_uri())
        return path

    def run(
        self,
        *,
        username,
        password,
        query,
        category="",
        max_price=None,
        confirm=None,
        open_checkout=True,
        poll=True,
        poll_attempts=20,
        poll_interval=3,
    ):
        capability = self.discover_capability()
        if capability["contract_version"] != "1.0.0":
            raise RuntimeError(f"Unsupported contract version: {capability['contract_version']}")
        catalog = self.discover_products(query=query, category=category, max_price=max_price)
        products = catalog.get("results", [])
        if not products:
            raise RuntimeError("No eligible catalog product matched the bounded query.")
        selected = products[0]
        self.authenticate(username, password)
        quote = self.create_quote(
            selected["id"], intent=f"Reference external buyer query: {query}"
        )
        if confirm is None:
            expected = f"APPROVE {quote['quote_id']}"
            print(json.dumps({"selected_product": selected, "exact_quote": quote}, indent=2))
            confirmed = input(f"Type '{expected}' to approve this exact quote: ").strip() == expected
        else:
            confirmed = bool(confirm(quote))
        if not confirmed:
            return {"status": "HUMAN_REJECTED", "product": selected, "quote": quote}
        approval = self.approve_quote(quote)
        order = self.create_checkout(quote, approval)
        checkout_path = self.open_razorpay_handoff(order) if open_checkout else None
        if poll:
            terminal = {"PAID", "PAYMENT_FAILED", "CANCELLED", "EXPIRED", "REFUND_PENDING", "REFUNDED"}
            for _ in range(poll_attempts):
                order = self.get_order(order["order_id"])
                if order["status"] in terminal:
                    break
                time.sleep(poll_interval)
        return {
            "status": order["status"],
            "product": selected,
            "quote": quote,
            "approval": approval,
            "order": order,
            "checkout_path": str(checkout_path) if checkout_path else None,
        }


def main():
    parser = argparse.ArgumentParser(description="Nexora public-contract reference AI buyer")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--query", required=True)
    parser.add_argument("--category", default="")
    parser.add_argument("--max-price", type=Decimal)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--no-poll", action="store_true")
    args = parser.parse_args()
    username = os.environ.get("NEXORA_BUYER_USERNAME")
    password = os.environ.get("NEXORA_BUYER_PASSWORD")
    if not username or not password:
        raise SystemExit("Set NEXORA_BUYER_USERNAME and NEXORA_BUYER_PASSWORD in the environment.")
    result = AgentCommerceClient(args.base_url).run(
        username=username,
        password=password,
        query=args.query,
        category=args.category,
        max_price=args.max_price,
        open_checkout=not args.no_browser,
        poll=not args.no_poll,
    )
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
