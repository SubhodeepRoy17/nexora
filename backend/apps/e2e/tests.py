import json
import os
import shutil
import socket
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, override_settings

from apps.agents.models import GrowthOffer
from apps.agents.services import AgentServiceError
from apps.analytics.services import merchant_analytics_payload
from apps.merchants.models import Merchant, Product, ProductRelationship
from apps.orders.models import (
    AgentTransactionAudit,
    ApprovalGrant,
    IdempotencyRecord,
    MoneyActionAudit,
    Order,
    OrderItem,
    Quote,
    StockReservation,
)


ROOT_DIR = Path(__file__).resolve().parents[3]
FRONTEND_DIR = ROOT_DIR / "frontend"
PLAYWRIGHT_SCENARIO = FRONTEND_DIR / "e2e" / "p04-critical-demo.mjs"


def _free_port():
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        return candidate.getsockname()[1]


def _wait_for_server(url, process, attempts=120):
    import time
    import urllib.request

    for _ in range(attempts):
        if process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                return response.status < 500
        except Exception:
            time.sleep(0.25)
    return False


@override_settings(
    SESSION_COOKIE_SECURE=False,
    CSRF_COOKIE_SECURE=False,
    SECURE_SSL_REDIRECT=False,
    RAZORPAY_KEY_ID="rzp_test_p04_browser",
    RAZORPAY_KEY_SECRET="p04-browser-secret",
    MONEY_MAX_ITEM_QUANTITY=5,
    MONEY_MAX_ORDER_VALUE=Decimal("100000.00"),
    MONEY_REQUIRE_RAZORPAY_TEST_MODE=True,
)
class CriticalBrowserEndToEndTests(LiveServerTestCase):
    """Real React/Django/PostgreSQL critical path with provider edges doubled."""

    databases = {"default"}

    def _fixture_teardown(self):
        # The optional unmanaged pgvector table can retain a Product FK in the
        # disposable test database even though Django cannot include it in its
        # flush graph.
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS merchants_product_embedding")
        super()._fixture_teardown()

    def setUp(self):
        User = get_user_model()
        self.buyer_username = "p04-browser-buyer"
        self.buyer_password = "p04-safe-buyer-password"
        self.owner_username = "p04-browser-merchant"
        self.owner_password = "p04-safe-merchant-password"
        self.owner = User.objects.create_user(
            self.owner_username,
            email="p04-owner@example.com",
            password=self.owner_password,
        )
        self.buyer = User.objects.create_user(
            self.buyer_username,
            email="p04-buyer@example.com",
            password=self.buyer_password,
        )
        self.merchant = Merchant.objects.create(
            owner=self.owner,
            name="P0.4 Browser Merchant",
            email="p04-merchant@example.com",
        )
        self.primary = Product.objects.create(
            merchant=self.merchant,
            title="P0.4 Nomad Keyboard",
            description="Quiet 75 percent wireless keyboard for deterministic browser testing.",
            category="Keyboards",
            price=Decimal("7499.00"),
            stock_quantity=8,
            rating=4.9,
            specifications={
                "switches": "Silent tactile",
                "connectivity": ["Bluetooth 5.1", "USB-C"],
                "battery_life_hours": 180,
                "layout": "75%",
                "keycaps": "PBT",
                "hot_swappable": True,
            },
            tags=["keyboard", "quiet", "wireless", "p04"],
        )
        self.addon = Product.objects.create(
            merchant=self.merchant,
            title="P0.4 Fitted Travel Case",
            description="A fitted protective travel case for the P0.4 keyboard.",
            category="Keyboard Accessories",
            price=Decimal("999.00"),
            stock_quantity=4,
            rating=4.7,
            specifications={"layout": "75%", "material": "Recycled felt"},
            tags=["keyboard", "case", "travel", "p04"],
        )
        ProductRelationship.objects.create(
            source_product=self.primary,
            related_product=self.addon,
            relationship_type=ProductRelationship.Kind.ACCESSORY,
            compatibility={"source_specs": {"layout": "75%"}},
            benefit="Protects the catalog-listed 75% keyboard while travelling.",
            trade_off="Adds one basket line and ₹999 to the exact quote.",
            offer_label="Fitted travel companion",
            priority=1,
        )

    def _gateway(self):
        gateway = Mock()
        gateway.utility.verify_payment_signature.return_value = None
        gateway.order.fetch.return_value = {
            "id": "order_p04_browser",
            "amount": 849800,
            "currency": "INR",
            "status": "paid",
        }
        captured_payment = {
            "id": "pay_p04_browser",
            "order_id": "order_p04_browser",
            "amount": 849800,
            "currency": "INR",
            "status": "captured",
        }
        gateway.payment.fetch.return_value = captured_payment
        gateway.order.payments.return_value = {"items": [captured_payment]}
        return gateway

    def _run_vite(self):
        frontend_port = _free_port()
        origin = f"http://localhost:{frontend_port}"
        settings_override = override_settings(
            CORS_ALLOWED_ORIGINS=[origin],
            CSRF_TRUSTED_ORIGINS=[origin],
        )
        settings_override.enable()
        environment = os.environ.copy()
        environment["VITE_API_BASE_URL"] = f"{self.live_server_url}/api/"
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            settings_override.disable()
            self.fail("npm is required for the P0.4 browser suite")
        log = tempfile.NamedTemporaryFile(mode="w+", suffix="-p04-vite.log", delete=False)
        process = subprocess.Popen(
            [npm, "run", "dev", "--", "--host", "localhost", "--port", str(frontend_port), "--strictPort"],
            cwd=FRONTEND_DIR,
            env=environment,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        if not _wait_for_server(origin, process):
            process.terminate()
            process.wait(timeout=10)
            log.flush()
            log.seek(0)
            output = log.read()
            log.close()
            settings_override.disable()
            self.fail(f"Vite did not start for P0.4 E2E:\n{output}")
        return process, log, settings_override, origin

    @patch("apps.orders.views.create_razorpay_order")
    @patch("apps.orders.views.get_razorpay_client")
    @patch("apps.agents.services._gemini_client")
    def test_clean_browser_refresh_and_exactly_once_outcomes(
        self, gemini_client, get_gateway_client, create_gateway_order
    ):
        gemini_client.side_effect = AgentServiceError("P0.4 deterministic provider boundary")
        gateway = self._gateway()
        get_gateway_client.return_value = gateway
        create_gateway_order.return_value = {
            "id": "order_p04_browser",
            "amount": 849800,
            "currency": "INR",
        }
        process, log, settings_override, frontend_url = self._run_vite()
        environment = os.environ.copy()
        environment.update(
            {
                "NEXORA_E2E_FRONTEND_URL": frontend_url,
                "NEXORA_E2E_BACKEND_URL": self.live_server_url,
                "NEXORA_E2E_BUYER_USERNAME": self.buyer_username,
                "NEXORA_E2E_BUYER_PASSWORD": self.buyer_password,
                "NEXORA_E2E_MERCHANT_USERNAME": self.owner_username,
                "NEXORA_E2E_MERCHANT_PASSWORD": self.owner_password,
                "NEXORA_E2E_PRODUCT_TITLE": self.primary.title,
                "NEXORA_E2E_ADDON_TITLE": self.addon.title,
            }
        )
        node = shutil.which("node.exe") or shutil.which("node")
        try:
            completed = subprocess.run(
                [node, str(PLAYWRIGHT_SCENARIO)],
                cwd=FRONTEND_DIR,
                env=environment,
                capture_output=True,
                text=True,
                timeout=240,
            )
            self.assertEqual(
                completed.returncode,
                0,
                msg=f"Playwright scenario failed:\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}",
            )
            browser_result = json.loads(completed.stdout.strip().splitlines()[-1])
            self.assertTrue(browser_result["duplicate_idempotent_replay"])
            self.assertEqual(browser_result["final_status"], Order.Status.PAID)
            self.assertTrue(browser_result["mobile_viewport_checked"])
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            log.close()
            try:
                os.unlink(log.name)
            except OSError:
                pass
            settings_override.disable()

        self.assertEqual(Order.objects.count(), 1)
        order = Order.objects.prefetch_related("items", "reservations").get()
        self.assertEqual(str(order.order_id), browser_result["order_id"])
        self.assertEqual(order.status, Order.Status.PAID)
        self.assertEqual(order.razorpay_payment_id, "pay_p04_browser")
        self.assertEqual(order.total_amount, Decimal("8498.00"))
        self.assertEqual(OrderItem.objects.filter(order=order).count(), 2)
        self.assertEqual(
            OrderItem.objects.get(order=order, product=self.addon).line_total,
            Decimal("999.00"),
        )

        self.primary.refresh_from_db()
        self.addon.refresh_from_db()
        self.assertEqual(self.primary.stock_quantity, 7)
        self.assertEqual(self.addon.stock_quantity, 3)
        self.assertEqual(
            StockReservation.objects.filter(order=order, status=StockReservation.Status.CONSUMED).count(),
            2,
        )

        self.assertEqual(create_gateway_order.call_count, 1)
        self.assertEqual(ApprovalGrant.objects.count(), 1)
        self.assertEqual(
            IdempotencyRecord.objects.filter(operation=IdempotencyRecord.Operation.PAYMENT_ORDER).count(),
            1,
        )
        self.assertEqual(
            MoneyActionAudit.objects.filter(
                action=MoneyActionAudit.Action.MONEY_BLOCKED,
                reason_code="QUANTITY_LIMIT_EXCEEDED",
            ).count(),
            1,
        )
        self.assertEqual(
            MoneyActionAudit.objects.filter(
                order=order, action=MoneyActionAudit.Action.PAYMENT_CAPTURED
            ).count(),
            1,
        )
        self.assertEqual(
            AgentTransactionAudit.objects.filter(
                order=order,
                merchant=self.merchant,
                conversion_status=AgentTransactionAudit.ConversionStatus.PURCHASED,
            ).count(),
            1,
        )
        self.assertEqual(
            GrowthOffer.objects.filter(
                buyer=self.buyer, response=GrowthOffer.Response.ACCEPTED
            ).count(),
            1,
        )
        self.assertEqual(
            GrowthOffer.objects.filter(
                buyer=self.buyer, response=GrowthOffer.Response.REJECTED
            ).count(),
            1,
        )
        blocked_quote = Quote.objects.get(status=Quote.Status.BLOCKED)
        self.assertFalse(ApprovalGrant.objects.filter(quote=blocked_quote).exists())
        self.assertFalse(Order.objects.filter(quote=blocked_quote).exists())

        analytics = merchant_analytics_payload(self.merchant.pk)
        real_growth = analytics["growth"]["real"]
        self.assertEqual(real_growth["paid_attached_offers"], 1)
        self.assertEqual(real_growth["offer_impressions"], 2)
        self.assertEqual(real_growth["incremental_paid_revenue"], "999.00")
        self.assertEqual(analytics["agent_conversions"], 1)
