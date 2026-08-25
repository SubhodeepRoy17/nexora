from rest_framework import viewsets

from apps.accounts.permissions import IsMerchantUser

from .models import Merchant, Product, ProductRelationship
from .serializers import MerchantSerializer, ProductRelationshipSerializer, ProductSerializer


class MerchantViewSet(viewsets.ModelViewSet):
    serializer_class = MerchantSerializer
    permission_classes = [IsMerchantUser]
    http_method_names = ["get", "put", "patch", "head", "options"]

    def get_queryset(self):
        return Merchant.objects.prefetch_related("products").filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsMerchantUser]

    def get_queryset(self):
        queryset = Product.objects.select_related("merchant").filter(merchant__owner=self.request.user)
        category = self.request.query_params.get("category")
        is_active = self.request.query_params.get("is_active")

        if category:
            queryset = queryset.filter(category__iexact=category)
        if is_active is not None:
            normalized = is_active.lower()
            if normalized in {"true", "1"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"false", "0"}:
                queryset = queryset.filter(is_active=False)
        return queryset

    def perform_create(self, serializer):
        serializer.save(merchant=self.request.user.merchant_profile)


class ProductRelationshipViewSet(viewsets.ModelViewSet):
    serializer_class = ProductRelationshipSerializer
    permission_classes = [IsMerchantUser]

    def get_queryset(self):
        return ProductRelationship.objects.select_related(
            "source_product", "related_product"
        ).filter(source_product__merchant__owner=self.request.user)
