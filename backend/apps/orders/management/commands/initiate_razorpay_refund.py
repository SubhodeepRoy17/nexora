import json

from django.core.management.base import BaseCommand, CommandError

from ...refunds import ALLOWED_REFUND_REASONS, RefundSafetyError, initiate_bounded_refund


class Command(BaseCommand):
    help = "Initiate one operator-confirmed, bounded full-order Razorpay test refund."

    def add_arguments(self, parser):
        parser.add_argument("--order", required=True)
        parser.add_argument("--reason", required=True, choices=sorted(ALLOWED_REFUND_REASONS))
        parser.add_argument(
            "--confirm",
            required=True,
            help="Must exactly equal the local order UUID to prevent accidental initiation.",
        )
        parser.add_argument("--operator", default="OPERATOR_CLI")

    def handle(self, *args, **options):
        if options["confirm"] != options["order"]:
            raise CommandError("--confirm must exactly match --order")
        try:
            refund, created = initiate_bounded_refund(
                order_id=options["order"],
                reason_code=options["reason"],
                requested_by=options["operator"],
            )
        except (RefundSafetyError, ValueError) as exc:
            raise CommandError(getattr(exc, "reason_code", "INVALID_ORDER_ID")) from exc
        self.stdout.write(json.dumps({
            "order_id": str(refund.order_id),
            "refund_id": str(refund.refund_id),
            "razorpay_refund_id": refund.razorpay_refund_id,
            "status": refund.status,
            "created": created,
        }, sort_keys=True))
