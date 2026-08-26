from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from .checks import deployment_settings_check
from .deployment import deployment_report


class DeploymentSafetyTests(SimpleTestCase):
    @override_settings(
        RAZORPAY_KEY_ID="rzp_live_forbidden",
        RAZORPAY_KEY_SECRET="secret",
        RAZORPAY_WEBHOOK_SECRET="webhook",
        MONEY_REQUIRE_RAZORPAY_TEST_MODE=True,
        ALLOWED_HOSTS=["api.example.com"],
        CORS_ALLOWED_ORIGINS=["https://app.example.com"],
        CSRF_TRUSTED_ORIGINS=["https://app.example.com"],
        SECURE_SSL_REDIRECT=True,
    )
    def test_deploy_check_rejects_live_razorpay_key(self):
        self.assertIn("nexora.E001", {message.id for message in deployment_settings_check(None)})

    @patch("nexora_core.views.deployment_report")
    def test_readiness_returns_503_with_sanitized_report(self, report):
        report.return_value = {
            "status": "not_ready",
            "release": "abc123",
            "mode": "razorpay_test_only",
            "configuration": {"ready": True},
            "database": {"connected": False, "error_code": "OperationalError"},
            "schedulers": {"jobs": {}},
        }

        response = self.client.get(reverse("readiness"))

        self.assertEqual(response.status_code, 503)
        self.assertNotContains(response, "password", status_code=503)


@override_settings(
    DEBUG=False,
    ALLOWED_HOSTS=["api.example.test"],
    CORS_ALLOWED_ORIGINS=["https://app.example.test"],
    CSRF_TRUSTED_ORIGINS=["https://app.example.test"],
    SESSION_COOKIE_SECURE=True,
    CSRF_COOKIE_SECURE=True,
    SECURE_SSL_REDIRECT=True,
    MONEY_REQUIRE_RAZORPAY_TEST_MODE=True,
    RAZORPAY_KEY_ID="rzp_test_readiness",
    RAZORPAY_KEY_SECRET="provider-secret",
    RAZORPAY_WEBHOOK_SECRET="webhook-secret",
)
class DatabaseReadinessTests(TestCase):
    def test_report_verifies_current_migrations_pgvector_and_hnsw(self):
        from apps.merchants.vector_setup import setup_vector_index

        self.assertTrue(setup_vector_index())
        report = deployment_report()

        self.assertEqual(report["status"], "ready", report)
        self.assertTrue(report["database"]["migrations_current"])
        self.assertTrue(report["database"]["pgvector_version"])
        self.assertTrue(report["database"]["hnsw_index"])
