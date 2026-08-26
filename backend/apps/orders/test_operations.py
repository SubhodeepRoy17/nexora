from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from .models import ScheduledJobRun


class ScheduledJobEvidenceTests(TestCase):
    @patch("apps.orders.management.commands.expire_checkouts.expire_stale_checkouts")
    def test_expiry_command_records_a_sanitized_success(self, expire):
        expire.return_value = {"expired_quotes": 2, "released_orders": 1}

        call_command("expire_checkouts", limit=10)

        run = ScheduledJobRun.objects.get(job=ScheduledJobRun.Job.EXPIRE_CHECKOUTS)
        self.assertEqual(run.status, ScheduledJobRun.Status.SUCCEEDED)
        self.assertEqual(run.summary, {"expired_quotes": 2, "released_orders": 1})
        self.assertIsNotNone(run.completed_at)

    @patch("apps.orders.management.commands.reconcile_razorpay.reconcile_stale_orders")
    def test_reconciliation_command_records_counts_not_provider_details(self, reconcile):
        reconcile.return_value = {
            "checked": 1,
            "repaired": 0,
            "exceptions": [{"order_id": "private-id", "provider_status": "private-status"}],
        }

        call_command("reconcile_razorpay", limit=10)

        run = ScheduledJobRun.objects.get(job=ScheduledJobRun.Job.RECONCILE_RAZORPAY)
        self.assertEqual(run.summary, {"checked": 1, "repaired": 0, "exceptions": 1})
        self.assertNotIn("private-id", str(run.summary))

    @patch("apps.orders.management.commands.expire_checkouts.expire_stale_checkouts")
    def test_failed_job_records_only_exception_type(self, expire):
        expire.side_effect = RuntimeError("secret provider response")

        with self.assertRaises(RuntimeError):
            call_command("expire_checkouts")

        run = ScheduledJobRun.objects.get(job=ScheduledJobRun.Job.EXPIRE_CHECKOUTS)
        self.assertEqual(run.status, ScheduledJobRun.Status.FAILED)
        self.assertEqual(run.error_code, "RuntimeError")
        self.assertNotIn("secret", run.error_code)
