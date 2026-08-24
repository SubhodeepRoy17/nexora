import logging

from django.conf import settings
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from razorpay.errors import BadRequestError, GatewayError, ServerError
from requests import RequestException

from apps.merchants.models import Product

from .models import AgentTransactionAudit, Order
from .serializers import AgentTransactionAuditSerializer, CreateOrderSerializer
from .services import (
    PaymentConfigurationError,
    amount_to_subunits,
    create_razorpay_order,
    get_razorpay_client,
)


logger = logging.getLogger(__name__)
RAZORPAY_REQUEST_ERRORS = (BadRequestError, GatewayError, ServerError)
ORDER_CREATION_ERRORS = RAZORPAY_REQUEST_ERRORS + (RequestException, KeyError, TypeError, ValueError)


class AgentTransactionAuditListView(ListAPIView):
    """Read-only webhook-backed activity consumed by the merchant dashboard."""

    serializer_class = AgentTransactionAuditSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = AgentTransactionAudit.objects.select_related(
            "merchant",
            "order",
            "order__product",
        )
        merchant_id = self.request.query_params.get("merchant")
        if merchant_id:
            queryset = queryset.filter(merchant_id=merchant_id)
        return queryset


class CreateOrderView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = CreateOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            client = get_razorpay_client()
        except PaymentConfigurationError:
            return Response(
                {"detail": "Payment service is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        with transaction.atomic():
            try:
                product = Product.objects.select_for_update().select_related("merchant").get(
                    pk=data["product_id"],
                    is_active=True,
                )
            except Product.DoesNotExist:
                return Response(
                    {"detail": "Product is unavailable."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if product.stock_quantity < data["quantity"]:
                return Response(
                    {"detail": "Requested quantity exceeds available stock."},
                    status=status.HTTP_409_CONFLICT,
                )
            order = Order.objects.create(
                product=product,
                buyer_email=data["buyer_email"],
                quantity=data["quantity"],
                total_amount=product.price * data["quantity"],
            )

        try:
            gateway_order = create_razorpay_order(client, order)
            gateway_order_id = gateway_order["id"]
            expected_amount = amount_to_subunits(order.total_amount)
            if (
                not isinstance(gateway_order_id, str)
                or gateway_order.get("amount") != expected_amount
                or gateway_order.get("currency") != "INR"
            ):
                raise ValueError("Razorpay returned an inconsistent order payload")
        except ORDER_CREATION_ERRORS as exc:
            logger.warning("Razorpay order creation failed for local order %s: %s", order.order_id, exc)
            Order.objects.filter(pk=order.pk, status=Order.Status.PENDING).update(status=Order.Status.FAILED)
            return Response(
                {"detail": "Unable to initialize payment."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        with transaction.atomic():
            order.razorpay_order_id = gateway_order_id
            order.save(update_fields=["razorpay_order_id", "updated_at"])
            AgentTransactionAudit.objects.get_or_create(
                order=order,
                conversion_status=AgentTransactionAudit.ConversionStatus.RECOMMENDED,
                defaults={
                    "merchant": product.merchant,
                    "agent_thought_summary": "Buyer explicitly approved this recommendation and initiated checkout.",
                },
            )
        return Response(
            {
                "order_id": str(order.order_id),
                "razorpay_order_id": gateway_order_id,
                "amount": expected_amount,
                "currency": "INR",
                "key": settings.RAZORPAY_KEY_ID,
            },
            status=status.HTTP_201_CREATED,
        )
