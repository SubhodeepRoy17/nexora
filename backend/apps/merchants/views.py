from rest_framework import permissions, viewsets

from .models import Merchant, Product
from .serializers import MerchantSerializer, ProductSerializer


class MerchantViewSet(viewsets.ModelViewSet):
    queryset = Merchant.objects.prefetch_related("products").all()
    serializer_class = MerchantSerializer
    permission_classes = [permissions.AllowAny]


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Product.objects.select_related("merchant").all()
        merchant_id = self.request.query_params.get("merchant")
        category = self.request.query_params.get("category")
        is_active = self.request.query_params.get("is_active")

        if merchant_id:
            queryset = queryset.filter(merchant_id=merchant_id)
        if category:
            queryset = queryset.filter(category__iexact=category)
        if is_active is not None:
            normalized = is_active.lower()
            if normalized in {"true", "1"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"false", "0"}:
                queryset = queryset.filter(is_active=False)
        return queryset
